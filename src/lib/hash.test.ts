import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './hash.js';

describe('hash', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('Password1!');
    expect(hash).not.toBe('Password1!');
    expect(await verifyPassword('Password1!', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
