# Database Architecture & Troubleshooting Guide

## 🚨 **The Root Cause: Database Proliferation Disaster**

### **What Happened?**

We ended up with **multiple database files** scattered across the system, each containing different data, causing massive confusion and corruption. Here's the timeline of how this disaster unfolded:

## 📊 **Database Files We Found**

| Database File | Location | Purpose | Status |
|---------------|----------|---------|---------|
| `eform.db` | `/home/pi/eform-locker/data/` | **MAIN DATABASE** ✅ | Correct data, 32 lockers |
| `eform_locker.db` | `/home/pi/eform-locker/data/` | Legacy/duplicate | Corrupted index |
| `eform.db` | `/home/pi/eform-locker/app/kiosk/data/` | Service-specific copy | Corrupted, outdated |
| `eform.db` | `/home/pi/eform-locker/app/panel/data/` | Service-specific copy | Potentially outdated |

## 🔍 **Root Causes Analysis**

### **1. Configuration Inconsistency**

**The Problem:**
```typescript
// Different services using different database paths
// Kiosk service (app/kiosk/src/index.ts):
process.env.EFORM_DB_PATH = path.join(projectRoot, 'data', 'eform.db');

// But the actual connection logic (shared/database/connection.ts):
private constructor(dbPath: string = process.env.EFORM_DB_PATH || './data/eform.db') {
    this.dbPath = this.resolveDatabasePath(dbPath);
}

// The problem: './data/eform.db' is relative to WHERE THE SERVICE RUNS
// Kiosk runs from: /home/pi/eform-locker/app/kiosk/
// So './data/eform.db' becomes: /home/pi/eform-locker/app/kiosk/data/eform.db
```

**Why This Happened:**
- Services run from different working directories
- Relative paths (`./data/eform.db`) resolve differently for each service
- Environment variable wasn't consistently set across all services

### **2. SQLite WAL Mode Complications**

**The Problem:**
```bash
# SQLite in WAL mode creates additional files:
eform.db          # Main database file
eform.db-wal      # Write-Ahead Log (4MB of uncommitted transactions!)
eform.db-shm      # Shared memory file

# When copying databases, these files can cause corruption
# if not handled properly
```

**Why This Happened:**
- WAL files contained uncommitted transactions
- Database copies were made without proper WAL checkpoint
- Index corruption occurred during improper file operations

### **3. Development vs Production Drift**

**The Problem:**
- Different database schemas between environments
- Missing migrations on some database instances
- Manual data modifications not applied consistently

## 🛠️ **How Database Connections Actually Work**

### **SQLite Connection Resolution Process**

```typescript
// 1. Environment variable check
const dbPath = process.env.EFORM_DB_PATH || './data/eform.db';

// 2. Path resolution (THE CRITICAL PART)
private resolveDatabasePath(dbPath: string): string {
    if (path.isAbsolute(dbPath)) {
        return dbPath; // ✅ GOOD: Absolute path works everywhere
    } else {
        return path.resolve(process.cwd(), dbPath); // ❌ BAD: Depends on working directory
    }
}

// 3. Working directory matters!
// If kiosk service runs from: /home/pi/eform-locker/app/kiosk/
// Then './data/eform.db' becomes: /home/pi/eform-locker/app/kiosk/data/eform.db
// If gateway runs from: /home/pi/eform-locker/
// Then './data/eform.db' becomes: /home/pi/eform-locker/data/eform.db
```

### **SQLite WAL Mode Behavior**

```sql
-- WAL mode creates multiple files
PRAGMA journal_mode=WAL;

-- This creates:
-- eform.db      (main database)
-- eform.db-wal  (write-ahead log - contains uncommitted changes)
-- eform.db-shm  (shared memory for coordination)

-- To safely copy a WAL database:
PRAGMA wal_checkpoint(FULL);  -- Commit all WAL transactions
-- Then copy all three files together
```

