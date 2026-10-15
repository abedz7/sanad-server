# Sanad — 48-Hour Build Plan

Support Ticket / Helpdesk system. Three repos: `sanad-server`, `sanad-admin`, `sanad-mobile`.
Status: **Approved 2026-10-15** with the recommended answers on D1–D7 (no agent role, self-registration kept, no transactions, Tailwind + own components, "in use" = any ticket, GitHub `abedz7`, Node 22).

This file will live at `sanad-server/docs/PLAN.md` (the server owns all shared docs) and is
referenced, not copied, from the two client repos.

---

## 1. Requirements checklist (from the brief)

Legend: `[E]` explicit in the PDF · `[I]` implicit / inferred from "near-production", the grading
criteria, or the submission rules · `[B]` added by your brief to me (fixed architecture, security list).

### 1.1 Server — Node.js + MongoDB

- [ ] [E] Authentication (sign in for users and admins)
- [ ] [E] Role-based authorization (user / admin)
- [ ] [E] Users resource
- [ ] [E] Tickets: title, description, category, priority, status, requester, assignee
- [ ] [E] Comments on tickets
- [ ] [E] Attachments metadata (file bytes stored outside Mongo)
- [ ] [E] Categories (admin-managed)
- [ ] [E] Priority levels
- [ ] [E] Status transitions Open → In Progress → Resolved → Closed, enforced server-side
- [ ] [E] Pagination and filtering on ticket lists
- [ ] [E] Audit / history records for ticket changes
- [ ] [E] Clear architecture, separation of responsibilities (layered)
- [ ] [E] Input validation on every endpoint
- [ ] [E] Consistent API error shape
- [ ] [E] Protect user data (no cross-user reads, no secrets in responses)
- [ ] [E] Configuration and secrets out of source code
- [ ] [E] README + setup instructions + `.env.example`
- [ ] [I] Ticket statistics endpoint (the admin dashboard needs it)
- [ ] [I] Search (admin dashboard requires "search")
- [ ] [I] Sort (admin "browse" implies it; your brief makes it explicit)
- [ ] [I] Seed script with demo accounts so a reviewer can log in
- [ ] [I] Tests (auth, RBAC, IDOR, transitions, validation, uploads)
- [ ] [I] Docker-compose for MongoDB so "easy to run locally" is true
- [ ] [B] Full security list (section 6 below), each item visible in code and summarised in README
- [ ] [B] `docs/API.md` (contract), `docs/DECISIONS.md`, `docs/SECURITY.md`, `CLAUDE.md`

### 1.2 Admin — React web dashboard

- [ ] [E] Admin sign in
- [ ] [E] Ticket statistics view
- [ ] [E] Ticket list with pagination, filtering, search
- [ ] [E] Ticket detail
- [ ] [E] Change status and priority
- [ ] [E] Manage categories (create / edit / delete)
- [ ] [E] Add comments
- [ ] [E] View attachments
- [ ] [E] Inspect ticket history
- [ ] [E] Loading / empty / error states
- [ ] [E] Reusable components, production-oriented UI
- [ ] [E] README with run instructions
- [ ] [B] Sort on the list; assignee on detail; session-expiry handling; logout clears everything
- [ ] [B] Stack fixed: React + Vite + TypeScript; API contract copied verbatim from server

### 1.3 Mobile — Expo / React Native

- [ ] [E] User sign in
- [ ] [E] Create ticket: category, priority, description, attachment
- [ ] [E] View own tickets
- [ ] [E] Ticket detail
- [ ] [E] Add comments
- [ ] [E] Follow status changes Open → In Progress → Resolved → Closed
- [ ] [E] Sensible navigation
- [ ] [E] Loading / error / empty states
- [ ] [E] README with run instructions
- [ ] [B] Attachment from camera roll; pull-to-refresh; tokens in `expo-secure-store` only
- [ ] [B] Stack fixed: Expo + React Native + TypeScript; contract copied verbatim

### 1.4 Cross-cutting / submission

- [ ] [E] Three **separate** GitHub repositories, accessible to the reviewer
- [ ] [E] Git used throughout with meaningful commits (history is graded)
- [ ] [E] No passwords, API keys, tokens or secrets committed — ever, in any commit
- [ ] [E] `.env.example` in each repo (server explicitly; clients implied)
- [ ] [E] Every library choice explainable (→ `DECISIONS.md`)
- [ ] [E] Consistent data across all three apps (one contract, one status enum, one error shape)
- [ ] [E] Submit three links to the reviewer's email before the 48h deadline
- [ ] [I] `.gitignore` correct from the first commit (`node_modules`, `.env`, builds, uploads dir)
- [ ] [I] Runnable by a stranger from README in under 10 minutes
- [ ] [I] Screenshots in READMEs (reviewers may not run the mobile app)
- [ ] [I] Do **not** commit the brief PDF or the reviewer's email address into the repos

