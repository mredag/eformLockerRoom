import { QuarantineManager } from './quarantine-manager';

export class QuarantineCleanupService {
  private quarantineManager: QuarantineManager;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private logger: any;

  constructor(quarantineManager: QuarantineManager, logger?: any) {
    this.quarantineManager = quarantineManager;
    this.logger = logger || console;
  }

  /**
   * Start the cleanup service with 60-second interval
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Quarantine cleanup service is already running');
      return;
    }

    this.isRunning = true;
    
    // Run initial cleanup
    this.runCleanup().catch(error => {
      this.logger.error('Initial quarantine cleanup failed:', error);
    });

    // Schedule recurring cleanup every 60 seconds
    this.intervalId = setInterval(() => {
      this.runCleanup().catch(error => {
        this.logger.error('Scheduled quarantine cleanup failed:', error);
      });
    }, 60 * 1000); // 60 seconds

    this.logger.info('Quarantine cleanup service started (60s interval)');
  }

  /**
   * Stop the cleanup service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    this.logger.info('Quarantine cleanup service stopped');
  }

  /**
   * Check if service is running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Run cleanup with batch processing
   */
  private async runCleanup(): Promise<void> {
    try {
      const batchSize = 100; // Configurable batch size
      let totalCleaned = 0;
      let batchCleaned = 0;

      // Process in batches until no more expired quarantines
      do {
        batchCleaned = await this.quarantineManager.cleanupExpiredQuarantines(undefined, batchSize);
        totalCleaned += batchCleaned;
        
        // Small delay between batches to avoid overwhelming the database
        if (batchCleaned === batchSize) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } while (batchCleaned === batchSize);

      // Only log if something was cleaned up
      if (totalCleaned > 0) {
        this.logger.info(`Quarantine cleanup: removed=${totalCleaned}`);
      }
    } catch (error) {
      this.logger.error('Quarantine cleanup error:', error);
    }
  }

  /**
   * Manual cleanup trigger (for testing or admin use)
   */
  async runManualCleanup(): Promise<number> {
    if (!this.isRunning) {
      throw new Error('Quarantine cleanup service is not running');
    }

    const batchSize = 1000; // Larger batch for manual cleanup
    let totalCleaned = 0;
    let batchCleaned = 0;

    do {
      batchCleaned = await this.quarantineManager.cleanupExpiredQuarantines(undefined, batchSize);
      totalCleaned += batchCleaned;
    } while (batchCleaned === batchSize);

    if (totalCleaned > 0) {
      this.logger.info(`Manual quarantine cleanup: removed=${totalCleaned}`);
    }

    return totalCleaned;
  }

  /**
   * Get cleanup service status
   */
  getStatus(): {
    isRunning: boolean;
    intervalSeconds: number;
    nextCleanupIn?: number;
  } {
    return {
      isRunning: this.isRunning,
      intervalSeconds: 60,
      nextCleanupIn: this.isRunning ? 60 : undefined
    };
  }
}