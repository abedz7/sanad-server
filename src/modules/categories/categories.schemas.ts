import { z } from 'zod';
import { objectIdSchema } from '../../lib/objectId.js';

const name = z.string().trim().min(1).max(60);
const description = z.string().trim().max(300);

export const categoryIdParams = {
  params: z.object({ id: objectIdSchema }).strict(),
};

// docs/API.md §7.2
export const createCategorySchema = {
  body: z.object({ name, description: description.optional() }).strict(),
};

export const updateCategorySchema = {
  params: categoryIdParams.params,
  body: z
    .object({ name: name.optional(), description: description.optional() })
    .strict()
    .refine((value) => Object.keys(value).length > 0, { message: 'At least one key is required' }),
};

export const adminListCategoriesSchema = {
  query: z
    .object({
      includeDeleted: z
        .enum(['true'])
        .transform(() => true)
        .optional(),
    })
    .strict(),
};
