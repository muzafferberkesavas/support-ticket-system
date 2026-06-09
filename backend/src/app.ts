import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './env';
import authRoutes from './routes/auth.routes';
import ticketRoutes from './routes/ticket.routes';
import departmentRoutes from './routes/department.routes';
import userRoutes from './routes/user.routes';
import notificationRoutes from './routes/notification.routes';
import analyticsRoutes from './routes/analytics.routes';
import attachmentRoutes from './routes/attachment.routes';
import cannedRoutes from './routes/canned.routes';
import dashboardRoutes from './routes/dashboard.routes';
import slaRoutes from './routes/sla.routes';
import jobsRoutes from './routes/jobs.routes';
import { errorHandler, notFound } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
      credentials: true,
    }),
  );
  app.use(express.json());
  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // Healthcheck
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // API routes
  app.use('/auth', authRoutes);
  app.use('/tickets', ticketRoutes);
  app.use('/departments', departmentRoutes);
  app.use('/users', userRoutes);
  app.use('/notifications', notificationRoutes);
  app.use('/analytics', analyticsRoutes);
  app.use('/attachments', attachmentRoutes);
  app.use('/canned', cannedRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/sla', slaRoutes);
  app.use('/jobs', jobsRoutes);

  // Fallbacks
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
