import { api } from './api';

export const jobsService = {
  async runDigest(): Promise<{ enqueued: boolean; jobId: string }> {
    const { data } = await api.post<{ enqueued: boolean; jobId: string }>('/jobs/digest');
    return data;
  },
};
