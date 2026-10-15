import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { RefreshTokenModel } from '../src/modules/auth/refresh-token.model.js';
import { tokenService } from '../src/modules/auth/token.service.js';
import { UserModel } from '../src/modules/users/user.model.js';
import {
  app,
  body,
  createUser,
  loginAs,
  REFRESH_COOKIE_NAME,
  type AuthData,
  type Envelope,
  type ErrorEnvelope,
} from './setup.js';

const REFRESH = '/api/v1/auth/refresh';

function refreshWithBody(token: string) {
  return request(app).post(REFRESH).send({ refreshToken: token });
}

describe('POST /api/v1/auth/refresh', () => {
  it('rotates: returns a different token, after which the old one is rejected', async () => {
    const user = await createUser();
    const first = await loginAs(user, 'mobile');
    const t1 = first.refreshToken;
    expect(t1).toBeDefined();

    const rotated = await refreshWithBody(t1 ?? '');
    expect(rotated.status).toBe(200);
    const { data } = body<Envelope<AuthData>>(rotated);
    expect(data.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(data.refreshToken).not.toBe(t1);
    expect(typeof data.accessToken).toBe('string');

    const replay = await refreshWithBody(t1 ?? '');
    expect(replay.status).toBe(401);
    expect(body<ErrorEnvelope>(replay).error.code).toBe('AUTH_REFRESH_INVALID');
  });

  it('reuse detection: replaying a rotated token revokes the whole family', async () => {
    const user = await createUser();
    const { refreshToken: t1 } = await loginAs(user, 'mobile');

    const rotated = await refreshWithBody(t1 ?? '');
    expect(rotated.status).toBe(200);
    const t2 = body<Envelope<AuthData>>(rotated).data.refreshToken;

    // Replay the consumed token: rejected, and the family dies with it.
    const replay = await refreshWithBody(t1 ?? '');
    expect(replay.status).toBe(401);
    expect(body<ErrorEnvelope>(replay).error.code).toBe('AUTH_REFRESH_INVALID');

    const successor = await refreshWithBody(t2 ?? '');
    expect(successor.status).toBe(401);
    expect(body<ErrorEnvelope>(successor).error.code).toBe('AUTH_REFRESH_INVALID');
  });

  it('web: refreshes from the cookie and sets a new cookie, token never in the body', async () => {
    const admin = await createUser({ role: 'admin' });
    const { setCookie, cookieToken } = await loginAs(admin, 'web');
    expect(setCookie).toBeDefined();

    const res = await request(app)
      .post(REFRESH)
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${cookieToken ?? ''}`)
      .send({});

    expect(res.status).toBe(200);
    const { data } = body<Envelope<AuthData>>(res);
    expect('refreshToken' in data).toBe(false);

    const newCookie = (res.get('Set-Cookie') ?? []).find((line) =>
      line.startsWith(`${REFRESH_COOKIE_NAME}=`),
    );
    expect(newCookie).toBeDefined();
    const newToken = newCookie?.split(';')[0]?.split('=')[1];
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(cookieToken);
  });

  it('delivery follows the stored client, not how the token was presented', async () => {
    // A web token smuggled into the body must still be answered web-style (cookie, not body):
    // the client field is read from storage, so delivery channels can never be crossed.
    const admin = await createUser({ role: 'admin' });
    const { cookieToken } = await loginAs(admin, 'web');

    const res = await refreshWithBody(cookieToken ?? '');

    expect(res.status).toBe(200);
    const { data } = body<Envelope<AuthData>>(res);
    expect('refreshToken' in data).toBe(false);
    const cookie = (res.get('Set-Cookie') ?? []).find((line) =>
      line.startsWith(`${REFRESH_COOKIE_NAME}=`),
    );
    expect(cookie).toBeDefined();
  });

  it('rejects an expired refresh token', async () => {
    const user = await createUser();
    const { refreshToken } = await loginAs(user, 'mobile');

    await RefreshTokenModel.updateOne(
      { tokenHash: tokenService.hashRefreshToken(refreshToken ?? '') },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } },
    ).exec();

    const res = await refreshWithBody(refreshToken ?? '');
    expect(res.status).toBe(401);
    expect(body<ErrorEnvelope>(res).error.code).toBe('AUTH_REFRESH_INVALID');
  });

  it('rejects a soft-deleted user and revokes the family', async () => {
    const user = await createUser();
    const { refreshToken } = await loginAs(user, 'mobile');
    const stored = await RefreshTokenModel.findOne({
      tokenHash: tokenService.hashRefreshToken(refreshToken ?? ''),
    }).exec();
    expect(stored).not.toBeNull();

    await UserModel.updateOne({ _id: user.id }, { $set: { deletedAt: new Date() } }).exec();

    const res = await refreshWithBody(refreshToken ?? '');
    expect(res.status).toBe(401);
    expect(body<ErrorEnvelope>(res).error.code).toBe('AUTH_REFRESH_INVALID');

    const family = await RefreshTokenModel.find({ familyId: stored?.familyId }).exec();
    expect(family.length).toBeGreaterThan(0);
    for (const token of family) {
      expect(token.revokedAt).not.toBeNull();
    }
  });

  it('rejects a request with no token at all', async () => {
    const res = await request(app).post(REFRESH).send({});
    expect(res.status).toBe(401);
    expect(body<ErrorEnvelope>(res).error.code).toBe('AUTH_REFRESH_INVALID');
  });
});
