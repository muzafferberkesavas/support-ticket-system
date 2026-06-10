import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { AppError } from '../utils/AppError';
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from '../schemas';
import { sendWelcomeEmail } from '../services/mailer';

const userSelect = {
  id: true,
  email: true,
  role: true,
  fullName: true,
  mustChangePassword: true,
  createdAt: true,
  memberships: { include: { department: { select: { id: true, name: true } } } },
  _count: { select: { tickets: true, assignments: true } },
};

// A readable temporary password for a freshly-created account.
function generateTempPassword(): string {
  const base = crypto
    .randomBytes(9)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '');
  return `${base.slice(0, 8)}9!`;
}

async function assertDepartmentsExist(departmentIds: string[]): Promise<void> {
  if (!departmentIds.length) return;
  const depts = await prisma.department.findMany({
    where: { id: { in: departmentIds } },
    select: { id: true },
  });
  if (depts.length !== departmentIds.length) {
    throw new AppError(422, 'One or more departments do not exist');
  }
}

// GET /users (staff) — directory; supports role/department/search filters.
export async function listUsers(req: Request, res: Response): Promise<void> {
  const { role, departmentId, search } = listUsersQuerySchema.parse(req.query);

  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(departmentId ? { memberships: { some: { departmentId } } } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { fullName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: userSelect,
  });
  res.json({ users });
}

// PUT /users/:id (admin) — change role, name, department memberships.
export async function updateUser(req: Request, res: Response): Promise<void> {
  const { role, fullName, departmentIds } = updateUserSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'User not found');

  // Don't let an admin accidentally strip their own admin role.
  if (existing.id === req.user!.id && role && role !== 'admin') {
    throw new AppError(422, 'You cannot change your own admin role');
  }

  if (departmentIds !== undefined) {
    await assertDepartmentsExist(departmentIds);
    await prisma.$transaction([
      prisma.departmentMember.deleteMany({ where: { userId: existing.id } }),
      ...(departmentIds.length
        ? [
            prisma.departmentMember.createMany({
              data: departmentIds.map((departmentId) => ({ departmentId, userId: existing.id })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      ...(role !== undefined ? { role } : {}),
      ...(fullName !== undefined ? { fullName } : {}),
    },
    select: userSelect,
  });
  res.json({ user });
}

// POST /users (admin) — create a staff/customer account with a temp password.
export async function createUser(req: Request, res: Response): Promise<void> {
  const { email, fullName, role, departmentIds } = createUserSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, 'An account with this email already exists');
  await assertDepartmentsExist(departmentIds ?? []);

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await prisma.user.create({
    data: {
      email,
      fullName: fullName ?? null,
      role,
      password: passwordHash,
      mustChangePassword: true,
      memberships: departmentIds?.length
        ? { create: departmentIds.map((departmentId) => ({ departmentId })) }
        : undefined,
    },
    select: userSelect,
  });

  await sendWelcomeEmail(email, fullName ?? null, tempPassword);

  // Return the temp password so the admin can relay it directly if needed.
  res.status(201).json({ user, tempPassword });
}

// DELETE /users/:id (admin)
export async function deleteUser(req: Request, res: Response): Promise<void> {
  if (req.params.id === req.user!.id) {
    throw new AppError(422, 'You cannot delete your own account');
  }
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, 'User not found');

  await prisma.user.delete({ where: { id: existing.id } });
  res.status(204).send();
}
