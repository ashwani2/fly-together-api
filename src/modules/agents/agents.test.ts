import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

describe('agents', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lists agents for admin', async () => {
    await createUser('AGENT', 'a1@test.com');
    const { auth } = await createUser('ADMIN');
    const res = await request(app).get('/api/agents').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0]).toHaveProperty('numberOfStudents');
  });

  it('returns an agent\'s assigned students', async () => {
    const { user: agentUser, auth } = await createUser('AGENT', 'a2@test.com');
    const agent = await prisma.agent.findUnique({ where: { userId: agentUser.id } });
    const stud = await createUser('STUDENT', 'st@test.com');
    await prisma.student.update({ where: { userId: stud.user.id }, data: { agentId: agent!.id } });
    const res = await request(app).get('/api/agents/me/students').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('lets an agent verify a student profile', async () => {
    const { user: agentUser, auth } = await createUser('AGENT', 'a3@test.com');
    const agent = await prisma.agent.findUnique({ where: { userId: agentUser.id } });
    const stud = await createUser('STUDENT', 'st2@test.com');
    const student = await prisma.student.update({ where: { userId: stud.user.id }, data: { agentId: agent!.id } });
    const res = await request(app).patch(`/api/agents/students/${student.id}/verify`).set('Authorization', auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.isProfileVerified).toBe(true);
  });
});
