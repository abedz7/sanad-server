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

const TICKETS = '/api/v1/tickets';
const ADMIN_TICKETS = '/api/v1/admin/tickets';

interface TicketBody extends Record<string, unknown> {
  id: string;
  title: string;
  status: string;
  priority: string;
  requester: { id: string; name: string; role: string } & Record<string, unknown>;
  assignee: Record<string, unknown> | null;
  category: { id: string; name: string };
}

let admin: TestUser;
let userA: TestUser;
let userB: TestUser;
let adminToken: string;
let tokenA: string;
let tokenB: string;
let categoryId: string;

beforeEach(async () => {
  [admin, userA, userB] = await Promise.all([
    createUser({ role: 'admin' }),
    createUser(),
    createUser(),
  ]);
  [adminToken, tokenA, tokenB] = await Promise.all([
    loginAs(admin, 'mobile').then((s) => s.accessToken),
    loginAs(userA, 'mobile').then((s) => s.accessToken),
    loginAs(userB, 'mobile').then((s) => s.accessToken),
  ]);
  const category = await CategoryModel.create({ name: 'Billing' });
  categoryId = category._id.toString();
});

function createTicket(token: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post(TICKETS)
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Cannot export invoice',
      description: 'The export button does nothing.',
      categoryId,
      ...overrides,
    });
}

describe('POST /api/v1/tickets', () => {
  it('creates a ticket with the full contract shape and safe refs', async () => {
    const res = await createTicket(tokenA);
    expect(res.status).toBe(201);
    const { data } = body<Envelope<TicketBody>>(res);

    expect(Object.keys(data).sort()).toEqual([
      'assignee',
      'attachments',
      'category',
      'closedAt',
      'commentCount',
      'createdAt',
      'description',
      'id',
      'lastActivityAt',
      'priority',
      'requester',
      'resolvedAt',
      'status',
      'title',
      'updatedAt',
    ]);
    expect(data.status).toBe('open');
    expect(data.priority).toBe('medium'); // default
    expect(data.category).toEqual({ id: categoryId, name: 'Billing' });
    expect(data.requester).toEqual({ id: userA.id, name: userA.name, role: 'user' });
    // Refs never carry emails or anything beyond UserRef.
    expect(data.requester['email']).toBeUndefined();
    expect(data.assignee).toBeNull();
    expect(data['attachments']).toEqual([]);
    expect(data['commentCount']).toBe(0);
  });

  it('rejects a deleted category with 409 CATEGORY_UNAVAILABLE', async () => {
    await CategoryModel.updateOne({ _id: categoryId }, { $set: { deletedAt: new Date() } }).exec();
    const res = await createTicket(tokenA);
    expect(res.status).toBe(409);
    expect(body<ErrorEnvelope>(res).error.code).toBe('CATEGORY_UNAVAILABLE');
  });
});

