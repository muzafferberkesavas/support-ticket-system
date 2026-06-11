import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { updateSlaSchema } from '../schemas';
import { getSlaTargets, refreshSlaTargets } from '../services/sla';

// GET /sla — mevcut SLA hedefleri (manager/admin).
export async function getSla(_req: Request, res: Response): Promise<void> {
  res.json({ targets: getSlaTargets() });
}

// PUT /sla — SLA hedeflerini güncelle (admin).
export async function updateSla(req: Request, res: Response): Promise<void> {
  const data = updateSlaSchema.parse(req.body);
  const priorities = ['low', 'medium', 'high'] as const;
  for (const p of priorities) {
    await prisma.slaPolicy.upsert({
      where: { priority: p },
      update: { responseMinutes: data[p].response, resolutionMinutes: data[p].resolution },
      create: { priority: p, responseMinutes: data[p].response, resolutionMinutes: data[p].resolution },
    });
  }
  await refreshSlaTargets();
  res.json({ targets: getSlaTargets() });
}
