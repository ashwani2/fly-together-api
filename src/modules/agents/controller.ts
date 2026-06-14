import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function list(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.listAgents() }); } catch (e) { next(e); }
}
export async function create(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await service.createAgent(req.body) }); } catch (e) { next(e); }
}
export async function remove(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.deleteAgent(req.params.id) }); } catch (e) { next(e); }
}
export async function myStudents(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.assignedStudents(req.user!.id) }); } catch (e) { next(e); }
}
export async function verifyStudent(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.verifyStudent(req.params.id) }); } catch (e) { next(e); }
}
export async function myApplications(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.assignedApplications(req.user!.id) }); } catch (e) { next(e); }
}
export async function studentDocumentUrl(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: { url: await service.studentDocumentUrl(req.user!.id, req.params.studentId, req.params.docId) } });
  } catch (e) { next(e); }
}
export async function verifyDocument(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.verifyDocument(req.user!.id, req.params.id, req.body.status) }); }
  catch (e) { next(e); }
}
