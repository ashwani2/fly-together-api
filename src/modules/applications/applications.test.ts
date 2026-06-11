import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

async function seedUniversity() {
  return prisma.university.create({
    data: { name: 'Oxford', location: 'UK', logo: 'l', tuitionFee: '£1', description: 'd' },
  });
}

describe('applications', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('student creates an application with an initial timeline entry', async () => {
    const { auth } = await createUser('STUDENT');
    const uni = await seedUniversity();
    const res = await request(app).post('/api/applications').set('Authorization', auth)
      .send({ universityId: uni.id, course: 'MSc CS' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PROFILE');
    const timeline = await request(app).get(`/api/applications/${res.body.data.id}/timeline`).set('Authorization', auth);
    expect(timeline.body.data.length).toBe(1);
    expect(timeline.body.data[0].action).toBe('CREATED');
  });

  it('student sees only their own applications; admin sees all', async () => {
    const uni = await seedUniversity();
    const s1 = await createUser('STUDENT', 's1@test.com');
    const s2 = await createUser('STUDENT', 's2@test.com');
    await request(app).post('/api/applications').set('Authorization', s1.auth).send({ universityId: uni.id, course: 'A' });
    await request(app).post('/api/applications').set('Authorization', s2.auth).send({ universityId: uni.id, course: 'B' });
    const mine = await request(app).get('/api/applications').set('Authorization', s1.auth);
    expect(mine.body.data.length).toBe(1);
    const admin = await createUser('ADMIN');
    const all = await request(app).get('/api/applications').set('Authorization', admin.auth);
    expect(all.body.data.length).toBe(2);
  });
});
