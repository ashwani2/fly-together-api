import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { createAccommodationSchema, updateAccommodationSchema } from './schema.js';
import * as c from './controller.js';

export const accommodationsRouter = Router();
accommodationsRouter.get('/', c.list);
accommodationsRouter.get('/:id', c.get);
accommodationsRouter.post('/', requireAuth, requireRole('ADMIN'), validate(createAccommodationSchema), auditLog('CREATE', 'accommodation'), c.create);
accommodationsRouter.put('/:id', requireAuth, requireRole('ADMIN'), validate(updateAccommodationSchema), auditLog('UPDATE', 'accommodation'), c.update);
accommodationsRouter.delete('/:id', requireAuth, requireRole('ADMIN'), auditLog('DELETE', 'accommodation'), c.remove);
