import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  app,
  body,
  createUser,
  loginAs,
  REFRESH_COOKIE_NAME,
  type ErrorEnvelope,
} from './setup.js';

const LOGOUT = '/api/v1/auth/logout';
const REFRESH = '/api/v1/auth/refresh';

// Contract 1.1.0 §7.1: logout is public — possession of the refresh token is the credential,
// no access token required.
describe('POST /api/v1/auth/logout', () => {
  it('returns 204 without an access token and the refresh token stops working', async () => {
    const user = await createUser();
    const { refreshToken } = await loginAs(user, 'mobile');

    const res = await request(app).post(LOGOUT).send({ refreshToken });
    expect(res.status).toBe(204);
    expect(res.text).toBeFalsy();

    const refresh = await request(app).post(REFRESH).send({ refreshToken });
    expect(refresh.status).toBe(401);
    expect(body<ErrorEnvelope>(refresh).error.code).toBe('AUTH_REFRESH_INVALID');
  });

  it('revokes the whole family, not just the presented token', async () => {
    const user = await createUser();
    const { refreshToken: t1 } = await loginAs(user, 'mobile');
    const rotated = await request(app).post(REFRESH).send({ refreshToken: t1 });
    expect(rotated.status).toBe(200);
    const t2 = (rotated.body as { data: { refreshToken: string } }).data.refreshToken;

    // Logging out with the latest token must kill every sibling in the family.
    await request(app).post(LOGOUT).send({ refreshToken: t2 }).expect(204);
    const replay = await request(app).post(REFRESH).send({ refreshToken: t2 });
    expect(replay.status).toBe(401);
  });

  it('is idempotent: a second logout with the same token is still 204', async () => {
    const user = await createUser();
    const { refreshToken } = await loginAs(user, 'mobile');

    await request(app).post(LOGOUT).send({ refreshToken }).expect(204);
    await request(app).post(LOGOUT).send({ refreshToken }).expect(204);
  });

  it('returns 204 for a missing or unknown token (no enumeration)', async () => {
    await request(app).post(LOGOUT).send({}).expect(204);
    await request(app)
      .post(LOGOUT)
      .send({ refreshToken: 'A'.repeat(43) })
      .expect(204);
  });

  it('web: logs out from the cookie and clears it', async () => {
    const admin = await createUser({ role: 'admin' });
    const { cookieToken } = await loginAs(admin, 'web');

    const res = await request(app)
      .post(LOGOUT)
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookieToken ?? ''}`)
      .send({});
    expect(res.status).toBe(204);

    const cleared = (res.get('Set-Cookie') ?? []).find((line) =>
      line.startsWith(`${REFRESH_COOKIE_NAME}=`),
    );
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i);

    const refresh = await request(app)
      .post(REFRESH)
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookieToken ?? ''}`)
      .send({});
    expect(refresh.status).toBe(401);
  });
});
