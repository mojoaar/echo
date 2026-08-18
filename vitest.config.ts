import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});