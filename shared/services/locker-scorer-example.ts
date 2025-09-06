/**
 * Example usage of LockerScorer in the assignment engine
 * This demonstrates how the scoring algorithm integrates with the smart assignment system
 */

import { LockerScorer, DEFAULT_SCORING_CONFIG, LockerScoringData } from './locker-scorer';

// Example: How the assignment engine would use the scorer
export class AssignmentEngineExample {
  private scorer: LockerScorer;

  constructor() {
    // Initialize with default configuration
    this.scorer = new LockerScorer(DEFAULT_SCORING_CONFIG);
  }

  /**
   * Example method showing how to score lockers (selection logic separate)
   */
  public async scoreForSelection(availableLockers: any[]): Promise<{ lockerId: number; score: number }[]> {
    // Convert locker data to scoring format (all time values in hours)
    const scoringData: LockerScoringData[] = availableLockers.map(locker => ({
      lockerId: locker.id,
      freeHours: this.calculateFreeHours(locker.free_since),
      hoursSinceLastOwner: this.calculateHoursSinceLastOwner(locker.recent_owner_time),
      wearCount: locker.wear_count || 0,
      isQuarantined: locker.quarantine_until ? new Date(locker.quarantine_until) > new Date() : false,
      waitingHours: this.calculateWaitingHours(locker.id) // Optional starvation reduction
    }));

    // Score all lockers
    const scores = this.scorer.scoreLockers(scoringData);

    // Return scored results for separate selection system
    return scores.map(score => ({
      lockerId: score.lockerId,
      score: score.finalScore
    }));
  }

  /**
   * Example method to score lockers for selection system
   * Note: In normal operation, quarantined lockers should be excluded by the selector
   */
  public scoreAvailableLockers(availableLockers: any[]): { lockerId: number; score: number }[] {
    // Filter out quarantined lockers in normal operation
    const eligibleLockers = availableLockers.filter(locker => 
      !locker.quarantine_until || new Date(locker.quarantine_until) <= new Date()
    );

    const scoringData: LockerScoringData[] = eligibleLockers.map(locker => ({
      lockerId: locker.id,
      freeHours: this.calculateFreeHours(locker.free_since),
      hoursSinceLastOwner: this.calculateHoursSinceLastOwner(locker.recent_owner_time),
      wearCount: locker.wear_count || 0,
      isQuarantined: false, // Already filtered out above
      waitingHours: this.calculateWaitingHours(locker.id)
    }));

    const scores = this.scorer.scoreLockers(scoringData);
    
    // Return scored lockers for separate selection system
    return scores.map(score => ({
      lockerId: score.lockerId,
      score: score.finalScore
    }));
  }

  /**
   * Update scoring configuration (e.g., from admin panel or configuration service)
   */
  public updateScoringConfig(newConfig: any): void {
    this.scorer.updateConfig(newConfig);
  }

  // Helper methods for calculating time-based metrics
  private calculateFreeHours(freeSince: string | null): number {
    if (!freeSince) return 0;
    const freeTime = new Date(freeSince);
    const now = new Date();
    return Math.max(0, (now.getTime() - freeTime.getTime()) / (1000 * 60 * 60));
  }

  private calculateHoursSinceLastOwner(lastOwnerTime: string | null): number {
    if (!lastOwnerTime) return 0;
    const lastTime = new Date(lastOwnerTime);
    const now = new Date();
    return Math.max(0, (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60));
  }

  private calculateWaitingHours(lockerId: number): number {
    // This would be implemented based on how long this locker has been
    // waiting to be assigned (for starvation reduction)
    // For now, return 0 as it's optional
    return 0;
  }
}

// Example usage:
/*
const assignmentEngine = new AssignmentEngineExample();

// Get available lockers from database
const availableLockers = await getAvailableLockers(kioskId);

// Score lockers (selection logic handled separately)
const scoredLockers = await assignmentEngine.scoreForSelection(availableLockers);

if (scoredLockers.length > 0) {
  console.log(`Scored ${scoredLockers.length} lockers, top candidate: ${scoredLockers[0].lockerId}`);
  // Pass to separate selection system for final choice...
} else {
  console.log('No suitable lockers available');
  // Handle no stock scenario...
}
*/