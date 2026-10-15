import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { UserModel } from '../src/modules/users/user.model.js';
import {
  app,
  body,
  createUser,
  loginAs,
  signExpiredToken,
  signWithWrongSecret,
  type ApiUser,
  type Envelope,
  type ErrorEnvelope,
} from './setup.js';

const ME = '/api/v1/auth/me';

describe('GET /api/v1/auth/me', () => {
  it('returns the safe user shape', async () => {
    const user = await createUser();
    const { accessToken } = await loginAs(user, 'mobile');

    const res = await request(app).get(ME).set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const { data } = body<Envelope<ApiUser>>(res);
    expect(Object.keys(data).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'role',
      'updatedAt',
    ]);
    expect(data.id).toBe(user.id);
    expect(data.email).toBe(user.email);
    expect(data['passwordHash']).toBeUndefined();
    expect(data['lockedUntil']).toBeUndefined();
  });

  it('rejects a request without a token', async () => {
    const res = await request(app).get(ME);
    expect(res.status).toBe(401);
    expect(body<ErrorEnvelope>(res).error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects an expired access token', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(ME)
      .set('Authorization', `Bearer ${signExpiredToken(user.id)}`);
    expect(res.status).toBe(401);
    expect(body<ErrorEnvelope>(res).error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const user = await createUser();
    const res = await request(app)
      .get(ME)
      .set('Authorization', `Bearer ${signWithWrongSecret(user.id)}`);
    expect(res.status).toBe(401);
    expect(body<ErrorEnvelope>(res).error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects a soft-deleted user even while their access token is still valid', async () => {
    const user = await createUser();
    const { accessToken } = await loginAs(user, 'mobile');
    await UserModel.updateOne({ _id: user.id }, { $set: { deletedAt: new Date() } }).exec();

    const res = await request(app).get(ME).set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
    expect(body<ErrorEnvelope>(res).error.code).toBe('AUTH_REQUIRED');
  });
});
