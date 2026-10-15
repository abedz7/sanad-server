import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { CategoryModel } from '../src/modules/categories/category.model.js';
import {
  app,
  body,
  createUser,
  loginAs,
  type Envelope,
  type ErrorEnvelope,
  type TestUser,
} from './setup.js';

// A real 1×1 PNG so the upload passes magic-byte validation.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let attacker: TestUser;
let attackerToken: string;
let victimToken: string;
let adminToken: string;
let victimTicketId: string;
let victimAttachmentId: string;

beforeEach(async () => {
  let victim: TestUser;
  let admin: TestUser;
  [attacker, victim, admin] = await Promise.all([
    createUser(),
    createUser(),
    createUser({ role: 'admin' }),
  ]);
  [attackerToken, victimToken, adminToken] = await Promise.all([
    loginAs(attacker, 'mobile').then((s) => s.accessToken),
    loginAs(victim, 'mobile').then((s) => s.accessToken),
    loginAs(admin, 'mobile').then((s) => s.accessToken),
  ]);
  const category = await CategoryModel.create({ name: 'Billing' });

  const created = await request(app)
    .post('/api/v1/tickets')
    .set('Authorization', `Bearer ${victimToken}`)
    .send({
      title: 'Victim private ticket',
      description: 'Contains sensitive context.',
      categoryId: category._id.toString(),
    });
  victimTicketId = body<Envelope<{ id: string }>>(created).data.id;

  await request(app)
    .post(`/api/v1/tickets/${victimTicketId}/comments`)
    .set('Authorization', `Bearer ${victimToken}`)
    .send({ body: 'private note from the victim' })
    .expect(201);
  const uploaded = await request(app)
    .post(`/api/v1/tickets/${victimTicketId}/attachments`)
    .set('Authorization', `Bearer ${victimToken}`)
    .attach('file', PNG, 'private.png')
    .expect(201);
  victimAttachmentId = body<Envelope<{ id: string }>>(uploaded).data.id;
});

function expectHiddenNotForbidden(res: request.Response): void {
  // The contract's core IDOR rule: missing-or-not-yours is 404 NOT_FOUND — never 403, which would
  // confirm the resource exists.
  expect(res.status).toBe(404);
  expect(body<ErrorEnvelope>(res).error.code).toBe('NOT_FOUND');
}

describe("IDOR: user A against user B's ticket", () => {
  it('GET ticket detail → 404', async () => {
    expectHiddenNotForbidden(
      await request(app)
        .get(`/api/v1/tickets/${victimTicketId}`)
        .set('Authorization', `Bearer ${attackerToken}`),
    );
  });

  it('GET comments → 404 (not an empty list)', async () => {
    expectHiddenNotForbidden(
      await request(app)
        .get(`/api/v1/tickets/${victimTicketId}/comments`)
        .set('Authorization', `Bearer ${attackerToken}`),
    );
  });

  it('POST comment → 404', async () => {
    expectHiddenNotForbidden(
      await request(app)
        .post(`/api/v1/tickets/${victimTicketId}/comments`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({ body: 'injected comment' }),
    );
  });

  it('GET history → 404', async () => {
    expectHiddenNotForbidden(
      await request(app)
        .get(`/api/v1/tickets/${victimTicketId}/history`)
        .set('Authorization', `Bearer ${attackerToken}`),
    );
  });

  it('GET attachment download → 404', async () => {
    expectHiddenNotForbidden(
      await request(app)
        .get(`/api/v1/tickets/${victimTicketId}/attachments/${victimAttachmentId}/download`)
        .set('Authorization', `Bearer ${attackerToken}`),
    );
  });

  it('POST attachment upload → 404', async () => {
    expectHiddenNotForbidden(
      await request(app)
        .post(`/api/v1/tickets/${victimTicketId}/attachments`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .attach('file', PNG, 'sneaky.png'),
    );
  });

  it('POST status change → 404', async () => {
    expectHiddenNotForbidden(
      await request(app)
        .post(`/api/v1/tickets/${victimTicketId}/status`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({ status: 'closed' }),
    );
  });

  it('PATCH title/description → 404', async () => {
    expectHiddenNotForbidden(
      await request(app)
        .patch(`/api/v1/tickets/${victimTicketId}`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({ title: 'Hijacked title!' }),
    );
  });

  it("an admin can read both users' tickets through the admin surface", async () => {
    const ownTicket = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({
        title: 'Attacker own ticket',
        description: 'legit',
        categoryId: (await CategoryModel.findOne({ name: 'Billing' }).exec())?._id.toString(),
      });
    expect(ownTicket.status).toBe(201);
    const attackerTicketId = body<Envelope<{ id: string }>>(ownTicket).data.id;

    for (const id of [victimTicketId, attackerTicketId]) {
      const res = await request(app)
        .get(`/api/v1/admin/tickets/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    }

    // And the owner surface still works for the actual owner.
    await request(app)
      .get(`/api/v1/tickets/${victimTicketId}`)
      .set('Authorization', `Bearer ${victimToken}`)
      .expect(200);
  });
});