---

## 2. Skills in this install and how they are used

Inventory: `~/.claude/skills` (symlinks to the public set + a synced plugin set), `/mnt/skills/public`,
`/mnt/skills/examples`, `/mnt/skills/plugins`. Relevant ones:

| Skill | Present | Use in this project |
|---|---|---|
| `new-software-project` | yes (plugin) | **Read.** Governs this plan: scope → schema → contract → screens → repo layout → CLAUDE.md → build by dependency; "propose before building", backend + contract first, no gold-plating. |
| `frontend-design` | yes (public) | **Read.** Used in Phase 3 for the admin dashboard: a deliberate token system (palette, type, layout) reviewed against the "generic AI dashboard" tells before coding; copy rules (active voice, errors say what to do, empty states invite action). Applied lightly to mobile. |
| `ponytail` | yes (plugin) | Used as a counterweight during Phase 1–2 review: every abstraction must earn its place in 48h. Not loaded verbatim (it pushes toward "skip it", which conflicts with the explicit security list). |
| Security skill | **none** | No dedicated secure-coding skill exists here. `hexstrike-ai` is an offensive-tooling driver, not applicable. The security design in section 6 is derived from your brief + OWASP ASVS/Cheat-Sheet knowledge; the Phase 5 audit is a manual checklist pass. |
| React Native / Expo skill | **none** | Mobile guidance comes from the contract + Expo docs; the mobile sub-agent brief will carry the rules directly. |
| `skill-creator`, `docs`, `docx`, `pdf`, `xlsx`, `pptx`, browser/computer-use, Phyniqs/KAMAN skills | yes | Not used for this build. (The browser skills may be used in Phase 6 to click through the admin dashboard during the fresh-clone test.) |

---

## 3. Scope

### 3.1 In scope (must ship)

- Roles: **`user`** and **`admin`**. No `agent` role (see Decision D1).
- Admin can assign a ticket to any admin (`assignee`), so "assignment" exists without a third role.
- Tickets with category, priority, status machine, requester, optional assignee, bounded attachments,
  comments, full history.
- Categories: admin CRUD with soft delete; delete blocked while any non-closed ticket references it
  (see Decision D5 on the exact rule).
- Attachments: upload to an existing ticket, served only via an authenticated, ownership-checked
  download endpoint.
- Admin dashboard: stats, list (paginate / filter / search / sort), detail, categories.
- Mobile: sign in, create ticket (+ one or more images from camera roll), my tickets, detail,
  comments, status follow with pull-to-refresh.
- Seed script, docker-compose Mongo, tests, CI script, pre-commit secret scan, full docs set.

### 3.2 Explicitly out of scope (and why — one line each for the interview)

- Email notifications / push — no transport available in 48h; event log is the hook point.
- Real-time updates — pull-to-refresh and refetch-on-focus cover the demo; SSE would be the next step.
- Password reset / email verification — needs an email provider; documented as follow-up.
- Admin user management UI — not requested; admins come from the seed.
- Ticket deletion — helpdesk tickets are closed, never deleted (audit integrity).
- Attachments on comments — ticket-level only, keeps ownership checks to one path.
- i18n / RTL — English only. (Sanad is Arabic for "support"; the name is a nod, not a feature.)

---

## 4. Data model (MongoDB / Mongoose)

Modelling principle: **embed what is bounded and read with its parent; reference what is unbounded
or queried independently.** Every collection has `createdAt`/`updatedAt` (Mongoose timestamps).
No document ever has a password hash or refresh token in its `toJSON` output.

### 4.1 `users`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `email` | string | lowercase, trimmed, **unique index**, max 254 |
| `name` | string | 1–80 |
| `passwordHash` | string | argon2id; `select: false`, stripped in `toJSON` |
| `role` | `'user' \| 'admin'` | default `user`; index |
| `failedLoginAttempts` | number | default 0 |
| `lockedUntil` | Date \| null | temporary lockout |
| `lastLoginAt` | Date \| null | |
| `deletedAt` | Date \| null | soft delete (future admin UI); login rejects deleted |

