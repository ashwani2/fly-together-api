import type { ApplicationStatus, PaymentStatus, Role, DocType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

const REQUIRED_DOCS: DocType[] = ['PASSPORT', 'AADHAR', 'ACADEMICS', 'IELTS'];

async function studentIdFor(userId: string): Promise<string> {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw AppError.notFound('Student profile not found');
  return student.id;
}

export async function create(userId: string, input: { universityName: string; course: string }) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw AppError.notFound('Student profile not found');

  // Profile must be complete before applying.
  if (!student.isProfileCompleted) {
    throw AppError.badRequest('Please complete your profile before submitting an application.');
  }

  // All required documents must be uploaded.
  const docs = await prisma.studentDocument.findMany({ where: { studentId: student.id, removed: false } });
  const uploaded = new Set(docs.map((d) => d.docType));
  const missing = REQUIRED_DOCS.filter((t) => !uploaded.has(t));
  if (missing.length) {
    throw AppError.badRequest(`Please upload all required documents before applying. Missing: ${missing.join(', ')}.`);
  }

  return prisma.application.create({
    data: {
      studentId: student.id, universityName: input.universityName, course: input.course,
      timeline: { create: { action: 'CREATED', actionTakenBy: userId } },
    },
  });
}

export async function list(userId: string, role: Role) {
  if (role === 'ADMIN' || role === 'AGENT') {
    return prisma.application.findMany({ orderBy: { createdAt: 'desc' } });
  }
  const studentId = await studentIdFor(userId);
  return prisma.application.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } });
}

export async function get(id: string) {
  const item = await prisma.application.findUnique({ where: { id } });
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
