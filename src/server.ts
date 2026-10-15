import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './db.js';
import { logger } from './lib/logger.js';

const SHUTDOWN_GRACE_MS = 10_000;

async function main(): Promise<void> {
  await connectDb();
  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'http server listening');
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    // Stop accepting connections, let in-flight requests finish, then close the pool. A hard
    // deadline guarantees the process exits even if a connection refuses to drain.
    const deadline = setTimeout(() => {
      logger.warn('forced exit after grace period');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    deadline.unref();
    server.close(() => {
      disconnectDb()
        .then(() => process.exit(0))
        .catch((err: unknown) => {
          logger.error({ err }, 'error during shutdown');
          process.exit(1);
        });
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
