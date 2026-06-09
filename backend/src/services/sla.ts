import { prisma } from '../prisma';

export interface SlaTarget {
  response: number;
  resolution: number;
}

// Built-in defaults (minutes). Overridable from the database (admin-editable).
export const DEFAULT_SLA_TARGETS: Record<string, SlaTarget> = {
  high: { response: 60, resolution: 240 }, // 1h / 4h
  medium: { response: 240, resolution: 1440 }, // 4h / 24h
  low: { response: 480, resolution: 4320 }, // 8h / 72h
};

// In-memory active config (sync access for computeSla); refreshed from DB.
let activeTargets: Record<string, SlaTarget> = { ...DEFAULT_SLA_TARGETS };

export function getSlaTargets(): Record<string, SlaTarget> {
  return activeTargets;
}

export function setSlaTargets(targets: Record<string, SlaTarget>): void {
  activeTargets = targets;
}

// Loads SLA policies from the database into the in-memory cache.
export async function refreshSlaTargets(): Promise<void> {
  try {
    const rows = await prisma.slaPolicy.findMany();
    if (rows.length) {
      const map: Record<string, SlaTarget> = { ...DEFAULT_SLA_TARGETS };
      for (const r of rows) map[r.priority] = { response: r.responseMinutes, resolution: r.resolutionMinutes };
      activeTargets = map;
    }
  } catch (err) {
    console.warn('Could not load SLA policies, using defaults:', err);
  }
}

const MIN = 60_000;

export interface SlaInfo {
  responseTargetMinutes: number;
  resolutionTargetMinutes: number;
  responseDueAt: string;
  resolutionDueAt: string;
  responseOverdue: boolean;
  resolutionOverdue: boolean;
  breached: boolean;
  ageMinutes: number;
  resolutionRemainingMinutes: number | null;
}

interface SlaTicket {
  priority: string;
  status: string;
  createdAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
}

// Computes SLA / aging status for a ticket (derived on read, not stored).
export function computeSla(t: SlaTicket, now = new Date()): SlaInfo {
  const targets = getSlaTargets();
  const target = targets[t.priority] ?? targets.medium ?? DEFAULT_SLA_TARGETS.medium;
  const created = t.createdAt.getTime();
  const responseDue = created + target.response * MIN;
  const resolutionDue = created + target.resolution * MIN;
  const isClosed = t.status === 'closed';

  const responseOverdue = !t.firstResponseAt && !isClosed && now.getTime() > responseDue;
  const resolutionOverdue = !t.resolvedAt && !isClosed && now.getTime() > resolutionDue;
  const endForAge = isClosed && t.resolvedAt ? t.resolvedAt.getTime() : now.getTime();

  return {
    responseTargetMinutes: target.response,
    resolutionTargetMinutes: target.resolution,
    responseDueAt: new Date(responseDue).toISOString(),
    resolutionDueAt: new Date(resolutionDue).toISOString(),
    responseOverdue,
    resolutionOverdue,
    breached: responseOverdue || resolutionOverdue,
    ageMinutes: Math.round((endForAge - created) / MIN),
    resolutionRemainingMinutes: isClosed ? null : Math.round((resolutionDue - now.getTime()) / MIN),
  };
}

export function withSla<T extends SlaTicket>(ticket: T): T & { sla: SlaInfo } {
  return { ...ticket, sla: computeSla(ticket) };
}
