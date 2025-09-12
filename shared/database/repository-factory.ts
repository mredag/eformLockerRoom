import { DatabaseConnection } from './connection';
import { LockerRepository } from './locker-repository';
import { VipContractRepository } from './vip-contract-repository';
import { EventRepository } from './event-repository';
import { CommandQueueRepository } from './command-queue-repository';
import { KioskHeartbeatRepository } from './kiosk-heartbeat-repository';

/**
 * Provides a singleton factory for accessing all data repositories.
 * This class ensures that only one instance of each repository is created
 * per database connection, and it provides a centralized point of access.
 * It also includes a utility for running operations across multiple repositories
 * within a single database transaction.
 */
export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private db: DatabaseConnection;
  
  private _lockerRepository?: LockerRepository;
  private _vipContractRepository?: VipContractRepository;
  private _eventRepository?: EventRepository;
  private _commandQueueRepository?: CommandQueueRepository;
  private _kioskHeartbeatRepository?: KioskHeartbeatRepository;

  /**
   * Private constructor to enforce the singleton pattern.
   * @private
   * @param {DatabaseConnection} db - The database connection to be used by all repositories.
   */
  private constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Gets the singleton instance of the RepositoryFactory.
   * @param {DatabaseConnection} [db] - The database connection. Must be provided on the first call.
   * @returns {RepositoryFactory} The singleton instance.
   * @throws {Error} If the factory has not been initialized and no database connection is provided.
   */
  public static getInstance(db?: DatabaseConnection): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      if (!db) {
        throw new Error('Database connection required for first initialization');
      }
      RepositoryFactory.instance = new RepositoryFactory(db);
    }
    return RepositoryFactory.instance;
  }

  /**
   * Resets the singleton instance. Primarily used for testing purposes
   * to ensure a clean state between tests.
   */
  public static resetInstance(): void {
    RepositoryFactory.instance = null as any;
  }

  /**
   * Gets the LockerRepository instance.
   * @returns {LockerRepository} The singleton instance of the locker repository.
   */
  public get lockers(): LockerRepository {
    if (!this._lockerRepository) {
      this._lockerRepository = new LockerRepository(this.db);
    }
    return this._lockerRepository;
  }

  /**
   * Gets the VipContractRepository instance.
   * @returns {VipContractRepository} The singleton instance of the VIP contract repository.
   */
  public get vipContracts(): VipContractRepository {
    if (!this._vipContractRepository) {
      this._vipContractRepository = new VipContractRepository(this.db);
    }
    return this._vipContractRepository;
  }

  /**
   * Gets the EventRepository instance.
   * @returns {EventRepository} The singleton instance of the event repository.
   */
  public get events(): EventRepository {
    if (!this._eventRepository) {
      this._eventRepository = new EventRepository(this.db);
    }
    return this._eventRepository;
  }

  /**
   * Gets the CommandQueueRepository instance.
   * @returns {CommandQueueRepository} The singleton instance of the command queue repository.
   */
  public get commandQueue(): CommandQueueRepository {
    if (!this._commandQueueRepository) {
      this._commandQueueRepository = new CommandQueueRepository(this.db);
    }
    return this._commandQueueRepository;
  }

  /**
   * Gets the KioskHeartbeatRepository instance.
   * @returns {KioskHeartbeatRepository} The singleton instance of the kiosk heartbeat repository.
   */
  public get kioskHeartbeat(): KioskHeartbeatRepository {
    if (!this._kioskHeartbeatRepository) {
      this._kioskHeartbeatRepository = new KioskHeartbeatRepository(this.db);
    }
    return this._kioskHeartbeatRepository;
  }

  /**
   * Executes a function within a single database transaction.
   * This is useful for complex operations that need to modify data in multiple repositories atomically.
   * The transaction is automatically committed on success or rolled back on failure.
   * @template T - The return type of the function to be executed.
   * @param {(repos: RepositoryFactory) => Promise<T>} fn - The function to execute. It receives the repository factory instance as an argument.
   * @returns {Promise<T>} A promise that resolves with the result of the function.
   */
  public async withTransaction<T>(fn: (repos: RepositoryFactory) => Promise<T>): Promise<T> {
    await this.db.beginTransaction();
    try {
      const result = await fn(this);
      await this.db.commit();
      return result;
    } catch (error) {
      await this.db.rollback();
      throw error;
    }
  }

  /**
   * Gets the underlying database connection instance.
   * This can be used for running custom SQL queries that are not covered by the repositories.
   * @returns {DatabaseConnection} The database connection instance.
   */
  public getConnection(): DatabaseConnection {
    return this.db;
  }
}
