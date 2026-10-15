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

type Status = 'open' | 'in_progress' | 'resolved' | 'closed';

interface TicketBody extends Record<string, unknown> {
  id: string;
  status: Status;
  resolvedAt: string | null;
  closedAt: string | null;
}

interface EventBody extends Record<string, unknown> {
  type: string;
  changes: Record<string, { from: unknown; to: unknown }>;
}

let admin: TestUser;
let user: TestUser;
let adminToken: string;
let userToken: string;
let categoryId: string;

beforeEach(async () => {
  [admin, user] = await Promise.all([createUser({ role: 'admin' }), createUser()]);
  [adminToken, userToken] = await Promise.all([
    loginAs(admin, 'mobile').then((s) => s.accessToken),
    loginAs(user, 'mobile').then((s) => s.accessToken),
  ]);
  const category = await CategoryModel.create({ name: 'Billing' });
  categoryId = category._id.toString();
});

// Creates a ticket owned by `user` and forces it into `from` (with a fresh closedAt for closed).
async function ticketIn(from: Status): Promise<string> {
  const created = await request(app)
    .post('/api/v1/tickets')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ title: 'Transition fixture', description: 'fixture', categoryId });
  const id = body<Envelope<TicketBody>>(created).data.id;
  if (from !== 'open') {
    await TicketModel.updateOne(
      { _id: id },
      {
        $set: {
          status: from,
          resolvedAt: from === 'resolved' ? new Date() : null,
          closedAt: from === 'closed' ? new Date() : null,
        },
      },
    ).exec();
  }
  return id;
}

function setStatus(route: string, token: string, status: Status) {
  return request(app).post(route).set('Authorization', `Bearer ${token}`).send({ status });
}

// docs/API.md §5, every from→to pair (identity pairs are never legal).
const MATRIX: [from: Status, to: Status, admin: boolean, requester: boolean][] = [
  ['open', 'in_progress', true, false],
  ['open', 'resolved', false, false],
  ['open', 'closed', true, true],
  ['in_progress', 'open', true, false],
  ['in_progress', 'resolved', true, false],
  ['in_progress', 'closed', true, true],
  ['resolved', 'open', false, true],
  ['resolved', 'in_progress', true, false],
  ['resolved', 'closed', true, true],
  ['closed', 'open', true, true], // requester: only within the reopen window (fresh closedAt here)
  ['closed', 'in_progress', false, false],
  ['closed', 'resolved', false, false],
];

