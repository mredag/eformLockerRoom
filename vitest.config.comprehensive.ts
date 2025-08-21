import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Global test configuration for comprehensive testing
    globals: true,
    environment: 'node',
    
    // Test file patterns
    include: [
      '**/__tests__/**/*.test.ts',
      '**/__tests__/**/*.test.js',
      '**/src/**/*.test.ts',
      '**/src/**/*.test.js'
    ],
    
    // Exclude patterns
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**'
    ],
    
    // Timeouts for different test types
    testTimeout: 30000, // 30 seconds for regular tests
    hookTimeout: 20000, // 20 seconds for setup/teardown
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/**/*.ts',
        'services/**/*.ts',
        'controllers/**/*.ts',
        'database/**/*.ts',
        'hardware/**/*.ts',
        'middleware/**/*.ts'
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.test.js',
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/types/**'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    
    // Reporters
    reporter: ['verbose', 'json', 'html'],
    outputFile: {
      json: './test-results.json',
      html: './test-results.html'
    },
    
    // Setup files
    setupFiles: [
      './test-setup.ts'
    ],
    
    // Test environment variables
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: ':memory:',
      LOG_LEVEL: 'error'
    },
    
    // Retry configuration
    retry: 2, // Retry failed tests up to 2 times
    
    // Parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 4,
        minThreads: 1
      }
    },
    
    // Test isolation
    isolate: true,
    
    // Watch mode configuration
    watch: false, // Disabled for CI/comprehensive runs
    
    // Benchmark configuration
    benchmark: {
      include: ['**/*.bench.ts'],
      exclude: ['**/node_modules/**']
    }
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '@gateway': path.resolve(__dirname, './app/gateway'),
      '@kiosk': path.resolve(__dirname, './app/kiosk'),
      '@panel': path.resolve(__dirname, './app/panel'),
      '@agent': path.resolve(__dirname, './app/agent')
    }
  },
  
  // Define test categories with different configurations
  define: {
    __TEST_CATEGORIES__: {
      unit: {
        timeout: 10000,
        retry: 1
      },
      integration: {
        timeout: 30000,
        retry: 2
      },
      e2e: {
        timeout: 60000,
        retry: 3
      },
      soak: {
        timeout: 300000, // 5 minutes for soak tests
        retry: 0 // No retries for soak tests
      },
      performance: {
        timeout: 120000, // 2 minutes for performance tests
        retry: 1
      }
    }
  }
});