# Fly Together — Backend Design Spec

**Date:** 2026-06-11
**Status:** Approved (design); pending implementation plan
**Scope:** Backend REST API + PostgreSQL for the existing `fly-together` React FE

---

## 1. Overview

"Let's Fly Together" is a platform for onboarding students who want to study in the
UK through authorized consultants/agents. Students register, complete a profile,
upload documents, browse universities/courses/accommodation/services, and submit
applications. Admins verify profiles and manage partner content. Agents (consultants)
verify and manage assigned students.

This spec defines the **backend only**. The React FE (`D:\fly-together`) currently
runs entirely on `src/mockData.ts` plus Firebase Auth (mostly dummy localStorage
logins). The FE will keep its mock data for now; this effort delivers the API + DB +
seed + tests, plus a documented API contract so FE integration is a clean follow-up.

### Decisions locked during brainstorming
- **Auth:** Backend owns users. bcrypt-hashed passwords, JWT access + refresh tokens. (Not Firebase.)
- **Stack:** Node + Express + TypeScript + Prisma ORM + PostgreSQL.
- **File storage:** Local disk in v1 behind an S3-swappable `StorageProvider` abstraction.
- **v1 scope includes:** core CRUD, auth, document upload/verification, GDPR audit logs + consent.
- **v1 defers (stubbed):** real payment gateway (Flywire) and university API/email automation.
  Payments are manual: an admin sets `payment_link` and `payment_status`.
- **FE rewiring:** Out of scope. Documented contract only.

---

## 2. Architecture

Standalone REST API in a sibling folder `D:\fly-together-api` (its own git + package.json),
kept separate from the Vite FE. Local Postgres via `docker-compose`.

```
fly-together-api/
  docker-compose.yml          # Postgres 16 for local dev
  prisma/
    schema.prisma             # all models
    migrations/
    seed.ts                   # ports mockData.ts -> DB
  src/
    index.ts                  # express bootstrap (helmet, cors, routes, error handler)
    config/env.ts             # zod-validated environment
    lib/
      prisma.ts               # PrismaClient singleton
      jwt.ts                  # sign/verify access + refresh
      hash.ts                 # bcrypt wrappers
      storage/                # StorageProvider interface; LocalStorage (v1), S3Storage (later)
    middleware/
      auth.ts                 # requireAuth (JWT verify)
      rbac.ts                 # requireRole(...roles)
      validate.ts             # zod request validation
      audit.ts                # audit-log writer for mutations
      error.ts                # central error handler -> consistent JSON
    modules/<domain>/         # routes.ts + controller.ts + service.ts + schema.ts (zod)
    utils/
  uploads/                    # local document storage (gitignored)
  .env / .env.example
  package.json / tsconfig.json
```

Each domain module is self-contained: `routes` wires HTTP, `controller` handles
req/res, `service` holds business logic + Prisma access, `schema` holds zod validation.
This keeps units small, independently testable, and easy to reason about.

---

## 3. Data Model (Prisma / PostgreSQL)

Reconciles the provided `DB_ver1.xlsx` schema + SRS + the FE `types.ts`. API responses
are shaped to match the FE's existing interfaces so future rewiring is mechanical.

### Enums
- `Role`: STUDENT | ADMIN | AGENT
- `AgentStatus`: ACTIVE | INACTIVE
- `DocType`: PASSPORT | AADHAR | ACADEMICS | IELTS
- `DocStatus`: UPLOADED | PENDING | VERIFIED | REJECTED
- `ServiceCategory`: ACCOMMODATION | TICKET_BOOKING | LOANS | LOGISTICS | ONLINE_PAYMENT
- `MediaType`: IMAGE | VIDEO
- `ApplicationStatus`: PROFILE | DOCUMENTS | VERIFICATION | APPLICATION | PAYMENT | COMPLETED
- `PaymentStatus`: PENDING | COMPLETED | FAILED

### Tables
- **user** — id, email (unique), password_hash, role, phone_number, created_at, updated_at
- **student** — id, user_id (FK, unique), agent_id (FK nullable), first_name, last_name,
  dob, address, is_profile_completed, is_profile_verified, is_doc_submitted,
  profile_completion (int), created_at, updated_at
- **agent** — id, user_id (FK, unique), name, status (AgentStatus), created_at, updated_at;
  `number_of_students` / assigned students derived via the `student.agent_id` relation
- **student_document** — id, student_id (FK), doc_url, doc_type, status, removed (bool),
  created_at, updated_at
- **university** — id, name, location, logo, rating (float), tuition_fee (string),
  description, created_at, updated_at
- **course** — id, university_id (FK), name
- **accommodation** — id, name, city, university_proximity, price, type, amenities (string[]),
  image, description, created_at, updated_at
