#!/usr/bin/env node
/**
 * Dynamic IP Management System
 * Automatically handles IP address changes without manual configuration
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DynamicIPManager {
    constructor() {
        this.configPath = path.join(__dirname, '../../config/network-config.json');
        this.logPath = path.join(__dirname, '../../logs/ip-manager.log');
        this.ensureDirectories();
    }

    ensureDirectories() {
        const dirs = [
            path.dirname(this.configPath),
            path.dirname(this.logPath)
        ];
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}\n`;
        console.log(message);
        fs.appendFileSync(this.logPath, logEntry);
    }

    getCurrentIP() {
        try {
            // Get the primary network interface IP
            const interfaces = execSync('hostname -I', { encoding: 'utf8' }).trim().split(' ');
            const primaryIP = interfaces[0];
            
            // Validate IP format
            const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
            if (ipRegex.test(primaryIP)) {
                return primaryIP;
            }
            
            throw new Error('Invalid IP format detected');
        } catch (error) {
            this.log(`❌ Error getting current IP: ${error.message}`);
            return null;
        }
    }

    getStoredConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            }
        } catch (error) {
            this.log(`⚠️  Error reading stored config: ${error.message}`);
        }
        
        return {
            lastKnownIP: null,
            lastUpdate: null,
            changeHistory: []
        };
    }

    saveConfig(config) {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            this.log(`✅ Network configuration saved`);
        } catch (error) {
            this.log(`❌ Error saving config: ${error.message}`);
        }
    }

    detectIPChange() {
        const currentIP = this.getCurrentIP();
        const config = this.getStoredConfig();
        
        if (!currentIP) {
            return { changed: false, error: 'Could not detect current IP' };
        }

        const hasChanged = config.lastKnownIP && config.lastKnownIP !== currentIP;
        
        return {
            changed: hasChanged,
            currentIP,
            previousIP: config.lastKnownIP,
            isFirstRun: !config.lastKnownIP
        };
    }

    updateConfiguration(currentIP, previousIP = null) {
        const config = this.getStoredConfig();
        
        // Update configuration
        config.lastKnownIP = currentIP;
        config.lastUpdate = new Date().toISOString();
        
        if (previousIP) {
            config.changeHistory.push({
                from: previousIP,
                to: currentIP,
                timestamp: new Date().toISOString()
            });
            
            // Keep only last 10 changes
            if (config.changeHistory.length > 10) {
                config.changeHistory = config.changeHistory.slice(-10);
            }
        }
        
        this.saveConfig(config);
        return config;
    }

    generateNetworkInfo(currentIP) {
        const networkInfo = {
            currentIP,
            webInterfaces: {
                adminPanel: `http://${currentIP}:3001`,
                kioskUI: `http://${currentIP}:3002`,
                gatewayAPI: `http://${currentIP}:3000`
            },
            sshAccess: `ssh pi@${currentIP}`,
            healthChecks: {
                gateway: `curl http://${currentIP}:3000/health`,
                panel: `curl http://${currentIP}:3001/health`,
                kiosk: `curl http://${currentIP}:3002/health`
            },
            timestamp: new Date().toISOString()
        };
        
        return networkInfo;
    }

    updateStartupScript(currentIP) {
        try {
            const startupScriptPath = path.join(__dirname, '../start-all-clean.sh');
            if (fs.existsSync(startupScriptPath)) {
                let content = fs.readFileSync(startupScriptPath, 'utf8');
                
                // Update IP addresses in the display messages
                content = content.replace(
                    /http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:/g,
                    `http://${currentIP}:`
                );
                
                fs.writeFileSync(startupScriptPath, content);
                this.log(`✅ Updated startup script with IP ${currentIP}`);
            }
        } catch (error) {
            this.log(`⚠️  Could not update startup script: ${error.message}`);
        }
    }

    updateWindowsScripts(currentIP) {
        try {
            const scriptsToUpdate = [
                'scripts/deployment/find-pi.ps1',
                'scripts/deployment/pi-manager.ps1',
                'scripts/deployment/smart-pi-manager.ps1'
            ];
            
            scriptsToUpdate.forEach(scriptPath => {
                const fullPath = path.join(__dirname, '../../', scriptPath);
                if (fs.existsSync(fullPath)) {
                    let content = fs.readFileSync(fullPath, 'utf8');
                    
                    // Update known IPs array to include current IP
                    const ipArrayRegex = /\$KNOWN_IPS\s*=\s*@\([^)]+\)/;
                    if (ipArrayRegex.test(content)) {
                        const newIPArray = `$KNOWN_IPS = @("${currentIP}", "192.168.1.8", "192.168.1.10", "192.168.1.11", "192.168.1.12")`;
                        content = content.replace(ipArrayRegex, newIPArray);
                        fs.writeFileSync(fullPath, content);
                        this.log(`✅ Updated ${scriptPath} with current IP`);
                    }
                }
            });
        } catch (error) {
            this.log(`⚠️  Could not update Windows scripts: ${error.message}`);
        }
    }

    generateAccessInfo(currentIP) {
        const accessInfo = `
# 🌐 Current Network Access Information
# Generated: ${new Date().toISOString()}
# IP Address: ${currentIP}

## Web Interfaces
- Admin Panel:  http://${currentIP}:3001
- Kiosk UI:     http://${currentIP}:3002  
- Gateway API:  http://${currentIP}:3000

## SSH Access
ssh pi@${currentIP}

## Health Checks
curl http://${currentIP}:3000/health  # Gateway
curl http://${currentIP}:3001/health  # Panel
curl http://${currentIP}:3002/health  # Kiosk

## API Testing
# Open locker
curl -X POST http://${currentIP}:3002/api/locker/open \\
  -H "Content-Type: application/json" \\
  -d '{"locker_id": 5, "staff_user": "test", "reason": "testing"}'

# Activate relay
curl -X POST http://${currentIP}:3001/api/relay/activate \\
  -H "Content-Type: application/json" \\
  -d '{"relay_number": 3, "staff_user": "test", "reason": "testing"}'
`;
        
        const infoPath = path.join(__dirname, '../../CURRENT_NETWORK_INFO.md');
        fs.writeFileSync(infoPath, accessInfo);
        this.log(`✅ Generated current network info file`);
    }

    run() {
        this.log('🔍 Starting Dynamic IP Manager...');
        
        const detection = this.detectIPChange();
        
        if (detection.error) {
            this.log(`❌ ${detection.error}`);
            return false;
        }
        
        const { currentIP, previousIP, changed, isFirstRun } = detection;
        
        if (isFirstRun) {
            this.log(`🎯 First run detected - Current IP: ${currentIP}`);
        } else if (changed) {
            this.log(`🔄 IP change detected: ${previousIP} → ${currentIP}`);
        } else {
            this.log(`✅ IP unchanged: ${currentIP}`);
        }
        
        // Always update configuration and generate info
        this.updateConfiguration(currentIP, previousIP);
        this.generateAccessInfo(currentIP);
        
        if (changed || isFirstRun) {
            this.updateStartupScript(currentIP);
            this.updateWindowsScripts(currentIP);
            
            this.log('📋 Network configuration updated successfully');
            this.log(`🌐 Access your system at: http://${currentIP}:3001`);
        }
        
        return true;
    }

    getStatus() {
        const config = this.getStoredConfig();
        const currentIP = this.getCurrentIP();
        
        return {
            currentIP,
            lastKnownIP: config.lastKnownIP,
            lastUpdate: config.lastUpdate,
            changeHistory: config.changeHistory,
            isUpToDate: currentIP === config.lastKnownIP
        };
    }
}

// CLI Interface
if (require.main === module) {
    const manager = new DynamicIPManager();
    
    const command = process.argv[2] || 'run';
    
    switch (command) {
        case 'run':
            manager.run();
            break;
        case 'status':
            console.log(JSON.stringify(manager.getStatus(), null, 2));
            break;
        case 'current-ip':
            console.log(manager.getCurrentIP());
            break;
        default:
            console.log('Usage: node dynamic-ip-manager.js [run|status|current-ip]');
    }
}

module.exports = DynamicIPManager;