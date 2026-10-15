import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { Caller } from '../../middleware/auth.js';
import { historyRepository } from '../history/history.repository.js';
import type { TicketDocument } from '../tickets/ticket.model.js';
import { ticketsRepository } from '../tickets/tickets.repository.js';
import type { CommentDocument } from './comment.model.js';
import { commentsRepository } from './comments.repository.js';

interface ListOptions {
  page: number;
  limit: number;
}

// Comments are reachable only through their ticket: owner routes resolve it ownership-scoped
// (missing-or-not-yours → 404), admin routes see everything including internal notes.
async function createOnTicket(
  ticket: TicketDocument,
  caller: Caller,
  text: string,
  isInternal: boolean,
): Promise<CommentDocument> {
  if (ticket.status === 'closed') throw new AppError('TICKET_CLOSED');
  const ticketId = ticket._id.toString();
  const comment = await commentsRepository.create({
    ticketId,
    authorId: caller.id,
    body: text,
    isInternal,
  });
  await ticketsRepository.recordCommentActivity(ticketId);
  try {
    await historyRepository.append({
      ticketId,
      actorId: caller.id,
      type: 'comment_added',
      changes: { commentId: { from: null, to: comment._id.toString() } },
    });
  } catch (err) {
    logger.error(
      { err, requestId: caller.requestId, ticketId },
      'ticket history append failed; comment already committed',
    );
  }
  return comment;
}

export const commentsService = {
  async listForOwner(ticketId: string, caller: Caller, options: ListOptions) {
    const ticket = await ticketsRepository.findOwned(ticketId, caller.id);
    if (!ticket) throw new AppError('NOT_FOUND');
    return commentsRepository.listByTicket(ticketId, { ...options, includeInternal: false });
  },

  async listForAdmin(ticketId: string, options: ListOptions) {
    const ticket = await ticketsRepository.findByIdAdmin(ticketId);
    if (!ticket) throw new AppError('NOT_FOUND');
    return commentsRepository.listByTicket(ticketId, { ...options, includeInternal: true });
  },

  async createForOwner(ticketId: string, caller: Caller, text: string): Promise<CommentDocument> {
    const ticket = await ticketsRepository.findOwned(ticketId, caller.id);
    if (!ticket) throw new AppError('NOT_FOUND');
    return createOnTicket(ticket, caller, text, false);
  },

  async createForAdmin(
    ticketId: string,
    caller: Caller,
    text: string,
    isInternal: boolean,
  ): Promise<CommentDocument> {
    const ticket = await ticketsRepository.findByIdAdmin(ticketId);
    if (!ticket) throw new AppError('NOT_FOUND');
    return createOnTicket(ticket, caller, text, isInternal);
  },
};
