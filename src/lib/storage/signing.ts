import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Backend-signed file URLs. Every storage driver returns one of these from
 * `getSignedUrl`, so the client only ever sees our own origin — the underlying
 * location (local disk, Cloudinary, ...) is never exposed. The `/api/files`
 * route verifies the signature and streams the bytes.
 *
 * Two flavours:
 *   • TTL (`signedFilePath`)        — short-lived, generated on demand.
 *   • Permanent (`storedFileUrl`)   — a stable full URL we persist in the DB as
 *     a document's `docUrl`. No expiry (a stored URL can't expire), but still
 *     HMAC-signed so it can't be guessed/forged.
 */
function hmac(data: string): string {
  return crypto.createHmac('sha256', env.SIGNED_URL_SECRET).update(data).digest('hex');
}

const encodeKey = (key: string) => Buffer.from(key, 'utf8').toString('base64url');
const decodeKey = (enc: string) => Buffer.from(enc, 'base64url').toString('utf8');

// ── TTL (short-lived) ───────────────────────────────────────────────────────
export function signedFilePath(key: string): string {
  const expires = Math.floor(Date.now() / 1000) + env.SIGNED_URL_TTL_SECONDS;
  const sig = hmac(`${key}:${expires}`);
  return `/api/files/${encodeKey(key)}?expires=${expires}&sig=${sig}`;
}

// ── Permanent (persisted as docUrl) ─────────────────────────────────────────
function permanentFilePath(key: string): string {
  return `/api/files/${encodeKey(key)}?sig=${hmac(key)}`;
}

/** Full backend URL to persist in the DB (base from BACKEND_URL — per env). */
export function storedFileUrl(key: string): string {
  return `${env.BACKEND_URL.replace(/\/$/, '')}${permanentFilePath(key)}`;
}

/** Accepts a stored full URL (returned as-is) or a legacy bare key (→ full URL). */
export function resolveStoredFileUrl(docUrl: string): string {
  return /^https?:\/\//i.test(docUrl) ? docUrl : storedFileUrl(docUrl);
}

/** Extract the storage key from a stored file URL (for read/delete). */
export function keyFromFileUrl(url: string): string {
  const seg = new URL(url, 'http://x').pathname.split('/').pop() ?? '';
  return decodeKey(seg);
}

// ── Verification (used by the /api/files route) ─────────────────────────────
export function verifyFileSignature(key: string, params: URLSearchParams): boolean {
  const sig = params.get('sig');
  if (!sig) return false;

  const expiresRaw = params.get('expires');
  if (expiresRaw) {
    // TTL URL — must not be expired.
    const expires = Number(expiresRaw);
    if (!expires || expires < Math.floor(Date.now() / 1000)) return false;
    return safeEqual(sig, hmac(`${key}:${expires}`));
  }
  // Permanent URL.
  return safeEqual(sig, hmac(key));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
