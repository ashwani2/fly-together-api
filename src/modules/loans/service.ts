import type { LoanStatus, Role, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { getStorage } from '../../lib/storage/index.js';
import { emailLoanApplication } from '../../lib/appMail.js';

const LOAN_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Application submitted',
  UNDER_REVIEW: 'Under review',
  DOCUMENTS_REQUESTED: 'Additional documents requested',
  APPROVED: 'Loan approved',
  REJECTED: 'Application rejected',
  DISBURSED: 'Loan disbursed',
};

async function studentFor(userId: string) {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: { user: { select: { email: true, phoneNumber: true } } },
  });
  if (!student) throw AppError.notFound('Student profile not found');
  return student;
}

export async function create(
  userId: string,
  input: { amount: string; details?: Record<string, unknown> },
) {
  const student = await studentFor(userId);

  // Merge student profile into details.personalInfo (form-supplied values take priority)
  const details = (input.details ?? {}) as Record<string, unknown>;
  const existingPersonal = (details.personalInfo as Record<string, unknown>) ?? {};
  const mergedPersonalInfo = {
    firstName: student.firstName ?? null,
    lastName: student.lastName ?? null,
    dob: student.dob ? student.dob.toISOString().slice(0, 10) : null,
    address: student.address ?? null,
    email: student.user.email,
    phone: student.user.phoneNumber ?? null,
    ...existingPersonal,
  };
  const mergedDetails = { ...details, personalInfo: mergedPersonalInfo };

  const loan = await prisma.loanApplication.create({
    data: {
      studentId: student.id,
      amount: input.amount,
      status: 'SUBMITTED',
      details: mergedDetails as Prisma.InputJsonValue,
      timeline: { create: { action: 'SUBMITTED', actionTakenBy: userId } },
    },
  });

  // Notify all admins
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  if (admins.length) {
    const name = [student.firstName, student.lastName].filter(Boolean).join(' ') || 'A student';
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: 'New loan application',
        message: `${name} submitted a loan application (₹${input.amount}).`,
      })),
    });
  }

  // Notify assigned agent if any
  if (student.agentId) {
    const agent = await prisma.agent.findUnique({
      where: { id: student.agentId },
      select: { userId: true },
    });
    if (agent) {
      const name = [student.firstName, student.lastName].filter(Boolean).join(' ') || 'A student';
      await prisma.notification.create({
        data: {
          userId: agent.userId,
          title: 'New loan application',
          message: `${name} submitted a loan application (₹${input.amount}).`,
        },
      });
    }
  }

  // New submission → confirm to the student and alert agent + admins.
  void emailLoanApplication(loan.id, 'SUBMITTED', { student: true, staff: true }).catch((e) =>
    console.error('[loans] application email failed:', (e as Error).message),
  );
  return loan;
}

export async function get(id: string, userId: string, role: Role) {
  const loan = await prisma.loanApplication.findUnique({
    where: { id },
    include: {
      student: { include: { user: { select: { email: true, phoneNumber: true } } } },
    },
  });
  if (!loan) throw AppError.notFound('Loan application not found');

  if (role === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student || loan.studentId !== student.id) {
      throw AppError.forbidden('Not your loan application');
    }
  }

  return loan;
}

