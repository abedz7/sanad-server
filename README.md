# sanad-server

API for **Sanad**, a support-ticket / helpdesk system. Node.js 22 · Express 5 · TypeScript (strict) ·
Mongoose 8 · MongoDB 7.

This repository owns the API contract. The admin dashboard (`sanad-admin`) and the mobile app
(`sanad-mobile`) are built only against it:

- [`docs/API.md`](docs/API.md) — the contract (single source of truth; clients carry verbatim copies)
- [`docs/PLAN.md`](docs/PLAN.md) — scope, data model, security design, build order
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — why each library and pattern, with the trade-offs

## Prerequisites

- **Node.js 22** (`.nvmrc` provided — `nvm use`)
- **Docker** (only for the local MongoDB; any MongoDB 7 reachable via `MONGODB_URI` works too)

## Quick start

```bash
docker compose up -d                        # MongoDB 7 on 127.0.0.1:27017 (no auth, loopback only)
cp .env.example .env
openssl rand -base64 48                     # paste the output into .env as JWT_ACCESS_SECRET
npm install
npm run dev                                 # starts on http://localhost:4000
curl http://localhost:4000/health           # → { "data": { "status": "ok", ..., "db": "connected" } }
```

## Scripts

| Script               | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `npm run dev`        | Start with live reload (`tsx watch`)                             |
| `npm run build`      | Compile to `dist/`                                               |
| `npm start`          | Run the compiled server (`dist/server.js`)                       |
| `npm test`           | Full test suite (vitest + in-memory MongoDB; no services needed) |
| `npm run test:watch` | Tests in watch mode                                              |
| `npm run lint`       | ESLint (strict type-checked config)                              |
| `npm run typecheck`  | `tsc --noEmit`                                                   |
| `npm run seed`       | Seed demo data — _Phase 2 placeholder, prints a notice for now_  |
| `npm run audit`      | `npm audit --audit-level=high`                                   |
| `npm run format`     | Prettier over the repo                                           |

## Environment variables

All configuration comes from env, validated by zod at boot (`src/config/env.ts`); the process exits
with a readable list of problems if anything is missing or malformed. Matches `.env.example` exactly.

| Name                     | Required            | Default       | Purpose                                                          |
| ------------------------ | ------------------- | ------------- | ---------------------------------------------------------------- |
| `NODE_ENV`               | no                  | `development` | `development` / `test` / `production`                            |
| `PORT`                   | no                  | `4000`        | HTTP port                                                        |
| `LOG_LEVEL`              | no                  | `info`        | pino level (`fatal` … `trace`, `silent`)                         |
| `MONGODB_URI`            | **yes**             | —             | MongoDB connection string (`mongodb://` or `mongodb+srv://`)     |
| `JWT_ACCESS_SECRET`      | **yes**             | —             | HS256 secret, **min 32 chars** — `openssl rand -base64 48`       |
| `ACCESS_TOKEN_TTL`       | no                  | `15m`         | Access-token lifetime (jsonwebtoken duration string)             |
| `REFRESH_TOKEN_TTL_DAYS` | no                  | `30`          | Refresh-token lifetime in days                                   |
| `COOKIE_SECURE`          | no                  | `false`       | Mark the admin refresh cookie `Secure` (set `true` behind HTTPS) |
| `CORS_ORIGINS`           | **yes**             | —             | Comma-separated exact origins allowed with credentials           |
| `STORAGE_DRIVER`         | no                  | `local`       | `local` or `s3` (uploads land in Phase 2)                        |
| `LOCAL_STORAGE_DIR`      | no                  | `./storage`   | Upload directory for the `local` driver (gitignored)             |
| `MAX_UPLOAD_BYTES`       | no                  | `5242880`     | Upload size cap (5 MB)                                           |
| `S3_ENDPOINT`            | no                  | —             | S3-compatible endpoint (e.g. MinIO); optional                    |
| `S3_REGION`              | when driver is `s3` | —             | S3 region                                                        |
| `S3_BUCKET`              | when driver is `s3` | —             | S3 bucket                                                        |
| `S3_ACCESS_KEY_ID`       | when driver is `s3` | —             | S3 credentials                                                   |
| `S3_SECRET_ACCESS_KEY`   | when driver is `s3` | —             | S3 credentials                                                   |
| `REOPEN_WINDOW_DAYS`     | no                  | `7`           | Days a requester may reopen a closed ticket                      |
| `SEED_ADMIN_EMAIL`       | seed only           | —             | Demo admin account for `npm run seed` (never read by the server) |
| `SEED_ADMIN_PASSWORD`    | seed only           | —             | Demo admin password (printed never, logged never)                |
| `SEED_USER_EMAIL`        | seed only           | —             | Demo user account                                                |
| `SEED_USER_PASSWORD`     | seed only           | —             | Demo user password                                               |

## Running tests

```bash
npm test
```

