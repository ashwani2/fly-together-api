import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

describe('student profile', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('GET /api/students/me returns the profile', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).get('/api/students/me').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data.profileCompletion).toBe(0);
  });

  it('PUT /api/students/me updates fields and recomputes completion', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).put('/api/students/me').set('Authorization', auth).send({
      firstName: 'Alex', lastName: 'Johnson', dob: '2000-01-01', address: '1 High St', phoneNumber: '123',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Alex');
    expect(res.body.data.profileCompletion).toBe(100);
    expect(res.body.data.isProfileCompleted).toBe(true);
  });

  it('forbids non-students', async () => {
    const { auth } = await createUser('ADMIN');
    const res = await request(app).get('/api/students/me').set('Authorization', auth);
    expect(res.status).toBe(403);
  });
});
