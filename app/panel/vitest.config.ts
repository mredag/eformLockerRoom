import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Don't use global setup - let individual tests set up what they need
  },
  resolve: {
    alias: {
      '@shared': '../../shared'
    }
  }
});