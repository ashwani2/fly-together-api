# Fly Together Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PostgreSQL-backed REST API (Express + TypeScript + Prisma) that serves the existing Fly Together React FE, with JWT auth, document upload/verification, content CRUD, applications, and GDPR audit/consent.

**Architecture:** Standalone Express app in `D:\fly-together-api`. Domain modules (`src/modules/<domain>/`) each expose `routes → controller → service → schema(zod)`. Prisma is the data layer over PostgreSQL (Docker for local dev). Cross-cutting middleware handles auth (JWT), RBAC, validation, audit logging, and errors. A `StorageProvider` abstraction stores documents on local disk now, S3 later. TDD throughout with Vitest + supertest against a disposable test database.

**Tech Stack:** Node 20+, Express 4, TypeScript, Prisma, PostgreSQL 16, zod, bcrypt, jsonwebtoken, multer, helmet, cors, express-rate-limit, Vitest, supertest, tsx.

> **Conventions used by every module:** API base path is `/api`. Success responses are `{ data }`; errors are `{ error: { code, message, details? } }` thrown as `AppError` and formatted by the central error handler (Task 4). All routes that mutate data are wrapped with `auditLog(...)` (Task 10). Field names in JSON responses match the FE `D:\fly-together\src\types.ts` interfaces where one exists.

---

## File Structure

```
fly-together-api/
  docker-compose.yml
  .env  .env.example  .gitignore
  package.json  tsconfig.json  vitest.config.ts
  prisma/
    schema.prisma
    seed.ts
  src/
    index.ts                 # createApp() + listen
    app.ts                   # createApp(): wires middleware + routes (testable, no listen)
    config/env.ts
    lib/
      prisma.ts
      hash.ts
      jwt.ts
      errors.ts              # AppError
      storage/index.ts       # StorageProvider + getStorage()
      storage/local.ts       # LocalStorage
    middleware/
      auth.ts                # requireAuth
      rbac.ts                # requireRole
      validate.ts            # validate(schema)
      audit.ts               # auditLog(action, entity)
      error.ts               # errorHandler
    modules/
      auth/                  # register, login, refresh, logout, me
      students/              # profile + documents
      agents/
      universities/
      accommodations/
      serviceProviders/
      partners/
      blogs/
      testimonials/
      loans/
      applications/
      admin/                 # stats
      audit/                 # read logs
      consent/
    test/
      helpers.ts             # test app + db reset + auth helpers
  uploads/                   # gitignored
  docs/API.md                # contract for FE team
```

---

## Phase 0 — Project Setup

### Task 1: Scaffold project, dependencies, Docker, env config

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `.env`, `docker-compose.yml`, `vitest.config.ts`, `src/config/env.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "fly-together-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:up": "docker compose up -d",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate",
    "seed": "tsx prisma/seed.ts"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "dependencies": {
    "@prisma/client": "^6.1.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "express-rate-limit": "^7.4.1",
    "helmet": "^8.0.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/multer": "^1.4.12",
    "@types/node": "^22.10.0",
    "@types/supertest": "^6.0.2",
    "prisma": "^6.1.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["src", "prisma"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
uploads/
.env
*.log
```

- [ ] **Step 4: Create `.env.example` and copy to `.env`**

```
DATABASE_URL="postgresql://flyuser:flypass@localhost:5433/flytogether?schema=public"
PORT=4000
JWT_ACCESS_SECRET="dev-access-secret-change-me"
JWT_REFRESH_SECRET="dev-refresh-secret-change-me"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="7d"
CORS_ORIGIN="http://localhost:3000"
STORAGE_DRIVER="local"
UPLOAD_DIR="uploads"
SIGNED_URL_SECRET="dev-signed-url-secret"
SIGNED_URL_TTL_SECONDS="300"
```

Run: `Copy-Item .env.example .env`

- [ ] **Step 5: Create `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: flyuser
      POSTGRES_PASSWORD: flypass
      POSTGRES_DB: flytogether
    ports:
      - "5433:5432"
    volumes:
      - flydata:/var/lib/postgresql/data
volumes:
  flydata:
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
```

- [ ] **Step 7: Create `src/config/env.ts`**

```ts
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(4000),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  SIGNED_URL_SECRET: z.string().min(8),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().default(300),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
```

- [ ] **Step 8: Install dependencies and start the database**

Run: `npm install`
Run: `npm run db:up`
Expected: `npm install` completes; `docker compose` reports the `db` container started.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold backend project, deps, docker, env config"
```

---

### Task 2: Prisma schema + initial migration

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/prisma.ts`