export async function listForUser(userId: string, role: Role) {
  if (role === 'ADMIN' || role === 'AGENT') {
    return prisma.loanApplication.findMany({
      include: {
        student: { include: { user: { select: { email: true, phoneNumber: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw AppError.notFound('Student profile not found');
  return prisma.loanApplication.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTimeline(id: string, userId: string, role: Role) {
  await get(id, userId, role);
  return prisma.loanApplicationTimeline.findMany({
    where: { loanApplicationId: id },
    orderBy: { createdAt: 'asc' },
  });
}

export async function uploadDocument(
  userId: string,
  file: Express.Multer.File,
  docKey: string,
): Promise<{ key: string; signedPath: string }> {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw AppError.notFound('Student profile not found');
  const ext = file.originalname.split('.').pop() ?? 'bin';
  const storageKey = `loans/${student.id}/${docKey}/${Date.now()}.${ext}`;
  await getStorage().put(storageKey, file.buffer, file.mimetype);
  const signedPath = getStorage().getSignedUrl(storageKey);
  return { key: storageKey, signedPath };
}

export async function documentViewUrl(userId: string, role: Role, storageKey: string): Promise<string> {
  if (role === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student || !storageKey.startsWith(`loans/${student.id}/`)) {
      throw AppError.forbidden('Not your document');
    }
  }
  return getStorage().getSignedUrl(storageKey);
}

export async function updateStatus(
  id: string,
  actorId: string,
  status: string,
  documentRequest?: { reason: string; docs: string[] },
  reason?: string,
) {
  const loan = await prisma.loanApplication.findUnique({
    where: { id },
    include: { student: { select: { userId: true, firstName: true, lastName: true } } },
  });
  if (!loan) throw AppError.notFound('Loan application not found');

  // When requesting documents, store the request in details
  let detailsUpdate: Prisma.InputJsonValue | undefined;
  const currentDetails = (loan.details as Record<string, unknown>) ?? {};
  if (status === 'DOCUMENTS_REQUESTED' && documentRequest) {
    detailsUpdate = {
      ...currentDetails,
      documentRequest: {
        reason: documentRequest.reason,
        docs: documentRequest.docs,
        requestedAt: new Date().toISOString(),
        resolvedAt: null,
      },
    } as Prisma.InputJsonValue;
  } else if (status === 'REJECTED' && reason) {
    const { documentRequest: _dr, ...rest } = currentDetails;
    detailsUpdate = { ...rest, rejectionReason: reason } as Prisma.InputJsonValue;
  } else if (status !== 'DOCUMENTS_REQUESTED') {
    // Clear any pending document request when moving forward
    if (currentDetails.documentRequest) {
      const { documentRequest: _dr, ...rest } = currentDetails;
      detailsUpdate = rest as Prisma.InputJsonValue;
    }
  }

  const updated = await prisma.loanApplication.update({
    where: { id },
    data: {
      status: status as LoanStatus,
      ...(detailsUpdate !== undefined ? { details: detailsUpdate } : {}),
    },
  });

  await prisma.loanApplicationTimeline.create({
    data: { loanApplicationId: id, action: status, actionTakenBy: actorId },
  });

  const label = LOAN_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
  const message =
    status === 'DOCUMENTS_REQUESTED' && documentRequest
      ? `Additional documents requested: ${documentRequest.docs.join(', ')}. Reason: ${documentRequest.reason}`
      : `Your loan application status is now "${label}".`;

  await prisma.notification.create({
    data: { userId: loan.student.userId, title: label, message },
  });

  // Staff moved the application to another phase → email the student only.
  void emailLoanApplication(id, status, { student: true, staff: false }).catch((e) =>
    console.error('[loans] application email failed:', (e as Error).message),
  );
  return updated;
}

export async function resumeApplication(id: string, userId: string) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw AppError.notFound('Student profile not found');

  const loan = await prisma.loanApplication.findUnique({
    where: { id },
    include: { student: { select: { id: true } } },
  });
  if (!loan) throw AppError.notFound('Loan application not found');
  if (loan.student.id !== student.id) throw AppError.forbidden('Not your loan application');
  if (loan.status !== 'DOCUMENTS_REQUESTED') throw AppError.badRequest('Application is not awaiting documents');

  // Clear the documentRequest and move back to UNDER_REVIEW
  const currentDetails = (loan.details as Record<string, unknown>) ?? {};
  const { documentRequest: dr, ...rest } = currentDetails;
  const updatedDetails: Record<string, unknown> = {
    ...rest,
    ...(dr ? { documentRequest: { ...(dr as Record<string, unknown>), resolvedAt: new Date().toISOString() } } : {}),
  };

  const updated = await prisma.loanApplication.update({
    where: { id },
    data: { status: 'UNDER_REVIEW', details: updatedDetails as Prisma.InputJsonValue },
  });

  await prisma.loanApplicationTimeline.create({
    data: { loanApplicationId: id, action: 'DOCUMENTS_SUBMITTED', actionTakenBy: userId },
  });

  // Notify admins and agent
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  const name = [student.firstName, student.lastName].filter(Boolean).join(' ') || 'A student';
  if (admins.length) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: 'Documents submitted',
        message: `${name} has submitted the requested documents. Please resume review.`,
      })),
    });
  }
  if (student.agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: student.agentId }, select: { userId: true } });
    if (agent) {
      await prisma.notification.create({
        data: {
          userId: agent.userId,
          title: 'Documents submitted',
          message: `${name} has submitted the requested documents. Please resume review.`,
        },
      });
    }
  }

  // Student resubmitted documents → alert agent + admins so they can resume.
  void emailLoanApplication(id, 'DOCUMENTS_SUBMITTED', { student: false, staff: true }).catch((e) =>
    console.error('[loans] application email failed:', (e as Error).message),
  );
  return updated;
}

export async function updateDocumentStatus(
  loanId: string,
  actorId: string,
  role: Role,
  docKey: string,
  docStatus: string,
) {
  if (role === 'STUDENT') throw AppError.forbidden('Only admins/agents can update document status');

  const loan = await prisma.loanApplication.findUnique({
    where: { id: loanId },
    include: { student: { select: { userId: true, firstName: true, lastName: true } } },
  });
  if (!loan) throw AppError.notFound('Loan application not found');

  const details = (loan.details as Record<string, unknown>) ?? {};
  const groups = (details.documentGroups as Array<{
    category: string; label: string;
    documents: Array<{ key: string; label: string; status?: string; url?: string | null }>
  }>) ?? [];

  let docLabel = docKey;
  const updatedGroups = groups.map((g) => ({
    ...g,
    documents: g.documents.map((d) => {
      if (d.key === docKey) {
        docLabel = d.label;
        return { ...d, status: docStatus };
      }
      return d;
    }),
  }));

  const updated = await prisma.loanApplication.update({
    where: { id: loanId },
    data: { details: { ...details, documentGroups: updatedGroups } as Prisma.InputJsonValue },
  });

  // Notify student when a document is rejected
  if (docStatus === 'REJECTED') {
    await prisma.notification.create({
      data: {
        userId: loan.student.userId,
        title: 'Document rejected',
        message: `Your document "${docLabel}" was rejected. Please reupload a valid copy and resubmit.`,
      },
    });
  } else if (docStatus === 'VERIFIED') {
    await prisma.notification.create({
      data: {
        userId: loan.student.userId,
        title: 'Document verified',
        message: `Your document "${docLabel}" has been verified.`,
      },
    });
  }

  return updated;
}
