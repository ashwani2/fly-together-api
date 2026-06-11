import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.getProfile(req.user!.id) }); }
  catch (e) { next(e); }
}
export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.updateProfile(req.user!.id, req.body) }); }
  catch (e) { next(e); }
}
