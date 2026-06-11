import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { createBlogSchema, updateBlogSchema } from './schema.js';
import * as c from './controller.js';

export const blogsRouter = Router();
blogsRouter.get('/', c.list);
blogsRouter.get('/slug/:slug', c.getBySlug);
blogsRouter.get('/:id', c.get);
blogsRouter.post('/', requireAuth, requireRole('ADMIN'), validate(createBlogSchema), auditLog('CREATE', 'blog'), c.create);
blogsRouter.put('/:id', requireAuth, requireRole('ADMIN'), validate(updateBlogSchema), auditLog('UPDATE', 'blog'), c.update);
blogsRouter.delete('/:id', requireAuth, requireRole('ADMIN'), auditLog('DELETE', 'blog'), c.remove);
