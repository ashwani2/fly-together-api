import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

const sample = {
  studentName: 'Aarav Sharma', universityName: 'University of Oxford',
  content: 'Seamless journey', mediaUrl: 'https://i', mediaType: 'IMAGE',
};

describe('testimonials', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lists publicly', async () => {
    const res = await request(app).get('/api/testimonials');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('admin can create', async () => {
    const { auth } = await createUser('ADMIN');
    const res = await request(app).post('/api/testimonials').set('Authorization', auth).send(sample);
    expect(res.status).toBe(201);
    expect(res.body.data.mediaType).toBe('IMAGE');
  });

  it('non-admin cannot create', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).post('/api/testimonials').set('Authorization', auth).send(sample);
    expect(res.status).toBe(403);
  });

  // 1×1 PNG.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  it('admin can upload a testimonial photo and gets a permanent URL', async () => {
    const { auth } = await createUser('ADMIN');
    const res = await request(app)
      .post('/api/testimonials/upload-image')
      .set('Authorization', auth)
      .attach('file', PNG, { filename: 'face.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(typeof res.body.data.url).toBe('string');
    expect(res.body.data.url).toContain('/api/files/');
  });

  it('rejects a non-image upload', async () => {
    const { auth } = await createUser('ADMIN');
    const res = await request(app)
      .post('/api/testimonials/upload-image')
      .set('Authorization', auth)
      .attach('file', Buffer.from('not an image'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('forbids non-admins from uploading', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app)
      .post('/api/testimonials/upload-image')
      .set('Authorization', auth)
      .attach('file', PNG, { filename: 'face.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });
});
