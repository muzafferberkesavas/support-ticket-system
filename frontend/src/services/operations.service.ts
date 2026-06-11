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

export type ExportEntity = 'tickets' | 'users';
export type ExportFormat = 'csv' | 'excel' | 'pdf';

const EXT: Record<ExportFormat, string> = { csv: 'csv', excel: 'xlsx', pdf: 'pdf' };
const BASE: Record<ExportEntity, string> = { tickets: 'talepler-export', users: 'kullanicilar-export' };

export const operationsService = {
  // İlk yük: anlık sayaçlar + son işlemler. Canlı güncellemeler socket ile gelir.
  async getStats(): Promise<{ stats: JobStats; recent: RecentOp[] }> {
    const { data } = await api.get<{ stats: JobStats; recent: RecentOp[] }>('/jobs/stats');
    return data;
  },

  // Senkron indirme: backend veriyi toplar, CSV'yi yerel / Excel-PDF'i file-service
  // üzerinden üretip dosyayı döndürür.
  async download(entity: ExportEntity, format: ExportFormat): Promise<void> {
    const res = await api.post('/jobs/export/download', { entity, format }, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${BASE[entity]}.${EXT[format]}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // Asenkron: worker dosyayı üretip e-posta ile gönderir.
  async exportByEmail(entity: ExportEntity, format: ExportFormat): Promise<void> {
    await api.post('/jobs/export', { entity, format });
  },
};
