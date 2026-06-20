import { env } from '../../config/env.js';
import { LocalStorage } from './local.js';
import { CloudinaryStorage } from './cloudinary.js';

export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  getSignedUrl(key: string): string;
  verifySignedUrl(key: string, params: URLSearchParams): boolean;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

let instance: StorageProvider | null = null;
export function getStorage(): StorageProvider {
  if (instance) return instance;

  // Driver chosen by STORAGE_DRIVER: 'cloudinary' for UAT, 'local' for dev.
  // ('s3' currently falls back to local disk — no S3 driver yet.)
  instance =
    env.STORAGE_DRIVER === 'cloudinary'
      ? new CloudinaryStorage()
      : new LocalStorage(env.UPLOAD_DIR);
  return instance;
}
