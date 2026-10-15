# Sanad API — contract v1

Owner: `sanad-server`. Copies in `sanad-admin/docs/API.md` and `sanad-mobile/docs/API.md` must be
byte-identical to this file; the server's copy wins on any difference.

Contract version: **1.0.0** (frozen at end of Phase 1; later changes are additive and bump the minor).

- Base URL: `http://localhost:4000` (dev) · prefix `/api/v1`
- Content type: `application/json; charset=utf-8` for all bodies except uploads (`multipart/form-data`)
- All timestamps are ISO-8601 UTC strings. All ids are 24-char hex Mongo ObjectIds as strings.
- Every response carries `X-Request-Id`. Send one yourself and it is echoed; otherwise one is generated.

---

## 1. Envelope

Success:

```json
{ "data": <object | array> }
{ "data": [ ... ], "meta": { "page": 2, "limit": 20, "total": 143, "totalPages": 8 } }
```

Error (always this shape, every status ≥ 400):

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": [ { "path": "body.priority", "message": "Invalid enum value. Expected 'low' | 'medium' | 'high' | 'urgent'" } ],
    "requestId": "a1b2c3d4-..."
  }
}
```

`details` is present only for `VALIDATION_FAILED` and `UPLOAD_REJECTED`. No stack traces, ever.

## 2. Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Body/query/params rejected (type, length, enum, unknown key, bad ObjectId, `$`/`.` keys) |
| `AUTH_REQUIRED` | 401 | Missing, malformed or expired access token |
| `AUTH_INVALID_CREDENTIALS` | 401 | Login failed. One message for every cause (wrong password, unknown email, locked, deleted, non-admin on `web`) |
| `AUTH_REFRESH_INVALID` | 401 | Refresh token missing, unknown, expired, revoked or reused |
| `FORBIDDEN` | 403 | Authenticated but wrong role for this route |
| `NOT_FOUND` | 404 | Resource does not exist **or** is not visible to the caller. Never distinguishes the two |
| `CONFLICT` | 409 | Duplicate (category name, email on register) |
| `TICKET_INVALID_TRANSITION` | 409 | Status change not allowed for this role from the current status |
| `TICKET_CLOSED` | 409 | Comment/attachment/admin edit on a closed ticket |
| `TICKET_NOT_EDITABLE` | 409 | Requester edit of title/description when status is not `open` |
| `CATEGORY_IN_USE` | 409 | Category referenced by at least one ticket; cannot be deleted |
| `CATEGORY_UNAVAILABLE` | 409 | Ticket create/update references a deleted category |
| `UPLOAD_REJECTED` | 400 / 413 / 415 | 413 too large, 415 type not allowed (by magic bytes), 400 missing file or too many attachments |
| `RATE_LIMITED` | 429 | Too many requests; `Retry-After` header set (seconds) |
| `INTERNAL` | 500 | Unexpected error; report `requestId` |

Clients may rely on `code`; `message` is for humans and may change.

## 3. Authentication

### 3.1 Tokens

| Token | Format | Lifetime | Web (admin) | Mobile |
|---|---|---|---|---|
| Access | JWT (HS256), claims `sub`, `role`, `jti`, `iat`, `exp` | 15 min | response body → kept in memory | response body → kept in memory |
| Refresh | opaque 43-char base64url string | 30 days, rotated on every use | `httpOnly; SameSite=Strict; Path=/api/v1/auth/refresh` cookie `sanad_rt` — never in body | response body → `expo-secure-store` |

Send the access token as `Authorization: Bearer <token>` on every protected route.
Rotation: each `/auth/refresh` call invalidates the presented refresh token and returns a new one.
Presenting an already-used token revokes the whole session family → `AUTH_REFRESH_INVALID`; the
client must sign in again.

### 3.2 Rate limits

| Scope | Limit |
|---|---|
| `/auth/login`, `/auth/register`, `/auth/refresh` per IP | 10 requests / 15 min |
| Account lockout | 5 failed logins → locked 15 min (response is still `AUTH_INVALID_CREDENTIALS`) |
| All routes per IP | 300 / 15 min |
| Mutating routes (`POST`/`PATCH`/`DELETE`) per authenticated user | 60 / 15 min |

### 3.3 Password policy

10–128 characters. Must not equal the email. Must not be on the server's common-password list.
Violations are `VALIDATION_FAILED` with `path: "body.password"`.

## 4. Resources

### 4.1 User

```json
{ "id": "…", "email": "user@example.com", "name": "Dana Levi", "role": "user", "createdAt": "…", "updatedAt": "…" }
```
`role`: `"user" | "admin"`. Never contains password hashes, tokens or lockout data.
`UserRef` (embedded in other resources): `{ "id", "name", "role" }`.

### 4.2 Category

```json
{ "id": "…", "name": "Billing", "description": "Invoices and payments", "createdAt": "…", "updatedAt": "…" }
```
Deleted categories are not listed but may still appear as `category` on old tickets.

### 4.3 Ticket

```json
{
  "id": "…",
  "title": "Cannot export invoice",
  "description": "…",
  "category": { "id": "…", "name": "Billing" },
  "priority": "high",
  "status": "in_progress",
  "requester": { "id": "…", "name": "Dana Levi", "role": "user" },
  "assignee": { "id": "…", "name": "Omar Admin", "role": "admin" } | null,
  "attachments": [ Attachment ],
  "commentCount": 3,
  "lastActivityAt": "…",
  "resolvedAt": "…" | null,
  "closedAt": "…" | null,
  "createdAt": "…",
  "updatedAt": "…"
}
```
`priority`: `"low" | "medium" | "high" | "urgent"` · `status`: `"open" | "in_progress" | "resolved" | "closed"`.
List endpoints return the same shape minus `description` and `attachments` (use `attachmentCount`).

### 4.4 Attachment (metadata only)

```json
{ "id": "…", "originalName": "receipt.pdf", "mimeType": "application/pdf", "size": 48213,
  "uploadedBy": UserRef, "scanStatus": "skipped", "createdAt": "…" }
