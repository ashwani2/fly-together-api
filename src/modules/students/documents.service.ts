import type { DocType, DocStatus, AcademicSubType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { getStorage } from '../../lib/storage/index.js';
import { AppError } from '../../lib/errors.js';
import { notifyDocumentReview } from '../notifications/service.js';

async function studentIdFor(userId: string): Promise<string> {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw AppError.notFound('Student profile not found');
  return student.id;
}

export async function upload(userId: string, docType: DocType, file: Express.Multer.File, subType?: AcademicSubType) {
  const studentId = await studentIdFor(userId);
  const key = `${studentId}/${Date.now()}-${file.originalname}`;
  await getStorage().put(key, file.buffer, file.mimetype);
  const doc = await prisma.studentDocument.create({ data: { studentId, docType, docUrl: key, subType: subType ?? null } });
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

export async function viewUrl(userId: string, docId: string): Promise<string> {
  const studentId = await studentIdFor(userId);
  const doc = await prisma.studentDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.studentId !== studentId || doc.removed) throw AppError.notFound('Document not found');
  return getStorage().getSignedUrl(doc.docUrl); // relative path: /api/files/<key>?expires=&sig=
}

export async function verify(docId: string, status: DocStatus) {
  const doc = await prisma.studentDocument.findUnique({ where: { id: docId } });
  if (!doc) throw AppError.notFound('Document not found');
  const updated = await prisma.studentDocument.update({ where: { id: docId }, data: { status } });

  // Rejecting a document prompts the student to re-upload it — record it on the
  // timeline of their active applications so they see it in their journey.
  if (status === 'REJECTED') {
    const token = doc.subType ? `${doc.docType}_${doc.subType}` : doc.docType;
    const apps = await prisma.application.findMany({
      where: { studentId: doc.studentId, status: { notIn: ['COMPLETED', 'REJECTED'] } },
      select: { id: true },
    });
    if (apps.length) {
      await prisma.applicationTimeline.createMany({
        data: apps.map((a) => ({ applicationId: a.id, action: `REUPLOAD_REQUESTED_${token}` })),
      });
    }
  }

  // Notify the student when a document is verified or rejected.
  if (status === 'VERIFIED' || status === 'REJECTED') {
    await notifyDocumentReview(doc.studentId, doc.docType, doc.subType, status);
  }
  return updated;
}
