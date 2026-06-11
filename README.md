# Fly Together API

Express + TypeScript + Prisma + PostgreSQL backend for the Fly Together FE.

## Setup
1. `npm install`
2. Ensure PostgreSQL is running and `DATABASE_URL` in `.env` points to it
   (default: `postgresql://postgres:root@localhost:5432/flytogether`).
   A `docker-compose.yml` is provided as an alternative (`npm run db:up`, port 5433 — update `.env`).
3. `npm run prisma:migrate`   # apply migrations
4. `npm run seed`             # load demo data
5. `npm run dev`              # http://localhost:4000

## Test
`npm test`   # runs the suite against the DATABASE_URL database

> Tests reset (wipe) the database in `DATABASE_URL` between runs — point it at a local dev DB only.

## Demo logins (after seeding)
- `admin@flytogether.com` / `Password1!` (ADMIN)
- `agent@flytogether.com` / `Password1!` (AGENT)
- `alex.j@example.com` / `Password1!` (STUDENT)

See `docs/API.md` for the full endpoint contract.