### 4.2 `refresh_tokens`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `userId` | ObjectId → users | index |
| `tokenHash` | string | sha256 of the opaque token; **unique index**; raw token never stored |
| `familyId` | string (uuid) | one family per login session; rotation keeps the family |
| `client` | `'web' \| 'mobile'` | drives cookie vs body delivery |
| `expiresAt` | Date | **TTL index** → Mongo deletes expired docs |
| `usedAt` | Date \| null | set on rotation; presenting a used token = reuse → revoke family |
| `revokedAt` | Date \| null | logout / reuse detection |
| `userAgent`, `ip` | string | redacted in logs, kept for session listing (future) |

### 4.3 `categories`

| Field | Type | Notes |
|---|---|---|
| `name` | string | 1–60; unique **partial index** on `{ name: 1 }` where `deletedAt: null` |
| `description` | string | 0–300 |
| `deletedAt` | Date \| null | soft delete; list endpoints filter `deletedAt: null` |

### 4.4 `tickets`

| Field | Type | Notes |
|---|---|---|
| `title` | string | 3–120 |
| `description` | string | 1–5000 |
| `categoryId` | ObjectId → categories | index; must be non-deleted at create/update time |
| `priority` | `'low' \| 'medium' \| 'high' \| 'urgent'` | index; default `medium` |
| `status` | `'open' \| 'in_progress' \| 'resolved' \| 'closed'` | index; default `open` |
| `requesterId` | ObjectId → users | index (every "my tickets" query) |
| `assigneeId` | ObjectId → users \| null | must be an admin |
| `attachments` | **embedded** `[Attachment]` | max 5 — bounded, always read with the ticket → embed |
| `commentCount` | number | denormalised counter for list views (avoids N+1) |
| `resolvedAt`, `closedAt` | Date \| null | for stats and the user reopen window |
| `lastActivityAt` | Date | bumped on comment/status change; default list sort |

Embedded `Attachment` subdocument: `_id`, `originalName` (sanitised, ≤ 200), `storedKey` (random,
never derived from the original name), `mimeType` (from magic bytes), `size`, `uploadedBy`,
`scanStatus: 'pending' | 'clean' | 'skipped'`, `createdAt`.

Indexes: `{ requesterId: 1, lastActivityAt: -1 }`, `{ status: 1, priority: 1, createdAt: -1 }`,
`{ categoryId: 1 }`, `{ assigneeId: 1 }`, text index `{ title: 'text', description: 'text' }`.

### 4.5 `comments` (referenced — unbounded)

