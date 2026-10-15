import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { TicketModel } from '../src/modules/tickets/ticket.model.js';
import {
  app,
  body,
  createUser,
  loginAs,
  type Envelope,
  type ErrorEnvelope,
  type TestUser,
} from './setup.js';

const USER_LIST = '/api/v1/categories';
const ADMIN = '/api/v1/admin/categories';

interface CategoryBody extends Record<string, unknown> {
  id: string;
  name: string;
  description: string;
}

let admin: TestUser;
let adminToken: string;

beforeEach(async () => {
  admin = await createUser({ role: 'admin' });
  adminToken = (await loginAs(admin, 'mobile')).accessToken;
});

function asAdmin(method: 'get' | 'post' | 'patch' | 'delete', url: string) {
  return request(app)[method](url).set('Authorization', `Bearer ${adminToken}`);
}

describe('categories', () => {
  it('admin creates a category; users see it sorted by name', async () => {
    await asAdmin('post', ADMIN).send({ name: 'Billing', description: 'Invoices' }).expect(201);
    const created = await asAdmin('post', ADMIN).send({ name: 'Account' });
    expect(created.status).toBe(201);
    const { data } = body<Envelope<CategoryBody>>(created);
    expect(Object.keys(data).sort()).toEqual([
      'createdAt',
      'description',
      'id',
      'name',
      'updatedAt',
    ]);

    const user = await createUser();
    const { accessToken } = await loginAs(user, 'mobile');
    const list = await request(app).get(USER_LIST).set('Authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    const names = body<Envelope<CategoryBody[]>>(list).data.map((c) => c.name);
    expect(names).toEqual(['Account', 'Billing']);
  });

  it('rejects a duplicate active name with 409 CONFLICT', async () => {
    await asAdmin('post', ADMIN).send({ name: 'Billing' }).expect(201);
    const res = await asAdmin('post', ADMIN).send({ name: 'Billing' });
    expect(res.status).toBe(409);
    expect(body<ErrorEnvelope>(res).error.code).toBe('CONFLICT');
  });

  it('PATCH updates and enforces name uniqueness; unknown id is 404', async () => {
    await asAdmin('post', ADMIN).send({ name: 'Billing' }).expect(201);
    const other = body<Envelope<CategoryBody>>(
      await asAdmin('post', ADMIN).send({ name: 'Technical' }),
    ).data;

    const renamed = await asAdmin('patch', `${ADMIN}/${other.id}`).send({ name: 'Tech' });
    expect(renamed.status).toBe(200);
    expect(body<Envelope<CategoryBody>>(renamed).data.name).toBe('Tech');

    const clash = await asAdmin('patch', `${ADMIN}/${other.id}`).send({ name: 'Billing' });
    expect(clash.status).toBe(409);
    expect(body<ErrorEnvelope>(clash).error.code).toBe('CONFLICT');

    const missing = await asAdmin('patch', `${ADMIN}/ffffffffffffffffffffffff`).send({
      name: 'Nope',
    });
    expect(missing.status).toBe(404);

    const emptyPatch = await asAdmin('patch', `${ADMIN}/${other.id}`).send({});
    expect(emptyPatch.status).toBe(400);
  });

  it('soft delete hides the category from users, keeps it for admin with includeDeleted, and frees the name', async () => {
    const created = body<Envelope<CategoryBody>>(
      await asAdmin('post', ADMIN).send({ name: 'Billing' }),
    ).data;
    await asAdmin('delete', `${ADMIN}/${created.id}`).expect(204);

    const user = await createUser();
    const { accessToken } = await loginAs(user, 'mobile');
    const list = await request(app).get(USER_LIST).set('Authorization', `Bearer ${accessToken}`);
    expect(body<Envelope<CategoryBody[]>>(list).data).toHaveLength(0);

    // Default admin listing hides deleted too; includeDeleted shows it with deletedAt set.
    const adminDefault = await asAdmin('get', ADMIN);
    expect(body<Envelope<CategoryBody[]>>(adminDefault).data).toHaveLength(0);
    const adminAll = await asAdmin('get', `${ADMIN}?includeDeleted=true`);
    const rows = body<Envelope<CategoryBody[]>>(adminAll).data;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['deletedAt']).toBeTruthy();
    expect(rows[0]?.['ticketCount']).toBe(0);

    // The partial unique index frees the name for a new active category.
    await asAdmin('post', ADMIN).send({ name: 'Billing' }).expect(201);

    // Deleting an already-deleted category is 404.
    await asAdmin('delete', `${ADMIN}/${created.id}`).expect(404);
  });

  it('blocks deletion with 409 CATEGORY_IN_USE when any ticket references it', async () => {
    const created = body<Envelope<CategoryBody>>(
      await asAdmin('post', ADMIN).send({ name: 'Billing' }),
    ).data;
    const user = await createUser();
    await TicketModel.create({
      title: 'Broken invoice',
      description: 'It is broken',
      categoryId: created.id,
      requesterId: user.id,
      status: 'closed', // any status counts (PLAN D5)
    });

    const res = await asAdmin('delete', `${ADMIN}/${created.id}`);
    expect(res.status).toBe(409);
    expect(body<ErrorEnvelope>(res).error.code).toBe('CATEGORY_IN_USE');

    const adminAll = await asAdmin('get', ADMIN);
    const rows = body<Envelope<CategoryBody[]>>(adminAll).data;
    expect(rows[0]?.['ticketCount']).toBe(1);
  });

  it('keeps admin category routes off-limits for plain users (403) and unauthenticated callers (401)', async () => {
    const user = await createUser();
    const { accessToken } = await loginAs(user, 'mobile');

    const forbidden = await request(app)
      .post(ADMIN)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Nope' });
    expect(forbidden.status).toBe(403);
    expect(body<ErrorEnvelope>(forbidden).error.code).toBe('FORBIDDEN');

    await request(app).get(ADMIN).expect(401);
    // The user-facing list also requires authentication.
    await request(app).get(USER_LIST).expect(401);
  });
});