```
`scanStatus`: `"pending" | "clean" | "skipped"`. Bytes are only available via the download route.

### 4.5 Comment

```json
{ "id": "…", "ticketId": "…", "author": UserRef, "body": "…", "isInternal": false, "createdAt": "…" }
```
Users never receive comments with `isInternal: true`.

### 4.6 TicketEvent (history)

```json
{ "id": "…", "ticketId": "…", "actor": UserRef, "type": "status_changed",
  "changes": { "status": { "from": "open", "to": "in_progress" } }, "createdAt": "…" }
```
`type`: `"created" | "status_changed" | "priority_changed" | "assigned" | "updated" | "comment_added" | "attachment_added"`.
`changes` is an object keyed by field; `assigned` uses `{ "assigneeId": { "from": null, "to": "…" } }`;
`comment_added` / `attachment_added` carry `{ "commentId" | "attachmentId": { "from": null, "to": "…" } }`.

## 5. Status machine

| From | To | Admin | Requester (own ticket) |
|---|---|---|---|
| open | in_progress | ✓ | ✗ |
| open | closed | ✓ | ✓ |
| in_progress | open | ✓ | ✗ |
| in_progress | resolved | ✓ | ✗ |
| in_progress | closed | ✓ | ✓ |
| resolved | closed | ✓ | ✓ |
| resolved | in_progress | ✓ | ✗ |
| resolved | open | ✗ | ✓ |
| closed | open | ✓ | ✓ only within 7 days of `closedAt` |

Anything else → `409 TICKET_INVALID_TRANSITION`. While `closed`: comments, attachments and edits →
`409 TICKET_CLOSED`. `resolvedAt` is set when entering `resolved`, `closedAt` when entering `closed`;
both reset to `null` on reopen.

## 6. Pagination, filtering, sorting

Query params for list endpoints: `page` (int ≥ 1, default 1), `limit` (int 1–100, default 20),
`sort` one of `createdAt`, `-createdAt`, `lastActivityAt`, `-lastActivityAt`, `priority`, `-priority`
(default `-lastActivityAt`). Priority sorts by rank `urgent > high > medium > low`.
Unknown query keys → `VALIDATION_FAILED`. `meta` is present on every list response.

## 7. Endpoints

Auth column: `public` · `user` (any signed-in account) · `owner` (signed-in **and** `requester` of the
ticket; admins are not owners on these routes) · `admin`.

### 7.1 Auth

#### `POST /auth/register` — public
Request: `{ "email": string(≤254), "password": string, "name": string(1–80) }`
Response `201`: `{ "data": { "user": User, "accessToken": string, "refreshToken": string } }`
(registration implies `client: "mobile"`; admins are never created here)
Errors: `VALIDATION_FAILED`, `CONFLICT` (email in use), `RATE_LIMITED`

#### `POST /auth/login` — public
Request: `{ "email": string, "password": string, "client": "web" | "mobile" }`
Response `200`, `client: "mobile"`: `{ "data": { "user": User, "accessToken": string, "refreshToken": string } }`
Response `200`, `client: "web"`: `{ "data": { "user": User, "accessToken": string } }` + `Set-Cookie: sanad_rt=…`
`client: "web"` succeeds only for `role: "admin"`; any other account gets the generic 401.
Errors: `VALIDATION_FAILED`, `AUTH_INVALID_CREDENTIALS`, `RATE_LIMITED`

#### `POST /auth/refresh` — public (needs a refresh token)
Request: web → no body, cookie `sanad_rt`; mobile → `{ "refreshToken": string }`
Response `200`: same shape as login for that client (new access token; new refresh token in cookie or body)
Errors: `AUTH_REFRESH_INVALID`, `RATE_LIMITED`

#### `POST /auth/logout` — user
Request: web → cookie `sanad_rt`; mobile → `{ "refreshToken": string }`. Revokes that token's whole family.
Response `204`. Cookie cleared on web. Idempotent: an unknown or already-revoked token still returns `204`.

#### `GET /auth/me` — user
Response `200`: `{ "data": User }`

### 7.2 Categories

#### `GET /categories` — user
Active categories, sorted by name, no pagination (small list).
Response `200`: `{ "data": [ Category ] }`

#### `POST /admin/categories` — admin
Request: `{ "name": string(1–60), "description"?: string(≤300) }`
Response `201`: `{ "data": Category }` · Errors: `VALIDATION_FAILED`, `CONFLICT`

#### `PATCH /admin/categories/:id` — admin
Request: `{ "name"?: string(1–60), "description"?: string(≤300) }` (at least one key)
Response `200`: `{ "data": Category }` · Errors: `VALIDATION_FAILED`, `NOT_FOUND`, `CONFLICT`

#### `DELETE /admin/categories/:id` — admin
Soft delete. Response `204` · Errors: `NOT_FOUND`, `CATEGORY_IN_USE` (any ticket, any status, references it)

#### `GET /admin/categories` — admin
Same as `GET /categories` plus `ticketCount` per category and `?includeDeleted=true` to list deleted ones (`deletedAt` set).
Response `200`: `{ "data": [ Category & { "ticketCount": number, "deletedAt": string | null } ] }`

### 7.3 Tickets — user-facing (ownership-scoped)

#### `POST /tickets` — user
Request: `{ "title": string(3–120), "description": string(1–5000), "categoryId": ObjectId, "priority"?: Priority (default "medium") }`
Response `201`: `{ "data": Ticket }` · Errors: `VALIDATION_FAILED`, `CATEGORY_UNAVAILABLE`

#### `GET /tickets` — user
Own tickets. Query: pagination/sort (§6) + `status?`, `priority?`.
Response `200`: `{ "data": [ TicketListItem ], "meta": … }`

#### `GET /tickets/:id` — owner
Response `200`: `{ "data": Ticket }` · Errors: `NOT_FOUND`

#### `PATCH /tickets/:id` — owner
Only while `status: "open"`. Request: `{ "title"?: string, "description"?: string }` (at least one key)
Response `200`: `{ "data": Ticket }` · Errors: `VALIDATION_FAILED`, `NOT_FOUND`, `TICKET_NOT_EDITABLE` (status is not `open`)

#### `POST /tickets/:id/status` — owner
Request: `{ "status": Status }` — requester column of §5.
Response `200`: `{ "data": Ticket }` · Errors: `VALIDATION_FAILED`, `NOT_FOUND`, `TICKET_INVALID_TRANSITION`

#### `GET /tickets/:id/comments` — owner
Query: `page`, `limit` (sort fixed: oldest first). Excludes `isInternal` comments.
Response `200`: `{ "data": [ Comment ], "meta": … }` · Errors: `NOT_FOUND`

#### `POST /tickets/:id/comments` — owner
Request: `{ "body": string(1–2000) }`
Response `201`: `{ "data": Comment }` · Errors: `VALIDATION_FAILED`, `NOT_FOUND`, `TICKET_CLOSED`

#### `GET /tickets/:id/history` — owner
All events, oldest first, no pagination (bounded in practice; cap 500).
Response `200`: `{ "data": [ TicketEvent ] }` · Errors: `NOT_FOUND`

#### `POST /tickets/:id/attachments` — owner
`multipart/form-data` with exactly one field `file`. Max 5 MB. Allowed (verified by content, not
extension or declared type): `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
Max 5 attachments per ticket.
Response `201`: `{ "data": Attachment }`
Errors: `UPLOAD_REJECTED` (413 size / 415 type / 400 missing or limit), `NOT_FOUND`, `TICKET_CLOSED`

