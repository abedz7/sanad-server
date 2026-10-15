import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { historyOwnerRouter } from '../history/history.routes.js';
import { ticketsController } from './tickets.controller.js';
import {
  changeStatusSchema,
  createTicketSchema,
  listOwnTicketsSchema,
  ticketIdParams,
  updateTicketSchema,
} from './tickets.schemas.js';

// Mounted at /api/v1/tickets behind requireAuth + the per-user mutating limiter (src/routes/index.ts).
// Every handler below resolves the ticket through an ownership-scoped finder.
export const ticketsRouter = Router();

ticketsRouter.post('/', validate(createTicketSchema), ticketsController.create);
ticketsRouter.get('/', validate(listOwnTicketsSchema), ticketsController.list);
ticketsRouter.get('/:id', validate(ticketIdParams), ticketsController.get);
ticketsRouter.patch('/:id', validate(updateTicketSchema), ticketsController.update);
ticketsRouter.post('/:id/status', validate(changeStatusSchema), ticketsController.changeStatus);
ticketsRouter.use('/:id/history', historyOwnerRouter);
