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

  // ── Toplu içe aktarım (import) ─────────────────────────────────────
  // Dosyayı yükler, önizleme döner (HİÇBİR ŞEY YAZILMAZ).
  async previewImport(entity: ExportEntity, file: File): Promise<ImportPreview> {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post<ImportPreview>(`/imports/${entity}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  // Onaydan sonra içe aktarımı worker'a devreder.
  async confirmImport(importId: string, strategy: ImportStrategy): Promise<{ enqueued: boolean; jobId: string }> {
    const { data } = await api.post<{ enqueued: boolean; jobId: string }>(`/imports/${importId}/confirm`, { strategy });
    return data;
  },
};

export type ImportRowStatus = 'new' | 'exists' | 'duplicate' | 'error';
export type ImportStrategy = 'skip' | 'update' | 'createOnly';

export interface ImportPreviewRow {
  index: number;
  status: ImportRowStatus;
  errors: string[];
  display: Record<string, string>;
}

export interface ImportPreviewSummary {
  total: number;
  new: number;
  exists: number;
  duplicate: number;
  error: number;
}

export interface ImportPreview {
  importId: string;
  entity: ExportEntity;
  columns: string[];
  summary: ImportPreviewSummary;
  rows: ImportPreviewRow[];
}

// Worker'dan gelen canlı ilerleme (socket 'import:progress'/'import:done').
export interface ImportProgress {
  importId: string;
  entity: string;
  processed: number;
  total: number;
  percent: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  done?: boolean;
}
