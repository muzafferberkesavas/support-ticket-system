import ExcelJS from 'exceljs';
import type { GeneratePayload } from './schema';

// Verilen kolon/satırlardan bir .xlsx Buffer üretir. DB veya iş mantığı yok.
export async function buildExcel(payload: GeneratePayload): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'support-file-service';
  const ws = wb.addWorksheet(payload.sheetName?.slice(0, 31) || 'Sayfa1', {
    views: [{ state: 'frozen', ySplit: 1 }], // başlık satırı sabit kalsın
  });

  ws.columns = payload.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 22,
  }));

  // Başlık satırını koyu mavi zemin + beyaz kalın yazı ile biçimlendir.
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0EA5E9' } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;

  for (const row of payload.rows) {
    ws.addRow(row);
  }

  // Otomatik filtre (kullanıcı Excel'de süzebilsin).
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: payload.columns.length },
  };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
