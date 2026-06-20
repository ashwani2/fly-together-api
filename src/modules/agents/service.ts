import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/hash.js';
import * as documentsService from '../students/documents.service.js';

export async function listAgents() {
  const agents = await prisma.agent.findMany({
    include: { _count: { select: { students: true } }, user: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return agents.map((a) => ({
    id: a.id, name: a.name, email: a.user.email, status: a.status, numberOfStudents: a._count.students,
    createdAt: a.createdAt, updatedAt: a.updatedAt,
  }));
}

/** Admin onboards a new agent: creates the login (User, role AGENT) and the Agent profile. */
export async function createAgent(input: { name: string; email: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw AppError.conflict('Email already registered');

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: 'AGENT',
      agent: { create: { name: input.name } },
    },
    include: { agent: true },
  });
  const agent = user.agent!;
  return {
    id: agent.id, name: agent.name, email: user.email, status: agent.status,
    numberOfStudents: 0, createdAt: agent.createdAt, updatedAt: agent.updatedAt,
  };
}

export async function deleteAgent(id: string) {
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) throw AppError.notFound('Agent not found');
  // Release any students this agent owns, then delete the login (cascades to the Agent row).
  await prisma.student.updateMany({ where: { agentId: id }, data: { agentId: null } });
  await prisma.user.delete({ where: { id: agent.userId } });
  return { success: true };
}

export async function assignedStudents(userId: string) {
  const agent = await prisma.agent.findUnique({ where: { userId } });
  if (!agent) throw AppError.notFound('Agent not found');
  return prisma.student.findMany({ where: { agentId: agent.id }, include: { user: { select: { email: true } } } });
}

export async function verifyStudent(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw AppError.notFound('Student not found');
  return prisma.student.update({ where: { id: studentId }, data: { isProfileVerified: true } });
}

/** Course applications of the students assigned to this agent, with the applicant's documents. */
export async function assignedApplications(userId: string) {
  const agent = await prisma.agent.findUnique({ where: { userId } });
  if (!agent) throw AppError.notFound('Agent not found');

  const apps = await prisma.application.findMany({
    where: { student: { agentId: agent.id } },
    orderBy: { createdAt: 'desc' },
    include: {
      student: {
        select: {
          id: true, firstName: true, lastName: true, profileCompletion: true,
          isProfileCompleted: true, isProfileVerified: true,
          user: { select: { email: true, phoneNumber: true } },
          documents: { where: { removed: false }, orderBy: { createdAt: 'desc' } },
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
        documentCount: s.documents.length,
      },
      documents: s.documents,
    };
  });
}

/** Signed URL for a document belonging to one of this agent's students. */
export async function studentDocumentUrl(userId: string, studentId: string, docId: string) {
  const agent = await prisma.agent.findUnique({ where: { userId } });
  if (!agent) throw AppError.notFound('Agent not found');
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || student.agentId !== agent.id) throw AppError.notFound('Student not found');

  const doc = await prisma.studentDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.studentId !== studentId || doc.removed) throw AppError.notFound('Document not found');

  const { resolveStoredFileUrl } = await import('../../lib/storage/signing.js');
  return resolveStoredFileUrl(doc.docUrl);
}

/** Verify (or set the status of) a document — scoped to this agent's students. */
export async function verifyDocument(
  userId: string,
  docId: string,
  status: 'UPLOADED' | 'PENDING' | 'VERIFIED' | 'REJECTED',
) {
  const agent = await prisma.agent.findUnique({ where: { userId } });
  if (!agent) throw AppError.notFound('Agent not found');
  const doc = await prisma.studentDocument.findUnique({
    where: { id: docId },
    include: { student: { select: { agentId: true } } },
  });
  if (!doc || doc.removed || doc.student.agentId !== agent.id) throw AppError.notFound('Document not found');
  // Reuse the shared verify so the re-upload timeline prompt is recorded consistently.
  return documentsService.verify(docId, status);
}
