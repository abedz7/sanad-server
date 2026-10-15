import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError, type ErrorDetail } from '../lib/errors.js';

export interface ValidationSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

type Validated<S extends ValidationSchemas> = {
  [K in keyof ValidationSchemas]-?: S[K] extends z.ZodType ? z.output<S[K]> : undefined;
};

const PARTS = ['body', 'query', 'params'] as const;

// Express 5 exposes `req.query` as a getter, so parsed (coerced, defaulted) values cannot be written
// back onto it. They are stored on `req.validated` instead; controllers read them through
// `validated(req, schemas)` so they get the inferred types without re-parsing or casting.
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const details: ErrorDetail[] = [];
    const out: Record<string, unknown> = { body: undefined, query: undefined, params: undefined };

    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      // An absent JSON body arrives as `undefined`; validate it as an empty object so a schema with
      // only optional keys passes and a required key reports a clean "Required" error.
      // req.body is typed `any` by Express; widen to unknown so nothing downstream trusts it.
      const raw: unknown = req[part];
      const input = part === 'body' && raw === undefined ? {} : raw;
      const result = schema.safeParse(input);
      if (result.success) {
        out[part] = result.data;
        continue;
      }
      for (const issue of result.error.issues) {
        details.push({ path: [part, ...issue.path.map(String)].join('.'), message: issue.message });
      }
    }

    if (details.length > 0) {
      next(new AppError('VALIDATION_FAILED', { details }));
      return;
    }
    req.validated = out as Request['validated'];
    next();
  };
}

export function validated<S extends ValidationSchemas>(req: Request, _schemas: S): Validated<S> {
  // The cast is safe by construction: `validate(schemas)` ran earlier on this route with the same
  // schema object, so each part holds that schema's parsed output.
  return req.validated as Validated<S>;
}
