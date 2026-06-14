import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.listForUser(req.user!.id) }); } catch (e) { next(e); }
}
export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.markAllRead(req.user!.id) }); } catch (e) { next(e); }
}
