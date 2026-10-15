import {
  TicketEventModel,
  type EventChanges,
  type TicketEventDocument,
  type TicketEventType,
} from './ticket-event.model.js';

export interface AppendEventInput {
  ticketId: string;
  actorId: string;
  type: TicketEventType;
  changes: EventChanges;
}

const HISTORY_CAP = 500;

// Deliberately only two methods: the audit log has no update or delete path anywhere in the
// codebase (docs/PLAN.md §4.6). Tests assert exactly this export surface.
export const historyRepository = {
  append(input: AppendEventInput): Promise<TicketEventDocument> {
    return TicketEventModel.create(input);
  },

  // Oldest first, _id as tiebreak because consecutive events often share a millisecond.
  listByTicket(ticketId: string): Promise<TicketEventDocument[]> {
    return TicketEventModel.find({ ticketId })
      .sort({ createdAt: 1, _id: 1 })
      .limit(HISTORY_CAP)
      .populate({ path: 'actorId', select: 'name role' })
      .exec();
  },
};
