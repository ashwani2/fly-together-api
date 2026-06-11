import type { ServiceCategory } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

type Input = {
  name?: string; category?: ServiceCategory; rating?: number;
  price?: string; location?: string; image?: string; description?: string;
};

export async function list(query: { category?: ServiceCategory }) {
  return prisma.serviceProvider.findMany({
    where: { ...(query.category ? { category: query.category } : {}) },
    orderBy: { createdAt: 'desc' },
  });
}

export async function get(id: string) {
  const item = await prisma.serviceProvider.findUnique({ where: { id } });
  if (!item) throw AppError.notFound('Service provider not found');
  return item;
}

export async function create(input: Input) {
  return prisma.serviceProvider.create({ data: input as Required<Input> });
}

export async function update(id: string, input: Input) {
  await get(id);
  return prisma.serviceProvider.update({ where: { id }, data: input });
}

export async function remove(id: string) {
  await get(id);
  await prisma.serviceProvider.delete({ where: { id } });
  return { success: true };
}
