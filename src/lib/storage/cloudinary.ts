import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import type { StorageProvider } from './index.js';
import { signedFilePath, verifyFileSignature } from './signing.js';

/**
 * Cloudinary-backed storage (used in UAT via STORAGE_DRIVER=cloudinary).
 *
 * Files are uploaded as `authenticated` assets (private). `getSignedUrl` returns
 * our OWN `/api/files/...` path, not the Cloudinary URL: the `/api/files` route
 * calls `read()`, which fetches the bytes from Cloudinary server-side and streams
 * them. So clients never see a Cloudinary URL and the asset stays private.
 *
 * Note: documents are images or PDFs, both handled by Cloudinary's `image`
 * resource type. PDFs additionally require "Allow delivery of PDF and ZIP files"
 * to be enabled in the Cloudinary console (Settings → Security).
 */
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'tiff', 'pdf'];
const UPLOAD_TIMEOUT_MS = 60_000;

function resourceType(key: string): 'image' | 'raw' {
  const ext = key.split('.').pop()?.toLowerCase();
  return ext && IMAGE_EXTS.includes(ext) ? 'image' : 'raw';
}

/**
 * Cloudinary public_id from a storage key. For images Cloudinary strips the
 * format extension on upload, so the public_id must be addressed without it
 * (raw assets keep it). Whitespace is collapsed — spaces break signed URLs.
 * Deterministic, so put/getSignedUrl/delete stay in sync.
 */
function publicId(key: string): string {
  const base = resourceType(key) === 'image' ? key.replace(/\.[^/.]+$/, '') : key;
  return base.replace(/\s+/g, '_');
}

export class CloudinaryStorage implements StorageProvider {
  constructor() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  put(key: string, data: Buffer, _contentType?: string): Promise<string> {
    if (!data || data.length === 0) {
      return Promise.reject(AppError.badRequest('Cannot upload an empty file.'));
    }
    // Stream the raw bytes (no base64 inflation → smaller, faster payload than a
    // data URI). Handles both the upload callback and stream errors, with a hard
    // timeout backstop so a stalled upload can never hang the request.
    return new Promise<string>((resolve, reject) => {
      const fail = (err: any) => {
        const reason = err?.message || err?.error?.message;
        console.error('[cloudinary] upload failed:', { key, http_code: err?.http_code, message: reason });
        reject(
          err instanceof AppError
            ? err
            : new AppError(502, 'UPSTREAM_ERROR', reason ? `File upload failed: ${reason}` : 'File upload failed. Please try again.'),
        );
      };
      const timer = setTimeout(
        () => fail(new AppError(504, 'UPSTREAM_TIMEOUT', 'File upload timed out. Please try again.')),
        UPLOAD_TIMEOUT_MS + 5_000,
      );
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId(key),
          resource_type: resourceType(key),
          type: 'authenticated',
          overwrite: true,
          use_filename: false,
          unique_filename: false,
          timeout: UPLOAD_TIMEOUT_MS,
        },
        (err, result) => {
          clearTimeout(timer);
          if (err || !result) fail(err);
          else resolve(key);
        },
      );
      stream.on('error', (e) => {
        clearTimeout(timer);
        fail(e);
      });
      stream.end(data);
    });
  }

  getSignedUrl(key: string): string {
    // Return OUR backend path — the Cloudinary URL is never sent to the client.
    return signedFilePath(key);
  }

  verifySignedUrl(key: string, params: URLSearchParams): boolean {
    return verifyFileSignature(key, params);
  }

  /** Signed Cloudinary delivery URL — used server-side only, to fetch bytes. */
  private cloudinaryUrl(key: string): string {
    return cloudinary.url(publicId(key), {
      resource_type: resourceType(key),
      type: 'authenticated',
      secure: true,
      sign_url: true,
    });
  }

  async read(key: string): Promise<Buffer> {
    let res: Response;
    try {
      res = await fetch(this.cloudinaryUrl(key), { signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new AppError(502, 'UPSTREAM_ERROR', 'Could not reach the file storage provider.');
    }
    if (!res.ok) throw AppError.notFound('File not found');
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId(key), { resource_type: resourceType(key), type: 'authenticated' });
  }
}
