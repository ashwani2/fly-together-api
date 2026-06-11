import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

type Input = { name?: string; imageUrl?: string; redirectionUrl?: string };

export async function list() {
  return prisma.partner.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function get(id: string) {
  const item = await prisma.partner.findUnique({ where: { id } });
  if (!item) throw AppError.notFound('Partner not found');
  return item;
}

export async function create(input: Input) {
  return prisma.partner.create({ data: input as Required<Input> });
}

export async function update(id: string, input: Input) {
  await get(id);
  return prisma.partner.update({ where: { id }, data: input });
}

export async function remove(id: string) {
  await get(id);
  await prisma.partner.delete({ where: { id } });
  return { success: true };
}
