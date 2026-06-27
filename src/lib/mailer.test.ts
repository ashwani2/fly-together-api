import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { prisma } from './prisma.js';
import { env } from '../config/env.js';

// Mock nodemailer so we control whether the SMTP "send" succeeds or fails,
// without touching a real SMTP server.
const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
  createTransport: () => ({ sendMail: sendMailMock }),
}));

import { sendMail } from './mailer.js';

// Unique recipients so parallel test files can't pollute these assertions.
const SENT_TO = 'mailer-sent@example.test';
const FAIL_TO = 'mailer-fail@example.test';
const BREVO_TO = 'mailer-brevo@example.test';

describe('mailer EmailLog (SMTP path)', () => {
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

describe('mailer EmailLog (Brevo path)', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(async () => {
    await prisma.emailLog.deleteMany({ where: { to: BREVO_TO } });
    fetchSpy.mockReset();
    (env as { BREVO_API_KEY?: string }).BREVO_API_KEY = 'test-brevo-key';
  });
  afterAll(async () => {
    fetchSpy.mockRestore();
    (env as { BREVO_API_KEY?: string }).BREVO_API_KEY = undefined;
    await prisma.emailLog.deleteMany({ where: { to: BREVO_TO } });
  });

  it('sends via the Brevo HTTP API and logs the messageId', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ messageId: '<brevo-123>' }), { status: 201 }),
    );

    await sendMail({ to: BREVO_TO, subject: 'Via Brevo', html: '<p>Hello</p>' });

    expect(fetchSpy).toHaveBeenCalledWith('https://api.brevo.com/v3/smtp/email', expect.anything());
    const logs = await prisma.emailLog.findMany({ where: { to: BREVO_TO } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('SENT');
    expect(logs[0].messageId).toBe('<brevo-123>');
  });

  it('logs FAILED with the Brevo error on a non-2xx response', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Sender not valid' }), { status: 400 }),
    );

    await sendMail({ to: BREVO_TO, subject: 'Via Brevo', html: '<p>Hello</p>' });

    const logs = await prisma.emailLog.findMany({ where: { to: BREVO_TO } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('FAILED');
    expect(logs[0].error).toContain('Sender not valid');
  });
});
