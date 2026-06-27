import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

async function studentWithApplication(email = 'stud@test.com') {
  const stud = await createUser('STUDENT', email);
  const student = await prisma.student.update({
    where: { userId: stud.user.id },
    data: { firstName: 'Sam', lastName: 'Lee' },
  });
  const application = await prisma.application.create({
    data: { studentId: student.id, universityName: 'Oxford', course: 'CS' },
  });
  return { stud, application };
}

describe('application meetings', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('admin schedules a Google Meet → timeline entry + student notification', async () => {
    const { stud, application } = await studentWithApplication();
    const { auth } = await createUser('ADMIN');

    const res = await request(app)
      .post(`/api/applications/${application.id}/meeting`)
      .set('Authorization', auth)
      .send({ scheduledAt: '2030-01-01T10:00:00.000Z', meetLink: 'https://meet.google.com/abc-defg-hij', note: 'Bring docs' });
    expect(res.status).toBe(201);

    const entries = await prisma.applicationTimeline.findMany({
      where: { applicationId: application.id, action: 'MEETING_SCHEDULED' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].meetingLink).toBe('https://meet.google.com/abc-defg-hij');
    expect(entries[0].meetingAt?.toISOString()).toBe('2030-01-01T10:00:00.000Z');

    const notifs = await prisma.notification.findMany({ where: { userId: stud.user.id } });
    expect(notifs.some((n) => n.title === 'Google Meet scheduled')).toBe(true);
  });

  it('rejects an invalid meeting link', async () => {
    const { application } = await studentWithApplication();
    const { auth } = await createUser('ADMIN');
    const res = await request(app)
      .post(`/api/applications/${application.id}/meeting`)
      .set('Authorization', auth)
      .send({ scheduledAt: '2030-01-01T10:00:00.000Z', meetLink: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('forbids a student from scheduling', async () => {
    const { stud, application } = await studentWithApplication();
    const res = await request(app)
      .post(`/api/applications/${application.id}/meeting`)
      .set('Authorization', stud.auth)
      .send({ scheduledAt: '2030-01-01T10:00:00.000Z', meetLink: 'https://meet.google.com/abc-defg-hij' });
    expect(res.status).toBe(403);
  });

  it('exposes the meeting link on the student timeline', async () => {
    const { stud, application } = await studentWithApplication();
    const { auth } = await createUser('ADMIN');
    await request(app)
      .post(`/api/applications/${application.id}/meeting`)
      .set('Authorization', auth)
      .send({ scheduledAt: '2030-01-01T10:00:00.000Z', meetLink: 'https://meet.google.com/xyz-pqrs-tuv' });

    const tl = await request(app)
      .get(`/api/applications/${application.id}/timeline`)
      .set('Authorization', stud.auth);
    expect(tl.status).toBe(200);
    const meeting = tl.body.data.find((e: any) => e.action === 'MEETING_SCHEDULED');
    expect(meeting?.meetingLink).toBe('https://meet.google.com/xyz-pqrs-tuv');
  });
});
