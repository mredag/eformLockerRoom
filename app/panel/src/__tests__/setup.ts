import { beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../../../shared/database/database-manager';

let testDbManager: DatabaseManager;

beforeEach(async () => {
  // Create a test database
  testDbManager = DatabaseManager.getInstance({
    path: ':memory:'
  });
  await testDbManager.initialize();
});

afterEach(async () => {
  if (testDbManager) {
    testDbManager.close();
  }
});

export { testDbManager };
