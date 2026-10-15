# sanad-server — rules for anyone (human or agent) working in this repo

Sanad is a Support Ticket / Helpdesk system built as a 48-hour technical assessment. Reviewers grade
code structure, MongoDB modelling, permissions and error handling, architecture decisions, README
quality, commit history and, above all, **security**. Every choice must be defensible in an interview.

This repo **owns the API contract**. `docs/API.md` is the single source of truth; the two client repos
(`sanad-admin`, `sanad-mobile`) carry a verbatim copy and build only against it.

## Stack (fixed — do not substitute without asking)

Node.js 22 · Express 5 · TypeScript (strict) · Mongoose 8 · MongoDB 7 · zod · argon2 · jsonwebtoken ·
pino · multer · file-type · helmet · express-rate-limit · Vitest + Supertest + mongodb-memory-server.

## Architecture rules

- **Layered, always:** `routes → controllers → services → repositories → models`.
  - Routes: wiring only (`router.get(path, middleware..., controller)`); no logic, no DB.
  - Controllers: translate HTTP ↔ service calls; no business rules; no Mongoose calls.
  - Services: all business rules (status machine, ownership, lockout, rotation).
  - Repositories: all queries; the only place that touches models. Ownership-scoped finders live here.
- One module per domain under `src/modules/<name>/` with `<name>.routes.ts`, `.controller.ts`,
  `.service.ts`, `.repository.ts`, `.model.ts`, `.schemas.ts` (zod). Admin routes live in a separate
  `admin-<name>.routes.ts` and are mounted under `/api/v1/admin` behind `requireRole('admin')`.
- One API envelope, one error shape, error codes from `src/lib/errors.ts` only. See `docs/API.md`.
- Every change to the contract is a change to `docs/API.md` in the same commit.

## Security rules (non-negotiable; each must be visible in code)

- Passwords: argon2id only. Never log, never return. Login returns one generic error for every failure.
- Access token: JWT, 15 min, HS256 with `JWT_ACCESS_SECRET` (≥ 32 chars). Refresh token: opaque
  256-bit random, stored as sha256 hash, rotated on every use, family revoked on reuse or logout.
- Web client gets the refresh token only as an `httpOnly; SameSite=Strict; Path=/api/v1/auth/refresh`
  cookie; mobile gets it in the body. Never both.
- RBAC middleware per router **and** ownership checks in repositories. A user-facing query that
  cannot include `requesterId: callerId` is a bug. Missing-or-not-yours → `404 NOT_FOUND`, never 403.
- zod `.strict()` on every body/query/params. ObjectIds validated before any query. `limit ≤ 100`.
  String length caps on every text field. No regex built from user input (text index for search).
- Keys starting with `$` or containing `.` in any input are rejected (operator-injection guard).
- Uploads: multer memory storage, 5 MB cap, MIME verified by magic bytes (`file-type`), stored under
  a random key, served only via the authenticated download route with `Content-Disposition: attachment`
  and `nosniff`. Never served from a static path.
- `helmet`, CORS allowlist from env (exact origins), `x-powered-by` off, JSON body limit 100 KB.
- `pino` with redaction of `authorization`, `cookie`, `password`, `*.token`, `email`. Every request has
  an `X-Request-Id` that appears in logs and in error responses.
- Global error handler: one shape, no stack in production, unknown errors → `INTERNAL` + requestId.
- All config from env, validated by zod at boot; the process exits with a readable list on failure.
- `.env` is gitignored; `.env.example` has placeholders only. Seed credentials come from env; the seed
  prints counts, never values.
- Model `toJSON` strips `passwordHash`, `tokenHash`, lockout fields, `__v`.

## Engineering rules

- Build only what `docs/PLAN.md` and `docs/API.md` specify. Propose before building anything else or
  anything structural / irreversible.
- Prefer boring, well-known libraries. Every dependency gets one paragraph in `docs/DECISIONS.md`.
- No `any` without a comment saying why. No `// @ts-ignore`.
- Tests for: auth flows, lockout, refresh rotation + reuse, RBAC on every admin route, IDOR on
  tickets/comments/attachments/history, every status-transition row, strict-schema rejects, upload rejects.
- Commits: conventional (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`), one concern each,
  small, in the author's name only — no bot trailers. Never commit `.env`, `node_modules`, `dist`,
  `storage/`, coverage, or logs. Commit early and often; the history is graded.
- README must let a stranger run the server in under 10 minutes: docker-compose for Mongo, `npm run
  seed`, demo accounts (emails only), `npm test`.
