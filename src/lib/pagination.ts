import { z } from 'zod';

export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 100;

// docs/API.md §6. Query values arrive as strings, hence coerce. The cap is enforced here, at the
// boundary, so no repository can be asked for an unbounded page.
export const pageQueryFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
};
