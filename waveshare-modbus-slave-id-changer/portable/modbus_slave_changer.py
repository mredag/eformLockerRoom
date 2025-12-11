#!/usr/bin/env python3
"""
Waveshare Modbus Slave ID Changer - Portable Version
No installation required - just run the .exe file

Supports:
- Waveshare Modbus RTU Relay 16CH
- Waveshare Modbus RTU Relay 32CH
- Any Waveshare relay card using register 0x4000 for slave address storage
"""

import serial
import serial.tools.list_ports
import struct
import time
import sys
import os
from typing import Optional, List, Dict, Tuple

class Colors:
    """ANSI color codes for terminal output"""
    RESET = '\033[0m'
    BRIGHT = '\033[1m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    CYAN = '\033[36m'

def log(message: str, color: str = 'RESET') -> None:
    """Print colored message"""
    color_code = getattr(Colors, color.upper(), Colors.RESET)
    print(f"{color_code}{message}{Colors.RESET}")

def log_header(message: str) -> None:
    """Print header with border"""
    print(f"\n{Colors.CYAN}{Colors.BRIGHT}{'═' * 60}{Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BRIGHT}  {message}{Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BRIGHT}{'═' * 60}{Colors.RESET}\n")

def log_success(message: str) -> None:
    log(f"✅ {message}", 'GREEN')

def log_error(message: str) -> None:
    log(f"❌ {message}", 'RED')

def log_warning(message: str) -> None:
    log(f"⚠️  {message}", 'YELLOW')

def log_info(message: str) -> None:
    log(f"ℹ️  {message}", 'BLUE')

class ModbusUtils:
    """Modbus RTU utility functions"""
    
    SLAVE_ADDRESS_REGISTER = 0x4000
    
    @staticmethod
    def calculate_crc16(data: bytes) -> int:
        """Calculate CRC16 checksum for Modbus RTU"""
        crc = 0xFFFF
        
        for byte in data:
            crc ^= byte
            for _ in range(8):
                if crc & 0x0001:
                    crc = (crc >> 1) ^ 0xA001
                else:
                    crc = crc >> 1
        
        return crc
    
    @staticmethod
    def build_read_register_command(slave_id: int, register: int = 0x4000, count: int = 1) -> bytes:
        """Build Read Holding Register command (Function 0x03)"""
        data = struct.pack('>BBHH', slave_id, 0x03, register, count)
        crc = ModbusUtils.calculate_crc16(data)
        return data + struct.pack('<H', crc)
    
    @staticmethod
    def build_write_register_command(slave_id: int, register: int, value: int) -> bytes:
        """Build Write Single Register command (Function 0x06)"""
        data = struct.pack('>BBHH', slave_id, 0x06, register, value)
        crc = ModbusUtils.calculate_crc16(data)
        return data + struct.pack('<H', crc)
    
    @staticmethod
    def build_write_coil_command(slave_id: int, coil: int, state: bool) -> bytes:
        """Build Write Single Coil command (Function 0x05) for relay testing"""
        value = 0xFF00 if state else 0x0000
        data = struct.pack('>BBHH', slave_id, 0x05, coil, value)
        crc = ModbusUtils.calculate_crc16(data)
        return data + struct.pack('<H', crc)
    
    @staticmethod
    def parse_read_response(response: bytes) -> Dict:
        """Parse Read Holding Register response"""
        if len(response) < 5:
            return {'success': False, 'error': 'Response too short'}
        
        slave_id, function_code, byte_count = struct.unpack('>BBB', response[:3])
        
        if function_code == 0x83:  # Error response
            error_code = response[2]
            return {'success': False, 'error': f'Modbus error: {ModbusUtils.get_error_description(error_code)}'}
        
        if function_code != 0x03:
            return {'success': False, 'error': f'Unexpected function code: 0x{function_code:02X}'}
        
        # Extract register value (big-endian)
        value = struct.unpack('>H', response[3:5])[0]
        
        return {
            'success': True,
            'slave_id': slave_id,
            'function_code': function_code,
            'byte_count': byte_count,
            'value': value
        }
    
    @staticmethod
    def parse_write_response(response: bytes) -> Dict:
        """Parse Write Single Register response"""
        if len(response) < 8:
            return {'success': False, 'error': 'Response too short'}
        
        slave_id, function_code = struct.unpack('>BB', response[:2])
        
        if function_code == 0x86:  # Error response
            error_code = response[2]
            return {'success': False, 'error': f'Modbus error: {ModbusUtils.get_error_description(error_code)}'}
        
        if function_code != 0x06:
            return {'success': False, 'error': f'Unexpected function code: 0x{function_code:02X}'}
        
        register, value = struct.unpack('>HH', response[2:6])
        
        return {
            'success': True,
            'slave_id': slave_id,
            'function_code': function_code,
            'register': register,
            'value': value
        }
    
    @staticmethod
    def get_error_description(error_code: int) -> str:
        """Get human-readable error description"""
        errors = {
            0x01: 'Illegal Function',
            0x02: 'Illegal Data Address',
            0x03: 'Illegal Data Value',
            0x04: 'Slave Device Failure',
            0x05: 'Acknowledge',
            0x06: 'Slave Device Busy',
            0x08: 'Memory Parity Error',
            0x0A: 'Gateway Path Unavailable',
            0x0B: 'Gateway Target Device Failed to Respond'
        }
        return errors.get(error_code, f'Unknown error (0x{error_code:02X})')
    
    @staticmethod
    def format_hex(data: bytes) -> str:
        """Format bytes as hex string for display"""
        return ' '.join(f'{b:02X}' for b in data)

class SlaveIdChanger:
    """Main class for changing Waveshare Modbus slave addresses"""
    
    def __init__(self, debug: bool = False):
        self.debug = debug
        self.serial_port: Optional[serial.Serial] = None
        self.timeout = 1.0
    
    def list_ports(self) -> List[Dict]:
        """List available COM ports"""
        ports = []
        for port in serial.tools.list_ports.comports():
            ports.append({
                'device': port.device,
                'description': port.description,
                'manufacturer': getattr(port, 'manufacturer', 'Unknown')
            })
        return ports
    
    def connect(self, port_name: str) -> bool:
        """Connect to specified COM port"""
        try:
            self.serial_port = serial.Serial(
                port=port_name,
                baudrate=9600,
                bytesize=8,
                parity='N',
                stopbits=1,
                timeout=self.timeout
            )
            if self.debug:
                log_success(f"Connected to {port_name}")
            return True
        except Exception as e:
            log_error(f"Failed to connect to {port_name}: {e}")
            return False
    
    def disconnect(self) -> None:
        """Disconnect from COM port"""
        if self.serial_port and self.serial_port.is_open:
            self.serial_port.close()
            if self.debug:
                log_success("Disconnected")
    
    def send_command(self, command: bytes, expected_length: int = 8) -> Optional[bytes]:
        """Send command and wait for response"""
        if not self.serial_port or not self.serial_port.is_open:
            log_error("Port not open")
            return None
        
        try:
            if self.debug:
                log_info(f"Sending: {ModbusUtils.format_hex(command)}")
            
            # Clear buffers
            self.serial_port.reset_input_buffer()
            self.serial_port.reset_output_buffer()
            
            # Send command
            self.serial_port.write(command)
            
            # For broadcast commands, don't expect response
            if expected_length == 0:
                time.sleep(0.1)  # Give device time to process
                return b''
            
            # Read response
            response = self.serial_port.read(expected_length)
            
            if self.debug and response:
                log_info(f"Received: {ModbusUtils.format_hex(response)}")
            
            return response if len(response) > 0 else None
            
        except Exception as e:
            log_error(f"Communication error: {e}")
            return None
    
    def read_slave_address(self, slave_id: int) -> Dict:
        """Read current slave address from device"""
        command = ModbusUtils.build_read_register_command(slave_id, ModbusUtils.SLAVE_ADDRESS_REGISTER, 1)
        
        if self.debug:
            log_info(f"Reading slave address from device {slave_id}...")
        
        response = self.send_command(command, 7)
        
        if not response:
            return {
                'success': False,
                'slave_id': slave_id,
                'error': 'No response (device may not exist at this address)'
            }
        
        parsed = ModbusUtils.parse_read_response(response)
        
        if parsed['success']:
            return {
                'success': True,
                'slave_id': slave_id,
                'current_address': parsed['value'],
                'raw_response': ModbusUtils.format_hex(response)
            }
        else:
            return {
                'success': False,
                'slave_id': slave_id,
                'error': parsed['error'],
                'raw_response': ModbusUtils.format_hex(response)
            }
    
    def set_slave_address(self, current_slave_id: int, new_slave_id: int) -> Dict:
        """Set new slave address on device"""
        # Validate new address
        if new_slave_id < 1 or new_slave_id > 247:
            return {
                'success': False,
                'error': 'New slave address must be between 1 and 247'
            }
        
        command = ModbusUtils.build_write_register_command(
            current_slave_id, 
            ModbusUtils.SLAVE_ADDRESS_REGISTER, 
            new_slave_id
        )
        
        if self.debug:
            log_info(f"Setting slave address from {current_slave_id if current_slave_id != 0 else 'BROADCAST'} to {new_slave_id}")
        
        # For broadcast (address 0), we don't expect a response
        expected_length = 0 if current_slave_id == 0 else 8
        response = self.send_command(command, expected_length)
        
        # Broadcast mode - verify by reading from new address
        if current_slave_id == 0:
            time.sleep(0.5)  # Wait for device to process
            
            verification = self.read_slave_address(new_slave_id)
            
            if verification['success'] and verification['current_address'] == new_slave_id:
                return {
                    'success': True,
                    'previous_address': 'broadcast',
                    'new_address': new_slave_id,
                    'verified': True,
                    'message': f'Successfully set slave address to {new_slave_id} (verified)'
                }
            else:
                return {
                    'success': True,
                    'previous_address': 'broadcast',
                    'new_address': new_slave_id,
                    'verified': False,
                    'message': f'Command sent. Verification: {"passed" if verification["success"] else "failed"}'
                }
        
        # Normal mode - expect response
        if not response:
            return {
                'success': False,
                'error': 'No response from device'
            }
        
        parsed = ModbusUtils.parse_write_response(response)
        
        if parsed['success']:
            return {
                'success': True,
                'previous_address': current_slave_id,
                'new_address': parsed['value'],
                'raw_response': ModbusUtils.format_hex(response),
                'message': f'Successfully changed slave address from {current_slave_id} to {parsed["value"]}'
            }
        else:
            return {
                'success': False,
                'error': parsed['error'],
                'raw_response': ModbusUtils.format_hex(response)
            }
    
    def scan_devices(self, start_address: int = 1, end_address: int = 10) -> List[Dict]:
        """Scan for devices on the bus"""
        found_devices = []
        
        log_info(f"Scanning for devices (addresses {start_address}-{end_address})...")
        
        for addr in range(start_address, end_address + 1):
            print(f"   Checking address {addr}... ", end='', flush=True)
            
            result = self.read_slave_address(addr)
            
            if result['success']:
                print(f"✅ Found! (Address: {result['current_address']})")
                found_devices.append({
                    'address': addr,
                    'reported_address': result['current_address']
                })
            else:
                print("❌ No response")
            
            time.sleep(0.1)  # Small delay between scans
        
        return found_devices
    
    def test_relay(self, slave_id: int, relay_number: int, state: bool) -> Dict:
        """Test relay activation (optional verification)"""
        coil_address = relay_number - 1  # 0-based
        command = ModbusUtils.build_write_coil_command(slave_id, coil_address, state)
        
        if self.debug:
            log_info(f"Testing relay {relay_number} on device {slave_id} ({'ON' if state else 'OFF'})...")
        
        response = self.send_command(command, 8)
        
        if response:
            return {
                'success': True,
                'slave_id': slave_id,
                'relay': relay_number,
                'state': 'ON' if state else 'OFF',
                'raw_response': ModbusUtils.format_hex(response)
            }
        else:
            return {
                'success': False,
                'error': 'No response from device'
            }

class InteractiveCLI:
    """Interactive command-line interface"""
    
    def __init__(self):
        self.changer = SlaveIdChanger(debug=False)
        self.selected_port = None
    
    def input_with_prompt(self, prompt: str) -> str:
        """Get user input with colored prompt"""
        return input(f"{Colors.CYAN}{prompt}{Colors.RESET}").strip()
    
    def select_from_list(self, prompt: str, options: List[Dict]) -> Optional[str]:
        """Select from a list of options"""
        print(f"\n{prompt}")
        for i, opt in enumerate(options):
            print(f"  {Colors.YELLOW}{i + 1}{Colors.RESET}. {opt['label']}")
        
        try:
            answer = self.input_with_prompt('\nEnter number: ')
            index = int(answer) - 1
            
            if 0 <= index < len(options):
                return options[index]['value']
        except ValueError:
            pass
        
        return None
    
    def run(self):
        """Run the interactive CLI"""
        log_header('Waveshare Modbus Slave ID Changer')
        
        print('This tool helps you configure slave addresses on Waveshare')
        print('Modbus RTU Relay cards (16CH and 32CH models).\n')
        
        try:
            self.main_menu()
        except KeyboardInterrupt:
            print("\n\nOperation cancelled by user.")
        except Exception as e:
            log_error(f"Error: {e}")
        finally:
            self.cleanup()
    
    def main_menu(self):
        """Main menu loop"""
        while True:
            action = self.select_from_list('What would you like to do?', [
                {'label': 'Select COM Port', 'value': 'port'},
                {'label': 'Scan for Devices', 'value': 'scan'},
                {'label': 'Read Current Slave Address', 'value': 'read'},
                {'label': 'Change Slave Address', 'value': 'change'},
                {'label': 'Test Relay (verify connection)', 'value': 'test'},
                {'label': 'Exit', 'value': 'exit'}
            ])
            
            if action == 'port':
                self.select_port()
            elif action == 'scan':
                self.scan_devices()
            elif action == 'read':
                self.read_address()
            elif action == 'change':
                self.change_address()
            elif action == 'test':
                self.test_relay()
            elif action == 'exit':
                break
            else:
                log_warning('Invalid selection. Please try again.')
    
    def select_port(self):
        """Select COM port"""
        log_info('Scanning for available COM ports...')
        
        ports = self.changer.list_ports()
        
        if not ports:
            log_error('No COM ports found. Please connect your USB-RS485 adapter.')
            return
        
        print('\nAvailable COM ports:')
        for i, port in enumerate(ports):
            info = f" ({port['manufacturer']})" if port['manufacturer'] != 'Unknown' else ''
            print(f"  {Colors.YELLOW}{i + 1}{Colors.RESET}. {port['device']}{info}")
        
        try:
            answer = self.input_with_prompt('\nSelect port number: ')
            index = int(answer) - 1
            
            if 0 <= index < len(ports):
                self.selected_port = ports[index]['device']
                log_success(f"Selected: {self.selected_port}")
            else:
                log_warning('Invalid selection.')
        except ValueError:
            log_warning('Invalid input. Please enter a number.')
    
    def ensure_port(self) -> bool:
        """Ensure a COM port is selected"""
        if not self.selected_port:
            log_warning('No COM port selected. Please select one first.')
            self.select_port()
        return self.selected_port is not None
    
    def scan_devices(self):
        """Scan for devices"""
        if not self.ensure_port():
            return
        
        start_addr = self.input_with_prompt('Start address (default: 1): ')
        end_addr = self.input_with_prompt('End address (default: 10): ')
        
        start = int(start_addr) if start_addr.isdigit() else 1
        end = int(end_addr) if end_addr.isdigit() else 10
        
        if self.changer.connect(self.selected_port):
            try:
                devices = self.changer.scan_devices(start, end)
                
                if devices:
                    log_success(f"Found {len(devices)} device(s):")
                    for d in devices:
                        print(f"  - Address {d['address']} (reports address: {d['reported_address']})")
                else:
                    log_warning('No devices found in the specified range.')
            finally:
                self.changer.disconnect()
    
    def read_address(self):
        """Read current slave address"""
        if not self.ensure_port():
            return
        
        addr_input = self.input_with_prompt('Enter slave address to query (1-247): ')
        
        try:
            address = int(addr_input)
            if not (1 <= address <= 247):
                log_error('Invalid address. Must be between 1 and 247.')
                return
        except ValueError:
            log_error('Invalid input. Please enter a number.')
            return
        
        if self.changer.connect(self.selected_port):
            try:
                result = self.changer.read_slave_address(address)
                
                if result['success']:
                    log_success(f"Device at address {address} reports slave address: {result['current_address']}")
                    print(f"  Raw response: {result['raw_response']}")
                else:
                    log_error(f"Failed to read: {result['error']}")
            finally:
                self.changer.disconnect()
    
    def change_address(self):
        """Change slave address"""
        if not self.ensure_port():
            return
        
        log_header('Change Slave Address')
        
        log_warning('IMPORTANT: If using broadcast mode, ensure ONLY ONE card is connected!')
        print('')
        
        method = self.select_from_list('Select method:', [
            {'label': 'Use current address (device responds to specific address)', 'value': 'specific'},
            {'label': 'Use broadcast (0x00) - ONLY when single card connected', 'value': 'broadcast'}
        ])
        
        if method == 'broadcast':
            current_address = 0
            log_warning('Using BROADCAST mode. All connected devices will receive this command!')
            
            confirm = self.input_with_prompt('Are you sure only ONE card is connected? (yes/no): ')
            if confirm.lower() != 'yes':
                log_info('Operation cancelled.')
                return
        else:
            current_input = self.input_with_prompt('Enter current slave address (1-247): ')
            try:
                current_address = int(current_input)
                if not (1 <= current_address <= 247):
                    log_error('Invalid current address.')
                    return
            except ValueError:
                log_error('Invalid input. Please enter a number.')
                return
        
        new_input = self.input_with_prompt('Enter NEW slave address (1-247): ')
        try:
            new_address = int(new_input)
            if not (1 <= new_address <= 247):
                log_error('Invalid new address. Must be between 1 and 247.')
                return
        except ValueError:
            log_error('Invalid input. Please enter a number.')
            return
        
        print('')
        log_info(f"Changing address from {'BROADCAST' if current_address == 0 else current_address} to {new_address}")
        
        confirm = self.input_with_prompt('Proceed? (yes/no): ')
        if confirm.lower() != 'yes':
            log_info('Operation cancelled.')
            return
        
        if self.changer.connect(self.selected_port):
            try:
                result = self.changer.set_slave_address(current_address, new_address)
                
                if result['success']:
                    log_success(result['message'])
                    if result.get('verified'):
                        log_success('Address change verified successfully!')
                else:
                    log_error(f"Failed: {result['error']}")
            finally:
                self.changer.disconnect()
    
    def test_relay(self):
        """Test relay activation"""
        if not self.ensure_port():
            return
        
        addr_input = self.input_with_prompt('Enter slave address (1-247): ')
        try:
            address = int(addr_input)
            if not (1 <= address <= 247):
                log_error('Invalid address.')
                return
        except ValueError:
            log_error('Invalid input. Please enter a number.')
            return
        
        relay_input = self.input_with_prompt('Enter relay number (1-32): ')
        try:
            relay = int(relay_input)
            if not (1 <= relay <= 32):
                log_error('Invalid relay number.')
                return
        except ValueError:
            log_error('Invalid input. Please enter a number.')
            return
        
        if self.changer.connect(self.selected_port):
            try:
                log_info(f"Turning ON relay {relay} on device {address}...")
                on_result = self.changer.test_relay(address, relay, True)
                
                if on_result['success']:
                    log_success(f"Relay {relay} turned ON")
                    
                    time.sleep(1)
                    
                    log_info(f"Turning OFF relay {relay}...")
                    off_result = self.changer.test_relay(address, relay, False)
                    
                    if off_result['success']:
                        log_success(f"Relay {relay} turned OFF")
                        log_success('Relay test completed successfully!')
                else:
                    log_error(f"Test failed: {on_result['error']}")
            finally:
                self.changer.disconnect()
    
    def cleanup(self):
        """Cleanup resources"""
        self.changer.disconnect()
        print('\nGoodbye! 👋')

def main():
    """Main entry point"""
    if len(sys.argv) > 1:
        # Command line mode (basic implementation)
        print("Command line mode not implemented in portable version.")
        print("Please run without arguments for interactive mode.")
        sys.exit(1)
    
    # Interactive mode
    cli = InteractiveCLI()
    cli.run()

if __name__ == '__main__':
    main()