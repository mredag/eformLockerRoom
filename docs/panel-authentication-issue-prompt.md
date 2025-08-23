# eForm Locker System - Panel Authentication Issue Analysis

## Problem Summary

I'm working on an eForm Locker System running on a Raspberry Pi with a Node.js/TypeScript backend. The system has been experiencing persistent authentication issues in the admin panel, specifically with user login functionality. Despite multiple attempts to fix SQLite3 bundling issues and user creation problems, users still cannot log in successfully.

## Current Error

```
Invalid password hash for user: emre
{"level":30,"time":1755981612843,"pid":36947,"hostname":"pi-eform-locker","reqId":"req-c","res":{"statusCode":401},"responseTime":2.5781299993395805,"msg":"request completed"}
```

## System Architecture

### Technology Stack
- **Runtime**: Node.js 20.x on Raspberry Pi OS (64-bit)
- **Database**: SQLite3 with direct file access
- **Framework**: Fastify for web server
- **Bundling**: esbuild for TypeScript compilation
- **Authentication**: bcrypt for password hashing
- **Project Structure**: Monorepo with workspaces (gateway, kiosk, panel, shared)

### Key Components
- **Panel Service**: Admin web interface (port 3002)
- **Gateway Service**: API backend (port 3001) 
- **Kiosk Service**: User touchscreen interface (port 3000)
- **Shared Libraries**: Common database and service code

## Previous Issues and Fixes Attempted

### 1. SQLite3 Bundling Problem (RESOLVED)
**Issue**: Prepared statements in bundled code returned empty objects `{}`
**Root Cause**: esbuild bundling wasn't properly handling SQLite3 native module
**Solution**: Rewrote AuthService to use raw SQLite3 `.run()` and `.get()` methods instead of prepared statements

### 2. User Creation Problem (RESOLVED)
**Issue**: Admin users couldn't be created via web interface
**Solution**: Created direct admin creation script bypassing DatabaseManager

### 3. Current Authentication Problem (UNRESOLVED)
**Issue**: Users can be created but cannot log in - password verification fails

## Current Code Implementation

### AuthService (app/panel/src/services/auth-service.ts)
```typescript
import { Database } from 'sqlite3';
import * as bcrypt from 'bcrypt';
import path from 'path';

export class AuthService {
  private db: Database;

  constructor() {
    const dbPath = path.join(process.cwd(), 'data', 'eform.db');
    this.db = new Database(dbPath);
  }

  async validateUser(username: string, password: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE username = ?',
        [username],
        async (err, user: any) => {
          if (err) {
            console.error('Database error:', err);
            reject(err);
            return;
          }

          if (!user) {
            console.log('User not found:', username);
            resolve(null);
            return;
          }

          try {
            console.log('User found:', { id: user.id, username: user.username, role: user.role });
            console.log('Stored hash:', user.password_hash);
            console.log('Input password:', password);
            
            const isValid = await bcrypt.compare(password, user.password_hash);
            console.log('Password validation result:', isValid);
            
            if (isValid) {
              resolve({ id: user.id, username: user.username, role: user.role });
            } else {
              console.log('Invalid password hash for user:', username);
              resolve(null);
            }
          } catch (error) {
            console.error('Password validation error:', error);
            reject(error);
          }
        }
      );
    });
  }

  async createUser(username: string, password: string, role: string = 'user'): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('Creating user with hash:', hashedPassword);
        
        this.db.run(
          'INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
          [username, hashedPassword, role, new Date().toISOString()],
          function(err) {
            if (err) {
              console.error('Error creating user:', err);
              reject(err);
              return;
            }
            
            console.log('User created successfully with ID:', this.lastID);
            resolve({ id: this.lastID, username, role });
          }
        );
      } catch (error) {
        console.error('Error hashing password:', error);
        reject(error);
      }
    });
  }
}
```

### Direct Admin Creation Script (scripts/create-admin-directly.js)
```javascript
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const readline = require('readline');

const dbPath = path.join(__dirname, '..', 'data', 'eform.db');
const db = new sqlite3.Database(dbPath);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function createAdminUser() {
  try {
    const username = await askQuestion('Enter admin username: ');
    const password = await askQuestion('Enter admin password: ');
    
    console.log('Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Password hashed successfully');
    
    console.log('Creating admin user...');
    
    db.run(
      'INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, 'admin', new Date().toISOString()],
      function(err) {
        if (err) {
          console.error('❌ Error creating admin user:', err.message);
          process.exit(1);
        }
        
        console.log('✅ Admin user created successfully!');
        console.log('   ID:', this.lastID);
        console.log('   Username:', username);
        console.log('   Role: admin');
        
        db.close();
        rl.close();
      }
    );
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

createAdminUser();
```

### Database Schema (migrations/004_staff_users.sql)
```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login TEXT,
    is_active BOOLEAN DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
```

## Debugging Information

### Database Validation Results
```bash
# Database validation passes
✅ Users table exists
✅ Database SELECT operation works
✅ Database INSERT operation works
✅ Found 1 admin user(s): emre (created: 2025-01-23T...)
```

### User Creation Success
```bash
# Admin user creation succeeds
✅ Admin user created successfully!
   ID: 1
   Username: emre
   Role: admin
```

### Login Failure Logs
```bash
# During login attempt
User found: { id: 1, username: 'emre', role: 'admin' }
Stored hash: $2b$10$[hash_string]
Input password: [user_input]
Password validation result: false
Invalid password hash for user: emre
```

## Environment Details

### System Information
- **OS**: Raspberry Pi OS (64-bit)
- **Node.js**: v20.19.4
- **Architecture**: aarch64 (ARM64)
- **Database**: SQLite3 v5.1.6
- **bcrypt**: v5.1.1

### File Paths
- **Database**: `/home/pi/eform-locker/data/eform.db`
- **Panel Service**: `/home/pi/eform-locker/app/panel/`
- **Bundled Output**: `/home/pi/eform-locker/app/panel/dist/index.js`

### Build Process
```bash
# esbuild configuration
esbuild src/index.ts --bundle --platform=node --target=node20 --outfile=dist/index.js --external:sqlite3 --external:bcrypt --format=cjs --minify=false
```

## Questions for Analysis

1. **Password Hashing Consistency**: Could there be a mismatch between how passwords are hashed during creation vs. verification?

2. **bcrypt Version Compatibility**: Are there known issues with bcrypt v5.1.1 on ARM64/Raspberry Pi that could cause hash verification failures?

3. **Bundling Impact**: Even though SQLite3 and bcrypt are externalized, could the bundling process still be affecting password verification?

4. **Character Encoding**: Could there be character encoding issues between the web form input and the bcrypt comparison?

5. **Async/Promise Handling**: Are there potential race conditions or promise handling issues in the authentication flow?

6. **Database Corruption**: Could the SQLite3 database have corruption issues affecting the stored password hashes?

## Specific Help Needed

Please analyze this authentication issue and provide:

1. **Root Cause Analysis**: What is most likely causing the password verification to fail?

2. **Debugging Steps**: What specific debugging steps should I take to isolate the problem?

3. **Code Fixes**: What changes to the AuthService or related code would resolve this issue?

4. **Alternative Approaches**: Should I consider a different authentication strategy or library?

5. **Testing Strategy**: How can I create comprehensive tests to validate the authentication system?

## Additional Context

- The system worked in development on Windows but fails in production on Raspberry Pi
- Multiple users have been created successfully but none can log in
- The same password that was used during creation fails during login
- Database queries work correctly for user retrieval
- Only the password verification step fails

Please provide a comprehensive analysis and solution for this persistent authentication issue.