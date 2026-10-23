import { defineConfig } from 'vitest/config';

// Live tests against the sandbox project (writes!). Run with `npm run test:live`.
export default defineConfig({
  test: {
    include: ['test/live/**/*.live.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
