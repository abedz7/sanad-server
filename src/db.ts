import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

// Fail fast on a bad URI instead of buffering queries forever: Mongoose's default is to queue
// operations until a connection appears, which turns a config mistake into silent timeouts.
mongoose.set('bufferCommands', false);
// Reject query filters with unknown fields instead of silently matching everything.
mongoose.set('strictQuery', true);

export async function connectDb(uri: string = env.MONGODB_URI): Promise<void> {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: 10,
  });
  // Index builds must be explicit here: models are compiled at import time, before this connect,
  // and Mongoose runs `Model.init()` during compilation. With `bufferCommands: false` that init
  // fails instantly (no connection yet) and its rejection is cached on the model, so Mongoose's
  // automatic index build on connect silently does nothing. Without this line a fresh database gets
  // no unique index on users.email (duplicate registrations would succeed) and no TTL index on
  // refresh_tokens. Failing loudly at boot is intended — running without these indexes is unsafe.
  await Promise.all(
    Object.values(mongoose.connection.models).map((model) => model.createIndexes()),
  );
  logger.info('mongodb connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  logger.info('mongodb disconnected');
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
