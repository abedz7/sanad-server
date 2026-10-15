# Decisions — Phase 1

One paragraph per choice: what was picked, what it cost, and what would change the decision.
Companion to [`docs/PLAN.md`](PLAN.md) (design) and [`docs/API.md`](API.md) (contract).

## Express 5 over Express 4

Express 5 was chosen for two concrete behaviours, not novelty: rejected promises from async
handlers propagate to the error middleware automatically (no `express-async-errors` shim, no
wrapper — one fewer thing to forget on a new route), and `req.query` is a read-only getter, which
removes a whole class of query-pollution tricks. The costs are real: the middleware ecosystem has
mostly been tested against 4, some typings lag, and the read-only `req.query` forced our own
validation design (see the zod entry below) and ruled out `express-mongo-sanitize`. On a long-lived
production codebase with many legacy middlewares, 4 would still be the safer pick; for a new repo
the migration debt avoided later won.

## Custom operator guard instead of `express-mongo-sanitize`

`express-mongo-sanitize` mutates `req.query` in place, which throws on Express 5's read-only
getter — the library is effectively incompatible. Rather than pin an unmaintained fork, a ~40-line
middleware (`src/middleware/operatorGuard.ts`) walks body, query and params and rejects any key
starting with `$` or containing `.`. Rejecting is deliberately stricter than the library's default
of silently stripping: a request carrying `$gt` keys is hostile, and answering 400 is more honest
than quietly rewriting it. The guard is defence in depth — zod `.strict()` schemas already refuse
unknown keys — so the residual risk of hand-rolling (a missed traversal case) is bounded, and the
depth cap avoids a crafted deeply-nested body burning CPU.

## argon2id and its parameters

argon2id is the OWASP first-choice password hash; bcrypt was rejected because it is not
memory-hard and truncates at 72 bytes. Parameters are 64 MiB memory, 3 passes, 1 lane — OWASP's
stronger recommended profile rather than the 19 MiB minimum — because a helpdesk sees a handful of
logins per second, so we can spend ~200 ms and 64 MB per verify where a high-traffic consumer site
could not. That cost cuts both ways: it is exactly why login is rate-limited per IP and locked per
account, otherwise the hash itself becomes a CPU-exhaustion vector. Parameters live inside the hash
string, so they can be raised later and existing hashes still verify until next login.

## Opaque hashed refresh tokens vs JWT refresh tokens

Refresh tokens are 256-bit random strings stored only as sha256 hashes, not JWTs. A JWT refresh
token is stateless and saves a DB read, but it cannot be revoked individually without a denylist —
at which point the state you were avoiding is back, just uglier. Opaque tokens give exact
revocation (logout, reuse detection, soft-deleted user) and a DB dump yields nothing usable because
only hashes are stored; sha256 without salt is fine here since the input has 256 bits of entropy —
there is nothing to brute-force, unlike passwords. The price is one indexed lookup per refresh,
roughly once per 15 minutes per client, which is negligible.

## Cookie for web vs body for mobile, and one login endpoint with a `client` field

The browser gets the refresh token only in an `httpOnly; SameSite=Strict` cookie path-scoped to
`/api/v1/auth/refresh`, because any body-delivered token ends up in JS-readable storage and one XSS
exfiltrates it; the cookie is invisible to script and SameSite=Strict stops cross-site refresh
calls. Mobile has no cookie jar worth trusting and no XSS surface, so it gets the token in the body
and stores it in the OS keystore. One endpoint with an explicit `client` field was chosen over two
endpoints (`/login/web`, `/login/mobile`) because the branch is three lines in one controller and
the stored `client` on the token row guarantees delivery can never be switched after issuance —
the refresh response format follows what is in the database, not what the request claims. The
honest downside: a malicious "mobile" caller can ask for body delivery of its own token, which is
unavoidable — the protection is for the browser context, not against the token's legitimate owner.

## HS256 vs RS256

Access tokens are HS256 with one 256-bit secret. RS256 pays its complexity (key pairs, rotation,
JWKS) to let parties verify tokens without being able to mint them — valuable the moment a second
service verifies tokens. This system has exactly one issuer and one verifier, the same process, so
asymmetric keys would add operational surface (two keys to protect instead of one) for zero
benefit. The verifier pins `algorithms: ['HS256']`, so an attacker cannot downgrade or confuse the
scheme via the token header. If a second consumer service ever appears, this decision flips.

## Lockout counter on the user document vs a separate collection