#### `GET /tickets/:id/attachments/:attachmentId/download` — owner
Streams the file. Headers: `Content-Type: <stored mimeType>`, `Content-Length`,
`Content-Disposition: attachment; filename="<sanitised originalName>"`, `X-Content-Type-Options: nosniff`,
`Cache-Control: private, no-store`. Errors: `NOT_FOUND`

### 7.4 Admin

All routes below require `role: "admin"`; a `user` gets `403 FORBIDDEN`.

#### `GET /admin/stats`
Response `200`:
```json
{ "data": {
  "byStatus":   { "open": 12, "in_progress": 5, "resolved": 3, "closed": 40 },
  "byPriority": { "low": 10, "medium": 30, "high": 15, "urgent": 5 },
  "openAge":    { "count": 17, "averageHours": 31.4, "maxHours": 190.2, "oldestTicketId": "…" | null },
  "createdLast7Days": 9,
  "total": 60
} }
```
`openAge` covers `open` + `in_progress`, measured from `createdAt`.

#### `GET /admin/tickets`
Query: §6 + `status?`, `priority?`, `categoryId?`, `assigneeId?`, `requesterId?`, `q?` (1–100 chars,
full-text on title + description), `unassigned?=true`.
Response `200`: `{ "data": [ TicketListItem ], "meta": … }`

