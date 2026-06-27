import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function create(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await service.create(req.body) }); } catch (e) { next(e); }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, pageSize, search } = req.query;
    res.json({
      data: await service.list({
        page: page !== undefined ? Number(page) : undefined,
        pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
        search: typeof search === 'string' ? search : undefined,
      }),
    });
  } catch (e) { next(e); }
}
