import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

type Input = {
  title?: string; slug?: string; excerpt?: string; content?: string; coverImage?: string;
  author?: string; category?: string; readTime?: string; isActive?: boolean;
  videoUrl?: string; publishedBy?: string;
};

export async function list() {
  return prisma.blog.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function get(id: string) {
  const item = await prisma.blog.findUnique({ where: { id } });
  if (!item) throw AppError.notFound('Blog not found');
  return item;
}

export async function getBySlug(slug: string) {
  const item = await prisma.blog.findUnique({ where: { slug } });
  if (!item) throw AppError.notFound('Blog not found');
  return item;
}

export async function create(input: Input) {
  try {
    return await prisma.blog.create({ data: input as Required<Input> });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw AppError.conflict('Slug already exists');
    }
    throw e;
  }
}

export async function update(id: string, input: Input) {
  await get(id);
  return prisma.blog.update({ where: { id }, data: input });
}

export async function remove(id: string) {
  await get(id);
  await prisma.blog.delete({ where: { id } });
  return { success: true };
}
