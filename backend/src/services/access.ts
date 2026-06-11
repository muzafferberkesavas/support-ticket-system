import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export type Role = 'user' | 'agent' | 'team_lead' | 'admin';

export interface Principal {
  id: string;
  email: string;
  role: Role;
}

// Personel = talepleri ele alan herkes (son kullanıcı müşteri değil).
export function isStaff(role: Role): boolean {
  return role === 'agent' || role === 'team_lead' || role === 'admin';
}

export function isManager(role: Role): boolean {
  return role === 'team_lead' || role === 'admin';
}

// Kullanıcının ait olduğu departman id'leri (agent'lar / takım liderleri).
export async function getUserDepartmentIds(userId: string): Promise<string[]> {
  const rows = await prisma.departmentMember.findMany({
    where: { userId },
    select: { departmentId: true },
  });
  return rows.map((r) => r.departmentId);
}

// Talep listesini kullanıcının görebileceğiyle sınırlayan Prisma `where` ifadesini oluşturur.
export async function buildTicketScope(user: Principal): Promise<Prisma.TicketWhereInput> {
  if (user.role === 'admin') return {};

  if (isStaff(user.role)) {
    const deptIds = await getUserDepartmentIds(user.id);
    return {
      OR: [
        deptIds.length ? { departmentId: { in: deptIds } } : undefined,
        { assignees: { some: { userId: user.id } } },
        { userId: user.id },
      ].filter(Boolean) as Prisma.TicketWhereInput[],
    };
  }

  // Son kullanıcı: yalnızca kendi talepleri.
  return { userId: user.id };
}

// Kullanıcının belirli bir talebi görüntüleyip/üzerinde işlem yapıp yapamayacağı.
export async function canAccessTicket(
  user: Principal,
  ticket: { id: string; userId: string; departmentId: string | null },
): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (ticket.userId === user.id) return true;

  if (isStaff(user.role)) {
    if (ticket.departmentId) {
      const deptIds = await getUserDepartmentIds(user.id);
      if (deptIds.includes(ticket.departmentId)) return true;
    }
    const assigned = await prisma.ticketAssignee.findUnique({
      where: { ticketId_userId: { ticketId: ticket.id, userId: user.id } },
    });
    if (assigned) return true;
  }
  return false;
}
