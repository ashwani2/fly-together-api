import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

describe('sop leads', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('captures a lead from the public generator without auth', async () => {
    const res = await request(app).post('/api/sop-leads').send({
      fullName: 'Ravi Sharma',
      country: 'United Kingdom',
      university: 'University of Hull',
      course: 'MSc Computer Science',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ fullName: 'Ravi Sharma', university: 'University of Hull' });

    const count = await prisma.sopLead.count();
    expect(count).toBe(1);
  });

  it('rejects a capture missing required fields', async () => {
    const res = await request(app).post('/api/sop-leads').send({ fullName: 'No Course' });
    expect(res.status).toBe(400);
  });

  it('lists leads paginated for admin, newest first', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/sop-leads').send({
        fullName: `Lead ${i}`,
        university: 'Uni',
        course: `Course ${i}`,
      });
    }
    const { auth } = await createUser('ADMIN');
    const res = await request(app)
      .get('/api/sop-leads?page=1&pageSize=2')
      .set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 3, page: 1, pageSize: 2, totalPages: 2 });
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0].fullName).toBe('Lead 2'); // newest first
  });

  it('supports server-side search', async () => {
    await request(app).post('/api/sop-leads').send({ fullName: 'Alice', university: 'Oxford', course: 'Law' });
    await request(app).post('/api/sop-leads').send({ fullName: 'Bob', university: 'Cambridge', course: 'Physics' });
    const { auth } = await createUser('ADMIN');

    const res = await request(app).get('/api/sop-leads?search=oxford').set('Authorization', auth);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].fullName).toBe('Alice');
  });

  it('forbids non-admins from listing leads', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).get('/api/sop-leads').set('Authorization', auth);
    expect(res.status).toBe(403);
  });
});
