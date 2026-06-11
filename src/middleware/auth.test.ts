import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requireAuth } from './auth.js';
import { errorHandler } from './error.js';
import { signAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

function testApp() {
  const app = express();
  app.get('/me', requireAuth, (req, res) => res.json({ data: req.user }));
  app.use(errorHandler);
  return app;
}

describe('requireAuth', () => {
  afterAll(async () => { await prisma.$disconnect(); });

  it('rejects requests with no token', async () => {
    const res = await request(testApp()).get('/me');
    expect(res.status).toBe(401);
  });

  it('accepts a valid token and attaches req.user', async () => {
    const token = signAccessToken({ sub: 'user-1', role: 'STUDENT' });
    const res = await request(testApp()).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'user-1', role: 'STUDENT' });
  });
});
