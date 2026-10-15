import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { CategoryModel } from '../src/modules/categories/category.model.js';
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

interface CommentBody extends Record<string, unknown> {
  id: string;
  ticketId: string;
  author: { id: string; name: string; role: string };
  body: string;
  isInternal: boolean;
}

interface TicketBody extends Record<string, unknown> {
  id: string;
  commentCount: number;
  lastActivityAt: string;
}

let admin: TestUser;
let user: TestUser;
let adminToken: string;
let userToken: string;
let ticketId: string;

beforeEach(async () => {
  [admin, user] = await Promise.all([createUser({ role: 'admin' }), createUser()]);
  [adminToken, userToken] = await Promise.all([
    loginAs(admin, 'mobile').then((s) => s.accessToken),
    loginAs(user, 'mobile').then((s) => s.accessToken),
  ]);
  const category = await CategoryModel.create({ name: 'Billing' });
  const created = await request(app)
    .post('/api/v1/tickets')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      title: 'Cannot export invoice',
      description: 'The export button does nothing.',
      categoryId: category._id.toString(),
    });
  ticketId = body<Envelope<TicketBody>>(created).data.id;
});

describe('ticket comments', () => {
  it('owner adds a comment; commentCount increments and lastActivityAt bumps', async () => {
    const before = await TicketModel.findById(ticketId).exec();

    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ body: 'Any update on this?' });
    expect(res.status).toBe(201);
    const { data } = body<Envelope<CommentBody>>(res);
    expect(Object.keys(data).sort()).toEqual([
      'author',
      'body',
      'createdAt',
      'id',
      'isInternal',
      'ticketId',
    ]);
    expect(data.author).toEqual({ id: user.id, name: user.name, role: 'user' });
    expect(data.isInternal).toBe(false);

    const after = await TicketModel.findById(ticketId).exec();
    expect(after?.commentCount).toBe(1);
    expect(after?.lastActivityAt.getTime()).toBeGreaterThan(
      before?.lastActivityAt.getTime() ?? Infinity,
    );
  });

  it('owners cannot smuggle isInternal into their comment', async () => {
    const res = await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ body: 'sneaky note', isInternal: true });
    expect(res.status).toBe(400); // strict schema: unknown key on the owner route
  });

  it('internal comments are visible to admins, invisible to the owner, with honest meta', async () => {
    await request(app)
      .post(`/api/v1/admin/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'public answer' })
      .expect(201);
    await request(app)
      .post(`/api/v1/admin/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'internal note about the customer', isInternal: true })
      .expect(201);

    const ownerView = await request(app)
      .get(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${userToken}`);
    const ownerComments = body<Envelope<CommentBody[]>>(ownerView);
    expect(ownerComments.data.map((c) => c.body)).toEqual(['public answer']);
    expect(ownerComments.meta?.total).toBe(1); // internal comments excluded from the count too
    for (const comment of ownerComments.data) expect(comment.isInternal).toBe(false);

    const adminView = await request(app)
      .get(`/api/v1/admin/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`);
    const adminComments = body<Envelope<CommentBody[]>>(adminView);
    expect(adminComments.data.map((c) => c.isInternal)).toEqual([false, true]);
    expect(adminComments.meta?.total).toBe(2);
  });

  it('lists oldest first with pagination', async () => {
    for (const text of ['first comment', 'second comment', 'third comment']) {
      await request(app)
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ body: text })
        .expect(201);
    }
    const page2 = await request(app)
      .get(`/api/v1/tickets/${ticketId}/comments?limit=2&page=2`)
      .set('Authorization', `Bearer ${userToken}`);
    const { data, meta } = body<Envelope<CommentBody[]>>(page2);
    expect(meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(data.map((c) => c.body)).toEqual(['third comment']);
  });

  it('rejects comments on a closed ticket with 409 TICKET_CLOSED', async () => {
    await TicketModel.updateOne(
      { _id: ticketId },
      { $set: { status: 'closed', closedAt: new Date() } },
    ).exec();

    const owner = await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ body: 'too late' });
    expect(owner.status).toBe(409);
    expect(body<ErrorEnvelope>(owner).error.code).toBe('TICKET_CLOSED');

    const adminRes = await request(app)
      .post(`/api/v1/admin/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'also too late', isInternal: true });
    expect(adminRes.status).toBe(409);
  });
});
