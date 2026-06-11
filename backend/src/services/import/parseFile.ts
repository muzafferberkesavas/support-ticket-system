import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { AppError } from '../../utils/AppError';

// Bir CSV/XLSX dosyasını başlık + satır nesnelerine çevirir. Çıktı satırları
// başlık adlarıyla anahtarlanmış string sözlüklerdir; doğrulama/normalize işi
// adapter'a aittir.

export const MAX_IMPORT_ROWS = 5000;

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

function assertRowLimit(n: number): void {
  if (n > MAX_IMPORT_ROWS) {
    throw new AppError(400, `Dosya en fazla ${MAX_IMPORT_ROWS} satır içerebilir (bulunan: ${n}).`);
  }
}

function parseCsvBuffer(buffer: Buffer): ParsedFile {
  const records = parseCsv(buffer, {
    columns: true, // ilk satır başlık → her satır { başlık: değer }
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];
  assertRowLimit(records.length);
  const headers = records.length ? Object.keys(records[0]) : [];
  return { headers, rows: records };
}

async function parseXlsxBuffer(buffer: Buffer): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const headers: string[] = [];
  const headerRow = ws.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? '').trim();
  });

  const rows: Record<string, string>[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const cell = row.getCell(i + 1).value;
      const val =
        cell == null ? '' : typeof cell === 'object' ? String((cell as { text?: string }).text ?? cell) : String(cell);
      obj[h] = val.trim();
      if (obj[h]) hasValue = true;
    });
    if (hasValue) rows.push(obj);
  }
  assertRowLimit(rows.length);
  return { headers: headers.filter(Boolean), rows };
}

// Dosya adına/uzantısına göre uygun ayrıştırıcıyı seçer.
export async function parseFile(buffer: Buffer, filename: string): Promise<ParsedFile> {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'txt') return parseCsvBuffer(buffer);
  if (ext === 'xlsx' || ext === 'xls') return parseXlsxBuffer(buffer);
  throw new AppError(400, 'Desteklenmeyen dosya türü. CSV veya Excel (.xlsx) yükleyin.');
}
