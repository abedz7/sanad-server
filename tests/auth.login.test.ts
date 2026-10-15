import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { UserModel } from '../src/modules/users/user.model.js';
import {
  app,
  body,
  createUser,
  REFRESH_COOKIE_NAME,
  type AuthData,
  type Envelope,
  type ErrorEnvelope,
} from './setup.js';

const LOGIN = '/api/v1/auth/login';

function login(email: string, password: string, client: 'web' | 'mobile') {
  return request(app).post(LOGIN).send({ email, password, client });
}

describe('POST /api/v1/auth/login', () => {
  it('mobile: returns the refresh token in the body and sets no cookie', async () => {
    const user = await createUser();
    const res = await login(user.email, user.password, 'mobile');

    expect(res.status).toBe(200);
    const { data } = body<Envelope<AuthData>>(res);
    expect(typeof data.accessToken).toBe('string');
    expect(data.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.get('Set-Cookie')).toBeUndefined();
  });

  it('web admin: sets the sanad_rt cookie and keeps the refresh token out of the body', async () => {
    const admin = await createUser({ role: 'admin' });
    const res = await login(admin.email, admin.password, 'web');

    expect(res.status).toBe(200);
    const { data } = body<Envelope<AuthData>>(res);
    expect(typeof data.accessToken).toBe('string');
    expect(data.refreshToken).toBeUndefined();
    expect('refreshToken' in data).toBe(false);

    const cookie = (res.get('Set-Cookie') ?? []).find((line) =>
      line.startsWith(`${REFRESH_COOKIE_NAME}=`),
    );
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth\/refresh/i);
  });

  it('web: a non-admin account gets the generic 401, even with correct credentials', async () => {
    const user = await createUser();
    const res = await login(user.email, user.password, 'web');

    expect(res.status).toBe(401);
    expect(body<ErrorEnvelope>(res).error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('wrong password, unknown email and locked account are indistinguishable', async () => {
    const user = await createUser();
    const locked = await createUser();
    // Lock the second account: five wrong passwords trip the lockout.
    for (let i = 0; i < 5; i += 1) {
      await login(locked.email, 'definitely-wrong-pass', 'mobile');
    }

    const wrongPassword = await login(user.email, 'definitely-wrong-pass', 'mobile');
    const unknownEmail = await login('ghost@test.example', user.password, 'mobile');
    const lockedAccount = await login(locked.email, locked.password, 'mobile');

    const bodies = [wrongPassword, unknownEmail, lockedAccount].map((res) => {
      expect(res.status).toBe(401);
      const envelope = body<ErrorEnvelope>(res);
      expect(envelope.error.requestId).toBeTruthy();
      const { requestId: _requestId, ...rest } = envelope.error;
      return rest;
    });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });

  it('locks after 5 failed attempts and rejects even the correct password', async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i += 1) {
      const res = await login(user.email, 'definitely-wrong-pass', 'mobile');
      expect(res.status).toBe(401);
    }

    const res = await login(user.email, user.password, 'mobile');
    expect(res.status).toBe(401);
    expect(body<ErrorEnvelope>(res).error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('accepts the correct password again once the lock has expired', async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i += 1) {
      await login(user.email, 'definitely-wrong-pass', 'mobile');
    }
    // Move the lock into the past instead of waiting 15 minutes.
    await UserModel.updateOne(
      { email: user.email },
      { $set: { lockedUntil: new Date(Date.now() - 1_000) } },
    ).exec();

    const res = await login(user.email, user.password, 'mobile');
    expect(res.status).toBe(200);
  });

  it('marks every auth response Cache-Control: no-store, including failures', async () => {
    const user = await createUser();
    const admin = await createUser({ role: 'admin' });

    const mobile = await login(user.email, user.password, 'mobile');
    expect(mobile.get('Cache-Control')).toBe('no-store');

    const web = await login(admin.email, admin.password, 'web');
    expect(web.get('Cache-Control')).toBe('no-store');

    // Contract 1.1.0 §8: every /auth/* response, success or error.
    const failed = await login(user.email, 'definitely-wrong-pass', 'mobile');
    expect(failed.status).toBe(401);
    expect(failed.get('Cache-Control')).toBe('no-store');
  });
});
