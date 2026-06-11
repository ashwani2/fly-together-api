import type { DocType, DocStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { getStorage } from '../../lib/storage/index.js';
import { AppError } from '../../lib/errors.js';

async function studentIdFor(userId: string): Promise<string> {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw AppError.notFound('Student profile not found');
  return student.id;
}

export async function upload(userId: string, docType: DocType, file: Express.Multer.File) {
  const studentId = await studentIdFor(userId);
  const key = `${studentId}/${Date.now()}-${file.originalname}`;
  await getStorage().put(key, file.buffer, file.mimetype);
  const doc = await prisma.studentDocument.create({ data: { studentId, docType, docUrl: key } });
  await prisma.student.update({ where: { id: studentId }, data: { isDocSubmitted: true } });
  return doc;
}

export async function list(userId: string) {
  const studentId = await studentIdFor(userId);
  return prisma.studentDocument.findMany({ where: { studentId, removed: false }, orderBy: { createdAt: 'desc' } });
}

export async function softDelete(userId: string, docId: string) {
  const studentId = await studentIdFor(userId);
  const doc = await prisma.studentDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.studentId !== studentId) throw AppError.notFound('Document not found');
  return prisma.studentDocument.update({ where: { id: docId }, data: { removed: true } });
}

export async function verify(docId: string, status: DocStatus) {
  const doc = await prisma.studentDocument.findUnique({ where: { id: docId } });
  if (!doc) throw AppError.notFound('Document not found');
  return prisma.studentDocument.update({ where: { id: docId }, data: { status } });
}
