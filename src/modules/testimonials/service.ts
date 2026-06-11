import type { MediaType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

type Input = {
  studentName?: string; universityName?: string; content?: string; mediaUrl?: string;
  mediaType?: MediaType; avatarUrl?: string; isActive?: boolean;
};

export async function list() {
  return prisma.testimonial.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function get(id: string) {
  const item = await prisma.testimonial.findUnique({ where: { id } });
  if (!item) throw AppError.notFound('Testimonial not found');
  return item;
}

export async function create(input: Input) {
  return prisma.testimonial.create({ data: input as Required<Input> });
}

export async function update(id: string, input: Input) {
  await get(id);
  return prisma.testimonial.update({ where: { id }, data: input });
}

export async function remove(id: string) {
  await get(id);
  await prisma.testimonial.delete({ where: { id } });
  return { success: true };
}
