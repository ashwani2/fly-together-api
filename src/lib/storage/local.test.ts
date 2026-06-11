import { describe, it, expect, afterAll } from 'vitest';
import { LocalStorage } from './local.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const dir = path.join('uploads', 'test');

describe('LocalStorage', () => {
  afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('stores a file and returns a key, then a verifiable signed url', async () => {
    const storage = new LocalStorage(dir);
    const key = await storage.put('a/passport.pdf', Buffer.from('hello'), 'application/pdf');
    expect(key).toContain('passport.pdf');
    const url = storage.getSignedUrl(key);
    expect(url).toContain(encodeURIComponent(key));
    expect(storage.verifySignedUrl(key, new URL(url, 'http://x').searchParams)).toBe(true);
  });
});
