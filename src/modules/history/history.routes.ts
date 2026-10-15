import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { ticketIdParams } from '../tickets/tickets.schemas.js';
import { historyController } from './history.controller.js';

// Mounted at /tickets/:id/history and /admin/tickets/:id/history; mergeParams carries :id through.
export const historyOwnerRouter = Router({ mergeParams: true });
historyOwnerRouter.get('/', validate(ticketIdParams), historyController.listForOwner);

export const historyAdminRouter = Router({ mergeParams: true });
historyAdminRouter.get('/', validate(ticketIdParams), historyController.listForAdmin);