describe('GET /api/v1/tickets (ownership, filters, sort, pagination)', () => {
  it('lists only the caller’s tickets as TicketListItems', async () => {
    await createTicket(tokenA, { title: 'A first ticket' });
    await createTicket(tokenA, { title: 'A second ticket' });
    await createTicket(tokenB, { title: 'B only ticket' });

    const res = await request(app).get(TICKETS).set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const { data, meta } = body<Envelope<TicketBody[]>>(res);
    expect(meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    for (const item of data) {
      expect(item.requester.id).toBe(userA.id);
      // TicketListItem: no description/attachments, attachmentCount instead.
      expect(item['description']).toBeUndefined();
      expect(item['attachments']).toBeUndefined();
      expect(item['attachmentCount']).toBe(0);
      expect(item['commentCount']).toBe(0);
    }
  });

  it('rejects the admin-only requesterId filter as an unknown key', async () => {
    const res = await request(app)
      .get(`${TICKETS}?requesterId=${userB.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(400);
    expect(body<ErrorEnvelope>(res).error.code).toBe('VALIDATION_FAILED');
  });

  it('filters by status and priority', async () => {
    await createTicket(tokenA, { title: 'Urgent one', priority: 'urgent' });
    const second = body<Envelope<TicketBody>>(
      await createTicket(tokenA, { title: 'Low one', priority: 'low' }),
    ).data;
    await TicketModel.updateOne({ _id: second.id }, { $set: { status: 'closed' } }).exec();

    const byStatus = await request(app)
      .get(`${TICKETS}?status=closed`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(body<Envelope<TicketBody[]>>(byStatus).data.map((t) => t.title)).toEqual(['Low one']);

    const byPriority = await request(app)
      .get(`${TICKETS}?priority=urgent`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(body<Envelope<TicketBody[]>>(byPriority).data.map((t) => t.title)).toEqual([
      'Urgent one',
    ]);
  });

  it('sorts by priority rank in both directions', async () => {
    await createTicket(tokenA, { title: 'low', priority: 'low' });
    await createTicket(tokenA, { title: 'urgent', priority: 'urgent' });
    await createTicket(tokenA, { title: 'high', priority: 'high' });

    const desc = await request(app)
      .get(`${TICKETS}?sort=-priority`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(body<Envelope<TicketBody[]>>(desc).data.map((t) => t.title)).toEqual([
      'urgent',
      'high',
      'low',
    ]);

    const asc = await request(app)
      .get(`${TICKETS}?sort=priority`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(body<Envelope<TicketBody[]>>(asc).data.map((t) => t.title)).toEqual([
      'low',
      'high',
      'urgent',
    ]);
  });

  it('paginates with meta and rejects out-of-range page/limit/sort', async () => {
    await createTicket(tokenA, { title: 'first ticket' });
    await createTicket(tokenA, { title: 'second ticket' });
    await createTicket(tokenA, { title: 'third ticket' });

    const page2 = await request(app)
      .get(`${TICKETS}?limit=2&page=2&sort=createdAt`)
      .set('Authorization', `Bearer ${tokenA}`);
    const { data, meta } = body<Envelope<TicketBody[]>>(page2);
    expect(meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(data.map((t) => t.title)).toEqual(['third ticket']);

    for (const bad of ['limit=101', 'page=0', 'sort=title']) {
      const res = await request(app)
        .get(`${TICKETS}?${bad}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(400);
    }
  });
});

describe('GET /api/v1/admin/tickets', () => {
  it('sees all tickets, filters by requesterId and full-text q', async () => {
    await createTicket(tokenA, { title: 'Printer on fire', description: 'smoke everywhere' });
    await createTicket(tokenB, { title: 'Zebra stripes misaligned', description: 'on the report' });

    const all = await request(app).get(ADMIN_TICKETS).set('Authorization', `Bearer ${adminToken}`);
    expect(body<Envelope<TicketBody[]>>(all).meta?.total).toBe(2);

    const byRequester = await request(app)
      .get(`${ADMIN_TICKETS}?requesterId=${userB.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(body<Envelope<TicketBody[]>>(byRequester).data.map((t) => t.title)).toEqual([
      'Zebra stripes misaligned',
    ]);

    const byText = await request(app)
      .get(`${ADMIN_TICKETS}?q=zebra`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(body<Envelope<TicketBody[]>>(byText).data.map((t) => t.title)).toEqual([
      'Zebra stripes misaligned',
    ]);
  });

  it('filters unassigned tickets and assigns via PATCH', async () => {
    const t1 = body<Envelope<TicketBody>>(await createTicket(tokenA, { title: 'assign me' })).data;
    await createTicket(tokenB, { title: 'leave me' });

    const assign = await request(app)
      .patch(`${ADMIN_TICKETS}/${t1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assigneeId: admin.id });
    expect(assign.status).toBe(200);
    expect(body<Envelope<TicketBody>>(assign).data.assignee).toEqual({
      id: admin.id,
      name: admin.name,
      role: 'admin',
    });

    const unassigned = await request(app)
      .get(`${ADMIN_TICKETS}?unassigned=true`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(body<Envelope<TicketBody[]>>(unassigned).data.map((t) => t.title)).toEqual(['leave me']);
  });
});

describe('PATCH /api/v1/admin/tickets/:id', () => {
  it('rejects a non-admin assignee with 400 at body.assigneeId', async () => {
    const ticket = body<Envelope<TicketBody>>(await createTicket(tokenA)).data;
    const res = await request(app)
      .patch(`${ADMIN_TICKETS}/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assigneeId: userB.id });
    expect(res.status).toBe(400);
    const { error } = body<ErrorEnvelope>(res);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.[0]?.path).toBe('body.assigneeId');
  });

  it('changes priority, unassigns with null, and rejects a deleted category', async () => {
    const ticket = body<Envelope<TicketBody>>(await createTicket(tokenA)).data;

    const prio = await request(app)
      .patch(`${ADMIN_TICKETS}/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 'urgent', assigneeId: admin.id });
    expect(prio.status).toBe(200);
    expect(body<Envelope<TicketBody>>(prio).data.priority).toBe('urgent');

    const unassign = await request(app)
      .patch(`${ADMIN_TICKETS}/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assigneeId: null });
    expect(body<Envelope<TicketBody>>(unassign).data.assignee).toBeNull();

    const dead = await CategoryModel.create({ name: 'Old', deletedAt: new Date() });
    const badCategory = await request(app)
      .patch(`${ADMIN_TICKETS}/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryId: dead._id.toString() });
    expect(badCategory.status).toBe(409);
    expect(body<ErrorEnvelope>(badCategory).error.code).toBe('CATEGORY_UNAVAILABLE');

    const empty = await request(app)
      .patch(`${ADMIN_TICKETS}/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(empty.status).toBe(400);
  });
});

describe('lastActivityAt bumps on every mutation (contract 1.2.0 §5)', () => {
  async function lastActivityOf(id: string): Promise<number> {
    const doc = await TicketModel.findById(id).exec();
    return doc?.lastActivityAt.getTime() ?? Number.NaN;
  }

  it('moves on requester edits and every kind of admin patch', async () => {
    const ticket = body<Envelope<TicketBody>>(await createTicket(tokenA)).data;
    let before = await lastActivityOf(ticket.id);

    // Requester edit.
    await request(app)
      .patch(`/api/v1/tickets/${ticket.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Edited for activity' })
      .expect(200);
    let after = await lastActivityOf(ticket.id);
    expect(after).toBeGreaterThan(before);
    before = after;

    // Admin patch: priority.
    await request(app)
      .patch(`${ADMIN_TICKETS}/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 'urgent' })
      .expect(200);
    after = await lastActivityOf(ticket.id);
    expect(after).toBeGreaterThan(before);
    before = after;

    // Admin patch: assignee.
    await request(app)
      .patch(`${ADMIN_TICKETS}/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assigneeId: admin.id })
      .expect(200);
    after = await lastActivityOf(ticket.id);
    expect(after).toBeGreaterThan(before);
    before = after;

    // Admin patch: category.
    const other = await CategoryModel.create({ name: 'Technical' });
    await request(app)
      .patch(`${ADMIN_TICKETS}/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryId: other._id.toString() })
      .expect(200);
    after = await lastActivityOf(ticket.id);
    expect(after).toBeGreaterThan(before);
    before = after;

    // A no-op patch (same values) writes no event and moves nothing.
    await request(app)
      .patch(`${ADMIN_TICKETS}/${ticket.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 'urgent' })
      .expect(200);
    expect(await lastActivityOf(ticket.id)).toBe(before);
  });
});

describe('PATCH /api/v1/tickets/:id (owner edit)', () => {
  it('edits title/description while open, 409 TICKET_NOT_EDITABLE otherwise', async () => {
    const ticket = body<Envelope<TicketBody>>(await createTicket(tokenA)).data;

    const edited = await request(app)
      .patch(`${TICKETS}/${ticket.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Clearer title here' });
    expect(edited.status).toBe(200);
    expect(body<Envelope<TicketBody>>(edited).data.title).toBe('Clearer title here');

    await TicketModel.updateOne({ _id: ticket.id }, { $set: { status: 'in_progress' } }).exec();
    const blocked = await request(app)
      .patch(`${TICKETS}/${ticket.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Too late to edit' });
    expect(blocked.status).toBe(409);
    expect(body<ErrorEnvelope>(blocked).error.code).toBe('TICKET_NOT_EDITABLE');
  });
});
