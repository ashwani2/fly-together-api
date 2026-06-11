import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

const sample = {
  name: 'Royal Rahi Logistics', category: 'LOGISTICS', rating: 4.9,
  price: 'Price per KG', image: 'https://i', description: 'Shipping',
};

describe('service providers', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lists publicly', async () => {
    const res = await request(app).get('/api/service-providers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('admin can create', async () => {
    const { auth } = await createUser('ADMIN');
    const res = await request(app).post('/api/service-providers').set('Authorization', auth).send(sample);
    expect(res.status).toBe(201);
    expect(res.body.data.category).toBe('LOGISTICS');
  });

  it('filters by category', async () => {
    const { auth } = await createUser('ADMIN');
    await request(app).post('/api/service-providers').set('Authorization', auth).send(sample);
    await request(app).post('/api/service-providers').set('Authorization', auth).send({ ...sample, name: 'SkyHigh', category: 'TICKET_BOOKING' });
    const res = await request(app).get('/api/service-providers?category=LOGISTICS');
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].category).toBe('LOGISTICS');
  });

  it('non-admin cannot create', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).post('/api/service-providers').set('Authorization', auth).send(sample);
    expect(res.status).toBe(403);
  });
});
