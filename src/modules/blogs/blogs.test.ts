import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

const sample = {
  title: 'Top 5 UK Universities', slug: 'top-5-uk-universities-2024', excerpt: 'excerpt here',
  content: 'content here', coverImage: 'https://i', author: 'Editorial',
  category: 'Education', readTime: '6 min read',
};

describe('blogs', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lists publicly', async () => {
    const res = await request(app).get('/api/blogs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('admin can create', async () => {
    const { auth } = await createUser('ADMIN');
    const res = await request(app).post('/api/blogs').set('Authorization', auth).send(sample);
    expect(res.status).toBe(201);
  });

  it('fetches by slug', async () => {
    const { auth } = await createUser('ADMIN');
    await request(app).post('/api/blogs').set('Authorization', auth).send(sample);
    const res = await request(app).get(`/api/blogs/slug/${sample.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe(sample.title);
  });

  it('rejects a duplicate slug with 409', async () => {
    const { auth } = await createUser('ADMIN');
    await request(app).post('/api/blogs').set('Authorization', auth).send(sample);
    const res = await request(app).post('/api/blogs').set('Authorization', auth).send(sample);
    expect(res.status).toBe(409);
  });

  it('non-admin cannot create', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).post('/api/blogs').set('Authorization', auth).send(sample);
    expect(res.status).toBe(403);
  });
});
