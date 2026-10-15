import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, body, type ErrorEnvelope } from './setup.js';

const LOGIN = '/api/v1/auth/login';
const REGISTER = '/api/v1/auth/register';
const LOGOUT = '/api/v1/auth/logout';

// Production limits stay as configured (docs/API.md §3.2); tests/setup.ts only resets the counter
// buckets between tests so each test starts a fresh window.
describe('auth rate limiting', () => {
  it('login + register share one 10/window counter: the 11th mixed attempt is 429', async () => {
    const login = { email: 'ghost@test.example', password: 'whatever-password', client: 'mobile' };
    const register = { email: 'ghost@test.example', password: 'short', name: 'Ghost' };

    // 5 login attempts + 5 register attempts drain the shared budget.
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post(LOGIN).send(login);
      expect(res.status).toBe(401);
    }
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post(REGISTER).send(register);
      expect(res.status).toBe(400); // password policy — but it still counts
    }

    const limited = await request(app).post(LOGIN).send(login);
    expect(limited.status).toBe(429);

    const retryAfter = limited.get('Retry-After');
    expect(retryAfter).toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const { error } = body<ErrorEnvelope>(limited);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toBeTruthy();
    expect(error.requestId).toBeTruthy();
  });

  it('refresh + logout share a separate 60/window counter', async () => {
    for (let i = 0; i < 60; i += 1) {
      const res = await request(app).post(LOGOUT).send({});
      expect(res.status).toBe(204);
    }

    const limited = await request(app).post(LOGOUT).send({});
    expect(limited.status).toBe(429);
    expect(body<ErrorEnvelope>(limited).error.code).toBe('RATE_LIMITED');
    expect(limited.get('Retry-After')).toBeDefined();

    // The login/register budget is untouched by those 61 requests.
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@test.example', password: 'whatever-password', client: 'mobile' });
    expect(login.status).toBe(401);
  });
});
