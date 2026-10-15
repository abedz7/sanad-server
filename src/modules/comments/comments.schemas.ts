import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId.js';
import { pageQueryFields } from '../../lib/pagination.js';

const commentBody = z.string().trim().min(1).max(2000);

export const commentParams = {
  params: z.object({ id: objectIdSchema }).strict(),
};

export const listCommentsSchema = {
  params: commentParams.params,
  query: z.object(pageQueryFields).strict(),
};

// docs/API.md §7.3 — owners cannot write internal notes.
export const createCommentSchema = {
  params: commentParams.params,
  body: z.object({ body: commentBody }).strict(),
};

// docs/API.md §7.4.
export const adminCreateCommentSchema = {
  params: commentParams.params,
  body: z.object({ body: commentBody, isInternal: z.boolean().default(false) }).strict(),
};