- [ ] **Step 1: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role { STUDENT ADMIN AGENT }
enum AgentStatus { ACTIVE INACTIVE }
enum DocType { PASSPORT AADHAR ACADEMICS IELTS }
enum DocStatus { UPLOADED PENDING VERIFIED REJECTED }
enum ServiceCategory { ACCOMMODATION TICKET_BOOKING LOANS LOGISTICS ONLINE_PAYMENT }
enum MediaType { IMAGE VIDEO }
enum ApplicationStatus { PROFILE DOCUMENTS VERIFICATION APPLICATION PAYMENT COMPLETED }
enum PaymentStatus { PENDING COMPLETED FAILED }

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         Role     @default(STUDENT)
  phoneNumber  String?
  student      Student?
  agent        Agent?
  consents     Consent[]
  auditLogs    AuditLog[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Student {
  id                 String   @id @default(cuid())
  userId             String   @unique
  user               User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  agentId            String?
  agent              Agent?   @relation(fields: [agentId], references: [id])
  firstName          String?
  lastName           String?
  dob                DateTime?
  address            String?
  isProfileCompleted Boolean  @default(false)
  isProfileVerified  Boolean  @default(false)
  isDocSubmitted     Boolean  @default(false)
  profileCompletion  Int      @default(0)
  documents          StudentDocument[]
  applications       Application[]
  loanApplications   LoanApplication[]
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model Agent {
  id        String      @id @default(cuid())
  userId    String      @unique
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  status    AgentStatus @default(ACTIVE)
  students  Student[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
}

model StudentDocument {
  id        String    @id @default(cuid())
  studentId String
  student   Student   @relation(fields: [studentId], references: [id], onDelete: Cascade)
  docUrl    String
  docType   DocType
  status    DocStatus @default(UPLOADED)
  removed   Boolean   @default(false)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model University {
  id           String        @id @default(cuid())
  name         String
  location     String
  logo         String
  rating       Float         @default(0)
  tuitionFee   String
  description  String
  courses      Course[]
  applications Application[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}

model Course {
  id           String     @id @default(cuid())
  universityId String
  university   University @relation(fields: [universityId], references: [id], onDelete: Cascade)
  name         String
}

model Accommodation {
  id                  String   @id @default(cuid())
  name                String
  city                String
  universityProximity String?
  price               String
  type                String
  amenities           String[]
  image               String
  description         String
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model ServiceProvider {
  id          String          @id @default(cuid())
  name        String
  category    ServiceCategory
  rating      Float           @default(0)
  price       String
  location    String?
  image       String
  description String
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}

model Partner {
  id            String   @id @default(cuid())
  name          String
  imageUrl      String
  redirectionUrl String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model LoanApplication {
  id        String   @id @default(cuid())
  studentId String
  student   Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  amount    String
  status    String   @default("PENDING")
  details   Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Blog {
  id          String   @id @default(cuid())
  title       String
  slug        String   @unique
  excerpt     String
  content     String
  coverImage  String
  author      String
  category    String
  readTime    String
  isActive    Boolean  @default(true)
  videoUrl    String?
  publishedBy String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Testimonial {
  id             String    @id @default(cuid())
  studentName    String
  universityName String?
  content        String
  mediaUrl       String
  mediaType      MediaType @default(IMAGE)
  avatarUrl      String?
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

model Application {
  id              String              @id @default(cuid())
  studentId       String
  student         Student             @relation(fields: [studentId], references: [id], onDelete: Cascade)
  universityId    String
  university      University          @relation(fields: [universityId], references: [id])
  course          String
  status          ApplicationStatus   @default(PROFILE)
  rejectionReason String?
  paymentLink     String?
  paymentStatus   PaymentStatus       @default(PENDING)
  timeline        ApplicationTimeline[]
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
}

model ApplicationTimeline {
  id            String      @id @default(cuid())
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  action        String
  actionTakenBy String?
  createdAt     DateTime    @default(now())
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id])
  action    String
  entity    String
  entityId  String?
  ip        String?
  metadata  Json?
  createdAt DateTime @default(now())
}

model Consent {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  consentType String
  granted     Boolean  @default(true)
  version     String   @default("1.0")
  createdAt   DateTime @default(now())
}
```

- [ ] **Step 2: Create `src/lib/prisma.ts`**

```ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 3: Generate client and run the first migration**

Run: `npm run prisma:migrate -- --name init`
Expected: Prisma creates `prisma/migrations/<timestamp>_init/` and prints "Your database is now in sync".

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: prisma schema and initial migration"
```

---

### Task 3: Errors lib + test infrastructure

**Files:**
- Create: `src/lib/errors.ts`, `src/test/helpers.ts`

- [ ] **Step 1: Create `src/lib/errors.ts`**

```ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
  static badRequest(msg: string, details?: unknown) { return new AppError(400, 'BAD_REQUEST', msg, details); }
  static unauthorized(msg = 'Unauthorized') { return new AppError(401, 'UNAUTHORIZED', msg); }
  static forbidden(msg = 'Forbidden') { return new AppError(403, 'FORBIDDEN', msg); }
  static notFound(msg = 'Not found') { return new AppError(404, 'NOT_FOUND', msg); }
  static conflict(msg: string) { return new AppError(409, 'CONFLICT', msg); }
}
```

- [ ] **Step 2: Create `src/test/helpers.ts`**

```ts
import { prisma } from '../lib/prisma.js';
import { createApp } from '../app.js';
import { hashPassword } from '../lib/hash.js';
import { signAccessToken } from '../lib/jwt.js';
import type { Role } from '@prisma/client';

export const app = createApp();

// Order matters: delete children before parents.
export async function resetDb() {
  await prisma.applicationTimeline.deleteMany();
  await prisma.application.deleteMany();
  await prisma.loanApplication.deleteMany();
  await prisma.studentDocument.deleteMany();
  await prisma.course.deleteMany();
  await prisma.consent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.student.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.university.deleteMany();
  await prisma.accommodation.deleteMany();
  await prisma.serviceProvider.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.blog.deleteMany();
  await prisma.testimonial.deleteMany();
  await prisma.user.deleteMany();
}

export async function createUser(role: Role, email = `${role.toLowerCase()}@test.com`) {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('Password1!'), role },
  });
  if (role === 'STUDENT') await prisma.student.create({ data: { userId: user.id } });
  if (role === 'AGENT') await prisma.agent.create({ data: { userId: user.id, name: 'Test Agent' } });
  const token = signAccessToken({ sub: user.id, role });
  return { user, token, auth: `Bearer ${token}` };
}
```

> Note: `helpers.ts` imports `app.ts`, `hash.ts`, and `jwt.ts` which are created in Tasks 4–6. It will not type-check until those exist; that is expected. Tests that use it run starting in Task 5.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: AppError and test helpers"
```

---

### Task 4: Express app bootstrap + error handler + health route

**Files:**
- Create: `src/middleware/error.ts`, `src/app.ts`, `src/index.ts`
- Test: `src/app.test.ts`

- [ ] **Step 1: Write the failing test — `src/app.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

describe('app', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('unknown route returns 404 error shape', async () => {
    const res = await request(createApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app.test.ts`
Expected: FAIL — cannot find `./app.js`.

- [ ] **Step 3: Create `src/middleware/error.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Validation failed', details: err.flatten() } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}
```

- [ ] **Step 4: Create `src/app.ts`**

```ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { AppError } from './lib/errors.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok' } }));

  // Module routers are mounted here as they are built (Tasks 12+).

  app.use((_req, _res, next) => next(AppError.notFound('Route not found')));
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 5: Create `src/index.ts`**

```ts
import { createApp } from './app.js';
import { env } from './config/env.js';

createApp().listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/app.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: express app bootstrap, error handler, health route"
```

---

## Phase 1 — Core Libs & Middleware

### Task 5: Password hashing lib

**Files:**
- Create: `src/lib/hash.ts`
- Test: `src/lib/hash.test.ts`

- [ ] **Step 1: Write the failing test — `src/lib/hash.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './hash.js';

describe('hash', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('Password1!');
    expect(hash).not.toBe('Password1!');
    expect(await verifyPassword('Password1!', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/hash.test.ts`
Expected: FAIL — cannot find `./hash.js`.

- [ ] **Step 3: Create `src/lib/hash.ts`**

```ts
import bcrypt from 'bcryptjs';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/hash.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: password hashing lib"
```

---

### Task 6: JWT lib (access + refresh)

**Files:**
- Create: `src/lib/jwt.ts`
- Test: `src/lib/jwt.test.ts`

- [ ] **Step 1: Write the failing test — `src/lib/jwt.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from './jwt.js';

describe('jwt', () => {
  it('signs and verifies an access token', () => {
    const token = signAccessToken({ sub: 'u1', role: 'STUDENT' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.role).toBe('STUDENT');
  });

  it('rejects an access token verified as refresh', () => {
    const token = signAccessToken({ sub: 'u1', role: 'STUDENT' });
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  it('signs and verifies a refresh token', () => {
    const token = signRefreshToken({ sub: 'u1', role: 'ADMIN' });
    expect(verifyRefreshToken(token).sub).toBe('u1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/jwt.test.ts`
Expected: FAIL — cannot find `./jwt.js`.

- [ ] **Step 3: Create `src/lib/jwt.ts`**

```ts
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';

export interface TokenPayload { sub: string; role: Role; }

export function signAccessToken(p: TokenPayload): string {
  return jwt.sign(p, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
}
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
}
export function signRefreshToken(p: TokenPayload): string {
  return jwt.sign(p, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL });
}
export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/jwt.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: jwt access and refresh token lib"
```

---

### Task 7: requireAuth middleware

**Files:**
- Create: `src/middleware/auth.ts`, `src/types/express.d.ts`
- Test: `src/middleware/auth.test.ts`

- [ ] **Step 1: Write the failing test — `src/middleware/auth.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requireAuth } from './auth.js';
import { errorHandler } from './error.js';
import { signAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

function testApp() {
  const app = express();
  app.get('/me', requireAuth, (req, res) => res.json({ data: req.user }));
  app.use(errorHandler);
  return app;
}

describe('requireAuth', () => {
  afterAll(async () => { await prisma.$disconnect(); });

  it('rejects requests with no token', async () => {
    const res = await request(testApp()).get('/me');
    expect(res.status).toBe(401);
  });

  it('accepts a valid token and attaches req.user', async () => {
    const token = signAccessToken({ sub: 'user-1', role: 'STUDENT' });
    const res = await request(testApp()).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 'user-1', role: 'STUDENT' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/middleware/auth.test.ts`
Expected: FAIL — cannot find `./auth.js`.

- [ ] **Step 3: Create `src/types/express.d.ts`**

```ts
import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}
export {};
```

- [ ] **Step 4: Create `src/middleware/auth.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { AppError } from '../lib/errors.js';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized('Missing bearer token'));
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired token'));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/middleware/auth.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: requireAuth middleware"
```

---

### Task 8: requireRole (RBAC) middleware

**Files:**
- Create: `src/middleware/rbac.ts`
- Test: `src/middleware/rbac.test.ts`

- [ ] **Step 1: Write the failing test — `src/middleware/rbac.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requireRole } from './rbac.js';
import { requireAuth } from './auth.js';
import { errorHandler } from './error.js';
import { signAccessToken } from '../lib/jwt.js';

function adminApp() {
  const app = express();
  app.get('/admin', requireAuth, requireRole('ADMIN'), (_req, res) => res.json({ data: 'ok' }));
  app.use(errorHandler);
  return app;
}

describe('requireRole', () => {
  it('forbids the wrong role', async () => {
    const token = signAccessToken({ sub: 'u1', role: 'STUDENT' });
    const res = await request(adminApp()).get('/admin').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
  it('allows the right role', async () => {
    const token = signAccessToken({ sub: 'u1', role: 'ADMIN' });
    const res = await request(adminApp()).get('/admin').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/middleware/rbac.test.ts`
Expected: FAIL — cannot find `./rbac.js`.

- [ ] **Step 3: Create `src/middleware/rbac.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { AppError } from '../lib/errors.js';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/middleware/rbac.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: requireRole RBAC middleware"
```

---

### Task 9: validate (zod) middleware

**Files:**
- Create: `src/middleware/validate.ts`
- Test: `src/middleware/validate.test.ts`

- [ ] **Step 1: Write the failing test — `src/middleware/validate.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/middleware/validate.test.ts`
Expected: FAIL — cannot find `./validate.js`.

- [ ] **Step 3: Create `src/middleware/validate.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

export function validate(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!result.success) return next(result.error);
    if (result.data.body) req.body = result.data.body;
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/middleware/validate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: zod validate middleware"
```

---

### Task 10: auditLog middleware

**Files:**
- Create: `src/middleware/audit.ts`
- Test: `src/middleware/audit.test.ts`

- [ ] **Step 1: Write the failing test — `src/middleware/audit.test.ts`**

```ts
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
    const logs = await prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'UPDATE', entity: 'thing', entityId: 'abc', userId: user.id });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/middleware/audit.test.ts`
Expected: FAIL — cannot find `./audit.js`.

- [ ] **Step 3: Create `src/middleware/audit.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

export function auditLog(action: string, entity: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      prisma.auditLog
        .create({
          data: {
            action,
            entity,
            entityId: req.params.id ?? null,
            userId: req.user?.id ?? null,
            ip: req.ip ?? null,
            metadata: { method: req.method, path: req.originalUrl },
          },
        })
        .catch((e) => console.error('audit write failed', e));
    });
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/middleware/audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: audit log middleware"
```

---

### Task 11: Storage provider (local disk)

**Files:**
- Create: `src/lib/storage/index.ts`, `src/lib/storage/local.ts`
- Test: `src/lib/storage/local.test.ts`

- [ ] **Step 1: Write the failing test — `src/lib/storage/local.test.ts`**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { LocalStorage } from './local.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const dir = path.join('uploads', 'test');

describe('LocalStorage', () => {
  afterAll(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('stores a file and returns a key, then a verifiable signed url', async () => {
    const storage = new LocalStorage(dir);
    const key = await storage.put('a/passport.pdf', Buffer.from('hello'), 'application/pdf');
    expect(key).toContain('passport.pdf');
    const url = storage.getSignedUrl(key);
    expect(url).toContain(encodeURIComponent(key));
    expect(storage.verifySignedUrl(key, new URL(url, 'http://x').searchParams)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/storage/local.test.ts`
Expected: FAIL — cannot find `./local.js`.

- [ ] **Step 3: Create `src/lib/storage/index.ts`**

```ts
import { env } from '../../config/env.js';
import { LocalStorage } from './local.js';

export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  getSignedUrl(key: string): string;
  verifySignedUrl(key: string, params: URLSearchParams): boolean;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

let instance: StorageProvider | null = null;
export function getStorage(): StorageProvider {
  if (!instance) instance = new LocalStorage(env.UPLOAD_DIR);
  return instance;
}
```

- [ ] **Step 4: Create `src/lib/storage/local.ts`**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import type { StorageProvider } from './index.js';

export class LocalStorage implements StorageProvider {
  constructor(private baseDir: string) {}

  async put(key: string, data: Buffer): Promise<string> {
    const full = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return key;
  }

  private sign(key: string, expires: number): string {
    return crypto.createHmac('sha256', env.SIGNED_URL_SECRET).update(`${key}:${expires}`).digest('hex');
  }

  getSignedUrl(key: string): string {
    const expires = Math.floor(Date.now() / 1000) + env.SIGNED_URL_TTL_SECONDS;
    const sig = this.sign(key, expires);
    return `/api/files/${encodeURIComponent(key)}?expires=${expires}&sig=${sig}`;
  }

  verifySignedUrl(key: string, params: URLSearchParams): boolean {
    const expires = Number(params.get('expires'));
    const sig = params.get('sig');
    if (!expires || !sig || expires < Math.floor(Date.now() / 1000)) return false;
    const expected = this.sign(key, expires);
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  read(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.baseDir, key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(path.join(this.baseDir, key), { force: true });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/storage/local.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: local storage provider with signed urls"
```

---

## Phase 2 — Auth & Users

### Task 12: Auth register (with consent capture)

**Files:**
- Create: `src/modules/auth/schema.ts`, `src/modules/auth/service.ts`, `src/modules/auth/controller.ts`, `src/modules/auth/routes.ts`
- Modify: `src/app.ts` (mount auth router)
- Test: `src/modules/auth/auth.register.test.ts`

- [ ] **Step 1: Write the failing test — `src/modules/auth/auth.register.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

describe('POST /api/auth/register', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('creates a student user + student row + consent and returns tokens', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'new@test.com', password: 'Password1!', role: 'STUDENT', consent: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe('new@test.com');
    const student = await prisma.student.findFirst();
    expect(student).toBeTruthy();
    const consent = await prisma.consent.findFirst();
    expect(consent?.granted).toBe(true);
  });

  it('rejects duplicate email with 409', async () => {
    const body = { email: 'dup@test.com', password: 'Password1!', role: 'STUDENT', consent: true };
    await request(app).post('/api/auth/register').send(body);
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(409);
  });

  it('rejects registration without consent', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'x@test.com', password: 'Password1!', role: 'STUDENT', consent: false,
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/auth/auth.register.test.ts`
Expected: FAIL — cannot find `auth/routes.js` / route 404.

- [ ] **Step 3: Create `src/modules/auth/schema.ts`**

```ts
import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(['STUDENT', 'AGENT']).default('STUDENT'),
    consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required' }) }),
    name: z.string().optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({ email: z.string().email(), password: z.string().min(1) }),
});

export const refreshSchema = z.object({
  body: z.object({ refreshToken: z.string().min(1) }),
});
```

- [ ] **Step 4: Create `src/modules/auth/service.ts`**

```ts
import type { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/hash.js';
import { signAccessToken, signRefreshToken } from '../../lib/jwt.js';
import { AppError } from '../../lib/errors.js';

function tokensFor(user: { id: string; role: Role }) {
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken: signRefreshToken({ sub: user.id, role: user.role }),
  };
}

export async function register(input: { email: string; password: string; role: 'STUDENT' | 'AGENT'; name?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw AppError.conflict('Email already registered');

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      consents: { create: { consentType: 'DATA_PROCESSING', granted: true, version: '1.0' } },
      ...(input.role === 'STUDENT'
        ? { student: { create: {} } }
        : { agent: { create: { name: input.name ?? input.email } } }),
    },
  });

  return { user: publicUser(user), ...tokensFor(user) };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw AppError.unauthorized('Invalid credentials');
  }
  return { user: publicUser(user), ...tokensFor(user) };
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('User not found');
  return publicUser(user);
}

export function rotateTokens(payload: { sub: string; role: Role }) {
  return tokensFor({ id: payload.sub, role: payload.role });
}

function publicUser(u: { id: string; email: string; role: Role; phoneNumber: string | null }) {
  return { id: u.id, email: u.email, role: u.role, phoneNumber: u.phoneNumber };
}
```

- [ ] **Step 5: Create `src/modules/auth/controller.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';
import { verifyRefreshToken } from '../../lib/jwt.js';
import { AppError } from '../../lib/errors.js';

export async function register(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await service.register(req.body) }); }
  catch (e) { next(e); }
}
export async function login(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.login(req.body.email, req.body.password) }); }
  catch (e) { next(e); }
}
export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = verifyRefreshToken(req.body.refreshToken);
    res.json({ data: service.rotateTokens(payload) });
  } catch { next(AppError.unauthorized('Invalid refresh token')); }
}
export async function logout(_req: Request, res: Response) {
  res.json({ data: { success: true } });
}
export async function me(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.me(req.user!.id) }); }
  catch (e) { next(e); }
}
```

- [ ] **Step 6: Create `src/modules/auth/routes.ts`**

```ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { registerSchema, loginSchema, refreshSchema } from './schema.js';
import * as c from './controller.js';

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
export const authRouter = Router();

authRouter.post('/register', limiter, validate(registerSchema), c.register);
authRouter.post('/login', limiter, validate(loginSchema), c.login);
authRouter.post('/refresh', validate(refreshSchema), c.refresh);
authRouter.post('/logout', c.logout);
authRouter.get('/me', requireAuth, c.me);
```

- [ ] **Step 7: Mount the router in `src/app.ts`**

Add the import near the top of `src/app.ts`:

```ts
import { authRouter } from './modules/auth/routes.js';
```

Add this line immediately after the `/api/health` route, replacing the `// Module routers...` comment:

```ts
  app.use('/api/auth', authRouter);
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/modules/auth/auth.register.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: auth register with consent capture"
```

---

### Task 13: Auth login, refresh, logout, me

**Files:**
- Test: `src/modules/auth/auth.session.test.ts`

(Implementation already exists from Task 12; this task verifies the remaining endpoints behave correctly.)

- [ ] **Step 1: Write the failing test — `src/modules/auth/auth.session.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

async function registerStudent() {
  return request(app).post('/api/auth/register').send({
    email: 's@test.com', password: 'Password1!', role: 'STUDENT', consent: true,
  });
}

describe('auth session', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('logs in with valid credentials', async () => {
    await registerStudent();
    const res = await request(app).post('/api/auth/login').send({ email: 's@test.com', password: 'Password1!' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('rejects bad credentials with 401', async () => {
    await registerStudent();
    const res = await request(app).post('/api/auth/login').send({ email: 's@test.com', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('refreshes tokens', async () => {
    const reg = await registerStudent();
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: reg.body.data.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('returns current user from /me', async () => {
    const reg = await registerStudent();
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('s@test.com');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/modules/auth/auth.session.test.ts`
Expected: PASS (4 tests). If any fail, fix the corresponding controller/service code from Task 12.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: auth login, refresh, me coverage"
```

---

## Phase 3 — Student Profile & Documents

### Task 14: Student profile get/update + completion calc

**Files:**
- Create: `src/modules/students/schema.ts`, `src/modules/students/service.ts`, `src/modules/students/controller.ts`, `src/modules/students/routes.ts`
- Modify: `src/app.ts` (mount `/api/students`)
- Test: `src/modules/students/profile.test.ts`

- [ ] **Step 1: Write the failing test — `src/modules/students/profile.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

describe('student profile', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('GET /api/students/me returns the profile', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).get('/api/students/me').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data.profileCompletion).toBe(0);
  });

  it('PUT /api/students/me updates fields and recomputes completion', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).put('/api/students/me').set('Authorization', auth).send({
      firstName: 'Alex', lastName: 'Johnson', dob: '2000-01-01', address: '1 High St', phoneNumber: '123',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Alex');
    expect(res.body.data.profileCompletion).toBe(100);
    expect(res.body.data.isProfileCompleted).toBe(true);
  });

  it('forbids non-students', async () => {
    const { auth } = await createUser('ADMIN');
    const res = await request(app).get('/api/students/me').set('Authorization', auth);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/students/profile.test.ts`
Expected: FAIL — route 404 / module missing.

- [ ] **Step 3: Create `src/modules/students/schema.ts`**

```ts
import { z } from 'zod';

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    dob: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    address: z.string().min(1).optional(),
    phoneNumber: z.string().min(1).optional(),
  }),
});
```

- [ ] **Step 4: Create `src/modules/students/service.ts`**

```ts
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

const PROFILE_FIELDS = ['firstName', 'lastName', 'dob', 'address'] as const;

function completion(s: Record<string, unknown>): number {
  const filled = PROFILE_FIELDS.filter((f) => s[f] != null && s[f] !== '').length;
  return Math.round((filled / PROFILE_FIELDS.length) * 100);
}

export async function getProfile(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw AppError.notFound('Student profile not found');
  return student;
}

export async function updateProfile(
  userId: string,
  data: { firstName?: string; lastName?: string; dob?: string; address?: string; phoneNumber?: string },
) {
  const student = await getProfile(userId);
  const next = {
    firstName: data.firstName ?? student.firstName,
    lastName: data.lastName ?? student.lastName,
    dob: data.dob ? new Date(data.dob) : student.dob,
    address: data.address ?? student.address,
  };
  const profileCompletion = completion(next);
  if (data.phoneNumber) {
    await prisma.user.update({ where: { id: userId }, data: { phoneNumber: data.phoneNumber } });
  }
  return prisma.student.update({
    where: { id: student.id },
    data: { ...next, profileCompletion, isProfileCompleted: profileCompletion === 100 },
  });
}
```

- [ ] **Step 5: Create `src/modules/students/controller.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.getProfile(req.user!.id) }); }
  catch (e) { next(e); }
}
export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.updateProfile(req.user!.id, req.body) }); }
  catch (e) { next(e); }
}
```

- [ ] **Step 6: Create `src/modules/students/routes.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { updateProfileSchema } from './schema.js';
import * as c from './controller.js';
import { documentsRouter } from './documents.routes.js';

export const studentsRouter = Router();
studentsRouter.use(requireAuth, requireRole('STUDENT'));
studentsRouter.get('/me', c.getMe);
studentsRouter.put('/me', validate(updateProfileSchema), auditLog('UPDATE', 'student'), c.updateMe);
studentsRouter.use('/me/documents', documentsRouter);
```

> Note: `documents.routes.js` is created in Task 15. Until then, comment out the last two lines (the import and `studentsRouter.use('/me/documents', ...)`) to run this task's tests, then restore them in Task 15.

- [ ] **Step 7: Mount in `src/app.ts`**

Add import:

```ts
import { studentsRouter } from './modules/students/routes.js';
```

Add after the auth router line:

```ts
  app.use('/api/students', studentsRouter);
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/modules/students/profile.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: student profile get/update with completion calc"
```

---

### Task 15: Document upload + list + delete

**Files:**
- Create: `src/modules/students/documents.routes.ts`, `src/modules/students/documents.service.ts`, `src/modules/students/documents.controller.ts`
- Modify: `src/modules/students/routes.ts` (restore documents sub-router from Task 14 note)
- Test: `src/modules/students/documents.test.ts`

- [ ] **Step 1: Write the failing test — `src/modules/students/documents.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/students/documents.test.ts`
Expected: FAIL — route missing.

- [ ] **Step 3: Create `src/modules/students/documents.service.ts`**

```ts
import type { DocType } from '@prisma/client';
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
```

- [ ] **Step 4: Create `src/modules/students/documents.controller.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import type { DocType } from '@prisma/client';
import * as service from './documents.service.js';
import { AppError } from '../../lib/errors.js';

const VALID: DocType[] = ['PASSPORT', 'AADHAR', 'ACADEMICS', 'IELTS'];

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw AppError.badRequest('file is required');
    const docType = req.body.docType as DocType;
    if (!VALID.includes(docType)) throw AppError.badRequest('Invalid docType');
    res.status(201).json({ data: await service.upload(req.user!.id, docType, req.file) });
  } catch (e) { next(e); }
}
export async function list(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.list(req.user!.id) }); }
  catch (e) { next(e); }
}
export async function remove(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.softDelete(req.user!.id, req.params.id) }); }
  catch (e) { next(e); }
}
```

- [ ] **Step 5: Create `src/modules/students/documents.routes.ts`**

```ts
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { auditLog } from '../../middleware/audit.js';
import { AppError } from '../../lib/errors.js';
import * as c from './documents.controller.js';

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(AppError.badRequest('Unsupported file type')),
});

