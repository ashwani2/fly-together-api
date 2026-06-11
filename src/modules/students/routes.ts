import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { updateProfileSchema } from './schema.js';
import * as c from './controller.js';
import { documentsRouter } from './documents.routes.js';

export const studentsRouter = Router();
studentsRouter.use(requireAuth, requireRole('STUDENT'));
studentsRouter.get('/me', c.getMe);
studentsRouter.put('/me', validate(updateProfileSchema), auditLog('UPDATE', 'student'), c.updateMe);
studentsRouter.use('/me/documents', documentsRouter);
