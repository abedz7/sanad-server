import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  app,
  body,
  createUser,
  loginAs,
  type ApiUser,
  type Envelope,
  type ErrorEnvelope,
} from './setup.js';

const ADMIN_USERS = '/api/v1/admin/users';

describe('GET /api/v1/admin/users (RBAC + query validation)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get(ADMIN_USERS);
    expect(res.status).toBe(401);
    expect(body<ErrorEnvelope>(res).error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects a plain user with 403 FORBIDDEN', async () => {
    const user = await createUser();
    const { accessToken } = await loginAs(user, 'mobile');

    const res = await request(app).get(ADMIN_USERS).set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
    expect(body<ErrorEnvelope>(res).error.code).toBe('FORBIDDEN');
  });

  it('returns a paginated listing with meta for an admin', async () => {
    const admin = await createUser({ role: 'admin' });
    await createUser();
    await createUser();
    const { accessToken } = await loginAs(admin, 'mobile');

    const res = await request(app).get(ADMIN_USERS).set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const { data, meta } = body<Envelope<ApiUser[]>>(res);
    expect(data).toHaveLength(3);
    expect(meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
    // Listed users carry only the safe shape.
    for (const user of data) {
      expect(user['passwordHash']).toBeUndefined();
      expect(user['failedLoginAttempts']).toBeUndefined();
    }
  });

  it('filters by ?role=user', async () => {
    const admin = await createUser({ role: 'admin' });
    await createUser();
    await createUser();
    const { accessToken } = await loginAs(admin, 'mobile');

    const res = await request(app)
      .get(`${ADMIN_USERS}?role=user`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const { data, meta } = body<Envelope<ApiUser[]>>(res);
    expect(data).toHaveLength(2);
    expect(meta?.total).toBe(2);
    for (const user of data) expect(user.role).toBe('user');
  });

  it.each([
    ['limit above the cap', 'limit=101'],
    ['page below 1', 'page=0'],
    ['an unknown query key', 'nope=1'],
  ])('rejects %s with 400 VALIDATION_FAILED', async (_label, queryString) => {
    const admin = await createUser({ role: 'admin' });
    const { accessToken } = await loginAs(admin, 'mobile');

    const res = await request(app)
      .get(`${ADMIN_USERS}?${queryString}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(body<ErrorEnvelope>(res).error.code).toBe('VALIDATION_FAILED');
  });
});