// Mounted at /api/students/me/documents
export const documentsRouter = Router();
documentsRouter.post('/', upload.single('file'), auditLog('UPLOAD', 'document'), c.upload);
documentsRouter.get('/', c.list);

// Mounted at /api/documents (delete + verify live here so non-students can verify)
export const documentsTopRouter = Router();
documentsTopRouter.delete('/:id', requireAuth, requireRole('STUDENT'), auditLog('DELETE', 'document'), c.remove);
```

> Multer's `fileFilter` error surfaces as a generic error; ensure the error handler returns 400. Since `AppError.badRequest` is thrown, `errorHandler` already maps it to 400.

- [ ] **Step 6: Restore the documents sub-router in `src/modules/students/routes.ts`**

Ensure these lines (commented out in Task 14) are active:

```ts
import { documentsRouter } from './documents.routes.js';
// ...
studentsRouter.use('/me/documents', documentsRouter);
```

- [ ] **Step 7: Mount the top-level documents router in `src/app.ts`**

Add import:

```ts
import { documentsTopRouter } from './modules/students/documents.routes.js';
```

Add after the students router line:

```ts
  app.use('/api/documents', documentsTopRouter);
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/modules/students/documents.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: document upload, list, soft-delete"
```

---

### Task 16: Document verification + signed file download

**Files:**
- Modify: `src/modules/students/documents.service.ts` (add `verify`)
- Modify: `src/modules/students/documents.controller.ts` (add `verify`)
- Modify: `src/modules/students/documents.routes.ts` (add verify route to top router)
- Create: `src/modules/files/routes.ts` (signed download)
- Modify: `src/app.ts` (mount `/api/files`)
- Test: `src/modules/students/documents.verify.test.ts`

- [ ] **Step 1: Write the failing test — `src/modules/students/documents.verify.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

