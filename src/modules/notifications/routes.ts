import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as c from './controller.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
notificationsRouter.get('/', c.list);
notificationsRouter.patch('/read-all', c.markAllRead);
