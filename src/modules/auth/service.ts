import crypto from 'node:crypto';
import type { Role, Gender } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/hash.js';
import { signAccessToken, signRefreshToken } from '../../lib/jwt.js';
import { AppError } from '../../lib/errors.js';
import { sendMail } from '../../lib/mailer.js';
import { formatIST } from '../../lib/istTime.js';
import { env } from '../../config/env.js';

const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

function tokensFor(user: { id: string; role: Role }) {
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken: signRefreshToken({ sub: user.id, role: user.role }),
  };
}

export async function register(input: {
  email: string;
  password: string;
  role: 'STUDENT' | 'AGENT';
  name?: string;
  phoneNumber?: string;
  gender?: Gender;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw AppError.conflict('Email already registered');

  // Split the full name into first/last on whitespace.
  const parts = (input.name ?? '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      phoneNumber: input.phoneNumber ?? null,
      gender: input.gender ?? null,
      consents: { create: { consentType: 'DATA_PROCESSING', granted: true, version: '1.0' } },
      ...(input.role === 'STUDENT'
        ? { student: { create: { firstName, lastName } } }
        : { agent: { create: { name: input.name ?? input.email } } }),
    },
  });

  return { user: publicUser(user), ...tokensFor(user) };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw AppError.unauthorized('Invalid credentials');
  }
  return { user: publicUser(user), ...tokensFor(user) };
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User not found');
  return publicUser(user);
}

export function rotateTokens(payload: { sub: string; role: Role }) {
  return tokensFor({ id: payload.sub, role: payload.role });
}

function publicUser(u: { id: string; email: string; role: Role; phoneNumber: string | null; gender?: Gender | null }) {
  return { id: u.id, email: u.email, role: u.role, phoneNumber: u.phoneNumber, gender: u.gender ?? null };
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always respond the same way so we don't leak which emails are registered.
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + env.RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    // Invalidate any outstanding reset tokens for this user.
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, used: false } });
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });

    const url = `${env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendMail({
      to: email,
      subject: 'Reset your Fly Together password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto">
          <h2>Reset your password</h2>
          <p>We received a request to reset the password for your Fly Together account.</p>
          <p style="margin:24px 0">
            <a href="${url}" style="background:#2563eb;color:#fff;padding:12px 22px;border-radius:9999px;text-decoration:none;font-weight:bold">
              Set a new password
            </a>
          </p>
          <p style="color:#666;font-size:13px">This link expires at <strong>${formatIST(expiresAt)}</strong>. If you didn't request this, you can safely ignore this email.</p>
          <p style="color:#999;font-size:12px;word-break:break-all">${url}</p>
        </div>`,
      text: `Reset your Fly Together password: ${url} (expires at ${formatIST(expiresAt)}). If you didn't request this, ignore this email.`,
    });
  }
  return { success: true };
}

export async function resetPassword(token: string, password: string) {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.used || record.expiresAt < new Date()) {
    throw AppError.badRequest('This password reset link is invalid or has expired.');
  }
  await prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(password) } });
  await prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } });
  return { success: true };
}
