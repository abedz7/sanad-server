import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { operatorGuard } from './middleware/operatorGuard.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { healthRouter } from './routes/health.js';
import { apiRouter } from './routes/index.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Needed for correct client IPs (rate limiting) when deployed behind one reverse proxy. A hop
  // count rather than `true` so a client cannot spoof X-Forwarded-For end to end.
  app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);

  // Order matters: the request id and logger come first so every later failure (CORS, body
  // parsing, rate limiting) is logged and answered with a requestId.
  app.use(helmet());
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.requestId,
      // Health checks are noisy and carry nothing worth keeping.
      autoLogging: { ignore: (req) => req.url === '/health' },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );
  app.use(
    cors({
      // Exact-origin allowlist. A request without an Origin header (curl, same-origin) is allowed
      // through — CORS is a browser control, and the API is protected by tokens, not by CORS.
      origin: (origin, callback) => {
        callback(null, origin === undefined || env.CORS_ORIGINS.includes(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
      maxAge: 600,
    }),
  );
  // Before body parsing so a flood of large bodies is rejected before it is read.
  app.use(globalLimiter);
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));
  app.use(compression());
  app.use(operatorGuard);

  app.use('/health', healthRouter);
  app.use('/api/v1', apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
