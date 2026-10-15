import type { RequestHandler } from 'express';
import { buildMeta, ok } from '../../lib/response.js';
import { callerOf } from '../../middleware/auth.js';
import { validated } from '../../middleware/validate.js';
import { toTicketListItem } from './ticket.model.js';
import {
  adminListTicketsSchema,
  adminPatchTicketSchema,
  changeStatusSchema,
  createTicketSchema,
  listOwnTicketsSchema,
  ticketIdParams,
  updateTicketSchema,
} from './tickets.schemas.js';
import { ticketsService } from './tickets.service.js';

export const ticketsController = {
  create: (async (req, res) => {
    const { body } = validated(req, createTicketSchema);
    ok(res, await ticketsService.create(body, callerOf(req)), undefined, 201);
  }) satisfies RequestHandler,

  list: (async (req, res) => {
    const { query } = validated(req, listOwnTicketsSchema);
    const { items, total } = await ticketsService.listOwned(callerOf(req), query);
    ok(res, items.map(toTicketListItem), buildMeta(query.page, query.limit, total));
  }) satisfies RequestHandler,

  get: (async (req, res) => {
    const { params } = validated(req, ticketIdParams);
    ok(res, await ticketsService.getOwned(params.id, callerOf(req)));
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const { params, body } = validated(req, updateTicketSchema);
    ok(res, await ticketsService.updateOwned(params.id, body, callerOf(req)));
  }) satisfies RequestHandler,

  changeStatus: (async (req, res) => {
    const { params, body } = validated(req, changeStatusSchema);
    ok(res, await ticketsService.changeStatus(params.id, body.status, 'requester', callerOf(req)));
  }) satisfies RequestHandler,
};

export const adminTicketsController = {
  list: (async (req, res) => {
    const { query } = validated(req, adminListTicketsSchema);
    const { items, total } = await ticketsService.listAdmin(query);
    ok(res, items.map(toTicketListItem), buildMeta(query.page, query.limit, total));
  }) satisfies RequestHandler,

  get: (async (req, res) => {
    const { params } = validated(req, ticketIdParams);
    ok(res, await ticketsService.getAdmin(params.id));
  }) satisfies RequestHandler,

  patch: (async (req, res) => {
    const { params, body } = validated(req, adminPatchTicketSchema);
    ok(res, await ticketsService.adminPatch(params.id, body, callerOf(req)));
  }) satisfies RequestHandler,

  changeStatus: (async (req, res) => {
    const { params, body } = validated(req, changeStatusSchema);
    ok(res, await ticketsService.changeStatus(params.id, body.status, 'admin', callerOf(req)));
  }) satisfies RequestHandler,
};
