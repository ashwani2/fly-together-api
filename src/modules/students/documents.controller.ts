import type { Request, Response, NextFunction } from 'express';
import type { DocType, DocStatus, AcademicSubType } from '@prisma/client';
import * as service from './documents.service.js';
import { AppError } from '../../lib/errors.js';

const VALID: DocType[] = ['PASSPORT', 'AADHAR', 'ACADEMICS', 'IELTS'];
const VALID_SUBTYPES: AcademicSubType[] = ['TENTH', 'TWELFTH', 'GRADUATION', 'OTHER'];
const VALID_STATUS: DocStatus[] = ['UPLOADED', 'PENDING', 'VERIFIED', 'REJECTED'];

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw AppError.badRequest('file is required');
    const docType = req.body.docType as DocType;
    if (!VALID.includes(docType)) throw AppError.badRequest('Invalid docType');

    // Academic certificates carry a subtype (10th / 12th / graduation / others).
    let subType: AcademicSubType | undefined;
    if (docType === 'ACADEMICS') {
      const raw = req.body.subType as string | undefined;
      if (!raw || !VALID_SUBTYPES.includes(raw as AcademicSubType)) {
        throw AppError.badRequest('Academic documents require a valid subType (TENTH, TWELFTH, GRADUATION, OTHER).');
      }
      subType = raw as AcademicSubType;
    }

    res.status(201).json({ data: await service.upload(req.user!.id, docType, req.file, subType) });
  } catch (e) { next(e); }
}
export async function list(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.list(req.user!.id) }); }
  catch (e) { next(e); }
}
export async function viewUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const path = await service.viewUrl(req.user!.id, req.params.id);
    res.json({ data: { url: `${req.protocol}://${req.get('host')}${path}` } });
  } catch (e) { next(e); }
}
export async function remove(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.softDelete(req.user!.id, req.params.id) }); }
  catch (e) { next(e); }
}
export async function verify(req: Request, res: Response, next: NextFunction) {
  try {
    const status = req.body.status as DocStatus;
    if (!VALID_STATUS.includes(status)) throw AppError.badRequest('Invalid status');
    res.json({ data: await service.verify(req.params.id, status) });
  } catch (e) { next(e); }
}
