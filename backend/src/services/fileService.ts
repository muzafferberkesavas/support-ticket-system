import { env } from '../env';
import type { ExportColumn, ExportRow } from './exportData';

// file-service mikroservisi için HTTP istemcisi.
// Backend veriyi gönderir, cevap olarak dosyayı (binary) Buffer olarak alır.
// Mikroservisin veritabanı bağlantısı yoktur; tek işi dosya üretmektir.

export interface GenerateRequest {
  title?: string;
  filename?: string;
  sheetName?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

export type FileFormat = 'excel' | 'pdf';

const ENDPOINT: Record<FileFormat, string> = {
  excel: '/generate/excel',
  pdf: '/generate/pdf',
};

// Mikroservise istek atıp üretilen dosyayı Buffer olarak döndürür.
export async function generateFile(format: FileFormat, payload: GenerateRequest): Promise<Buffer> {
  const url = env.FILE_SERVICE_URL.replace(/\/$/, '') + ENDPOINT[format];

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.FILE_SERVICE_TOKEN) headers.Authorization = `Bearer ${env.FILE_SERVICE_TOKEN}`;

  // 30 sn timeout — mikroservis takılırsa istek sonsuza kadar beklemesin.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`file-service ${format} hatası (${res.status}): ${text.slice(0, 300)}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

// İçerik tipi + uzantı yardımcıları (e-posta eki / HTTP cevabı için).
export const FILE_META: Record<FileFormat, { contentType: string; ext: string }> = {
  excel: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  pdf: { contentType: 'application/pdf', ext: 'pdf' },
};
