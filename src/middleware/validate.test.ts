import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { validate } from './validate.js';
import { errorHandler } from './error.js';

function testApp() {
  const app = express();
  app.use(express.json());
  const schema = z.object({ body: z.object({ name: z.string().min(2) }) });
  app.post('/x', validate(schema), (req, res) => res.json({ data: req.body }));
  app.use(errorHandler);
  return app;
}

describe('validate', () => {
  it('rejects invalid body with 400', async () => {
    const res = await request(testApp()).post('/x').send({ name: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
  it('passes valid body', async () => {
    const res = await request(testApp()).post('/x').send({ name: 'abc' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('abc');
  });
});
