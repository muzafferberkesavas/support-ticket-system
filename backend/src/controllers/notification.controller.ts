import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { AppError } from '../utils/AppError';

// GET /notifications — current user's latest notifications + unread count.
export async function listNotifications(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);
  res.json({ notifications, unreadCount });
}

// GET /notifications/unread-count
export async function unreadCount(req: Request, res: Response): Promise<void> {
  const count = await prisma.notification.count({ where: { userId: req.user!.id, read: false } });
  res.json({ count });
}

// PATCH /notifications/:id/read
export async function markRead(req: Request, res: Response): Promise<void> {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.userId !== req.user!.id) {
    throw new AppError(404, 'Notification not found');
  }
  await prisma.notification.update({ where: { id: notification.id }, data: { read: true } });
  res.json({ ok: true });
}

// POST /notifications/read-all
export async function markAllRead(req: Request, res: Response): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, read: false },
    data: { read: true },
  });
  res.json({ ok: true });
}
