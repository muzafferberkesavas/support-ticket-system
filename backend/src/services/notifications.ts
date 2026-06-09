import { prisma } from '../prisma';
import { emitToUser } from '../realtime/socket';

export interface NotificationInput {
  type: 'reply' | 'created' | 'assigned' | 'status';
  ticketId: string;
  ticketSubject: string;
  actor?: string;
}

// Persists a notification per recipient and pushes it live to their personal room.
// Fire-and-forget: failures are logged, never thrown into the request flow.
export function notifyUsers(
  userIds: string[],
  input: NotificationInput,
  excludeUserId?: string,
): void {
  const targets = [...new Set(userIds)].filter((id) => id && id !== excludeUserId);
  if (!targets.length) return;

  void (async () => {
    try {
      for (const userId of targets) {
        const n = await prisma.notification.create({
          data: {
            userId,
            type: input.type,
            ticketId: input.ticketId,
            ticketSubject: input.ticketSubject,
            actor: input.actor ?? null,
          },
        });
        emitToUser(userId, 'notification', {
          id: n.id,
          type: n.type,
          ticketId: n.ticketId,
          ticketSubject: n.ticketSubject,
          actor: n.actor,
          read: n.read,
          createdAt: n.createdAt,
        });
      }
    } catch (err) {
      console.error('notifyUsers failed:', err);
    }
  })();
}

export function notifyDepartment(
  departmentId: string,
  input: NotificationInput,
  excludeUserId?: string,
): void {
  void (async () => {
    try {
      const members = await prisma.departmentMember.findMany({
        where: { departmentId },
        select: { userId: true },
      });
      notifyUsers(
        members.map((m) => m.userId),
        input,
        excludeUserId,
      );
    } catch (err) {
      console.error('notifyDepartment failed:', err);
    }
  })();
}

export function notifyAdmins(input: NotificationInput, excludeUserId?: string): void {
  void (async () => {
    try {
      const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
      notifyUsers(
        admins.map((a) => a.id),
        input,
        excludeUserId,
      );
    } catch (err) {
      console.error('notifyAdmins failed:', err);
    }
  })();
}
