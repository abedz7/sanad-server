import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Imported before anything from src/ (ESM evaluates imports in order, and this module only imports
// node built-ins), so src/config/env.ts validates these values instead of a developer's .env.
// Every value here is a test-only placeholder; production values are never used in tests.
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'silent';
// Never connected to: tests connect explicitly to a mongodb-memory-server URI (tests/setup.ts).
process.env['MONGODB_URI'] = 'mongodb://127.0.0.1:27017/sanad-test-placeholder';
// 48 characters, obviously fake. The env schema only requires length >= 32.
process.env['JWT_ACCESS_SECRET'] = 'insecure-test-only-jwt-secret-0123456789abcdef!!';
process.env['ACCESS_TOKEN_TTL'] = '15m';
process.env['REFRESH_TOKEN_TTL_DAYS'] = '30';
process.env['COOKIE_SECURE'] = 'false';
process.env['CORS_ORIGINS'] = 'http://localhost:5173';
// Per-worker upload dir in the OS temp area so test runs never touch the repo's storage/.
process.env['LOCAL_STORAGE_DIR'] = join(tmpdir(), `sanad-test-storage-${String(process.pid)}`);
