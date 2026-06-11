import { env } from '../../config/env.js';
import { LocalStorage } from './local.js';

export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  getSignedUrl(key: string): string;
  verifySignedUrl(key: string, params: URLSearchParams): boolean;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

let instance: StorageProvider | null = null;
export function getStorage(): StorageProvider {
  if (!instance) instance = new LocalStorage(env.UPLOAD_DIR);
  return instance;
}
