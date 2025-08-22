#!/usr/bin/env node

/**
 * Configuration Setup Script
 * Helps set up system configuration for different environments
 */

import fs from 'fs';
import path from 'path';
import { createHash, randomBytes } from 'crypto';

const CONFIG_DIR = './config';
const ENVIRONMENTS = ['development', 'production', 'test'];

function generateSecureSecret(length = 64) {
  return randomBytes(length).toString('hex');
}

function generateSystemId() {
  const timestamp = Date.now().toString();
  const random = randomBytes(8).toString('hex');
  return createHash('sha256').update(timestamp + random).digest('hex').substring(0, 16);
}

function loadConfig(environment = 'production') {
  const baseConfigPath = path.join(CONFIG_DIR, 'system.json');
  const envConfigPath = path.join(CONFIG_DIR, `${environment}.json`);
  
  if (!fs.existsSync(baseConfigPath)) {
    console.error('❌ Base system.json not found');
    process.exit(1);
  }
  
  const baseConfig = JSON.parse(fs.readFileSync(baseConfigPath, 'utf8'));
  
  if (fs.existsSync(envConfigPath)) {
    const envConfig = JSON.parse(fs.readFileSync(envConfigPath, 'utf8'));
    return mergeConfigs(baseConfig, envConfig);
  }
  
  return baseConfig;
}

function mergeConfigs(base, override) {
  const result = { ...base };
  
  for (const [key, value] of Object.entries(override)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = mergeConfigs(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

function setupProductionSecrets(config) {
  console.log('🔐 Setting up production secrets...');
  
  // Generate secure secrets
  const secrets = {
    provisioning_secret: generateSecureSecret(32),
    session_secret: generateSecureSecret(32),
    qr_hmac_secret: generateSecureSecret(32)
  };
  
  // Update config
  config.security.provisioning_secret = secrets.provisioning_secret;
  config.security.session_secret = secrets.session_secret;
  config.qr.hmac_secret = secrets.qr_hmac_secret;
  
  // Add system ID
  config.system.system_id = generateSystemId();
  config.system.setup_date = new Date().toISOString();
  
  console.log('✅ Production secrets generated');
  console.log('⚠️  IMPORTANT: Save these secrets securely!');
  console.log('   System ID:', config.system.system_id);
  
  return config;
}

function validateConfig(config) {
  console.log('🔍 Validating configuration...');
  
  const errors = [];
  
  // Check required fields
  if (!config.system?.name) errors.push('Missing system.name');
  if (!config.database?.path) errors.push('Missing database.path');
  if (!config.services?.gateway?.port) errors.push('Missing gateway port');
  if (!config.services?.kiosk?.port) errors.push('Missing kiosk port');
  if (!config.services?.panel?.port) errors.push('Missing panel port');
  
  // Check hardware config
  if (!config.hardware?.modbus?.port) errors.push('Missing modbus port');
  if (!config.hardware?.relay_cards?.length) errors.push('No relay cards configured');
  
  // Check security
  if (config.security?.provisioning_secret?.includes('change-this')) {
    errors.push('Provisioning secret not changed from default');
  }
  if (config.security?.session_secret?.includes('change-this')) {
    errors.push('Session secret not changed from default');
  }
  
  // Check port conflicts
  const ports = [
    config.services.gateway.port,
    config.services.kiosk.port,
    config.services.panel.port
  ];
  const uniquePorts = new Set(ports);
  if (uniquePorts.size !== ports.length) {
    errors.push('Port conflicts detected');
  }
  
  if (errors.length > 0) {
    console.log('❌ Configuration validation failed:');
    errors.forEach(error => console.log(`   - ${error}`));
    return false;
  }
  
  console.log('✅ Configuration validation passed');
  return true;
}

function displayConfig(config, environment) {
  console.log(`\n📋 Configuration Summary (${environment}):`);
  console.log('==========================================');
  console.log(`System: ${config.system.name} v${config.system.version}`);
  console.log(`Environment: ${config.system.environment}`);
  console.log(`Database: ${config.database.path}`);
  console.log(`Gateway: http://localhost:${config.services.gateway.port}`);
  console.log(`Kiosk: http://localhost:${config.services.kiosk.port}`);
  console.log(`Panel: http://localhost:${config.services.panel.port}`);
  console.log(`Modbus: ${config.hardware.modbus.port} @ ${config.hardware.modbus.baudrate}`);
  console.log(`Relay Cards: ${config.hardware.relay_cards.length} configured`);
  console.log(`RFID: ${config.hardware.rfid.reader_type} mode`);
  console.log(`Language: ${config.i18n.default_language}`);
  console.log(`Logging: ${config.logging.level} level`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'setup';
  const environment = args[1] || 'production';
  
  console.log('🔧 Eform Locker System Configuration Setup');
  console.log('==========================================\n');
  
  if (!ENVIRONMENTS.includes(environment)) {
    console.error(`❌ Invalid environment: ${environment}`);
    console.error(`Available: ${ENVIRONMENTS.join(', ')}`);
    process.exit(1);
  }
  
  switch (command) {
    case 'setup':
      console.log(`Setting up ${environment} configuration...`);
      let config = loadConfig(environment);
      
      if (environment === 'production') {
        config = setupProductionSecrets(config);
      }
      
      if (validateConfig(config)) {
        displayConfig(config, environment);
        
        // Save the final config
        const outputPath = path.join(CONFIG_DIR, `${environment}-final.json`);
        fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
        console.log(`\n✅ Configuration saved to: ${outputPath}`);
      } else {
        process.exit(1);
      }
      break;
      
    case 'validate':
      console.log(`Validating ${environment} configuration...`);
      const configToValidate = loadConfig(environment);
      if (!validateConfig(configToValidate)) {
        process.exit(1);
      }
      displayConfig(configToValidate, environment);
      break;
      
    case 'show':
      console.log(`Displaying ${environment} configuration...`);
      const configToShow = loadConfig(environment);
      displayConfig(configToShow, environment);
      break;
      
    default:
      console.log('Usage: node setup-config.js [command] [environment]');
      console.log('Commands: setup, validate, show');
      console.log(`Environments: ${ENVIRONMENTS.join(', ')}`);
      break;
  }
}

main();