describe('status machine (docs/API.md §5)', () => {
  it.each(MATRIX)(
    '%s → %s: admin=%s requester=%s',
    async (from, to, adminAllowed, requesterAllowed) => {
      const adminTicket = await ticketIn(from);
      const adminRes = await setStatus(
        `/api/v1/admin/tickets/${adminTicket}/status`,
        adminToken,
        to,
      );
      if (adminAllowed) {
        expect(adminRes.status).toBe(200);
        expect(body<Envelope<TicketBody>>(adminRes).data.status).toBe(to);
      } else {
        expect(adminRes.status).toBe(409);
        expect(body<ErrorEnvelope>(adminRes).error.code).toBe('TICKET_INVALID_TRANSITION');
      }

      const userTicket = await ticketIn(from);
      const userRes = await setStatus(`/api/v1/tickets/${userTicket}/status`, userToken, to);
      if (requesterAllowed) {
        expect(userRes.status).toBe(200);
        expect(body<Envelope<TicketBody>>(userRes).data.status).toBe(to);
      } else {
        expect(userRes.status).toBe(409);
        expect(body<ErrorEnvelope>(userRes).error.code).toBe('TICKET_INVALID_TRANSITION');
      }
    },
  );

  it.each(['open', 'in_progress', 'resolved', 'closed'] as Status[])(
    'rejects the identity transition %s → %s',
    async (status) => {
      const id = await ticketIn(status);
      const res = await setStatus(`/api/v1/admin/tickets/${id}/status`, adminToken, status);
      expect(res.status).toBe(409);
    },
  );

  it('requester reopen works inside the 7-day window and fails outside it; admin is unbounded', async () => {
    const inside = await ticketIn('closed');
    await TicketModel.updateOne(
      { _id: inside },
      { $set: { closedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) } },
    ).exec();
    const ok = await setStatus(`/api/v1/tickets/${inside}/status`, userToken, 'open');
    expect(ok.status).toBe(200);

    const outside = await ticketIn('closed');
    await TicketModel.updateOne(
      { _id: outside },
      { $set: { closedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } },
    ).exec();
    const stale = await setStatus(`/api/v1/tickets/${outside}/status`, userToken, 'open');
    expect(stale.status).toBe(409);
    expect(body<ErrorEnvelope>(stale).error.code).toBe('TICKET_INVALID_TRANSITION');

    const adminReopen = await setStatus(
      `/api/v1/admin/tickets/${outside}/status`,
      adminToken,
      'open',
    );
    expect(adminReopen.status).toBe(200);
  });

  it('maintains resolvedAt/closedAt through a real lifecycle and writes one event per change', async () => {
    const id = await ticketIn('open');

    const inProgress = body<Envelope<TicketBody>>(
      await setStatus(`/api/v1/admin/tickets/${id}/status`, adminToken, 'in_progress'),
    ).data;
    expect(inProgress.resolvedAt).toBeNull();
    expect(inProgress.closedAt).toBeNull();

    const resolved = body<Envelope<TicketBody>>(
      await setStatus(`/api/v1/admin/tickets/${id}/status`, adminToken, 'resolved'),
    ).data;
    expect(resolved.resolvedAt).toBeTruthy();
    expect(resolved.closedAt).toBeNull();

    const closed = body<Envelope<TicketBody>>(
      await setStatus(`/api/v1/tickets/${id}/status`, userToken, 'closed'),
    ).data;
    expect(closed.closedAt).toBeTruthy();

    const reopened = body<Envelope<TicketBody>>(
      await setStatus(`/api/v1/tickets/${id}/status`, userToken, 'open'),
    ).data;
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.closedAt).toBeNull();

    const history = await request(app)
      .get(`/api/v1/admin/tickets/${id}/history`)
      .set('Authorization', `Bearer ${adminToken}`);
    const events = body<Envelope<EventBody[]>>(history).data;
    expect(events.map((event) => event.type)).toEqual([
      'created',
      'status_changed',
      'status_changed',
      'status_changed',
      'status_changed',
    ]);
    expect(events.slice(1).map((event) => event.changes['status'])).toEqual([
      { from: 'open', to: 'in_progress' },
      { from: 'in_progress', to: 'resolved' },
      { from: 'resolved', to: 'closed' },
      { from: 'closed', to: 'open' },
    ]);
  });

  it('a closed ticket rejects comments, attachments, owner edits and admin patches', async () => {
    const id = await ticketIn('closed');

    const comment = await request(app)
      .post(`/api/v1/tickets/${id}/comments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ body: 'too late' });
    expect(comment.status).toBe(409);
    expect(body<ErrorEnvelope>(comment).error.code).toBe('TICKET_CLOSED');

    const attachment = await request(app)
      .post(`/api/v1/tickets/${id}/attachments`)
      .set('Authorization', `Bearer ${userToken}`)
      .attach('file', Buffer.from('%PDF-1.4\nx'), 'late.pdf');
    expect(attachment.status).toBe(409);
    expect(body<ErrorEnvelope>(attachment).error.code).toBe('TICKET_CLOSED');

    // Owner edit on a non-open ticket is TICKET_NOT_EDITABLE per docs/API.md §7.3.
    const edit = await request(app)
      .patch(`/api/v1/tickets/${id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'New title too late' });
    expect(edit.status).toBe(409);
    expect(body<ErrorEnvelope>(edit).error.code).toBe('TICKET_NOT_EDITABLE');

    const adminPatch = await request(app)
      .patch(`/api/v1/admin/tickets/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 'urgent' });
    expect(adminPatch.status).toBe(409);
    expect(body<ErrorEnvelope>(adminPatch).error.code).toBe('TICKET_CLOSED');
  });
});
