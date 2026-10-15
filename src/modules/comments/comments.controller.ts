import type { RequestHandler } from 'express';
import { buildMeta, ok } from '../../lib/response.js';
import { callerOf } from '../../middleware/auth.js';
import { validated } from '../../middleware/validate.js';
import {
  adminCreateCommentSchema,
  createCommentSchema,
  listCommentsSchema,
} from './comments.schemas.js';
import { commentsService } from './comments.service.js';

export const commentsController = {
  listForOwner: (async (req, res) => {
    const { params, query } = validated(req, listCommentsSchema);
    const { items, total } = await commentsService.listForOwner(params.id, callerOf(req), query);
    ok(res, items, buildMeta(query.page, query.limit, total));
  }) satisfies RequestHandler,

  createForOwner: (async (req, res) => {
    const { params, body } = validated(req, createCommentSchema);
    ok(
      res,
      await commentsService.createForOwner(params.id, callerOf(req), body.body),
      undefined,
      201,
    );
  }) satisfies RequestHandler,

  listForAdmin: (async (req, res) => {
    const { params, query } = validated(req, listCommentsSchema);
    const { items, total } = await commentsService.listForAdmin(params.id, query);
    ok(res, items, buildMeta(query.page, query.limit, total));
  }) satisfies RequestHandler,

  createForAdmin: (async (req, res) => {
    const { params, body } = validated(req, adminCreateCommentSchema);
    const comment = await commentsService.createForAdmin(
      params.id,
      callerOf(req),
      body.body,
      body.isInternal,
    );
    ok(res, comment, undefined, 201);
  }) satisfies RequestHandler,
};
