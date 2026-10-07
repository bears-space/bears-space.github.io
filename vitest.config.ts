import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@utils': resolve(__dirname, 'src/utils'),
      '@types': resolve(__dirname, 'src/types/index.ts'),
      '@assets': resolve(__dirname, 'src/assets'),
      'astro:content': resolve(__dirname, 'src/utils/__tests__/__mocks__/astro-content.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/utils/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/utils/**', 'src/content.config.ts', 'src/types/**'],
      reportOnFailure: true,
    },
  },
});
