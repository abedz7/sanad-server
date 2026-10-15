import { Router } from 'express';
import { isDbConnected } from '../db.js';
import { ok } from '../lib/response.js';

// docs/API.md §7.5 — outside /api/v1, unauthenticated, no rate-limit exemption needed.
export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const connected = isDbConnected();
  ok(
    res,
    {
      status: connected ? 'ok' : 'degraded',
      uptime: Number(process.uptime().toFixed(1)),
      db: connected ? 'connected' : 'disconnected',
    },
    undefined,
    connected ? 200 : 503,
  );
});
