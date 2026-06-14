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

  it('lists enriched applications and assigns an agent for admin', async () => {
    // ready student with an application
    const stud = await createUser('STUDENT', 'applicant@test.com');
    const student = await prisma.student.update({
      where: { userId: stud.user.id },
      data: { firstName: 'Ann', lastName: 'Lee', isProfileCompleted: true },
    });
    const application = await prisma.application.create({
      data: { studentId: student.id, universityName: 'Oxford', course: 'CS' },
    });
    const agentUser = await createUser('AGENT', 'theagent@test.com');
    const agent = await prisma.agent.findUnique({ where: { userId: agentUser.user.id } });

    const { auth } = await createUser('ADMIN');

    const list = await request(app).get('/api/admin/applications').set('Authorization', auth);
    expect(list.status).toBe(200);
    expect(list.body.data).toMatchObject({ total: 1, page: 1 });
    expect(list.body.data.items[0]).toMatchObject({ universityName: 'Oxford', course: 'CS' });
    expect(list.body.data.items[0].student).toMatchObject({ name: 'Ann Lee', email: 'applicant@test.com' });

    const assign = await request(app).patch(`/api/admin/applications/${application.id}/assign-agent`)
      .set('Authorization', auth).send({ agentId: agent!.id });
    expect(assign.status).toBe(200);

    const updated = await prisma.student.findUnique({ where: { id: student.id } });
    expect(updated!.agentId).toBe(agent!.id);

    const after = await request(app).get('/api/admin/applications').set('Authorization', auth);
    expect(after.body.data.items[0].agent).toMatchObject({ id: agent!.id });
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
