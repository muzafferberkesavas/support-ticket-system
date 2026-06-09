import { mailQueue, scheduleDailyDigest, JOB_REPLY_EMAIL, JOB_DAILY_DIGEST, type ReplyEmailJob } from './queue';
import { prisma } from './prisma';
import { sendReplyEmail, sendDigestEmail, isDeliverable, type DigestStats } from './services/mailer';
import { computeSla, refreshSlaTargets } from './services/sla';

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

  const digests: Digest[] = [];
  for (const u of staff) {
    const myDepts = new Set(u.memberships.map((m) => m.departmentId));
    const mine = openTickets.filter((t) => t.assignees.some((a) => a.userId === u.id));
    const overdue = mine.filter((t) => computeSla(t).breached).length;
    const unassigned = openTickets.filter(
      (t) => !t.assignees.length && (u.role === 'admin' || (t.departmentId != null && myDepts.has(t.departmentId))),
    ).length;
    // Only email staff who actually have something to act on — and whose
    // address is real (skip demo/non-deliverable accounts to avoid bounces).
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
  for (const d of digests) {
    await sendDigestEmail(d.to, d.name, d.stats);
  }
  console.log(`📨 Daily digest sent to ${digests.length} recipient(s)`);
  return { sent: digests.length };
});

mailQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.name}#${job.id} failed:`, err.message);
});

async function main() {
  await refreshSlaTargets();
  await scheduleDailyDigest();
  console.log('🛠️  Worker ready — queue "mail" | jobs: reply-email, daily-digest (cron)');
}

main().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
