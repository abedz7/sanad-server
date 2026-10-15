import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

// Defence in depth against operator injection ({ "$gt": "" }, { "a.b": ... }). zod `.strict()`
// schemas already reject unknown keys, but this runs before any route so a forgotten schema or a
// future `req.params` cannot leak an operator into a query. Only object keys are inspected; string
// values that merely contain "$" (passwords, descriptions) are fine.
const MAX_DEPTH = 32;

// Returns the dotted path of the first offending key, or null.
function findBadKey(value: unknown, path: string, depth = 0): string | null {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const bad = findBadKey(item, `${path}[${index}]`, depth + 1);
      if (bad) return bad;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) return `${path}.${key}`;
    const bad = findBadKey(nested, `${path}.${key}`, depth + 1);
    if (bad) return bad;
  }
  return null;
}

export const operatorGuard: RequestHandler = (req, _res, next) => {
  for (const part of ['body', 'query', 'params'] as const) {
    const bad = findBadKey(req[part], part);
    if (bad !== null) {
      next(
        new AppError('VALIDATION_FAILED', {
          details: [
            {
              path: bad,
              message: 'Keys starting with "$" or containing "." are not allowed',
            },
          ],
        }),
      );
      return;
    }
  }
  next();
};
