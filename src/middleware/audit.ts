import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

export function auditLog(action: string, entity: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      prisma.auditLog
        .create({
          data: {
            action,
            entity,
            entityId: req.params.id ?? null,
            userId: req.user?.id ?? null,
            ip: req.ip ?? null,
            metadata: { method: req.method, path: req.originalUrl },
          },
        })
        .catch((e) => console.error('audit write failed', e));
    });
    next();
  };
}
