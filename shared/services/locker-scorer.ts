export interface Logger {
  log: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
  info: (message: string) => void;
}

export interface ScoringConfig {
  base_score: number;
  score_factor_a: number; // free hours multiplier (0-5)
  score_factor_b: number; // hours since last owner multiplier (0-5)
  score_factor_g: number; // wear count divisor factor (0-1)
  score_factor_d: number; // waiting hours bonus (0-5)
  quarantine_multiplier: number; // 0.2 for quarantined lockers (disabled in normal operation)
}

export interface LockerScoringData {
  lockerId: number;
  freeHours: number; // Time in hours since locker became free
  hoursSinceLastOwner: number; // Time in hours since last owner released
  wearCount: number; // Number of times locker has been used
  isQuarantined: boolean; // Whether locker is quarantined (excluded by selector)
  waitingHours?: number; // Optional: hours waiting for assignment (starvation reduction)
}

export interface LockerScore {
  lockerId: number;
  baseScore: number;
  freeHours: number;
  hoursSinceLastOwner: number;
  wearCount: number;
  quarantineMultiplier: number;
  waitingHours: number;
  finalScore: number;
  breakdown: {
    baseScore: number;
    freeHoursBonus: number;
    lastOwnerBonus: number;
    wearPenalty: number;
    waitingBonus: number;
    quarantinePenalty: number;
  };
}

/**
 * LockerScorer - Pure scoring algorithm for locker assignment
 *
 * Key Features:
 * - Pure function design: No selection logic, only scoring
 * - Input validation: Guards against NaN/Infinity, clamps negative values
 * - Deterministic ordering: Stable sort with locker ID tiebreaker
 * - Quarantine handling: Multiplier disabled in production (selector excludes quarantined)
 * - Units: All time inputs must be in hours (convert upstream)
 * - Secure logging: No sensitive card data, exact format required
 */
export class LockerScorer {
  private logger: Logger;
  private config: ScoringConfig;

  constructor(config: ScoringConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || console;
  }

  /**
   * Score multiple lockers and return sorted results
   */
  public scoreLockers(lockers: LockerScoringData[]): LockerScore[] {
    const scores = lockers.map((locker) => this.scoreLocker(locker));

    // Deterministic sort on ties - use locker ID as tiebreaker for stable ordering
    scores.sort((a, b) => {
      const scoreDiff = b.finalScore - a.finalScore;
      if (Math.abs(scoreDiff) < 0.0001) {
        // Epsilon for floating point comparison
        return a.lockerId - b.lockerId; // Lower ID wins on ties
      }
      return scoreDiff;
    });

    const topCandidate = scores.length > 0 ? scores[0] : null;
    this.logger.log(
      `Scored ${scores.length} lockers, top candidate: ${
        topCandidate ? topCandidate.lockerId : "none"
      }`
    );

    return scores;
  }

