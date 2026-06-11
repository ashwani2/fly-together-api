import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { createPartnerSchema, updatePartnerSchema } from './schema.js';
import * as c from './controller.js';

export const partnersRouter = Router();
partnersRouter.get('/', c.list);
partnersRouter.get('/:id', c.get);
partnersRouter.post('/', requireAuth, requireRole('ADMIN'), validate(createPartnerSchema), auditLog('CREATE', 'partner'), c.create);
partnersRouter.put('/:id', requireAuth, requireRole('ADMIN'), validate(updatePartnerSchema), auditLog('UPDATE', 'partner'), c.update);
partnersRouter.delete('/:id', requireAuth, requireRole('ADMIN'), auditLog('DELETE', 'partner'), c.remove);
