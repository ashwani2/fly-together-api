import type { Request } from 'express';

/**
 * Turn a storage signed path into an absolute URL the browser can fetch.
 *
 * The `local` driver returns a relative path ("/api/files/...") which we prefix
 * with this server's origin. Remote drivers (Cloudinary, S3, ...) already return
 * an absolute "https://..." URL, so those are passed through untouched —
 * prefixing them would produce "http://host" + "https://..." and break the URL.
 */
export function absoluteFileUrl(req: Request, path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${req.protocol}://${req.get('host')}${path}`;
}
