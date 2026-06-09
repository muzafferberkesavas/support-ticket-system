import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { SLA_TARGETS } from './sla';

const MIN = 60_000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export interface Estimate {
  estFirstResponseMinutes: number;
  estResolutionMinutes: number;
  slaResponseMinutes: number;
  slaResolutionMinutes: number;
  queueAhead: number;
  basedOnHistory: boolean;
}

// Estimates response/resolution time for a new ticket from historical averages
// (same priority, optionally same department), falling back to SLA targets.
export async function estimateForTicket(
  priority: string,
  departmentId?: string | null,
): Promise<Estimate> {
  const sla = SLA_TARGETS[priority] ?? SLA_TARGETS.medium;
  const base: Prisma.TicketWhereInput = {
    priority: priority as 'low' | 'medium' | 'high',
    ...(departmentId ? { departmentId } : {}),
  };

  const [responded, resolved, queueAhead] = await Promise.all([
    prisma.ticket.findMany({
      where: { ...base, firstResponseAt: { not: null } },
      select: { createdAt: true, firstResponseAt: true },
      take: 500,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.ticket.findMany({
      where: { ...base, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
      take: 500,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.ticket.count({
      where: { status: { in: ['open', 'in_progress'] }, ...(departmentId ? { departmentId } : {}) },
    }),
  ]);

  const frHist = avg(responded.map((t) => (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / MIN));
  const resHist = avg(resolved.map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / MIN));

  return {
    estFirstResponseMinutes: Math.round(frHist ?? sla.response),
    estResolutionMinutes: Math.round(resHist ?? sla.resolution),
    slaResponseMinutes: sla.response,
    slaResolutionMinutes: sla.resolution,
    queueAhead,
    basedOnHistory: frHist != null || resHist != null,
  };
}
