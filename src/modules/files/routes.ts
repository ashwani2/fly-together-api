import { Router } from 'express';
import { getStorage } from '../../lib/storage/index.js';
import { AppError } from '../../lib/errors.js';

export const filesRouter = Router();

// GET /api/files/:key?expires=..&sig=..  (signed, no JWT needed)
filesRouter.get('/:key', async (req, res, next) => {
  try {
    let key: string;
    try {
      key = Buffer.from(req.params.key, 'base64url').toString('utf8');
    } catch {
      throw AppError.forbidden('Invalid link');
    }
    const storage = getStorage();
    const params = new URLSearchParams(req.query as Record<string, string>);
    if (!storage.verifySignedUrl(key, params)) throw AppError.forbidden('Invalid or expired link');
    const data = await storage.read(key);
    const ext = key.split('.').pop()?.toLowerCase();
    const mime =
      ext === 'pdf' ? 'application/pdf' :
      ext === 'png' ? 'image/png' :
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline');
    // Allow the file to be embedded/fetched from the frontend origin.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.send(data);
  } catch (e) { next(e); }
});
