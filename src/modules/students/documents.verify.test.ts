import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

async function uploadAsStudent() {
  const { auth } = await createUser('STUDENT', 'docstud@test.com');
  const up = await request(app).post('/api/students/me/documents').set('Authorization', auth)
    .field('docType', 'ACADEMICS')
    .attach('file', Buffer.from('%PDF fake'), { filename: 'a.pdf', contentType: 'application/pdf' });
  return up.body.data.id as string;
}

describe('document verification', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lets an admin set status to VERIFIED', async () => {
    const docId = await uploadAsStudent();
    const { auth } = await createUser('ADMIN');
    const res = await request(app).patch(`/api/documents/${docId}/verify`).set('Authorization', auth).send({ status: 'VERIFIED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VERIFIED');
  });

  it('forbids a student from verifying', async () => {
    const docId = await uploadAsStudent();
    const { auth } = await createUser('STUDENT', 'other@test.com');
    const res = await request(app).patch(`/api/documents/${docId}/verify`).set('Authorization', auth).send({ status: 'VERIFIED' });
    expect(res.status).toBe(403);
  });
});
