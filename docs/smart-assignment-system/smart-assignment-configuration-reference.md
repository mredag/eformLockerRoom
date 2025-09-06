# Smart Locker Assignment Configuration Reference

## Overview

This document provides a comprehensive reference for all configuration parameters in the Smart Locker Assignment system. The system uses a hierarchical configuration approach with global defaults and per-kiosk overrides.

## Configuration Architecture

### Configuration Hierarchy

1. **Default Values**: Hardcoded fallback values in the application
2. **Global Configuration**: System-wide settings stored in `settings_global` table
3. **Kiosk Overrides**: Per-kiosk settings stored in `settings_kiosk` table
4. **Effective Configuration**: Merged result of global + kiosk overrides

### Configuration Storage

```sql
-- Global configuration table
CREATE TABLE settings_global (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'string',
  updated_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Per-kiosk overrides table
CREATE TABLE settings_kiosk (
  kiosk_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'string',
  updated_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kiosk_id, key)
);
```

## Configuration Parameters

### Scoring Algorithm Parameters

#### `base_score`
- **Type**: Number
- **Default**: `100`
- **Range**: `1` - `1000`
- **Description**: Base score assigned to all lockers before applying multipliers
- **Impact**: Higher values increase all locker scores proportionally
- **Tuning**: Increase to favor newer/less-used lockers, decrease to emphasize usage patterns

#### `score_factor_a`
- **Type**: Number
- **Default**: `2.0`
- **Range**: `0.1` - `10.0`
- **Description**: Multiplier for hours since locker became free
- **Formula**: `score += score_factor_a × free_hours`
- **Impact**: Higher values strongly favor lockers that have been free longer
- **Tuning**: Increase to reduce locker clustering, decrease to allow more recent reuse

#### `score_factor_b`
- **Type**: Number
- **Default**: `1.0`
- **Range**: `0.1` - `5.0`
- **Description**: Multiplier for hours since last owner used the locker
- **Formula**: `score += score_factor_b × hours_since_last_owner`
- **Impact**: Higher values favor lockers with older usage history
- **Tuning**: Increase to distribute wear more evenly, decrease to allow quick reuse

#### `score_factor_g`
- **Type**: Number
- **Default**: `0.1`
- **Range**: `0.01` - `1.0`
- **Description**: Wear count penalty factor
- **Formula**: `final_score = score ÷ (1 + score_factor_g × wear_count)`
- **Impact**: Higher values more strongly penalize heavily-used lockers
- **Tuning**: Increase to extend locker lifespan, decrease to ignore wear patterns

#### `score_factor_d`
- **Type**: Number
- **Default**: `0.5`
- **Range**: `0.0` - `2.0`
- **Description**: Waiting hours bonus to reduce starvation
- **Formula**: `score += score_factor_d × waiting_hours` (optional)
- **Impact**: Helps ensure all lockers get used eventually
- **Tuning**: Increase to prevent locker starvation, set to 0 to disable

### Selection Algorithm Parameters

#### `top_k_candidates`
- **Type**: Integer
- **Default**: `5`
- **Range**: `1` - `20`
- **Description**: Number of highest-scored lockers to consider for final selection
- **Impact**: Higher values increase randomness, lower values increase determinism
- **Tuning**: Increase for more variety, decrease for more predictable selection

#### `selection_temperature`
- **Type**: Number
- **Default**: `1.0`
- **Range**: `0.1` - `5.0`
- **Description**: Controls randomness in weighted selection from top candidates
- **Impact**: Higher values increase randomness, lower values favor highest scores
- **Tuning**: 
  - `0.1-0.5`: Nearly deterministic (always picks highest score)
  - `1.0`: Balanced weighted random selection
  - `2.0+`: More random selection among candidates

### Quarantine Management Parameters

#### `quarantine_min_floor`
- **Type**: Integer
- **Default**: `5`
- **Range**: `1` - `30`
- **Unit**: Minutes
- **Description**: Minimum quarantine duration when free_ratio ≤ 0.1
- **Impact**: Lower values reduce wait times during high demand
- **Tuning**: Decrease for faster turnover, increase for better hygiene/maintenance

#### `quarantine_min_ceiling`
- **Type**: Integer
- **Default**: `20`
- **Range**: `5` - `60`
- **Unit**: Minutes
- **Description**: Maximum quarantine duration when free_ratio ≥ 0.5
- **Impact**: Higher values provide more maintenance time during low demand
- **Tuning**: Increase for thorough cleaning, decrease for faster availability

