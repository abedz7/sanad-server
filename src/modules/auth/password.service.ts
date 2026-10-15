import argon2 from 'argon2';
import { AppError } from '../../lib/errors.js';
import { commonPasswords } from './common-passwords.js';

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

// argon2id with the OWASP "second recommended" profile: 64 MiB memory, 3 passes, 1 lane. Chosen over
// the 19 MiB / 2 pass minimum because a helpdesk sees few logins per second, so we can afford the
// slower, memory-harder setting. Parameters live in the hash string, so they can be raised later
// and old hashes still verify.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

export const passwordService = {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  },

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain).catch(() => false);
  },

  // docs/API.md §3.3. Throws VALIDATION_FAILED at `body.password` so the client can attach the
  // message to the field. Called from the service (not the zod schema) because the email is needed.
  assertPolicy(password: string, email: string): void {
    const fail = (message: string): never => {
      throw new AppError('VALIDATION_FAILED', { details: [{ path: 'body.password', message }] });
    };
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      fail(`Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`);
    }
    if (password.toLowerCase() === email.toLowerCase().trim()) {
      fail('Password must not equal the email address');
    }
    if (commonPasswords.has(password.toLowerCase())) {
      fail('Password is too common');
    }
  },
};

// A real argon2id hash of a random string, computed once at startup. Login verifies against it when
// the account is unknown, deleted or locked so every failure path spends the same CPU time and a
// caller cannot tell "no such email" from "wrong password" by the response time.
export const dummyHashPromise: Promise<string> = passwordService.hash(
  `dummy-${Math.random().toString(36)}-${Date.now()}`,
);
