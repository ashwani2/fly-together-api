import type { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/hash.js';
import { signAccessToken, signRefreshToken } from '../../lib/jwt.js';
import { AppError } from '../../lib/errors.js';

function tokensFor(user: { id: string; role: Role }) {
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken: signRefreshToken({ sub: user.id, role: user.role }),
  };
}

export async function register(input: { email: string; password: string; role: 'STUDENT' | 'AGENT'; name?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw AppError.conflict('Email already registered');

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      consents: { create: { consentType: 'DATA_PROCESSING', granted: true, version: '1.0' } },
      ...(input.role === 'STUDENT'
        ? { student: { create: {} } }
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

function publicUser(u: { id: string; email: string; role: Role; phoneNumber: string | null }) {
  return { id: u.id, email: u.email, role: u.role, phoneNumber: u.phoneNumber };
}
