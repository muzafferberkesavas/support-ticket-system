import { api } from './api';
import type { Role } from '@/types';

export type ThemeKind = 'hardware' | 'recurring' | 'failure' | 'general';

export interface RecurringTheme {
  term: string;
  count: number;
  distinctRequesters: number;
  sampleSubjects: string[];
  kind: ThemeKind;
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
}

export const analyticsService = {
  async get(): Promise<Analytics> {
    const { data } = await api.get<Analytics>('/analytics');
    return data;
  },
};
