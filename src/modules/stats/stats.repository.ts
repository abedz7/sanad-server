import { TicketModel } from '../tickets/ticket.model.js';

export interface RawStats {
  byStatus: { _id: string; count: number }[];
  byPriority: { _id: string; count: number }[];
  openAge: {
    count: number;
    averageMs: number;
    maxMs: number;
    // An ObjectId; typed by its one used capability so the service can stringify it safely.
    oldestTicketId: { toString(): string };
  }[];
  createdLast7Days: { count: number }[];
  total: { count: number }[];
}

// One pipeline, one collection pass: $facet computes every dashboard figure at once. Each facet
// $matches on indexed fields first; `now` is computed once so every age uses the same clock.
export const statsRepository = {
  async collect(now: Date): Promise<RawStats | undefined> {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [result] = await TicketModel.aggregate<RawStats>([
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          byPriority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
          openAge: [
            { $match: { status: { $in: ['open', 'in_progress'] } } },
            { $sort: { createdAt: 1 } },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                averageMs: { $avg: { $subtract: [now, '$createdAt'] } },
                maxMs: { $max: { $subtract: [now, '$createdAt'] } },
                // Sorted ascending by createdAt, so $first is the oldest open ticket.
                oldestTicketId: { $first: '$_id' },
              },
            },
          ],
          createdLast7Days: [
            { $match: { createdAt: { $gte: sevenDaysAgo } } },
            { $count: 'count' },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]).exec();
    return result;
  },
};
