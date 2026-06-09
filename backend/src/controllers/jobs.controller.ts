import { Request, Response } from 'express';
import { enqueueDigestNow } from '../queue';

// POST /jobs/digest — enqueue the daily digest immediately (admin, for testing).
// The backend only pushes the job to Redis; the worker picks it up and runs it.
export async function runDigest(_req: Request, res: Response): Promise<void> {
  const job = await enqueueDigestNow();
  res.json({ enqueued: true, jobId: String(job.id) });
}
