import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function create(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await service.create(req.user!.id, req.body) }); } catch (e) { next(e); }
}
export async function list(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.list(req.user!.id, req.user!.role) }); } catch (e) { next(e); }
}
export async function get(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.get(req.params.id) }); } catch (e) { next(e); }
}
export async function timeline(req: Request, res: Response, next: NextFunction) {
  try {
    const entries = await service.timeline(req.params.id);
    // Students must not see who took each action — strip the actor.
    const data = req.user!.role === 'STUDENT'
      ? entries.map(({ actionTakenBy, ...rest }) => rest)
      : entries;
    res.json({ data });
  } catch (e) { next(e); }
}
export async function setStatus(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.setStatus(req.params.id, { id: req.user!.id, role: req.user!.role }, req.body.status, req.body.rejectionReason) }); }
  catch (e) { next(e); }
}
export async function setPayment(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.setPayment(req.params.id, { id: req.user!.id, role: req.user!.role }, req.body.paymentStatus, req.body.paymentLink) }); }
  catch (e) { next(e); }
}
