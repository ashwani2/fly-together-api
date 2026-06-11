import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { AppError } from './lib/errors.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok' } }));

  // Module routers are mounted here as they are built (Tasks 12+).

  app.use((_req, _res, next) => next(AppError.notFound('Route not found')));
  app.use(errorHandler);
  return app;
}
