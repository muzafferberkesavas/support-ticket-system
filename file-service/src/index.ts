import express, { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { generateSchema } from './schema';
import { buildExcel } from './excel';
import { buildPdf } from './pdf';

// ─────────────────────────────────────────────────────────────────────
// Dosya Üretim Mikroservisi
//
// Tek sorumluluk: gelen JSON veriden Excel/PDF dosyası üretip döndürmek.
// VERİTABANI BAĞLANTISI YOKTUR — durumsuzdur (stateless). Backend bu servise
// HTTP isteği atar, cevap olarak dosyayı (binary) alır.
// ─────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 4000;
// Backend ile paylaşılan basit servis-içi sır. Boşsa auth devre dışıdır
// (yerel geliştirme); production'da mutlaka ayarlanmalı.
const TOKEN = process.env.FILE_SERVICE_TOKEN || '';
const MAX_JSON = process.env.MAX_JSON_MB ? `${process.env.MAX_JSON_MB}mb` : '20mb';

const app = express();
app.use(express.json({ limit: MAX_JSON }));

// Servisler arası paylaşılan token kontrolü.
function requireToken(req: Request, res: Response, next: NextFunction): void {
  if (!TOKEN) {
    next();
    return;
  }
  const [scheme, value] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Bearer' && value === TOKEN) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Dosya adındaki güvensiz karakterleri temizle (header injection'a karşı).
function safeName(name: string | undefined, fallback: string): string {
  const base = (name || fallback).replace(/[^\w.\-]+/g, '_').slice(0, 120);
  return base || fallback;
}

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: 'file-service', db: false });
});

// POST /generate/excel → .xlsx (binary)
app.post('/generate/excel', requireToken, async (req, res, next) => {
  try {
    const payload = generateSchema.parse(req.body);
    const buffer = await buildExcel(payload);
    const filename = safeName(payload.filename, 'export.xlsx');
    res
      .status(200)
      .set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .set('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buffer);
  } catch (err) {
    next(err);
  }
});

// POST /generate/pdf → .pdf (binary)
app.post('/generate/pdf', requireToken, async (req, res, next) => {
  try {
    const payload = generateSchema.parse(req.body);
    const buffer = await buildPdf(payload);
    const filename = safeName(payload.filename, 'export.pdf');
    res
      .status(200)
      .set('Content-Type', 'application/pdf')
      .set('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buffer);
  } catch (err) {
    next(err);
  }
});

// Merkezi hata işleyici.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Geçersiz istek gövdesi', details: err.flatten().fieldErrors });
    return;
  }
  console.error('file-service hata:', err);
  res.status(500).json({ error: 'Dosya üretilemedi' });
});

app.listen(PORT, () => {
  console.log(`📄 file-service çalışıyor: http://localhost:${PORT} (DB yok)`);
});
