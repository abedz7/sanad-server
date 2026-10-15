import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import { AppError } from '../lib/errors.js';

const WINDOW_MS = 15 * 60 * 1000;

// All three limiters reject through the normal error pipeline so the 429 carries the standard
// envelope and requestId. express-rate-limit sets Retry-After itself (seconds).
const common: Partial<Options> = {
  windowMs: WINDOW_MS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('RATE_LIMITED'));
  },
};

// docs/API.md §3.2
export const globalLimiter = rateLimit({ ...common, limit: 300 });

export const authLimiter = rateLimit({ ...common, limit: 10 });

// Keyed on the authenticated user so one abusive account cannot hide behind a shared NAT, and so a
// NAT full of honest users is not punished for one of them. Falls back to IP before auth resolves.
export const mutatingLimiter = rateLimit({
  ...common,
  limit: 60,
  skip: (req) => !['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method),
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`),
});
