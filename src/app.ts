import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { AppError } from './lib/errors.js';
import { authRouter } from './modules/auth/routes.js';
import { studentsRouter } from './modules/students/routes.js';
import { documentsTopRouter } from './modules/students/documents.routes.js';
import { filesRouter } from './modules/files/routes.js';
import { agentsRouter } from './modules/agents/routes.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok' } }));

  app.use('/api/auth', authRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/documents', documentsTopRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/agents', agentsRouter);

  app.use((_req, _res, next) => next(AppError.notFound('Route not found')));
  app.use(errorHandler);
  return app;
}
