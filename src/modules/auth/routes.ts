import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { registerSchema, loginSchema, refreshSchema } from './schema.js';
import * as c from './controller.js';

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
export const authRouter = Router();

authRouter.post('/register', limiter, validate(registerSchema), c.register);
authRouter.post('/login', limiter, validate(loginSchema), c.login);
authRouter.post('/refresh', validate(refreshSchema), c.refresh);
authRouter.post('/logout', c.logout);
authRouter.get('/me', requireAuth, c.me);
