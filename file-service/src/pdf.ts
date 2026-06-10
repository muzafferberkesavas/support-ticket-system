import path from 'path';
import PDFDocument from 'pdfkit';
import type { GeneratePayload } from './schema';

// PDFKit'in gömülü Helvetica fontu Türkçe karakterleri (ş, ı, ğ, İ) bozar.
// Bu yüzden Latin-5'i kapsayan DejaVu Sans TTF fontlarını gömüyoruz.
const FONT_DIR = path.join(__dirname, '..', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

// Verilen kolon/satırlardan yatay A4 bir PDF tablo üretir. DB/iş mantığı yok.
export function buildPdf(payload: GeneratePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    doc.registerFont('body', FONT_REGULAR);
    doc.registerFont('bold', FONT_BOLD);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;

    // Başlık.
    if (payload.title) {
      doc.fillColor('#111827').font('bold').fontSize(16).text(payload.title, left, doc.y);
      doc.moveDown(0.4);
    }
    doc
      .fillColor('#6b7280')
      .font('body')
      .fontSize(8)
      .text(`Oluşturulma: ${new Date().toISOString()} · ${payload.rows.length} kayıt`, { align: 'left' });
    doc.moveDown(0.5);

    // Kolon genişliklerini içerik alanına orantılı dağıt.
    const weights = payload.columns.map((c) => c.width ?? 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / totalWeight) * contentWidth);

    const padX = 4;
    const fontSize = 8;
    const headerH = 18;

    // Bir hücre metnini sütun genişliğine sığacak şekilde kısaltır.
    function fit(text: string, width: number): string {
      const max = width - padX * 2;
      if (doc.widthOfString(text) <= max) return text;
      let s = text;
      while (s.length > 1 && doc.widthOfString(s + '…') > max) s = s.slice(0, -1);
      return s + '…';
    }

    function drawRow(cells: string[], y: number, opts: { header?: boolean; zebra?: boolean }): number {
      const h = opts.header ? headerH : rowHeight(cells);
      // Zemin.
      if (opts.header) {
        doc.rect(left, y, contentWidth, h).fill('#0ea5e9');
      } else if (opts.zebra) {
        doc.rect(left, y, contentWidth, h).fill('#f8fafc');
      }
      // Metin.
      doc
        .font(opts.header ? 'bold' : 'body')
        .fontSize(fontSize)
        .fillColor(opts.header ? '#ffffff' : '#1f2937');
      let x = left;
      cells.forEach((cell, i) => {
        doc.text(fit(cell, widths[i]), x + padX, y + 5, { width: widths[i] - padX * 2, lineBreak: false });
        x += widths[i];
      });
      // Alt çizgi.
      doc
        .strokeColor('#e5e7eb')
        .lineWidth(0.5)
        .moveTo(left, y + h)
        .lineTo(right, y + h)
        .stroke();
      return h;
    }

    // Tüm satırlar tek satırlık (truncate) olduğundan sabit yükseklik.
    function rowHeight(_cells: string[]): number {
      return 16;
    }

    const headers = payload.columns.map((c) => c.header);
    let y = doc.y;
    y += drawRow(headers, y, { header: true });

    payload.rows.forEach((row, idx) => {
      // Sayfa sonuna gelindiyse yeni sayfa + başlık tekrarı.
      if (y + 16 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        y += drawRow(headers, y, { header: true });
      }
      const cells = payload.columns.map((c) => {
        const v = row[c.key];
        return v == null ? '' : String(v);
      });
      y += drawRow(cells, y, { zebra: idx % 2 === 1 });
    });

    doc.end();
  });
}
