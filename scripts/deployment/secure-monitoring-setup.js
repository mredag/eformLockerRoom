#!/usr/bin/env node

/**
 * Smart Assignment System - Security-Compliant Monitoring Setup
 * Version: 1.0.0
 * Description: Production monitoring with ConfigurationManager integration
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DB_PATH = path.join(PROJECT_ROOT, 'data/eform.db');

// Error schema: { code, message }
const createError = (code, message) => ({ code, message });

// Security: Never log card IDs or seeds - mask sensitive data
const maskSensitiveData = (data) => {
    if (typeof data === 'string') {
        // Mask potential card IDs (10+ digits)
        return data.replace(/\b\d{10,}\b/g, '***MASKED***');
    }
    if (typeof data === 'object' && data !== null) {
        const masked = { ...data };
        ['card_id', 'owner_key', 'seed', 'rfid_id'].forEach(key => {
            if (masked[key]) {
                masked[key] = '***MASKED***';
            }
        });
        return masked;
    }
    return data;
};

// Logging with security compliance - all log lines end with a period.
const log = (message, level = 'INFO', data = null) => {
    const timestamp = new Date().toISOString();
    const maskedData = data ? maskSensitiveData(data) : null;
    const logEntry = `[${timestamp}] ${level}: ${message}${maskedData ? ` Data: ${JSON.stringify(maskedData)}` : ''}.`;
    console.log(logEntry);
};

// Configuration Manager integration
class SecureConfigurationManager {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.cache = new Map();
        this.lastReload = 0;
        this.reloadInterval = 3000; // 3 seconds for hot reload
    }

    async getThresholds() {
        const now = Date.now();
        if (now - this.lastReload > this.reloadInterval) {
            await this.reloadConfiguration();
            this.lastReload = now;
        }
        
        return {
            cpu_usage_warning: this.get('monitoring_cpu_warning', 80),
            cpu_usage_critical: this.get('monitoring_cpu_critical', 95),
            memory_usage_warning: this.get('monitoring_memory_warning', 80),
            memory_usage_critical: this.get('monitoring_memory_critical', 95),
            disk_usage_warning: this.get('monitoring_disk_warning', 80),
            disk_usage_critical: this.get('monitoring_disk_critical', 90),
            websocket_update_interval: this.get('monitoring_websocket_interval', 1000), // 1 Hz max
            alert_check_interval: this.get('monitoring_alert_interval', 60000) // 1 minute
        };
    }

    async reloadConfiguration() {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    log('Configuration reload failed', 'ERROR', createError('DB_CONNECTION', err.message));
                    reject(createError('DB_CONNECTION', err.message));
                    return;
                }

                db.all("SELECT key, value, data_type FROM settings_global", (err, rows) => {
                    if (err) {
                        log('Configuration query failed', 'ERROR', createError('DB_QUERY', err.message));
                        db.close();
                        reject(createError('DB_QUERY', err.message));
                        return;
                    }

                    this.cache.clear();
                    rows.forEach(row => {
                        let value = row.value;
                        if (row.data_type === 'number') {
                            value = parseFloat(value);
                        } else if (row.data_type === 'boolean') {
                            value = value === 'true';
                        } else if (row.data_type === 'json') {
                            try {
                                value = JSON.parse(value);
                            } catch (e) {
                                log('Invalid JSON in configuration', 'WARN', createError('JSON_PARSE', e.message));
                            }
                        }
                        this.cache.set(row.key, value);
                    });

                    log('Configuration reloaded successfully', 'INFO', { entries: rows.length });
                    db.close();
                    resolve();
                });
            });
        });
    }

    get(key, defaultValue = null) {
        return this.cache.has(key) ? this.cache.get(key) : defaultValue;
    }
}

// WebSocket monitoring with rate limiting (1 Hz max)
class SecureWebSocketMonitor {
    constructor(configManager) {
        this.configManager = configManager;
        this.lastUpdate = 0;
        this.updateQueue = [];
    }

    async sendUpdate(data) {
        const thresholds = await this.configManager.getThresholds();
        const now = Date.now();
        
        // Enforce 1 Hz rate limit
        if (now - this.lastUpdate < thresholds.websocket_update_interval) {
            this.updateQueue.push(data);
            return;
        }

        // Remove PII from payloads
        const sanitizedData = this.sanitizePayload(data);
        
        // Send update (implementation would connect to actual WebSocket)
        log('WebSocket update sent', 'INFO', { type: sanitizedData.type, timestamp: now });
        this.lastUpdate = now;
        
        // Process queued updates if any
        if (this.updateQueue.length > 0) {
            const queuedData = this.updateQueue.shift();
            setTimeout(() => this.sendUpdate(queuedData), thresholds.websocket_update_interval);
        }
    }

    sanitizePayload(data) {
        // Remove PII: no card IDs, user identifiers, or sensitive data
        const sanitized = { ...data };
        delete sanitized.card_id;
        delete sanitized.owner_key;
        delete sanitized.user_id;
        delete sanitized.rfid_id;
        
        // Mask any remaining sensitive fields
        return maskSensitiveData(sanitized);
    }
}

// File permissions setup (640 for config files)
const setSecurePermissions = () => {
    const configFiles = [
        path.join(PROJECT_ROOT, 'config/system.json'),
        path.join(PROJECT_ROOT, '.env'),
        path.join(PROJECT_ROOT, 'monitoring/config/monitoring.json')
    ];

    configFiles.forEach(file => {
        if (fs.existsSync(file)) {
            try {
                fs.chmodSync(file, 0o640); // 640 permissions
                log('Secure permissions set', 'INFO', { file: path.basename(file) });
            } catch (error) {
                log('Failed to set permissions', 'WARN', createError('CHMOD_FAILED', error.message));
            }
        }
    });
};

// Emergency disable functionality
const EMERGENCY_DISABLE = async () => {
    log('EMERGENCY_DISABLE activated', 'CRITICAL');
    
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                const error = createError('EMERGENCY_DB_FAIL', err.message);
                log('Emergency disable failed', 'CRITICAL', error);
                reject(error);
                return;
            }

            db.run("UPDATE settings_global SET value='false' WHERE key='smart_assignment_enabled'", (err) => {
                if (err) {
                    const error = createError('EMERGENCY_UPDATE_FAIL', err.message);
                    log('Emergency disable update failed', 'CRITICAL', error);
                    db.close();
                    reject(error);
                    return;
                }

                log('Smart assignment emergency disabled', 'CRITICAL');
                db.close();
                resolve();
            });
        });
    });
};

// Deployment audit logging
const writeDeploymentAudit = (version, editor, status) => {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                reject(createError('AUDIT_DB_FAIL', err.message));
                return;
            }

            const auditData = {
                deployment_id: `smart-assignment-${version}`,
                version: version,
                editor: editor,
                status: status,
                timestamp: new Date().toISOString(),
                git_sha: process.env.GIT_SHA || 'unknown'
            };

            db.run(`
                INSERT INTO deployment_audit (deployment_id, version, editor, status, timestamp, git_sha, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                auditData.deployment_id,
                auditData.version,
                auditData.editor,
                auditData.status,
                auditData.timestamp,
                auditData.git_sha,
                JSON.stringify(auditData)
            ], (err) => {
                if (err) {
                    log('Deployment audit write failed', 'ERROR', createError('AUDIT_WRITE_FAIL', err.message));
                } else {
                    log('Deployment audit recorded', 'INFO', { deployment_id: auditData.deployment_id });
                }
                db.close();
                resolve();
            });
        });
    });
};

// Main setup function
async function setupSecureMonitoring() {
    try {
        log('Starting secure monitoring setup', 'INFO');

        // Initialize configuration manager
        const configManager = new SecureConfigurationManager(DB_PATH);
        await configManager.reloadConfiguration();

        // Get current thresholds
        const thresholds = await configManager.getThresholds();
        log('Monitoring thresholds loaded', 'INFO', thresholds);

        // Initialize WebSocket monitor
        const wsMonitor = new SecureWebSocketMonitor(configManager);

        // Set secure file permissions
        setSecurePermissions();

        // Write deployment audit
        await writeDeploymentAudit('1.0.0', 'deployment-script', 'monitoring-setup');

        log('Secure monitoring setup completed successfully', 'INFO');

        return {
            configManager,
            wsMonitor,
            EMERGENCY_DISABLE,
            thresholds
        };

    } catch (error) {
        log('Secure monitoring setup failed', 'ERROR', error);
        throw error;
    }
}

// Export for use in other modules
module.exports = {
    SecureConfigurationManager,
    SecureWebSocketMonitor,
    EMERGENCY_DISABLE,
    setupSecureMonitoring,
    writeDeploymentAudit,
    maskSensitiveData,
    createError
};

// Run setup if called directly
if (require.main === module) {
    setupSecureMonitoring()
        .then(() => {
            log('Monitoring setup script completed', 'INFO');
            process.exit(0);
        })
        .catch((error) => {
            log('Monitoring setup script failed', 'ERROR', error);
            process.exit(1);
        });
}