import { DatabaseConnection } from './connection';
import { LockerRepository } from './locker-repository';
import { VipContractRepository } from './vip-contract-repository';
import { EventRepository } from './event-repository';
import { CommandQueueRepository } from './command-queue-repository';
import { KioskHeartbeatRepository } from './kiosk-heartbeat-repository';

export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private db: DatabaseConnection;
  
  private _lockerRepository?: LockerRepository;
  private _vipContractRepository?: VipContractRepository;
  private _eventRepository?: EventRepository;
  private _commandQueueRepository?: CommandQueueRepository;
  private _kioskHeartbeatRepository?: KioskHeartbeatRepository;

  private constructor(db: DatabaseConnection) {
    this.db = db;
  }

  public static getInstance(db?: DatabaseConnection): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      if (!db) {
        throw new Error('Database connection required for first initialization');
      }
      RepositoryFactory.instance = new RepositoryFactory(db);
    }
    return RepositoryFactory.instance;
  }

  public static resetInstance(): void {
    RepositoryFactory.instance = null as any;
  }

  public get lockers(): LockerRepository {
    if (!this._lockerRepository) {
      this._lockerRepository = new LockerRepository(this.db);
    }
    return this._lockerRepository;
  }

  public get vipContracts(): VipContractRepository {
    if (!this._vipContractRepository) {
      this._vipContractRepository = new VipContractRepository(this.db);
    }
    return this._vipContractRepository;
  }

  public get events(): EventRepository {
    if (!this._eventRepository) {
      this._eventRepository = new EventRepository(this.db);
    }
    return this._eventRepository;
  }

  public get commandQueue(): CommandQueueRepository {
    if (!this._commandQueueRepository) {
      this._commandQueueRepository = new CommandQueueRepository(this.db);
    }
    return this._commandQueueRepository;
  }

  public get kioskHeartbeat(): KioskHeartbeatRepository {
    if (!this._kioskHeartbeatRepository) {
      this._kioskHeartbeatRepository = new KioskHeartbeatRepository(this.db);
    }
    return this._kioskHeartbeatRepository;
  }

  /**
   * Execute a function within a transaction across all repositories
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
   * Get database connection for custom queries
   */
  public getConnection(): DatabaseConnection {
    return this.db;
  }
}
