import type { Prisma, ApplicationStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { notifyApplicationAction } from '../notifications/service.js';

const APPLICATION_STATUSES: ApplicationStatus[] = [
  'CREATED', 'REJECTED', 'DOCUMENT_VERIFIED', 'SENT_TO_UNIVERSITY',
  'PENDING_WITH_UNIVERSITY', 'VERIFIED_BY_UNIVERSITY', 'PAYMENT_PENDING', 'COMPLETED',
];

export interface ApplicationsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}

export interface StudentsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

function paging(page?: number, pageSize?: number) {
  const p = Math.max(1, Math.trunc(page ?? 1) || 1);
  const ps = Math.min(100, Math.max(1, Math.trunc(pageSize ?? 10) || 10));
  return { p, ps };
}

export async function stats() {
  const [students, agents, applications, documents, universities] = await Promise.all([
    prisma.student.count(),
    prisma.agent.count(),
    prisma.application.count(),
    prisma.studentDocument.count({ where: { removed: false } }),
    prisma.university.count(),
  ]);
  return { students, agents, applications, documents, universities };
}

/**
 * Paginated course applications for the admin queue, with optional server-side
 * search (student name/email, university, course) and phase filtering.
 */
export async function applications(query: ApplicationsQuery = {}) {
  const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.trunc(query.pageSize ?? 10) || 10));
  const search = query.search?.trim();
  const status = query.status && APPLICATION_STATUSES.includes(query.status as ApplicationStatus)
    ? (query.status as ApplicationStatus)
    : undefined;

  const where: Prisma.ApplicationWhereInput = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { universityName: { contains: search, mode: 'insensitive' } },
      { course: { contains: search, mode: 'insensitive' } },
      { student: { firstName: { contains: search, mode: 'insensitive' } } },
      { student: { lastName: { contains: search, mode: 'insensitive' } } },
      { student: { user: { email: { contains: search, mode: 'insensitive' } } } },
    ];
  }

  const [total, apps] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        student: {
          select: {
            id: true, firstName: true, lastName: true, profileCompletion: true,
            isProfileCompleted: true, isProfileVerified: true,
            user: { select: { email: true, phoneNumber: true } },
            agent: { select: { id: true, name: true } },
            _count: { select: { documents: true } },
          },
        },
      },
    }),
  ]);

  const items = apps.map((a) => {
    const s = a.student;
    const name = [s.firstName, s.lastName].filter(Boolean).join(' ').trim();
    return {
      id: a.id,
      universityName: a.universityName,
      course: a.course,
      status: a.status,
      paymentStatus: a.paymentStatus,
      paymentLink: a.paymentLink,
      rejectionReason: a.rejectionReason,
      createdAt: a.createdAt,
      student: {
        id: s.id,
        name: name || s.user.email,
        email: s.user.email,
        phoneNumber: s.user.phoneNumber,
        profileCompletion: s.profileCompletion,
        isProfileCompleted: s.isProfileCompleted,
        isProfileVerified: s.isProfileVerified,
        documentCount: s._count.documents,
      },
      agent: s.agent ? { id: s.agent.id, name: s.agent.name } : null,
    };
  });

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Paginated students for the admin student list, with optional server-side search. */
export async function students(query: StudentsQuery = {}) {
  const { p: page, ps: pageSize } = paging(query.page, query.pageSize);
  const search = query.search?.trim();

  const where: Prisma.StudentWhereInput = {};
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { email: true, phoneNumber: true } },
        agent: { select: { id: true, name: true } },
        _count: { select: { documents: { where: { removed: false } } } },
      },
    }),
  ]);

  const items = rows.map((s) => ({
    id: s.id,
    userId: s.userId,
    firstName: s.firstName,
    lastName: s.lastName,
    email: s.user.email,
    phoneNumber: s.user.phoneNumber,
    dob: s.dob,
    address: s.address,
    profileCompletion: s.profileCompletion,
    isProfileCompleted: s.isProfileCompleted,
    isProfileVerified: s.isProfileVerified,
    isDocSubmitted: s.isDocSubmitted,
    documentCount: s._count.documents,
    agent: s.agent ? { id: s.agent.id, name: s.agent.name } : null,
    createdAt: s.createdAt,
  }));

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Single student detail with their documents. */
export async function studentDetail(studentId: string) {
  const s = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { email: true, phoneNumber: true } },
      agent: { select: { id: true, name: true } },
      documents: { where: { removed: false }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!s) throw AppError.notFound('Student not found');
  return {
    id: s.id,
    userId: s.userId,
    firstName: s.firstName,
    lastName: s.lastName,
    email: s.user.email,
    phoneNumber: s.user.phoneNumber,
    dob: s.dob,
    address: s.address,
    profileCompletion: s.profileCompletion,
    isProfileCompleted: s.isProfileCompleted,
    isProfileVerified: s.isProfileVerified,
    isDocSubmitted: s.isDocSubmitted,
    agent: s.agent ? { id: s.agent.id, name: s.agent.name } : null,
    documents: s.documents,
    createdAt: s.createdAt,
  };
}

/** Full document URL — admin bypass (no ownership check). */
export async function studentDocumentUrl(studentId: string, docId: string) {
  const { resolveStoredFileUrl } = await import('../../lib/storage/signing.js');
  const doc = await prisma.studentDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.studentId !== studentId || doc.removed) throw AppError.notFound('Document not found');
  return resolveStoredFileUrl(doc.docUrl);
}

/** Assign (or clear) the agent who handles the student behind an application. */
export async function assignAgent(applicationId: string, agentId: string | null, adminUserId: string) {
  const app = await prisma.application.findUnique({ where: { id: applicationId }, select: { studentId: true } });
  if (!app) throw AppError.notFound('Application not found');

  if (agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw AppError.notFound('Agent not found');
  }

  await prisma.student.update({ where: { id: app.studentId }, data: { agentId: agentId ?? null } });
  const action = agentId ? 'AGENT_ASSIGNED' : 'AGENT_UNASSIGNED';
  await prisma.applicationTimeline.create({
    data: { applicationId, action, actionTakenBy: adminUserId },
  });
  await notifyApplicationAction(applicationId, action);
  return { success: true };
}
