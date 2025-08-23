import argon2 from 'argon2';
import bcryptjs from 'bcryptjs';
import { DatabaseManager } from '../../../../shared/database/database-manager';

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'staff';
  created_at: Date;
  last_login?: Date;
  pin_expires_at?: Date;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  role: 'admin' | 'staff';
}

export class AuthService {
  constructor(private dbManager: DatabaseManager) {}

  async createUser(request: CreateUserRequest): Promise<User> {
    console.log('Creating user:', { username: request.username, role: request.role });
    
    const hashedPassword = await argon2.hash(request.password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });

    // Use raw SQLite3 instead of prepared statements to avoid bundling issues
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    
    return new Promise((resolve, reject) => {
      const dbPath = path.join(process.cwd(), 'data/eform.db');
      const db = new sqlite3.Database(dbPath);
      
      console.log('Using direct SQLite3 connection to:', dbPath);
      
      db.run(`
        INSERT INTO staff_users (username, password_hash, role, created_at, pin_expires_at, active)
        VALUES (?, ?, ?, datetime('now'), datetime('now', '+90 days'), 1)
      `, [request.username, hashedPassword, request.role], function(err) {
        if (err) {
          console.error('SQLite3 insert error:', err);
          db.close();
          
          if (err.message && err.message.includes('UNIQUE constraint failed')) {
            reject(new Error('Username already exists'));
          } else {
            reject(new Error(`Failed to create user: ${err.message}`));
          }
          return;
        }
        
        console.log('SQLite3 insert successful, ID:', this.lastID);
        
        if (!this.lastID) {
          db.close();
          reject(new Error('Failed to create user - no ID returned'));
          return;
        }
        
        const userId = this.lastID;
        
        // Get the created user
        db.get(`
          SELECT id, username, role, created_at, last_login, pin_expires_at
          FROM staff_users 
          WHERE id = ? AND active = 1
        `, [userId], (err, row) => {
          db.close();
          
          if (err) {
            console.error('Error retrieving created user:', err);
            reject(new Error('User created but failed to retrieve'));
            return;
          }
          
          if (!row) {
            reject(new Error('User created but not found'));
            return;
          }
          
          console.log('User created and retrieved successfully:', row);
          
          const user: User = {
            id: row.id,
            username: row.username,
            role: row.role,
            created_at: new Date(row.created_at),
            last_login: row.last_login ? new Date(row.last_login) : undefined,
            pin_expires_at: row.pin_expires_at ? new Date(row.pin_expires_at) : undefined
          };
          
          resolve(user);
        });
      });
    });
  }

  async authenticateUser(username: string, password: string): Promise<User | null> {
    // Use direct SQLite3 instead of prepared statements to avoid bundling issues
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    
    return new Promise((resolve, reject) => {
      const dbPath = path.join(process.cwd(), 'data/eform.db');
      const db = new sqlite3.Database(dbPath);
      
      console.log('Authenticating user with direct SQLite3:', username);
      
      db.get(`
        SELECT id, username, password_hash, role, created_at, last_login, pin_expires_at
        FROM staff_users 
        WHERE username = ? AND active = 1
      `, [username], async (err, userRow: any) => {
        if (err) {
          console.error('SQLite3 query error:', err);
          db.close();
          resolve(null);
          return;
        }

        if (!userRow) {
          console.log('User not found:', username);
          db.close();
          resolve(null);
          return;
        }

        try {
          // Check if password hash is valid
          if (!userRow.password_hash || typeof userRow.password_hash !== 'string' || userRow.password_hash.trim() === '') {
            console.error('Invalid password hash for user:', username);
            db.close();
            resolve(null);
            return;
          }

          const hash = userRow.password_hash.trim();
          console.log('Hash prefix for user', username, ':', hash.substring(0, 10));
          
          let isValid = false;

          // Detect hash type and verify accordingly
          if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
            // bcrypt hash - using bcryptjs for bundle compatibility
            console.log('Verifying bcrypt hash for user:', username);
            isValid = await bcryptjs.compare(password, hash);
          } else if (hash.startsWith('$argon2')) {
            // argon2 hash
            console.log('Verifying argon2 hash for user:', username);
            isValid = await argon2.verify(hash, password);
          } else {
            console.error('Unknown hash format for user:', username, 'Hash starts with:', hash.substring(0, 10));
            db.close();
            resolve(null);
            return;
          }

          console.log('Password verification result for', username, ':', isValid);

          if (!isValid) {
            db.close();
            resolve(null);
            return;
          }

          // Update last login
          db.run(`
            UPDATE staff_users 
            SET last_login = datetime('now') 
            WHERE id = ?
          `, [userRow.id], (updateErr) => {
            if (updateErr) {
              console.error('Error updating last login:', updateErr);
            }
            
            db.close();
            
            resolve({
              id: userRow.id,
              username: userRow.username,
              role: userRow.role,
              created_at: new Date(userRow.created_at),
              last_login: userRow.last_login ? new Date(userRow.last_login) : undefined,
              pin_expires_at: userRow.pin_expires_at ? new Date(userRow.pin_expires_at) : undefined
            });
          });
        } catch (error) {
          console.error('Password verification error for user', username, ':', error);
          db.close();
          resolve(null);
        }
      });
    });
  }

  async changePassword(userId: number, newPassword: string): Promise<void> {
    const hashedPassword = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });

    // Use direct SQLite3 instead of prepared statements
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    
    return new Promise((resolve, reject) => {
      const dbPath = path.join(process.cwd(), 'data/eform.db');
      const db = new sqlite3.Database(dbPath);
      
      db.run(`
        UPDATE staff_users 
        SET password_hash = ?, pin_expires_at = datetime('now', '+90 days')
        WHERE id = ?
      `, [hashedPassword, userId], (err) => {
        db.close();
        if (err) {
          reject(new Error(`Failed to change password: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async getUserById(id: number): Promise<User> {
    // Use direct SQLite3 instead of prepared statements
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    
    return new Promise((resolve, reject) => {
      const dbPath = path.join(process.cwd(), 'data/eform.db');
      const db = new sqlite3.Database(dbPath);
      
      db.get(`
        SELECT id, username, role, created_at, last_login, pin_expires_at
        FROM staff_users 
        WHERE id = ? AND active = 1
      `, [id], (err, userRow: any) => {
        db.close();
        
        if (err) {
          reject(new Error(`Database error: ${err.message}`));
          return;
        }

        if (!userRow) {
          reject(new Error(`User not found with ID: ${id}`));
          return;
        }

        resolve({
          id: userRow.id,
          username: userRow.username,
          role: userRow.role,
          created_at: new Date(userRow.created_at),
          last_login: userRow.last_login ? new Date(userRow.last_login) : undefined,
          pin_expires_at: userRow.pin_expires_at ? new Date(userRow.pin_expires_at) : undefined
        });
      });
    });
  }

  async isPasswordExpired(userId: number): Promise<boolean> {
    // Use direct SQLite3 instead of prepared statements
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    
    return new Promise((resolve, reject) => {
      const dbPath = path.join(process.cwd(), 'data/eform.db');
      const db = new sqlite3.Database(dbPath);
      
      db.get(`
        SELECT pin_expires_at FROM staff_users WHERE id = ?
      `, [userId], (err, result: any) => {
        db.close();
        
        if (err) {
          reject(new Error(`Database error: ${err.message}`));
          return;
        }

        if (!result || !result.pin_expires_at) {
          resolve(true); // Force password change if no expiry date
          return;
        }

        resolve(new Date(result.pin_expires_at) < new Date());
      });
    });
  }

  async listUsers(): Promise<User[]> {
    // Use direct SQLite3 instead of prepared statements
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    
    return new Promise((resolve, reject) => {
      const dbPath = path.join(process.cwd(), 'data/eform.db');
      const db = new sqlite3.Database(dbPath);
      
      db.all(`
        SELECT id, username, role, created_at, last_login, pin_expires_at
        FROM staff_users 
        WHERE active = 1
        ORDER BY username
      `, [], (err, rows: any[]) => {
        db.close();
        
        if (err) {
          reject(new Error(`Database error: ${err.message}`));
          return;
        }

        const users = rows.map(row => ({
          id: row.id,
          username: row.username,
          role: row.role,
          created_at: new Date(row.created_at),
          last_login: row.last_login ? new Date(row.last_login) : undefined,
          pin_expires_at: row.pin_expires_at ? new Date(row.pin_expires_at) : undefined
        }));

        resolve(users);
      });
    });
  }

  async hasAdminUsers(): Promise<boolean> {
    // Use direct SQLite3 instead of prepared statements
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    
    return new Promise((resolve, reject) => {
      const dbPath = path.join(process.cwd(), 'data/eform.db');
      const db = new sqlite3.Database(dbPath);
      
      db.get(`
        SELECT COUNT(*) as count 
        FROM staff_users 
        WHERE active = 1 AND role = 'admin'
      `, [], (err, result: any) => {
        db.close();
        
        if (err) {
          reject(new Error(`Database error: ${err.message}`));
          return;
        }

        resolve(result.count > 0);
      });
    });
  }

  async deactivateUser(userId: number): Promise<void> {
    // Use direct SQLite3 instead of prepared statements
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    
    return new Promise((resolve, reject) => {
      const dbPath = path.join(process.cwd(), 'data/eform.db');
      const db = new sqlite3.Database(dbPath);
      
      db.run(`
        UPDATE staff_users 
        SET active = 0 
        WHERE id = ?
      `, [userId], (err) => {
        db.close();
        if (err) {
          reject(new Error(`Failed to deactivate user: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }
}
