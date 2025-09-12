import { beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import path from 'path';

let testDbManager: DatabaseManager;

beforeEach(async () => {
  // Create a test database
  testDbManager = DatabaseManager.getInstance({
    path: ':memory:',
    migrationsPath: path.join(__dirname, '../../../../migrations')
  });
  await testDbManager.initialize();
});

afterEach(async () => {
  if (testDbManager) {
    testDbManager.close();
  }
});

export { testDbManager };
