import express, { Request, Response, NextFunction } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import {
  mailQueue,
  bulkMailQueue,
  scheduleRepeatables,
  JOB_REPLY_EMAIL,
  JOB_DAILY_DIGEST,
  JOB_SLA_SWEEP,
  JOB_CSAT_REQUEST,
  JOB_EXPORT,
  JOB_BULK_IMPORT,
  JOB_WELCOME_EMAIL,
  JOB_WEEKLY_INSIGHTS,
  type ReplyEmailJob,
  type ExportJob,
  type BulkImportJob,
  type WelcomeEmailJob,
} from './queue';
import { prisma } from './prisma';
import { redis } from './redis';
import {
  sendReplyEmail,
  sendDigestEmail,
  sendCsatEmail,
  sendExportEmail,
  sendWelcomeEmail,
  sendInsightsEmail,
  isDeliverable,
  type DigestStats,
} from './services/mailer';
import { analyzeRecurring } from './services/ticketAnalysis';
import { runImport } from './services/import';
import { emitToRoom, rooms } from './realtime/emitter';
import type { PreviewRow } from './services/import/types';
import { runSlaSweep } from './services/slaSweep';
import { refreshSlaTargets } from './services/sla';
import { buildExportData, buildCsv, EXPORT_META } from './services/exportData';
import { generateFile, FILE_META, type FileFormat } from './services/fileService';
import { emitJobStats, emitJobEvent } from './realtime/jobStats';
import { env } from './env';

// ── Günlük özet: her personel için açık / gecikmiş / atanmamış işlerin özeti ──
interface Digest {
  to: string;
  name: string | null;
  stats: DigestStats;
}

async function computeDigests(): Promise<Digest[]> {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['agent', 'team_lead', 'admin'] } },
    select: { id: true, email: true, fullName: true, role: true, memberships: { select: { departmentId: true } } },
  });
  const openTickets = await prisma.ticket.findMany({
    where: { status: { in: ['open', 'in_progress'] } },
    select: {
      id: true,
      priority: true,
      status: true,
      createdAt: true,
      firstResponseAt: true,
      resolvedAt: true,
      departmentId: true,
      assignees: { select: { userId: true } },
    },
  });

  const { computeSla } = await import('./services/sla');
  const digests: Digest[] = [];
  for (const u of staff) {
    const myDepts = new Set(u.memberships.map((m) => m.departmentId));
    const mine = openTickets.filter((t) => t.assignees.some((a) => a.userId === u.id));
    const overdue = mine.filter((t) => computeSla(t).breached).length;
    const unassigned = openTickets.filter(
      (t) => !t.assignees.length && (u.role === 'admin' || (t.departmentId != null && myDepts.has(t.departmentId))),
    ).length;
    if (mine.length === 0 && unassigned === 0) continue;
    if (!isDeliverable(u.email)) continue;
    digests.push({ to: u.email, name: u.fullName, stats: { open: mine.length, overdue, unassigned } });
  }
  return digests;
}

// ── Job işleyicileri ─────────────────────────────────────────────────
mailQueue.process(JOB_REPLY_EMAIL, async (job) => {
  const d = job.data as ReplyEmailJob;
  await sendReplyEmail(d.to, d.ticketId, d.ticketSubject, d.replyMessage, d.authorName);
  return { sent: d.to };
});

mailQueue.process(JOB_DAILY_DIGEST, async () => {
  await refreshSlaTargets();
  const digests = await computeDigests();
  for (const d of digests) await sendDigestEmail(d.to, d.name, d.stats);
  console.log(`📨 Daily digest sent to ${digests.length} recipient(s)`);
  return { sent: digests.length };
});

// Haftalık içgörü: son talepleri Claude (Haiku) ile analiz edip tekrar eden
// problemleri + önerileri yöneticilere (admin/team_lead) e-posta ile gönderir.
mailQueue.process(JOB_WEEKLY_INSIGHTS, async () => {
  const tickets = await prisma.ticket.findMany({
    orderBy: { createdAt: 'desc' },
    take: 400,
    select: { subject: true, message: true, category: true, userId: true },
  });
  const { themes, provider } = await analyzeRecurring(
    tickets.map((t) => ({ subject: t.subject, message: t.message, category: t.category, userId: t.userId })),
    8,
    { scopeKey: 'weekly-insights', force: true },
  );
  const managers = await prisma.user.findMany({
    where: { role: { in: ['admin', 'team_lead'] } },
    select: { email: true, fullName: true },
  });
  let sent = 0;
  for (const m of managers) {
    if (!isDeliverable(m.email)) continue;
    await sendInsightsEmail(m.email, m.fullName, themes, provider);
    sent += 1;
  }
  console.log(`📊 Weekly insights sent to ${sent} manager(s) [provider=${provider}, themes=${themes.length}]`);
  return { sent, themes: themes.length, provider };
});

mailQueue.process(JOB_SLA_SWEEP, async () => {
  const r = await runSlaSweep();
  if (r.escalated || r.reminded) console.log(`⏱️  SLA sweep: ${r.escalated} escalated, ${r.reminded} reminded`);
  return r;
});

