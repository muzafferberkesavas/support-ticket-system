import express, { Request, Response, NextFunction } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import {
  mailQueue,
  scheduleRepeatables,
  JOB_REPLY_EMAIL,
  JOB_DAILY_DIGEST,
  JOB_SLA_SWEEP,
  JOB_CSAT_REQUEST,
  JOB_EXPORT,
  type ReplyEmailJob,
  type ExportJob,
} from './queue';
import { prisma } from './prisma';
import {
  sendReplyEmail,
  sendDigestEmail,
  sendCsatEmail,
  sendExportEmail,
  isDeliverable,
  type DigestStats,
} from './services/mailer';
import { runSlaSweep } from './services/slaSweep';
import { refreshSlaTargets } from './services/sla';
import { buildExportData, buildCsv } from './services/exportData';
import { generateFile, FILE_META, type FileFormat } from './services/fileService';
import { env } from './env';

// ── Daily digest: per-staff summary of open / overdue / unassigned work ──
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

// ── Job processors ───────────────────────────────────────────────────
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
  // Only ask if still closed and not already rated (skip if reopened/rated).
  if (!t || t.status !== 'closed' || t.csatRating != null) return { skipped: true };
  await sendCsatEmail(t.user.email, t.id, t.subject);
  return { sent: t.user.email };
});

mailQueue.process(JOB_EXPORT, async (job) => {
  const d = job.data as ExportJob;
  const { columns, rows, count } = await buildExportData(
    { id: d.requesterId, email: d.email, role: d.requesterRole },
    d.filters,
  );
  const format = d.format || 'csv';

  if (format === 'csv') {
    // CSV worker içinde yerel üretilir (mikroservise gerek yok).
    const csv = buildCsv(columns, rows);
    await sendExportEmail(d.email, d.requestedByName, csv, 'talepler-export.csv', count);
  } else {
    // Excel/PDF file-service mikroservisinden alınır (backend → servis → dosya).
    const fmt = format as FileFormat;
    const { ext, contentType } = FILE_META[fmt];
    const filename = `talepler-export.${ext}`;
    const file = await generateFile(fmt, {
      title: 'Talep Dışa Aktarımı',
      filename,
      sheetName: 'Talepler',
      columns,
      rows,
    });
    await sendExportEmail(d.email, d.requestedByName, file, filename, count, contentType);
  }
  return { count, format };
});

mailQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.name}#${job.id} failed:`, err.message);
});

// ── Bull Board (queue monitoring dashboard) ──────────────────────────
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
