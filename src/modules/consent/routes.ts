import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import * as c from './controller.js';

const recordSchema = z.object({ body: z.object({ consentType: z.string().min(1), granted: z.boolean().default(true) }) });

export const consentRouter = Router();
consentRouter.use(requireAuth);
consentRouter.post('/', validate(recordSchema), auditLog('CONSENT', 'consent'), c.record);
consentRouter.get('/me', c.listMine);
