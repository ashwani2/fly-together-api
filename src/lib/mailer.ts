import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

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

export async function sendMail(opts: { to: string; subject: string; html: string; text?: string }): Promise<void> {
  const t = getTransport();
  if (!t) {
    // No SMTP configured — log so the link is usable in development.
    logEmail(opts, 'no SMTP configured');
    return;
  }
  try {
    await t.sendMail({ from: env.MAIL_FROM, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
  } catch (e) {
    // Don't let a transport/auth error (e.g. a Gmail App Password not yet set)
    // break the calling flow — log the failure and the content instead.
    console.error('[mailer] send failed:', (e as Error).message);
    logEmail(opts, 'send failed — logged instead');
  }
}