mailQueue.process(JOB_CSAT_REQUEST, async (job) => {
  const { ticketId } = job.data as { ticketId: string };
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, subject: true, status: true, csatRating: true, user: { select: { email: true } } },
  });
  // Yalnızca hâlâ kapalıysa ve henüz puanlanmamışsa sor (yeniden açıldıysa/puanlandıysa atla).
  if (!t || t.status !== 'closed' || t.csatRating != null) return { skipped: true };
  await sendCsatEmail(t.user.email, t.id, t.subject);
  return { sent: t.user.email };
});

mailQueue.process(JOB_EXPORT, async (job) => {
  const d = job.data as ExportJob;
  const entity = d.entity || 'tickets';
  const { columns, rows, count } = await buildExportData(
    entity,
    { id: d.requesterId, email: d.email, role: d.requesterRole },
    d.filters,
  );
  const format = d.format || 'csv';
  const meta = EXPORT_META[entity];

  if (format === 'csv') {
    // CSV worker içinde yerel üretilir (mikroservise gerek yok).
    const csv = buildCsv(columns, rows);
    await sendExportEmail(d.email, d.requestedByName, csv, `${meta.baseName}.csv`, count);
  } else {
    // Excel/PDF file-service mikroservisinden alınır (backend → servis → dosya).
    const fmt = format as FileFormat;
    const { ext, contentType } = FILE_META[fmt];
    const filename = `${meta.baseName}.${ext}`;
    const file = await generateFile(fmt, {
      title: meta.title,
      filename,
      sheetName: meta.sheet,
      columns,
      rows,
    });
    await sendExportEmail(d.email, d.requestedByName, file, filename, count, contentType);
  }
  return { count, format, entity };
});

// ── Toplu import: önizleme veri setini işle (worker üzerinde) ─────────
mailQueue.process(JOB_BULK_IMPORT, async (job) => {
  const d = job.data as BulkImportJob;
  const raw = await redis.get(`import:${d.importId}`);
  if (!raw) throw new Error('Import önizlemesi bulunamadı (süresi dolmuş olabilir).');
  const { rows } = JSON.parse(raw) as { rows: PreviewRow[] };
  const total = rows.length;

  emitToRoom(rooms.admin, 'import:progress', {
    importId: d.importId,
    entity: d.entity,
    processed: 0,
    total,
    percent: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  });

  const result = await runImport(d.entity, rows, d.strategy, (processed, tot, partial) => {
    const percent = tot ? Math.round((processed / tot) * 100) : 100;
    void job.progress(percent);
    emitToRoom(rooms.admin, 'import:progress', {
      importId: d.importId,
      entity: d.entity,
      processed,
      total: tot,
      percent,
      created: partial.created,
      updated: partial.updated,
      skipped: partial.skipped,
      failed: partial.failed,
    });
  });

  emitToRoom(rooms.admin, 'import:done', { importId: d.importId, entity: d.entity, ...result });
  await redis.del(`import:${d.importId}`);
  console.log(
    `📥 Import (${d.entity}): ${result.created} oluşturuldu, ${result.updated} güncellendi, ${result.skipped} atlandı, ${result.failed} hata`,
  );
  return { imported: result.created, updated: result.updated, skipped: result.skipped, failed: result.failed };
});

// Toplu hoşgeldin mailleri (ayrı kuyruk; interaktif mailleri boğmaz).
bulkMailQueue.process(JOB_WELCOME_EMAIL, async (job) => {
  const d = job.data as WelcomeEmailJob;
  await sendWelcomeEmail(d.to, d.fullName, d.tempPassword);
  return { sent: d.to };
});

// ── Operasyon dashboard'una canlı job telemetrisi ────────────────────
// Sayaçlar her olayda MUTLAK snapshot olarak (throttle'lı) admin odasına gider.
mailQueue.on('active', () => emitJobStats());
mailQueue.on('completed', (job) => {
  emitJobStats();
  emitJobEvent(job, 'completed');
});
mailQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.name}#${job.id} failed:`, err.message);
  emitJobStats();
  if (job) emitJobEvent(job, 'failed');
});

// ── Bull Board (queue izleme panosu) ─────────────────────────────────
function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const [u, p] = Buffer.from(encoded, 'base64').toString().split(':');
    if (u === env.BULLBOARD_USER && p === env.BULLBOARD_PASS) {
      next();
      return;
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="Bull Board"').status(401).send('Authentication required');
}

function startBullBoard(): void {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullAdapter(mailQueue)], serverAdapter });

  const app = express();
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.use('/admin/queues', basicAuth, serverAdapter.getRouter());
  app.listen(env.BULLBOARD_PORT, () => {
    console.log(`📊 Bull Board on http://localhost:${env.BULLBOARD_PORT}/admin/queues`);
  });
}

async function main() {
  await refreshSlaTargets();
  await scheduleRepeatables();
  startBullBoard();
  console.log(
    '🛠️  Worker ready — jobs: reply-email, daily-digest (cron), sla-sweep (cron), csat-request (delayed), export-tickets',
  );
}

main().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
