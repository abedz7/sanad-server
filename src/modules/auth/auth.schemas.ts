import { z } from 'zod';
import { PASSWORD_MAX } from './password.service.js';
import { CLIENTS } from './refresh-token.model.js';

// Lengths are capped here so a hostile body is rejected before argon2 ever runs on it. The
// policy itself (min length, not equal to email, denylist) lives in passwordService.
const email = z.email().trim().toLowerCase().max(254);
const password = z.string().max(PASSWORD_MAX);
const refreshToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'malformed refresh token');

export const registerSchema = {
  body: z.object({ email, password, name: z.string().trim().min(1).max(80) }).strict(),
};

export const loginSchema = {
  body: z.object({ email, password, client: z.enum(CLIENTS) }).strict(),
};

// Web sends no body (cookie); mobile sends the token. Both are optional at the schema level and the
// controller decides which source applies.
export const refreshSchema = {
  body: z.object({ refreshToken: refreshToken.optional() }).strict(),
};

export const logoutSchema = refreshSchema;
