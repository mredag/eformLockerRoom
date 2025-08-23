#!/usr/bin/env node

import { ProvisioningService } from '../services/provisioning';
import { DatabaseConnection } from '../database/connection';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Usage: provision <command> [options]');
    console.log('Commands:');
    console.log('  token <zone>     Generate provisioning token for zone');
    console.log('  list             List all kiosks');
    console.log('  cleanup          Clean up expired tokens');
    process.exit(1);
  }

  try {
    // Initialize database
    const db = DatabaseConnection.getInstance();
    await db.initializeSchema();
    
    const provisioningService = new ProvisioningService();

    switch (command) {
      case 'token': {
        const zone = args[1];
        if (!zone) {
          console.error('Error: Zone is required');
          console.log('Usage: provision token <zone>');
          process.exit(1);
        }

        const token = await provisioningService.generateProvisioningToken(zone);
        const qrData = provisioningService.generateProvisioningQR(token.token);

        console.log('Provisioning Token Generated:');
        console.log('============================');
        console.log(`Token: ${token.token}`);
        console.log(`Kiosk ID: ${token.kiosk_id}`);
        console.log(`Zone: ${token.zone}`);
        console.log(`Expires: ${token.expires_at.toISOString()}`);
        console.log(`QR Data: ${qrData}`);
        console.log('');
        console.log('Share this token with the kiosk installer.');
        break;
      }

      case 'list': {
        const kiosks = await provisioningService.listKiosks();
        
        console.log('Registered Kiosks:');
        console.log('==================');
        if (kiosks.length === 0) {
          console.log('No kiosks registered yet.');
        } else {
          console.table(kiosks.map(k => ({
            'Kiosk ID': k.kiosk_id,
            'Zone': k.zone,
            'Status': k.status,
            'Version': k.version,
            'Last Seen': new Date(k.last_seen).toLocaleString()
          })));
        }
        break;
      }

      case 'cleanup': {
        await provisioningService.cleanupExpiredTokens();
        console.log('Expired provisioning tokens cleaned up successfully.');
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }

    await db.close();
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
