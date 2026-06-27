import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';

let transporter: Transporter | null = null;
let resolved = false;

function getTransport(): Transporter | null {
  if (resolved) return transporter;
  resolved = true;
  if (env.SMTP_HOST && env.SMTP_PORT) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

function logEmail(opts: { to: string; subject: string; html: string; text?: string }, reason: string) {
  console.log(`\n========== EMAIL (${reason}) ==========`);
  console.log('To:      ', opts.to);
  console.log('Subject: ', opts.subject);
  console.log(opts.text ?? opts.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  console.log('================================================\n');
}

const plain = (opts: { html: string; text?: string }) =>
  opts.text ?? opts.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Persist one row per email attempt. Never throws into the caller. */
async function recordEmail(entry: {
  to: string;
  from: string;
  subject: string;
  body: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  messageId?: string | null;
  response?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    await prisma.emailLog.create({ data: entry });
  } catch (e) {
    console.error('[mailer] failed to write EmailLog:', (e as Error).message);
  }
}

export async function sendMail(opts: { to: string; subject: string; html: string; text?: string }): Promise<void> {
  const from = env.MAIL_FROM;
  const body = plain(opts);
  const t = getTransport();

  if (!t) {
    // No SMTP configured — log so the link is usable in development, and record it.
    logEmail(opts, 'no SMTP configured');
    await recordEmail({ to: opts.to, from, subject: opts.subject, body, status: 'SKIPPED', error: 'No SMTP configured' });
    return;
  }

  try {
    const info = await t.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
    await recordEmail({
      to: opts.to,
      from,
      subject: opts.subject,
      body,
      status: 'SENT',
      messageId: info.messageId ?? null,
      response: info.response ?? null,
    });
  } catch (e) {
    // Don't let a transport/auth error (e.g. a Gmail App Password not yet set)
    // break the calling flow — log the failure and the content instead.
    const message = (e as Error).message;
    console.error('[mailer] send failed:', message);
    logEmail(opts, 'send failed — logged instead');
    await recordEmail({ to: opts.to, from, subject: opts.subject, body, status: 'FAILED', error: message });
  }
}
