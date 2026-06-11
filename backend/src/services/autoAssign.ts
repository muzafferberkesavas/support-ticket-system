import { prisma } from '../prisma';

// Bir departmanın en az yüklü personelini seçer (en az aktif atanmış talebi olan).
// Departmanın üyesi yoksa ya da otomatik atama kapalıysa null döner.
export async function pickLeastLoadedAgent(departmentId: string): Promise<string | null> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { autoAssignEnabled: true, members: { select: { userId: true } } },
  });
  if (!dept || !dept.autoAssignEnabled || !dept.members.length) return null;

  const memberIds = dept.members.map((m) => m.userId);

  // Üye başına aktif (open / in_progress) atama sayıları.
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
