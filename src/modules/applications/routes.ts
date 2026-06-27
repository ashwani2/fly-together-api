import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { createApplicationSchema, statusSchema, paymentSchema, initializeFlywireSchema, scheduleMeetingSchema } from './schema.js';
import * as c from './controller.js';

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);
applicationsRouter.post('/', requireRole('STUDENT'), validate(createApplicationSchema), auditLog('CREATE', 'application'), c.create);
applicationsRouter.get('/', c.list);
applicationsRouter.get('/:id', c.get);
applicationsRouter.get('/:id/timeline', c.timeline);
applicationsRouter.patch('/:id/status', requireRole('ADMIN', 'AGENT'), validate(statusSchema), auditLog('UPDATE', 'application'), c.setStatus);
applicationsRouter.patch('/:id/payment', requireRole('ADMIN', 'AGENT'), validate(paymentSchema), auditLog('PAYMENT', 'application'), c.setPayment);
// Flywire: admins/agents initialize a payment; the owning student (or staff) can refresh its status.
applicationsRouter.post('/:id/flywire/initialize', requireRole('ADMIN', 'AGENT'), validate(initializeFlywireSchema), auditLog('PAYMENT', 'application'), c.initializeFlywire);
applicationsRouter.post('/:id/flywire/refresh', auditLog('PAYMENT', 'application'), c.refreshFlywire);
// Schedule a Google Meet for an application (admin/agent) → emails the student + records on the timeline.
applicationsRouter.post('/:id/meeting', requireRole('ADMIN', 'AGENT'), validate(scheduleMeetingSchema), auditLog('UPDATE', 'application'), c.scheduleMeeting);
