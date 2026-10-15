# sanad-server

API for **Sanad**, a support-ticket / helpdesk system. Node.js 22 · Express 5 · TypeScript (strict) ·
Mongoose 8 · MongoDB 7.

This repository owns the API contract. The admin dashboard (`sanad-admin`) and the mobile app
(`sanad-mobile`) are built only against it:

- [`docs/API.md`](docs/API.md) — the contract, v1.2.0 (single source of truth; clients carry verbatim copies)
- [`docs/PLAN.md`](docs/PLAN.md) — scope, data model, security design, build order
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — why each library and pattern, with the trade-offs
- [`docs/SECURITY.md`](docs/SECURITY.md) — threat model: threat → control → file → test, live-audit results, known limitations

<!-- docs/screenshots/ will hold admin + mobile screenshots once the clients ship (Phase 3/4). -->

## Prerequisites

- **Node.js 22** (`.nvmrc` provided — `nvm use`)
- **Docker** (only for the local MongoDB; any MongoDB 7 reachable via `MONGODB_URI` works too)

## Quick start

```bash
docker compose up -d                        # MongoDB 7 on 127.0.0.1:27017 (no auth, loopback only)
cp .env.example .env
openssl rand -base64 48                     # paste the output into .env as JWT_ACCESS_SECRET
npm install
npm run seed                                # demo accounts + categories + 25 tickets (set SEED_* in .env first)
npm run dev                                 # http://localhost:4000 — try: curl http://localhost:4000/health
```

### Demo accounts

`npm run seed` creates three accounts from your `.env` (re-running is safe — it never duplicates):

| Account     | Email                                         | Password                     |
| ----------- | --------------------------------------------- | ---------------------------- |
| Admin       | `SEED_ADMIN_EMAIL`                            | whatever you set in `.env`   |
| Demo user   | `SEED_USER_EMAIL`                             | whatever you set in `.env`   |
| Second user | `SEED_USER_EMAIL` with `+2` (e.g. `user+2@…`) | same as `SEED_USER_PASSWORD` |

The seed prints counts only; it never prints or logs credentials.

## Scripts

| Script               | What it does                                                                |
| -------------------- | --------------------------------------------------------------------------- |
| `npm run dev`        | Start with live reload (`tsx watch`)                                        |
| `npm run build`      | Compile to `dist/`                                                          |
| `npm start`          | Run the compiled server (`dist/server.js`)                                  |
| `npm test`           | Full test suite (vitest + in-memory MongoDB; no services needed)            |
| `npm run test:watch` | Tests in watch mode                                                         |
| `npm run lint`       | ESLint (strict type-checked config)                                         |
| `npm run typecheck`  | `tsc --noEmit`                                                              |
| `npm run seed`       | Idempotent demo data through the real services (users, categories, tickets) |
| `npm run audit`      | `npm audit --audit-level=high`                                              |
| `npm run format`     | Prettier over the repo                                                      |

## API surface

Full request/response shapes, error codes and the status matrix live in [`docs/API.md`](docs/API.md).
Base path `/api/v1`; `GET /health` sits outside it.