  /**
   * Score a single locker using the configured algorithm
   * All time inputs must be in hours (convert upstream)
   */
  public scoreLocker(locker: LockerScoringData): LockerScore {
    const {
      lockerId,
      freeHours: rawFreeHours,
      hoursSinceLastOwner: rawHoursSinceLastOwner,
      wearCount: rawWearCount,
      isQuarantined,
      waitingHours: rawWaitingHours = 0,
    } = locker;

    // Guard against NaN/Infinity - set to 0 and log config error
    const freeHours = this.guardFinite(rawFreeHours, "freeHours");
    const hoursSinceLastOwner = this.guardFinite(
      rawHoursSinceLastOwner,
      "hoursSinceLastOwner"
    );
    const wearCount = this.guardFinite(rawWearCount, "wearCount");
    const waitingHours = this.guardFinite(rawWaitingHours, "waitingHours");

    // Base score
    const baseScore = this.config.base_score;

    // Free hours bonus: score_factor_a × free_hours
    const freeHoursBonus = this.config.score_factor_a * freeHours;

    // Hours since last owner bonus: score_factor_b × hours_since_last_owner
    const lastOwnerBonus = this.config.score_factor_b * hoursSinceLastOwner;

    // Waiting hours bonus (starvation reduction): score_factor_d × waiting_hours
    const waitingBonus = this.config.score_factor_d * waitingHours;

    // Calculate score before wear and quarantine adjustments
    const preAdjustmentScore =
      baseScore + freeHoursBonus + lastOwnerBonus + waitingBonus;

    // Wear count divisor: ÷(1 + score_factor_g × wear_count)
    const wearDivisor = 1 + this.config.score_factor_g * wearCount;
    const scoreAfterWear = preAdjustmentScore / wearDivisor;

    // Clamp score after wear penalty - no negative scores
    const clampedScoreAfterWear = Math.max(0, scoreAfterWear);
    const adjustedWearPenalty = preAdjustmentScore - clampedScoreAfterWear;

    // Quarantine multiplier: Note - in normal operation, quarantined lockers are excluded by selector
    // This multiplier is mainly for simulation/testing purposes
    const quarantineMultiplier = isQuarantined
      ? this.config.quarantine_multiplier
      : 1.0;
    const finalScore = clampedScoreAfterWear * quarantineMultiplier;
    const quarantinePenalty = isQuarantined
      ? clampedScoreAfterWear - finalScore
      : 0;

    return {
      lockerId,
      baseScore,
      freeHours,
      hoursSinceLastOwner,
      wearCount,
      quarantineMultiplier,
      waitingHours,
      finalScore,
      breakdown: {
        baseScore,
        freeHoursBonus,
        lastOwnerBonus,
        wearPenalty: adjustedWearPenalty,
        waitingBonus,
        quarantinePenalty,
      },
    };
  }

  /**
   * Guard against NaN/Infinity values - set to 0 and log config error
   */
  private guardFinite(value: number, fieldName: string): number {
    if (!Number.isFinite(value) || value < 0) {
      if (!Number.isFinite(value)) {
        this.logger.error(
          `config_error: ${fieldName} is not finite (${value}), setting to 0`
        );
      }
      return Math.max(0, Number.isFinite(value) ? value : 0);
    }
    return value;
  }

  /**
   * Update scoring configuration
   */
  public updateConfig(newConfig: Partial<ScoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  public getConfig(): ScoringConfig {
    return { ...this.config };
  }

  /**
   * Validate scoring configuration with tightened constraints
   */
  public static validateConfig(config: ScoringConfig): string[] {
    const errors: string[] = [];

    if (config.base_score <= 0) {
      errors.push("base_score must be positive");
    }

    if (config.score_factor_a < 0 || config.score_factor_a > 5) {
      errors.push("score_factor_a must be between 0 and 5");
    }

    if (config.score_factor_b < 0 || config.score_factor_b > 5) {
      errors.push("score_factor_b must be between 0 and 5");
    }

    if (config.score_factor_d < 0 || config.score_factor_d > 5) {
      errors.push("score_factor_d must be between 0 and 5");
    }

    if (config.score_factor_g < 0 || config.score_factor_g > 1) {
      errors.push("score_factor_g must be between 0 and 1");
    }

    if (config.quarantine_multiplier < 0 || config.quarantine_multiplier > 1) {
      errors.push("quarantine_multiplier must be between 0 and 1");
    }

    return errors;
  }
}

/**
 * Default scoring configuration based on design document
 * All time-based inputs are expected in hours (convert upstream)
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  base_score: 100,
  score_factor_a: 2.0, // free hours multiplier (0-5)
  score_factor_b: 1.0, // hours since last owner multiplier (0-5)
  score_factor_g: 0.1, // wear count divisor factor (0-1)
  score_factor_d: 0.5, // waiting hours bonus (0-5)
  quarantine_multiplier: 0.2, // quarantine penalty (disabled in normal operation)
};
