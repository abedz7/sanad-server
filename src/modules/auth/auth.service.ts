import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import type { UserDocument } from '../users/user.model.js';
import { userRepository } from '../users/user.repository.js';
import { dummyHashPromise, passwordService } from './password.service.js';
import type { Client } from './refresh-token.model.js';
import { refreshTokenRepository } from './refresh-token.repository.js';
import { tokenService } from './token.service.js';

export interface RequestContext {
  userAgent: string;
  ip: string;
}

export interface AuthResult {
  user: UserDocument;
  accessToken: string;
  refreshToken: string;
  client: Client;
}

const MONGO_DUPLICATE_KEY = 11000;

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'code' in err && err.code === MONGO_DUPLICATE_KEY
  );
}

async function issueSession(
  user: UserDocument,
  client: Client,
  familyId: string,
  ctx: RequestContext,
): Promise<AuthResult> {
  const { token, tokenHash } = tokenService.generateRefreshToken();
  await refreshTokenRepository.create({
    userId: user._id.toString(),
    tokenHash,
    familyId,
    client,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    userAgent: ctx.userAgent.slice(0, 512),
    ip: ctx.ip.slice(0, 64),
  });
  const accessToken = tokenService.signAccess({ sub: user._id.toString(), role: user.role });
  return { user, accessToken, refreshToken: token, client };
}

export const authService = {
  async register(
    input: { email: string; password: string; name: string },
    ctx: RequestContext,
  ): Promise<AuthResult> {
    passwordService.assertPolicy(input.password, input.email);
    const passwordHash = await passwordService.hash(input.password);
    let user: UserDocument;
    try {
      // The unique index is the only duplicate check: a find-then-insert would race between two
      // concurrent registrations and still hit the index, so we rely on the index alone.
      user = await userRepository.create({
        email: input.email,
        name: input.name,
        passwordHash,
        role: 'user',
      });
    } catch (err) {
      if (isDuplicateKeyError(err))
        throw new AppError('CONFLICT', { message: 'Email is already registered' });
      throw err;
    }
    // Registration implies the mobile client (docs/API.md §7.1); admins are never created here.
    return issueSession(user, 'mobile', randomUUID(), ctx);
  },

  // Every failure exits through `invalid` with the same error and — thanks to the dummy verify — a
  // similar amount of work, so neither the response nor its timing reveals which check failed.
  async login(
    input: { email: string; password: string; client: Client },
    ctx: RequestContext,
  ): Promise<AuthResult> {
    const invalid = (): never => {
      throw new AppError('AUTH_INVALID_CREDENTIALS');
    };

    const user = await userRepository.findByEmailWithHash(input.email);
    const locked = user?.lockedUntil instanceof Date && user.lockedUntil.getTime() > Date.now();
    if (!user || user.deletedAt || locked) {
      await passwordService.verify(await dummyHashPromise, input.password);
      // A locked account does not count further attempts: that would let an attacker extend the
      // lock forever and turn the lockout into a denial of service against the real owner.
      return invalid();
    }

    const valid = await passwordService.verify(user.passwordHash, input.password);
    if (!valid) {
      await userRepository.recordFailedLogin(user.email);
      return invalid();
    }

    // Only admins may hold a browser session (docs/API.md §7.1). Checked after the password so the
    // failure costs the same as a wrong password and reveals nothing about the account's role.
    if (input.client === 'web' && user.role !== 'admin') return invalid();

    await userRepository.resetLoginState(user._id.toString());
    return issueSession(user, input.client, randomUUID(), ctx);
  },

  async refresh(presented: string, ctx: RequestContext): Promise<AuthResult> {
    const invalid = (): never => {
      throw new AppError('AUTH_REFRESH_INVALID');
    };

    const stored = await refreshTokenRepository.findByHash(
      tokenService.hashRefreshToken(presented),
    );
    if (!stored) return invalid();
    if (stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) return invalid();

    // A token that was already rotated is being replayed: either the client lost a race with itself
    // or a stolen copy is in use. Both are handled the same way — kill the whole family.
    if (stored.usedAt || !(await refreshTokenRepository.markUsed(stored._id.toString()))) {
      await refreshTokenRepository.revokeFamily(stored.familyId);
      return invalid();
    }

    const user = await userRepository.findById(stored.userId.toString());
    if (!user || user.deletedAt) {
      await refreshTokenRepository.revokeFamily(stored.familyId);
      return invalid();
    }

    // Client comes from the stored token, never from the request, so a mobile token can never be
    // exchanged for a browser cookie or vice versa.
    return issueSession(user, stored.client, stored.familyId, ctx);
  },

  // Possession of the refresh token is the credential (docs/API.md 1.1.0 §7.1): the presented
  // token's whole family is revoked without requiring a live access token. Idempotent: a missing,
  // unknown, expired or already-revoked token is not an error, so the response never confirms
  // whether a guessed token existed.
  async logout(presented: string | undefined): Promise<void> {
    if (!presented) return;
    const stored = await refreshTokenRepository.findByHash(
      tokenService.hashRefreshToken(presented),
    );
    if (!stored) return;
    await refreshTokenRepository.revokeFamily(stored.familyId);
  },

  async me(userId: string): Promise<UserDocument> {
    const user = await userRepository.findById(userId);
    if (!user || user.deletedAt) throw new AppError('AUTH_REQUIRED');
    return user;
  },
};
