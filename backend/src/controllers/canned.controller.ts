import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { AppError } from '../utils/AppError';
import { createCannedSchema, updateCannedSchema } from '../schemas';
import { getUserDepartmentIds, type Principal } from '../services/access';

// GET /canned — templates available to the current staff member.
export async function listCanned(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;

  let where: Prisma.CannedResponseWhereInput = {};
  if (user.role !== 'admin') {
    const deptIds = await getUserDepartmentIds(user.id);
    where = {
      OR: [
        { departmentId: null }, // global
        ...(deptIds.length ? [{ departmentId: { in: deptIds } }] : []),
        { createdById: user.id },
      ],
    };
  }

  const responses = await prisma.cannedResponse.findMany({ where, orderBy: { title: 'asc' } });
  res.json({ responses });
}

// POST /canned (staff)
export async function createCanned(req: Request, res: Response): Promise<void> {
  const { title, body, departmentId } = createCannedSchema.parse(req.body);
  const response = await prisma.cannedResponse.create({
    data: { title, body, departmentId: departmentId ?? null, createdById: req.user!.id },
  });
  res.status(201).json({ response });
}

// PUT /canned/:id (owner or admin)
export async function updateCanned(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const data = updateCannedSchema.parse(req.body);
  const existing = await prisma.cannedResponse.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'Template not found');
  if (user.role !== 'admin' && existing.createdById !== user.id) {
    throw new AppError(403, 'You can only edit your own templates');
  }
  const response = await prisma.cannedResponse.update({
    where: { id: existing.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.departmentId !== undefined ? { departmentId: data.departmentId } : {}),
    },
  });
  res.json({ response });
}

// DELETE /canned/:id (owner or admin)
export async function deleteCanned(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const existing = await prisma.cannedResponse.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'Template not found');
  if (user.role !== 'admin' && existing.createdById !== user.id) {
    throw new AppError(403, 'You can only delete your own templates');
  }
  await prisma.cannedResponse.delete({ where: { id: existing.id } });
  res.status(204).send();
}
