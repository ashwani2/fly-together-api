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
  return { appId: created.body.data.id as string, studentAuth: student.auth, studentId: s!.id };
}

describe('application transitions', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('admin advances status and it appears in the timeline', async () => {
    const { appId } = await setup();
    const admin = await createUser('ADMIN');
    const res = await request(app).patch(`/api/applications/${appId}/status`).set('Authorization', admin.auth)
      .send({ status: 'DOCUMENT_VERIFIED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DOCUMENT_VERIFIED');
    const tl = await request(app).get(`/api/applications/${appId}/timeline`).set('Authorization', admin.auth);
    expect(tl.body.data.map((t: any) => t.action)).toContain('STATUS_DOCUMENT_VERIFIED');
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

  it('hides agent (un)assignment events from the student timeline but keeps them for admin', async () => {
    const { appId, studentAuth } = await setup();
    const agentUser = await createUser('AGENT', 'agent-for-tl@test.com');
    const agent = await prisma.agent.findUnique({ where: { userId: agentUser.user.id } });
    const admin = await createUser('ADMIN');

    const assign = await request(app).patch(`/api/admin/applications/${appId}/assign-agent`)
      .set('Authorization', admin.auth).send({ agentId: agent!.id });
    expect(assign.status).toBe(200);

    const adminTl = await request(app).get(`/api/applications/${appId}/timeline`).set('Authorization', admin.auth);
    expect(adminTl.body.data.map((t: any) => t.action)).toContain('AGENT_ASSIGNED');

    const studentTl = await request(app).get(`/api/applications/${appId}/timeline`).set('Authorization', studentAuth);
    expect(studentTl.body.data.map((t: any) => t.action)).not.toContain('AGENT_ASSIGNED');
    expect(studentTl.body.data.map((t: any) => t.action)).not.toContain('AGENT_UNASSIGNED');
  });

  it('records a rollback as a distinct ROLLBACK_ timeline event', async () => {
    const { appId } = await setup();
    const admin = await createUser('ADMIN');

    // Forward to SENT_TO_UNIVERSITY, then roll back to DOCUMENT_VERIFIED.
    await request(app).patch(`/api/applications/${appId}/status`).set('Authorization', admin.auth).send({ status: 'DOCUMENT_VERIFIED' });
    await request(app).patch(`/api/applications/${appId}/status`).set('Authorization', admin.auth).send({ status: 'SENT_TO_UNIVERSITY' });

    const res = await request(app).patch(`/api/applications/${appId}/status`).set('Authorization', admin.auth)
      .send({ status: 'DOCUMENT_VERIFIED', rollback: true });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DOCUMENT_VERIFIED');

    const tl = await request(app).get(`/api/applications/${appId}/timeline`).set('Authorization', admin.auth);
    const actions = tl.body.data.map((t: any) => t.action);
    expect(actions).toContain('ROLLBACK_DOCUMENT_VERIFIED');
    // The forward move stays a normal STATUS_ event — they're distinguishable.
    expect(actions).toContain('STATUS_SENT_TO_UNIVERSITY');
  });

  it('a student cannot change status', async () => {
    const { appId } = await setup();
    const student = await createUser('STUDENT', 'other-s@test.com');
    const res = await request(app).patch(`/api/applications/${appId}/status`).set('Authorization', student.auth)
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(403);
  });
});
