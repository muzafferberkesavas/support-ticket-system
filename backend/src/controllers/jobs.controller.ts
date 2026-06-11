import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { enqueueDigestNow, enqueueExport } from '../queue';
import { exportFiltersSchema } from '../schemas';
import type { Principal } from '../services/access';
import { buildExportData, buildCsv, EXPORT_META } from '../services/exportData';
import { generateFile, FILE_META, type FileFormat } from '../services/fileService';
import { getJobStats, getRecentOps } from '../realtime/jobStats';

// GET /jobs/stats — operasyon dashboard'unun ilk yükü: anlık kuyruk sayaçları +
// son işlemler. Canlı güncellemeler ayrıca socket ('job:stats'/'job:event') ile gelir.
export async function getStats(_req: Request, res: Response): Promise<void> {
  const [stats, recent] = await Promise.all([getJobStats(), getRecentOps()]);
  res.json({ stats, recent });
}

// POST /jobs/digest — günlük özeti hemen kuyruğa al (admin, test amaçlı).
// Backend job'u yalnızca Redis'e iletir; worker onu alıp çalıştırır.
export async function runDigest(_req: Request, res: Response): Promise<void> {
  const job = await enqueueDigestNow();
  res.json({ enqueued: true, jobId: String(job.id) });
}

// POST /jobs/export — bir dışa aktarımı worker'a devret; dosyayı oluşturur
// (CSV yerel olarak, ya da file-service üzerinden Excel/PDF) ve e-posta ile gönderir.
// İstek hemen döner (ağır iş üzerinde bloklama yok).
export async function runExport(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const { format, entity, ...filters } = exportFiltersSchema.parse(req.body ?? {});
  // Kullanıcı dışa aktarımı yalnızca admin'e açıktır.
  if (entity === 'users' && user.role !== 'admin') {
    res.status(403).json({ error: 'Kullanıcı dışa aktarımı için admin yetkisi gerekir' });
    return;
  }
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true, email: true } });
  const job = await enqueueExport({
    requesterId: user.id,
    requesterRole: user.role,
    email: me?.email ?? user.email,
    requestedByName: me?.fullName ?? user.email,
    entity,
    format,
    filters,
  });
  res.json({ enqueued: true, jobId: String(job.id) });
}

// POST /jobs/export/download — senkron indirme. Backend veriyi toplar,
// file-service'ten onu işlemesini (Excel/PDF) ister ve dosyayı doğrudan
// istemciye akıtır. E-postaya gitmeden backend → mikroservis → dosya
// gidiş-dönüşünü gösterir.
export async function downloadExport(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const { format, entity, ...filters } = exportFiltersSchema.parse(req.body ?? {});
  if (entity === 'users' && user.role !== 'admin') {
    res.status(403).json({ error: 'Kullanıcı dışa aktarımı için admin yetkisi gerekir' });
    return;
  }
  const meta = EXPORT_META[entity];
  const { columns, rows } = await buildExportData(entity, user, filters);

  // CSV worker/file-service gerektirmez; yerel üretilip BOM ile gönderilir.
  if (format === 'csv') {
    const csv = '﻿' + buildCsv(columns, rows);
    res
      .status(200)
      .set('Content-Type', 'text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="${meta.baseName}.csv"`)
      .send(csv);
    return;
  }

  // Excel/PDF → file-service mikroservisi.
  const fmt = format as FileFormat;
  const { ext, contentType } = FILE_META[fmt];
  const filename = `${meta.baseName}.${ext}`;
  const file = await generateFile(fmt, {
    title: meta.title,
    filename,
    sheetName: meta.sheet,
    columns,
    rows,
  });
  res
    .status(200)
    .set('Content-Type', contentType)
    .set('Content-Disposition', `attachment; filename="${filename}"`)
    .send(file);
}
