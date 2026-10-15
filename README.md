# sanad-server

API for **Sanad**, a support-ticket / helpdesk system. Node.js 22 · Express 5 · TypeScript · Mongoose · MongoDB.

This repository owns the API contract: see [`docs/API.md`](docs/API.md). The admin dashboard
(`sanad-admin`) and the mobile app (`sanad-mobile`) are built against it.

> Work in progress — full setup, security notes and demo accounts are added as each phase ships.

- [`docs/PLAN.md`](docs/PLAN.md) — scope, data model, security design, build order
- [`docs/API.md`](docs/API.md) — the contract
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — why each library and pattern
- [`docs/SECURITY.md`](docs/SECURITY.md) — threat model: threat → control → where in code
