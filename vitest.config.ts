import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'shared/**/*.test.ts',
      'worker/**/*.test.ts',
      'oxlint/**/*.test.ts',
      'drizzle/**/*.test.ts',
    ],
  },
});
