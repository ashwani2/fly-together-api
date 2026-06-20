import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { AppError } from '../../lib/errors.js';
import { createLoanSchema, updateLoanStatusSchema, updateDocumentStatusSchema } from './schema.js';
import * as c from './controller.js';

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(AppError.badRequest('Unsupported file type')),
});

export const loansRouter = Router();
loansRouter.use(requireAuth);
loansRouter.post('/', requireRole('STUDENT'), validate(createLoanSchema), auditLog('CREATE', 'loan'), c.create);
loansRouter.post('/documents', requireRole('STUDENT'), upload.single('file'), auditLog('UPLOAD', 'loan_document'), c.uploadDocument);
loansRouter.post('/documents/url', c.documentViewUrl);
loansRouter.get('/', c.list);
loansRouter.get('/:id', c.getById);
loansRouter.get('/:id/timeline', c.getTimeline);
loansRouter.patch('/:id', requireRole('ADMIN', 'AGENT'), validate(updateLoanStatusSchema), auditLog('UPDATE', 'loan'), c.updateStatus);
loansRouter.post('/:id/resume', requireRole('STUDENT'), auditLog('RESUME', 'loan'), c.resumeApplication);
loansRouter.patch('/:id/documents/:docKey', requireRole('ADMIN', 'AGENT'), validate(updateDocumentStatusSchema), auditLog('UPDATE', 'loan_document'), c.updateDocumentStatus);
