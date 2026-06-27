import type { ApplicationStatus, PaymentStatus, Role, DocType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { notifyApplicationAction } from '../notifications/service.js';
import { emailStudentMeeting } from '../../lib/appMail.js';
import { env } from '../../config/env.js';
import * as flywire from '../../lib/flywire.js';

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

  const application = await prisma.application.create({
    data: {
      studentId: student.id, universityName: input.universityName, course: input.course,
      timeline: { create: { action: 'CREATED', actionTakenBy: userId } },
    },
  });

  // Notify the student (in-app) and the assigned agent + admins (email) that a
  // new application was submitted.
  await notifyApplicationAction(application.id, 'CREATED');
  return application;
}

export async function list(userId: string, role: Role) {
  if (role === 'ADMIN' || role === 'AGENT') {
    return prisma.application.findMany({ orderBy: { createdAt: 'desc' }, include: { flywirePayment: true } });
  }
  const studentId = await studentIdFor(userId);
  return prisma.application.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, include: { flywirePayment: true } });
}

export async function get(id: string) {
  const item = await prisma.application.findUnique({ where: { id }, include: { flywirePayment: true } });
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

export async function setStatus(
  id: string,
  actor: Actor,
  status: ApplicationStatus,
  rejectionReason?: string,
  rollback = false,
) {
  await assertCanManage(id, actor);
  const item = await prisma.application.update({ where: { id }, data: { status, rejectionReason } });
  // A rollback is recorded as a distinct event so timelines can show it differently.
  const action = rollback ? `ROLLBACK_${status}` : `STATUS_${status}`;
  await prisma.applicationTimeline.create({
    data: { applicationId: id, action, actionTakenBy: actor.id },
  });
  await notifyApplicationAction(id, action);
  return item;
}

/**
 * Schedule a Google Meet for an application (admin/agent). Records it on the
 * timeline (with the join link + time, visible to the student and staff),
 * notifies the student in-app, and emails them the link.
 */
export async function scheduleMeeting(
  id: string,
  actor: Actor,
  input: { scheduledAt: Date; meetLink: string; note?: string },
) {
  await assertCanManage(id, actor);
  const app = await prisma.application.findUnique({
    where: { id },
    select: { student: { select: { userId: true } } },
  });
  if (!app) throw AppError.notFound('Application not found');

  await prisma.applicationTimeline.create({
    data: {
      applicationId: id,
      action: 'MEETING_SCHEDULED',
      actionTakenBy: actor.id,
      meetingLink: input.meetLink,
      meetingAt: input.scheduledAt,
    },
  });

  const when = input.scheduledAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  await prisma.notification.create({
    data: {
      userId: app.student.userId,
      applicationId: id,
      title: 'Google Meet scheduled',
      message: `A Google Meet is scheduled for ${when}. The join link is on your application timeline.`,
    },
  });

  // Email the student the meeting details (best-effort).
  void emailStudentMeeting(id, input.meetLink, input.scheduledAt, input.note).catch((e) =>
    console.error('[applications] meeting email failed:', (e as Error).message),
  );

  return get(id);
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

/** Currency subunit factor — Flywire amounts are in subunit (cents for EUR/USD). */
const SUBUNIT = 100;

/**
 * Initializes a Flywire payment for an application (admin/agent only). Builds
 * the Flywire subject from the student's profile, calls the Flywire API, stores
 * the result, and advances the application to PAYMENT_PENDING with the pay link.
 * `amount` is in major units (e.g. EUR).
 */
export async function initializeFlywire(id: string, actor: Actor, amount: number) {
  await assertCanManage(id, actor);
  const app = await prisma.application.findUnique({
    where: { id },
    include: { student: { include: { user: { select: { email: true } } } } },
  });
  if (!app) throw AppError.notFound('Application not found');

  const { student } = app;
  const firstName = student.firstName?.trim();
  const lastName = student.lastName?.trim();
  if (!firstName || !lastName) {
    throw AppError.badRequest('Student profile must have a first and last name before initializing payment.');
  }

  const subunitAmount = Math.round(amount * SUBUNIT);
  const details = await flywire.initializePayment({
    subject: {
      type: 'student',
      firstName,
      lastName,
      email: student.user.email,
      country: env.FLYWIRE_SUBJECT_COUNTRY,
    },
    destinationId: env.FLYWIRE_DESTINATION_ID,
    amount: subunitAmount,
  });

  const payLink = details.links?.pay ?? null;
  const currency = details.currency ?? 'EUR';

  // Persist the Flywire payment (one per application) and sync the application's
  // own payment fields so the existing UI keeps working.
  await prisma.$transaction([
    prisma.flywirePayment.upsert({
      where: { applicationId: id },
      create: {
        applicationId: id,
        flywireId: details.id,
        reference: details.reference ?? null,
        payLink,
        flywireStatus: details.status.value,
        amount: subunitAmount,
        currency,
        destinationId: env.FLYWIRE_DESTINATION_ID,
      },
      update: {
        flywireId: details.id,
        reference: details.reference ?? null,
        payLink,
        flywireStatus: details.status.value,
        amount: subunitAmount,
        currency,
        destinationId: env.FLYWIRE_DESTINATION_ID,
      },
    }),
    prisma.application.update({
      where: { id },
      data: {
        status: 'PAYMENT_PENDING',
        paymentStatus: flywire.mapFlywireStatus(details.status.value),
        paymentLink: payLink,
      },
    }),
    prisma.applicationTimeline.create({
      data: { applicationId: id, action: 'STATUS_PAYMENT_PENDING', actionTakenBy: actor.id },
    }),
  ]);

  await notifyApplicationAction(id, 'STATUS_PAYMENT_PENDING');
  return get(id);
}

/**
 * Re-queries Flywire for the latest status of an application's payment and
 * updates our records. Allowed for the owning student as well as admins/agents,
 * since callbacks are not enabled (status is pulled on demand).
 */
export async function refreshFlywire(id: string, actor: Actor) {
  const fp = await prisma.flywirePayment.findUnique({ where: { applicationId: id } });
  if (!fp) throw AppError.notFound('No Flywire payment for this application');

  // Students may only refresh their own application's payment.
  if (actor.role === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { userId: actor.id }, select: { id: true } });
    const app = await prisma.application.findUnique({ where: { id }, select: { studentId: true } });
    if (!student || !app || app.studentId !== student.id) {
      throw AppError.forbidden('Not your application');
    }
  } else {
    await assertCanManage(id, actor);
  }

  const details = await flywire.getPayment(fp.flywireId);
  const newPaymentStatus = flywire.mapFlywireStatus(details.status.value);
  const statusChanged = details.status.value !== fp.flywireStatus;

  await prisma.$transaction([
    prisma.flywirePayment.update({
      where: { applicationId: id },
      data: { flywireStatus: details.status.value, reference: details.reference ?? fp.reference },
    }),
    prisma.application.update({ where: { id }, data: { paymentStatus: newPaymentStatus } }),
  ]);

  // Record + notify only on a real transition (avoids spamming on every poll).
  if (statusChanged) {
    await prisma.applicationTimeline.create({
      data: { applicationId: id, action: `PAYMENT_${newPaymentStatus}`, actionTakenBy: actor.id },
    });
    await notifyApplicationAction(id, `PAYMENT_${newPaymentStatus}`);
  }

  return get(id);
}
