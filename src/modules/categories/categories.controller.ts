import type { RequestHandler } from 'express';
import { ok } from '../../lib/response.js';
import { validated } from '../../middleware/validate.js';
import {
  adminListCategoriesSchema,
  categoryIdParams,
  createCategorySchema,
  updateCategorySchema,
} from './categories.schemas.js';
import { categoriesService } from './categories.service.js';

export const categoriesController = {
  // GET /categories — active only, sorted by name, no pagination (docs/API.md §7.2).
  list: (async (_req, res) => {
    ok(res, await categoriesService.listActive());
  }) satisfies RequestHandler,
};

export const adminCategoriesController = {
  list: (async (req, res) => {
    const { query } = validated(req, adminListCategoriesSchema);
    ok(res, await categoriesService.listAdmin(query.includeDeleted ?? false));
  }) satisfies RequestHandler,

  create: (async (req, res) => {
    const { body } = validated(req, createCategorySchema);
    ok(res, await categoriesService.create(body), undefined, 201);
  }) satisfies RequestHandler,

  update: (async (req, res) => {
    const { params, body } = validated(req, updateCategorySchema);
    ok(res, await categoriesService.update(params.id, body));
  }) satisfies RequestHandler,

  remove: (async (req, res) => {
    const { params } = validated(req, { params: categoryIdParams.params });
    await categoriesService.softDelete(params.id);
    res.status(204).end();
  }) satisfies RequestHandler,
};
