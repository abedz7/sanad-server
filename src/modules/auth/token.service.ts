import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ROLES, type Role } from '../users/user.model.js';

export interface AccessClaims {
  sub: string;
  role: Role;
  jti: string;
}

// Derived rather than imported from `ms` so we do not depend on a transitive @types package.
type ExpiresIn = NonNullable<jwt.SignOptions['expiresIn']>;

const ALGORITHM = 'HS256';
const ISSUER = 'sanad';

export const tokenService = {
  signAccess(claims: { sub: string; role: Role }): string {
    return jwt.sign({ role: claims.role }, env.JWT_ACCESS_SECRET, {
      algorithm: ALGORITHM,
      subject: claims.sub,
      jwtid: randomUUID(),
      issuer: ISSUER,
      // Validated at boot to be a jsonwebtoken duration string ("15m").
      expiresIn: env.ACCESS_TOKEN_TTL as ExpiresIn,
    });
  },

  // Pins the algorithm so a token signed with "none" or a different scheme is rejected regardless
  // of what its header claims. Returns null for every failure; the caller maps that to 401.
  verifyAccess(token: string): AccessClaims | null {
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
      });
      if (typeof payload === 'string') return null;
      const { sub, role, jti } = payload as JwtPayload & { role?: unknown };
      if (typeof sub !== 'string' || typeof jti !== 'string') return null;
      if (!isRole(role)) return null;
      return { sub, role, jti };
    } catch {
      return null;
    }
  },

  // 256 bits of entropy, base64url → 43 chars (docs/API.md §3.1). Only the sha256 of it is stored,
  // so a database read never yields a usable token.
  generateRefreshToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: tokenService.hashRefreshToken(token) };
  },

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  },
};

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
