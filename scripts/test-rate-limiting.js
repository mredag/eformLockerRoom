/**
 * Simple test script for rate limiting functionality
 */

const { RateLimiter, DEFAULT_RATE_LIMIT_CONFIG } = require('../shared/services/rate-limiter');

async function testRateLimiting() {
  console.log('🧪 Testing Rate Limiting System...\n');
  
  const rateLimiter = new RateLimiter(DEFAULT_RATE_LIMIT_CONFIG);
  
  // Test 1: Card rate limiting
  console.log('Test 1: Card Rate Limiting (10 seconds)');
  
  // First attempt should pass
  let result = rateLimiter.checkCardRate('card123');
  console.log(`First attempt: ${result.allowed ? '✅ PASS' : '❌ FAIL'} - ${result.message}`);
  
  if (result.allowed) {
    rateLimiter.recordCardOpen('card123');
  }
  
  // Second attempt should fail
  result = rateLimiter.checkCardRate('card123');
  console.log(`Second attempt: ${result.allowed ? '❌ FAIL' : '✅ PASS'} - ${result.message}`);
  if (!result.allowed) {
    console.log(`  Retry after: ${result.retryAfterSeconds} seconds`);
  }
  
  console.log();
  
  // Test 2: Locker rate limiting
  console.log('Test 2: Locker Rate Limiting (3 opens per 60 seconds)');
  
  for (let i = 1; i <= 4; i++) {
    result = rateLimiter.checkLockerRate(1);
    console.log(`Attempt ${i}: ${result.allowed ? '✅ PASS' : '❌ FAIL'} - ${result.message}`);
    
    if (result.allowed) {
      rateLimiter.recordLockerOpen(1);
    } else {
      console.log(`  Retry after: ${result.retryAfterSeconds} seconds`);
    }
  }
  
  console.log();
  
  // Test 3: Command cooldown
  console.log('Test 3: Command Cooldown (3 seconds)');
  
  result = rateLimiter.checkCommandCooldown();
  console.log(`First command: ${result.allowed ? '✅ PASS' : '❌ FAIL'} - ${result.message}`);
  
  if (result.allowed) {
    rateLimiter.recordCommand();
  }
  
  result = rateLimiter.checkCommandCooldown();
  console.log(`Second command: ${result.allowed ? '❌ FAIL' : '✅ PASS'} - ${result.message}`);
  if (!result.allowed) {
    console.log(`  Retry after: ${result.retryAfterSeconds} seconds`);
  }
  
  console.log();
  
  // Test 4: User report rate limiting
  console.log('Test 4: User Report Rate Limiting (2 per day)');
  
  for (let i = 1; i <= 3; i++) {
    result = rateLimiter.checkUserReportRate('card456');
    console.log(`Report ${i}: ${result.allowed ? '✅ PASS' : '❌ FAIL'} - ${result.message}`);
    
    if (result.allowed) {
      rateLimiter.recordUserReport('card456');
    } else {
      console.log(`  Retry after: ${result.retryAfterSeconds} seconds`);
    }
  }
  
  console.log();
  
  // Test 5: Combined rate limiting
  console.log('Test 5: Combined Rate Limiting');
  
  result = rateLimiter.checkAllLimits('card789', 5);
  console.log(`Combined check: ${result.allowed ? '✅ PASS' : '❌ FAIL'} - ${result.message}`);
  
  if (result.allowed) {
    rateLimiter.recordSuccessfulOpen('card789', 5);
    console.log('  Recorded successful operation');
  }
  
  // Check again immediately
  result = rateLimiter.checkAllLimits('card789', 5);
  console.log(`Immediate retry: ${result.allowed ? '❌ FAIL' : '✅ PASS'} - ${result.message}`);
  
  console.log();
  
  // Test 6: Violation tracking
  console.log('Test 6: Violation Tracking');
  
  const violations = rateLimiter.getRecentViolations(10);
  console.log(`Recent violations: ${violations.length}`);
  
  violations.forEach((violation, index) => {
    console.log(`  ${index + 1}. Type: ${violation.type}, Key: ${violation.key}, Retry: ${violation.retryAfter}s`);
  });
  
  console.log();
  
  // Test 7: State inspection
  console.log('Test 7: Rate Limiter State');
  
  const state = rateLimiter.getState();
  console.log('Current state:');
  console.log(`  Cards with rate limits: ${Object.keys(state.cardLastOpen).length}`);
  console.log(`  Lockers with history: ${Object.keys(state.lockerOpenHistory).length}`);
  console.log(`  User reports: ${Object.keys(state.userReportHistory).length}`);
  console.log(`  Last command time: ${state.lastCommandTime}`);
  console.log(`  Recent violations: ${state.recentViolations.length}`);
  
  console.log('\n🎉 Rate Limiting Tests Complete!');
}

// Run the tests
testRateLimiting().catch(console.error);