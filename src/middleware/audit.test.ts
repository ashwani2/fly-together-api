import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { auditLog } from './audit.js';
import { requireAuth } from './auth.js';
import { errorHandler } from './error.js';
import { prisma } from '../lib/prisma.js';
import { resetDb, createUser } from '../test/helpers.js';

function testApp() {
  const app = express();
  app.use(express.json());
  app.post('/things/:id', requireAuth, auditLog('UPDATE', 'thing'), (req, res) => res.json({ data: { ok: true } }));
  app.use(errorHandler);
  return app;
}

describe('auditLog', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('writes an audit row on a successful 2xx response', async () => {
    const { auth, user } = await createUser('ADMIN');
    const res = await request(testApp()).post('/things/abc').set('Authorization', auth).send({});
    expect(res.status).toBe(200);
    // res.on('finish') fires after the response; poll briefly for the async write.
    let logs = await prisma.auditLog.findMany();
    for (let i = 0; i < 20 && logs.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 25));
      logs = await prisma.auditLog.findMany();
    }
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'UPDATE', entity: 'thing', entityId: 'abc', userId: user.id });
  });
});
