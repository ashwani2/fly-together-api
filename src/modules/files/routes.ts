import { Router } from 'express';
import { getStorage } from '../../lib/storage/index.js';
import { AppError } from '../../lib/errors.js';

export const filesRouter = Router();

// GET /api/files/:key?expires=..&sig=..  (signed, no JWT needed)
filesRouter.get('/:key', async (req, res, next) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const storage = getStorage();
    const params = new URLSearchParams(req.query as Record<string, string>);
    if (!storage.verifySignedUrl(key, params)) throw AppError.forbidden('Invalid or expired link');
    const data = await storage.read(key);
    res.send(data);
  } catch (e) { next(e); }
});
