import { prisma } from '../prisma';
import { SLA_TARGETS } from './sla';
import { audit } from './audit';
import { emitTicketUpdated } from '../realtime/socket';
import { notifyAdmins, notifyDepartment } from './notifications';

const CHECK_INTERVAL_MS = 60_000; // every minute (demo-friendly)
const MIN = 60_000;

// Auto-escalate open/in_progress tickets that have breached their resolution SLA.
async function runSlaCheck(): Promise<void> {
  const now = Date.now();
  const tickets = await prisma.ticket.findMany({
    where: { status: { in: ['open', 'in_progress'] }, escalated: false },
    select: { id: true, subject: true, priority: true, createdAt: true, departmentId: true, userId: true },
  });

  for (const t of tickets) {
    const target = SLA_TARGETS[t.priority] ?? SLA_TARGETS.medium;
    const resolutionDue = t.createdAt.getTime() + target.resolution * MIN;
    if (now <= resolutionDue) continue;

    await prisma.ticket.update({
      where: { id: t.id },
      data: { escalated: true, escalatedAt: new Date(), ...(t.priority !== 'high' ? { priority: 'high' } : {}) },
    });
    audit('ticket.escalated', { ticketId: t.id, actorName: 'system', detail: { reason: 'sla_breach' } });
    emitTicketUpdated({ id: t.id, userId: t.userId, departmentId: t.departmentId }, []);

    const notif = { type: 'status' as const, ticketId: t.id, ticketSubject: t.subject, actor: 'Sistem' };
    if (t.departmentId) notifyDepartment(t.departmentId, notif);
    notifyAdmins(notif);
  }
}

export function startSlaScheduler(): void {
  // Slight delay so it doesn't race startup/migrations.
  setTimeout(() => {
    void runSlaCheck().catch((err) => console.error('SLA check failed:', err));
    setInterval(() => void runSlaCheck().catch((err) => console.error('SLA check failed:', err)), CHECK_INTERVAL_MS);
  }, 15_000);
  console.log('⏱️  SLA auto-escalation scheduler started');
}
