import type { ApplicationStatus, PaymentStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

async function studentIdFor(userId: string): Promise<string> {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw AppError.notFound('Student profile not found');
  return student.id;
}

export async function create(userId: string, input: { universityId: string; course: string }) {
  const studentId = await studentIdFor(userId);
  return prisma.application.create({
    data: {
      studentId, universityId: input.universityId, course: input.course,
      timeline: { create: { action: 'CREATED', actionTakenBy: userId } },
    },
  });
}

export async function list(userId: string, role: Role) {
  if (role === 'ADMIN' || role === 'AGENT') {
    return prisma.application.findMany({ include: { university: true }, orderBy: { createdAt: 'desc' } });
  }
  const studentId = await studentIdFor(userId);
  return prisma.application.findMany({ where: { studentId }, include: { university: true }, orderBy: { createdAt: 'desc' } });
}

export async function get(id: string) {
  const item = await prisma.application.findUnique({ where: { id }, include: { university: true } });
  if (!item) throw AppError.notFound('Application not found');
  return item;
}

export async function timeline(id: string) {
  await get(id);
  return prisma.applicationTimeline.findMany({ where: { applicationId: id }, orderBy: { createdAt: 'asc' } });
}

export async function setStatus(id: string, userId: string, status: ApplicationStatus, rejectionReason?: string) {
  await get(id);
  const item = await prisma.application.update({ where: { id }, data: { status, rejectionReason } });
  await prisma.applicationTimeline.create({
    data: { applicationId: id, action: `STATUS_${status}`, actionTakenBy: userId },
  });
  return item;
}

export async function setPayment(id: string, userId: string, paymentStatus: PaymentStatus, paymentLink?: string) {
  await get(id);
  const item = await prisma.application.update({ where: { id }, data: { paymentStatus, paymentLink } });
  await prisma.applicationTimeline.create({
    data: { applicationId: id, action: `PAYMENT_${paymentStatus}`, actionTakenBy: userId },
  });
  return item;
}
