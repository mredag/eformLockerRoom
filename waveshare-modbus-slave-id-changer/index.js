#!/usr/bin/env node
/**
 * Waveshare Modbus Slave ID Changer
 * Interactive CLI for configuring Waveshare Modbus RTU Relay card slave addresses
 * 
 * Usage:
 *   node index.js              - Interactive mode
 *   node index.js scan         - Scan for devices
 *   node index.js read         - Read current address
 *   node index.js set          - Set new address
 */

const readline = require('readline');
const SlaveIdChanger = require('./lib/slave-id-changer');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  console.log(`\n${colors.cyan}${colors.bright}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}  ${message}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}${'═'.repeat(60)}${colors.reset}\n`);
}

function logSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

class InteractiveCLI {
  constructor() {
    this.changer = new SlaveIdChanger({ debug: false });
    this.rl = null;
    this.selectedPort = null;
  }

  createReadline() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(`${colors.cyan}${prompt}${colors.reset}`, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async selectFromList(prompt, options) {
    console.log(`\n${prompt}`);
    options.forEach((opt, i) => {
      console.log(`  ${colors.yellow}${i + 1}${colors.reset}. ${opt.label}`);
    });
    
    const answer = await this.question('\nEnter number: ');
    const index = parseInt(answer) - 1;
    
    if (index >= 0 && index < options.length) {
      return options[index].value;
    }
    return null;
  }

  async run() {
    logHeader('Waveshare Modbus Slave ID Changer');
    
    console.log('This tool helps you configure slave addresses on Waveshare');
    console.log('Modbus RTU Relay cards (16CH and 32CH models).\n');

    this.createReadline();

    try {
      await this.mainMenu();
    } catch (error) {
      logError(`Error: ${error.message}`);
    } finally {
      await this.cleanup();
    }
  }

  async mainMenu() {
    while (true) {
      const action = await this.selectFromList('What would you like to do?', [
        { label: 'Select COM Port', value: 'port' },
        { label: 'Scan for Devices', value: 'scan' },
        { label: 'Read Current Slave Address', value: 'read' },
        { label: 'Change Slave Address', value: 'change' },
        { label: 'Test Relay (verify connection)', value: 'test' },
        { label: 'Exit', value: 'exit' }
      ]);

      switch (action) {
        case 'port':
          await this.selectPort();
          break;
        case 'scan':
          await this.scanDevices();
          break;
        case 'read':
          await this.readAddress();
          break;
        case 'change':
          await this.changeAddress();
          break;
        case 'test':
          await this.testRelay();
          break;
        case 'exit':
          return;
        default:
          logWarning('Invalid selection. Please try again.');
      }
    }
  }

  async selectPort() {
    logInfo('Scanning for available COM ports...');
    
    const ports = await this.changer.listPorts();
    
    if (ports.length === 0) {
      logError('No COM ports found. Please connect your USB-RS485 adapter.');
      return;
    }

    console.log('\nAvailable COM ports:');
    ports.forEach((port, i) => {
      const info = port.manufacturer ? ` (${port.manufacturer})` : '';
      console.log(`  ${colors.yellow}${i + 1}${colors.reset}. ${port.path}${info}`);
    });

    const answer = await this.question('\nSelect port number: ');
    const index = parseInt(answer) - 1;

    if (index >= 0 && index < ports.length) {
      this.selectedPort = ports[index].path;
      logSuccess(`Selected: ${this.selectedPort}`);
    } else {
      logWarning('Invalid selection.');
    }
  }

  async ensurePort() {
    if (!this.selectedPort) {
      logWarning('No COM port selected. Please select one first.');
      await this.selectPort();
    }
    return this.selectedPort !== null;
  }

  async scanDevices() {
    if (!await this.ensurePort()) return;

    const startAddr = await this.question('Start address (default: 1): ');
    const endAddr = await this.question('End address (default: 10): ');

    const start = parseInt(startAddr) || 1;
    const end = parseInt(endAddr) || 10;

    try {
      await this.changer.connect(this.selectedPort);
      const devices = await this.changer.scanDevices(start, end);
      
      if (devices.length > 0) {
        logSuccess(`Found ${devices.length} device(s):`);
        devices.forEach(d => {
          console.log(`  - Address ${d.address} (reports address: ${d.reportedAddress})`);
        });
      } else {
        logWarning('No devices found in the specified range.');
      }
    } catch (error) {
      logError(`Scan failed: ${error.message}`);
    } finally {
      await this.changer.disconnect();
    }
  }

  async readAddress() {
    if (!await this.ensurePort()) return;

    const addrInput = await this.question('Enter slave address to query (1-247): ');
    const address = parseInt(addrInput);

    if (isNaN(address) || address < 1 || address > 247) {
      logError('Invalid address. Must be between 1 and 247.');
      return;
    }

    try {
      await this.changer.connect(this.selectedPort);
      const result = await this.changer.readSlaveAddress(address);

      if (result.success) {
        logSuccess(`Device at address ${address} reports slave address: ${result.currentAddress}`);
        console.log(`  Raw response: ${result.rawResponse}`);
      } else {
        logError(`Failed to read: ${result.error}`);
      }
    } catch (error) {
      logError(`Read failed: ${error.message}`);
    } finally {
      await this.changer.disconnect();
    }
  }

  async changeAddress() {
    if (!await this.ensurePort()) return;

    logHeader('Change Slave Address');
    
    logWarning('IMPORTANT: If using broadcast mode, ensure ONLY ONE card is connected!');
    console.log('');

    const method = await this.selectFromList('Select method:', [
      { label: 'Use current address (device responds to specific address)', value: 'specific' },
      { label: 'Use broadcast (0x00) - ONLY when single card connected', value: 'broadcast' }
    ]);

    let currentAddress;
    
    if (method === 'broadcast') {
      currentAddress = 0;
      logWarning('Using BROADCAST mode. All connected devices will receive this command!');
      
      const confirm = await this.question('Are you sure only ONE card is connected? (yes/no): ');
      if (confirm.toLowerCase() !== 'yes') {
        logInfo('Operation cancelled.');
        return;
      }
    } else {
      const currentInput = await this.question('Enter current slave address (1-247): ');
      currentAddress = parseInt(currentInput);
      
      if (isNaN(currentAddress) || currentAddress < 1 || currentAddress > 247) {
        logError('Invalid current address.');
        return;
      }
    }

    const newInput = await this.question('Enter NEW slave address (1-247): ');
    const newAddress = parseInt(newInput);

    if (isNaN(newAddress) || newAddress < 1 || newAddress > 247) {
      logError('Invalid new address. Must be between 1 and 247.');
      return;
    }

    console.log('');
    logInfo(`Changing address from ${currentAddress === 0 ? 'BROADCAST' : currentAddress} to ${newAddress}`);
    
    const confirm = await this.question('Proceed? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      logInfo('Operation cancelled.');
      return;
    }

    try {
      await this.changer.connect(this.selectedPort);
      const result = await this.changer.setSlaveAddress(currentAddress, newAddress);

      if (result.success) {
        logSuccess(result.message);
        if (result.verified) {
          logSuccess('Address change verified successfully!');
        }
      } else {
        logError(`Failed: ${result.error}`);
      }
    } catch (error) {
      logError(`Change failed: ${error.message}`);
    } finally {
      await this.changer.disconnect();
    }
  }

  async testRelay() {
    if (!await this.ensurePort()) return;

    const addrInput = await this.question('Enter slave address (1-247): ');
    const address = parseInt(addrInput);

    if (isNaN(address) || address < 1 || address > 247) {
      logError('Invalid address.');
      return;
    }

    const relayInput = await this.question('Enter relay number (1-32): ');
    const relay = parseInt(relayInput);

    if (isNaN(relay) || relay < 1 || relay > 32) {
      logError('Invalid relay number.');
      return;
    }

    try {
      await this.changer.connect(this.selectedPort);
      
      logInfo(`Turning ON relay ${relay} on device ${address}...`);
      const onResult = await this.changer.testRelay(address, relay, true);
      
      if (onResult.success) {
        logSuccess(`Relay ${relay} turned ON`);
        
        await new Promise(r => setTimeout(r, 1000));
        
        logInfo(`Turning OFF relay ${relay}...`);
        const offResult = await this.changer.testRelay(address, relay, false);
        
        if (offResult.success) {
          logSuccess(`Relay ${relay} turned OFF`);
          logSuccess('Relay test completed successfully!');
        }
      } else {
        logError(`Test failed: ${onResult.error}`);
      }
    } catch (error) {
      logError(`Test failed: ${error.message}`);
    } finally {
      await this.changer.disconnect();
    }
  }

  async cleanup() {
    if (this.rl) {
      this.rl.close();
    }
    await this.changer.disconnect();
    console.log('\nGoodbye! 👋');
  }
}

// Command line argument handling
async function handleCommandLine() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Interactive mode
    const cli = new InteractiveCLI();
    await cli.run();
    return;
  }

  const command = args[0];
  const changer = new SlaveIdChanger({ debug: args.includes('--debug') });

  // Parse arguments
  const getArg = (name) => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 && args[index + 1] ? args[index + 1] : null;
  };

  const port = getArg('port');

  try {
    switch (command) {
      case 'scan': {
        if (!port) {
          logError('Please specify --port (e.g., --port COM3)');
          process.exit(1);
        }
        await changer.connect(port);
        const start = parseInt(getArg('start')) || 1;
        const end = parseInt(getArg('end')) || 10;
        await changer.scanDevices(start, end);
        break;
      }

      case 'read': {
        if (!port) {
          logError('Please specify --port');
          process.exit(1);
        }
        const address = parseInt(getArg('address')) || 1;
        await changer.connect(port);
        const result = await changer.readSlaveAddress(address);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'set': {
        if (!port) {
          logError('Please specify --port');
          process.exit(1);
        }
        const newAddr = parseInt(getArg('new'));
        if (!newAddr) {
          logError('Please specify --new (new slave address)');
          process.exit(1);
        }
        const currentAddr = args.includes('--broadcast') ? 0 : parseInt(getArg('current')) || 1;
        
        await changer.connect(port);
        const result = await changer.setSlaveAddress(currentAddr, newAddr);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'help':
      default:
        console.log(`
Waveshare Modbus Slave ID Changer

Usage:
  node index.js                    Interactive mode (recommended)
  node index.js scan --port COM3   Scan for devices
  node index.js read --port COM3   Read slave address
  node index.js set --port COM3    Set new slave address

Options:
  --port <port>      COM port (e.g., COM3, COM4)
  --address <n>      Slave address to query (for read)
  --current <n>      Current slave address (for set)
  --new <n>          New slave address (for set)
  --broadcast        Use broadcast address 0x00 (for set)
  --start <n>        Start address for scan (default: 1)
  --end <n>          End address for scan (default: 10)
  --debug            Enable debug output

Examples:
  node index.js scan --port COM3 --start 1 --end 5
  node index.js read --port COM3 --address 1
  node index.js set --port COM3 --current 1 --new 2
  node index.js set --port COM3 --broadcast --new 2
        `);
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    process.exit(1);
  } finally {
    await changer.disconnect();
  }
}

// Run
handleCommandLine().catch(console.error);
