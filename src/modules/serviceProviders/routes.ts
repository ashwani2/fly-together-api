import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { createServiceProviderSchema, updateServiceProviderSchema } from './schema.js';
import * as c from './controller.js';

export const serviceProvidersRouter = Router();
serviceProvidersRouter.get('/', c.list);
serviceProvidersRouter.get('/:id', c.get);
serviceProvidersRouter.post('/', requireAuth, requireRole('ADMIN'), validate(createServiceProviderSchema), auditLog('CREATE', 'serviceProvider'), c.create);
serviceProvidersRouter.put('/:id', requireAuth, requireRole('ADMIN'), validate(updateServiceProviderSchema), auditLog('UPDATE', 'serviceProvider'), c.update);
serviceProvidersRouter.delete('/:id', requireAuth, requireRole('ADMIN'), auditLog('DELETE', 'serviceProvider'), c.remove);
