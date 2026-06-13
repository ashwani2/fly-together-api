import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

async function setup() {
  const student = await createUser('STUDENT');
  const s = await prisma.student.findUnique({ where: { userId: student.user.id } });
  await prisma.student.update({ where: { id: s!.id }, data: { isProfileCompleted: true } });
  await prisma.studentDocument.createMany({
    data: (['PASSPORT', 'AADHAR', 'ACADEMICS', 'IELTS'] as const).map((t) => ({ studentId: s!.id, docType: t, docUrl: `key/${t}.pdf` })),
  });
  const created = await request(app).post('/api/applications').set('Authorization', student.auth)
    .send({ universityName: 'University of Manchester', course: 'MSc' });
  return { appId: created.body.data.id as string };
}

describe('application transitions', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('admin advances status and it appears in the timeline', async () => {
    const { appId } = await setup();
    const admin = await createUser('ADMIN');
    const res = await request(app).patch(`/api/applications/${appId}/status`).set('Authorization', admin.auth)
      .send({ status: 'VERIFICATION' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VERIFICATION');
    const tl = await request(app).get(`/api/applications/${appId}/timeline`).set('Authorization', admin.auth);
    expect(tl.body.data.map((t: any) => t.action)).toContain('STATUS_VERIFICATION');
  });

  it('admin sets a payment link + status', async () => {
    const { appId } = await setup();
    const admin = await createUser('ADMIN');
    const res = await request(app).patch(`/api/applications/${appId}/payment`).set('Authorization', admin.auth)
      .send({ paymentLink: 'https://flywire.example/pay/123', paymentStatus: 'COMPLETED' });
    expect(res.status).toBe(200);
    expect(res.body.data.paymentStatus).toBe('COMPLETED');
    expect(res.body.data.paymentLink).toContain('flywire');
  });

  it('a student cannot change status', async () => {
    const { appId } = await setup();
    const student = await createUser('STUDENT', 'other-s@test.com');
    const res = await request(app).patch(`/api/applications/${appId}/status`).set('Authorization', student.auth)
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(403);
  });
});
