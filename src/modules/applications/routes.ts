import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { createApplicationSchema, statusSchema, paymentSchema } from './schema.js';
import * as c from './controller.js';

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);
applicationsRouter.post('/', requireRole('STUDENT'), validate(createApplicationSchema), auditLog('CREATE', 'application'), c.create);
applicationsRouter.get('/', c.list);
applicationsRouter.get('/:id', c.get);
applicationsRouter.get('/:id/timeline', c.timeline);
applicationsRouter.patch('/:id/status', requireRole('ADMIN', 'AGENT'), validate(statusSchema), auditLog('UPDATE', 'application'), c.setStatus);
applicationsRouter.patch('/:id/payment', requireRole('ADMIN'), validate(paymentSchema), auditLog('PAYMENT', 'application'), c.setPayment);
