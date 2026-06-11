import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { env } from '../env';
import { AppError } from '../utils/AppError';
import { canAccessTicket, type Principal } from '../services/access';
import { audit } from '../services/audit';
import { emitTicketUpdated } from '../realtime/socket';

function publicAttachment(a: {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploaderId: string | null;
  createdAt: Date;
}) {
  return {
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    size: a.size,
    uploaderId: a.uploaderId,
    createdAt: a.createdAt,
  };
}

// POST /tickets/:id/attachments — bir talebe bir veya daha fazla dosya yükle.
export async function uploadAttachments(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    select: { id: true, userId: true, departmentId: true },
  });
  if (!ticket) throw new AppError(404, 'Ticket not found');
  if (!(await canAccessTicket(user, ticket))) {
    throw new AppError(403, 'You do not have access to this ticket');
  }

  const files = (req.files as Express.Multer.File[]) ?? [];
  if (!files.length) throw new AppError(422, 'No files uploaded');

  const created = [];
  for (const f of files) {
    // multer dosya adlarını latin1 olarak çözer; ASCII olmayan adlar için UTF-8'i geri yükle.
    const original = Buffer.from(f.originalname, 'latin1').toString('utf8');
    const a = await prisma.attachment.create({
      data: {
        ticketId: ticket.id,
        uploaderId: user.id,
        filename: original,
        storedName: f.filename,
        mimeType: f.mimetype,
        size: f.size,
      },
    });
    created.push(publicAttachment(a));
  }

  audit('ticket.attachment', {
    ticketId: ticket.id,
    actorId: user.id,
    actorName: user.email,
    detail: { count: created.length },
  });
  emitTicketUpdated(ticket, []);
  res.status(201).json({ attachments: created });
}

// GET /attachments/:id — dosyayı akıt (erişim, ait olduğu talep üzerinden kontrol edilir).
export async function downloadAttachment(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const a = await prisma.attachment.findUnique({
    where: { id: req.params.id },
    include: { ticket: { select: { id: true, userId: true, departmentId: true } } },
  });
  if (!a) throw new AppError(404, 'Attachment not found');
  if (!(await canAccessTicket(user, a.ticket))) {
    throw new AppError(403, 'You do not have access to this attachment');
  }

  const filePath = path.join(env.UPLOAD_DIR, a.storedName);
  if (!fs.existsSync(filePath)) throw new AppError(404, 'File is missing');

  const disposition = a.mimeType.startsWith('image/') ? 'inline' : 'attachment';
  res.setHeader('Content-Type', a.mimeType);
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  fs.createReadStream(filePath).pipe(res);
}

// DELETE /attachments/:id — yükleyen kişi veya admin.
export async function deleteAttachment(req: Request, res: Response): Promise<void> {
  const user = req.user as Principal;
  const a = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!a) throw new AppError(404, 'Attachment not found');
  if (user.role !== 'admin' && a.uploaderId !== user.id) {
    throw new AppError(403, 'Only the uploader or an admin can delete this file');
  }
  await prisma.attachment.delete({ where: { id: a.id } });
  fs.promises.unlink(path.join(env.UPLOAD_DIR, a.storedName)).catch(() => {});
  res.status(204).send();
}
