import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

const sample = { amount: '500000', details: { purpose: 'tuition' } };

describe('loans', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('student can create a loan application', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).post('/api/loans').set('Authorization', auth).send(sample);
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe('500000');
  });

  it('student sees only their own loans', async () => {
    const s1 = await createUser('STUDENT', 's1@test.com');
    const s2 = await createUser('STUDENT', 's2@test.com');
    await request(app).post('/api/loans').set('Authorization', s1.auth).send(sample);
    await request(app).post('/api/loans').set('Authorization', s2.auth).send(sample);
    const res = await request(app).get('/api/loans').set('Authorization', s1.auth);
    expect(res.body.data.length).toBe(1);
  });

  it('admin sees all loans', async () => {
    const s1 = await createUser('STUDENT', 's1@test.com');
    await request(app).post('/api/loans').set('Authorization', s1.auth).send(sample);
    const admin = await createUser('ADMIN');
    const res = await request(app).get('/api/loans').set('Authorization', admin.auth);
    expect(res.body.data.length).toBe(1);
  });

  it('admin can update status; student cannot', async () => {
    const s1 = await createUser('STUDENT', 's1@test.com');
    const created = await request(app).post('/api/loans').set('Authorization', s1.auth).send(sample);
    const id = created.body.data.id;
    const admin = await createUser('ADMIN');
    const ok = await request(app).patch(`/api/loans/${id}`).set('Authorization', admin.auth).send({ status: 'APPROVED' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('APPROVED');
    const forbidden = await request(app).patch(`/api/loans/${id}`).set('Authorization', s1.auth).send({ status: 'APPROVED' });
    expect(forbidden.status).toBe(403);
  });
});
