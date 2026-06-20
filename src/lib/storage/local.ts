import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider } from './index.js';
import { signedFilePath, verifyFileSignature } from './signing.js';

export class LocalStorage implements StorageProvider {
  constructor(private baseDir: string) {}

  async put(key: string, data: Buffer, _contentType?: string): Promise<string> {
    const full = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return key;
  }

  getSignedUrl(key: string): string {
    return signedFilePath(key);
  }

  verifySignedUrl(key: string, params: URLSearchParams): boolean {
    return verifyFileSignature(key, params);
  }

  read(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.baseDir, key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(path.join(this.baseDir, key), { force: true });
  }
}