## 🚨 **Warning Signs to Watch For**

### **Database Proliferation Indicators**

```bash
# 🚨 RED FLAGS - Multiple database files
find . -name "*.db" -type f
# Should return ONLY ONE main database file

# 🚨 RED FLAGS - Large WAL files
ls -la data/*.db-wal
# WAL files >1MB indicate uncommitted transactions

# 🚨 RED FLAGS - Services using different databases
grep -r "EFORM_DB_PATH\|\.db" app/*/src/
# Should all point to the same location

# 🚨 RED FLAGS - Relative database paths in production
grep -r "\./data" shared/database/
# Production should use absolute paths
```

### **Data Inconsistency Symptoms**

```bash
# Different locker counts between services
curl http://localhost:3000/api/admin/lockers | jq length  # Gateway
curl http://localhost:3002/api/lockers | jq length       # Kiosk

# Missing custom names
sqlite3 data/eform.db "SELECT COUNT(*) FROM lockers WHERE display_name IS NOT NULL"

# Schema differences
sqlite3 data/eform.db ".schema lockers" > schema1.sql
sqlite3 app/kiosk/data/eform.db ".schema lockers" > schema2.sql
diff schema1.sql schema2.sql
```

## ✅ **The Correct Architecture**

### **Single Source of Truth**

```
eform-locker-system/
├── data/
│   └── eform.db                    # ✅ SINGLE DATABASE FILE
├── app/
│   ├── gateway/
│   │   └── src/index.ts           # ✅ Uses absolute path to main DB
│   ├── kiosk/
│   │   └── src/index.ts           # ✅ Uses absolute path to main DB
│   └── panel/
│       └── src/index.ts           # ✅ Uses absolute path to main DB
└── shared/
    └── database/
        └── connection.ts           # ✅ Centralized connection logic
```

### **Proper Configuration**

```typescript
// ✅ CORRECT: Always use absolute paths in production
const projectRoot = path.resolve(__dirname, '../../..');
process.env.EFORM_DB_PATH = path.join(projectRoot, 'data', 'eform.db');

// ✅ CORRECT: Validate database path exists
if (!fs.existsSync(process.env.EFORM_DB_PATH)) {
    throw new Error(`Database not found: ${process.env.EFORM_DB_PATH}`);
}

// ✅ CORRECT: Single connection manager
export class DatabaseConnection {
    private static instance: DatabaseConnection;
    
    public static getInstance(): DatabaseConnection {
        if (!DatabaseConnection.instance) {
            const dbPath = process.env.EFORM_DB_PATH;
            if (!dbPath || !path.isAbsolute(dbPath)) {
                throw new Error('EFORM_DB_PATH must be an absolute path');
            }
            DatabaseConnection.instance = new DatabaseConnection(dbPath);
        }
        return DatabaseConnection.instance;
    }
}
```

## 🔧 **Prevention Strategies**

### **1. Database Path Validation**

```typescript
// Add to shared/database/connection.ts
private validateDatabasePath(dbPath: string): void {
    if (!path.isAbsolute(dbPath)) {
        throw new Error(`Database path must be absolute: ${dbPath}`);
    }
    
    if (!fs.existsSync(dbPath)) {
        throw new Error(`Database file not found: ${dbPath}`);
    }
    
    // Ensure no other database files exist in service directories
    const serviceDirs = ['app/gateway/data', 'app/kiosk/data', 'app/panel/data'];
    for (const dir of serviceDirs) {
        const serviceDbPath = path.join(process.cwd(), dir, 'eform.db');
        if (fs.existsSync(serviceDbPath) && serviceDbPath !== dbPath) {
            console.warn(`⚠️  Found duplicate database: ${serviceDbPath}`);
            console.warn(`⚠️  Main database: ${dbPath}`);
            throw new Error('Multiple database files detected! Clean up required.');
        }
    }
}
```

### **2. Database Health Monitoring**

