import { Request, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { z } from 'zod';
import { redis } from '../redis';
import { AppError } from '../utils/AppError';
import { buildPreview } from '../services/import';
import { enqueueBulkImport } from '../queue';
import type { ImportEntity } from '../services/import/types';

// Import dosyaları bellekte tutulur (parse edilip Redis'e önizleme yazılır;
// ham dosya diske kaydedilmez). 10MB sınır, tek dosya.
const ALLOWED = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
  'text/plain',
]);
export const uploadImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (ALLOWED.has(file.mimetype) || ['csv', 'xlsx', 'xls', 'txt'].includes(ext ?? '')) cb(null, true);
    else cb(new AppError(400, 'Yalnızca CSV veya Excel (.xlsx) dosyaları yüklenebilir.'));
  },
});

const entitySchema = z.enum(['users', 'tickets']);
const strategySchema = z.enum(['skip', 'update', 'createOnly']);
const PREVIEW_TTL_S = 3600; // 60 dk
const UI_ROW_CAP = 500; // UI'a dönen önizleme satırı üst sınırı (özet tümünü kapsar)

const redisKey = (id: string) => `import:${id}`;

// POST /imports/:entity — dosyayı ayrıştırır, doğrular, önizleme üretir.
// HİÇBİR ŞEY YAZMAZ; önizleme Redis'te 60 dk saklanır.
export async function previewImport(req: Request, res: Response): Promise<void> {
  const entity = entitySchema.parse(req.params.entity) as ImportEntity;
  if (!req.file) throw new AppError(400, 'Dosya gerekli (alan adı: file).');

  const { columns, rows, summary } = await buildPreview(entity, req.file.buffer, req.file.originalname);
  const importId = crypto.randomUUID();
  await redis.set(redisKey(importId), JSON.stringify({ entity, columns, rows, summary }), 'EX', PREVIEW_TTL_S);

  res.json({ importId, entity, columns, summary, rows: rows.slice(0, UI_ROW_CAP) });
}

// GET /imports/:importId — kaydedilmiş önizlemeyi döndürür (yeniden yükleme için).
export async function getPreview(req: Request, res: Response): Promise<void> {
  const raw = await redis.get(redisKey(req.params.importId));
  if (!raw) throw new AppError(404, 'Önizleme bulunamadı veya süresi doldu. Lütfen dosyayı yeniden yükleyin.');
  const p = JSON.parse(raw);
  res.json({
    importId: req.params.importId,
    entity: p.entity,
    columns: p.columns,
    summary: p.summary,
    rows: p.rows.slice(0, UI_ROW_CAP),
  });
}

// POST /imports/:importId/confirm — onaydan sonra içe aktarımı worker'a devret.
export async function confirmImport(req: Request, res: Response): Promise<void> {
  const strategy = strategySchema.parse(req.body?.strategy);
  const raw = await redis.get(redisKey(req.params.importId));
  if (!raw) throw new AppError(404, 'Önizleme bulunamadı veya süresi doldu. Lütfen dosyayı yeniden yükleyin.');
  const p = JSON.parse(raw) as { entity: ImportEntity };

  const job = await enqueueBulkImport({
    importId: req.params.importId,
    entity: p.entity,
    strategy,
    requesterName: req.user?.email ?? 'admin',
  });
  res.json({ enqueued: true, jobId: String(job.id) });
}
