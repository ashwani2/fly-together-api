import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

async function registerStudent() {
  return request(app).post('/api/auth/register').send({
    email: 's@test.com', password: 'Password1!', role: 'STUDENT', consent: true,
  });
}

describe('auth session', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('logs in with valid credentials', async () => {
    await registerStudent();
    const res = await request(app).post('/api/auth/login').send({ email: 's@test.com', password: 'Password1!' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('rejects bad credentials with 401', async () => {
    await registerStudent();
    const res = await request(app).post('/api/auth/login').send({ email: 's@test.com', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('refreshes tokens', async () => {
    const reg = await registerStudent();
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: reg.body.data.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('returns current user from /me', async () => {
    const reg = await registerStudent();
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('s@test.com');
  });
});
