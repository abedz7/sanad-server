import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Tests set every variable programmatically (tests/setup.ts) so they never depend on a developer's
// .env. Everywhere else we load .env when present; real deployments inject variables directly.
if (process.env['NODE_ENV'] !== 'test' || existsSync('.env')) {
  loadDotenv({ quiet: true });
}

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

// jsonwebtoken accepts "15m", "1h", "7d" or a bare number of seconds. Anything else would make
// `expiresIn` throw at the first login instead of at boot, so we validate the shape here.
const jwtDuration = z.string().regex(/^\d+(ms|s|m|h|d)?$/, 'expected e.g. "15m", "1h" or seconds');

const origin = z
  .url()
  .refine(
    (value) => new URL(value).origin === value,
    'must be an exact origin (no path or trailing slash)',
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),

  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL: jwtDuration.default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECURE: booleanString.default(false),

  CORS_ORIGINS: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(origin).min(1, 'at least one origin is required')),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().min(1).default('./storage'),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .default(5 * 1024 * 1024),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  REOPEN_WINDOW_DAYS: z.coerce.number().int().min(0).max(365).default(7),
});

export type Env = Readonly<z.infer<typeof envSchema>>;

function fail(problems: readonly string[]): never {
  process.stderr.write('Invalid environment configuration:\n');
  for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
  process.stderr.write('See .env.example for every variable and its format.\n');
  process.exit(1);
}

function loadEnv(): Env {
  // Empty strings come from `KEY=` lines in .env; treat them as unset so defaults apply.
  const raw = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    return fail(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  if (result.data.STORAGE_DRIVER === 's3') {
    const missing = (
      ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const
    ).filter((key) => !result.data[key]);
    if (missing.length > 0)
      return fail(missing.map((key) => `${key}: required when STORAGE_DRIVER=s3`));
  }
  return Object.freeze(result.data);
}

export const env: Env = loadEnv();
