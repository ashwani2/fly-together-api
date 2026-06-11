import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function record(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await service.record(req.user!.id, req.body.consentType, req.body.granted ?? true) }); }
  catch (e) { next(e); }
}
export async function listMine(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.listForUser(req.user!.id) }); } catch (e) { next(e); }
}
