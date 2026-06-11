import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';

export interface TokenPayload { sub: string; role: Role; }

export function signAccessToken(p: TokenPayload): string {
  return jwt.sign(p, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'] });
}
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
}
export function signRefreshToken(p: TokenPayload): string {
  return jwt.sign(p, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL as SignOptions['expiresIn'] });
}
export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}
