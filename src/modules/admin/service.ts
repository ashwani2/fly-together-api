import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

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

/** All course applications, enriched with the applicant and their assigned agent — for the admin queue. */
export async function applications() {
  const apps = await prisma.application.findMany({
    orderBy: { createdAt: 'desc' },
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
  });

  return apps.map((a) => {
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
}

/** All students for the admin student list. */
export async function students() {
  const rows = await prisma.student.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { email: true, phoneNumber: true } },
      agent: { select: { id: true, name: true } },
      _count: { select: { documents: { where: { removed: false } } } },
    },
  });
  return rows.map((s) => ({
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

/** Signed URL for any student document — admin bypass (no ownership check). */
export async function studentDocumentUrl(studentId: string, docId: string) {
  const { getStorage } = await import('../../lib/storage/index.js');
  const doc = await prisma.studentDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.studentId !== studentId || doc.removed) throw AppError.notFound('Document not found');
  return getStorage().getSignedUrl(doc.docUrl);
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
  await prisma.applicationTimeline.create({
    data: { applicationId, action: agentId ? 'AGENT_ASSIGNED' : 'AGENT_UNASSIGNED', actionTakenBy: adminUserId },
  });
  return { success: true };
}
