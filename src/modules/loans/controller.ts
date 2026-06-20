import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

export async function create(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await service.create(req.user!.id, req.body) }); } catch (e) { next(e); }
}

export async function uploadDocument(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw AppError.badRequest('file is required');
    const docKey = (req.body.docKey as string | undefined)?.trim();
    if (!docKey) throw AppError.badRequest('docKey is required');
    const result = await service.uploadDocument(req.user!.id, req.file, docKey);
    res.status(201).json({ data: result });
  } catch (e) { next(e); }
}

export async function documentViewUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const storageKey = (req.body.key as string | undefined)?.trim();
    if (!storageKey) throw AppError.badRequest('key is required');
    const signedPath = await service.documentViewUrl(req.user!.id, req.user!.role, storageKey);
    res.json({ data: { url: `${req.protocol}://${req.get('host')}${signedPath}` } });
  } catch (e) { next(e); }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.listForUser(req.user!.id, req.user!.role) }); } catch (e) { next(e); }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.get(req.params.id, req.user!.id, req.user!.role) }); } catch (e) { next(e); }
}

export async function getTimeline(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.getTimeline(req.params.id, req.user!.id, req.user!.role) }); } catch (e) { next(e); }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await service.updateStatus(req.params.id, req.user!.id, req.body.status, req.body.documentRequest, req.body.reason) });
  } catch (e) { next(e); }
}

export async function resumeApplication(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.resumeApplication(req.params.id, req.user!.id) }); } catch (e) { next(e); }
}

export async function updateDocumentStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const status = (req.body.status as string | undefined)?.trim();
    if (!status) throw AppError.badRequest('status is required');
    res.json({ data: await service.updateDocumentStatus(req.params.id, req.user!.id, req.user!.role, req.params.docKey, status) });
  } catch (e) { next(e); }
}
