import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { resetDb, createUser } from '../test/helpers.js';
import { prisma } from './prisma.js';

// Mock the mailer so we can assert who would be emailed without sending mail.
const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));
vi.mock('./mailer.js', () => ({ sendMail: sendMailMock }));

import { emailCourseApplication, emailLoanApplication } from './appMail.js';

const recipients = () => sendMailMock.mock.calls.map((c) => (c[0] as { to: string }).to);

async function seedStaffAndStudent() {
  await createUser('ADMIN', 'admin@test.com');
  const agentUser = await createUser('AGENT', 'agent@test.com');
  const agent = await prisma.agent.findUnique({ where: { userId: agentUser.user.id } });
  const stud = await createUser('STUDENT', 'student@test.com');
  const student = await prisma.student.update({
    where: { userId: stud.user.id },
    data: { firstName: 'Sam', lastName: 'Lee', agentId: agent!.id },
  });
  return student;
}

describe('appMail', () => {
  beforeEach(async () => {
    await resetDb();
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue(undefined);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('course submission emails the student AND staff', async () => {
    const student = await seedStaffAndStudent();
    const app = await prisma.application.create({
      data: { studentId: student.id, universityName: 'Oxford', course: 'CS' },
    });

    await emailCourseApplication(app.id, 'CREATED', { student: true, staff: true });

    expect(recipients()).toEqual(expect.arrayContaining(['student@test.com', 'admin@test.com', 'agent@test.com']));
  });

  it('a staff-driven course phase move emails the student only (not staff)', async () => {
    const student = await seedStaffAndStudent();
    const app = await prisma.application.create({
      data: { studentId: student.id, universityName: 'Oxford', course: 'CS', status: 'SENT_TO_UNIVERSITY' },
    });

    await emailCourseApplication(app.id, 'STATUS_SENT_TO_UNIVERSITY', { student: true, staff: false });

    expect(recipients()).toEqual(['student@test.com']);
    expect(recipients()).not.toContain('admin@test.com');
    expect(recipients()).not.toContain('agent@test.com');
  });

  it('loan submission emails the student AND staff', async () => {
    const student = await seedStaffAndStudent();
    const loan = await prisma.loanApplication.create({
      data: { studentId: student.id, amount: '500000', status: 'SUBMITTED' },
    });

    await emailLoanApplication(loan.id, 'SUBMITTED', { student: true, staff: true });

    expect(recipients()).toEqual(expect.arrayContaining(['student@test.com', 'admin@test.com', 'agent@test.com']));
  });

  it('a loan status change emails the student only', async () => {
    const student = await seedStaffAndStudent();
    const loan = await prisma.loanApplication.create({
      data: { studentId: student.id, amount: '500000', status: 'APPROVED' },
    });

    await emailLoanApplication(loan.id, 'APPROVED', { student: true, staff: false });

    expect(recipients()).toEqual(['student@test.com']);
  });

  it('document resubmission emails staff only (not the student)', async () => {
    const student = await seedStaffAndStudent();
    const loan = await prisma.loanApplication.create({
      data: { studentId: student.id, amount: '500000', status: 'UNDER_REVIEW' },
    });

    await emailLoanApplication(loan.id, 'DOCUMENTS_SUBMITTED', { student: false, staff: true });

    expect(recipients()).toEqual(expect.arrayContaining(['admin@test.com', 'agent@test.com']));
    expect(recipients()).not.toContain('student@test.com');
  });
});