#### `exit_quarantine_minutes`
- **Type**: Integer
- **Default**: `20`
- **Range**: `5` - `60`
- **Unit**: Minutes
- **Description**: Fixed quarantine duration after reclaim operations
- **Impact**: Ensures consistent post-reclaim processing time
- **Tuning**: Adjust based on cleaning/maintenance requirements

### Return Hold Parameters

#### `return_hold_trigger_seconds`
- **Type**: Integer
- **Default**: `120`
- **Range**: `30` - `600`
- **Unit**: Seconds
- **Description**: Maximum door open time to trigger return hold (short errand detection)
- **Impact**: Shorter values detect brief visits, longer values allow more time
- **Tuning**: Adjust based on typical user behavior patterns

#### `return_hold_minutes`
- **Type**: Integer
- **Default**: `15`
- **Range**: `5` - `60`
- **Unit**: Minutes
- **Description**: Duration to hold locker for same user after short errand
- **Impact**: Longer holds improve user experience but reduce availability
- **Tuning**: Balance user convenience with system efficiency

### Session Management Parameters

#### `session_limit_minutes`
- **Type**: Integer
- **Default**: `180`
- **Range**: `60` - `480`
- **Unit**: Minutes
- **Description**: Maximum session duration before marking overdue
- **Impact**: Longer sessions reduce turnover, shorter sessions increase availability
- **Tuning**: Adjust based on typical usage patterns and facility policies

#### `retrieve_window_minutes`
- **Type**: Integer
- **Default**: `10`
- **Range**: `5` - `30`
- **Unit**: Minutes
- **Description**: Grace period for overdue users to retrieve items
- **Impact**: Longer windows provide more user flexibility
- **Tuning**: Balance user convenience with operational efficiency

### Capacity Management Parameters

#### `reserve_ratio`
- **Type**: Number
- **Default**: `0.1`
- **Range**: `0.0` - `0.5`
- **Description**: Percentage of total lockers to keep in reserve
- **Impact**: Higher values ensure availability but reduce usable capacity
- **Tuning**: Increase during peak times, decrease during low demand

#### `reserve_minimum`
- **Type**: Integer
- **Default**: `2`
- **Range**: `0` - `10`
- **Description**: Minimum number of lockers to keep in reserve
- **Impact**: Ensures minimum buffer regardless of total capacity
- **Tuning**: Adjust based on facility size and demand patterns

### Hardware Control Parameters

#### `pulse_ms`
- **Type**: Integer
- **Default**: `800`
- **Range**: `400` - `2000`
- **Unit**: Milliseconds
- **Description**: Duration of relay activation pulse
- **Impact**: Longer pulses ensure reliable activation but increase wear
- **Tuning**: Adjust based on hardware specifications and reliability requirements

#### `open_window_sec`
- **Type**: Integer
- **Default**: `10`
- **Range**: `5` - `30`
- **Unit**: Seconds
- **Description**: Time window for detecting retry requests after locker open
- **Impact**: Longer windows allow more time for user response
- **Tuning**: Balance user convenience with system responsiveness

#### `retry_backoff_ms`
- **Type**: Integer
- **Default**: `500`
- **Range**: `200` - `2000`
- **Unit**: Milliseconds
- **Description**: Delay before retry attempt in sensorless retry logic
- **Impact**: Longer delays reduce hardware stress but increase wait time
- **Tuning**: Adjust based on hardware response characteristics

### Rate Limiting Parameters

#### `card_rate_limit_seconds`
- **Type**: Integer
- **Default**: `10`
- **Range**: `5` - `60`
- **Unit**: Seconds
- **Description**: Minimum time between operations for the same card
- **Impact**: Prevents rapid-fire operations and potential abuse
- **Tuning**: Decrease for faster legitimate operations, increase to prevent abuse

#### `locker_rate_limit_per_minute`
- **Type**: Integer
- **Default**: `3`
- **Range**: `1` - `10`
- **Description**: Maximum operations per locker per minute
- **Impact**: Prevents hardware stress from excessive operations
- **Tuning**: Adjust based on hardware capabilities and usage patterns

#### `command_cooldown_seconds`
- **Type**: Integer
- **Default**: `3`
- **Range**: `1` - `10`
- **Unit**: Seconds
- **Description**: Minimum time between any relay commands
- **Impact**: Prevents hardware conflicts and ensures reliable operation
- **Tuning**: Adjust based on hardware specifications

#### `user_report_daily_cap`
- **Type**: Integer
- **Default**: `2`
- **Range**: `1` - `10`
- **Description**: Maximum suspected occupied reports per card per day
- **Impact**: Prevents report spam while allowing legitimate issues
- **Tuning**: Adjust based on facility size and user behavior

### Feature Flag Parameters

