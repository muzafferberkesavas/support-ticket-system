import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';

// Merkezi hata yöneticisi — fırlatılan herhangi bir hatayı temiz bir JSON yanıtına dönüştürür.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Zod'dan gelen doğrulama hataları
  if (err instanceof ZodError) {
    res.status(422).json({
      error: 'Validation failed',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // Bilinen operasyonel hatalar
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }

  // Dosya yükleme (multer) hataları
  if (err instanceof Error && err.message === 'UNSUPPORTED_FILE_TYPE') {
    res.status(422).json({ error: 'Unsupported file type' });
    return;
  }
  if (err instanceof Error && err.name === 'MulterError') {
    const code = (err as Error & { code?: string }).code;
    if (code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File is too large' });
      return;
    }
    res.status(422).json({ error: 'Upload failed', details: code });
    return;
  }

  // Prisma: unique constraint (benzersizlik kısıtı) ihlali
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'A record with this value already exists' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}

// Bilinmeyen route'lar için 404 yedeği.
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found' });
}
