import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ok } from '../../lib/response.js';
import { validated } from '../../middleware/validate.js';
import { statsService } from './stats.service.js';

export const statsQuerySchema = {
  // No parameters exist on this endpoint; strict-reject anything a client invents.
  query: z.object({}).strict(),
};

export const statsController = {
  get: (async (req, res) => {
    validated(req, statsQuerySchema);
    ok(res, await statsService.collect());
  }) satisfies RequestHandler,
};
