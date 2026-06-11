import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

const sample = {
  name: 'Student Comforts', city: 'London', price: 'From £120/week', type: 'Studio',
  amenities: ['WiFi'], image: 'https://i', description: 'Premium housing',
};

describe('accommodations', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lists accommodations publicly', async () => {
    const res = await request(app).get('/api/accommodations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('admin can create', async () => {
    const { auth } = await createUser('ADMIN');
    const res = await request(app).post('/api/accommodations').set('Authorization', auth).send(sample);
    expect(res.status).toBe(201);
    expect(res.body.data.city).toBe('London');
  });

  it('filters by city', async () => {
    const { auth } = await createUser('ADMIN');
    await request(app).post('/api/accommodations').set('Authorization', auth).send(sample);
    await request(app).post('/api/accommodations').set('Authorization', auth).send({ ...sample, name: 'Oxford Lodge', city: 'Oxford' });
    const res = await request(app).get('/api/accommodations?city=London');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].city).toBe('London');
  });

  it('non-admin cannot create', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).post('/api/accommodations').set('Authorization', auth).send(sample);
    expect(res.status).toBe(403);
  });
});
