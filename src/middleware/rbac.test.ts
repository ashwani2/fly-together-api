import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requireRole } from './rbac.js';
import { requireAuth } from './auth.js';
import { errorHandler } from './error.js';
import { signAccessToken } from '../lib/jwt.js';

function adminApp() {
  const app = express();
  app.get('/admin', requireAuth, requireRole('ADMIN'), (_req, res) => res.json({ data: 'ok' }));
  app.use(errorHandler);
  return app;
}

describe('requireRole', () => {
  it('forbids the wrong role', async () => {
    const token = signAccessToken({ sub: 'u1', role: 'STUDENT' });
    const res = await request(adminApp()).get('/admin').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
  it('allows the right role', async () => {
    const token = signAccessToken({ sub: 'u1', role: 'ADMIN' });
    const res = await request(adminApp()).get('/admin').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
