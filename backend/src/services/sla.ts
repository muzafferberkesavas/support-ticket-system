// SLA targets in minutes per priority (first response / resolution).
export const SLA_TARGETS: Record<string, { response: number; resolution: number }> = {
  high: { response: 60, resolution: 240 }, // 1h / 4h
  medium: { response: 240, resolution: 1440 }, // 4h / 24h
  low: { response: 480, resolution: 4320 }, // 8h / 72h
};

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
  resolutionRemainingMinutes: number | null; // null when closed
}

interface SlaTicket {
  priority: string;
  status: string;
  createdAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
}

// Computes SLA / aging status for a ticket (not stored — derived on read).
export function computeSla(t: SlaTicket, now = new Date()): SlaInfo {
  const target = SLA_TARGETS[t.priority] ?? SLA_TARGETS.medium;
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

// Attaches an `sla` block to a ticket object for API responses.
export function withSla<T extends SlaTicket>(ticket: T): T & { sla: SlaInfo } {
  return { ...ticket, sla: computeSla(ticket) };
}