#### `smart_assignment_enabled`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Enables smart assignment mode (vs manual selection)
- **Impact**: Fundamental system behavior change
- **Rollout**: Enable per-kiosk for gradual deployment

#### `allow_reclaim_during_quarantine`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Allows reclaim of quarantined lockers in emergency situations
- **Impact**: Provides flexibility during high demand periods
- **Tuning**: Enable only when necessary due to capacity constraints

## Dynamic Calculation Formulas

### Quarantine Duration Calculation

```javascript
function calculateQuarantineDuration(freeRatio, config) {
  const floor = config.quarantine_min_floor;
  const ceiling = config.quarantine_min_ceiling;
  
  if (freeRatio >= 0.5) return ceiling;
  if (freeRatio <= 0.1) return floor;
  
  // Linear interpolation between 0.1 and 0.5
  return floor + ((freeRatio - 0.1) / 0.4) * (ceiling - floor);
}
```

### Reclaim Window Calculation

```javascript
function calculateReclaimWindow(freeRatio) {
  const reclaimLowMin = 30;   // Low capacity window
  const reclaimHighMin = 180; // High capacity window
  
  if (freeRatio >= 0.5) return reclaimHighMin;
  if (freeRatio <= 0.1) return reclaimLowMin;
  
  // Linear interpolation
  return reclaimLowMin + ((freeRatio - 0.1) / 0.4) * (reclaimHighMin - reclaimLowMin);
}
```

### Owner Hot Window Calculation

```javascript
function calculateOwnerHotWindow(freeRatio) {
  if (freeRatio <= 0.1) return 0; // Disabled at very low capacity
  if (freeRatio >= 0.5) return 30; // 30 minutes at high capacity
  
  // Linear interpolation between 10-30 minutes
  return 10 + ((freeRatio - 0.1) / 0.4) * 20;
}
```

### Locker Scoring Formula

```javascript
function calculateLockerScore(locker, config) {
  const baseScore = config.base_score;
  const freeHours = (Date.now() - locker.free_since) / (1000 * 60 * 60);
  const hoursSinceLastOwner = locker.recent_owner_time ? 
    (Date.now() - locker.recent_owner_time) / (1000 * 60 * 60) : 24;
  
  let score = baseScore + 
              (config.score_factor_a * freeHours) + 
              (config.score_factor_b * hoursSinceLastOwner);
  
  // Apply wear penalty
  score = score / (1 + config.score_factor_g * locker.wear_count);
  
  // Optional waiting hours bonus (if implemented)
  if (config.score_factor_d > 0 && locker.waiting_hours) {
    score += config.score_factor_d * locker.waiting_hours;
  }
  
  return score;
}
```

## Configuration Management

### Hot Reload Mechanism

Configuration changes propagate to all services within 3 seconds through:

1. **Version Tracking**: Each configuration change increments a version number
2. **Polling**: Services poll for version changes every 1 second
3. **Event Emission**: Configuration manager emits change events
4. **Cache Invalidation**: Services invalidate cached configuration

### Configuration Validation

All configuration values are validated on update:

```javascript
const CONFIG_VALIDATION = {
  base_score: { type: 'number', min: 1, max: 1000 },
  score_factor_a: { type: 'number', min: 0.1, max: 10.0 },
  session_limit_minutes: { type: 'integer', min: 60, max: 480 },
  smart_assignment_enabled: { type: 'boolean' },
  // ... all parameters
};
```

### Default Configuration Seeding

On first startup, the system seeds all default values:

```sql
INSERT OR IGNORE INTO settings_global (key, value, data_type) VALUES
  ('base_score', '100', 'number'),
  ('score_factor_a', '2.0', 'number'),
  ('score_factor_b', '1.0', 'number'),
  ('score_factor_g', '0.1', 'number'),
  ('score_factor_d', '0.5', 'number'),
  ('top_k_candidates', '5', 'number'),
  ('selection_temperature', '1.0', 'number'),
  ('quarantine_min_floor', '5', 'number'),
  ('quarantine_min_ceiling', '20', 'number'),
  ('exit_quarantine_minutes', '20', 'number'),
  ('return_hold_trigger_seconds', '120', 'number'),
  ('return_hold_minutes', '15', 'number'),
  ('session_limit_minutes', '180', 'number'),
  ('retrieve_window_minutes', '10', 'number'),
  ('reserve_ratio', '0.1', 'number'),
  ('reserve_minimum', '2', 'number'),
  ('pulse_ms', '800', 'number'),
  ('open_window_sec', '10', 'number'),
  ('retry_backoff_ms', '500', 'number'),
  ('card_rate_limit_seconds', '10', 'number'),
  ('locker_rate_limit_per_minute', '3', 'number'),
  ('command_cooldown_seconds', '3', 'number'),
  ('user_report_daily_cap', '2', 'number'),
  ('smart_assignment_enabled', 'false', 'boolean'),
  ('allow_reclaim_during_quarantine', 'false', 'boolean');
```

