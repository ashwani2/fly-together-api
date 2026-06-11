import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { createLoanSchema, updateLoanStatusSchema } from './schema.js';
import * as c from './controller.js';

export const loansRouter = Router();
loansRouter.use(requireAuth);
loansRouter.post('/', requireRole('STUDENT'), validate(createLoanSchema), auditLog('CREATE', 'loan'), c.create);
loansRouter.get('/', c.list);
loansRouter.patch('/:id', requireRole('ADMIN'), validate(updateLoanStatusSchema), auditLog('UPDATE', 'loan'), c.updateStatus);
