import type { Role } from '../modules/users/user.model.js';

// Kept as a .ts module (not .d.ts) so `skipLibCheck` cannot hide a broken import here.
// Module augmentation keeps request-scoped data typed without casting through `any` and without
// mutating `req.query` (read-only in Express 5).
declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    user?: { id: string; role: Role };
    validated: { body: unknown; query: unknown; params: unknown };
  }
}