## Tuning Guidelines

### Performance Optimization

**High Throughput Scenarios**:
- Decrease `quarantine_min_floor` to 2-3 minutes
- Increase `top_k_candidates` to 7-10 for better distribution
- Decrease `card_rate_limit_seconds` to 5-7 seconds
- Set `selection_temperature` to 1.5-2.0 for more randomness

**Low Demand Scenarios**:
- Increase `quarantine_min_ceiling` to 30-45 minutes
- Decrease `top_k_candidates` to 3 for more deterministic selection
- Increase `return_hold_minutes` to 30 for better user experience
- Set `selection_temperature` to 0.5 for more predictable selection

### Capacity Management

**High Capacity (>50 lockers)**:
- Set `reserve_ratio` to 0.05-0.08 (5-8%)
- Set `reserve_minimum` to 3-5 lockers
- Increase `session_limit_minutes` to 240

**Low Capacity (<20 lockers)**:
- Set `reserve_ratio` to 0.15-0.20 (15-20%)
- Set `reserve_minimum` to 1-2 lockers
- Decrease `session_limit_minutes` to 120-150

### Hardware Optimization

**Reliable Hardware**:
- Decrease `pulse_ms` to 600-700
- Decrease `retry_backoff_ms` to 300-400
- Decrease `command_cooldown_seconds` to 2

**Unreliable Hardware**:
- Increase `pulse_ms` to 1000-1200
- Increase `retry_backoff_ms` to 800-1000
- Increase `command_cooldown_seconds` to 4-5

### User Experience Optimization

**User-Friendly Settings**:
- Increase `return_hold_minutes` to 20-30
- Increase `retrieve_window_minutes` to 15-20
- Decrease `card_rate_limit_seconds` to 7-8
- Set `user_report_daily_cap` to 3-4

**Strict Operational Settings**:
- Decrease `return_hold_minutes` to 10
- Decrease `retrieve_window_minutes` to 5
- Increase `card_rate_limit_seconds` to 15
- Set `user_report_daily_cap` to 1-2

## Configuration Examples

### Development Environment

```json
{
  "base_score": 100,
  "score_factor_a": 1.0,
  "score_factor_b": 0.5,
  "top_k_candidates": 3,
  "selection_temperature": 0.5,
  "quarantine_min_floor": 2,
  "quarantine_min_ceiling": 10,
  "session_limit_minutes": 60,
  "card_rate_limit_seconds": 5,
  "smart_assignment_enabled": true
}
```

### Production Environment (High Volume)

```json
{
  "base_score": 100,
  "score_factor_a": 2.0,
  "score_factor_b": 1.0,
  "score_factor_g": 0.15,
  "top_k_candidates": 7,
  "selection_temperature": 1.5,
  "quarantine_min_floor": 3,
  "quarantine_min_ceiling": 15,
  "session_limit_minutes": 180,
  "reserve_ratio": 0.08,
  "card_rate_limit_seconds": 8,
  "smart_assignment_enabled": true
}
```

### Production Environment (Low Volume)

```json
{
  "base_score": 100,
  "score_factor_a": 1.5,
  "score_factor_b": 1.2,
  "score_factor_g": 0.05,
  "top_k_candidates": 4,
  "selection_temperature": 0.8,
  "quarantine_min_floor": 5,
  "quarantine_min_ceiling": 30,
  "session_limit_minutes": 240,
  "reserve_ratio": 0.15,
  "return_hold_minutes": 25,
  "smart_assignment_enabled": true
}
```

## Monitoring Configuration Impact

### Key Metrics to Monitor

- **Assignment Success Rate**: Should remain >95%
- **Average Assignment Time**: Should be <500ms
- **Conflict Rate**: Should be <2%
- **No Stock Events**: Monitor frequency and duration
- **User Satisfaction**: Monitor return hold usage and retrieval patterns

### Configuration Change Process

1. **Backup Current Configuration**: Export current settings
2. **Test in Staging**: Validate changes in non-production environment
3. **Gradual Rollout**: Apply to single kiosk first
4. **Monitor Impact**: Watch key metrics for 24-48 hours
5. **Full Deployment**: Apply to all kiosks if successful
6. **Document Changes**: Record rationale and impact

This configuration reference provides comprehensive guidance for tuning the Smart Locker Assignment system to meet specific operational requirements and usage patterns.