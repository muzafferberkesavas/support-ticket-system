import { PrismaClient } from '@prisma/client';

// Tüm süreç boyunca paylaşılan tek bir Prisma client örneği.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});