`failedLoginAttempts` and `lockedUntil` live on the user document and are updated by one atomic
pipeline update: increment, and set the lock in the same write when the threshold is reached, so
concurrent wrong passwords cannot race past it. A separate attempts collection would record more
(per-IP history, forensics) at the cost of a second write and a TTL cleanup on the hottest path in
the API; that history is not a Phase 1 requirement. Locked accounts do **not** increment the
counter: if they did, an attacker could keep a victim locked out forever by hammering the account,
turning the lockout into a denial of service against the legitimate owner. The lock expires on its
own and only a successful login resets the counter.

## Dummy-hash verify for timing

When login hits an unknown, deleted or locked account, the service still runs a full argon2 verify
against a throwaway hash computed once at startup. Without it, "unknown email" answers in
microseconds while "wrong password" takes ~200 ms of argon2 work — a stopwatch distinguishes them
even though the response bodies are identical, and the generic error becomes theatre. This is
"constant-time-ish", not constant-time: the DB lookup itself still varies, but the dominant cost
(argon2) is now spent on every path. The dummy input is random per process so its hash can never
collide with a real credential.

## The one `exists` DB query in `requireAuth`

A pure JWT check would make `requireAuth` database-free, which is the usual argument for JWTs. The
trade-off: a soft-deleted user keeps a working session for up to 15 minutes. One indexed
`exists({ _id, deletedAt: null })` per request — a covered point read, microseconds on any sane
deployment — buys immediate cutoff on deletion. Role, however, still comes from the token: changing
roles is not a feature of this system, so its worst case (a demoted admin keeps admin for ≤15 min)
is accepted and documented rather than paid for with a second field fetch on every request.

## zod `.strict()` at the boundary, and where validated input lives

Every body, query and params schema is `.strict()`: unknown keys are rejected, not ignored, so a
typo'd field name fails loudly instead of silently doing nothing, and mass-assignment is impossible
by construction. Because Express 5 exposes `req.query` as a read-only getter, parsed output
(coerced numbers, defaults applied) cannot be written back where middleware found it; it is stored
on `req.validated` and controllers read it through a typed `validated(req, schemas)` helper, so
every controller sees the schema's inferred types without casting. The cost is a small non-standard
convention a new contributor must learn; the alternative — controllers re-parsing or trusting
`req.query` — re-introduces exactly the untyped access the middleware exists to prevent.

## pino redaction list

Logs are a secondary data store that nobody threat-models, so redaction is allowlist-of-paths at
the logger, not discipline at call sites: `authorization` and `cookie` request headers,
`set-cookie` response headers, and `password`, `token`, `refreshToken`, `accessToken`, `email` at
top level and one level deep. Emails are redacted because logs routinely flow to third-party
aggregators with weaker access control than the database — the username part is PII. The honest
limitation: pino redacts by path, not by value, so a secret logged under an unanticipated key still
leaks; the mitigation is that services log whole domain objects rarely and models strip secrets in
`toJSON` anyway (two layers have to fail together).

## TTL index on refresh tokens

`expiresAt` carries a Mongo TTL index, so expired refresh tokens are deleted by the server itself —
no cron job, no cleanup script to forget, and the collection cannot grow without bound under login
churn. Two caveats are accepted knowingly: the TTL monitor runs every ~60 s, so a token can linger
briefly past expiry — harmless, because the service checks `expiresAt` on every use anyway (the
index is hygiene, not enforcement); and TTL deletion also removes _revoked_ rows once they expire,
which trades a permanent audit trail for a self-cleaning table. Phase 1 keeps the trail only as
long as the tokens would have lived; an audit requirement would move revoked rows to an archive
collection instead.

## Vitest + mongodb-memory-server vs a Docker Mongo for tests

Tests run against `mongodb-memory-server`: `npm test` works with no daemon running, in CI with
zero services configured, and every file gets a pristine real `mongod` — real unique indexes, real
TTL semantics, real duplicate-key errors, which matter here because the duplicate-email 409 and
reuse detection are index-driven (this setup caught a genuine index-build bug in `connectDb`).
A shared Docker Mongo would start faster per run and match the production topology more closely
(replica sets, auth), but brings port collisions, state bleeding between runs, and "works on my
machine" setup drift. The cost accepted: first run downloads a ~80 MB binary, and we test against
a standalone instance, so transactions could not be tested this way — acceptable because the design
deliberately avoids them (PLAN D3).

## secretlint locally vs gitleaks in CI

