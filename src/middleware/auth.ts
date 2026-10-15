import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { tokenService } from '../modules/auth/token.service.js';
import { userRepository } from '../modules/users/user.repository.js';
import type { Role } from '../modules/users/user.model.js';

// What a controller needs to hand to a service: who is acting, and the request id so a service can
// log failures (e.g. a history append) with correlation. requireAuth guarantees req.user; the throw
// is a fail-closed guard against a route wired without it.
export interface Caller {
  id: string;
  role: Role;
  requestId: string;
}

export function callerOf(req: Request): Caller {
  if (!req.user) throw new AppError('AUTH_REQUIRED');
  return { id: req.user.id, role: req.user.role, requestId: req.requestId };
}

const BEARER = /^Bearer\s+(\S+)$/i;

// Trade-off: a pure JWT check would need no database on the hot path, but then a deleted account
// could keep calling the API for up to 15 minutes. One indexed `exists` query per request buys
// immediate revocation on soft-delete; role still comes from the token (changing roles is not a
// feature, so the 15-minute staleness is acceptable and documented in DECISIONS.md).
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const match = BEARER.exec(req.get('authorization') ?? '');
  const claims = match?.[1] !== undefined ? tokenService.verifyAccess(match[1]) : null;
  if (!claims) {
    next(new AppError('AUTH_REQUIRED'));
    return;
  }
  try {
    if (!(await userRepository.existsActive(claims.sub))) {
      next(new AppError('AUTH_REQUIRED'));
      return;
    }
  } catch (err) {
    next(err);
    return;
  }
  req.user = { id: claims.sub, role: claims.role };
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      // Programming error (requireRole mounted without requireAuth) — fail closed as 401.
      next(new AppError('AUTH_REQUIRED'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError('FORBIDDEN'));
      return;
    }
    next();
  };
}
