import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { AppError } from '../lib/errors.js';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized('Missing bearer token'));
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired token'));
  }
}
