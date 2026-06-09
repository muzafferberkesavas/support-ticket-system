import { prisma } from '../prisma';

// Picks the least-loaded staff member of a department (fewest active assigned
// tickets). Returns null if the department has no members or auto-assign is off.
export async function pickLeastLoadedAgent(departmentId: string): Promise<string | null> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { autoAssignEnabled: true, members: { select: { userId: true } } },
  });
  if (!dept || !dept.autoAssignEnabled || !dept.members.length) return null;

  const memberIds = dept.members.map((m) => m.userId);

  // Active (open / in_progress) assignment counts per member.
  const loads = await prisma.ticketAssignee.groupBy({
    by: ['userId'],
    where: { userId: { in: memberIds }, ticket: { status: { in: ['open', 'in_progress'] } } },
    _count: { userId: true },
  });
  const loadMap = new Map(loads.map((l) => [l.userId, l._count.userId]));

  let best: string | null = null;
  let bestLoad = Infinity;
  for (const id of memberIds) {
    const load = loadMap.get(id) ?? 0;
    if (load < bestLoad) {
      bestLoad = load;
      best = id;
    }
  }
  return best;
}
