import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/mcp-stdio.ts'],
      thresholds: {
        lines: 79.5,
        functions: 80,
        branches: 68,
        statements: 80,
      },
    },
  },
});