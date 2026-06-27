import { prisma } from './prisma.js';
import { sendMail } from './mailer.js';
import { env } from '../config/env.js';

/**
 * Application email notifications (course + loan), best-effort.
 *
 * Recipients depend on the event, controlled by `audience`:
 *   • Submission           → student + staff (agent + admins)
 *   • Stage move by staff   → student only (the staff member made the change)
 *   • Student-side action   → staff only (e.g. documents resubmitted)
 *
 * Sending never throws into the caller — failures are logged (and the mailer
 * itself logs the message when SMTP isn't configured).
 */

export interface Audience {
  student: boolean;
  staff: boolean;
}

const COURSE_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Created',
  DOCUMENT_VERIFIED: 'Documents verified',
  SENT_TO_UNIVERSITY: 'Sent to university',
  PENDING_WITH_UNIVERSITY: 'Pending with university',
  VERIFIED_BY_UNIVERSITY: 'Verified by university',
  PAYMENT_PENDING: 'Payment pending',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
};

const LOAN_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Application submitted',
  UNDER_REVIEW: 'Under review',
  DOCUMENTS_REQUESTED: 'Additional documents requested',
  DOCUMENTS_SUBMITTED: 'Documents submitted',
  APPROVED: 'Loan approved',
  REJECTED: 'Application rejected',
  DISBURSED: 'Loan disbursed',
};

function template(title: string, lines: string[]): string {
  const body = lines.map((l) => `<p style="margin:6px 0;color:#334155;font-size:14px">${l}</p>`).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:8px">
    <h2 style="color:#0f172a;font-size:18px;margin:0 0 12px">${title}</h2>
    ${body}
    <p style="margin-top:18px">
      <a href="${env.FRONTEND_URL}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px;font-weight:600">Open Fly Together</a>
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
    <p style="font-size:12px;color:#94a3b8">Fly Together — automated notification</p>
  </div>`;
}

async function send(to: string[], subject: string, title: string, lines: string[]): Promise<void> {
  if (!to.length) return;
  const html = template(title, lines);
  const text = `${title}\n\n${lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n')}\n\n${env.FRONTEND_URL}`;
  await Promise.allSettled(to.map((addr) => sendMail({ to: addr, subject, html, text })));
}

/** All admin emails plus the student's assigned agent (deduplicated). */
async function staffEmails(agentId: string | null): Promise<string[]> {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } });
  const set = new Set(admins.map((a) => a.email));
  if (agentId) {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { user: { select: { email: true } } },
    });
    if (agent?.user?.email) set.add(agent.user.email);
  }
  return [...set];
}

/** Email about a course application submission or stage change. */
export async function emailCourseApplication(applicationId: string, action: string, audience: Audience): Promise<void> {
  // Agent (un)assignment is internal housekeeping — never emailed.
  if (action.startsWith('AGENT_')) return;
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      universityName: true,
      course: true,
      status: true,
      student: { select: { firstName: true, lastName: true, agentId: true, user: { select: { email: true } } } },
    },
  });
  if (!app) return;

  const name = [app.student.firstName, app.student.lastName].filter(Boolean).join(' ') || app.student.user.email;
  const ctx = `${app.universityName} — ${app.course}`;
  const stage = COURSE_STATUS_LABELS[app.status] ?? app.status.replace(/_/g, ' ');
  const isRollback = action.startsWith('ROLLBACK_');
  const phase =
    action === 'CREATED'
      ? 'submitted'
      : isRollback
        ? COURSE_STATUS_LABELS[action.slice('ROLLBACK_'.length)] ?? stage
        : action.startsWith('STATUS_')
          ? COURSE_STATUS_LABELS[action.slice('STATUS_'.length)] ?? stage
          : action.startsWith('PAYMENT_')
            ? `payment ${action.slice('PAYMENT_'.length).toLowerCase()}`
            : stage;

  try {
    if (audience.student) {
      const subject = action === 'CREATED'
        ? `We’ve received your application — ${app.universityName}`
        : isRollback
          ? `Your application moved back — ${phase}`
          : `Your application update — ${phase}`;
      const title = action === 'CREATED'
        ? 'Your application was submitted'
        : isRollback
          ? `Your application was moved back to “${phase}”`
          : `Your application is now “${phase}”`;
      await send([app.student.user.email], subject, title, [
        `<strong>University &amp; course:</strong> ${ctx}`,
        `<strong>Current stage:</strong> ${stage}`,
      ]);
    }
    if (audience.staff) {
      const subject = action === 'CREATED'
        ? `New application — ${name}`
        : isRollback
          ? `Application rolled back — ${name}: ${phase}`
          : `Application update — ${name}: ${phase}`;
      const title = action === 'CREATED'
        ? 'New course application submitted'
        : isRollback
          ? `Application rolled back to “${phase}”`
          : `Application moved to “${phase}”`;
      await send(await staffEmails(app.student.agentId), subject, title, [
        `<strong>Student:</strong> ${name}`,
        `<strong>University &amp; course:</strong> ${ctx}`,
        `<strong>Current stage:</strong> ${stage}`,
      ]);
    }
  } catch (e) {
    console.error('[appMail] course email failed:', (e as Error).message);
  }
}

