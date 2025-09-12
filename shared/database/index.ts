/**
 * @fileoverview
 * This file serves as the main entry point for the shared database module.
 * It exports the core database connection and management classes, as well as all
 * the repository classes responsible for data access, making them easily
 * accessible from other parts of the application.
 */

export { DatabaseConnection } from './connection';
export { DatabaseManager, type DatabaseConfig } from './database-manager';
export { MigrationRunner, type Migration } from './migration-runner';

// Repositories
export { BaseRepository, OptimisticLockError } from './base-repository';
export { LockerRepository, type LockerFilter } from './locker-repository';
export { VipContractRepository, type VipContractFilter } from './vip-contract-repository';
export { EventRepository, type EventFilter } from './event-repository';
export { CommandQueueRepository, type CommandFilter } from './command-queue-repository';
export { KioskHeartbeatRepository, type KioskFilter } from './kiosk-heartbeat-repository';
export { RepositoryFactory } from './repository-factory';
