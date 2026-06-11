import type { Role, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

async function studentIdFor(userId: string): Promise<string> {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw AppError.notFound('Student profile not found');
  return student.id;
}

export async function create(userId: string, input: { amount: string; details?: Record<string, unknown> }) {
  const studentId = await studentIdFor(userId);
  return prisma.loanApplication.create({
    data: { studentId, amount: input.amount, details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined },
  });
}

export async function listForUser(userId: string, role: Role) {
  if (role === 'ADMIN') {
    return prisma.loanApplication.findMany({ include: { student: true }, orderBy: { createdAt: 'desc' } });
  }
  const studentId = await studentIdFor(userId);
  return prisma.loanApplication.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } });
}

export async function updateStatus(id: string, status: string) {
  const loan = await prisma.loanApplication.findUnique({ where: { id } });
  if (!loan) throw AppError.notFound('Loan application not found');
  return prisma.loanApplication.update({ where: { id }, data: { status } });
}
