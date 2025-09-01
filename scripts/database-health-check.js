const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

async function healthCheck() {
    console.log('🏥 DATABASE HEALTH CHECK');
    console.log('========================');
    
    const issues = [];
    const warnings = [];
    
    // 1. Find all database files
    const dbFiles = [];
    const findDatabases = (dir) => {
        try {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            for (const file of files) {
                const fullPath = path.join(dir, file.name);
                if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
                    findDatabases(fullPath);
                } else if (file.name.endsWith('.db')) {
                    dbFiles.push(fullPath);
                }
            }
        } catch (error) {
            // Skip directories we can't read
        }
    };
    
    findDatabases('/home/pi/eform-locker');
    
    console.log(`📋 Found ${dbFiles.length} database files:`);
    dbFiles.forEach(file => console.log(`   - ${file}`));
    
    if (dbFiles.length === 0) {
        issues.push('No database files found!');
        console.log('❌ No database files found!');
        return { status: 'critical', issues, warnings };
    }
    
    if (dbFiles.length > 1) {
        warnings.push(`Multiple database files detected: ${dbFiles.length}`);
        console.log('🚨 WARNING: Multiple database files detected!');
    }
    
    // 2. Check main database
    const mainDb = '/home/pi/eform-locker/data/eform.db';
    const mainDbExists = dbFiles.includes(mainDb);
    
    if (!mainDbExists) {
        issues.push('Main database not found at expected location');
        console.log(`❌ Main database not found: ${mainDb}`);
    } else {
        console.log(`✅ Main database found: ${mainDb}`);
    }
    
    // 3. Check each database
    const dbStats = [];
    
    for (const dbFile of dbFiles) {
        console.log(`\n🔍 Checking: ${dbFile}`);
        
        try {
            const stats = fs.statSync(dbFile);
            const sizeKB = (stats.size / 1024).toFixed(1);
            console.log(`   Size: ${sizeKB} KB`);
            console.log(`   Modified: ${stats.mtime.toISOString()}`);
            
            // Check if it's a symlink
            const isSymlink = fs.lstatSync(dbFile).isSymbolicLink();
            if (isSymlink) {
                const target = fs.readlinkSync(dbFile);
                console.log(`   Type: Symlink -> ${target}`);
            } else {
                console.log(`   Type: Regular file`);
            }
            
            const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY);
            
            // Check integrity
            const integrity = await new Promise((resolve, reject) => {
                db.get('PRAGMA integrity_check', (err, result) => {
                    if (err) reject(err);
                    else resolve(result['integrity_check']);
                });
            });
            
            console.log(`   Integrity: ${integrity}`);
            if (integrity !== 'ok') {
                issues.push(`Database corruption detected: ${dbFile}`);
            }
            
            // Check locker count
            const lockerCount = await new Promise((resolve, reject) => {
                db.get("SELECT COUNT(*) as count FROM lockers WHERE kiosk_id = 'kiosk-1'", (err, result) => {
                    if (err) reject(err);
                    else resolve(result.count);
                });
            });
            
            console.log(`   Lockers: ${lockerCount}`);
            
            // Check custom names
            const namedCount = await new Promise((resolve, reject) => {
                db.get("SELECT COUNT(*) as count FROM lockers WHERE kiosk_id = 'kiosk-1' AND display_name IS NOT NULL", (err, result) => {
                    if (err) reject(err);
                    else resolve(result.count);
                });
            });
            
            console.log(`   Custom names: ${namedCount}`);
            
            // Check schema version
            const schemaVersion = await new Promise((resolve, reject) => {
                db.get("PRAGMA user_version", (err, result) => {
                    if (err) reject(err);
                    else resolve(result.user_version);
                });
            }).catch(() => 0);
            
            console.log(`   Schema version: ${schemaVersion}`);
            
            db.close();
            
            dbStats.push({
                path: dbFile,
                size: stats.size,
                modified: stats.mtime,
                isSymlink,
                integrity,
                lockerCount,
                namedCount,
                schemaVersion
            });
            
            console.log('   Status: ✅ Healthy');
            
        } catch (error) {
            console.log(`   Status: ❌ Error - ${error.message}`);
            issues.push(`Database error (${dbFile}): ${error.message}`);
        }
    }
    
    // 4. Check WAL files
    console.log('\n📝 Checking WAL files...');
    const walFiles = dbFiles.map(db => db + '-wal').filter(wal => fs.existsSync(wal));
    
    if (walFiles.length > 0) {
        console.log(`Found ${walFiles.length} WAL files:`);
        for (const walFile of walFiles) {
            const stats = fs.statSync(walFile);
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`   - ${walFile}: ${sizeMB} MB`);
            
            if (stats.size > 1024 * 1024) { // 1MB
                warnings.push(`Large WAL file detected: ${walFile} (${sizeMB} MB)`);
            }
        }
    } else {
        console.log('   No WAL files found');
    }
    
    // 5. Check for data consistency
    if (dbStats.length > 1) {
        console.log('\n🔄 Checking data consistency...');
        const lockerCounts = [...new Set(dbStats.map(db => db.lockerCount))];
        const namedCounts = [...new Set(dbStats.map(db => db.namedCount))];
        
        if (lockerCounts.length > 1) {
            warnings.push(`Inconsistent locker counts: ${lockerCounts.join(', ')}`);
            console.log(`⚠️  Inconsistent locker counts: ${lockerCounts.join(', ')}`);
        }
        
        if (namedCounts.length > 1) {
            warnings.push(`Inconsistent custom name counts: ${namedCounts.join(', ')}`);
            console.log(`⚠️  Inconsistent custom name counts: ${namedCounts.join(', ')}`);
        }
    }
    
    // 6. Check environment configuration
    console.log('\n🔧 Checking environment configuration...');
    const expectedDbPath = '/home/pi/eform-locker/data/eform.db';
    console.log(`   Expected EFORM_DB_PATH: ${expectedDbPath}`);
    
    // 7. Summary and recommendations
    console.log('\n🎯 HEALTH SUMMARY');
    console.log('================');
    
    let status = 'healthy';
    if (issues.length > 0) {
        status = 'critical';
        console.log('❌ CRITICAL ISSUES:');
        issues.forEach(issue => console.log(`   - ${issue}`));
    }
    
    if (warnings.length > 0) {
        if (status === 'healthy') status = 'warning';
        console.log('⚠️  WARNINGS:');
        warnings.forEach(warning => console.log(`   - ${warning}`));
    }
    
    if (status === 'healthy') {
        console.log('✅ Database architecture is healthy');
    }
    
    console.log('\n📋 RECOMMENDATIONS:');
    if (dbFiles.length > 1) {
        console.log('🔧 Run: ./scripts/emergency-database-consolidation.sh');
    }
    if (walFiles.some(wal => fs.statSync(wal).size > 1024 * 1024)) {
        console.log('🔧 Run: sqlite3 data/eform.db "PRAGMA wal_checkpoint(FULL);"');
    }
    if (issues.length === 0 && warnings.length === 0) {
        console.log('✅ No action required - system is healthy');
    }
    
    return { status, issues, warnings, dbStats };
}

// Run the health check
healthCheck()
    .then(result => {
        console.log(`\n🏁 Health check complete: ${result.status.toUpperCase()}`);
        process.exit(result.status === 'critical' ? 1 : 0);
    })
    .catch(error => {
        console.error('❌ Health check failed:', error);
        process.exit(1);
    });