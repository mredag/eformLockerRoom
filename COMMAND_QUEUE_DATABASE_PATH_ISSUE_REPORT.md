# Command Queue Database Path Issue Report

## Problem Summary
Commands created through the admin panel are stuck in "pending" status because the Gateway service cannot retrieve them from the command queue. The root cause is a **database path resolution issue** where different services are accessing different database files.

## System Architecture
- **Gateway Service**: Handles API requests, runs on port 3000
- **Panel Service**: Admin interface, runs on port 3003  
- **Kiosk Service**: Hardware controller, runs on port 3002
- **Database**: SQLite database with command_queue table for command management

## Root Cause Analysis

### 1. Working Directory Mismatch
Services run from different working directories:
- **Gateway**: `/home/pi/eform-locker/app/gateway` (process 56397)
- **Kiosk**: `/home/pi/eform-locker` (process 56398)
- **Panel**: `/home/pi/eform-locker` (process 56373)

### 2. Database Path Resolution
The `DatabaseConnection` class uses:
```typescript
private constructor(dbPath: string = process.env.EFORM_DB_PATH || './data/eform.db') {
    this.dbPath = this.resolveDatabasePath(dbPath);
}

private resolveDatabasePath(dbPath: string): string {
    const path = require('path');
    return path.resolve(dbPath); // Converts to absolute path
}
```

This causes different services to resolve `./data/eform.db` to different absolute paths:
- **Gateway**: `/home/pi/eform-locker/app/gateway/data/eform.db`
- **Other services**: `/home/pi/eform-locker/data/eform.db`

### 3. Evidence of Multiple Database Files
```bash
# Main database (has commands)
-rw-r--r-- 1 pi pi 671744 Aug 26 04:57 /home/pi/eform-locker/data/eform.db

# Gateway's separate database (empty command_queue)  
-rw-r--r-- 1 pi pi 450560 Aug 26 04:41 /home/pi/eform-locker/app/gateway/data/eform.db
```

## Verification Tests Performed

### ✅ Working Components
1. **Serial Port Communication**: Successfully tested with `/dev/ttyUSB0`
2. **Modbus Controller**: Responds correctly to test commands
3. **Database Schema**: All tables exist, migrations applied correctly
4. **Service Registration**: Kiosk properly registered with Gateway
5. **Command Creation**: Commands successfully created in main database
6. **Direct SQL Queries**: Return expected results from main database

### ❌ Failing Components
1. **Command Polling API**: Returns empty array despite pending commands
2. **Gateway Database Access**: Accesses wrong database file
3. **Cross-Service Communication**: Gateway can't see commands created by Panel

## Test Results

### Command Creation Test
```bash
$ node scripts/create-test-command.js
✅ Command created: fc0bfc91-504c-4257-b9c9-13790f25b1df
📊 Command details: Status: pending, Kiosk: kiosk-1
```

### Direct Database Query Test  
```bash
$ sqlite3 ./data/eform.db "SELECT COUNT(*) FROM command_queue WHERE status = 'pending';"
3  # Commands exist in main database
```

### Gateway Database Query Test
```bash
$ cd /home/pi/eform-locker/app/gateway
$ sqlite3 ./data/eform.db "SELECT COUNT(*) FROM command_queue WHERE status = 'pending';"
0  # Gateway's database is empty
```

### API Polling Test
```bash
$ curl -X POST http://localhost:3000/api/heartbeat/commands/poll \
  -H "Content-Type: application/json" \
  -d '{"kiosk_id": "kiosk-1"}'
{"success":true,"data":[],"count":0}  # Returns empty despite commands existing
```

## Code Flow Analysis

### Command Creation (Working)
1. Panel creates command via `CommandQueueManager.enqueueCommand()`
2. Command stored in `/home/pi/eform-locker/data/eform.db`
3. Command visible in direct database queries

### Command Polling (Broken)
1. Gateway receives `/api/heartbeat/commands/poll` request
2. `HeartbeatManager.getPendingCommands()` calls `CommandQueueManager.getPendingCommands()`
3. CommandQueueManager queries `/home/pi/eform-locker/app/gateway/data/eform.db` (wrong file)
4. Returns empty array because Gateway's database has no commands

## Attempted Fixes

### 1. Symlink Approach (Failed)
```bash
ln -s ../../data /home/pi/eform-locker/app/gateway/data
```
- **Result**: Gateway still created separate database file
- **Reason**: `path.resolve()` bypasses symlinks by converting to absolute paths

### 2. Database File Replacement (Failed)
```bash
rm /home/pi/eform-locker/app/gateway/data/eform.db
ln -s ../../data /home/pi/eform-locker/app/gateway/data
```
- **Result**: Still returns empty commands
- **Reason**: Path resolution issue persists

## Recommended Solutions

### Option 1: Environment Variable (Recommended)
Set `EFORM_DB_PATH` to absolute path for all services:
```bash
export EFORM_DB_PATH="/home/pi/eform-locker/data/eform.db"
```

### Option 2: Modify DatabaseConnection Class
Update `resolveDatabasePath()` to handle relative paths consistently:
```typescript
private resolveDatabasePath(dbPath: string): string {
    if (dbPath === ':memory:') return dbPath;
    
    // For relative paths, resolve from project root
    if (!path.isAbsolute(dbPath)) {
        const projectRoot = process.env.PROJECT_ROOT || process.cwd();
        return path.resolve(projectRoot, dbPath);
    }
    
    return path.resolve(dbPath);
}
```

### Option 3: Update Start Script
Modify `scripts/start-all.js` to set consistent working directory:
```javascript
// Ensure all services run from project root
process.chdir('/home/pi/eform-locker');
```

## Impact Assessment
- **Severity**: High - Core functionality broken
- **User Impact**: Admin panel locker controls non-functional
- **Hardware Impact**: Modbus commands not executed
- **Data Integrity**: No data loss, commands preserved in main database

## Files Involved
- `shared/database/connection.ts` - Database path resolution
- `shared/services/command-queue-manager.ts` - Command storage/retrieval  
- `shared/services/heartbeat-manager.ts` - Command polling logic
- `app/gateway/src/routes/heartbeat.ts` - API endpoint
- `scripts/start-all.js` - Service startup script

## Next Steps
1. Implement one of the recommended solutions
2. Restart all services to pick up new database configuration
3. Test command polling API returns pending commands
4. Verify end-to-end command execution from Panel → Gateway → Kiosk → Modbus
5. Test actual locker control from admin panel

## Environment Details
- **OS**: Raspberry Pi OS (Debian-based)
- **Node.js**: v20.19.4
- **Database**: SQLite 3
- **Project Structure**: Monorepo with separate service directories
- **Process Management**: npm scripts with child processes