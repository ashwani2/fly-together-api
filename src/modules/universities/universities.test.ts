import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

const sample = {
  name: 'University of Oxford', location: 'Oxford, UK', logo: 'https://logo/ox',
  rating: 4.9, tuitionFee: '£28,000 - £45,000',
  description: 'The oldest university in the English-speaking world.',
  courses: ['Computer Science', 'Philosophy'],
};

describe('universities', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lists universities publicly', async () => {
    const res = await request(app).get('/api/universities');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('admin can create; response includes courses[]', async () => {
    const { auth } = await createUser('ADMIN');
    const res = await request(app).post('/api/universities').set('Authorization', auth).send(sample);
    expect(res.status).toBe(201);
    expect(res.body.data.courses).toEqual(['Computer Science', 'Philosophy']);
  });

  it('non-admin cannot create', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).post('/api/universities').set('Authorization', auth).send(sample);
    expect(res.status).toBe(403);
  });

  it('admin can update and delete', async () => {
    const { auth } = await createUser('ADMIN');
    const created = await request(app).post('/api/universities').set('Authorization', auth).send(sample);
    const id = created.body.data.id;
    const upd = await request(app).put(`/api/universities/${id}`).set('Authorization', auth).send({ ...sample, rating: 4.5 });
    expect(upd.body.data.rating).toBe(4.5);
    const del = await request(app).delete(`/api/universities/${id}`).set('Authorization', auth);
    expect(del.status).toBe(200);
    const after = await request(app).get(`/api/universities/${id}`);
    expect(after.status).toBe(404);
  });
});
