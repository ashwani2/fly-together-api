import dns from 'node:dns';
import net from 'node:net';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';

// Some hosts (e.g. Render) have no outbound IPv6 route. smtp.gmail.com also
// resolves to IPv6, and Node's "Happy Eyeballs" (autoSelectFamily, on by default
// in Node 20+) races IPv6 + IPv4 and can surface the IPv6 ENETUNREACH error
// instead of falling back to IPv4. So: prefer IPv4 in DNS results AND turn off
// Happy Eyeballs so the SMTP socket connects over IPv4 only.
dns.setDefaultResultOrder('ipv4first');
(net as { setDefaultAutoSelectFamily?: (value: boolean) => void }).setDefaultAutoSelectFamily?.(false);

let transportPromise: Promise<Transporter | null> | null = null;

/**
 * Build the SMTP transport, connecting to an explicit IPv4 address.
 *
 * DNS-order / Happy-Eyeballs tweaks weren't enough on Render (no IPv6 route), so
 * we resolve the host to IPv4 ourselves and hand nodemailer a literal IPv4 — then
 * there's no hostname left for the socket to resolve to IPv6. `tls.servername`
 * keeps SNI + certificate validation pointed at the real hostname.
 */
async function buildTransport(): Promise<Transporter | null> {
  if (!(env.SMTP_HOST && env.SMTP_PORT)) return null;

  let host = env.SMTP_HOST;
  try {
    const ipv4 = await dns.promises.resolve4(env.SMTP_HOST);
    if (ipv4.length) host = ipv4[0];
  } catch (e) {
    console.error(`[mailer] could not resolve IPv4 for ${env.SMTP_HOST}:`, (e as Error).message);
  }
  // Visible in the server logs — confirms this build is live and which IP is used.
  console.log(`[mailer] SMTP transport → ${env.SMTP_HOST} (${host}):${env.SMTP_PORT}`);

  return nodemailer.createTransport({
    host,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: true,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    tls: { servername: env.SMTP_HOST },
  });
}

function getTransport(): Promise<Transporter | null> {
  if (!transportPromise) transportPromise = buildTransport();
  return transportPromise;
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
  const t = await getTransport();

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
