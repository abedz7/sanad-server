import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, body, type AuthData, type Envelope, type ErrorEnvelope } from './setup.js';

const REGISTER = '/api/v1/auth/register';

const validBody = {
  email: 'dana@test.example',
  password: 'a-long-enough-password',
  name: 'Dana Levi',
};

describe('POST /api/v1/auth/register', () => {
  it('returns 201 with a safe user and both tokens in the body', async () => {
    const res = await request(app).post(REGISTER).send(validBody);

    expect(res.status).toBe(201);
    const { data } = body<Envelope<AuthData>>(res);

    // Exactly the public User shape from docs/API.md §4.1 — nothing else.
    expect(Object.keys(data.user).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'role',
      'updatedAt',
    ]);
    expect(data.user['passwordHash']).toBeUndefined();
    expect(data.user['__v']).toBeUndefined();
    expect(data.user['failedLoginAttempts']).toBeUndefined();
    expect(data.user['lockedUntil']).toBeUndefined();
    expect(data.user.email).toBe(validBody.email);
    expect(data.user.role).toBe('user');

    expect(typeof data.accessToken).toBe('string');
    // Registration implies client "mobile" (docs/API.md §7.1): opaque 43-char refresh token in the
    // body, and no cookie.
    expect(data.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.get('Set-Cookie')).toBeUndefined();
  });

  it('rejects a duplicate email with 409 CONFLICT', async () => {
    await request(app).post(REGISTER).send(validBody).expect(201);

    const res = await request(app)
      .post(REGISTER)
      .send({ ...validBody, name: 'Someone Else' });

    expect(res.status).toBe(409);
    const { error } = body<ErrorEnvelope>(res);
    expect(error.code).toBe('CONFLICT');
    expect(error.requestId).toBeTruthy();
  });

  // docs/API.md §3.3: every policy violation is VALIDATION_FAILED at body.password.
  it.each([
    ['too short', 'short1!'],
    ['equal to the email', validBody.email],
    ['on the common-password list', 'qwertyuiop'],
  ])('rejects a password that is %s with 400 at body.password', async (_label, password) => {
    const res = await request(app)
      .post(REGISTER)
      .send({ ...validBody, password });

    expect(res.status).toBe(400);
    const { error } = body<ErrorEnvelope>(res);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.[0]?.path).toBe('body.password');
  });

  it('rejects an unknown body key with 400 and a details path', async () => {
    const res = await request(app)
      .post(REGISTER)
      .send({ ...validBody, admin: true });

    expect(res.status).toBe(400);
    const { error } = body<ErrorEnvelope>(res);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.length).toBeGreaterThan(0);
    expect(error.details?.[0]?.path).toMatch(/^body/);
  });
});