| Field | Type | Notes |
|---|---|---|
| `ticketId` | ObjectId → tickets | index `{ ticketId: 1, createdAt: 1 }` |
| `authorId` | ObjectId → users | |
| `body` | string | 1–2000 |
| `isInternal` | boolean | admin-only notes, never returned to users (nice-to-have; field exists from day one so the schema doesn't change) |

### 4.6 `ticket_events` (referenced — the audit log; append-only)

| Field | Type | Notes |
|---|---|---|
| `ticketId` | ObjectId → tickets | index `{ ticketId: 1, createdAt: 1 }` |
| `actorId` | ObjectId → users | who |
| `type` | enum | `created`, `status_changed`, `priority_changed`, `assigned`, `updated`, `comment_added`, `attachment_added` |
| `changes` | `{ [field]: { from, to } }` | before/after for every changed field |
| `createdAt` | Date | when |

No update or delete path exists for this collection in the codebase (the repository exposes only
`append` and `listByTicket`).

### 4.7 Status machine (server-side only, in `TicketStatusPolicy`)

| From | To | Admin | Requester (own ticket) | Meaning |
|---|---|---|---|---|
| open | in_progress | ✓ | ✗ | admin picks it up |
| open | closed | ✓ | ✓ | withdrawn |
| in_progress | open | ✓ | ✗ | admin parks it |
| in_progress | resolved | ✓ | ✗ | admin resolves |
| in_progress | closed | ✓ | ✓ | withdrawn mid-work |
| resolved | closed | ✓ | ✓ | user confirms fix (or admin after inactivity) |
| resolved | in_progress | ✓ | ✗ | admin reopens work |
| resolved | open | ✗ | ✓ | user says "not fixed" |
| closed | open | ✓ | ✓ **within `REOPEN_WINDOW_DAYS` (default 7)** | reopen |

Everything else → `409 TICKET_INVALID_TRANSITION`. A closed ticket rejects new comments and
attachments (`409 TICKET_CLOSED`) until reopened. Every transition writes a `status_changed` event.

---

## 5. API contract (v1) — summary

Full request/response shapes go in `sanad-server/docs/API.md` and are frozen at the end of Phase 1.
Base path `/api/v1`. All responses JSON.

### 5.1 Envelope

```json
// success
{ "data": <object | array>, "meta": { "page": 1, "limit": 20, "total": 143, "totalPages": 8 } }

// error — one shape, always
{ "error": { "code": "VALIDATION_FAILED", "message": "Request validation failed",
             "details": [{ "path": "body.priority", "message": "Invalid enum value" }],
             "requestId": "f1c2…" } }
```

### 5.2 Error codes → HTTP status

| Code | Status | When |
|---|---|---|
| `VALIDATION_FAILED` | 400 | zod rejects body/query/params (unknown keys included) |
| `AUTH_REQUIRED` | 401 | missing/invalid/expired access token |
| `AUTH_INVALID_CREDENTIALS` | 401 | login failed — same message for wrong password, unknown email, locked account, deleted account, non-admin on web client |
| `AUTH_REFRESH_INVALID` | 401 | refresh token unknown, expired, revoked, or reused |
| `FORBIDDEN` | 403 | role mismatch on an admin route |
| `NOT_FOUND` | 404 | resource missing **or not owned by caller** (no existence leak) |
| `CONFLICT` | 409 | duplicate category name, email already registered |
| `TICKET_INVALID_TRANSITION` | 409 | status machine refused |
| `TICKET_CLOSED` | 409 | mutation on a closed ticket |
| `CATEGORY_IN_USE` | 409 | delete blocked |
| `UPLOAD_REJECTED` | 400/413/415 | too large (413), type not allowed (415), too many (400) |
| `RATE_LIMITED` | 429 | with `Retry-After` |
| `INTERNAL` | 500 | generic; stack never serialised |

### 5.3 Endpoints

**Auth** (public unless noted; all rate-limited per IP)

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | `{ email, password, name }` → creates `user`. See Decision D2. |
| POST | `/auth/login` | public | `{ email, password, client: 'web' \| 'mobile' }`. `web` → access token in body, refresh in httpOnly cookie; `mobile` → both in body. `web` requires `role=admin`, otherwise generic 401. |
| POST | `/auth/refresh` | cookie or body | rotates; reuse of a used token revokes the whole family |
| POST | `/auth/logout` | authenticated | revokes presented refresh family, clears cookie |
| GET | `/auth/me` | authenticated | current user (safe fields) |

**Categories**

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/categories` | user, admin | active only; users need it to create tickets |
| POST | `/admin/categories` | admin | |
| PATCH | `/admin/categories/:id` | admin | |
| DELETE | `/admin/categories/:id` | admin | soft delete; 409 if in use |

**Tickets (user-facing; every read/write ownership-scoped to `requesterId = caller`)**

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/tickets` | user, admin | `{ title, description, categoryId, priority }` |
| GET | `/tickets` | user | **own** tickets; `?status&priority&page&limit&sort` |
| GET | `/tickets/:id` | owner | includes attachments metadata |
| PATCH | `/tickets/:id` | owner | title/description only while `open` |
| POST | `/tickets/:id/status` | owner | `{ status }` via requester rules |
| GET | `/tickets/:id/comments` | owner | paginated, excludes `isInternal` |
| POST | `/tickets/:id/comments` | owner | |
| GET | `/tickets/:id/history` | owner | |
| POST | `/tickets/:id/attachments` | owner | multipart `file`; ≤ 5 MB; jpeg/png/webp/pdf by magic bytes |
| GET | `/tickets/:id/attachments/:attachmentId/download` | owner | streams with `Content-Disposition: attachment`, `nosniff` |

**Admin** (separate router, `requireRole('admin')` mounted once at `/admin`)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/stats` | counts by status, by priority, open-age (avg/max/oldest), created last 7d |
| GET | `/admin/tickets` | all tickets; `?status&priority&categoryId&assigneeId&requesterId&q&sort&page&limit` |
| GET | `/admin/tickets/:id` | with requester + assignee + category populated (safe fields) |
| PATCH | `/admin/tickets/:id` | `{ priority?, assigneeId?, categoryId? }` |
| POST | `/admin/tickets/:id/status` | admin transition rules |
| GET/POST | `/admin/tickets/:id/comments` | includes `isInternal` |
| GET | `/admin/tickets/:id/history` | |
| GET | `/admin/tickets/:id/attachments/:attachmentId/download` | |
| GET | `/admin/users?role=admin` | for the assignee picker only (name + id) |

Shared query rules: `page ≥ 1`, `limit 1–100` (default 20), `sort` whitelist
(`createdAt`, `-createdAt`, `lastActivityAt`, `-lastActivityAt`, `priority`, `-priority`),
`q` 1–100 chars → `$text` search (never regex on user input), all ids validated as ObjectId
before touching Mongo.

---

## 6. Security design (each line → a file in Phase 1/2; audited in Phase 5)

| Area | Control | Where |
|---|---|---|
| Passwords | argon2id (`argon2` lib, memory 64 MB, time 3, parallelism 1); policy 10–128 chars, not equal to email, not in a bundled top-1k list | `services/PasswordService.ts` |
| Login | one generic 401; verify against a dummy hash when the email is unknown (constant-time-ish path); per-IP limit 10/15 min; per-account lockout after 5 failures for 15 min; `lockedUntil` never disclosed | `services/AuthService.ts`, `middleware/rateLimit.ts` |
| Access token | JWT HS256, 15 min, 256-bit secret from env, claims `sub`, `role`, `jti`; `Authorization: Bearer` only | `services/TokenService.ts` |
| Refresh token | 256-bit random opaque; sha256 hash stored; rotation on every use; `usedAt` marks consumption; reuse → revoke whole `familyId`; logout revokes family; TTL index purges | `models/RefreshToken.ts`, `AuthService.refresh()` |
| Admin session | refresh in `httpOnly; Secure (prod); SameSite=Strict; Path=/api/v1/auth/refresh` cookie; access token held in memory only (never localStorage); Vite dev proxy keeps same-origin | `AuthController`, `sanad-admin/src/lib/api.ts` |
| Mobile session | refresh in `expo-secure-store`; access in memory; no AsyncStorage anywhere; tokens never logged | `sanad-mobile/src/auth/tokenStore.ts` |
| RBAC | `requireAuth` → `requireRole('admin')` mounted at router level for `/admin/*`; user routes never branch on role for admin powers | `middleware/auth.ts`, `routes/admin/*` |
| Ownership | every user-facing ticket query includes `requesterId: caller.id`; misses return 404, not 403; comments/attachments reached only through their ticket | `repositories/TicketRepository.findOwned()` |
| Input | zod `.strict()` on body/query/params for every route; ObjectId schema; length caps; pagination caps; `express-mongo-sanitize` as defence in depth | `middleware/validate.ts`, `schemas/*.ts` |
| Output escaping | React/RN escape by default; `dangerouslySetInnerHTML` banned by ESLint rule; API returns plain text only | client ESLint configs |
| Uploads | multer memory storage, `limits.fileSize` 5 MB, max 5 per ticket; `file-type` magic-byte check against allowlist; stored key = uuid + detected extension; never served inline; `X-Content-Type-Options: nosniff`; `VirusScanner` interface with `NoopScanner` + documented ClamAV adapter stub | `services/AttachmentService.ts`, `storage/*`, `security/VirusScanner.ts` |
| Storage | `StorageAdapter { put, getStream, delete }`; `LocalDiskStorage` (dir outside web root, gitignored) in dev; `S3Storage` on `@aws-sdk/client-s3` selected by `STORAGE_DRIVER` env | `storage/` |
| Transport | `helmet`, `app.disable('x-powered-by')`, CORS allowlist from `CORS_ORIGINS` (exact match, credentials only for allowlisted), `compression` with `Cache-Control: no-store` on auth responses (BREACH note in SECURITY.md), request body limit 100 KB JSON | `app.ts` |
| Observability | `pino` + `pino-http`; `X-Request-Id` (generated or passed through); redaction paths for `authorization`, `cookie`, `password`, `token`, `email` | `logger.ts` |
| Errors | `AppError(code, status, details)`; global handler maps everything to the envelope; unknown errors → `INTERNAL` with `requestId`; stack only when `NODE_ENV !== 'production'` | `middleware/errorHandler.ts` |
| Rate limits | `express-rate-limit`: global per IP; stricter on `/auth/*`; per-user (keyed on `sub`) on all mutating routes | `middleware/rateLimit.ts` |
| Config | `zod`-validated `env.ts`; process exits with a readable list of missing vars; `.env.example` placeholders only; `JWT_SECRET` min 32 chars enforced | `config/env.ts` |
| Secrets in git | `.gitignore` in the first commit; `husky` pre-commit running `secretlint` (npm, no binary) ; CI runs `gitleaks` action + `npm audit --audit-level=high` | `.husky/pre-commit`, `.github/workflows/ci.yml` |
| Seed | admin email/password from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`; demo user likewise; prints "seeded N users" and nothing else | `scripts/seed.ts` |
| Data exposure | `toJSON` transforms strip `passwordHash`, `__v`, lockout fields; `tokenHash` never selectable; populated users project `{ _id, name, role }` only | models |
| Deep links | mobile deep links open screens by id only; the id is re-fetched through the authenticated API; no token or user data in links | `sanad-mobile/app/_layout.tsx` |
| Session expiry (admin) | 401 on any call → one silent refresh attempt → on failure clear memory + redirect to sign-in with "Session expired" | `sanad-admin/src/lib/api.ts` |
| Logout | server revokes family; admin clears in-memory token + cookie cleared by server; mobile wipes secure store + query cache | both clients |
| Tests | Vitest + Supertest against `mongodb-memory-server`: auth flows, lockout, refresh rotation + reuse detection, RBAC on every admin route, IDOR on tickets/comments/attachments/history, each transition row of the matrix, strict-schema rejects, upload rejects (size, type, extension spoof) | `sanad-server/tests/` |
| Threat model | `docs/SECURITY.md` table: threat → control → file:line | Phase 5 |

---

## 7. Screens

### 7.1 Admin dashboard (`sanad-admin`)

| Route | Screen | Contents / states |
|---|---|---|
| `/sign-in` | Sign in | email + password; generic error; disabled while pending |
| `/` | Dashboard | stat tiles (open, in progress, resolved, closed), priority breakdown, open-age summary, "oldest open" list; skeleton / error-with-retry |
| `/tickets` | Ticket list | table: title, requester, category, priority, status, assignee, last activity; filters (status, priority, category, assignee), search box, sort, pagination; empty ("No tickets match these filters — clear filters"); error with retry; URL-synced filters |
| `/tickets/:id` | Ticket detail | header with status/priority controls (only allowed transitions shown, server still decides), assignee picker, meta; tabs: Conversation (comments + internal notes), Attachments (list + download), History (timeline of events with before/after) |
| `/categories` | Categories | table + inline create/edit; delete with confirm; 409 "in use" rendered inline |
| (layout) | App shell | nav, current admin, sign out, session-expired toast |

Reusable components: `Button`, `Input`, `Select`, `Badge` (status/priority with one source of truth
for colour), `DataTable`, `Pagination`, `EmptyState`, `ErrorState`, `Skeleton`, `Dialog`, `Toast`,
`PageHeader`. Data layer: TanStack Query hooks per resource (`useTickets`, `useTicket`, …).

### 7.2 Mobile (`sanad-mobile`, expo-router)

| Route | Screen | Contents / states |
|---|---|---|
| `/(auth)/sign-in` | Sign in | email + password; generic error; register link (if D2 = yes) |
| `/(auth)/register` | Register | name, email, password with policy hint |
| `/(app)/tickets` | My tickets | list with status + priority badges, pull-to-refresh, infinite scroll; empty ("No tickets yet — create your first one"); error with retry |
| `/(app)/tickets/new` | Create ticket | title, category picker, priority picker, description, add images from camera roll (preview + remove); submit creates ticket then uploads attachments with progress; validation inline |
| `/(app)/tickets/[id]` | Ticket detail | status stepper Open → In Progress → Resolved → Closed (current highlighted), details, attachments (open in-app via authenticated fetch), comments thread + composer, actions: close / reopen when allowed |
| `/(app)/profile` | Profile | name, email, sign out |

---

## 8. Repo layout

### 8.1 `sanad-server`

```
sanad-server/
├── .github/workflows/ci.yml      # lint, typecheck, test, npm audit, gitleaks
├── .husky/pre-commit             # secretlint + lint-staged
├── docker-compose.yml            # mongo:7 (+ optional minio for S3 driver demo)
├── .env.example  .gitignore  CLAUDE.md  README.md
├── docs/ API.md  DECISIONS.md  SECURITY.md  PLAN.md
├── scripts/seed.ts
├── src/
│   ├── app.ts  server.ts
│   ├── config/env.ts
│   ├── lib/ logger.ts  errors.ts  response.ts  objectId.ts
│   ├── middleware/ auth.ts  validate.ts  rateLimit.ts  requestId.ts  errorHandler.ts  upload.ts
│   ├── modules/
│   │   ├── auth/      auth.routes.ts  auth.controller.ts  auth.service.ts  auth.schemas.ts  token.service.ts  password.service.ts
│   │   ├── users/     user.model.ts  user.repository.ts
│   │   ├── categories/ …routes/controller/service/repository/model/schemas
│   │   ├── tickets/   ticket.routes.ts  admin-ticket.routes.ts  …  ticket-status.policy.ts
│   │   ├── comments/  …
│   │   ├── attachments/ … storage/ (StorageAdapter, LocalDiskStorage, S3Storage)  virus-scanner.ts
│   │   ├── history/   ticket-event.model.ts  history.repository.ts
│   │   └── stats/     stats.routes.ts  stats.service.ts
│   └── routes/ index.ts (mounts /api/v1, /admin behind requireRole)
└── tests/ setup.ts  auth.test.ts  rbac.test.ts  idor.test.ts  transitions.test.ts  validation.test.ts  uploads.test.ts
```

Layering rule (in CLAUDE.md): routes → controllers → services → repositories → models.
Controllers only translate HTTP ↔ service calls; services hold rules; repositories hold queries.

### 8.2 `sanad-admin`

```
sanad-admin/
├── .env.example (VITE_API_URL)  .gitignore  CLAUDE.md  README.md  docs/API.md (copy)  docs/DECISIONS.md
├── src/
│   ├── app/ router.tsx  AppShell.tsx  guards.tsx
│   ├── lib/ api.ts (axios + refresh interceptor)  queryClient.ts  env.ts
│   ├── features/ auth/  dashboard/  tickets/  categories/   (api.ts, hooks.ts, components/, pages/)
│   ├── components/ui/  (Button, Input, Select, Badge, DataTable, …)
│   ├── components/states/ (EmptyState, ErrorState, Skeleton)
│   └── types/api.ts (hand-written from API.md; one source of truth for enums)
```

### 8.3 `sanad-mobile`

```
sanad-mobile/
├── .env.example (EXPO_PUBLIC_API_URL)  .gitignore  CLAUDE.md  README.md  docs/API.md (copy)  docs/DECISIONS.md
├── app/ _layout.tsx  (auth)/  (app)/tickets/  (app)/profile.tsx
├── src/
│   ├── api/ client.ts  tickets.ts  auth.ts  categories.ts
│   ├── auth/ tokenStore.ts (expo-secure-store)  AuthProvider.tsx
│   ├── components/ (Badge, StatusStepper, TicketCard, EmptyState, ErrorState, …)
│   └── types/api.ts
```

---

## 9. Library choices (to be justified in DECISIONS.md)

Server: `express` 4, `mongoose` 8, `zod`, `argon2`, `jsonwebtoken`, `helmet`, `cors`,
`express-rate-limit`, `express-mongo-sanitize`, `multer`, `file-type`, `pino` + `pino-http`,
`compression`, `dotenv`; tests `vitest`, `supertest`, `mongodb-memory-server`; tooling `tsx`,
`eslint`, `prettier`, `husky`, `lint-staged`, `secretlint`.

Admin: `react` 18, `vite`, `react-router`, `@tanstack/react-query`, `axios`, `react-hook-form`,
`zod`, `tailwindcss`, `@radix-ui/*` primitives only where a11y is hard (dialog, select).

Mobile: `expo` (current SDK), `expo-router`, `expo-secure-store`, `expo-image-picker`,
`@tanstack/react-query`, `axios`, `react-hook-form`, `zod`.

Rejected on purpose: Passport (adds abstraction over 60 lines of JWT code), NestJS (framework
cost vs. "explain your layering"), Redux (Query + context is enough), MUI (component organisation
is graded — own components show it better), bcrypt (argon2id is the current recommendation).

---

## 10. 48-hour build order

Clock starts at your approval. Three workers: **lead** (me — briefs, reviews, contract, docs),
**platform** sub-agent (server, then admin), **mobile** sub-agent (starts at H6). Each task is a
commit or a small series of commits. Sleep for you is assumed roughly H10–H16 and H34–H40;
agents keep working and you review on waking.

| Hour | Lead | Platform agent | Mobile agent |
|---|---|---|---|
| **H0–1** | Create 3 GitHub repos, first commit each: `.gitignore`, `README` stub, `CLAUDE.md`, `.env.example`, licence-free | — | — |
| **H1–3** | Review scaffold; write `API.md` draft | Server scaffold: TS, ESLint, Prettier, Vitest, husky+secretlint, docker-compose, `env.ts`, logger, request-id, error handler, health route | — |
| **H3–6** | Review auth PR; **freeze API.md v1**; copy into client repos | Users model, password service, auth service (register/login/refresh/logout/me), RBAC middleware, rate limits, lockout; tests for all of it | — |
| **H6–10** | Brief mobile agent (contract + security rules); review | Categories + tickets (CRUD, ownership, status policy, history events) + tests | Expo scaffold, token store, API client with refresh, sign-in, "my tickets" list against live server |
| **H10–14** | Review; write `DECISIONS.md` skeleton | Comments, attachments (storage adapter, magic bytes, download), stats; IDOR + upload tests; seed script; server README | Create ticket + image picker + upload; detail + status stepper |
| **H14–16** | ★ **Phase 1+2 report**: server done, contract final | Admin scaffold: Vite, Tailwind tokens (frontend-design pass), router, api client, auth guard, sign-in | Comments, pull-to-refresh, empty/error states |
| **H16–22** | Review admin design tokens before pages are built | Dashboard stats, ticket list (filters/search/sort/pagination), categories page | Polish, deep-link handling, logout, README, screenshots |
| **H22–26** | ★ **Phase 4 report (mobile)**; review | Ticket detail: status/priority/assignee controls, comments, attachments, history | Mobile hardening: no logs of tokens, secure store audit, error states |
| **H26–30** | ★ **Phase 3 report (admin)** | Admin states pass (loading/empty/error everywhere), session expiry, README, screenshots | buffer / fixes from review |
| **H30–34** | **Must-ship line** — everything above committed and running | — | — |
| **H34–38** | Phase 5 audit: run section 6 line by line against code; file gaps | Fix audit gaps; `SECURITY.md` threat table; finish `DECISIONS.md` ×3 | Same for mobile |
| **H38–42** | Phase 6: fresh clone of all three on a clean path, follow READMEs literally, record breaks | Fix what broke | Fix what broke |
| **H42–46** | Nice-to-haves only if everything above is green | S3 adapter demo via minio; internal notes UI; CI badge | Infinite scroll polish; image preview |
| **H46–48** | Final commits, tag `v1.0.0`, repo access check, 10-line summary email | — | — |

### Must ship (hard line at H30, verified at H42)

Server: auth with rotation + reuse detection, RBAC, ownership, categories, tickets, comments,
attachments (local disk), history, stats, seed, tests for the six security areas, README, API.md.
Admin: sign-in, dashboard, list with all controls, detail with status/priority/assignee/comments/
attachments/history, categories, states everywhere. Mobile: sign-in, my tickets, create with image,
detail with comments and status, pull-to-refresh, states. All three: CLAUDE.md, .env.example,
DECISIONS.md, SECURITY.md (server), clean history, CI script, pre-commit scan.

### Nice to have (only after H42 and only if green)

`isInternal` admin notes UI · S3 adapter demo with minio in compose · per-user rate-limit dashboard
header · infinite scroll on admin table · optimistic status updates · ticket export CSV · registration
on the admin (no) · dark mode.

---

## 11. Decisions I need from you before Phase 1

| # | Question | My recommendation |
|---|---|---|
| **D1** | Add an `agent` role? | **No.** Two roles + `assigneeId` (admin → admin) gives assignment without a third permission set. Adding `agent` costs ~3h across all repos and a permissions matrix the reviewers will probe. |
| **D2** | Self-registration on mobile? | **Yes**, `POST /auth/register`, rate-limited, with the honest note in SECURITY.md that without email verification a 409 reveals an existing email (standard trade-off; mitigation documented). Alternative: seed-only accounts, no register screen — safer, less realistic. |
| **D3** | MongoDB transactions for ticket update + history event? | **No.** Needs a replica-set in compose (fragile for "under 10 minutes"). Service writes the ticket, then appends the event; failure of the second write is logged with requestId. Documented in DECISIONS.md with the upgrade path. |
| **D4** | Admin UI: Tailwind + own components vs MUI? | **Tailwind + own components** (+ Radix for dialog/select). Reviewers grade component organisation; a `components/ui` folder we wrote shows it. MUI is the fallback if admin slips past H26. |
| **D5** | Category "in use" rule for delete: any ticket, or only non-closed tickets? | **Any ticket** (strictest, simplest to explain: history must keep resolving). Soft delete keeps the name visible on old tickets. |
| **D6** | GitHub: which account/org, and public repos or private + invite the reviewer? | Public is simplest for "must be accessible"; tell me the account so I can name the remotes. |
| **D7** | Node version to pin in `engines` / `.nvmrc`? | Node 22 LTS unless your machine differs. |

Reply with "approved" plus any overrides on D1–D7 and I start Phase 1.
