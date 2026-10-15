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

const STATS = '/api/v1/admin/stats';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface StatsBody {
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  openAge: { count: number; averageHours: number; maxHours: number; oldestTicketId: string | null };
  createdLast7Days: number;
  total: number;
}

let admin: TestUser;
let adminToken: string;
let requesterId: string;

beforeEach(async () => {
  admin = await createUser({ role: 'admin' });
  adminToken = (await loginAs(admin, 'mobile')).accessToken;
  requesterId = (await createUser()).id;
});

async function seedTicket(status: string, priority: string, ageMs: number): Promise<string> {
  const category = await CategoryModel.findOne().exec();
  const doc = await TicketModel.create({
    title: `${status} ${priority} fixture`,
    description: 'stats fixture',
    categoryId: category?._id ?? (await CategoryModel.create({ name: 'Stats' }))._id,
    priority,
    status,
    requesterId,
  });
  // createdAt is immutable to mongoose (timestamps), so backdate via the native driver.
  await TicketModel.collection.updateOne(
    { _id: doc._id },
    { $set: { createdAt: new Date(Date.now() - ageMs) } },
  );
  return doc._id.toString();
}

describe('GET /api/v1/admin/stats', () => {
  it('returns zeros and a null oldest ticket on an empty system', async () => {
    const res = await request(app).get(STATS).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(body<Envelope<StatsBody>>(res).data).toEqual({
      byStatus: { open: 0, in_progress: 0, resolved: 0, closed: 0 },
      byPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
      openAge: { count: 0, averageHours: 0, maxHours: 0, oldestTicketId: null },
      createdLast7Days: 0,
      total: 0,
    });
  });

  it('computes exact counts and open-age figures for a known fixture set', async () => {
    await seedTicket('open', 'high', 10 * HOUR);
    const oldest = await seedTicket('in_progress', 'low', 20 * HOUR);
    await seedTicket('resolved', 'medium', 30 * HOUR);
    await seedTicket('closed', 'urgent', 8 * DAY); // outside the 7-day window
    await seedTicket('closed', 'urgent', 1 * DAY);

    const res = await request(app).get(STATS).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const stats = body<Envelope<StatsBody>>(res).data;

    expect(stats.byStatus).toEqual({ open: 1, in_progress: 1, resolved: 1, closed: 2 });
    expect(stats.byPriority).toEqual({ low: 1, medium: 1, high: 1, urgent: 2 });
    expect(stats.total).toBe(5);
    expect(stats.createdLast7Days).toBe(4);

    // openAge covers open + in_progress only, measured from createdAt (docs/API.md §7.4).
    expect(stats.openAge.count).toBe(2);
    expect(stats.openAge.oldestTicketId).toBe(oldest);
    expect(stats.openAge.averageHours).toBeCloseTo(15, 1);
    expect(stats.openAge.maxHours).toBeCloseTo(20, 1);
  });

  it('is admin-only and strict about query keys', async () => {
    const user = await createUser();
    const { accessToken } = await loginAs(user, 'mobile');
    const forbidden = await request(app).get(STATS).set('Authorization', `Bearer ${accessToken}`);
    expect(forbidden.status).toBe(403);
    expect(body<ErrorEnvelope>(forbidden).error.code).toBe('FORBIDDEN');

    const unknownKey = await request(app)
      .get(`${STATS}?from=yesterday`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(unknownKey.status).toBe(400);
  });
});
