import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Accept a client-supplied id so a caller can correlate its own logs with ours, but only when it is
// short and made of safe characters — otherwise it is a log-injection vector. Anything else gets a
// fresh UUID.
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get(REQUEST_ID_HEADER);
  const id = incoming !== undefined && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
};
