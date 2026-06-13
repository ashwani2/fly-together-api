import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/hash.js';

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
