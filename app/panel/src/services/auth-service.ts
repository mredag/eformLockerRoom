import argon2 from 'argon2';
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
    const db = this.dbManager.getConnection().getDatabase();
    const userRow = db.prepare(`
      SELECT id, username, password_hash, role, created_at, last_login, pin_expires_at
      FROM staff_users 
      WHERE username = ? AND active = 1
    `).get(username) as any;

    if (!userRow) {
      return null;
    }

    try {
      // Check if password hash is valid
      if (!userRow.password_hash || typeof userRow.password_hash !== 'string' || userRow.password_hash.trim() === '') {
        console.error('Invalid password hash for user:', username);
        return null;
      }

      const isValid = await argon2.verify(userRow.password_hash, password);
      if (!isValid) {
        return null;
      }

      // Update last login
      db.prepare(`
        UPDATE staff_users 
        SET last_login = datetime('now') 
        WHERE id = ?
      `).run(userRow.id);

      return {
        id: userRow.id,
        username: userRow.username,
        role: userRow.role,
        created_at: new Date(userRow.created_at),
        last_login: userRow.last_login ? new Date(userRow.last_login) : undefined,
        pin_expires_at: userRow.pin_expires_at ? new Date(userRow.pin_expires_at) : undefined
      };
    } catch (error) {
      console.error('Password verification error:', error);
      return null;
    }
  }

  async changePassword(userId: number, newPassword: string): Promise<void> {
    const hashedPassword = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });

    const db = this.dbManager.getConnection().getDatabase();
    db.prepare(`
      UPDATE staff_users 
      SET password_hash = ?, pin_expires_at = datetime('now', '+90 days')
      WHERE id = ?
    `).run(hashedPassword, userId);
  }

  async getUserById(id: number): Promise<User> {
    const db = this.dbManager.getConnection().getDatabase();
    const userRow = db.prepare(`
      SELECT id, username, role, created_at, last_login, pin_expires_at
      FROM staff_users 
      WHERE id = ? AND active = 1
    `).get(id) as any;

    if (!userRow) {
      throw new Error(`User not found with ID: ${id}`);
    }

    return {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
      created_at: new Date(userRow.created_at),
      last_login: userRow.last_login ? new Date(userRow.last_login) : undefined,
      pin_expires_at: userRow.pin_expires_at ? new Date(userRow.pin_expires_at) : undefined
    };
  }

  async isPasswordExpired(userId: number): Promise<boolean> {
    const db = this.dbManager.getConnection().getDatabase();
    const result = db.prepare(`
      SELECT pin_expires_at FROM staff_users WHERE id = ?
    `).get(userId) as any;

    if (!result || !result.pin_expires_at) {
      return true; // Force password change if no expiry date
    }

    return new Date(result.pin_expires_at) < new Date();
  }

  async listUsers(): Promise<User[]> {
    const db = this.dbManager.getConnection().getDatabase();
    const rows = db.prepare(`
      SELECT id, username, role, created_at, last_login, pin_expires_at
      FROM staff_users 
      WHERE active = 1
      ORDER BY username
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      username: row.username,
      role: row.role,
      created_at: new Date(row.created_at),
      last_login: row.last_login ? new Date(row.last_login) : undefined,
      pin_expires_at: row.pin_expires_at ? new Date(row.pin_expires_at) : undefined
    }));
  }

  async hasAdminUsers(): Promise<boolean> {
    const db = this.dbManager.getConnection().getDatabase();
    const result = db.prepare(`
      SELECT COUNT(*) as count 
      FROM staff_users 
      WHERE active = 1 AND role = 'admin'
    `).get() as any;

    return result.count > 0;
  }

  async deactivateUser(userId: number): Promise<void> {
    const db = this.dbManager.getConnection().getDatabase();
    db.prepare(`
      UPDATE staff_users 
      SET active = 0 
      WHERE id = ?
    `).run(userId);
  }
}
