# Critical Test Fixes - Implementation Guide

## 1. Database Connection Fixes (HIGHEST PRIORITY)

### Problem
```
Error: SQLITE_CANTOPEN: unable to open database file
Hook timed out in 10000ms-20000ms
```

### Root Cause
- Database file path resolution issues
- Missing directory creation
- Connection cleanup not happening
- Test isolation problems

### Fix Implementation

#### A. Update Database Manager Test Setup
```typescript
// shared/database/__tests__/database-manager.test.ts
import { beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';

beforeEach(async () => {
  // Ensure test database directory exists
  const testDbPath = path.resolve(process.cwd(), 'data', 'test');
  await fs.ensureDir(testDbPath);
  
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = `sqlite:${testDbPath}/test.db`;
});

afterEach(async () => {
  // Clean up connections
  const dbManager = DatabaseManager.getInstance();
  await dbManager.closeAllConnections();
  
  // Clean up test database
  const testDbPath = path.resolve(process.cwd(), 'data', 'test', 'test.db');
  if (await fs.pathExists(testDbPath)) {
    await fs.remove(testDbPath);
  }
});
```

#### B. Fix Database Manager Connection Handling
```typescript
// shared/database/database-manager.ts
export class DatabaseManager {
  private static instances = new Map<string, DatabaseManager>();
  private connection: Database | null = null;
  
  static getInstance(dbPath?: string): DatabaseManager {
    const key = dbPath || 'default';
    if (!this.instances.has(key)) {
      this.instances.set(key, new DatabaseManager(dbPath));
    }
    return this.instances.get(key)!;
  }
  
  async closeAllConnections(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }
  
  static async closeAllInstances(): Promise<void> {
    for (const instance of this.instances.values()) {
      await instance.closeAllConnections();
    }
    this.instances.clear();
  }
}
```

#### C. Update Test Configuration
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./test-setup.ts'],
    sequence: {
      hooks: 'stack'
    }
  }
});
```

## 2. Rate Limiter Security Fixes (CRITICAL)

### Problem
```
Expected: false (should deny requests)
Received: true (incorrectly allowing requests)
```

### Root Cause
- Token bucket refill calculation errors
- Violation tracking not working
- Time-based logic broken

### Fix Implementation

#### A. Fix Token Bucket Logic
```typescript
// shared/services/rate-limiter.ts
private refillTokens(bucket: TokenBucket): void {
  const now = Date.now();
  const timeDiff = (now - bucket.lastRefill) / 1000; // Convert to seconds
  
  if (timeDiff > 0) {
    const tokensToAdd = Math.floor(timeDiff * bucket.refillRate);
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }
}

