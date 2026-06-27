import './lib/istTime.js';
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
import { universitiesRouter } from './modules/universities/routes.js';
import { accommodationsRouter } from './modules/accommodations/routes.js';
import { serviceProvidersRouter } from './modules/serviceProviders/routes.js';
import { partnersRouter } from './modules/partners/routes.js';
import { blogsRouter } from './modules/blogs/routes.js';
import { testimonialsRouter } from './modules/testimonials/routes.js';
import { loansRouter } from './modules/loans/routes.js';
import { applicationsRouter } from './modules/applications/routes.js';
import { adminRouter } from './modules/admin/routes.js';
import { auditRouter } from './modules/audit/routes.js';
import { consentRouter } from './modules/consent/routes.js';
import { notificationsRouter } from './modules/notifications/routes.js';
import { sopLeadsRouter } from './modules/sopLeads/routes.js';

// Allowed browser origins. CORS_ORIGIN may be a comma-separated list (e.g. the
// Vercel production URL plus preview URLs). Trailing slashes are tolerated, and
// "*" allows any origin. A trailing "*.domain" entry matches any subdomain
// (handy for Vercel preview deployments, e.g. "https://*.vercel.app").
const ALLOWED_ORIGINS = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

function isAllowedOrigin(origin: string): boolean {
  const o = origin.replace(/\/$/, '');
  return ALLOWED_ORIGINS.some((allowed) => {
    if (allowed === '*' || allowed === o) return true;
    if (allowed.includes('*')) {
      const re = new RegExp('^' + allowed.replace(/[.]/g, '\\.').replace(/\*/g, '[^.]+') + '$');
      return re.test(o);
    }
    return false;
  });
}

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Non-browser requests (curl, server-to-server) have no Origin header.
        if (!origin || isAllowedOrigin(origin)) return cb(null, true);
        cb(new Error(`Not allowed by CORS: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok' } }));

  app.use('/api/auth', authRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/documents', documentsTopRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/universities', universitiesRouter);
  app.use('/api/accommodations', accommodationsRouter);
  app.use('/api/service-providers', serviceProvidersRouter);
  app.use('/api/partners', partnersRouter);
  app.use('/api/blogs', blogsRouter);
  app.use('/api/testimonials', testimonialsRouter);
  app.use('/api/loans', loansRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/consent', consentRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/sop-leads', sopLeadsRouter);

  app.use((_req, _res, next) => next(AppError.notFound('Route not found')));
  app.use(errorHandler);
  return app;
}
