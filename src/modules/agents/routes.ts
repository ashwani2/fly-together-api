import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { createAgentSchema } from './schema.js';
import * as c from './controller.js';

export const agentsRouter = Router();
agentsRouter.use(requireAuth);
agentsRouter.get('/', requireRole('ADMIN'), c.list);
agentsRouter.post('/', requireRole('ADMIN'), validate(createAgentSchema), auditLog('CREATE', 'agent'), c.create);
agentsRouter.delete('/:id', requireRole('ADMIN'), auditLog('DELETE', 'agent'), c.remove);
agentsRouter.get('/me/students', requireRole('AGENT'), c.myStudents);
agentsRouter.patch('/students/:id/verify', requireRole('AGENT', 'ADMIN'), auditLog('VERIFY', 'student'), c.verifyStudent);
