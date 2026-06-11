import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

type Input = {
  name?: string; city?: string; universityProximity?: string; price?: string;
  type?: string; amenities?: string[]; image?: string; description?: string;
};

// `maxPrice` is a no-op placeholder until prices migrate to a numeric column.
export async function list(query: { city?: string; type?: string; maxPrice?: string }) {
  return prisma.accommodation.findMany({
    where: {
      ...(query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {}),
      ...(query.type ? { type: query.type } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function get(id: string) {
  const item = await prisma.accommodation.findUnique({ where: { id } });
  if (!item) throw AppError.notFound('Accommodation not found');
  return item;
}

export async function create(input: Input) {
  return prisma.accommodation.create({ data: input as Required<Input> });
}

export async function update(id: string, input: Input) {
  await get(id);
  return prisma.accommodation.update({ where: { id }, data: input });
}

export async function remove(id: string) {
  await get(id);
  await prisma.accommodation.delete({ where: { id } });
  return { success: true };
}