```typescript
// Add to shared/services/health-monitor.ts
export class DatabaseHealthMonitor {
    public async checkDatabaseConsistency(): Promise<HealthReport> {
        const issues: string[] = [];
        
        // Check for multiple database files
        const dbFiles = await this.findDatabaseFiles();
        if (dbFiles.length > 1) {
            issues.push(`Multiple database files found: ${dbFiles.join(', ')}`);
        }
        
        // Check WAL file size
        const walPath = this.db.getDatabasePath() + '-wal';
        if (fs.existsSync(walPath)) {
            const stats = await fs.stat(walPath);
            if (stats.size > 1024 * 1024) { // 1MB
                issues.push(`Large WAL file detected: ${stats.size} bytes`);
            }
        }
        
        // Check schema consistency
        const schemaHash = await this.getSchemaHash();
        const expectedHash = await this.getExpectedSchemaHash();
        if (schemaHash !== expectedHash) {
            issues.push('Database schema mismatch detected');
        }
        
        return {
            status: issues.length === 0 ? 'healthy' : 'warning',
            issues
        };
    }
}
```

### **3. Startup Validation**

```typescript
// Add to each service's index.ts
async function validateDatabaseSetup(): Promise<void> {
    console.log('🔍 Validating database setup...');
    
    const dbPath = process.env.EFORM_DB_PATH;
    console.log(`📍 Database path: ${dbPath}`);
    
    if (!dbPath || !path.isAbsolute(dbPath)) {
        throw new Error('EFORM_DB_PATH must be set to an absolute path');
    }
    
    if (!fs.existsSync(dbPath)) {
        throw new Error(`Database not found: ${dbPath}`);
    }
    
    // Test database connection
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
    await new Promise((resolve, reject) => {
        db.get('PRAGMA integrity_check', (err, result) => {
            db.close();
            if (err) reject(err);
            else if (result['integrity_check'] !== 'ok') {
                reject(new Error(`Database integrity check failed: ${result['integrity_check']}`));
            } else {
                resolve(result);
            }
        });
    });
    
    console.log('✅ Database validation passed');
}

// Call before starting service
await validateDatabaseSetup();
```

## 🚀 **Recovery Procedures**

### **Emergency Database Consolidation**

```bash
#!/bin/bash
# scripts/emergency-database-consolidation.sh

echo "🚨 EMERGENCY DATABASE CONSOLIDATION"
echo "=================================="

# 1. Stop all services
sudo pkill -f "node.*"

# 2. Find all database files
echo "📋 Finding all database files..."
find /home/pi/eform-locker -name "*.db" -type f

# 3. Identify the main database (largest, most recent)
MAIN_DB="/home/pi/eform-locker/data/eform.db"
echo "📍 Main database: $MAIN_DB"

# 4. Backup everything
BACKUP_DIR="/home/pi/eform-locker/backup/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
find /home/pi/eform-locker -name "*.db*" -exec cp {} "$BACKUP_DIR/" \;
echo "💾 Backup created: $BACKUP_DIR"

# 5. Remove duplicate databases
find /home/pi/eform-locker/app -name "*.db*" -delete
echo "🗑️  Removed service-specific databases"

# 6. Create symlinks to main database
mkdir -p /home/pi/eform-locker/app/kiosk/data
mkdir -p /home/pi/eform-locker/app/panel/data
ln -sf ../../../data/eform.db /home/pi/eform-locker/app/kiosk/data/eform.db
ln -sf ../../../data/eform.db /home/pi/eform-locker/app/panel/data/eform.db
echo "🔗 Created symlinks to main database"

# 7. Checkpoint WAL file
sqlite3 "$MAIN_DB" "PRAGMA wal_checkpoint(FULL);"
echo "✅ WAL checkpoint completed"

# 8. Verify integrity
sqlite3 "$MAIN_DB" "PRAGMA integrity_check;"
echo "✅ Database integrity verified"

echo "🎉 Database consolidation complete!"
```

