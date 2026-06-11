// Express Request'i, kimliği doğrulanmış kullanıcı payload'ı ile genişletir.
import 'express';

declare global {
  namespace Express {
    interface UserPrincipal {
      id: string;
      email: string;
      role: 'user' | 'agent' | 'team_lead' | 'admin';
    }
    interface Request {
      user?: UserPrincipal;
    }
  }
}

export {};
