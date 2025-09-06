/**
 * Example usage of CandidateSelector with LockerScorer
 * 
 * This demonstrates the complete flow from scoring to selection
 */

import { LockerScorer, DEFAULT_SCORING_CONFIG, LockerScoringData } from './locker-scorer';
import { CandidateSelector, DEFAULT_SELECTION_CONFIG, LockerExclusionData } from './candidate-selector';

// Example: Complete locker assignment flow
export function demonstrateCandidateSelection() {
  console.log('=== Smart Locker Assignment: Candidate Selection Demo ===\n');

  // Initialize services
  const scorer = new LockerScorer(DEFAULT_SCORING_CONFIG);
  const selector = new CandidateSelector(DEFAULT_SELECTION_CONFIG);

  // Mock locker data
  const lockerData: LockerScoringData[] = [
    { lockerId: 1, freeHours: 10, hoursSinceLastOwner: 5, wearCount: 15, isQuarantined: false },
    { lockerId: 2, freeHours: 2, hoursSinceLastOwner: 1, wearCount: 8, isQuarantined: false },
    { lockerId: 3, freeHours: 24, hoursSinceLastOwner: 12, wearCount: 25, isQuarantined: false },
    { lockerId: 4, freeHours: 1, hoursSinceLastOwner: 0.5, wearCount: 3, isQuarantined: false },
    { lockerId: 5, freeHours: 6, hoursSinceLastOwner: 3, wearCount: 12, isQuarantined: false },
    { lockerId: 6, freeHours: 8, hoursSinceLastOwner: 4, wearCount: 20, isQuarantined: false },
    { lockerId: 7, freeHours: 15, hoursSinceLastOwner: 8, wearCount: 30, isQuarantined: false },
    { lockerId: 8, freeHours: 3, hoursSinceLastOwner: 2, wearCount: 5, isQuarantined: false }
  ];

  // Mock exclusion data (some lockers are unavailable)
  const exclusions: LockerExclusionData[] = [
    { lockerId: 1, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
    { lockerId: 2, isQuarantined: true, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false }, // Quarantined
    { lockerId: 3, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
    { lockerId: 4, isQuarantined: false, isInReturnHold: true, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false }, // Return hold
    { lockerId: 5, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: true, isSuspectedOccupied: false }, // Overdue
    { lockerId: 6, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
    { lockerId: 7, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: true }, // Suspected
    { lockerId: 8, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false }
  ];

  // Step 1: Score all lockers
  console.log('Step 1: Scoring all lockers...');
  const scores = scorer.scoreLockers(lockerData);
  
  console.log('Locker Scores (sorted by final score):');
  scores.forEach((score, index) => {
    console.log(`  ${index + 1}. Locker ${score.lockerId}: ${score.finalScore.toFixed(2)} points`);
    console.log(`     Free: ${score.freeHours}h, Last Owner: ${score.hoursSinceLastOwner}h, Wear: ${score.wearCount}`);
  });
  console.log();

  // Step 2: Apply exclusions and select candidate
  console.log('Step 2: Applying exclusions and selecting candidate...');
  console.log('Excluded lockers:');
  exclusions.forEach(exclusion => {
    const reasons = [];
    if (exclusion.isQuarantined) reasons.push('quarantined');
    if (exclusion.isInReturnHold) reasons.push('return hold');
    if (exclusion.isOverdue) reasons.push('overdue');
    if (exclusion.isSuspectedOccupied) reasons.push('suspected occupied');
    
    if (reasons.length > 0) {
      console.log(`  Locker ${exclusion.lockerId}: ${reasons.join(', ')}`);
    }
  });
  console.log();

  // Step 3: Select from candidates using different scenarios
  console.log('Step 3: Candidate selection with different scenarios...');
  
  // Scenario 1: Normal selection
  const kioskId = 'kiosk-1';
  const cardId = '0009652489';
  const nowSecs = Math.floor(Date.now() / 1000);
  const result1 = selector.selectFromCandidates(scores, exclusions, kioskId, cardId, nowSecs);
  
  if (result1) {
    console.log(`Scenario 1 (Normal): Selected locker ${result1.selectedLockerId}`);
    console.log(`  Top ${result1.candidateCount} candidates: [${result1.topCandidates.join(', ')}]`);
    console.log(`  Selection weights: [${result1.selectionWeights.map(w => w.toFixed(3)).join(', ')}]`);
    console.log(`  Time bucket: ${result1.timeBucket}`);
  } else {
    console.log('Scenario 1: No available lockers');
  }
  console.log();

  // Scenario 2: Same time bucket (should be deterministic)
  const result2 = selector.selectFromCandidates(scores, exclusions, kioskId, cardId, nowSecs);
  console.log(`Scenario 2 (Same time bucket): Selected locker ${result2?.selectedLockerId}`);
  console.log(`  Deterministic: ${result1?.selectedLockerId === result2?.selectedLockerId ? 'YES' : 'NO'}`);
  console.log();

  // Scenario 3: Different time bucket
  const nowSecs3 = nowSecs + 10; // Different 5-second bucket
  const result3 = selector.selectFromCandidates(scores, exclusions, kioskId, cardId, nowSecs3);
  console.log(`Scenario 3 (Different time bucket): Selected locker ${result3?.selectedLockerId}`);
  console.log(`  Time bucket: ${result3?.timeBucket}`);
  console.log();

  // Scenario 4: High temperature (more random)
  selector.updateConfig({ selection_temperature: 3.0 });
  const result4 = selector.selectFromCandidates(scores, exclusions, kioskId, cardId, nowSecs);
  console.log(`Scenario 4 (High temperature): Selected locker ${result4?.selectedLockerId}`);
  console.log(`  Selection weights: [${result4?.selectionWeights.map(w => w.toFixed(3)).join(', ')}]`);
  console.log();

  // Scenario 5: Low temperature (more deterministic)
  selector.updateConfig({ selection_temperature: 0.1 });
  const result5 = selector.selectFromCandidates(scores, exclusions, kioskId, cardId, nowSecs);
  console.log(`Scenario 5 (Low temperature): Selected locker ${result5?.selectedLockerId}`);
  console.log(`  Selection weights: [${result5?.selectionWeights.map(w => w.toFixed(3)).join(', ')}]`);
  console.log();

  // Scenario 6: Fewer top candidates
  selector.updateConfig({ top_k_candidates: 2, selection_temperature: 1.0 });
  const result6 = selector.selectFromCandidates(scores, exclusions, kioskId, cardId, nowSecs);
  console.log(`Scenario 6 (Top 2 candidates only): Selected locker ${result6?.selectedLockerId}`);
  console.log(`  Top candidates: [${result6?.topCandidates.join(', ')}]`);
  console.log();

  console.log('=== Demo Complete ===');
}

// Example: Testing exclusion scenarios
export function demonstrateExclusionScenarios() {
  console.log('=== Exclusion Scenarios Demo ===\n');

  const scorer = new LockerScorer(DEFAULT_SCORING_CONFIG);
  const selector = new CandidateSelector(DEFAULT_SELECTION_CONFIG);

  // Simple locker data
  const lockerData: LockerScoringData[] = [
    { lockerId: 1, freeHours: 10, hoursSinceLastOwner: 5, wearCount: 10, isQuarantined: false },
    { lockerId: 2, freeHours: 8, hoursSinceLastOwner: 4, wearCount: 8, isQuarantined: false },
    { lockerId: 3, freeHours: 6, hoursSinceLastOwner: 3, wearCount: 6, isQuarantined: false }
  ];

  const scores = scorer.scoreLockers(lockerData);
  const kioskId = 'kiosk-1';
  const cardId = 'test-card';
  const nowSecs = Math.floor(Date.now() / 1000);

  // Test different exclusion combinations
  const scenarios = [
    {
      name: 'No exclusions',
      exclusions: [
        { lockerId: 1, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
        { lockerId: 2, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
        { lockerId: 3, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false }
      ]
    },
    {
      name: 'Locker 1 quarantined',
      exclusions: [
        { lockerId: 1, isQuarantined: true, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
        { lockerId: 2, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
        { lockerId: 3, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false }
      ]
    },
    {
      name: 'Locker 2 in return hold',
      exclusions: [
        { lockerId: 1, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
        { lockerId: 2, isQuarantined: false, isInReturnHold: true, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
        { lockerId: 3, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false }
      ]
    },
    {
      name: 'Locker 3 in hot window',
      exclusions: [
        { lockerId: 1, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
        { lockerId: 2, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
        { lockerId: 3, isQuarantined: false, isInReturnHold: false, isInHotWindow: true, isOverdue: false, isSuspectedOccupied: false }
      ]
    },
    {
      name: 'All lockers excluded',
      exclusions: [
        { lockerId: 1, isQuarantined: true, isInReturnHold: false, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
        { lockerId: 2, isQuarantined: false, isInReturnHold: true, isInHotWindow: false, isOverdue: false, isSuspectedOccupied: false },
        { lockerId: 3, isQuarantined: false, isInReturnHold: false, isInHotWindow: false, isOverdue: true, isSuspectedOccupied: false }
      ]
    }
  ];

  scenarios.forEach((scenario, index) => {
    console.log(`Scenario ${index + 1}: ${scenario.name}`);
    const result = selector.selectFromCandidates(scores, scenario.exclusions, kioskId, cardId, nowSecs + index);
    
    if (result) {
      console.log(`  Selected: Locker ${result.selectedLockerId}`);
      console.log(`  Available candidates: [${result.topCandidates.join(', ')}]`);
    } else {
      console.log(`  Result: No available lockers`);
    }
    console.log();
  });

  console.log('=== Exclusion Demo Complete ===');
}

// Run demos if this file is executed directly
if (require.main === module) {
  demonstrateCandidateSelection();
  console.log('\n' + '='.repeat(60) + '\n');
  demonstrateExclusionScenarios();
}