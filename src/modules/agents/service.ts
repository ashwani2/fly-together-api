import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

export async function listAgents() {
  const agents = await prisma.agent.findMany({ include: { _count: { select: { students: true } } } });
  return agents.map((a) => ({
    id: a.id, name: a.name, status: a.status, numberOfStudents: a._count.students,
    createdAt: a.createdAt, updatedAt: a.updatedAt,
  }));
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
