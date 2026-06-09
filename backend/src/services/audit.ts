import { prisma } from '../prisma';

export type AuditAction =
  | 'ticket.created'
  | 'ticket.status'
  | 'ticket.priority'
  | 'ticket.department'
  | 'ticket.assigned'
  | 'ticket.reply'
  | 'ticket.note'
  | 'ticket.escalated'
  | 'ticket.attachment'
  | 'ticket.csat'
  | 'ticket.reopened'
  | 'ticket.deleted';

interface AuditInput {
  ticketId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  detail?: Record<string, unknown>;
}

// Fire-and-forget audit recording (never blocks/breaks the request flow).
export function audit(action: AuditAction, input: AuditInput): void {
  void prisma.auditLog
    .create({
      data: {
        action,
        ticketId: input.ticketId ?? null,
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        detail: (input.detail ?? undefined) as object | undefined,
      },
    })
    .catch((err) => console.error('audit failed:', err));
}

export async function getTicketActivity(ticketId: string) {
  return prisma.auditLog.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
  });
}