async function uploadAsStudent() {
  const { auth } = await createUser('STUDENT', 'docstud@test.com');
  const up = await request(app).post('/api/students/me/documents').set('Authorization', auth)
    .field('docType', 'ACADEMICS')
    .attach('file', Buffer.from('%PDF fake'), { filename: 'a.pdf', contentType: 'application/pdf' });
  return up.body.data.id as string;
}

describe('document verification', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lets an admin set status to VERIFIED', async () => {
    const docId = await uploadAsStudent();
    const { auth } = await createUser('ADMIN');
    const res = await request(app).patch(`/api/documents/${docId}/verify`).set('Authorization', auth).send({ status: 'VERIFIED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VERIFIED');
  });

  it('forbids a student from verifying', async () => {
    const docId = await uploadAsStudent();
    const { auth } = await createUser('STUDENT', 'other@test.com');
    const res = await request(app).patch(`/api/documents/${docId}/verify`).set('Authorization', auth).send({ status: 'VERIFIED' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/students/documents.verify.test.ts`
Expected: FAIL — verify route missing (404).

- [ ] **Step 3: Add `verify` to `src/modules/students/documents.service.ts`**

```ts
import type { DocStatus } from '@prisma/client';

export async function verify(docId: string, status: DocStatus) {
  const doc = await prisma.studentDocument.findUnique({ where: { id: docId } });
  if (!doc) throw AppError.notFound('Document not found');
  return prisma.studentDocument.update({ where: { id: docId }, data: { status } });
}
```

(Add the `import type { DocStatus }` to the existing `@prisma/client` import line.)

- [ ] **Step 4: Add `verify` to `src/modules/students/documents.controller.ts`**

```ts
import type { DocStatus } from '@prisma/client';

const VALID_STATUS: DocStatus[] = ['UPLOADED', 'PENDING', 'VERIFIED', 'REJECTED'];

export async function verify(req: Request, res: Response, next: NextFunction) {
  try {
    const status = req.body.status as DocStatus;
    if (!VALID_STATUS.includes(status)) throw AppError.badRequest('Invalid status');
    res.json({ data: await service.verify(req.params.id, status) });
  } catch (e) { next(e); }
}
```

- [ ] **Step 5: Add the verify route to the top router in `src/modules/students/documents.routes.ts`**

```ts
documentsTopRouter.patch(
  '/:id/verify',
  requireAuth,
  requireRole('ADMIN', 'AGENT'),
  auditLog('VERIFY', 'document'),
  c.verify,
);
```

- [ ] **Step 6: Create `src/modules/files/routes.ts`**

```ts
import { Router } from 'express';
import { getStorage } from '../../lib/storage/index.js';
import { AppError } from '../../lib/errors.js';

export const filesRouter = Router();

// GET /api/files/:key?expires=..&sig=..  (signed, no JWT needed)
filesRouter.get('/:key', async (req, res, next) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const storage = getStorage();
    const params = new URLSearchParams(req.query as Record<string, string>);
    if (!storage.verifySignedUrl(key, params)) throw AppError.forbidden('Invalid or expired link');
    const data = await storage.read(key);
    res.send(data);
  } catch (e) { next(e); }
});
```

- [ ] **Step 7: Mount in `src/app.ts`**

Add import and mount after the documents router:

```ts
import { filesRouter } from './modules/files/routes.js';
// ...
  app.use('/api/files', filesRouter);
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/modules/students/documents.verify.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: document verification and signed file download"
```

---

## Phase 4 — Agents

### Task 17: Agents list, assigned students, verify student profile

**Files:**
- Create: `src/modules/agents/service.ts`, `src/modules/agents/controller.ts`, `src/modules/agents/routes.ts`
- Modify: `src/app.ts` (mount `/api/agents`)
- Test: `src/modules/agents/agents.test.ts`

- [ ] **Step 1: Write the failing test — `src/modules/agents/agents.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

describe('agents', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lists agents for admin', async () => {
    await createUser('AGENT', 'a1@test.com');
    const { auth } = await createUser('ADMIN');
    const res = await request(app).get('/api/agents').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0]).toHaveProperty('numberOfStudents');
  });

  it('returns an agent\'s assigned students', async () => {
    const { user: agentUser, auth } = await createUser('AGENT', 'a2@test.com');
    const agent = await prisma.agent.findUnique({ where: { userId: agentUser.id } });
    const stud = await createUser('STUDENT', 'st@test.com');
    await prisma.student.update({ where: { userId: stud.user.id }, data: { agentId: agent!.id } });
    const res = await request(app).get('/api/agents/me/students').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('lets an agent verify a student profile', async () => {
    const { user: agentUser, auth } = await createUser('AGENT', 'a3@test.com');
    const agent = await prisma.agent.findUnique({ where: { userId: agentUser.id } });
    const stud = await createUser('STUDENT', 'st2@test.com');
    const student = await prisma.student.update({ where: { userId: stud.user.id }, data: { agentId: agent!.id } });
    const res = await request(app).patch(`/api/agents/students/${student.id}/verify`).set('Authorization', auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.isProfileVerified).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/agents/agents.test.ts`
Expected: FAIL — route missing.

- [ ] **Step 3: Create `src/modules/agents/service.ts`**

```ts
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

export async function listAgents() {
  const agents = await prisma.agent.findMany({ include: { _count: { select: { students: true } } } });
  return agents.map((a) => ({
    id: a.id, name: a.name, status: a.status, numberOfStudents: a._count.students,
    createdAt: a.createdAt, updatedAt: a.updatedAt,
  }));
}

export async function assignedStudents(userId: string) {
  const agent = await prisma.agent.findUnique({ where: { userId } });
  if (!agent) throw AppError.notFound('Agent not found');
  return prisma.student.findMany({ where: { agentId: agent.id }, include: { user: { select: { email: true } } } });
}

export async function verifyStudent(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw AppError.notFound('Student not found');
  return prisma.student.update({ where: { id: studentId }, data: { isProfileVerified: true } });
}
```

- [ ] **Step 4: Create `src/modules/agents/controller.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function list(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.listAgents() }); } catch (e) { next(e); }
}
export async function myStudents(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.assignedStudents(req.user!.id) }); } catch (e) { next(e); }
}
export async function verifyStudent(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.verifyStudent(req.params.id) }); } catch (e) { next(e); }
}
```

- [ ] **Step 5: Create `src/modules/agents/routes.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { auditLog } from '../../middleware/audit.js';
import * as c from './controller.js';

