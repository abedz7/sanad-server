import type { FilterQuery, SortOrder } from 'mongoose';
import type { Status } from './ticket-status.policy.js';
import { TicketModel, type Priority, type Ticket, type TicketDocument } from './ticket.model.js';
import type { TicketSort } from './tickets.schemas.js';

export interface CreateTicketInput {
  title: string;
  description: string;
  categoryId: string;
  priority: Priority;
  requesterId: string;
}

export interface TicketListQuery {
  page: number;
  limit: number;
  sort: TicketSort;
  status?: Status | undefined;
  priority?: Priority | undefined;
}

export interface AdminTicketListQuery extends TicketListQuery {
  categoryId?: string | undefined;
  assigneeId?: string | undefined;
  requesterId?: string | undefined;
  q?: string | undefined;
  unassigned?: boolean | undefined;
}

// priority sorts by the numeric rank maintained on write (urgent > high > medium > low); _id breaks
// ties so pagination is stable.
const SORTS: Record<TicketSort, Record<string, SortOrder>> = {
  createdAt: { createdAt: 1, _id: 1 },
  '-createdAt': { createdAt: -1, _id: -1 },
  lastActivityAt: { lastActivityAt: 1, _id: 1 },
  '-lastActivityAt': { lastActivityAt: -1, _id: -1 },
  priority: { priorityRank: 1, _id: 1 },
  '-priority': { priorityRank: -1, _id: -1 },
};

const POPULATE = [
  { path: 'categoryId', select: 'name' },
  { path: 'requesterId', select: 'name role' },
  { path: 'assigneeId', select: 'name role' },
  { path: 'attachments.uploadedBy', select: 'name role' },
];

async function runList(
  filter: FilterQuery<Ticket>,
  query: TicketListQuery,
): Promise<{ items: TicketDocument[]; total: number }> {
  const [items, total] = await Promise.all([
    TicketModel.find(filter)
      // Lists never need the (up to 5000-char) description — docs/API.md §4.3 TicketListItem.
      .select('-description')
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate(POPULATE)
      .exec(),
    TicketModel.countDocuments(filter).exec(),
  ]);
  return { items, total };
}

export const ticketsRepository = {
  create(input: CreateTicketInput): Promise<TicketDocument> {
    return TicketModel.create(input);
  },

  // THE ownership rule: every user-facing finder includes requesterId, so a foreign or unknown id
  // is indistinguishable — both come back null and surface as 404 (docs/PLAN.md §6).
  findOwned(id: string, requesterId: string): Promise<TicketDocument | null> {
    return TicketModel.findOne({ _id: id, requesterId }).exec();
  },

  findByIdAdmin(id: string): Promise<TicketDocument | null> {
    return TicketModel.findById(id).exec();
  },

  save(doc: TicketDocument): Promise<TicketDocument> {
    return doc.save();
  },

  // Populates the refs the API shapes need; used right before a document is serialised.
  populate(doc: TicketDocument): Promise<TicketDocument> {
    return doc.populate(POPULATE);
  },

  listOwned(
    requesterId: string,
    query: TicketListQuery,
  ): Promise<{ items: TicketDocument[]; total: number }> {
    const filter: FilterQuery<Ticket> = { requesterId };
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    return runList(filter, query);
  },

  listAdmin(query: AdminTicketListQuery): Promise<{ items: TicketDocument[]; total: number }> {
    const filter: FilterQuery<Ticket> = {};
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.categoryId) filter.categoryId = query.categoryId;
    if (query.requesterId) filter.requesterId = query.requesterId;
    if (query.unassigned) filter.assigneeId = null;
    else if (query.assigneeId) filter.assigneeId = query.assigneeId;
    // $text uses the title+description text index — never a regex built from user input.
    if (query.q) filter.$text = { $search: query.q };
    return runList(filter, query);
  },

  // One atomic counter bump for a new comment; doesn't touch priority, so no hook concerns.
  async recordCommentActivity(ticketId: string): Promise<void> {
    await TicketModel.updateOne(
      { _id: ticketId },
      { $inc: { commentCount: 1 }, $set: { lastActivityAt: new Date() } },
    ).exec();
  },
};
