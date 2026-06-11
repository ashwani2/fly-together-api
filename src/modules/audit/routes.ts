import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { prisma } from '../../lib/prisma.js';

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole('ADMIN'));
auditRouter.get('/', async (_req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ data: logs });
  } catch (e) { next(e); }
});