No database or Docker needed: the suite boots a real `mongod` per test file via
`mongodb-memory-server` (first run downloads the binary once) and runs Supertest against the real
`createApp()`. Covered so far: register/login/refresh/logout/me flows, account lockout, refresh
rotation + reuse detection (family revocation), RBAC on the admin surface, strict-schema and
operator-injection rejects, request-id/CORS/helmet behaviour, and the auth rate limit. Production
rate-limit values are untouched; tests only reset the counters between cases.

## Project structure

```
src/
├── app.ts            # Express app factory: middleware order, routers, error handling
├── server.ts         # Boot: connect DB, listen, graceful shutdown
├── db.ts             # Mongoose connection + explicit index builds
├── config/           # zod-validated env (fails the boot readably)
├── lib/              # errors catalogue, response envelope, logger, pagination, ObjectId schema
├── middleware/       # auth/RBAC, validation, rate limits, request id, operator guard, error handler
├── modules/
│   ├── auth/         # routes → controller → service; token + password services; refresh-token model
│   └── users/        # user model + repository; admin users listing
├── routes/           # /health and the /api/v1 router (admin RBAC applied at the mount)
└── types/            # Express request augmentation (requestId, user, validated)
tests/                # vitest + supertest + mongodb-memory-server (setup.ts has the helpers)
scripts/              # seed (Phase 2)
docs/                 # API contract, plan, decisions
```

Layering is strict: **routes → controllers → services → repositories → models.** Routes carry no
logic, controllers no business rules, and repositories are the only code that touches Mongoose.

## Security

Each control, where it lives:

- **Passwords**: argon2id (64 MiB / 3 passes), policy 10–128 chars, not equal to the email, not on a
  common-password list — `src/modules/auth/password.service.ts`
- **Login**: one generic 401 for every failure; dummy-hash verify keeps unknown-email timing in line
  with wrong-password — `src/modules/auth/auth.service.ts`
- **Lockout**: 5 failures → 15 min lock via one atomic pipeline update; locked accounts don't
  increment (no lockout-extension DoS) — `src/modules/users/user.repository.ts`
- **Access tokens**: JWT HS256, 15 min, algorithm and issuer pinned on verify —
  `src/modules/auth/token.service.ts`
- **Refresh tokens**: opaque 256-bit, stored as sha256 hash only, rotated on every use, reuse revokes
  the whole family, TTL index purges expired rows — `src/modules/auth/refresh-token.model.ts`,
  `src/modules/auth/auth.service.ts`
- **Web session**: refresh token only in an `httpOnly; SameSite=Strict` cookie path-scoped to the
  refresh route; mobile gets it in the body — never both — `src/modules/auth/auth.controller.ts`
- **RBAC**: `requireAuth` + `requireRole('admin')` applied once at the `/api/v1/admin` mount, so no
  admin route can exist without it — `src/routes/index.ts`, `src/middleware/auth.ts`
- **Live-session check**: one indexed `exists` query per request cuts off soft-deleted users
  immediately, not after token expiry — `src/middleware/auth.ts`
- **Input**: zod `.strict()` on every body/query/params, ObjectIds validated before any query,
  `limit ≤ 100`, length caps on text fields — `src/middleware/validate.ts`, `src/lib/pagination.ts`,
  `src/lib/objectId.ts`
- **Operator-injection guard**: keys starting with `$` or containing `.` rejected app-wide before any
  route — `src/middleware/operatorGuard.ts`
- **Transport hardening**: helmet, exact-origin CORS allowlist from env, `x-powered-by` off, JSON
  body limit 100 KB — `src/app.ts`
- **Rate limits**: 300/15 min per IP globally, 10/15 min per IP on auth routes, 60/15 min per user on
  mutations; 429s use the standard envelope with `Retry-After` — `src/middleware/rateLimit.ts`
- **Observability**: pino with redaction of `authorization`, `cookie`, `password`, tokens and
  `email`; `X-Request-Id` validated/echoed or generated, present in logs and on every error body —
  `src/lib/logger.ts`, `src/middleware/requestId.ts`
- **Errors**: one shape for everything, stack traces never serialised to clients, unknown errors →
  `INTERNAL` + requestId — `src/middleware/errorHandler.ts`
- **Config**: all secrets from env, validated at boot; `.env` gitignored; `.env.example` placeholders
  only — `src/config/env.ts`
- **Data exposure**: `toJSON` strips `passwordHash`, lockout fields, `__v`; refresh-token docs
  serialise to nothing — `src/modules/users/user.model.ts`, `src/modules/auth/refresh-token.model.ts`
- **Secrets in git**: secretlint in the pre-commit hook, gitleaks over full history + `npm audit` in
  CI — `.husky/pre-commit`, `.github/workflows/ci.yml`
- **Uploads** (Phase 2): multer memory storage, magic-byte MIME checks, random storage keys,
  authenticated download only — per `docs/PLAN.md` §6

## Phase 2 — coming next

> **Placeholders — not implemented yet.** Phase 2 adds categories, tickets, comments, attachments,
> history and stats per `docs/PLAN.md`.

- **Seed & demo accounts**: `npm run seed` will create a demo admin and user from the `SEED_*` env
  vars and print counts only (emails documented here then; passwords never).
