import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function create(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await service.create(req.user!.id, req.body) }); } catch (e) { next(e); }
}
export async function list(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.listForUser(req.user!.id, req.user!.role) }); } catch (e) { next(e); }
}
export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.updateStatus(req.params.id, req.body.status) }); } catch (e) { next(e); }
}
