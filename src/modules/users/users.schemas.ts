import { z } from 'zod';
import { pageQueryFields } from '../../lib/pagination.js';
import { ROLES } from './user.model.js';

// docs/API.md §7.4 GET /admin/users
export const listUsersSchema = {
  query: z.object({ ...pageQueryFields, role: z.enum(ROLES).optional() }).strict(),
};
