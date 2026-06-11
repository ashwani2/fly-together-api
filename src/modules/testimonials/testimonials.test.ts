import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

const sample = {
  studentName: 'Aarav Sharma', universityName: 'University of Oxford',
  content: 'Seamless journey', mediaUrl: 'https://i', mediaType: 'IMAGE',
};

describe('testimonials', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lists publicly', async () => {
    const res = await request(app).get('/api/testimonials');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('admin can create', async () => {
    const { auth } = await createUser('ADMIN');
    const res = await request(app).post('/api/testimonials').set('Authorization', auth).send(sample);
    expect(res.status).toBe(201);
    expect(res.body.data.mediaType).toBe('IMAGE');
  });

  it('non-admin cannot create', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).post('/api/testimonials').set('Authorization', auth).send(sample);
    expect(res.status).toBe(403);
  });
});
