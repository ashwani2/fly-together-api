import type { ApplicationStatus, PaymentStatus, Role, DocType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { notifyApplicationAction } from '../notifications/service.js';

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

interface Actor { id: string; role: Role }

/**
 * Admins may act on any application; agents only on applications belonging to
 * their assigned students. Returns the application's studentId.
 */
async function assertCanManage(applicationId: string, actor: Actor): Promise<string> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, student: { select: { id: true, agentId: true } } },
  });
  if (!app) throw AppError.notFound('Application not found');
  if (actor.role === 'AGENT') {
    const agent = await prisma.agent.findUnique({ where: { userId: actor.id }, select: { id: true } });
    if (!agent || app.student.agentId !== agent.id) {
      throw AppError.forbidden('You can only manage applications of your assigned students.');
    }
  }
  return app.student.id;
}

export async function setStatus(id: string, actor: Actor, status: ApplicationStatus, rejectionReason?: string) {
  await assertCanManage(id, actor);
  const item = await prisma.application.update({ where: { id }, data: { status, rejectionReason } });
  await prisma.applicationTimeline.create({
    data: { applicationId: id, action: `STATUS_${status}`, actionTakenBy: actor.id },
  });
  await notifyApplicationAction(id, `STATUS_${status}`);
  return item;
}

export async function setPayment(id: string, actor: Actor, paymentStatus: PaymentStatus, paymentLink?: string) {
  await assertCanManage(id, actor);
  const item = await prisma.application.update({ where: { id }, data: { paymentStatus, paymentLink } });
  await prisma.applicationTimeline.create({
    data: { applicationId: id, action: `PAYMENT_${paymentStatus}`, actionTakenBy: actor.id },
  });
  await notifyApplicationAction(id, `PAYMENT_${paymentStatus}`);
  return item;
}
