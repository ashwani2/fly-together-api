import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { auditLog } from '../../middleware/audit.js';
import { AppError } from '../../lib/errors.js';
import * as c from './documents.controller.js';

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(AppError.badRequest('Unsupported file type')),
});

// Mounted at /api/students/me/documents
export const documentsRouter = Router();
documentsRouter.post('/', upload.single('file'), auditLog('UPLOAD', 'document'), c.upload);
documentsRouter.get('/', c.list);

// Mounted at /api/documents (delete + verify live here so non-students can verify)
export const documentsTopRouter = Router();
documentsTopRouter.delete('/:id', requireAuth, requireRole('STUDENT'), auditLog('DELETE', 'document'), c.remove);
documentsTopRouter.patch('/:id/verify', requireAuth, requireRole('ADMIN', 'AGENT'), auditLog('VERIFY', 'document'), c.verify);
