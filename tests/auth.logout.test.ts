import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, body, createUser, loginAs, type ErrorEnvelope } from './setup.js';

const LOGOUT = '/api/v1/auth/logout';
const REFRESH = '/api/v1/auth/refresh';

describe('POST /api/v1/auth/logout', () => {
  it('returns 204 and the refresh token stops working', async () => {
    const user = await createUser();
    const { accessToken, refreshToken } = await loginAs(user, 'mobile');

    const res = await request(app)
      .post(LOGOUT)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(res.status).toBe(204);
    expect(res.text).toBeFalsy();

    const refresh = await request(app).post(REFRESH).send({ refreshToken });
    expect(refresh.status).toBe(401);
    expect(body<ErrorEnvelope>(refresh).error.code).toBe('AUTH_REFRESH_INVALID');
  });

  it('is idempotent: a second logout with the same token is still 204', async () => {
    const user = await createUser();
    const { accessToken, refreshToken } = await loginAs(user, 'mobile');

    await request(app)
      .post(LOGOUT)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(204);
    await request(app)
      .post(LOGOUT)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(204);
  });

  it("logout with another user's refresh token is 204 but does not revoke it", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const aliceSession = await loginAs(alice, 'mobile');
    const bobSession = await loginAs(bob, 'mobile');

    // Alice presents Bob's token: quietly ignored — she cannot sign Bob out.
    const res = await request(app)
      .post(LOGOUT)
      .set('Authorization', `Bearer ${aliceSession.accessToken}`)
      .send({ refreshToken: bobSession.refreshToken });
    expect(res.status).toBe(204);

    const bobRefresh = await request(app)
      .post(REFRESH)
      .send({ refreshToken: bobSession.refreshToken });
    expect(bobRefresh.status).toBe(200);
  });

  it('requires authentication', async () => {
    const res = await request(app).post(LOGOUT).send({});
    expect(res.status).toBe(401);
    expect(body<ErrorEnvelope>(res).error.code).toBe('AUTH_REQUIRED');
  });
});
