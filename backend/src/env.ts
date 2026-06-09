import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_EMAIL: z.string().email().default('admin@support.local'),
  ADMIN_PASSWORD: z.string().min(6).default('Admin123!'),
  REDIS_URL: z.string().default('redis://redis:6379'),
  SMTP_HOST: z.string().default('mailpit'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  MAIL_FROM: z.string().default('Destek Merkezi <no-reply@support.local>'),
  APP_URL: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('/app/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(10),
  // Worker: cron schedule for the daily digest job (default 08:00 every day).
  DIGEST_CRON: z.string().default('0 8 * * *'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
