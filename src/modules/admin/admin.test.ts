import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

describe('admin + gdpr', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('returns dashboard stats for admin', async () => {
    await createUser('STUDENT', 's@test.com');
    const { auth } = await createUser('ADMIN');
    const res = await request(app).get('/api/admin/stats').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('students');
    expect(res.body.data).toHaveProperty('applications');
  });

  it('forbids non-admin from reading audit logs', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).get('/api/audit').set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('records and lists a consent for the current user', async () => {
    const { auth } = await createUser('STUDENT');
    const post = await request(app).post('/api/consent').set('Authorization', auth)
      .send({ consentType: 'MARKETING', granted: true });
    expect(post.status).toBe(201);
    const list = await request(app).get('/api/consent/me').set('Authorization', auth);
    expect(list.body.data.some((cn: any) => cn.consentType === 'MARKETING')).toBe(true);
  });
});
