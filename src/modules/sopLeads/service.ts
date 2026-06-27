import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

interface CreateInput {
  fullName: string;
  country?: string;
  university: string;
  campus?: string;
  course: string;
}

/** Record a single SOP-generator submission as a lead. */
export async function create(input: CreateInput) {
  return prisma.sopLead.create({
    data: {
      fullName: input.fullName.trim(),
      country: input.country?.trim() || null,
      university: input.university.trim(),
      campus: input.campus?.trim() || null,
      course: input.course.trim(),
    },
  });
}

interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

/**
 * Paginated SOP leads for the admin console (newest first), with optional
 * server-side search across name, university, course, country and campus.
 */
export async function list(query: ListQuery = {}) {
  const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.trunc(query.pageSize ?? 10) || 10));
  const search = query.search?.trim();

  const where: Prisma.SopLeadWhereInput = {};
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { university: { contains: search, mode: 'insensitive' } },
      { course: { contains: search, mode: 'insensitive' } },
      { country: { contains: search, mode: 'insensitive' } },
      { campus: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.sopLead.count({ where }),
    prisma.sopLead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
