import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { createTestimonialSchema, updateTestimonialSchema } from './schema.js';
import * as c from './controller.js';

export const testimonialsRouter = Router();
testimonialsRouter.get('/', c.list);
testimonialsRouter.get('/:id', c.get);
testimonialsRouter.post('/', requireAuth, requireRole('ADMIN'), validate(createTestimonialSchema), auditLog('CREATE', 'testimonial'), c.create);
testimonialsRouter.put('/:id', requireAuth, requireRole('ADMIN'), validate(updateTestimonialSchema), auditLog('UPDATE', 'testimonial'), c.update);
testimonialsRouter.delete('/:id', requireAuth, requireRole('ADMIN'), auditLog('DELETE', 'testimonial'), c.remove);
