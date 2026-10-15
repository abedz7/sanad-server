import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { commentsAdminRouter } from '../comments/comments.routes.js';
import { historyAdminRouter } from '../history/history.routes.js';
import { adminTicketsController } from './tickets.controller.js';
import {
  adminListTicketsSchema,
  adminPatchTicketSchema,
  changeStatusSchema,
  ticketIdParams,
} from './tickets.schemas.js';

// Mounted under /api/v1/admin, which already enforces requireAuth + requireRole('admin').
export const adminTicketsRouter = Router();

adminTicketsRouter.get('/', validate(adminListTicketsSchema), adminTicketsController.list);
adminTicketsRouter.get('/:id', validate(ticketIdParams), adminTicketsController.get);
adminTicketsRouter.patch('/:id', validate(adminPatchTicketSchema), adminTicketsController.patch);
adminTicketsRouter.post(
  '/:id/status',
  validate(changeStatusSchema),
  adminTicketsController.changeStatus,
);
adminTicketsRouter.use('/:id/history', historyAdminRouter);
adminTicketsRouter.use('/:id/comments', commentsAdminRouter);
