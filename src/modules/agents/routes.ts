import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { auditLog } from '../../middleware/audit.js';
import * as c from './controller.js';

export const agentsRouter = Router();
agentsRouter.use(requireAuth);
agentsRouter.get('/', requireRole('ADMIN'), c.list);
agentsRouter.get('/me/students', requireRole('AGENT'), c.myStudents);
agentsRouter.patch('/students/:id/verify', requireRole('AGENT', 'ADMIN'), auditLog('VERIFY', 'student'), c.verifyStudent);