- **service_provider** — id, name, category (ServiceCategory), rating, price, location,
  image, description, created_at, updated_at
- **partner** — id, name, image_url, redirection_url, created_at, updated_at  (home logos)
- **loan_application** — id, student_id (FK), amount, status, details (jsonb), created_at, updated_at
- **blog** — id, title, slug (unique), excerpt, content, cover_image, author, category,
  read_time, is_active, video_url, published_by, created_at, updated_at
- **testimonial** — id, student_name, university_name, content, media_url, media_type,
  avatar_url, is_active, created_at, updated_at
- **application** — id, student_id (FK), university_id (FK), course, status,
  rejection_reason, payment_link, payment_status, created_at, updated_at
- **application_timeline** — id, application_id (FK), action, action_taken_by, created_at
- **audit_log** — id, user_id (nullable FK), action, entity, entity_id, ip, metadata (jsonb), created_at
- **consent** — id, user_id (FK), consent_type, granted (bool), version, created_at

`admin` is represented by `user.role = ADMIN` (no separate table; the xlsx admin row had no columns).

---

## 4. API Surface (all under `/api`)

Public `GET` for content; admin-only writes unless noted. Role scoping enforced by middleware.

- **auth**: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`,
  `POST /auth/logout`, `GET /auth/me`
- **students**: `GET/PUT /students/me` (profile), profile-completion calc
- **documents**: `POST /students/me/documents` (multipart upload), `GET /students/me/documents`,
  `DELETE /documents/:id`, `PATCH /documents/:id/verify` (admin/agent), `GET /documents/:id/url` (signed)
- **agents**: `GET /agents`, `GET /agents/me/students`, `PATCH /students/:id/verify` (agent/admin)
- **universities**: `GET /universities`, `GET /universities/:id`, admin `POST/PUT/DELETE`
- **accommodations**: `GET /accommodations` (search: city, university_proximity, budget; filters:
  price, type, amenities), `GET /:id`, admin `POST/PUT/DELETE`
- **service-providers**: `GET /service-providers` (filter by category), admin `POST/PUT/DELETE`
- **partners**: `GET /partners`, admin `POST/PUT/DELETE`
- **blogs**: `GET /blogs`, `GET /blogs/:slug`, admin `POST/PUT/DELETE`
- **testimonials**: `GET /testimonials`, admin `POST/PUT/DELETE`
- **loans**: `POST /loans` (student), `GET /loans` (role-scoped), admin `PATCH /loans/:id`
- **applications**: `POST /applications` (student), `GET /applications` (role-scoped),
  `GET /applications/:id`, `PATCH /applications/:id/status`,
  `PATCH /applications/:id/payment` (admin: link + status), `GET /applications/:id/timeline`
- **admin**: `GET /admin/stats` (dashboard counts)
- **audit**: `GET /audit` (admin)
- **consent**: `POST /consent`, `GET /consent/me`

### Standard response shapes
- Success: `{ data: ... }`
- Error: `{ error: { code, message, details? } }` via the central error handler.

---

## 5. Cross-Cutting Concerns

- **Auth/RBAC**: short-lived JWT access token + longer refresh token; `requireAuth` decodes
  and attaches `req.user`; `requireRole(...roles)` guards admin/agent routes. Passwords bcrypt-hashed.
- **Validation**: zod schema per route via `validate` middleware (body/query/params).
- **Security (SRS)**: helmet, CORS limited to FE origin, rate limiting on auth, signed/expiring
  URLs for document downloads, audit-log middleware on all mutations, consent captured at registration.
- **Storage**: `StorageProvider` interface (`put`, `getSignedUrl`, `delete`); `LocalStorage`
  writes to `uploads/` now; `S3Storage` is a later drop-in. Upload validation: PDF/JPG/PNG, size limit.
- **Config**: all env vars zod-validated at boot; fail fast on missing config.

---

## 6. Testing & Seed

- **TDD** (Vitest + supertest) against a disposable test Postgres database. Each module gets
  service unit tests + route integration tests. Auth, RBAC, and document upload/verify flows
  are prioritized.
- **seed.ts** ports `src/mockData.ts` from the FE so the API returns the same content the FE
  already renders — making the eventual FE swap a 1:1 data match.

---

## 7. Out of Scope (later phases)

- FE rewiring (API client, AuthContext swap, replacing mockData per screen).
- Real payment gateway (Flywire) integration — v1 keeps manual link + status.
- University API submission / email-parser automation — v1 keeps admin/agent-driven flow.
- S3/Azure storage — interface is ready; impl deferred.
- Production deployment/CI.
