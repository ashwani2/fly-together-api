import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

describe('POST /api/auth/register', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('creates a student user + student row + consent and returns tokens', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'new@test.com', password: 'Password1!', role: 'STUDENT', consent: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe('new@test.com');
    const student = await prisma.student.findFirst();
    expect(student).toBeTruthy();
    const consent = await prisma.consent.findFirst();
    expect(consent?.granted).toBe(true);
  });

  it('rejects duplicate email with 409', async () => {
    const body = { email: 'dup@test.com', password: 'Password1!', role: 'STUDENT', consent: true };
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(409);
  });

  it('rejects registration without consent', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'x@test.com', password: 'Password1!', role: 'STUDENT', consent: false,
    });
    expect(res.status).toBe(400);
  });
});
