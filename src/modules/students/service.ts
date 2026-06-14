import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

const PROFILE_FIELDS = ['firstName', 'lastName', 'dob', 'address'] as const;

function completion(s: Record<string, unknown>): number {
  const filled = PROFILE_FIELDS.filter((f) => s[f] != null && s[f] !== '').length;
  return Math.round((filled / PROFILE_FIELDS.length) * 100);
}

export async function getProfile(userId: string) {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: { agent: { select: { id: true, name: true } } },
  });
  if (!student) throw AppError.notFound('Student profile not found');
  return student;
}

export async function updateProfile(
  userId: string,
  data: { firstName?: string; lastName?: string; dob?: string; address?: string; phoneNumber?: string },
) {
  const student = await getProfile(userId);
  const next = {
    firstName: data.firstName ?? student.firstName,
    lastName: data.lastName ?? student.lastName,
    dob: data.dob ? new Date(data.dob) : student.dob,
    address: data.address ?? student.address,
  };
  const profileCompletion = completion(next);
  if (data.phoneNumber) {
    await prisma.user.update({ where: { id: userId }, data: { phoneNumber: data.phoneNumber } });
  }
  return prisma.student.update({
    where: { id: student.id },
    data: { ...next, profileCompletion, isProfileCompleted: profileCompletion === 100 },
  });
}
