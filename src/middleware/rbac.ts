import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { AppError } from '../lib/errors.js';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
}
