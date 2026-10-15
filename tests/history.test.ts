import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { CategoryModel } from '../src/modules/categories/category.model.js';
import { historyRepository } from '../src/modules/history/history.repository.js';
import { app, body, createUser, loginAs, type Envelope, type TestUser } from './setup.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

interface EventBody extends Record<string, unknown> {
  id: string;
  ticketId: string;
  actor: { id: string; name: string; role: string };
  type: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  createdAt: string;
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

describe('ticket history', () => {
  it('records every event type with before/after values and the right actor', async () => {
    const created = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'History fixture', description: 'original text', categoryId });
    const ticketId = body<Envelope<{ id: string }>>(created).data.id;

    await request(app)
      .patch(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'Edited title!!', description: 'edited text' })
      .expect(200);
    await request(app)
      .patch(`/api/v1/admin/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 'urgent', assigneeId: admin.id })
      .expect(200);
    const comment = await request(app)
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ body: 'any update?' })
      .expect(201);
    const attachment = await request(app)
      .post(`/api/v1/tickets/${ticketId}/attachments`)
      .set('Authorization', `Bearer ${userToken}`)
      .attach('file', PNG, 'proof.png')
      .expect(201);
    await request(app)
      .post(`/api/v1/admin/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'in_progress' })
      .expect(200);

    // Owner view of the full trail (oldest first, no meta per docs/API.md §7.3).
    const history = await request(app)
      .get(`/api/v1/tickets/${ticketId}/history`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(history.status).toBe(200);
    const events = body<Envelope<EventBody[]>>(history).data;

    expect(events.map((event) => event.type)).toEqual([
      'created',
      'updated',
      'priority_changed',
      'assigned',
      'comment_added',
      'attachment_added',
      'status_changed',
    ]);

    const [createdEv, updatedEv, priorityEv, assignedEv, commentEv, attachmentEv, statusEv] =
      events;
    expect(createdEv?.changes).toEqual({ status: { from: null, to: 'open' } });
    expect(createdEv?.actor).toEqual({ id: user.id, name: user.name, role: 'user' });

    expect(updatedEv?.changes).toEqual({
      title: { from: 'History fixture', to: 'Edited title!!' },
      description: { from: 'original text', to: 'edited text' },
    });

    expect(priorityEv?.changes).toEqual({ priority: { from: 'medium', to: 'urgent' } });
    expect(priorityEv?.actor.id).toBe(admin.id);

    expect(assignedEv?.changes).toEqual({ assigneeId: { from: null, to: admin.id } });

    expect(commentEv?.changes).toEqual({
      commentId: { from: null, to: body<Envelope<{ id: string }>>(comment).data.id },
    });
    expect(attachmentEv?.changes).toEqual({
      attachmentId: { from: null, to: body<Envelope<{ id: string }>>(attachment).data.id },
    });

    expect(statusEv?.changes).toEqual({ status: { from: 'open', to: 'in_progress' } });
    expect(statusEv?.actor).toEqual({ id: admin.id, name: admin.name, role: 'admin' });

    // Every event serialises the §4.6 shape.
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual([
        'actor',
        'changes',
        'createdAt',
        'id',
        'ticketId',
        'type',
      ]);
      expect(event.ticketId).toBe(ticketId);
    }
  });

  it('the history repository is append-only by construction', () => {
    // No update or delete can exist anywhere: the repository is the only code allowed to touch the
    // model, and it exposes exactly these two methods.
    expect(Object.keys(historyRepository).sort()).toEqual(['append', 'listByTicket']);
  });
});