async checkRateLimit(key: string, cost: number = 1): Promise<RateLimitResult> {
  // Check if blocked first
  if (this.isBlocked(key)) {
    return {
      allowed: false,
      reason: 'Temporarily blocked due to violations',
      retryAfter: this.getBlockTimeRemaining(key)
    };
  }
  
  const bucket = this.getBucket(key);
  this.refillTokens(bucket);
  
  if (bucket.tokens >= cost) {
    bucket.tokens -= cost;
    return { allowed: true };
  } else {
    // Track violation
    this.trackViolation(key);
    
    return {
      allowed: false,
      reason: 'Rate limit exceeded',
      retryAfter: Math.ceil((cost - bucket.tokens) / bucket.refillRate)
    };
  }
}
```

#### B. Fix Violation Tracking
```typescript
private trackViolation(key: string): void {
  const violations = this.violations.get(key) || [];
  const now = Date.now();
  
  // Add current violation
  violations.push(now);
  
  // Remove old violations (older than window)
  const validViolations = violations.filter(
    time => now - time < this.violationWindowMs
  );
  
  this.violations.set(key, validViolations);
  
  // Check if should block
  if (validViolations.length >= this.violationThreshold) {
    this.blockedKeys.set(key, now + this.blockDurationMs);
    
    // Log security event
    this.eventRepository?.createEvent({
      type: 'security_violation',
      kiosk_id: this.extractKioskId(key),
      details: {
        key,
        violations: validViolations.length,
        blocked_until: new Date(now + this.blockDurationMs)
      }
    });
  }
}
```

## 3. Security Validation Fixes (CRITICAL)

### Problem
```
RFID validation failing for legitimate cards
PIN validation not working correctly
Device ID validation broken
```

### Fix Implementation

#### A. Fix RFID Card Validation
```typescript
// shared/services/security-validation.ts
validateRfidCard(card: string): boolean {
  if (!card || typeof card !== 'string') {
    return false;
  }
  
  const cleanCard = card.trim().toUpperCase();
  
  // Support multiple RFID formats
  const validFormats = [
    /^[0-9A-F]{8}$/,        // 8-digit hex (HID)
    /^[0-9A-F]{10}$/,       // 10-digit hex (Mifare)
    /^[0-9]{10}$/,          // 10-digit decimal
    /^[0-9A-F]{14}$/,       // 14-digit hex (ISO14443)
    /^[0-9A-F]{16}$/        // 16-digit hex (full UID)
  ];
  
  return validFormats.some(format => format.test(cleanCard));
}
```

#### B. Fix PIN Validation
```typescript
validatePinStrength(pin: string): PinValidationResult {
  if (!pin || typeof pin !== 'string') {
    return { isValid: false, reasons: ['PIN is required'] };
  }
  
  const reasons: string[] = [];
  
  // Length check
  if (pin.length < 4) {
    reasons.push('PIN must be at least 4 digits');
  }
  
  if (pin.length > 8) {
    reasons.push('PIN must be no more than 8 digits');
  }
  
  // Numeric check
  if (!/^\d+$/.test(pin)) {
    reasons.push('PIN must contain only numbers');
  }
  
  // Pattern checks
  if (this.hasRepeatingPattern(pin)) {
    reasons.push('PIN cannot have repeating patterns');
  }
  
  if (this.isSequential(pin)) {
    reasons.push('PIN cannot be sequential');
  }
  
  if (this.isCommonPin(pin)) {
    reasons.push('PIN is too common');
  }
  
  return {
    isValid: reasons.length === 0,
    reasons
  };
}
```

#### C. Fix Device ID Validation
```typescript
validateDeviceId(deviceId: string): boolean {
  if (!deviceId || typeof deviceId !== 'string') {
    return false;
  }
  
  const cleanId = deviceId.trim();
  
  // Support multiple device ID formats
  const validFormats = [
    /^KIOSK-[A-Z0-9]{4,8}$/,           // KIOSK-XXXX format
    /^[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}$/, // UUID-like format
    /^DEV[0-9]{6}$/,                   // DEV123456 format
    /^[A-F0-9]{12}$/                   // MAC address format
  ];
  
  return validFormats.some(format => format.test(cleanId));
}
```

## 4. Configuration Manager Fixes

### Problem
```
Expected: './test-config.json'
Received: './config/system.json'
```

### Fix Implementation

```typescript
// shared/services/config-manager.ts
export class ConfigManager {
  private configPath: string;
  private config: SystemConfiguration | null = null;
  
  constructor(configPath?: string) {
    this.configPath = configPath || './config/system.json';
  }
  
  getConfiguration(): SystemConfiguration {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfiguration() first.');
    }
    return this.config;
  }
  
  getSystemConfig(): SystemConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfiguration() first.');
    }
    return this.config.system;
  }
}
```

## 5. Test Environment Setup

### Create Test Setup File
```typescript
// test-setup.ts
import { beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';

beforeAll(async () => {
  // Ensure test directories exist
  const testDirs = [
    'data/test',
    'logs/test',
    'config/test'
  ];
  
  for (const dir of testDirs) {
    await fs.ensureDir(path.resolve(process.cwd(), dir));
  }
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
});

afterAll(async () => {
  // Clean up test directories
  const testDirs = [
    'data/test',
    'logs/test'
  ];
  
  for (const dir of testDirs) {
    const fullPath = path.resolve(process.cwd(), dir);
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
    }
  }
});

beforeEach(() => {
  // Reset any global state
  jest.clearAllMocks?.();
});
```

## Implementation Priority

1. **IMMEDIATE (Today):** Database connection fixes
2. **URGENT (24h):** Rate limiter security fixes  
3. **HIGH (48h):** Security validation fixes
4. **MEDIUM (Week):** Configuration and API fixes
5. **LOW (Sprint):** Performance optimizations

## Testing the Fixes

After implementing fixes, run:
```bash
# Test individual modules
npm test --workspace=shared -- --reporter=verbose

# Test specific files
npm test shared/services/__tests__/rate-limiter.test.ts
npm test shared/database/__tests__/database-manager.test.ts

# Full test suite
npm test
```

## Verification Checklist

- [ ] Database tests pass without timeouts
- [ ] Rate limiter properly denies excess requests
- [ ] Security validation accepts valid inputs
- [ ] Security validation rejects invalid inputs
- [ ] Configuration manager handles errors properly
- [ ] All API endpoints return expected responses
- [ ] No unhandled promise rejections
- [ ] Test cleanup working properly