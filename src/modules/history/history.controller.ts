import type { RequestHandler } from 'express';
import { ok } from '../../lib/response.js';
import { callerOf } from '../../middleware/auth.js';
import { validated } from '../../middleware/validate.js';
import { ticketIdParams } from '../tickets/tickets.schemas.js';
import { historyService } from './history.service.js';

export const historyController = {
  listForOwner: (async (req, res) => {
    const { params } = validated(req, ticketIdParams);
    ok(res, await historyService.listForOwner(params.id, callerOf(req)));
  }) satisfies RequestHandler,

  listForAdmin: (async (req, res) => {
    const { params } = validated(req, ticketIdParams);
    ok(res, await historyService.listForAdmin(params.id));
  }) satisfies RequestHandler,
};
