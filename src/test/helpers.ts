import { prisma } from '../lib/prisma.js';
import { createApp } from '../app.js';
import { hashPassword } from '../lib/hash.js';
import { signAccessToken } from '../lib/jwt.js';
import type { Role } from '@prisma/client';

export const app = createApp();

// Order matters: delete children before parents.
export async function resetDb() {
  await prisma.applicationTimeline.deleteMany();
  await prisma.application.deleteMany();
  await prisma.loanApplication.deleteMany();
  await prisma.studentDocument.deleteMany();
  await prisma.course.deleteMany();
  await prisma.consent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.student.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.university.deleteMany();
  await prisma.accommodation.deleteMany();
  await prisma.serviceProvider.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.blog.deleteMany();
  await prisma.testimonial.deleteMany();
  await prisma.sopLead.deleteMany();
  await prisma.user.deleteMany();
}

export async function createUser(role: Role, email = `${role.toLowerCase()}@test.com`) {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('Password1!'), role },
  });
  if (role === 'STUDENT') await prisma.student.create({ data: { userId: user.id } });
  if (role === 'AGENT') await prisma.agent.create({ data: { userId: user.id, name: 'Test Agent' } });
  const token = signAccessToken({ sub: user.id, role });
  return { user, token, auth: `Bearer ${token}` };
}