### **Database Health Check Script**

```javascript
// scripts/database-health-check.js
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

async function healthCheck() {
    console.log('🏥 DATABASE HEALTH CHECK');
    console.log('========================');
    
    // 1. Find all database files
    const dbFiles = [];
    const findDatabases = (dir) => {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                findDatabases(fullPath);
            } else if (file.name.endsWith('.db')) {
                dbFiles.push(fullPath);
            }
        }
    };
    
    findDatabases('/home/pi/eform-locker');
    
    console.log(`📋 Found ${dbFiles.length} database files:`);
    dbFiles.forEach(file => console.log(`   - ${file}`));
    
    if (dbFiles.length > 1) {
        console.log('🚨 WARNING: Multiple database files detected!');
    }
    
    // 2. Check each database
    for (const dbFile of dbFiles) {
        console.log(`\n🔍 Checking: ${dbFile}`);
        
        try {
            const stats = fs.statSync(dbFile);
            console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
            console.log(`   Modified: ${stats.mtime.toISOString()}`);
            
            const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY);
            
            // Check integrity
            await new Promise((resolve, reject) => {
                db.get('PRAGMA integrity_check', (err, result) => {
                    if (err) reject(err);
                    else {
                        console.log(`   Integrity: ${result['integrity_check']}`);
                        resolve(result);
                    }
                });
            });
            
            // Check locker count
            await new Promise((resolve, reject) => {
                db.get("SELECT COUNT(*) as count FROM lockers WHERE kiosk_id = 'kiosk-1'", (err, result) => {
                    if (err) reject(err);
                    else {
                        console.log(`   Lockers: ${result.count}`);
                        resolve(result);
                    }
                });
            });
            
            db.close();
            console.log('   Status: ✅ Healthy');
            
        } catch (error) {
            console.log(`   Status: ❌ Error - ${error.message}`);
        }
    }
    
    console.log('\n🎯 RECOMMENDATIONS:');
    if (dbFiles.length > 1) {
        console.log('❌ Consolidate databases using emergency-database-consolidation.sh');
    } else {
        console.log('✅ Database architecture is clean');
    }
}

healthCheck().catch(console.error);
```

## 📚 **Best Practices Summary**

### **DO's ✅**

1. **Use absolute paths** for database connections in production
2. **Set EFORM_DB_PATH** consistently across all services
3. **Validate database path** on service startup
4. **Monitor WAL file sizes** regularly
5. **Use proper WAL checkpoints** before database operations
6. **Create symlinks** instead of copying database files
7. **Run health checks** regularly

### **DON'Ts ❌**

1. **Never use relative paths** like `./data/eform.db` in production
2. **Never copy database files** without proper WAL checkpoint
3. **Never run services** from different working directories without absolute paths
4. **Never ignore** large WAL files (>1MB)
5. **Never manually edit** database files without stopping services
6. **Never assume** all services use the same database without verification

## 🎯 **Monitoring Commands**

```bash
# Daily health check
node scripts/database-health-check.js

# Find all database files
find /home/pi/eform-locker -name "*.db*" -ls

# Check WAL file sizes
ls -lh /home/pi/eform-locker/data/*.db-wal 2>/dev/null || echo "No WAL files"

# Verify all services use same database
ps aux | grep node | while read line; do
    pid=$(echo $line | awk '{print $2}')
    echo "PID $pid: $(lsof -p $pid 2>/dev/null | grep '\.db')"
done
```

---

## 🎉 **Conclusion**

The database proliferation disaster was caused by:
1. **Relative path configuration** causing services to create separate databases
2. **SQLite WAL mode complications** during file operations
3. **Lack of validation** for database consistency

By implementing absolute paths, proper validation, and regular health checks, we can prevent this nightmare from happening again!

**Remember**: In a distributed system, **one source of truth** for data is critical. Multiple database files = multiple sources of truth = chaos! 🔥