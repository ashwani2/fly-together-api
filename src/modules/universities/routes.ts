import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { createUniversitySchema, updateUniversitySchema } from './schema.js';
import * as c from './controller.js';

export const universitiesRouter = Router();
universitiesRouter.get('/', c.list);
universitiesRouter.get('/:id', c.get);
universitiesRouter.post('/', requireAuth, requireRole('ADMIN'), validate(createUniversitySchema), auditLog('CREATE', 'university'), c.create);
universitiesRouter.put('/:id', requireAuth, requireRole('ADMIN'), validate(updateUniversitySchema), auditLog('UPDATE', 'university'), c.update);
universitiesRouter.delete('/:id', requireAuth, requireRole('ADMIN'), auditLog('DELETE', 'university'), c.remove);