/** Email about a loan application submission or status change. */
export async function emailLoanApplication(loanId: string, action: string, audience: Audience): Promise<void> {
  const loan = await prisma.loanApplication.findUnique({
    where: { id: loanId },
    select: {
      amount: true,
      status: true,
      student: { select: { firstName: true, lastName: true, agentId: true, user: { select: { email: true } } } },
    },
  });
  if (!loan) return;

  const name = [loan.student.firstName, loan.student.lastName].filter(Boolean).join(' ') || loan.student.user.email;
  const label = LOAN_STATUS_LABELS[action] ?? action.replace(/_/g, ' ');
  const status = LOAN_STATUS_LABELS[loan.status] ?? loan.status;
  const isNew = action === 'SUBMITTED';

  try {
    if (audience.student) {
      const subject = isNew ? 'We’ve received your loan application' : `Your loan application — ${label}`;
      const title = isNew ? 'Your loan application was submitted' : `Your loan application is now “${label}”`;
      await send([loan.student.user.email], subject, title, [
        `<strong>Amount:</strong> ₹${loan.amount}`,
        `<strong>Current status:</strong> ${status}`,
      ]);
    }
    if (audience.staff) {
      const subject = isNew ? `New loan application — ${name} (₹${loan.amount})` : `Loan update — ${name}: ${label}`;
      const title = isNew ? 'New loan application submitted' : `Loan moved to “${label}”`;
      await send(await staffEmails(loan.student.agentId), subject, title, [
        `<strong>Student:</strong> ${name}`,
        `<strong>Amount:</strong> ₹${loan.amount}`,
        `<strong>Current status:</strong> ${status}`,
      ]);
    }
  } catch (e) {
    console.error('[appMail] loan email failed:', (e as Error).message);
  }
}

/** Email the student when a Google Meet is scheduled for their application. */
export async function emailStudentMeeting(
  applicationId: string,
  meetLink: string,
  scheduledAt: Date,
  note?: string,
): Promise<void> {
  try {
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { universityName: true, course: true, student: { select: { user: { select: { email: true } } } } },
    });
    if (!app) return;
    const when = scheduledAt.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' });
    const lines = [
      `A Google Meet has been scheduled for your application — <strong>${app.universityName} — ${app.course}</strong>.`,
      `<strong>When:</strong> ${when}`,
      `<strong>Join link:</strong> <a href="${meetLink}">${meetLink}</a>`,
    ];
    if (note) lines.push(`<strong>Note:</strong> ${note}`);
    await send([app.student.user.email], 'Your Google Meet is scheduled', 'Meeting scheduled', lines);
  } catch (e) {
    console.error('[appMail] meeting email failed:', (e as Error).message);
  }
}

/** Email the student when staff verify or reject one of their documents. */
export async function emailStudentDocumentReview(
  to: string,
  documentLabel: string,
  status: 'VERIFIED' | 'REJECTED',
): Promise<void> {
  try {
    const verified = status === 'VERIFIED';
    const subject = verified ? `Document verified — ${documentLabel}` : `Action needed — re-upload your ${documentLabel}`;
    const title = verified ? 'A document was verified' : 'Please re-upload a document';
    const lines = verified
      ? [`Your <strong>${documentLabel}</strong> has been verified.`]
      : [`Your <strong>${documentLabel}</strong> was rejected during review. Please re-upload a valid copy from Profile &amp; Documents.`];
    await send([to], subject, title, lines);
  } catch (e) {
    console.error('[appMail] document review email failed:', (e as Error).message);
  }
}
