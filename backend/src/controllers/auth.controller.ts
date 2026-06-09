import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';
import { env } from '../env';
import { AppError } from '../utils/AppError';
import { signToken } from '../utils/jwt';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../schemas';
import { sendResetEmail } from '../services/mailer';

function toPublicUser(user: {
  id: string;
  email: string;
  role: string;
  fullName: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

// POST /auth/register
export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, fullName } = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: passwordHash, fullName: fullName ?? null },
  });

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  res.status(201).json({ token, user: toPublicUser(user) });
}

// POST /auth/login
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(401, 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new AppError(401, 'Invalid email or password');
  }

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  res.json({ token, user: toPublicUser(user) });
}

// GET /auth/me  — current authenticated user
export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  res.json({ user: toPublicUser(user) });
}

// PATCH /auth/profile  — update own display name
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const { fullName } = updateProfileSchema.parse(req.body);
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: { fullName } });
  res.json({ user: toPublicUser(user) });
}

// POST /auth/change-password  — authenticated (also used for forced first-login change)
export async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new AppError(404, 'User not found');

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw new AppError(401, 'Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: passwordHash, mustChangePassword: false },
  });
  res.json({ ok: true });
}

// POST /auth/forgot-password  — always responds ok (no account enumeration)
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = forgotPasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    const raw = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
    const link = `${env.APP_URL}/reset-password?token=${raw}`;
    await sendResetEmail(user.email, link);
  }
  res.json({ ok: true });
}

// POST /auth/reset-password
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, newPassword } = resetPasswordSchema.parse(req.body);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(400, 'This reset link is invalid or has expired');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { password: passwordHash, mustChangePassword: false },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  res.json({ ok: true });
}
