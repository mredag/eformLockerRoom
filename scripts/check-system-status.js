#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

console.log('🔍 eForm Locker System Status Check');
console.log('===================================\n');

// Check 1: Database status
console.log('1. Database Status:');
const dbPath = path.join(__dirname, '..', 'data', 'eform.db');

if (fs.existsSync(dbPath)) {
    console.log('   ✅ Database file exists');
    
    const db = new sqlite3.Database(dbPath);
    db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", (err, row) => {
        if (err) {
            console.log('   ❌ Error querying database:', err.message);
        } else {
            console.log(`   ✅ Admin users: ${row.count}`);
            if (row.count === 0) {
                console.log('   ⚠️  No admin users found - run: node scripts/create-admin-directly.js');
            }
        }
        db.close();
        
        // Continue with other checks
        checkServices();
    });
} else {
    console.log('   ❌ Database file not found');
    console.log('   💡 Run: npm run migrate');
    checkServices();
}

function checkServices() {
    console.log('\n2. Service Status:');
    
    // Check if processes are running
    exec('pgrep -f "node.*panel"', (err, stdout) => {
        if (stdout.trim()) {
            console.log('   ✅ Panel service running (PID:', stdout.trim(), ')');
        } else {
            console.log('   ❌ Panel service not running');
            console.log('   💡 Start with: cd app/panel && npm run start');
        }
    });
    
    exec('pgrep -f "node.*gateway"', (err, stdout) => {
        if (stdout.trim()) {
            console.log('   ✅ Gateway service running (PID:', stdout.trim(), ')');
        } else {
            console.log('   ❌ Gateway service not running');
            console.log('   💡 Start with: cd app/gateway && npm run start');
        }
    });
    
    exec('pgrep -f "node.*kiosk"', (err, stdout) => {
        if (stdout.trim()) {
            console.log('   ✅ Kiosk service running (PID:', stdout.trim(), ')');
        } else {
            console.log('   ❌ Kiosk service not running');
            console.log('   💡 Start with: cd app/kiosk && npm run start');
        }
    });
    
    // Check ports
    setTimeout(() => {
        console.log('\n3. Port Status:');
        
        exec('netstat -tlnp 2>/dev/null | grep :3002 || ss -tlnp 2>/dev/null | grep :3002', (err, stdout) => {
            if (stdout.trim()) {
                console.log('   ✅ Panel port 3002 is listening');
            } else {
                console.log('   ❌ Panel port 3002 not listening');
            }
        });
        
        exec('netstat -tlnp 2>/dev/null | grep :3001 || ss -tlnp 2>/dev/null | grep :3001', (err, stdout) => {
            if (stdout.trim()) {
                console.log('   ✅ Gateway port 3001 is listening');
            } else {
                console.log('   ❌ Gateway port 3001 not listening');
            }
        });
        
        exec('netstat -tlnp 2>/dev/null | grep :3000 || ss -tlnp 2>/dev/null | grep :3000', (err, stdout) => {
            if (stdout.trim()) {
                console.log('   ✅ Kiosk port 3000 is listening');
            } else {
                console.log('   ❌ Kiosk port 3000 not listening');
            }
        });
        
        // Check system info
        setTimeout(() => {
            console.log('\n4. System Info:');
            
            exec('hostname -I', (err, stdout) => {
                if (stdout.trim()) {
                    const ip = stdout.trim().split(' ')[0];
                    console.log('   🌐 IP Address:', ip);
                    console.log('   🔗 Panel URL: http://' + ip + ':3002/');
                    console.log('   🔗 Kiosk URL: http://' + ip + ':3000/');
                }
            });
            
            exec('uptime', (err, stdout) => {
                if (stdout.trim()) {
                    console.log('   ⏱️  System uptime:', stdout.trim());
                }
            });
            
            exec('df -h . | tail -1', (err, stdout) => {
                if (stdout.trim()) {
                    const parts = stdout.trim().split(/\s+/);
                    console.log('   💾 Disk usage:', parts[4], 'used of', parts[1]);
                }
            });
            
        }, 500);
    }, 1000);
}