import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function stats(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.stats() }); } catch (e) { next(e); }
}
export async function applications(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, pageSize, search, status } = req.query;
    res.json({
      data: await service.applications({
        page: page !== undefined ? Number(page) : undefined,
        pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
        search: typeof search === 'string' ? search : undefined,
        status: typeof status === 'string' ? status : undefined,
      }),
    });
  } catch (e) { next(e); }
}
export async function assignAgent(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.assignAgent(req.params.id, req.body.agentId ?? null, req.user!.id) }); }
  catch (e) { next(e); }
}
export async function studentsList(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, pageSize, search } = req.query;
    res.json({
      data: await service.students({
        page: page !== undefined ? Number(page) : undefined,
        pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
        search: typeof search === 'string' ? search : undefined,
      }),
    });
  } catch (e) { next(e); }
}
export async function studentDetail(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.studentDetail(req.params.id) }); } catch (e) { next(e); }
}
export async function studentDocumentUrl(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: { url: await service.studentDocumentUrl(req.params.id, req.params.docId) } }); }
  catch (e) { next(e); }
}
