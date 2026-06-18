import { api } from './api';
import type { Role } from '@/types';

export type ThemeKind = 'hardware' | 'recurring' | 'failure' | 'general';

export interface RecurringTheme {
  term: string;
  count: number;
  distinctRequesters: number;
  sampleSubjects: string[];
  kind: ThemeKind;
  suggestion?: string; // LLM sağlayıcıda dolu; varsa şablon öneri yerine bu gösterilir
}

export interface RecurringMeta {
  provider: 'anthropic' | 'nlp';
  generatedAt: string;
  cached: boolean;
}

export interface AgentPerformance {
  userId: string;
  name: string;
  role: Role;
  assigned: number;
  resolved: number;
  avgFirstResponseMinutes: number | null;
}

export interface Analytics {
  scope: 'all' | 'departments';
  summary: {
    total: number;
    open: number;
    inProgress: number;
    closed: number;
    unassigned: number;
    escalated: number;
    avgFirstResponseMinutes: number | null;
    avgResolutionMinutes: number | null;
    slaResponseCompliance: number | null;
    slaResolutionCompliance: number | null;
    csatAverage: number | null;
    csatCount: number;
  };
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byDepartment: { departmentId: string | null; name: string | null; count: number }[];
  ticketsOverTime: { date: string; count: number }[];
  agentPerformance: AgentPerformance[];
  recurringProblems: RecurringTheme[];
  recurringMeta?: RecurringMeta;
}

export const analyticsService = {
  // refresh=true → tekrar eden problem analizini yeniden çalıştırır (günlük cache'i atlar).
  async get(opts?: { refresh?: boolean }): Promise<Analytics> {
    const { data } = await api.get<Analytics>('/analytics', {
      params: opts?.refresh ? { refresh: 1 } : {},
    });
    return data;
  },
};