#### `GET /admin/tickets/:id`
Response `200`: `{ "data": Ticket }` · Errors: `NOT_FOUND`

#### `PATCH /admin/tickets/:id`
Request: `{ "priority"?: Priority, "assigneeId"?: ObjectId | null, "categoryId"?: ObjectId }` (at least one key). `assigneeId` must be an admin.
Response `200`: `{ "data": Ticket }` · Errors: `VALIDATION_FAILED`, `NOT_FOUND`, `CATEGORY_UNAVAILABLE`, `TICKET_CLOSED`

#### `POST /admin/tickets/:id/status`
Request: `{ "status": Status }` — admin column of §5.
Response `200`: `{ "data": Ticket }` · Errors: `VALIDATION_FAILED`, `NOT_FOUND`, `TICKET_INVALID_TRANSITION`

#### `GET /admin/tickets/:id/comments`
Includes internal comments. Query: `page`, `limit`.
Response `200`: `{ "data": [ Comment ], "meta": … }` · Errors: `NOT_FOUND`

#### `POST /admin/tickets/:id/comments`
Request: `{ "body": string(1–2000), "isInternal"?: boolean (default false) }`
Response `201`: `{ "data": Comment }` · Errors: `VALIDATION_FAILED`, `NOT_FOUND`, `TICKET_CLOSED`

#### `GET /admin/tickets/:id/history`
Response `200`: `{ "data": [ TicketEvent ] }` · Errors: `NOT_FOUND`

#### `GET /admin/tickets/:id/attachments/:attachmentId/download`
Same behaviour and headers as the owner route. Errors: `NOT_FOUND`

#### `GET /admin/users`
Query: `role?` (`user` | `admin`), `page`, `limit`. For the assignee picker and requester filter.
Response `200`: `{ "data": [ User ], "meta": … }`

### 7.5 Health

#### `GET /health` — public (outside `/api/v1`)
Response `200`: `{ "data": { "status": "ok", "uptime": 123.4, "db": "connected" } }`
`503` with `db: "disconnected"` when Mongo is unreachable.

## 8. Headers

| Header | Direction | Notes |
|---|---|---|
| `Authorization: Bearer <jwt>` | request | all protected routes |
| `X-Request-Id` | both | echoed or generated |
| `Retry-After` | response | on 429, seconds |
| `Set-Cookie: sanad_rt` | response | web login/refresh only |

## 9. Changelog

- 1.0.0 — initial contract.
