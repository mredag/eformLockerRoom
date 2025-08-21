#!/usr/bin/env node

import { UpdateAgent } from './services/update-agent.js';

/**
 * Eform Update Agent
 * 
 * Handles automatic updates with security verification:
 * - SHA256 checksum validation
 * - Minisign signature verification
 * - Automatic rollback on failure
 * - 30-minute update check intervals
 */

async function main() {
  console.log('Starting Eform Update Agent...');
  
  try {
    const updateAgent = new UpdateAgent();
    
    // Start automatic update checking
    updateAgent.startUpdateChecker();
    
    console.log('Update Agent started successfully');
    
    // Keep the process running
    process.on('SIGINT', () => {
      console.log('Shutting down Update Agent...');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.log('Shutting down Update Agent...');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start Update Agent:', error);
    process.exit(1);
  }
}

main().catch(console.error);