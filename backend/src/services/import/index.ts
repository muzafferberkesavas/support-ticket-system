import { Prisma } from '@prisma/client';
import { parseFile } from './parseFile';
import { userImportAdapter } from './userImport';
import type {
  ImportAdapter,
  ImportEntity,
  ImportResult,
  ImportStrategy,
  PreviewRow,
  PreviewSummary,
  RowStatus,
} from './types';

// Varlık → adapter kayıt defteri. Yeni bir varlık eklemek = yeni adapter + bu satır.
const ADAPTERS: Partial<Record<ImportEntity, ImportAdapter>> = {
  users: userImportAdapter,
};

export function getAdapter(entity: ImportEntity): ImportAdapter {
  const a = ADAPTERS[entity];
  if (!a) throw new Error(`Desteklenmeyen import varlığı: ${entity}`);
  return a;
}

export interface PreviewResult {
  columns: string[];
  rows: PreviewRow[];
  summary: PreviewSummary;
}

// Dosyayı ayrıştırır, her satırı doğrular, dosya-içi tekrar + DB'de mevcut
// tespitini yapar ve önizleme üretir. HİÇBİR ŞEY YAZMAZ.
export async function buildPreview(entity: ImportEntity, buffer: Buffer, filename: string): Promise<PreviewResult> {
  const adapter = getAdapter(entity);
  const ctx = await adapter.buildContext();
  const { rows: rawRows } = await parseFile(buffer, filename);

  const parsed = rawRows.map((raw, i) => {
    const { data, display, errors } = adapter.parseRow(raw, ctx);
    const key = errors.length ? null : adapter.keyOf(data);
    return { index: i + 1, data, display, errors, key };
  });

  // Doğal anahtarlı varlıkta sistemde mevcut anahtarları tek sorguda çek.
  let existing = new Set<string>();
  if (adapter.dedupStrategy === 'natural-key') {
    const keys = [...new Set(parsed.filter((p) => p.key).map((p) => p.key as string))];
    existing = await adapter.findExistingKeys(keys);
  }

  const seen = new Set<string>();
  const rows: PreviewRow[] = parsed.map((p) => {
    let status: RowStatus;
    if (p.errors.length) {
      status = 'error';
    } else if (adapter.dedupStrategy === 'natural-key' && p.key) {
      if (seen.has(p.key)) status = 'duplicate';
      else {
        seen.add(p.key);
        status = existing.has(p.key) ? 'exists' : 'new';
      }
    } else {
      status = 'new';
    }
    return { index: p.index, status, key: p.key, errors: p.errors, data: p.data, display: p.display };
  });

  const summary: PreviewSummary = {
    total: rows.length,
    new: rows.filter((r) => r.status === 'new').length,
    exists: rows.filter((r) => r.status === 'exists').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    error: rows.filter((r) => r.status === 'error').length,
  };

  return { columns: adapter.displayColumns, rows, summary };
}

export type ProgressFn = (processed: number, total: number, partial: ImportResult) => void;

// Önizleme satırlarını stratejiye göre işler. Hatalı satır tüm işi durdurmaz
// (satır başına try/catch). onProgress periyodik çağrılır.
export async function runImport(
  entity: ImportEntity,
  rows: PreviewRow[],
  strategy: ImportStrategy,
  onProgress?: ProgressFn,
): Promise<ImportResult> {
  const adapter = getAdapter(entity);
  const ctx = await adapter.buildContext();
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  const total = rows.length;

  for (let i = 0; i < total; i++) {
    const row = rows[i];
    try {
      if (row.status === 'error' || row.status === 'duplicate') {
        result.skipped++;
      } else if (row.status === 'exists') {
        if (strategy === 'update') {
          await adapter.update(row.data, ctx);
          result.updated++;
        } else {
          // skip + createOnly → mevcut kaydı atla
          result.skipped++;
        }
      } else {
        // new
        await adapter.create(row.data, ctx);
        result.created++;
      }
    } catch (err) {
      // Yarış/çift import: kayıt zaten varsa (P2002) hata değil, atlanmış say.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        result.skipped++;
      } else {
        result.failed++;
        result.errors.push({ index: row.index, message: err instanceof Error ? err.message : 'Bilinmeyen hata' });
      }
    }
    if (onProgress && (i % 10 === 0 || i === total - 1)) onProgress(i + 1, total, result);
  }

  return result;
}
