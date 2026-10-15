import { STATUSES } from '../tickets/ticket-status.policy.js';
import { PRIORITIES } from '../tickets/ticket.model.js';
import { statsRepository } from './stats.repository.js';

// Exactly the docs/API.md §7.4 /admin/stats shape.
export interface AdminStats {
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  openAge: {
    count: number;
    averageHours: number;
    maxHours: number;
    oldestTicketId: string | null;
  };
  createdLast7Days: number;
  total: number;
}

// Milliseconds → hours with one decimal (docs/API.md §7.4 example shape).
function toHours(ms: number): number {
  return Number((ms / 3_600_000).toFixed(1));
}

function zeroFilled(keys: readonly string[], rows: { _id: string; count: number }[]) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

export const statsService = {
  async collect(): Promise<AdminStats> {
    const raw = await statsRepository.collect(new Date());
    const openAge = raw?.openAge[0];
    return {
      byStatus: zeroFilled(STATUSES, raw?.byStatus ?? []),
      byPriority: zeroFilled(PRIORITIES, raw?.byPriority ?? []),
      openAge: {
        count: openAge?.count ?? 0,
        averageHours: openAge ? toHours(openAge.averageMs) : 0,
        maxHours: openAge ? toHours(openAge.maxMs) : 0,
        oldestTicketId: openAge ? String(openAge.oldestTicketId) : null,
      },
      createdLast7Days: raw?.createdLast7Days[0]?.count ?? 0,
      total: raw?.total[0]?.count ?? 0,
    };
  },
};
