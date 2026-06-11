import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

type Input = {
  name?: string; location?: string; logo?: string; rating?: number;
  tuitionFee?: string; description?: string; courses?: string[];
};

function shape(u: any) {
  return { ...u, courses: (u.courses ?? []).map((c: { name: string }) => c.name) };
}

export async function list() {
  const items = await prisma.university.findMany({ include: { courses: true }, orderBy: { createdAt: 'desc' } });
  return items.map(shape);
}

export async function get(id: string) {
  const item = await prisma.university.findUnique({ where: { id }, include: { courses: true } });
  if (!item) throw AppError.notFound('University not found');
  return shape(item);
}

export async function create(input: Input) {
  const { courses = [], ...rest } = input;
  const item = await prisma.university.create({
    data: { ...(rest as Required<Omit<Input, 'courses'>>), courses: { create: courses.map((name) => ({ name })) } },
    include: { courses: true },
  });
  return shape(item);
}

export async function update(id: string, input: Input) {
  await get(id);
  const { courses, ...rest } = input;
  if (courses) {
    await prisma.course.deleteMany({ where: { universityId: id } });
    await prisma.course.createMany({ data: courses.map((name) => ({ universityId: id, name })) });
  }
  const item = await prisma.university.update({ where: { id }, data: rest, include: { courses: true } });
  return shape(item);
}

export async function remove(id: string) {
  await get(id);
  await prisma.university.delete({ where: { id } });
  return { success: true };
}
