import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

describe('student documents', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('uploads a document and lists it', async () => {
    const { auth } = await createUser('STUDENT');
    const up = await request(app)
      .post('/api/students/me/documents')
      .set('Authorization', auth)
      .field('docType', 'PASSPORT')
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'passport.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    expect(up.body.data.docType).toBe('PASSPORT');
    expect(up.body.data.status).toBe('UPLOADED');

    const list = await request(app).get('/api/students/me/documents').set('Authorization', auth);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('rejects a disallowed file type', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app)
      .post('/api/students/me/documents')
      .set('Authorization', auth)
      .field('docType', 'PASSPORT')
      .attach('file', Buffer.from('x'), { filename: 'x.exe', contentType: 'application/octet-stream' });
    expect(res.status).toBe(400);
  });

  it('soft-deletes a document', async () => {
    const { auth } = await createUser('STUDENT');
    const up = await request(app).post('/api/students/me/documents').set('Authorization', auth)
      .field('docType', 'IELTS')
      .attach('file', Buffer.from('hi'), { filename: 'i.jpg', contentType: 'image/jpeg' });
    const del = await request(app).delete(`/api/documents/${up.body.data.id}`).set('Authorization', auth);
    expect(del.status).toBe(200);
    const doc = await prisma.studentDocument.findUnique({ where: { id: up.body.data.id } });
    expect(doc?.removed).toBe(true);
  });
});
