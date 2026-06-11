import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

const sample = { name: 'Avila University', imageUrl: 'https://i', redirectionUrl: 'https://r' };

describe('partners', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lists publicly', async () => {
    const res = await request(app).get('/api/partners');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('admin can create', async () => {
    const { auth } = await createUser('ADMIN');
    const res = await request(app).post('/api/partners').set('Authorization', auth).send(sample);
    expect(res.status).toBe(201);
    expect(res.body.data.imageUrl).toBe('https://i');
  });

  it('non-admin cannot create', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).post('/api/partners').set('Authorization', auth).send(sample);
    expect(res.status).toBe(403);
  });
});
