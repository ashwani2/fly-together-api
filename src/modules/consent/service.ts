import { prisma } from '../../lib/prisma.js';

export function record(userId: string, consentType: string, granted: boolean, version = '1.0') {
  return prisma.consent.create({ data: { userId, consentType, granted, version } });
}
export function listForUser(userId: string) {
  return prisma.consent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}
