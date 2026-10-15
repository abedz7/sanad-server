import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND', { message: 'Route not found' }));
};
