import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseManager } from "../../../../../shared/database/database-manager.js";
import { HeartbeatManager } from "../../../../../shared/services/heartbeat-manager.js";
import { EventLogger } from "../../../../../shared/services/event-logger.js";
import { EventRepository } from "../../../../../shared/database/event-repository.js";

describe("Database Setup Test", () => {
  let dbManager: DatabaseManager;
  let heartbeatManager: HeartbeatManager;

  beforeEach(async () => {
    // Initialize database manager with test database and correct migrations path
    dbManager = DatabaseManager.getInstance({ 
      path: ":memory:",
      migrationsPath: "../../migrations"
    });
    await dbManager.initialize();

    const dbConnection = dbManager.getConnection();
    const eventRepository = new EventRepository(dbConnection);
    const eventLogger = new EventLogger(eventRepository);
    heartbeatManager = new HeartbeatManager({}, eventLogger, dbConnection);
  });

  afterEach(async () => {
    await dbManager.close();
    DatabaseManager.resetAllInstances();
  });

  it("should create kiosk_heartbeat table and register kiosk", async () => {
    // Check if table exists
    const tables = await dbManager.getConnection().all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='kiosk_heartbeat'"
    );
    expect(tables).toHaveLength(1);

    // Register a kiosk
    const kiosk = await heartbeatManager.registerKiosk("test-kiosk", "Test Zone", "1.0.0");
    expect(kiosk.kiosk_id).toBe("test-kiosk");
    expect(kiosk.zone).toBe("Test Zone");
  });
});