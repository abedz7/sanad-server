import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId.js';
import { pageQueryFields } from '../../lib/pagination.js';
import { STATUSES } from './ticket-status.policy.js';
import { PRIORITIES } from './ticket.model.js';

// docs/API.md §6 sort whitelist; mapped to concrete sort objects in the repository.
export const TICKET_SORTS = [
  'createdAt',
  '-createdAt',
  'lastActivityAt',
  '-lastActivityAt',
  'priority',
  '-priority',
] as const;
export type TicketSort = (typeof TICKET_SORTS)[number];

const title = z.string().trim().min(3).max(120);
const description = z.string().trim().min(1).max(5000);

export const ticketIdParams = {
  params: z.object({ id: objectIdSchema }).strict(),
};

// docs/API.md §7.3 POST /tickets
export const createTicketSchema = {
  body: z
    .object({
      title,
      description,
      categoryId: objectIdSchema,
      priority: z.enum(PRIORITIES).default('medium'),
    })
    .strict(),
};

const listQueryFields = {
  ...pageQueryFields,
  sort: z.enum(TICKET_SORTS).default('-lastActivityAt'),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
};

// docs/API.md §7.3 GET /tickets — strict, so admin-only filters like requesterId are rejected here.
export const listOwnTicketsSchema = {
  query: z.object(listQueryFields).strict(),
};

// docs/API.md §7.4 GET /admin/tickets
export const adminListTicketsSchema = {
  query: z
    .object({
      ...listQueryFields,
      categoryId: objectIdSchema.optional(),
      assigneeId: objectIdSchema.optional(),
      requesterId: objectIdSchema.optional(),
      q: z.string().trim().min(1).max(100).optional(),
      unassigned: z
        .enum(['true'])
        .transform(() => true)
        .optional(),
    })
    .strict(),
};

// docs/API.md §7.3 PATCH /tickets/:id — owner, only while open.
export const updateTicketSchema = {
  params: ticketIdParams.params,
  body: z
    .object({ title: title.optional(), description: description.optional() })
    .strict()
    .refine((value) => Object.keys(value).length > 0, { message: 'At least one key is required' }),
};

// Shared by the owner and admin status routes; the actor decides which matrix column applies.
export const changeStatusSchema = {
  params: ticketIdParams.params,
  body: z.object({ status: z.enum(STATUSES) }).strict(),
};

// docs/API.md §7.4 PATCH /admin/tickets/:id
export const adminPatchTicketSchema = {
  params: ticketIdParams.params,
  body: z
    .object({
      priority: z.enum(PRIORITIES).optional(),
      assigneeId: objectIdSchema.nullable().optional(),
      categoryId: objectIdSchema.optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, { message: 'At least one key is required' }),
};
