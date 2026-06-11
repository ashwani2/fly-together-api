import { describe, it, expect } from 'vitest';
import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from './jwt.js';

describe('jwt', () => {
  it('signs and verifies an access token', () => {
    const token = signAccessToken({ sub: 'u1', role: 'STUDENT' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.role).toBe('STUDENT');
  });

  it('rejects an access token verified as refresh', () => {
    const token = signAccessToken({ sub: 'u1', role: 'STUDENT' });
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  it('signs and verifies a refresh token', () => {
    const token = signRefreshToken({ sub: 'u1', role: 'ADMIN' });
    expect(verifyRefreshToken(token).sub).toBe('u1');
  });
});
