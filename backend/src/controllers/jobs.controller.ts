import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { enqueueDigestNow, enqueueExport } from '../queue';
import { exportFiltersSchema } from '../schemas';
import type { Principal } from '../services/access';

// POST /jobs/digest — enqueue the daily digest immediately (admin, for testing).
// The backend only pushes the job to Redis; the worker picks it up and runs it.
export async function runDigest(_req: Request, res: Response): Promise<void> {
  const job = await enqueueDigestNow();
  res.json({ enqueued: true, jobId: String(job.id) });
}

// POST /jobs/export — offload a CSV export to the worker; it builds the file and
// e-mails it. The request returns immediately (no blocking on heavy work).
export async function runExport(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const filters = exportFiltersSchema.parse(req.body ?? {});
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true, email: true } });
  const job = await enqueueExport({
    requesterId: user.id,
    requesterRole: user.role,
    email: me?.email ?? user.email,
    requestedByName: me?.fullName ?? user.email,
    filters,
  });
  res.json({ enqueued: true, jobId: String(job.id) });
}
