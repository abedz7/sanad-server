import type { RequestHandler } from 'express';
import { buildMeta, ok } from '../../lib/response.js';
import { validated } from '../../middleware/validate.js';
import { userRepository } from './user.repository.js';
import { listUsersSchema } from './users.schemas.js';

export const adminUsersController = {
  list: (async (req, res) => {
    const { query } = validated(req, listUsersSchema);
    const filter = query.role ? { role: query.role } : {};
    const { items, total } = await userRepository.listPaginated(filter, query.page, query.limit);
    ok(res, items, buildMeta(query.page, query.limit, total));
  }) satisfies RequestHandler,
};
