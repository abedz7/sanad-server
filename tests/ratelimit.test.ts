import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, body, type ErrorEnvelope } from './setup.js';

const LOGIN = '/api/v1/auth/login';

// Production limits stay as configured (10 per 15 min per IP on auth routes); tests/setup.ts only
// resets the counter buckets between tests so each test starts a fresh window.
describe('auth rate limiting', () => {
  it('answers the 11th login attempt in a window with 429, Retry-After and the envelope', async () => {
    const attempt = {
      email: 'ghost@test.example',
      password: 'whatever-password',
      client: 'mobile',
    };

    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).post(LOGIN).send(attempt);
      expect(res.status).toBe(401); // under the limit: normal (generic) auth failure
    }

    const limited = await request(app).post(LOGIN).send(attempt);
    expect(limited.status).toBe(429);

    const retryAfter = limited.get('Retry-After');
    expect(retryAfter).toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const { error } = body<ErrorEnvelope>(limited);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toBeTruthy();
    expect(error.requestId).toBeTruthy();
  });
});