| Area       | Endpoints                                                                                                                                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth       | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me`                                                                                                                                                                     |
| Categories | `GET /categories` (user) · `GET/POST /admin/categories` · `PATCH/DELETE /admin/categories/:id`                                                                                                                                                                               |
| Tickets    | `POST/GET /tickets` · `GET/PATCH /tickets/:id` · `POST /tickets/:id/status` · `GET/POST /tickets/:id/comments` · `GET /tickets/:id/history` · `POST /tickets/:id/attachments` · `GET /tickets/:id/attachments/:attachmentId/download`                                        |
| Admin      | `GET /admin/stats` · `GET /admin/tickets` · `GET/PATCH /admin/tickets/:id` · `POST /admin/tickets/:id/status` · `GET/POST /admin/tickets/:id/comments` · `GET /admin/tickets/:id/history` · `GET /admin/tickets/:id/attachments/:attachmentId/download` · `GET /admin/users` |
| Health     | `GET /health`                                                                                                                                                                                                                                                                |

Every user-facing ticket route is ownership-scoped: a ticket that is missing **or not yours** is a
`404`, never a `403`.

## Uploads & storage

- Max **5 MB** per file (`MAX_UPLOAD_BYTES`), max **5 attachments** per ticket, one `file` field per request.
- Allowed types — decided by **magic bytes**, never by filename or declared type: JPEG, PNG, WebP, PDF.
- Bytes are stored under a random key via a `StorageAdapter`:
  - `STORAGE_DRIVER=local` (default): files under `LOCAL_STORAGE_DIR` (gitignored, never statically served)
  - `STORAGE_DRIVER=s3`: any S3-compatible endpoint (AWS, MinIO via `S3_ENDPOINT`) using `@aws-sdk/client-s3`
- Downloads go only through the authenticated, ownership-checked route, as
  `Content-Disposition: attachment` with `nosniff` and `Cache-Control: private, no-store`.

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
| `STORAGE_DRIVER`         | no                  | `local`       | `local` or `s3`                                                  |
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
`createApp()`. Covered: all auth flows (lockout, rotation, reuse detection → family revocation,
logout by refresh token), RBAC on every admin surface, IDOR on tickets/comments/history/attachments
(always 404, never 403), every row of the status matrix including the reopen window, category
lifecycle with name reuse, internal-comment visibility, upload rejects (size/type/count/spoofed
extensions) and download headers, exact `/admin/stats` numbers, the append-only history trail,
strict-schema and operator-injection rejects, request-id/CORS/helmet behaviour, and both auth rate
limiters. Production rate-limit values are untouched; tests only reset the counters between cases.

## Project structure

```
src/
├── app.ts            # Express app factory: middleware order, routers, error handling
├── server.ts         # Boot: connect DB, listen, graceful shutdown
├── db.ts             # Mongoose connection + explicit index builds
├── config/           # zod-validated env (fails the boot readably)
├── lib/              # errors catalogue, response envelope, logger, pagination, ObjectId schema
├── middleware/       # auth/RBAC, validation, rate limits, request id, operator guard, upload, error handler
├── modules/
│   ├── auth/         # register/login/refresh/logout/me; token + password services; refresh-token model
│   ├── users/        # user model + repository; admin users listing
│   ├── categories/   # soft-deletable categories; admin CRUD with ticket counts
│   ├── tickets/      # ticket model, PURE status policy, ownership-scoped repository, user+admin routes
│   ├── comments/     # referenced comments with internal notes (admin-only visibility)
│   ├── attachments/  # upload/download, storage/ (adapter, local disk, S3), security/ (scanner seam)
│   ├── history/      # append-only ticket event log (append + list; no update/delete exists)
│   └── stats/        # /admin/stats via one $facet aggregation
├── routes/           # /health and the /api/v1 router (admin RBAC applied once at the mount)
└── types/            # Express request augmentation (requestId, user, validated)
tests/                # vitest + supertest + mongodb-memory-server (setup.ts has the helpers)
scripts/              # seed.ts — idempotent demo data through the real services
docs/                 # API contract, plan, decisions (screenshots/ arrives with the clients)
```

Layering is strict: **routes → controllers → services → repositories → models.** Routes carry no
logic, controllers no business rules, and repositories are the only code that touches Mongoose.

## Security

The full threat model — every control with its file, the test that proves it, live-audit results and
known limitations — is in [`docs/SECURITY.md`](docs/SECURITY.md). Summary, each control and where it
lives:

- **Passwords**: argon2id (64 MiB / 3 passes), policy 10–128 chars, not equal to the email, not on a
  common-password list — `src/modules/auth/password.service.ts`
- **Login**: one generic 401 for every failure; dummy-hash verify keeps unknown-email timing in line
  with wrong-password — `src/modules/auth/auth.service.ts`
- **Lockout**: 5 failures → 15 min lock via one atomic pipeline update; locked accounts don't
  increment (no lockout-extension DoS) — `src/modules/users/user.repository.ts`
- **Access tokens**: JWT HS256, 15 min, algorithm and issuer pinned on verify —
  `src/modules/auth/token.service.ts`
- **Refresh tokens**: opaque 256-bit, stored as sha256 hash only, rotated on every use, reuse revokes
  the whole family, TTL index purges expired rows; logout needs only the token itself and is
  enumeration-safe — `src/modules/auth/refresh-token.model.ts`, `src/modules/auth/auth.service.ts`
- **Web session**: refresh token only in an `httpOnly; SameSite=Strict` cookie path-scoped to the
  refresh route; mobile gets it in the body — never both; every `/auth/*` response is
  `Cache-Control: no-store` — `src/modules/auth/auth.controller.ts`, `src/modules/auth/auth.routes.ts`
- **RBAC**: `requireAuth` + `requireRole('admin')` applied once at the `/api/v1/admin` mount, so no
  admin route can exist without it — `src/routes/index.ts`, `src/middleware/auth.ts`
- **Live-session check**: one indexed `exists` query per request cuts off soft-deleted users
  immediately, not after token expiry — `src/middleware/auth.ts`
- **Ownership / IDOR**: every user-facing ticket finder includes `requesterId` in the Mongo filter
  itself; missing-or-not-yours is always `404 NOT_FOUND`, never 403; comments, history and
  attachments are reachable only through their ticket — `src/modules/tickets/tickets.repository.ts`
- **Status machine**: all transition rules in one pure, table-driven policy (incl. the 7-day
  requester reopen window) — `src/modules/tickets/ticket-status.policy.ts`
- **Audit log**: append-only by construction — the repository exports only `append` and
  `listByTicket` — `src/modules/history/history.repository.ts`
- **Internal notes**: `isInternal` comments are excluded from user queries in the filter itself,
  never post-filtered — `src/modules/comments/comments.repository.ts`
- **Input**: zod `.strict()` on every body/query/params, ObjectIds validated before any query,
  `limit ≤ 100`, length caps on text fields — `src/middleware/validate.ts`, `src/lib/pagination.ts`,
  `src/lib/objectId.ts`
- **Search**: admin `q` uses the text index via `$text` — never a regex built from user input —
  `src/modules/tickets/tickets.repository.ts`
- **Operator-injection guard**: keys starting with `$` or containing `.` rejected app-wide before any
  route — `src/middleware/operatorGuard.ts`
- **Uploads**: multer memory storage, 5 MB / 1 file / max 5 per ticket; MIME decided by magic bytes
  against a jpeg/png/webp/pdf allowlist (spoofed extensions rejected); random storage key; sanitised
  original name; scanner seam (`NoopScanner` honestly reports `skipped`) —
  `src/middleware/upload.ts`, `src/modules/attachments/attachments.service.ts`,
  `src/modules/attachments/security/virus-scanner.ts`
- **Attachment storage**: key is the only path component (traversal rejected), dir outside any
  static mount; downloads only via the authenticated route with `Content-Disposition: attachment`,
  `nosniff`, `Cache-Control: private, no-store` — `src/modules/attachments/storage/LocalDiskStorage.ts`,
  `src/modules/attachments/attachments.controller.ts`
- **Transport hardening**: helmet, exact-origin CORS allowlist from env, `x-powered-by` off, JSON
  body limit 100 KB — `src/app.ts`
- **Rate limits**: 300/15 min per IP globally; login+register 10/15 min per IP (one counter);
  refresh+logout 60/15 min per IP; 60/15 min per user on mutations; 429s use the standard envelope
  with `Retry-After` — `src/middleware/rateLimit.ts`
- **Observability**: pino with redaction of `authorization`, `cookie`, `password`, tokens and
  `email`; `X-Request-Id` validated/echoed or generated, present in logs and on every error body —
  `src/lib/logger.ts`, `src/middleware/requestId.ts`
- **Errors**: one shape for everything, stack traces never serialised to clients, unknown errors →
  `INTERNAL` + requestId; multer failures mapped to `UPLOAD_REJECTED` 413/400 —
  `src/middleware/errorHandler.ts`
- **Config**: all secrets from env, validated at boot; `.env` gitignored; `.env.example` placeholders
  only — `src/config/env.ts`
- **Data exposure**: `toJSON` strips `passwordHash`, lockout fields, `__v` and `storedKey`; populated
  refs project to `{ id, name, role }` — never emails; refresh-token docs serialise to nothing —
  `src/modules/users/user.model.ts`, `src/modules/tickets/ticket.model.ts`,
  `src/modules/auth/refresh-token.model.ts`
- **Seed**: credentials from env, passwords through the same policy + argon2id, prints counts only —
  `scripts/seed.ts`
- **Secrets in git**: secretlint in the pre-commit hook, gitleaks over full history + `npm audit` in
  CI — `.husky/pre-commit`, `.github/workflows/ci.yml`
