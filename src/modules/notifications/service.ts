import type { DocType, AcademicSubType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { emailCourseApplication, emailStudentDocumentReview } from '../../lib/appMail.js';

const STATUS_TITLES: Record<string, string> = {
  CREATED: 'Application created',
  DOCUMENT_VERIFIED: 'Documents verified',
  SENT_TO_UNIVERSITY: 'Sent to university',
  PENDING_WITH_UNIVERSITY: 'Pending with university',
  VERIFIED_BY_UNIVERSITY: 'Verified by university',
  PAYMENT_PENDING: 'Payment pending',
  COMPLETED: 'Application completed',
  REJECTED: 'Application rejected',
};

const SUBTYPE_LABELS: Record<AcademicSubType, string> = {
  TENTH: '10th Certificate',
  TWELFTH: '12th Certificate',
  GRADUATION: 'Graduation Certificate',
  OTHER: 'academic document',
};

function docLabel(docType: DocType, subType: AcademicSubType | null): string {
  if (docType === 'ACADEMICS') return subType ? SUBTYPE_LABELS[subType] : 'academic certificate';
  return docType.charAt(0) + docType.slice(1).toLowerCase();
}

function describe(action: string, ctx: string): { title: string; message: string } {
  if (action === 'CREATED') return { title: 'Application created', message: `Your application for ${ctx} was submitted.` };
  if (action === 'AGENT_ASSIGNED') return { title: 'Advisor assigned', message: `An advisor is now handling your application for ${ctx}.` };
  if (action === 'AGENT_UNASSIGNED') return { title: 'Advisor updated', message: `Your advisor assignment changed for ${ctx}.` };
  if (action.startsWith('STATUS_')) {
    const s = action.slice('STATUS_'.length);
    const label = STATUS_TITLES[s] ?? s.replace(/_/g, ' ');
    return { title: label, message: `Your application for ${ctx} is now “${label}”.` };
  }
  if (action.startsWith('PAYMENT_')) {
    const s = action.slice('PAYMENT_'.length).toLowerCase();
    return { title: `Payment ${s}`, message: `Payment for ${ctx} is now ${s}.` };
  }
  return { title: action.replace(/_/g, ' '), message: `Update on your application for ${ctx}.` };
}

// ---------- Emitters (called by other modules when events happen) ----------

/** Record a notification for an application event (status/payment/agent changes). */
export async function notifyApplicationAction(applicationId: string, action: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { universityName: true, course: true, student: { select: { userId: true } } },
  });
  if (!app) return;
  const ctx = `${app.universityName} — ${app.course}`;
  const { title, message } = describe(action, ctx);
  await prisma.notification.create({ data: { userId: app.student.userId, applicationId, title, message } });

  // Email recipients depend on the event:
  //   • CREATED (student submitted) → student (confirmation) + staff (heads-up)
  //   • STATUS_/PAYMENT_ (staff moved the phase) → student only
  //   • AGENT_* (internal) → no email (emailCourseApplication ignores it)
  // Fire-and-forget so SMTP latency never delays the response.
  const audience = action === 'CREATED' ? { student: true, staff: true } : { student: true, staff: false };
  void emailCourseApplication(applicationId, action, audience).catch((e) =>
    console.error('[notifications] application email failed:', (e as Error).message),
  );
}

/** Record a notification when a document is verified or rejected. */
export async function notifyDocumentReview(
  studentId: string,
  docType: DocType,
  subType: AcademicSubType | null,
  status: 'VERIFIED' | 'REJECTED',
) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { userId: true, user: { select: { email: true } } },
  });
  if (!student) return;
  const label = docLabel(docType, subType);
  const payload = status === 'VERIFIED'
    ? { title: 'Document verified', message: `Your ${label} was verified.` }
    : { title: 'Re-upload requested', message: `Your ${label} was rejected during review — please re-upload it from Profile & Documents.` };
  await prisma.notification.create({ data: { userId: student.userId, ...payload } });

  // Email the student about the review (an admin/agent action), best-effort.
  void emailStudentDocumentReview(student.user.email, label, status).catch((e) =>
    console.error('[notifications] document email failed:', (e as Error).message),
  );
}

// ---------- Reads ----------

export async function listForUser(userId: string) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 });
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  return { success: true };
}
