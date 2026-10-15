import { z } from 'zod';

// Validated before any query is built so a malformed id never reaches Mongoose (which would throw a
// CastError and leak the fact through a 500 instead of a clean 400/404).
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex id');
