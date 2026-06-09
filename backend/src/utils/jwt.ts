import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../env';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: 'user' | 'agent' | 'team_lead' | 'admin';
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
