import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { assignAgentSchema } from './schema.js';
import * as c from './controller.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));
adminRouter.get('/stats', c.stats);
adminRouter.get('/applications', c.applications);
adminRouter.patch('/applications/:id/assign-agent', validate(assignAgentSchema), auditLog('ASSIGN_AGENT', 'application'), c.assignAgent);
adminRouter.get('/students', c.studentsList);
adminRouter.get('/students/:id', c.studentDetail);
adminRouter.get('/students/:id/documents/:docId/url', c.studentDocumentUrl);
