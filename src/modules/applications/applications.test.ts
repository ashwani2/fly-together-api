import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { DocType } from '@prisma/client';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

const REQUIRED: DocType[] = ['PASSPORT', 'AADHAR', 'ACADEMICS', 'IELTS'];

// A student with a completed profile and all required documents uploaded.
async function readyStudent(email?: string) {
  const u = await createUser('STUDENT', email);
  const student = await prisma.student.findUnique({ where: { userId: u.user.id } });
  await prisma.student.update({ where: { id: student!.id }, data: { isProfileCompleted: true } });
  await prisma.studentDocument.createMany({
    data: REQUIRED.map((t) => ({ studentId: student!.id, docType: t, docUrl: `key/${t}.pdf` })),
  });
  return u;
}

describe('applications', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('rejects applying with an incomplete profile', async () => {
    const { auth } = await createUser('STUDENT'); // not ready
    const res = await request(app).post('/api/applications').set('Authorization', auth)
      .send({ universityName: 'Oxford', course: 'MSc CS' });
    expect(res.status).toBe(400);
  });

  it('rejects applying when documents are missing', async () => {
    const u = await createUser('STUDENT');
    const student = await prisma.student.findUnique({ where: { userId: u.user.id } });
    await prisma.student.update({ where: { id: student!.id }, data: { isProfileCompleted: true } });
    const res = await request(app).post('/api/applications').set('Authorization', u.auth)
      .send({ universityName: 'Oxford', course: 'MSc CS' });
    expect(res.status).toBe(400);
  });

  it('a ready student creates an application with an initial timeline entry', async () => {
    const { auth } = await readyStudent();
    const res = await request(app).post('/api/applications').set('Authorization', auth)
      .send({ universityName: 'University of Oxford', course: 'MSc CS' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('CREATED');
    expect(res.body.data.universityName).toBe('University of Oxford');
    const timeline = await request(app).get(`/api/applications/${res.body.data.id}/timeline`).set('Authorization', auth);
    expect(timeline.body.data.length).toBe(1);
    expect(timeline.body.data[0].action).toBe('CREATED');
  });

  it('student sees only their own applications; admin sees all', async () => {
    const s1 = await readyStudent('s1@test.com');
    const s2 = await readyStudent('s2@test.com');
    await request(app).post('/api/applications').set('Authorization', s1.auth).send({ universityName: 'Oxford', course: 'A' });
    await request(app).post('/api/applications').set('Authorization', s2.auth).send({ universityName: 'Imperial', course: 'B' });
    const mine = await request(app).get('/api/applications').set('Authorization', s1.auth);
    expect(mine.body.data.length).toBe(1);
    const admin = await createUser('ADMIN');
    const all = await request(app).get('/api/applications').set('Authorization', admin.auth);
    expect(all.body.data.length).toBe(2);
  });
});
