import crypto from 'node:crypto';
import type { MediaType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { getStorage } from '../../lib/storage/index.js';
import { storedFileUrl } from '../../lib/storage/signing.js';

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

// Testimonial photos are public (shown on the homepage), so we persist a
// permanent signed URL rather than a short-lived one. Only square-ish headshots
// are expected — the client enforces aspect/resolution; here we guard the type.
const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function uploadImage(file: { buffer: Buffer; mimetype: string }) {
  const ext = IMAGE_EXT[file.mimetype];
  if (!ext) throw AppError.badRequest('Unsupported image type. Please use JPG, PNG or WebP.');
  if (!file.buffer?.length) throw AppError.badRequest('The uploaded image is empty.');
  const key = `testimonials/${crypto.randomUUID()}.${ext}`;
  await getStorage().put(key, file.buffer, file.mimetype);
  return { url: storedFileUrl(key) };
}
