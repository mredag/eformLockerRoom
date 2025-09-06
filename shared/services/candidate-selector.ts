export interface Logger {
  log: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
  info: (message: string) => void;
}

export interface SelectionConfig {
  top_k_candidates: number;
  selection_temperature: number;
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

export interface LockerExclusionData {
  lockerId: number;
  isQuarantined: boolean;
  isInReturnHold: boolean;
  isInHotWindow: boolean;
  isOverdue: boolean;
  isSuspectedOccupied: boolean;
}

export interface SelectionResult {
  selectedLockerId: number;
  candidateCount: number;
  topCandidates: number[];
  selectionWeights: number[];
  timeBucket: number;
}

/**
 * CandidateSelector - Handles candidate filtering and weighted random selection
 *
 * Key Features:
 * - Top K candidates filtering from scored lockers
 * - Weighted random selection with stable seed for reproducibility
 * - Selection temperature parameter for randomness control
 * - Exclusion logic for quarantined, held, overdue, and suspected lockers
 * - Deterministic selection with same seed
 * - Secure logging without sensitive card data
 */
export class CandidateSelector {
  private logger: Logger;
  private config: SelectionConfig;

  constructor(config: SelectionConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || console;
  }

  /**
   * Select a locker from scored candidates using weighted random selection
   * 
   * @param scores - Array of scored lockers (should be pre-sorted by score descending)
   * @param exclusions - Array of locker exclusion data
   * @param kioskId - Kiosk identifier for seed generation
   * @param cardId - Card identifier for seed generation
   * @param nowSecs - Current timestamp in seconds for time bucket
   * @returns Selection result with chosen locker ID and metadata
   */
  public selectFromCandidates(
    scores: LockerScore[],
    exclusions: LockerExclusionData[],
    kioskId: string,
    cardId: string,
    nowSecs: number
  ): SelectionResult | null {
    // Create exclusion lookup for O(1) access
    const exclusionMap = new Map<number, LockerExclusionData>();
    exclusions.forEach(exclusion => {
      exclusionMap.set(exclusion.lockerId, exclusion);
    });

    // Filter out excluded lockers
    const availableScores = scores.filter(score => {
      const exclusion = exclusionMap.get(score.lockerId);
      if (!exclusion) {
        return true; // No exclusion data means available
      }

      // Exclude if any exclusion condition is true
      return !(
        exclusion.isQuarantined ||
        exclusion.isInReturnHold ||
        exclusion.isInHotWindow ||
        exclusion.isOverdue ||
        exclusion.isSuspectedOccupied
      );
    });

    if (availableScores.length === 0) {
      // Return null to surface "Boş dolap yok. Görevliye başvurun." upstream
      return null;
    }

    // Take top K candidates
    const topK = Math.min(this.config.top_k_candidates, availableScores.length);
    const topCandidates = availableScores.slice(0, topK);

    // Generate time-bucketed seed: hash(kioskId + cardId + floor(nowSecs/5))
    const timeBucket = Math.floor(nowSecs / 5);
    const seedInput = kioskId + cardId + timeBucket.toString();
    
    // Calculate selection weights using temperature
    const weights = this.calculateSelectionWeights(topCandidates, this.config.selection_temperature);

    // Perform weighted random selection with stable seed
    const selectedIndex = this.weightedRandomSelect(weights, seedInput);
    const selectedLockerId = topCandidates[selectedIndex].lockerId;

    const result: SelectionResult = {
      selectedLockerId,
      candidateCount: topK,
      topCandidates: topCandidates.map(c => c.lockerId),
      selectionWeights: weights,
      timeBucket
    };

    // Log exactly as specified: "Selected locker <id> from <k> candidates"
    this.logger.log(`Selected locker ${selectedLockerId} from ${topK} candidates`);

    return result;
  }

  /**
   * Calculate selection weights based on scores and temperature
   * Uses power function: weight = max(score, 1e-9) ^ selection_temperature
   */
  private calculateSelectionWeights(candidates: LockerScore[], temperature: number): number[] {
    if (candidates.length === 0) {
      return [];
    }

    if (candidates.length === 1) {
      return [1.0];
    }

    // Calculate weights using power function: weight = max(score, 1e-9) ^ temperature
    const weights = candidates.map(candidate => {
      const score = Math.max(candidate.finalScore, 1e-9); // Avoid zero/negative scores
      return Math.pow(score, temperature);
    });

    // Normalize to probabilities
    const sumWeights = weights.reduce((sum, weight) => sum + weight, 0);
    
    // Handle edge case where sum is zero or very small
    if (sumWeights < 1e-15) {
      const uniformWeight = 1.0 / candidates.length;
      return new Array(candidates.length).fill(uniformWeight);
    }

    return weights.map(weight => weight / sumWeights);
  }

  /**
   * Perform weighted random selection using a stable seed
   * Uses a simple linear congruential generator for reproducibility
   */
  private weightedRandomSelect(weights: number[], seed: string): number {
    if (weights.length === 0) {
      throw new Error('Cannot select from empty weights array');
    }

    if (weights.length === 1) {
      return 0;
    }

    // Generate deterministic random number from seed
    const randomValue = this.seededRandom(seed);

    // Find the selected index using cumulative weights
    let cumulativeWeight = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulativeWeight += weights[i];
      if (randomValue <= cumulativeWeight) {
        return i;
      }
    }

    // Fallback to last index (should not happen with proper weights)
    return weights.length - 1;
  }

  /**
   * Generate a deterministic random number [0, 1) from a string seed
   * Uses a simple hash function followed by linear congruential generator
   */
  private seededRandom(seed: string): number {
    // Simple string hash to convert seed to number
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Ensure positive seed
    const positiveSeed = Math.abs(hash);

    // Linear congruential generator (same as used in many standard libraries)
    // Parameters from Numerical Recipes: a = 1664525, c = 1013904223, m = 2^32
    const a = 1664525;
    const c = 1013904223;
    const m = Math.pow(2, 32);

    const next = (a * positiveSeed + c) % m;
    return next / m; // Normalize to [0, 1)
  }

  /**
   * Update selection configuration
   */
  public updateConfig(newConfig: Partial<SelectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  public getConfig(): SelectionConfig {
    return { ...this.config };
  }

  /**
   * Validate selection configuration
   */
  public static validateConfig(config: SelectionConfig): string[] {
    const errors: string[] = [];

    if (!Number.isInteger(config.top_k_candidates) || config.top_k_candidates < 1) {
      errors.push('top_k_candidates must be a positive integer');
    }

    if (config.top_k_candidates > 20) {
      errors.push('top_k_candidates must not exceed 20');
    }

    if (config.selection_temperature <= 0) {
      errors.push('selection_temperature must be positive (greater than 0)');
    }

    if (config.selection_temperature > 10) {
      errors.push('selection_temperature should not exceed 10 for practical use');
    }

    return errors;
  }
}

/**
 * Default selection configuration based on design document
 */
export const DEFAULT_SELECTION_CONFIG: SelectionConfig = {
  top_k_candidates: 5,
  selection_temperature: 1.0
};