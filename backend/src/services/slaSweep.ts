import { prisma } from '../prisma';
import { getSlaTargets } from './sla';
import { audit } from './audit';
import { emitToRoom, rooms } from '../realtime/emitter';
import { env } from '../env';

const MIN = 60_000;

interface NotifInput {
  type: 'status';
  ticketId: string;
  ticketSubject: string;
  actor: string;
}

// Persist a notification per recipient + push it live via the Redis emitter
// (the worker has no Socket.IO server of its own).
async function notifyAndPersist(userIds: string[], input: NotifInput): Promise<void> {
  for (const userId of [...new Set(userIds)].filter(Boolean)) {
    const n = await prisma.notification.create({
      data: {
        userId,
        type: input.type,
        ticketId: input.ticketId,
        ticketSubject: input.ticketSubject,
        actor: input.actor,
      },
    });
    emitToRoom(rooms.user(userId), 'notification', {
      id: n.id,
      type: n.type,
      ticketId: n.ticketId,
      ticketSubject: n.ticketSubject,
      actor: n.actor,
      read: n.read,
      createdAt: n.createdAt,
    });
  }
}

async function recipientsFor(departmentId: string | null): Promise<string[]> {
  const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
  let ids = admins.map((a) => a.id);
  if (departmentId) {
    const members = await prisma.departmentMember.findMany({ where: { departmentId }, select: { userId: true } });
    ids = ids.concat(members.map((m) => m.userId));
  }
  return ids;
}

function broadcastTicketUpdated(t: { id: string; departmentId: string | null }): void {
  emitToRoom(rooms.ticket(t.id), 'ticket:updated', { id: t.id });
  emitToRoom(rooms.admin, 'ticket:updated', { id: t.id });
  if (t.departmentId) emitToRoom(rooms.dept(t.departmentId), 'ticket:updated', { id: t.id });
}

// One sweep: auto-escalate SLA-breached tickets + remind on stale tickets.
// Runs in the worker as a Bull repeatable (cron) job.
export async function runSlaSweep(): Promise<{ escalated: number; reminded: number }> {
  const now = Date.now();
  const slaTargets = getSlaTargets();
  let escalated = 0;
  let reminded = 0;

  // 1) Auto-escalation (dedup via the `escalated` flag).
  const open = await prisma.ticket.findMany({
    where: { status: { in: ['open', 'in_progress'] }, escalated: false },
    select: { id: true, subject: true, priority: true, createdAt: true, departmentId: true },
  });
  for (const t of open) {
    const target = slaTargets[t.priority] ?? slaTargets.medium;
    if (now <= t.createdAt.getTime() + target.resolution * MIN) continue;
    await prisma.ticket.update({
      where: { id: t.id },
      data: { escalated: true, escalatedAt: new Date(), ...(t.priority !== 'high' ? { priority: 'high' } : {}) },
    });
    audit('ticket.escalated', { ticketId: t.id, actorName: 'system', detail: { reason: 'sla_breach', via: 'worker' } });
    broadcastTicketUpdated(t);
    await notifyAndPersist(await recipientsFor(t.departmentId), {
      type: 'status',
      ticketId: t.id,
      ticketSubject: t.subject,
      actor: 'Sistem (SLA)',
    });
    escalated += 1;
  }

  // 2) Stale-ticket reminders (old + still open; deduped to once/day via reminderSentAt).
  const staleBefore = new Date(now - env.STALE_TICKET_DAYS * 24 * 60 * MIN);
  const remindAgainBefore = new Date(now - 24 * 60 * MIN);
  const stale = await prisma.ticket.findMany({
    where: {
      status: { in: ['open', 'in_progress'] },
      createdAt: { lt: staleBefore },
      OR: [{ reminderSentAt: null }, { reminderSentAt: { lt: remindAgainBefore } }],
    },
    select: { id: true, subject: true, departmentId: true },
    take: 100,
  });
  for (const t of stale) {
    await prisma.ticket.update({ where: { id: t.id }, data: { reminderSentAt: new Date() } });
    await notifyAndPersist(await recipientsFor(t.departmentId), {
      type: 'status',
      ticketId: t.id,
      ticketSubject: t.subject,
      actor: 'Sistem (hatırlatma)',
    });
    reminded += 1;
  }

  return { escalated, reminded };
}
