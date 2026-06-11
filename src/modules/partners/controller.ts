import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function list(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.list() }); } catch (e) { next(e); }
}
export async function get(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.get(req.params.id) }); } catch (e) { next(e); }
}
export async function create(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await service.create(req.body) }); } catch (e) { next(e); }
}
export async function update(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.update(req.params.id, req.body) }); } catch (e) { next(e); }
}
export async function remove(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.remove(req.params.id) }); } catch (e) { next(e); }
}