export const agentsRouter = Router();
agentsRouter.use(requireAuth);
agentsRouter.get('/', requireRole('ADMIN'), c.list);
agentsRouter.get('/me/students', requireRole('AGENT'), c.myStudents);
agentsRouter.patch('/students/:id/verify', requireRole('AGENT', 'ADMIN'), auditLog('VERIFY', 'student'), c.verifyStudent);
```

- [ ] **Step 6: Mount in `src/app.ts`**

```ts
import { agentsRouter } from './modules/agents/routes.js';
// ...
  app.use('/api/agents', agentsRouter);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/modules/agents/agents.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: agents list, assigned students, verify student"
```

---

## Phase 5 — Content CRUD

Tasks 18–24 build content resources. **Task 18 (universities) is the fully-worked reference.**
Tasks 19–24 follow the identical `schema → service → controller → routes → mount → test` pattern;
each task below gives the exact fields, validation, routes, and test assertions to use, reusing the
Task 18 structure with the names substituted. Public `GET`; admin-only `POST/PUT/DELETE`.

### Task 18: Universities CRUD (reference module)

**Files:**
- Create: `src/modules/universities/schema.ts`, `service.ts`, `controller.ts`, `routes.ts`
- Modify: `src/app.ts` (mount `/api/universities`)
- Test: `src/modules/universities/universities.test.ts`

- [ ] **Step 1: Write the failing test — `src/modules/universities/universities.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

const sample = {
  name: 'University of Oxford', location: 'Oxford, UK', logo: 'https://logo/ox',
  rating: 4.9, tuitionFee: '£28,000 - £45,000',
  description: 'The oldest university in the English-speaking world.',
  courses: ['Computer Science', 'Philosophy'],
};

describe('universities', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('lists universities publicly', async () => {
    const res = await request(app).get('/api/universities');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('admin can create; response includes courses[]', async () => {
    const { auth } = await createUser('ADMIN');
    const res = await request(app).post('/api/universities').set('Authorization', auth).send(sample);
    expect(res.status).toBe(201);
    expect(res.body.data.courses).toEqual(['Computer Science', 'Philosophy']);
  });

  it('non-admin cannot create', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).post('/api/universities').set('Authorization', auth).send(sample);
    expect(res.status).toBe(403);
  });

  it('admin can update and delete', async () => {
    const { auth } = await createUser('ADMIN');
    const created = await request(app).post('/api/universities').set('Authorization', auth).send(sample);
    const id = created.body.data.id;
    const upd = await request(app).put(`/api/universities/${id}`).set('Authorization', auth).send({ ...sample, rating: 4.5 });
    expect(upd.body.data.rating).toBe(4.5);
    const del = await request(app).delete(`/api/universities/${id}`).set('Authorization', auth);
    expect(del.status).toBe(200);
    const after = await request(app).get(`/api/universities/${id}`);
    expect(after.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/universities/universities.test.ts`
Expected: FAIL — route missing.

- [ ] **Step 3: Create `src/modules/universities/schema.ts`**

```ts
import { z } from 'zod';

const body = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  logo: z.string().min(1),
  rating: z.number().min(0).max(5).default(0),
  tuitionFee: z.string().min(1),
  description: z.string().min(1),
  courses: z.array(z.string()).default([]),
});

export const createUniversitySchema = z.object({ body });
export const updateUniversitySchema = z.object({ body: body.partial() });
```

- [ ] **Step 4: Create `src/modules/universities/service.ts`**

```ts
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

type Input = {
  name?: string; location?: string; logo?: string; rating?: number;
  tuitionFee?: string; description?: string; courses?: string[];
};

function shape(u: any) {
  return { ...u, courses: (u.courses ?? []).map((c: { name: string }) => c.name) };
}

export async function list() {
  const items = await prisma.university.findMany({ include: { courses: true }, orderBy: { createdAt: 'desc' } });
  return items.map(shape);
}

export async function get(id: string) {
  const item = await prisma.university.findUnique({ where: { id }, include: { courses: true } });
  if (!item) throw AppError.notFound('University not found');
  return shape(item);
}

export async function create(input: Input) {
  const { courses = [], ...rest } = input;
  const item = await prisma.university.create({
    data: { ...(rest as Required<Omit<Input, 'courses'>>), courses: { create: courses.map((name) => ({ name })) } },
    include: { courses: true },
  });
  return shape(item);
}

export async function update(id: string, input: Input) {
  await get(id);
  const { courses, ...rest } = input;
  if (courses) {
    await prisma.course.deleteMany({ where: { universityId: id } });
    await prisma.course.createMany({ data: courses.map((name) => ({ universityId: id, name })) });
  }
  const item = await prisma.university.update({ where: { id }, data: rest, include: { courses: true } });
  return shape(item);
}

export async function remove(id: string) {
  await get(id);
  await prisma.university.delete({ where: { id } });
  return { success: true };
}
```

- [ ] **Step 5: Create `src/modules/universities/controller.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function list(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.list() }); } catch (e) { next(e); }
}
export async function get(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.get(req.params.id) }); } catch (e) { next(e); }
}
export async function create(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await service.create(req.body) }); } catch (e) { next(e); }
}
export async function update(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.update(req.params.id, req.body) }); } catch (e) { next(e); }
}
export async function remove(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.remove(req.params.id) }); } catch (e) { next(e); }
}
```

- [ ] **Step 6: Create `src/modules/universities/routes.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { createUniversitySchema, updateUniversitySchema } from './schema.js';
import * as c from './controller.js';

