import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { verifyToken } from '../utils/jwt';

// Bearer token'ı doğrular ve `req.user`'ı ekler.
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(401, 'Authentication required');
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }
}

// Bir route'u yalnızca admin'lere kısıtlar. `authenticate`'ten sonra çalışmalıdır.
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    throw new AppError(403, 'Admin privileges required');
  }
  next();
}

// Bir route'u destek personeline (agent / team_lead / admin) kısıtlar.
export function requireStaff(req: Request, _res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (role !== 'agent' && role !== 'team_lead' && role !== 'admin') {
    throw new AppError(403, 'Staff privileges required');
  }
  next();
}

// Bir route'u yöneticilere (team_lead / admin) kısıtlar.
export function requireManager(req: Request, _res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (role !== 'team_lead' && role !== 'admin') {
    throw new AppError(403, 'Manager privileges required');
  }
  next();
}
