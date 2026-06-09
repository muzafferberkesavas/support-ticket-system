import { api } from './api';

export const jobsService = {
  async runDigest(): Promise<{ enqueued: boolean; jobId: string }> {
    const { data } = await api.post<{ enqueued: boolean; jobId: string }>('/jobs/digest');
    return data;
  },

  async exportTickets(filters: Record<string, string | undefined>): Promise<{ enqueued: boolean; jobId: string }> {
    const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const { data } = await api.post<{ enqueued: boolean; jobId: string }>('/jobs/export', clean);
    return data;
  },
};
