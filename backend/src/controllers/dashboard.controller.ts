import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { buildTicketScope, type Principal } from '../services/access';
import { withSla } from '../services/sla';

const userSelect = { select: { id: true, email: true, role: true, fullName: true } };
const ticketInclude = {
  user: userSelect,
  department: { select: { id: true, name: true } },
  assignees: { include: { user: userSelect } },
  _count: { select: { replies: true, attachments: true } },
};

// GET /dashboard — staff için kendi kapsamı içindeki "güne başlangıç" özeti.
export async function getDashboard(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const scopeWhere = await buildTicketScope(user);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [openTickets, resolvedToday] = await Promise.all([
    prisma.ticket.findMany({
      where: { AND: [scopeWhere, { status: { in: ['open', 'in_progress'] } }] },
      orderBy: { createdAt: 'desc' },
      include: ticketInclude,
      take: 500,
    }),
    prisma.ticket.count({
      where: { AND: [scopeWhere, { status: 'closed', resolvedAt: { gte: startOfToday } }] },
    }),
  ]);

  const list = openTickets.map((t) => withSla(t));
  const myOpen = list.filter((t) => t.assignees.some((a) => a.userId === user.id));
  const unassigned = list.filter((t) => !t.assignees.length);
  const slaRisk = list.filter(
    (t) =>
      t.sla.breached ||
      (t.sla.resolutionRemainingMinutes != null &&
        t.sla.resolutionRemainingMinutes > 0 &&
        t.sla.resolutionRemainingMinutes < 0.2 * t.sla.resolutionTargetMinutes),
  );

  res.json({
    counts: {
      myOpen: myOpen.length,
      unassigned: unassigned.length,
      slaRisk: slaRisk.length,
      resolvedToday,
    },
    myOpen: myOpen.slice(0, 8),
    slaRisk: slaRisk.slice(0, 8),
    unassigned: unassigned.slice(0, 8),
  });
}
