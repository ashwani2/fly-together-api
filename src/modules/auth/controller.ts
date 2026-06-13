import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';
import { verifyRefreshToken } from '../../lib/jwt.js';
import { AppError } from '../../lib/errors.js';

export async function register(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await service.register(req.body) }); }
  catch (e) { next(e); }
}
export async function login(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.login(req.body.email, req.body.password) }); }
  catch (e) { next(e); }
}
export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = verifyRefreshToken(req.body.refreshToken);
    res.json({ data: service.rotateTokens(payload) });
  } catch { next(AppError.unauthorized('Invalid refresh token')); }
}
export async function logout(_req: Request, res: Response) {
  res.json({ data: { success: true } });
}
export async function me(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.me(req.user!.id) }); }
  catch (e) { next(e); }
}
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.forgotPassword(req.body.email) }); }
  catch (e) { next(e); }
}
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.resetPassword(req.body.token, req.body.password) }); }
  catch (e) { next(e); }
}
