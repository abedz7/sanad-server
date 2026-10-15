import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { Caller } from '../../middleware/auth.js';
import { categoriesRepository } from '../categories/categories.repository.js';
import { historyRepository, type AppendEventInput } from '../history/history.repository.js';
import { userRepository } from '../users/user.repository.js';
import { canTransition, type Status, type StatusActor } from './ticket-status.policy.js';
import type { Priority, TicketDocument } from './ticket.model.js';
import {
  ticketsRepository,
  type AdminTicketListQuery,
  type TicketListQuery,
} from './tickets.repository.js';

export interface CreateTicketData {
  title: string;
  description: string;
  categoryId: string;
  priority: Priority;
}

export interface AdminPatchData {
  priority?: Priority | undefined;
  assigneeId?: string | null | undefined;
  categoryId?: string | undefined;
}

// The audit append happens after the primary write, without a transaction (docs/PLAN.md D3):
// a replica set would be needed for multi-document transactions and would break "runs in under
// 10 minutes". If the append fails the request still succeeds; the gap is logged with enough
// context to reconstruct the event by hand.
async function appendEvent(input: AppendEventInput, requestId: string): Promise<void> {
  try {
    await historyRepository.append(input);
  } catch (err) {
    logger.error(
      { err, requestId, ticketId: input.ticketId, type: input.type },
      'ticket history append failed; primary write already committed',
    );
  }
}

async function requireActiveCategory(categoryId: string): Promise<void> {
  if (!(await categoriesRepository.findActiveById(categoryId))) {
    throw new AppError('CATEGORY_UNAVAILABLE');
  }
}

export const ticketsService = {
  async create(data: CreateTicketData, caller: Caller): Promise<TicketDocument> {
    await requireActiveCategory(data.categoryId);
    const ticket = await ticketsRepository.create({ ...data, requesterId: caller.id });
    await appendEvent(
      {
        ticketId: ticket._id.toString(),
        actorId: caller.id,
        type: 'created',
        changes: { status: { from: null, to: ticket.status } },
      },
      caller.requestId,
    );
    return ticketsRepository.populate(ticket);
  },

  async getOwned(id: string, caller: Caller): Promise<TicketDocument> {
    const ticket = await ticketsRepository.findOwned(id, caller.id);
    if (!ticket) throw new AppError('NOT_FOUND');
    return ticketsRepository.populate(ticket);
  },

  async getAdmin(id: string): Promise<TicketDocument> {
    const ticket = await ticketsRepository.findByIdAdmin(id);
    if (!ticket) throw new AppError('NOT_FOUND');
    return ticketsRepository.populate(ticket);
  },

  listOwned(caller: Caller, query: TicketListQuery) {
    return ticketsRepository.listOwned(caller.id, query);
  },

  listAdmin(query: AdminTicketListQuery) {
    return ticketsRepository.listAdmin(query);
  },

  // Owner edit of title/description, only while open (docs/API.md §7.3).
  async updateOwned(
    id: string,
    patch: { title?: string | undefined; description?: string | undefined },
    caller: Caller,
  ): Promise<TicketDocument> {
    const ticket = await ticketsRepository.findOwned(id, caller.id);
    if (!ticket) throw new AppError('NOT_FOUND');
    if (ticket.status !== 'open') throw new AppError('TICKET_NOT_EDITABLE');

    const changes: AppendEventInput['changes'] = {};
    if (patch.title !== undefined && patch.title !== ticket.title) {
      changes['title'] = { from: ticket.title, to: patch.title };
      ticket.title = patch.title;
    }
    if (patch.description !== undefined && patch.description !== ticket.description) {
      changes['description'] = { from: ticket.description, to: patch.description };
      ticket.description = patch.description;
    }
    if (Object.keys(changes).length > 0) {
      await ticketsRepository.save(ticket);
      await appendEvent(
        { ticketId: id, actorId: caller.id, type: 'updated', changes },
        caller.requestId,
      );
    }
    return ticketsRepository.populate(ticket);
  },

  // One method for both routes; the route decides the actor and therefore the matrix column and
  // the visibility scope (owner lookup vs admin lookup).
  async changeStatus(
    id: string,
    to: Status,
    actor: StatusActor,
    caller: Caller,
  ): Promise<TicketDocument> {
    const ticket =
      actor === 'admin'
        ? await ticketsRepository.findByIdAdmin(id)
        : await ticketsRepository.findOwned(id, caller.id);
    if (!ticket) throw new AppError('NOT_FOUND');

    const from = ticket.status;
    if (!canTransition(from, to, actor, ticket.closedAt)) {
      throw new AppError('TICKET_INVALID_TRANSITION');
    }

    const now = new Date();
    ticket.status = to;
    // docs/API.md §5: resolvedAt set entering resolved, closedAt entering closed, both cleared on
    // reopen. Entering in_progress also clears resolvedAt (work restarted after resolved).
    if (to === 'resolved') ticket.resolvedAt = now;
    if (to === 'closed') ticket.closedAt = now;
    if (to === 'open') {
      ticket.resolvedAt = null;
      ticket.closedAt = null;
    }
    if (to === 'in_progress') ticket.resolvedAt = null;
    ticket.lastActivityAt = now;

    await ticketsRepository.save(ticket);
    await appendEvent(
      {
        ticketId: id,
        actorId: caller.id,
        type: 'status_changed',
        changes: { status: { from, to } },
      },
      caller.requestId,
    );
    return ticketsRepository.populate(ticket);
  },

  // Admin edit of priority / assignee / category (docs/API.md §7.4).
  async adminPatch(id: string, patch: AdminPatchData, caller: Caller): Promise<TicketDocument> {
    const ticket = await ticketsRepository.findByIdAdmin(id);
    if (!ticket) throw new AppError('NOT_FOUND');
    if (ticket.status === 'closed') throw new AppError('TICKET_CLOSED');

    const events: AppendEventInput[] = [];

    if (patch.priority !== undefined && patch.priority !== ticket.priority) {
      events.push({
        ticketId: id,
        actorId: caller.id,
        type: 'priority_changed',
        changes: { priority: { from: ticket.priority, to: patch.priority } },
      });
      ticket.priority = patch.priority;
    }

    if (patch.assigneeId !== undefined) {
      if (patch.assigneeId !== null) {
        const assignee = await userRepository.findById(patch.assigneeId);
        if (!assignee || assignee.deletedAt || assignee.role !== 'admin') {
          throw new AppError('VALIDATION_FAILED', {
            details: [{ path: 'body.assigneeId', message: 'Assignee must be an admin' }],
          });
        }
      }
      const fromId = ticket.assigneeId?.toString() ?? null;
      if (fromId !== patch.assigneeId) {
        events.push({
          ticketId: id,
          actorId: caller.id,
          type: 'assigned',
          changes: { assigneeId: { from: fromId, to: patch.assigneeId } },
        });
        ticket.set('assigneeId', patch.assigneeId);
      }
    }

    if (patch.categoryId !== undefined && patch.categoryId !== ticket.categoryId.toString()) {
      await requireActiveCategory(patch.categoryId);
      events.push({
        ticketId: id,
        actorId: caller.id,
        type: 'updated',
        changes: { categoryId: { from: ticket.categoryId.toString(), to: patch.categoryId } },
      });
      ticket.set('categoryId', patch.categoryId);
    }

    if (events.length > 0) {
      await ticketsRepository.save(ticket);
      for (const event of events) await appendEvent(event, caller.requestId);
    }
    return ticketsRepository.populate(ticket);
  },
};
