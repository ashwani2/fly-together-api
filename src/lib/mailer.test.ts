import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from './prisma.js';

// Mock nodemailer so we control whether the "send" succeeds or fails, without
// touching a real SMTP server.
const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
  createTransport: () => ({ sendMail: sendMailMock }),
}));

import { sendMail } from './mailer.js';

// Unique recipients so parallel test files can't pollute these assertions.
const SENT_TO = 'mailer-sent@example.test';
const FAIL_TO = 'mailer-fail@example.test';

describe('mailer EmailLog', () => {
  beforeEach(async () => {
    await prisma.emailLog.deleteMany({ where: { to: { in: [SENT_TO, FAIL_TO] } } });
    sendMailMock.mockReset();
  });
  afterAll(async () => {
    await prisma.emailLog.deleteMany({ where: { to: { in: [SENT_TO, FAIL_TO] } } });
    await prisma.$disconnect();
  });

  it('logs a SENT row with the provider response on success', async () => {
    sendMailMock.mockResolvedValue({ messageId: '<abc@server>', response: '250 2.0.0 OK' });

    await sendMail({ to: SENT_TO, subject: 'Welcome', html: '<p>Hi there</p>' });

    const logs = await prisma.emailLog.findMany({ where: { to: SENT_TO } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('SENT');
    expect(logs[0].subject).toBe('Welcome');
    expect(logs[0].messageId).toBe('<abc@server>');
    expect(logs[0].response).toBe('250 2.0.0 OK');
    expect(logs[0].error).toBeNull();
    expect(logs[0].body).toContain('Hi there');
  });

  it('logs a FAILED row with the error when sending throws', async () => {
    sendMailMock.mockRejectedValue(new Error('Invalid login: 535-5.7.8'));

    await sendMail({ to: FAIL_TO, subject: 'Update', html: '<p>Nope</p>' });

    const logs = await prisma.emailLog.findMany({ where: { to: FAIL_TO } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('FAILED');
    expect(logs[0].error).toContain('535-5.7.8');
    expect(logs[0].messageId).toBeNull();
  });
});
