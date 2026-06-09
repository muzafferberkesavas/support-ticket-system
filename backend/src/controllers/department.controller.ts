import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { AppError } from '../utils/AppError';
import { createDepartmentSchema, updateDepartmentSchema } from '../schemas';
import { isStaff } from '../services/access';

const memberInclude = {
  members: { include: { user: { select: { id: true, email: true, role: true, fullName: true } } } },
  _count: { select: { tickets: true, members: true } },
};

// Ensure all given users are support staff before adding them to a department.
async function assertStaff(memberIds: string[]): Promise<void> {
  if (!memberIds.length) return;
  const users = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, role: true },
  });
  if (users.length !== memberIds.length) throw new AppError(422, 'One or more members do not exist');
  if (users.some((u) => !isStaff(u.role as 'user' | 'agent' | 'team_lead' | 'admin'))) {
    throw new AppError(422, 'Department members must be support staff');
  }
}

async function setMembers(departmentId: string, memberIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.departmentMember.deleteMany({ where: { departmentId } }),
    ...(memberIds.length
      ? [
          prisma.departmentMember.createMany({
            data: memberIds.map((userId) => ({ departmentId, userId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}

// GET /departments — list (any authenticated user; needed for ticket routing).
export async function listDepartments(_req: Request, res: Response): Promise<void> {
  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: memberInclude,
  });
  res.json({ departments });
}

// GET /departments/:id
export async function getDepartment(req: Request, res: Response): Promise<void> {
  const department = await prisma.department.findUnique({
    where: { id: req.params.id },
    include: memberInclude,
  });
  if (!department) throw new AppError(404, 'Department not found');
  res.json({ department });
}

// POST /departments (admin)
export async function createDepartment(req: Request, res: Response): Promise<void> {
  const { name, description, memberIds } = createDepartmentSchema.parse(req.body);
  await assertStaff(memberIds ?? []);

  const department = await prisma.department.create({
    data: {
      name,
      description: description ?? null,
      members: memberIds?.length ? { create: memberIds.map((userId) => ({ userId })) } : undefined,
    },
    include: memberInclude,
  });
  res.status(201).json({ department });
}

// PUT /departments/:id (admin)
export async function updateDepartment(req: Request, res: Response): Promise<void> {
  const { name, description, memberIds } = updateDepartmentSchema.parse(req.body);
  const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'Department not found');

  if (memberIds !== undefined) {
    await assertStaff(memberIds);
    await setMembers(existing.id, memberIds);
  }

  const department = await prisma.department.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
    },
    include: memberInclude,
  });
  res.json({ department });
}

// DELETE /departments/:id (admin)
export async function deleteDepartment(req: Request, res: Response): Promise<void> {
  const existing = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'Department not found');
  await prisma.department.delete({ where: { id: existing.id } });
  res.status(204).send();
}
