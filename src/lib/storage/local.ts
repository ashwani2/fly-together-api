import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import type { StorageProvider } from './index.js';

export class LocalStorage implements StorageProvider {
  constructor(private baseDir: string) {}

  async put(key: string, data: Buffer): Promise<string> {
    const full = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return key;
  }

  private sign(key: string, expires: number): string {
    return crypto.createHmac('sha256', env.SIGNED_URL_SECRET).update(`${key}:${expires}`).digest('hex');
  }

  getSignedUrl(key: string): string {
    const expires = Math.floor(Date.now() / 1000) + env.SIGNED_URL_TTL_SECONDS;
    const sig = this.sign(key, expires);
    return `/api/files/${encodeURIComponent(key)}?expires=${expires}&sig=${sig}`;
  }

  verifySignedUrl(key: string, params: URLSearchParams): boolean {
    const expires = Number(params.get('expires'));
    const sig = params.get('sig');
    if (!expires || !sig || expires < Math.floor(Date.now() / 1000)) return false;
    const expected = this.sign(key, expires);
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  read(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.baseDir, key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(path.join(this.baseDir, key), { force: true });
  }
}
