import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // One in-memory Mongo per worker is expensive; run files serially to keep startup predictable.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 20_000,
  },
});
