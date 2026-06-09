import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { getUserDepartmentIds, type Principal } from '../services/access';
import { analyzeThemes } from '../services/textAnalysis';
import { getSlaTargets } from '../services/sla';

const DAY_MS = 24 * 60 * 60 * 1000;
const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const pct = (met: number, total: number) => (total ? Math.round((met / total) * 100) : null);

// GET /analytics — manager/admin dashboard. team_lead is scoped to their departments.
export async function getAnalytics(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;

  // Scope
  let where: Prisma.TicketWhereInput = {};
  let scopeDeptIds: string[] | null = null;
  if (user.role !== 'admin') {
    scopeDeptIds = await getUserDepartmentIds(user.id);
    where = scopeDeptIds.length ? { departmentId: { in: scopeDeptIds } } : { id: '__none__' };
  }

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    select: {
      id: true,
      subject: true,
      message: true,
      category: true,
      status: true,
      priority: true,
      departmentId: true,
      userId: true,
      createdAt: true,
      firstResponseAt: true,
      resolvedAt: true,
      escalated: true,
      csatRating: true,
      assignees: { select: { userId: true } },
    },
  });

  // ── Summary ────────────────────────────────────────────────────────
  const byStatus = { open: 0, in_progress: 0, closed: 0 } as Record<string, number>;
  const byPriority = { low: 0, medium: 0, high: 0 } as Record<string, number>;
  const byDeptCount = new Map<string, number>();
  const frTimes: number[] = [];
  const resTimes: number[] = [];
  const csatRatings: number[] = [];
  let unassigned = 0;
  let escalatedCount = 0;
  let respMet = 0;
  let respTotal = 0;
  let resMet = 0;
  let resTotal = 0;

  for (const t of tickets) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
    const dk = t.departmentId ?? 'none';
    byDeptCount.set(dk, (byDeptCount.get(dk) ?? 0) + 1);
    if (!t.assignees.length) unassigned += 1;
    if (t.escalated) escalatedCount += 1;
    if (t.csatRating != null) csatRatings.push(t.csatRating);

    const slaTargets = getSlaTargets();
    const target = slaTargets[t.priority] ?? slaTargets.medium;
    if (t.firstResponseAt) {
      const m = minutesBetween(t.createdAt, t.firstResponseAt);
      frTimes.push(m);
      respTotal += 1;
      if (m <= target.response) respMet += 1;
    }
    if (t.resolvedAt) {
      const m = minutesBetween(t.createdAt, t.resolvedAt);
      resTimes.push(m);
      resTotal += 1;
      if (m <= target.resolution) resMet += 1;
    }
  }

  // ── Tickets over time (last 30 days) ───────────────────────────────
  const today = new Date();
  const start = new Date(today.getTime() - 29 * DAY_MS);
  start.setHours(0, 0, 0, 0);
  const buckets = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const t of tickets) {
    const key = t.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const ticketsOverTime = [...buckets.entries()].map(([date, count]) => ({ date, count }));

  // ── Department names ───────────────────────────────────────────────
  const departments = await prisma.department.findMany({ select: { id: true, name: true } });
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const byDepartment = [...byDeptCount.entries()].map(([id, count]) => ({
    departmentId: id === 'none' ? null : id,
    name: id === 'none' ? null : (deptName.get(id) ?? id),
    count,
  }));

  // ── Agent performance ──────────────────────────────────────────────
  const staffWhere: Prisma.UserWhereInput = {
    role: { in: ['agent', 'team_lead', 'admin'] },
    ...(scopeDeptIds ? { memberships: { some: { departmentId: { in: scopeDeptIds } } } } : {}),
  };
  const staff = await prisma.user.findMany({
    where: staffWhere,
    select: { id: true, email: true, fullName: true, role: true },
  });
  const staffMap = new Map(staff.map((s) => [s.id, s]));

  const perAgent = new Map<string, { assigned: number; resolved: number; fr: number[] }>();
  for (const t of tickets) {
    for (const a of t.assignees) {
      if (!staffMap.has(a.userId)) continue;
      let rec = perAgent.get(a.userId);
      if (!rec) perAgent.set(a.userId, (rec = { assigned: 0, resolved: 0, fr: [] }));
      rec.assigned += 1;
      if (t.status === 'closed') rec.resolved += 1;
      if (t.firstResponseAt) rec.fr.push(minutesBetween(t.createdAt, t.firstResponseAt));
    }
  }
  const agentPerformance = [...perAgent.entries()]
    .map(([userId, r]) => {
      const u = staffMap.get(userId)!;
      return {
        userId,
        name: u.fullName || u.email,
        role: u.role,
        assigned: r.assigned,
        resolved: r.resolved,
        avgFirstResponseMinutes: avg(r.fr),
      };
    })
    .sort((a, b) => b.resolved - a.resolved || b.assigned - a.assigned);

  // ── Recurring problems (text analysis) ─────────────────────────────
  const recurringProblems = analyzeThemes(
    tickets.map((t) => ({ subject: t.subject, message: t.message, category: t.category, userId: t.userId })),
    6,
  );

  res.json({
    scope: user.role === 'admin' ? 'all' : 'departments',
    summary: {
      total: tickets.length,
      open: byStatus.open ?? 0,
      inProgress: byStatus.in_progress ?? 0,
      closed: byStatus.closed ?? 0,
      unassigned,
      escalated: escalatedCount,
      avgFirstResponseMinutes: avg(frTimes),
      avgResolutionMinutes: avg(resTimes),
      slaResponseCompliance: pct(respMet, respTotal),
      slaResolutionCompliance: pct(resMet, resTotal),
      csatAverage: avg(csatRatings),
      csatCount: csatRatings.length,
    },
    byStatus,
    byPriority,
    byDepartment,
    ticketsOverTime,
    agentPerformance,
    recurringProblems,
  });
}
