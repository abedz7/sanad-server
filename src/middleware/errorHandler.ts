import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError, type ErrorCode, type ErrorDetail } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: ErrorDetail[]; requestId: string };
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  // docs/API.md §2 UPLOAD_REJECTED: 413 for size, 400 for a malformed multipart shape
  // (extra files, wrong field name); type checks (415) are raised by the attachments service.
  if (err instanceof MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return new AppError('UPLOAD_REJECTED', {
      status: tooLarge ? 413 : 400,
      details: [{ path: 'file', message: tooLarge ? 'File exceeds the size limit' : err.message }],
    });
  }
  if (err instanceof ZodError) {
    return new AppError('VALIDATION_FAILED', {
      details: err.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }
  // body-parser rejects malformed JSON and oversized bodies with its own error objects; map the
  // documented ones so a client gets a 400/413 rather than a misleading 500.
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const { type } = err;
    if (type === 'entity.parse.failed') {
      return new AppError('VALIDATION_FAILED', {
        details: [{ path: 'body', message: 'Malformed JSON body' }],
      });
    }
    if (type === 'entity.too.large') {
      return new AppError('VALIDATION_FAILED', {
        status: 413,
        details: [{ path: 'body', message: 'Body too large' }],
      });
    }
  }
  return new AppError('INTERNAL');
}

// One response shape for every failure (docs/API.md §1). Stack traces go to the log only — never to
// the client, in any environment — so there is exactly one code path to audit.
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const appError = toAppError(err);
  const requestId = req.requestId;

  if (appError.code === 'INTERNAL') {
    logger.error({ err, requestId, method: req.method, url: req.originalUrl }, 'unhandled error');
  } else if (appError.status >= 500) {
    logger.error({ err: appError, requestId }, appError.message);
  }

  const body: ErrorBody = {
    error: { code: appError.code, message: appError.message, requestId },
  };
  // `details` is contractually present only for VALIDATION_FAILED and UPLOAD_REJECTED.
  if (
    appError.details &&
    (appError.code === 'VALIDATION_FAILED' || appError.code === 'UPLOAD_REJECTED')
  ) {
    body.error.details = appError.details;
  }

  if (res.headersSent) {
    // Express has already streamed part of a response; nothing sane can be sent now.
    res.end();
    return;
  }
  res.status(appError.status).json(body);
};
