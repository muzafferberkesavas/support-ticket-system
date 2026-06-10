import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { enqueueDigestNow, enqueueExport } from '../queue';
import { exportFiltersSchema } from '../schemas';
import type { Principal } from '../services/access';
import { buildExportData } from '../services/exportData';
import { generateFile, FILE_META, type FileFormat } from '../services/fileService';

// POST /jobs/digest — enqueue the daily digest immediately (admin, for testing).
// The backend only pushes the job to Redis; the worker picks it up and runs it.
export async function runDigest(_req: Request, res: Response): Promise<void> {
  const job = await enqueueDigestNow();
  res.json({ enqueued: true, jobId: String(job.id) });
}

// POST /jobs/export — offload an export to the worker; it builds the file
// (CSV locally, or Excel/PDF via the file-service) and e-mails it. The request
// returns immediately (no blocking on heavy work).
export async function runExport(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const { format, ...filters } = exportFiltersSchema.parse(req.body ?? {});
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true, email: true } });
  const job = await enqueueExport({
    requesterId: user.id,
    requesterRole: user.role,
    email: me?.email ?? user.email,
    requestedByName: me?.fullName ?? user.email,
    format,
    filters,
  });
  res.json({ enqueued: true, jobId: String(job.id) });
}

// POST /jobs/export/download — synchronous download. The backend gathers the
// data, asks the file-service to render it (Excel/PDF), and streams the file
// straight back to the client. Demonstrates the backend → microservice → file
// round-trip without going through e-mail.
export async function downloadExport(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const { format, ...filters } = exportFiltersSchema.parse(req.body ?? {});
  if (format === 'csv') {
    // Senkron indirme yalnızca mikroservis formatları (excel/pdf) içindir.
    res.status(400).json({ error: 'Senkron indirme için format excel veya pdf olmalı' });
    return;
  }
  const fmt = format as FileFormat;
  const { columns, rows } = await buildExportData(user, filters);
  const { ext, contentType } = FILE_META[fmt];
  const filename = `talepler-export.${ext}`;
  const file = await generateFile(fmt, {
    title: 'Talep Dışa Aktarımı',
    filename,
    sheetName: 'Talepler',
    columns,
    rows,
  });
  res
    .status(200)
    .set('Content-Type', contentType)
    .set('Content-Disposition', `attachment; filename="${filename}"`)
    .send(file);
}
