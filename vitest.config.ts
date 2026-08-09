import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'server/__tests__/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 120000,
    teardownTimeout: 20000,
  },
});
