import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { createSopLeadSchema } from './schema.js';
import * as c from './controller.js';

export const sopLeadsRouter = Router();
// Public: the landing-page SOP generator records each generation as a lead.
sopLeadsRouter.post('/', validate(createSopLeadSchema), c.create);
// Admin: paginated list of captured leads for follow-up.
sopLeadsRouter.get('/', requireAuth, requireRole('ADMIN'), c.list);
