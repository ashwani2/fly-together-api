import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { AppError } from '../../lib/errors.js';
import { createTestimonialSchema, updateTestimonialSchema } from './schema.js';
import * as c from './controller.js';

// Testimonial photos are headshots — images only, capped at 5MB so they stay
// lightweight on the homepage.
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype)
      ? cb(null, true)
      : cb(AppError.badRequest('Unsupported image type. Please use JPG, PNG or WebP.')),
});

export const testimonialsRouter = Router();
testimonialsRouter.get('/', c.list);
testimonialsRouter.post('/upload-image', requireAuth, requireRole('ADMIN'), upload.single('file'), auditLog('UPLOAD', 'testimonial'), c.uploadImage);
testimonialsRouter.get('/:id', c.get);
testimonialsRouter.post('/', requireAuth, requireRole('ADMIN'), validate(createTestimonialSchema), auditLog('CREATE', 'testimonial'), c.create);
testimonialsRouter.put('/:id', requireAuth, requireRole('ADMIN'), validate(updateTestimonialSchema), auditLog('UPDATE', 'testimonial'), c.update);
testimonialsRouter.delete('/:id', requireAuth, requireRole('ADMIN'), auditLog('DELETE', 'testimonial'), c.remove);
