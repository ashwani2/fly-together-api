import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function stats(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.stats() }); } catch (e) { next(e); }
}
export async function applications(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.applications() }); } catch (e) { next(e); }
}
export async function assignAgent(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.assignAgent(req.params.id, req.body.agentId ?? null, req.user!.id) }); }
  catch (e) { next(e); }
}
export async function studentsList(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.students() }); } catch (e) { next(e); }
}
export async function studentDetail(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.studentDetail(req.params.id) }); } catch (e) { next(e); }
}
export async function studentDocumentUrl(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: { url: await service.studentDocumentUrl(req.params.id, req.params.docId) } }); }
  catch (e) { next(e); }
}
