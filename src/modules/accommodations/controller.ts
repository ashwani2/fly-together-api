import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';
import { searchInventories } from './amber.js';

// ── Partner (Amber) inventory search ────────────────────────────────────────────

export async function explore(req: Request, res: Response, next: NextFunction) {
  try {
    const pageRaw = Number((req.query.page as string) ?? '1');
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    res.json({ data: await searchInventories({ page, q }) });
  } catch (e) { next(e); }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { city, type, maxPrice } = req.query as Record<string, string>;
    res.json({ data: await service.list({ city, type, maxPrice }) });
  } catch (e) { next(e); }
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

// ── Bookings ──────────────────────────────────────────────────────────────────

export async function createBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const booking = await service.createBooking(req.user!.id, req.params.id, req.body);
    res.status(201).json({ data: booking });
  } catch (e) { next(e); }
}

export async function myBookings(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.myBookings(req.user!.id) }); } catch (e) { next(e); }
}

export async function listBookings(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.listBookings() }); } catch (e) { next(e); }
}

export async function updateBookingStatus(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await service.updateBookingStatus(req.params.bookingId, req.body.status) });
  } catch (e) { next(e); }
}
