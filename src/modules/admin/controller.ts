import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function stats(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.stats() }); } catch (e) { next(e); }
}
