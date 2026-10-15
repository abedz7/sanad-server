import { AppError } from '../../lib/errors.js';
import type { Caller } from '../../middleware/auth.js';
import { ticketsRepository } from '../tickets/tickets.repository.js';
import { historyRepository } from './history.repository.js';
import type { TicketEventDocument } from './ticket-event.model.js';

// Events are only reachable through their ticket, so visibility is exactly the ticket's:
// owner-scoped lookup for users (missing-or-not-yours → 404), plain lookup for admins.
export const historyService = {
  async listForOwner(ticketId: string, caller: Caller): Promise<TicketEventDocument[]> {
    const ticket = await ticketsRepository.findOwned(ticketId, caller.id);
    if (!ticket) throw new AppError('NOT_FOUND');
    return historyRepository.listByTicket(ticketId);
  },

  async listForAdmin(ticketId: string): Promise<TicketEventDocument[]> {
    const ticket = await ticketsRepository.findByIdAdmin(ticketId);
    if (!ticket) throw new AppError('NOT_FOUND');
    return historyRepository.listByTicket(ticketId);
  },
};