Two scanners on purpose, because they fail differently. secretlint runs in the pre-commit hook via
lint-staged: it is npm-installable (no binary to provision on a contributor's machine) and blocks a
secret _before_ it enters history, which is the only cheap moment — after a push, a leaked secret
must be rotated, not just removed. gitleaks runs in CI over the _full_ history (`fetch-depth: 0`)
with a different ruleset, catching anything that slipped past a `--no-verify` commit or arrived via
a merge. Local hooks are advisory (trivially bypassed), CI is enforcing but late; each covers the
other's blind spot, and neither costs more than seconds.

## docker-compose without Mongo auth for local dev

The compose file runs `mongo:7` with no authentication, bound to `127.0.0.1` only. Enabling auth
in compose would mean shipping a default password in a committed file — pure security theatre that
trains people to ignore credentials in git — or a key-generation step that violates the
"running in under 10 minutes" requirement. Binding to loopback means the database is unreachable
from the network; the data is throwaway development data. The compose file itself carries the
warning that any shared or hosted environment must use an authenticated `MONGODB_URI`, and the URI
comes from env, so production auth is a connection-string change, not a code change.

---

# Decisions — Phase 2

## Embed attachments, reference comments and events

One modelling rule decided all three: embed what is bounded and read with its parent, reference
what is unbounded or queried on its own. Attachments are capped at 5 per ticket and only ever
rendered on the ticket detail, so they live as subdocuments — one read returns the whole ticket and
there is no orphaned-metadata cleanup problem. Comments and events are unbounded (a busy ticket can
collect hundreds) and are fetched with their own pagination and sort, so they are separate
collections keyed by `ticketId`. The cost of embedding is a 16 MB document ceiling and racier array
updates; both are neutralised by the hard cap of 5. The cost of referencing is a second query per
detail view; that is what the denormalised `commentCount` on the ticket exists to avoid on lists.

## Append-only history, and writing it without a transaction

The audit log is append-only _by construction_, not by policy: the history repository exposes
exactly `append` and `listByTicket`, nothing else, and a test pins that export surface. The event is
written **after** the primary write, with no multi-document transaction (PLAN D3) — transactions
require a replica set, which would break "a stranger runs this in under 10 minutes" for a feature
whose failure window is a single process crash between two awaited writes. The honest consequence:
a history event can be lost if the process dies at exactly that moment, and an append failure is
logged (with requestId and ticketId) rather than failing the user's already-committed request. The
upgrade path is documented: run Mongo as a single-node replica set and wrap each service mutation in
`withTransaction`.

## The status machine as a pure function

Every §5 rule lives in `ticket-status.policy.ts` as two data tables and a `canTransition()` that
takes everything it needs as arguments — the file imports no Mongoose and does no I/O. That buys
three things: the matrix is testable row by row without a database, the service cannot "forget" a
rule because it has no second source of truth, and a future client-facing `allowedTransitions` comes
for free. The trade-off is one extra hop when reading the code (service → policy), which is cheap
next to scattering transition `if`s across handlers.

## Ownership enforced in the repository, and 404 instead of 403

User-facing finders take `requesterId` as a parameter and put it in the Mongo filter itself
(`{ _id, requesterId }`), so "someone else's ticket" and "no such ticket" are the same query miss —
there is no code path that loads a foreign document and then decides. A controller-level check could
be forgotten on one route; a filter baked into the only finder cannot. Misses surface as
`404 NOT_FOUND`, never 403, because a 403 confirms the id exists and turns ticket ids into an
oracle. The cost: a genuine "exists but forbidden" is indistinguishable from a typo'd id in support
conversations — accepted, that ambiguity is the point.

## `$text` search instead of regex

Admin search uses a text index on title + description and a `$text` filter. A regex built from user
input was rejected outright: unanchored regexes scan the whole collection, and crafted patterns are
a ReDoS vector; `$text` is index-backed with no user-controlled execution semantics. The accepted
limitations: `$text` does word-stemming rather than substring match ("invoi" finds nothing,
"invoice" does), one text index per collection, and no fuzzy matching. For a helpdesk search box
that is the right trade; substring search at scale would be Atlas Search or n-gram indexing, noted
as the upgrade path.

## Priority sorting via a maintained `priorityRank`

"Sort by priority" must order urgent > high > medium > low, which a lexicographic sort on the enum
string cannot do. Options were an aggregation `$switch` computed per query, or a numeric
`priorityRank` written alongside the priority. The rank field won: it keeps list queries as plain
indexable `find().sort()` and pays one integer per document instead of a per-row computation on
every list request. It is derived data, so the risk is drift; that is contained by maintaining it in
a single `pre('validate')` hook and by the fact that every priority write in the codebase goes
through `document.save()` (the one `updateOne` in the repository touches only `commentCount` and
`lastActivityAt`). A test sorts both directions to pin the behaviour.

## Storage behind an adapter: local disk and S3

`StorageAdapter` is a three-method seam (`put`, `getStream`, `delete`). `LocalDiskStorage` keeps dev
setup at zero extra services and treats the key as the only path component — separators, leading
dots and `..` are rejected even though keys are server-generated uuids, and writes use `wx` so a
collision cannot overwrite. `S3Storage` satisfies the "S3-compatible interface" requirement against
any endpoint (MinIO included via `forcePathStyle`). The driver is chosen from env at runtime and the
S3 adapter is loaded with a dynamic import, so the AWS SDK never initialises in local mode. The
deliberate limitation: no streaming multipart upload — files are capped at 5 MB and already buffered
for magic-byte checks, so buffer-based `put` is simpler and loses nothing.

## `@aws-sdk/client-s3` as the one cloud dependency

The modular v3 SDK was chosen over the monolithic v2 (`aws-sdk`) because it ships per-service
packages (only the S3 client lands in `node_modules`), is the only line AWS still maintains, and
its command objects are trivially mockable. It is a heavyweight dependency for a feature the
reviewer may never switch on — which is exactly why it is imported dynamically behind
`STORAGE_DRIVER=s3` instead of at module top level.

## Magic-byte verification of uploads

The uploaded buffer's real type is detected with `file-type` and checked against a four-entry
allowlist (jpeg/png/webp/pdf); the client's filename extension and declared Content-Type are never
consulted for the decision. A renamed `.exe` is rejected with 415 regardless of its name; a PDF
uploaded as `photo.jpg` is stored and later served as `application/pdf`, because serving bytes under
a type they are not is exactly how content-sniffing attacks start. Limitation stated plainly:
magic bytes authenticate the container format, not safety — a valid PDF can still carry an exploit,
which is why the scanner seam and the download-only serving headers exist as further layers.

## Download headers

Attachment bytes leave the server only through the authenticated, ownership-checked download route —
there is no static mount of the storage directory, so nothing can be fetched by guessing a path.
Every download is sent with `Content-Disposition: attachment` (ASCII fallback plus RFC 5987
`filename*`, with quotes and control characters stripped so a hostile filename cannot break out of
the header), `X-Content-Type-Options: nosniff` so the stored MIME type is final,
`Content-Type`/`Content-Length` from stored metadata rather than anything client-supplied, and
`Cache-Control: private, no-store` so a shared cache or browser disk never retains ticket evidence.
"Attachment, never inline" costs image previews in the clients; they can render previews from the
authenticated fetch themselves.

## NoopScanner instead of a pretend antivirus

Uploads pass through a `VirusScanner` interface. The shipped implementation is a no-op that records
`scanStatus: "skipped"` — deliberately _not_ `"clean"`, because claiming a scan happened when it did
not is worse than no scanner at all. A `ClamAvScanner` stub documents the real integration (clamd
over INSTREAM) and throws "not configured" from its constructor, so nobody can wire it up by
accident and believe they are protected. Running a real clamd in docker-compose was rejected for
the same reason as transactions: it would tax every reviewer's first run for a control that the
assessment only needs to see designed, not operated.

## Stats as one `$facet` aggregation

`/admin/stats` is a single aggregation whose `$facet` computes the status and priority breakdowns,
the open-age figures (count, average, max, oldest id), the 7-day creation count and the total in one
collection pass, instead of six separate queries racing each other on a moving dataset. Each facet
`$match`es as its first stage. Honest caveat: after the initial cursor, `$facet` sub-pipelines
cannot use indexes, so this is effectively one scan — fine at helpdesk scale and still cheaper than
six scans; at serious scale the answer is incremental counters, not a cleverer pipeline. All
reshaping (zero-filling enums, ms → hours at one decimal) happens in the service, keeping the
pipeline minimal.

## The seed writes through the services

`npm run seed` creates its 25 tickets by calling the same service methods the API uses — tickets are
created, assigned, commented and walked through the real status machine, so every seeded ticket has
a correct, ordered event trail and every invariant (category must be active, closed tickets reject
comments, transitions obey the matrix) held during seeding. Raw inserts would be faster to write and
run, but they can silently produce states the API could never create, and the demo data is exactly
what reviewers inspect first. Idempotency is by natural keys (users by email, categories by name)
plus the rule that ticket fixtures are only created into an empty tickets collection; passwords come
from `SEED_*` env and the script prints counts only.
