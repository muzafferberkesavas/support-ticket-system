import { api } from './api';

// Operasyon dashboard'unun veri tipleri (backend realtime/jobStats.ts ile aynı sözleşme).
export interface JobStats {
  active: number;
  completed: number;
  failed: number;
  waiting: number;
  delayed: number;
}

export interface RecentOp {
  id: string;
  name: string; // ham job adı; i18n ile etiketlenir
  status: 'completed' | 'failed';
  finishedAt: number | null;
  summary: string;
}

export const operationsService = {
  // İlk yük: anlık sayaçlar + son işlemler. Canlı güncellemeler socket ile gelir.
  async getStats(): Promise<{ stats: JobStats; recent: RecentOp[] }> {
    const { data } = await api.get<{ stats: JobStats; recent: RecentOp[] }>('/jobs/stats');
    return data;
  },
};
