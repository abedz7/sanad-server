// Env first: this import must stay above every src/ import so src/config/env.ts sees test values.
import './env.js';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db.js';
import {
  globalLimiter,
  loginRegisterLimiter,
  refreshLogoutLimiter,
} from '../src/middleware/rateLimit.js';
import { passwordService } from '../src/modules/auth/password.service.js';
import type { Client } from '../src/modules/auth/refresh-token.model.js';
import type { Role } from '../src/modules/users/user.model.js';
import { userRepository } from '../src/modules/users/user.repository.js';

export const app: Express = createApp();

// ---- lifecycle ---------------------------------------------------------------------------------

let mongod: MongoMemoryServer;
let uri = '';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  uri = mongod.getUri('sanad-test');
  // connectDb also builds all model indexes, so tests exercising the unique email index cannot race it.
  await connectDb(uri);
});

// For tests that disconnect and must reconnect (e.g. health 503).
export function mongoUri(): string {
  return uri;
}

afterAll(async () => {
  await disconnectDb();
  await mongod.stop();
});

// Supertest always connects from loopback; reset the per-IP limiter buckets between tests so each
// test starts with a fresh window. Production limits stay untouched — only the counters reset.
const LOOPBACK_IPS = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const RATE_LIMIT_KEYS = [
  ...new Set([...LOOPBACK_IPS, ...LOOPBACK_IPS.map((ip) => ipKeyGenerator(ip))]),
];

beforeEach(async () => {
  // deleteMany instead of drop so indexes built in beforeAll survive.
  await Promise.all(Object.values(mongoose.connection.models).map((model) => model.deleteMany({})));
  for (const key of RATE_LIMIT_KEYS) {
    globalLimiter.resetKey(key);
    loginRegisterLimiter.resetKey(key);
    refreshLogoutLimiter.resetKey(key);
  }
});

// ---- response typing ---------------------------------------------------------------------------

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Envelope<T> {
  data: T;
  meta?: PageMeta;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: { path: string; message: string }[];
  };
}

// Public User shape from docs/API.md §4.1. Extra keys indexable so tests can assert their absence.
export type ApiUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
} & Record<string, unknown>;

export interface AuthData {
  user: ApiUser;
  accessToken: string;
  refreshToken?: string;
}

// supertest types `res.body` as any; this is the single place that assigns it a shape.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T exists so callers name the expected shape at the call site instead of casting.
export function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

// ---- helpers -----------------------------------------------------------------------------------

export interface TestUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: Role;
}

export const DEFAULT_PASSWORD = 'correct-horse-battery-staple';

// argon2id at production cost is ~0.2 s per hash; memoise so each distinct password hashes once per file.
const hashCache = new Map<string, Promise<string>>();
function hashOnce(password: string): Promise<string> {
  let cached = hashCache.get(password);
  if (!cached) {
    cached = passwordService.hash(password);
    hashCache.set(password, cached);
  }
  return cached;
}

let userCounter = 0;

// Through the real repository + password service (not raw inserts) so documents look exactly like
// production ones. Register is not used because it can only create role "user".
export async function createUser(
  options: { role?: Role; email?: string; password?: string } = {},
): Promise<TestUser> {
  userCounter += 1;
  const role = options.role ?? 'user';
  const email = options.email ?? `${role}-${userCounter}@test.example`;
  const password = options.password ?? DEFAULT_PASSWORD;
  const doc = await userRepository.create({
    email,
    name: `Test ${role} ${userCounter}`,
    passwordHash: await hashOnce(password),
    role,
  });
  return { id: doc._id.toString(), email, password, name: doc.name, role };
}

export const REFRESH_COOKIE_NAME = 'sanad_rt';

export interface LoginResult {
  accessToken: string;
  /** Mobile only: refresh token from the body. */
  refreshToken: string | undefined;
  /** Web only: the full Set-Cookie line for sanad_rt. */
  setCookie: string | undefined;
  /** Web only: the raw refresh token value carried by the cookie. */
  cookieToken: string | undefined;
  response: request.Response;
}

export async function loginAs(user: TestUser, client: Client): Promise<LoginResult> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: user.password, client });
  if (response.status !== 200) {
    throw new Error(`loginAs(${user.email}, ${client}) failed: ${response.status}`);
  }
  const data = body<Envelope<AuthData>>(response).data;
  const setCookie = (response.get('Set-Cookie') ?? []).find((line) =>
    line.startsWith(`${REFRESH_COOKIE_NAME}=`),
  );
  const cookieToken = setCookie
    ? decodeURIComponent(setCookie.split(';')[0]?.split('=')[1] ?? '')
    : undefined;
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    setCookie,
    cookieToken,
    response,
  };
}

const JWT_ISSUER = 'sanad';

// An access token that is valid in every way except already expired.
export function signExpiredToken(userId: string, role: Role = 'user'): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return jwt.sign({ role, iat: nowSeconds - 3600, exp: nowSeconds - 60 }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: JWT_ISSUER,
    jwtid: randomUUID(),
  });
}

// Well-formed claims, wrong key — must be rejected by signature verification alone.
export function signWithWrongSecret(userId: string, role: Role = 'user'): string {
  return jwt.sign({ role }, 'wrong-secret-that-is-also-at-least-32-characters', {
    algorithm: 'HS256',
    subject: userId,
    issuer: JWT_ISSUER,
    jwtid: randomUUID(),
    expiresIn: '15m',
  });
}
