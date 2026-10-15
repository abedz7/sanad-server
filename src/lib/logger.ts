import pino from 'pino';
import { env } from '../config/env.js';

// Secrets and personal data must never reach log storage, even at debug level. Paths cover the
// request/response objects pino-http serialises plus any object we log directly.
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'token',
  '*.token',
  'refreshToken',
  '*.refreshToken',
  'accessToken',
  '*.accessToken',
  'email',
  '*.email',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  base: { service: 'sanad-server' },
  // Human-readable output only while developing; production emits JSON lines for log shippers.
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
