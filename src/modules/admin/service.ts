import { prisma } from '../../lib/prisma.js';

export async function stats() {
  const [students, agents, applications, documents, universities] = await Promise.all([
    prisma.student.count(),
    prisma.agent.count(),
    prisma.application.count(),
    prisma.studentDocument.count({ where: { removed: false } }),
    prisma.university.count(),
  ]);
  return { students, agents, applications, documents, universities };
}
