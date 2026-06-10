import { api } from './api';

export type ExportFormat = 'csv' | 'excel' | 'pdf';

export const jobsService = {
  async runDigest(): Promise<{ enqueued: boolean; jobId: string }> {
    const { data } = await api.post<{ enqueued: boolean; jobId: string }>('/jobs/digest');
    return data;
  },

  // Async export: worker dosyayı üretip e-posta ile gönderir.
  async exportTickets(
    filters: Record<string, string | undefined>,
    format: ExportFormat = 'excel',
  ): Promise<{ enqueued: boolean; jobId: string }> {
    const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const { data } = await api.post<{ enqueued: boolean; jobId: string }>('/jobs/export', { ...clean, format });
    return data;
  },

  // Senkron indirme: backend file-service mikroservisinden dosyayı alıp anında
  // tarayıcıya indirir (excel/pdf).
  async downloadExport(format: 'excel' | 'pdf', filters: Record<string, string | undefined> = {}): Promise<void> {
    const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const res = await api.post('/jobs/export/download', { ...clean, format }, { responseType: 'blob' });
    const blob = new Blob([res.data]);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `talepler-export.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};