export const universitiesRouter = Router();
universitiesRouter.get('/', c.list);
universitiesRouter.get('/:id', c.get);
universitiesRouter.post('/', requireAuth, requireRole('ADMIN'), validate(createUniversitySchema), auditLog('CREATE', 'university'), c.create);
universitiesRouter.put('/:id', requireAuth, requireRole('ADMIN'), validate(updateUniversitySchema), auditLog('UPDATE', 'university'), c.update);
universitiesRouter.delete('/:id', requireAuth, requireRole('ADMIN'), auditLog('DELETE', 'university'), c.remove);
```

- [ ] **Step 7: Mount in `src/app.ts`**

```ts
import { universitiesRouter } from './modules/universities/routes.js';
// ...
  app.use('/api/universities', universitiesRouter);
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/modules/universities/universities.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: universities CRUD (reference content module)"
```

---

### Task 19: Accommodations CRUD + search/filter

**Files:** `src/modules/accommodations/{schema,service,controller,routes}.ts`; modify `src/app.ts`; test `accommodations.test.ts`

Follow the Task 18 pattern with these differences:

- **schema body fields:** `name` (string), `city` (string), `universityProximity` (string optional), `price` (string), `type` (string), `amenities` (string[] default []), `image` (string), `description` (string).
- **service:** standard `list/get/create/update/remove`, **no** nested relation (so no `shape()` — return rows directly). `list(query)` accepts optional filters:

```ts
export async function list(query: { city?: string; type?: string; maxPrice?: string }) {
  return prisma.accommodation.findMany({
    where: {
      ...(query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {}),
      ...(query.type ? { type: query.type } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}
```

  (Price is a display string in v1, so filter by `city`/`type` only; document `maxPrice` as a no-op placeholder for the future numeric-price migration.)
- **controller `list`:** pass `req.query` into `service.list`.
- **routes:** identical guard structure; `auditLog` entity = `'accommodation'`.
- **mount:** `app.use('/api/accommodations', accommodationsRouter)`.
- **test assertions:** (1) public `GET /api/accommodations` returns 200 array; (2) admin create returns 201 with `city`; (3) `GET /api/accommodations?city=London` returns only London rows; (4) non-admin create → 403.

- [ ] **Step 1:** Write `accommodations.test.ts` with the four assertions above (use a sample: `{ name:'Student Comforts', city:'London', price:'From £120/week', type:'Studio', amenities:['WiFi'], image:'https://i', description:'Premium housing' }`).
- [ ] **Step 2:** Run it; expect FAIL (route missing).
- [ ] **Step 3:** Create `schema.ts`, `service.ts` (with the `list(query)` above), `controller.ts`, `routes.ts` per the Task 18 template.
- [ ] **Step 4:** Mount in `src/app.ts`.
- [ ] **Step 5:** Run `npx vitest run src/modules/accommodations/accommodations.test.ts`; expect PASS.
- [ ] **Step 6:** Commit: `feat: accommodations CRUD with city/type filters`.

---

### Task 20: Service Providers CRUD (marketplace)

**Files:** `src/modules/serviceProviders/{schema,service,controller,routes}.ts`; modify `src/app.ts`; test `serviceProviders.test.ts`

Follow the Task 18 pattern (no nested relation, return rows directly):

- **schema body fields:** `name` (string), `category` (`z.enum(['ACCOMMODATION','TICKET_BOOKING','LOANS','LOGISTICS','ONLINE_PAYMENT'])`), `rating` (number 0–5 default 0), `price` (string), `location` (string optional), `image` (string), `description` (string).
- **service:** `list(query: { category?: ServiceCategory })` filters by category when present; standard `get/create/update/remove`.
- **controller `list`:** pass `req.query.category`.
- **routes:** standard guards; `auditLog` entity = `'serviceProvider'`.
- **mount:** `app.use('/api/service-providers', serviceProvidersRouter)`.
- **test assertions:** (1) public list 200; (2) admin create 201; (3) `GET /api/service-providers?category=LOGISTICS` returns only logistics; (4) non-admin create → 403.

- [ ] **Step 1:** Write `serviceProviders.test.ts` (sample: `{ name:'Royal Rahi Logistics', category:'LOGISTICS', rating:4.9, price:'Price per KG', image:'https://i', description:'Shipping' }`).
- [ ] **Step 2:** Run it; expect FAIL.
- [ ] **Step 3:** Create the four files per the template with the `category` filter.
- [ ] **Step 4:** Mount in `src/app.ts`.
- [ ] **Step 5:** Run the test; expect PASS.
- [ ] **Step 6:** Commit: `feat: service providers CRUD with category filter`.

---

### Task 21: Partners CRUD (home logos)

**Files:** `src/modules/partners/{schema,service,controller,routes}.ts`; modify `src/app.ts`; test `partners.test.ts`

Follow the Task 18 pattern exactly (no nested relation):

- **schema body fields:** `name` (string), `imageUrl` (string), `redirectionUrl` (string).
- **service:** standard `list/get/create/update/remove`.
- **routes:** standard guards; `auditLog` entity = `'partner'`.
- **mount:** `app.use('/api/partners', partnersRouter)`.
- **test assertions:** (1) public list 200; (2) admin create 201 with `imageUrl`; (3) non-admin create → 403.

- [ ] **Step 1:** Write `partners.test.ts` (sample: `{ name:'Avila University', imageUrl:'https://i', redirectionUrl:'https://r' }`).
- [ ] **Step 2:** Run it; expect FAIL.
- [ ] **Step 3:** Create the four files per the template.
- [ ] **Step 4:** Mount in `src/app.ts`.
- [ ] **Step 5:** Run the test; expect PASS.
- [ ] **Step 6:** Commit: `feat: partners CRUD`.

---

### Task 22: Blogs CRUD

**Files:** `src/modules/blogs/{schema,service,controller,routes}.ts`; modify `src/app.ts`; test `blogs.test.ts`

Follow the Task 18 pattern with a slug lookup:

- **schema body fields:** `title` (string), `slug` (string), `excerpt` (string), `content` (string), `coverImage` (string), `author` (string), `category` (string), `readTime` (string), `isActive` (boolean default true), `videoUrl` (string optional), `publishedBy` (string optional).
- **service:** standard CRUD, plus `getBySlug(slug)` (throws `AppError.notFound` when missing). `create` must catch a Prisma unique-violation on `slug` and rethrow `AppError.conflict('Slug already exists')`.
- **routes:** `GET /` (public list), `GET /slug/:slug` (public, calls `getBySlug`), `GET /:id` (public), admin `POST/PUT/DELETE`; `auditLog` entity = `'blog'`.
- **mount:** `app.use('/api/blogs', blogsRouter)`.
- **test assertions:** (1) public list 200; (2) admin create 201; (3) `GET /api/blogs/slug/<slug>` returns the post; (4) duplicate slug create → 409; (5) non-admin create → 403.

- [ ] **Step 1:** Write `blogs.test.ts` (sample: `{ title:'Top 5 UK Universities', slug:'top-5-uk-universities-2024', excerpt:'...', content:'...', coverImage:'https://i', author:'Editorial', category:'Education', readTime:'6 min read' }`).
- [ ] **Step 2:** Run it; expect FAIL.
- [ ] **Step 3:** Create the four files; add `getBySlug` and slug-conflict handling.
- [ ] **Step 4:** Mount in `src/app.ts`.
- [ ] **Step 5:** Run the test; expect PASS.
- [ ] **Step 6:** Commit: `feat: blogs CRUD with slug lookup`.

---

### Task 23: Testimonials CRUD

**Files:** `src/modules/testimonials/{schema,service,controller,routes}.ts`; modify `src/app.ts`; test `testimonials.test.ts`

Follow the Task 18 pattern exactly (no nested relation):

- **schema body fields:** `studentName` (string), `universityName` (string optional), `content` (string), `mediaUrl` (string), `mediaType` (`z.enum(['IMAGE','VIDEO'])` default `'IMAGE'`), `avatarUrl` (string optional), `isActive` (boolean default true).
- **service:** standard `list/get/create/update/remove`.
- **routes:** standard guards; `auditLog` entity = `'testimonial'`.
- **mount:** `app.use('/api/testimonials', testimonialsRouter)`.
- **test assertions:** (1) public list 200; (2) admin create 201 with `mediaType`; (3) non-admin create → 403.

- [ ] **Step 1:** Write `testimonials.test.ts` (sample: `{ studentName:'Aarav Sharma', universityName:'University of Oxford', content:'Seamless journey', mediaUrl:'https://i', mediaType:'IMAGE' }`).
- [ ] **Step 2:** Run it; expect FAIL.
- [ ] **Step 3:** Create the four files per the template.
- [ ] **Step 4:** Mount in `src/app.ts`.
- [ ] **Step 5:** Run the test; expect PASS.
- [ ] **Step 6:** Commit: `feat: testimonials CRUD`.

---

### Task 24: Loan applications

**Files:** `src/modules/loans/{schema,service,controller,routes}.ts`; modify `src/app.ts`; test `loans.test.ts`

Role-scoped (not pure public CRUD):

- **schema body fields (create):** `amount` (string), `details` (`z.record(z.any())` optional). **status update (admin):** `status` (string).
- **service:**
  - `create(userId, input)` — resolves the student via `prisma.student.findUnique({ where: { userId } })`, throws `AppError.notFound` if absent, creates a `LoanApplication` with `studentId`, `amount`, `details`.
  - `listForUser(userId, role)` — if `role === 'ADMIN'` return all (`include: { student: true }`); else return only the caller's loans (resolve studentId from userId).
  - `updateStatus(id, status)` — throws notFound if missing, else updates `status`.
- **routes:** all `requireAuth`. `POST /` requires `STUDENT`; `GET /` any authenticated (service scopes by role); `PATCH /:id` requires `ADMIN`. `auditLog` entity = `'loan'`.
- **mount:** `app.use('/api/loans', loansRouter)`.
- **test assertions:** (1) student create → 201; (2) student `GET /api/loans` returns only their loan; (3) admin `GET /api/loans` returns all; (4) admin `PATCH /api/loans/:id` sets status to `APPROVED`; (5) student PATCH → 403.

- [ ] **Step 1:** Write `loans.test.ts` with the five assertions (use `createUser('STUDENT')` / `createUser('ADMIN')`; sample body `{ amount:'500000', details:{ purpose:'tuition' } }`).
- [ ] **Step 2:** Run it; expect FAIL.
- [ ] **Step 3:** Create the four files with the role-scoped service above.
- [ ] **Step 4:** Mount in `src/app.ts`.
- [ ] **Step 5:** Run the test; expect PASS.
- [ ] **Step 6:** Commit: `feat: loan applications (role-scoped)`.

---

## Phase 6 — Applications

### Task 25: Applications create / list / get + timeline

**Files:**
- Create: `src/modules/applications/schema.ts`, `service.ts`, `controller.ts`, `routes.ts`
- Modify: `src/app.ts` (mount `/api/applications`)
- Test: `src/modules/applications/applications.test.ts`

- [ ] **Step 1: Write the failing test — `src/modules/applications/applications.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

async function seedUniversity() {
  return prisma.university.create({
    data: { name: 'Oxford', location: 'UK', logo: 'l', tuitionFee: '£1', description: 'd' },
  });
}

describe('applications', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('student creates an application with an initial timeline entry', async () => {
    const { auth } = await createUser('STUDENT');
    const uni = await seedUniversity();
    const res = await request(app).post('/api/applications').set('Authorization', auth)
      .send({ universityId: uni.id, course: 'MSc CS' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PROFILE');
    const timeline = await request(app).get(`/api/applications/${res.body.data.id}/timeline`).set('Authorization', auth);
    expect(timeline.body.data.length).toBe(1);
    expect(timeline.body.data[0].action).toBe('CREATED');
  });

  it('student sees only their own applications; admin sees all', async () => {
    const uni = await seedUniversity();
    const s1 = await createUser('STUDENT', 's1@test.com');
    const s2 = await createUser('STUDENT', 's2@test.com');
    await request(app).post('/api/applications').set('Authorization', s1.auth).send({ universityId: uni.id, course: 'A' });
    await request(app).post('/api/applications').set('Authorization', s2.auth).send({ universityId: uni.id, course: 'B' });
    const mine = await request(app).get('/api/applications').set('Authorization', s1.auth);
    expect(mine.body.data.length).toBe(1);
    const admin = await createUser('ADMIN');
    const all = await request(app).get('/api/applications').set('Authorization', admin.auth);
    expect(all.body.data.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/applications/applications.test.ts`
Expected: FAIL — route missing.

- [ ] **Step 3: Create `src/modules/applications/schema.ts`**

```ts
import { z } from 'zod';

export const createApplicationSchema = z.object({
  body: z.object({ universityId: z.string().min(1), course: z.string().min(1) }),
});

export const statusSchema = z.object({
  body: z.object({
    status: z.enum(['PROFILE', 'DOCUMENTS', 'VERIFICATION', 'APPLICATION', 'PAYMENT', 'COMPLETED']),
    rejectionReason: z.string().optional(),
  }),
});

export const paymentSchema = z.object({
  body: z.object({
    paymentLink: z.string().url().optional(),
    paymentStatus: z.enum(['PENDING', 'COMPLETED', 'FAILED']),
  }),
});
```

- [ ] **Step 4: Create `src/modules/applications/service.ts`**

```ts
import type { ApplicationStatus, PaymentStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

async function studentIdFor(userId: string): Promise<string> {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw AppError.notFound('Student profile not found');
  return student.id;
}

export async function create(userId: string, input: { universityId: string; course: string }) {
  const studentId = await studentIdFor(userId);
  return prisma.application.create({
    data: {
      studentId, universityId: input.universityId, course: input.course,
      timeline: { create: { action: 'CREATED', actionTakenBy: userId } },
    },
  });
}

export async function list(userId: string, role: Role) {
  if (role === 'ADMIN' || role === 'AGENT') {
    return prisma.application.findMany({ include: { university: true }, orderBy: { createdAt: 'desc' } });
  }
  const studentId = await studentIdFor(userId);
  return prisma.application.findMany({ where: { studentId }, include: { university: true }, orderBy: { createdAt: 'desc' } });
}

export async function get(id: string) {
  const item = await prisma.application.findUnique({ where: { id }, include: { university: true } });
  if (!item) throw AppError.notFound('Application not found');
  return item;
}

export async function timeline(id: string) {
  await get(id);
  return prisma.applicationTimeline.findMany({ where: { applicationId: id }, orderBy: { createdAt: 'asc' } });
}

export async function setStatus(id: string, userId: string, status: ApplicationStatus, rejectionReason?: string) {
  await get(id);
  const item = await prisma.application.update({ where: { id }, data: { status, rejectionReason } });
  await prisma.applicationTimeline.create({
    data: { applicationId: id, action: `STATUS_${status}`, actionTakenBy: userId },
  });
  return item;
}

export async function setPayment(id: string, userId: string, paymentStatus: PaymentStatus, paymentLink?: string) {
  await get(id);
  const item = await prisma.application.update({ where: { id }, data: { paymentStatus, paymentLink } });
  await prisma.applicationTimeline.create({
    data: { applicationId: id, action: `PAYMENT_${paymentStatus}`, actionTakenBy: userId },
  });
  return item;
}
```

- [ ] **Step 5: Create `src/modules/applications/controller.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function create(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await service.create(req.user!.id, req.body) }); } catch (e) { next(e); }
}
export async function list(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.list(req.user!.id, req.user!.role) }); } catch (e) { next(e); }
}
export async function get(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.get(req.params.id) }); } catch (e) { next(e); }
}
export async function timeline(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.timeline(req.params.id) }); } catch (e) { next(e); }
}
export async function setStatus(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.setStatus(req.params.id, req.user!.id, req.body.status, req.body.rejectionReason) }); }
  catch (e) { next(e); }
}
export async function setPayment(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.setPayment(req.params.id, req.user!.id, req.body.paymentStatus, req.body.paymentLink) }); }
  catch (e) { next(e); }
}
```

- [ ] **Step 6: Create `src/modules/applications/routes.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import { createApplicationSchema, statusSchema, paymentSchema } from './schema.js';
import * as c from './controller.js';

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);
applicationsRouter.post('/', requireRole('STUDENT'), validate(createApplicationSchema), auditLog('CREATE', 'application'), c.create);
applicationsRouter.get('/', c.list);
applicationsRouter.get('/:id', c.get);
applicationsRouter.get('/:id/timeline', c.timeline);
applicationsRouter.patch('/:id/status', requireRole('ADMIN', 'AGENT'), validate(statusSchema), auditLog('UPDATE', 'application'), c.setStatus);
applicationsRouter.patch('/:id/payment', requireRole('ADMIN'), validate(paymentSchema), auditLog('PAYMENT', 'application'), c.setPayment);
```

- [ ] **Step 7: Mount in `src/app.ts`**

```ts
import { applicationsRouter } from './modules/applications/routes.js';
// ...
  app.use('/api/applications', applicationsRouter);
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/modules/applications/applications.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: applications create/list/get/timeline"
```

---

### Task 26: Application status transition + payment update

**Files:**
- Test: `src/modules/applications/applications.transitions.test.ts`

(Implementation exists from Task 25; this verifies status + payment endpoints and timeline growth.)

- [ ] **Step 1: Write the failing test — `src/modules/applications/applications.transitions.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

async function setup() {
  const uni = await prisma.university.create({ data: { name: 'U', location: 'UK', logo: 'l', tuitionFee: '£1', description: 'd' } });
  const student = await createUser('STUDENT');
  const created = await request(app).post('/api/applications').set('Authorization', student.auth)
    .send({ universityId: uni.id, course: 'MSc' });
  return { appId: created.body.data.id as string };
}

describe('application transitions', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('admin advances status and it appears in the timeline', async () => {
    const { appId } = await setup();
    const admin = await createUser('ADMIN');
    const res = await request(app).patch(`/api/applications/${appId}/status`).set('Authorization', admin.auth)
      .send({ status: 'VERIFICATION' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VERIFICATION');
    const tl = await request(app).get(`/api/applications/${appId}/timeline`).set('Authorization', admin.auth);
    expect(tl.body.data.map((t: any) => t.action)).toContain('STATUS_VERIFICATION');
  });

  it('admin sets a payment link + status', async () => {
    const { appId } = await setup();
    const admin = await createUser('ADMIN');
    const res = await request(app).patch(`/api/applications/${appId}/payment`).set('Authorization', admin.auth)
      .send({ paymentLink: 'https://flywire.example/pay/123', paymentStatus: 'COMPLETED' });
    expect(res.status).toBe(200);
    expect(res.body.data.paymentStatus).toBe('COMPLETED');
    expect(res.body.data.paymentLink).toContain('flywire');
  });

  it('a student cannot change status', async () => {
    const { appId } = await setup();
    const student = await createUser('STUDENT', 'other-s@test.com');
    const res = await request(app).patch(`/api/applications/${appId}/status`).set('Authorization', student.auth)
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/modules/applications/applications.transitions.test.ts`
Expected: PASS (3 tests). If failing, fix the Task 25 status/payment service or routes.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: application status and payment transitions"
```

---

## Phase 7 — Admin, GDPR, Seed, Docs

### Task 27: Admin stats + audit read + consent endpoints

**Files:**
- Create: `src/modules/admin/service.ts`, `src/modules/admin/controller.ts`, `src/modules/admin/routes.ts`
- Create: `src/modules/audit/routes.ts`
- Create: `src/modules/consent/{service,controller,routes}.ts`
- Modify: `src/app.ts` (mount `/api/admin`, `/api/audit`, `/api/consent`)
- Test: `src/modules/admin/admin.test.ts`

- [ ] **Step 1: Write the failing test — `src/modules/admin/admin.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app, resetDb, createUser } from '../../test/helpers.js';
import { prisma } from '../../lib/prisma.js';

describe('admin + gdpr', () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('returns dashboard stats for admin', async () => {
    await createUser('STUDENT', 's@test.com');
    const { auth } = await createUser('ADMIN');
    const res = await request(app).get('/api/admin/stats').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('students');
    expect(res.body.data).toHaveProperty('applications');
  });

  it('forbids non-admin from reading audit logs', async () => {
    const { auth } = await createUser('STUDENT');
    const res = await request(app).get('/api/audit').set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('records and lists a consent for the current user', async () => {
    const { auth } = await createUser('STUDENT');
    const post = await request(app).post('/api/consent').set('Authorization', auth)
      .send({ consentType: 'MARKETING', granted: true });
    expect(post.status).toBe(201);
    const list = await request(app).get('/api/consent/me').set('Authorization', auth);
    expect(list.body.data.some((c: any) => c.consentType === 'MARKETING')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/admin/admin.test.ts`
Expected: FAIL — routes missing.

- [ ] **Step 3: Create `src/modules/admin/service.ts`**

```ts
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
```

- [ ] **Step 4: Create `src/modules/admin/controller.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function stats(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.stats() }); } catch (e) { next(e); }
}
```

- [ ] **Step 5: Create `src/modules/admin/routes.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as c from './controller.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));
adminRouter.get('/stats', c.stats);
```

- [ ] **Step 6: Create `src/modules/audit/routes.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { prisma } from '../../lib/prisma.js';

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole('ADMIN'));
auditRouter.get('/', async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ data: logs });
  } catch (e) { next(e); }
});
```

- [ ] **Step 7: Create `src/modules/consent/service.ts`**

```ts
import { prisma } from '../../lib/prisma.js';

export function record(userId: string, consentType: string, granted: boolean, version = '1.0') {
  return prisma.consent.create({ data: { userId, consentType, granted, version } });
}
export function listForUser(userId: string) {
  return prisma.consent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
}
```

- [ ] **Step 8: Create `src/modules/consent/controller.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export async function record(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ data: await service.record(req.user!.id, req.body.consentType, req.body.granted ?? true) }); }
  catch (e) { next(e); }
}
export async function listMine(req: Request, res: Response, next: NextFunction) {
  try { res.json({ data: await service.listForUser(req.user!.id) }); } catch (e) { next(e); }
}
```

- [ ] **Step 9: Create `src/modules/consent/routes.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { auditLog } from '../../middleware/audit.js';
import * as c from './controller.js';

const recordSchema = z.object({ body: z.object({ consentType: z.string().min(1), granted: z.boolean().default(true) }) });

export const consentRouter = Router();
consentRouter.use(requireAuth);
consentRouter.post('/', validate(recordSchema), auditLog('CONSENT', 'consent'), c.record);
consentRouter.get('/me', c.listMine);
```

- [ ] **Step 10: Mount in `src/app.ts`**

```ts
import { adminRouter } from './modules/admin/routes.js';
import { auditRouter } from './modules/audit/routes.js';
import { consentRouter } from './modules/consent/routes.js';
// ...
  app.use('/api/admin', adminRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/consent', consentRouter);
```

- [ ] **Step 11: Run test to verify it passes**

Run: `npx vitest run src/modules/admin/admin.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: admin stats, audit read, consent endpoints"
```

---

### Task 28: Seed from FE mockData + API contract docs + full suite

**Files:**
- Create: `prisma/seed.ts`, `docs/API.md`
- Modify: `README.md`

- [ ] **Step 1: Create `prisma/seed.ts`** (ports `D:\fly-together\src\mockData.ts`)

```ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Demo users (password: Password1!)
  const passwordHash = await bcrypt.hash('Password1!', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@flytogether.com' },
    update: {},
    create: { email: 'admin@flytogether.com', passwordHash, role: 'ADMIN' },
  });
  const agentUser = await prisma.user.upsert({
    where: { email: 'agent@flytogether.com' },
    update: {},
    create: { email: 'agent@flytogether.com', passwordHash, role: 'AGENT', agent: { create: { name: 'Premium Agent' } } },
  });
  const studentUser = await prisma.user.upsert({
    where: { email: 'alex.j@example.com' },
    update: {},
    create: {
      email: 'alex.j@example.com', passwordHash, role: 'STUDENT',
      student: { create: { firstName: 'Alex', lastName: 'Johnson', profileCompletion: 65, isProfileCompleted: false } },
    },
  });
  void admin; void agentUser; void studentUser;

  // Universities (from mockUniversities)
  const universities = [
    { name: 'University of Oxford', location: 'Oxford, UK', logo: 'https://logo.clearbit.com/ox.ac.uk', rating: 4.9, tuitionFee: '£28,000 - £45,000', description: 'The oldest university in the English-speaking world.', courses: ['Computer Science', 'Philosophy', 'Medicine'] },
    { name: 'Imperial College London', location: 'London, UK', logo: 'https://logo.clearbit.com/imperial.ac.uk', rating: 4.8, tuitionFee: '£32,000 - £50,000', description: 'A world-class university focusing on science, engineering, medicine and business.', courses: ['Engineering', 'Business', 'Natural Sciences'] },
    { name: 'University of Manchester', location: 'Manchester, UK', logo: 'https://logo.clearbit.com/manchester.ac.uk', rating: 4.6, tuitionFee: '£22,000 - £35,000', description: 'A prestigious Red Brick university with a rich heritage.', courses: ['Physics', 'Economics', 'Arts'] },
  ];
  for (const u of universities) {
    const { courses, ...rest } = u;
    await prisma.university.create({ data: { ...rest, courses: { create: courses.map((name) => ({ name })) } } });
  }

  // Service providers (from mockServices)
  await prisma.serviceProvider.createMany({ data: [
    { name: 'Royal Rahi Logistics', category: 'LOGISTICS', rating: 4.9, price: 'Price per KG', image: 'https://picsum.photos/seed/truck/400/300', description: 'Safe and secure shipping for your baggage and documents worldwide.' },
    { name: 'UniSafe Payments', category: 'ONLINE_PAYMENT', rating: 4.9, price: 'Zero Fee', image: 'https://picsum.photos/seed/finance/400/300', description: 'Secure tuition fee payments and currency exchange services for students.' },
    { name: 'SkyHigh Travels', category: 'TICKET_BOOKING', rating: 4.8, price: 'Student Deals', image: 'https://picsum.photos/seed/travel/400/300', description: 'Special student fares for international and domestic flights.' },
    { name: 'Student Comforts', category: 'ACCOMMODATION', rating: 4.7, price: 'From £120/week', image: 'https://picsum.photos/seed/house/400/300', description: 'Premium student housing near major universities.' },
  ] });

  // Accommodations (illustrative; FE Accommodation screen)
  await prisma.accommodation.createMany({ data: [
    { name: 'Oxford Student Lodge', city: 'Oxford', universityProximity: 'University of Oxford', price: 'From £150/week', type: 'Studio', amenities: ['WiFi', 'Laundry', 'Gym'], image: 'https://picsum.photos/seed/acc1/400/300', description: 'Modern studios near campus.' },
    { name: 'London City Rooms', city: 'London', universityProximity: 'Imperial College London', price: 'From £220/week', type: 'Shared', amenities: ['WiFi', 'Kitchen'], image: 'https://picsum.photos/seed/acc2/400/300', description: 'Affordable shared housing in central London.' },
  ] });

  // Home partners (from mockHomePartners)
  await prisma.partner.createMany({ data: [
    { name: 'Avila University', imageUrl: 'https://universitysearch-jvqc.onrender.com/icons/Avila_university.png', redirectionUrl: 'https://universitysearch-jvqc.onrender.com/pdfs/a5eTf000000IjhTIAS.pdf' },
    { name: 'The Language Gallery Canada', imageUrl: 'https://universitysearch-jvqc.onrender.com/icons/the_language_gallery_canada.png', redirectionUrl: 'https://universitysearch-jvqc.onrender.com/pdfs/Canada.pdf' },
    { name: 'BSBI Berlin', imageUrl: 'https://universitysearch-jvqc.onrender.com/icons/school_of_business_innovation.png', redirectionUrl: 'https://universitysearch-jvqc.onrender.com/pdfs/BSBI_SPAIN_MASTER_SLIDES.pdf' },
  ] });

  // Blogs (from mockBlogPosts)
  await prisma.blog.createMany({ data: [
    { title: 'Top 5 UK Universities for 2024 International Students', slug: 'top-5-uk-universities-2024', excerpt: 'Explore the best picks for academic excellence, student life, and career prospects in the United Kingdom this year.', content: 'Choosing the right university is a pivotal decision...', coverImage: 'https://images.pexels.com/photos/32752097/pexels-photo-32752097.jpeg', author: 'UniFlow Editorial', category: 'Education', readTime: '6 min read' },
    { title: 'How to Secure an Education Loan without Collateral', slug: 'education-loan-no-collateral', excerpt: 'Detailed guide on financing your overseas education through student loans with favorable terms.', content: 'Financial barriers should not stop your dreams...', coverImage: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f', author: 'Finance Team', category: 'Finance', readTime: '8 min read' },
  ] });

  // Testimonials (from mockTestimonials)
  await prisma.testimonial.createMany({ data: [
    { studentName: 'Aarav Sharma', universityName: 'University of Oxford', content: 'The journey from application to arrival was seamless.', mediaUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6', mediaType: 'IMAGE', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aarav' },
    { studentName: 'Priya Patel', universityName: 'Imperial College London', content: 'Getting my visa and student loan was easy with the team.', mediaUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330', mediaType: 'IMAGE', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya' },
    { studentName: 'Michael Chen', universityName: 'University of Manchester', content: 'The logistics service was a lifesaver.', mediaUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d', mediaType: 'IMAGE', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael' },
  ] });

  console.log('Seed complete.');
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
```

- [ ] **Step 2: Run the seed against the dev database**

Run: `npm run seed`
Expected: prints "Seed complete." with no errors.

- [ ] **Step 3: Create `docs/API.md`** documenting every endpoint for the FE team

Document, grouped by module, each route with: method + path, auth/role required, request body shape, and response `data` shape. Cover: auth (register/login/refresh/logout/me), students (me get/put, documents upload/list/delete/verify, files signed GET), agents (list, me/students, students/:id/verify), universities, accommodations, service-providers, partners, blogs, testimonials, loans, applications (create/list/get/timeline/status/payment), admin/stats, audit, consent. Note the standard `{ data }` / `{ error: { code, message } }` envelopes and that the seeded demo logins are `admin@flytogether.com` / `agent@flytogether.com` / `alex.j@example.com`, all password `Password1!`.

- [ ] **Step 4: Update `README.md`** with run instructions

```markdown
# Fly Together API

Express + TypeScript + Prisma + PostgreSQL backend for the Fly Together FE.

## Setup
1. `npm install`
2. `npm run db:up`            # start Postgres (Docker)
3. `Copy-Item .env.example .env`
4. `npm run prisma:migrate`   # apply migrations
5. `npm run seed`             # load demo data
6. `npm run dev`              # http://localhost:4000

## Test
`npm test`   # spins tests against the DATABASE_URL database

See `docs/API.md` for the full endpoint contract.
```

- [ ] **Step 5: Run the FULL test suite**

Run: `npm test`
Expected: PASS — all suites green (app, hash, jwt, auth middleware, rbac, validate, audit, storage, auth register/session, students profile/documents/verify, agents, universities, accommodations, service-providers, partners, blogs, testimonials, loans, applications + transitions, admin/gdpr).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: seed from FE mockData, API docs, README"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** auth/JWT (T6, T12–13), student profile + documents + verification (T14–16), agents (T17), universities/accommodations/service-providers/partners/blogs/testimonials/loans (T18–24), applications + timeline + manual payment fields (T25–26), GDPR audit logs + consent (T10, T27), local storage w/ signed URLs + S3-ready interface (T11), seed from mockData (T28). Payments & university automation intentionally stubbed per spec §7.
- **Type consistency:** `req.user` is `{ id, role }` everywhere (T7). Service `shape()` only exists where a relation needs flattening (universities, T18). Enum string literals (`'STUDENT'`, `'LOGISTICS'`, etc.) match `schema.prisma` (T2).
- **Test DB warning:** `resetDb()` wipes the database named in `DATABASE_URL`. Run tests only against the local dev DB. (A future improvement: a separate `DATABASE_URL_TEST`.)
- **Module router mounting:** every new router must be added to `src/app.ts` *before* the 404 handler and error handler — those two stay last.
```
