# ðŸ” Eform Locker System

**Production-Ready RFID Locker Management System**

A comprehensive locker management solution designed for Raspberry Pi with Waveshare relay cards, featuring RFID/QR access, multi-language support, VIP user management, and enterprise-grade security.

## ðŸš€ Quick Start

### ðŸ¥§ Raspberry Pi Management

#### **First Time Setup**

```bash
# Clone the project
git clone https://github.com/mredag/eformLockerRoom.git eform-locker
cd eform-locker

# Fix script permissions (required after Git clone)
chmod +x scripts/maintenance/*.sh
chmod +x scripts/deployment/*.sh
chmod +x scripts/*.sh

# Install complete startup system with auto IP detection (ONE COMMAND!)
sudo bash scripts/maintenance/install-startup-system.sh

# Or just configure IP settings without full installation
sudo bash scripts/maintenance/smart-ip-setup.sh

# Reboot to activate everything
sudo reboot
```

#### **Daily Pi Management**

```bash
# Check system status
./scripts/maintenance/health-check.sh

# View system dashboard
/home/pi/eform-status.sh

# Quick service control
./scripts/maintenance/restart-services.sh
./scripts/start-all-clean.sh
```

#### **From Windows PC (Remote Management)**

```powershell
# Check Pi status remotely
.\scripts\deployment\pi-manager.ps1 status

# Discover Pi if IP changed
.\scripts\deployment\discover-pi.ps1

# Comprehensive health check from Windows
.\scripts\deployment\pi-manager.ps1 health

# Restart services remotely
.\scripts\deployment\pi-manager.ps1 restart

# Available pi-manager commands:
# health   - Complete system health check with diagnostics
# status   - Quick service status check
# restart  - Restart all services with health verification
# logs     - View recent service logs
```

#### **Common Issues & Solutions**

```bash
# Permission denied error?
chmod +x scripts/maintenance/health-check.sh

# Services not starting?
sudo systemctl status eform-locker
sudo journalctl -u eform-locker -f

# Hardware issues?
ls -la /dev/ttyUSB*
./scripts/maintenance/hardware-init.sh
```

### For Raspberry Pi Production Deployment

```bash
# One-command setup for Raspberry Pi (fully automated)
git clone https://github.com/mredag/eformLockerRoom.git eform-locker
cd eform-locker
chmod +x scripts/quick-setup.sh
./scripts/quick-setup.sh

# Or use the comprehensive installation script
sudo ./scripts/install.sh
```

### ðŸŒ Web Interfaces & Access Points

Once your Pi is running, access these interfaces:

#### **Production URLs (Default Pi IP: 192.168.1.8)**

- **ðŸ”§ Admin Panel**: `http://192.168.1.8:3001` - Complete locker management
- **ðŸ‘¤ Kiosk Interface**: `http://192.168.1.8:3002` - User RFID interface
- **ðŸ”Œ Gateway API**: `http://192.168.1.8:3000` - REST API endpoints
- **âš™ï¸ Hardware Config**: `http://192.168.1.8:3001/hardware-config` - Relay control

#### **Quick Access Commands (After Installation)**

```bash
# Available on Pi after startup system installation
eform-status    # Complete system dashboard
eform-health    # Health check with diagnostics
eform-logs      # View all service logs
eform-start     # Start all services
eform-stop      # Stop all services
eform-restart   # Restart all services
```

#### **Smart IP Configuration (Automatic)**

```bash
# On Pi - automatically configure current IP as static
sudo bash scripts/maintenance/smart-ip-setup.sh

# Test IP configuration
bash scripts/maintenance/test-ip-setup.sh

# The system will automatically:
# â€¢ Detect current IP address
# â€¢ Configure it as static IP
# â€¢ Update all Windows scripts
# â€¢ Create status dashboard
# â€¢ Set up quick access commands
```

#### **If Pi IP Address Changes**

```powershell
# From Windows PC - discover new IP automatically
.\scripts\network\simple-ip-manager.ps1 discover

# Or let the Pi auto-configure itself
ssh pi@OLD_IP "sudo bash /home/pi/eform-locker/scripts/maintenance/smart-ip-setup.sh"
```

### For Development

```bash
git clone https://github.com/mredag/eformLockerRoom.git
cd eformLockerRoom
npm install
npm run config:setup-dev
npm run migrate
npm run dev:gateway & npm run dev:kiosk & npm run dev:panel &
```

## ðŸŒ Automatic IP Management System

**Problem Solved**: No more manual IP configuration when your Pi's IP address changes!

The system now includes intelligent IP management that automatically handles network changes without requiring manual updates to scripts, bookmarks, or configurations.

### âœ… **What This System Does**

- **ðŸ” Automatic Discovery**: Finds your Pi on any network automatically
- **ðŸ”„ Smart Updates**: Updates all scripts and configurations with new IP
- **ðŸ“‹ Access Info Generation**: Creates ready-to-use connection information
- **ðŸ“Š Change Tracking**: Maintains history of IP changes
- **ðŸ–¥ï¸ Cross-Platform**: Works seamlessly between Windows and Pi

### ðŸš€ **Quick Usage**

#### **Windows Development Machine**

```powershell
# Find your Pi automatically (scans network)
.\scripts\network\simple-ip-manager.ps1 discover

# Check current status and connection
.\scripts\network\simple-ip-manager.ps1 status

# Test connection to stored IP
.\scripts\network\simple-ip-manager.ps1 test
```

#### **Raspberry Pi (Automatic)**

```bash
# Manual IP check (runs automatically on startup)
node scripts/network/dynamic-ip-manager.js run

# View current IP and status
node scripts/network/dynamic-ip-manager.js status

# Get current IP only
node scripts/network/dynamic-ip-manager.js current-ip
```

### ðŸ“‹ **Generated Files**

After running IP discovery, you'll have:

- **`CURRENT_PI_ACCESS.md`** - Ready-to-use access information with URLs and commands
- **`config/pi-ip-config.json`** - Stored IP configuration for future reference
- **Updated scripts** - All deployment scripts automatically updated with current IP

### ðŸ”„ **How It Works**

1. **Network Scanning**: Automatically scans common IP ranges (192.168.1.x, 192.168.0.x, etc.)
2. **Pi Identification**: Tests SSH connection and verifies eForm project exists
3. **Configuration Update**: Updates all relevant scripts and configuration files
4. **Access Info Generation**: Creates current connection information
5. **Change Tracking**: Logs IP changes with timestamps for troubleshooting

### ðŸŽ¯ **Real-World Benefits**

#### **Before (Manual Process)**:
- IP changes â†’ broken bookmarks and scripts
- Manual network scanning to find Pi
- Update multiple configuration files manually
- Risk of missing script updates

#### **After (Automatic Process)**:
- IP changes â†’ run one command, everything updates
- Automatic Pi discovery on any network
- All configurations update automatically
- Zero risk of missed updates

### ðŸ“Š **Example Generated Access Info**

```markdown
# eForm Pi Access Information
Generated: 2025-09-02 10:20:39
IP Address: 192.168.1.11

## Web Interfaces
Admin Panel:  http://192.168.1.11:3001
Kiosk UI:     http://192.168.1.11:3002
Gateway API:  http://192.168.1.11:3000

## SSH Access
ssh pi@192.168.1.11

## Quick Health Check
Invoke-WebRequest -Uri "http://192.168.1.11:3000/health" -UseBasicParsing
Invoke-WebRequest -Uri "http://192.168.1.11:3001/health" -UseBasicParsing  
Invoke-WebRequest -Uri "http://192.168.1.11:3002/health" -UseBasicParsing
```

### ðŸ”§ **Integration with Existing Systems**

The IP management system integrates seamlessly with existing workflows:

- **Startup Scripts**: Automatically runs during Pi boot
- **Deployment Scripts**: All Windows deployment scripts auto-update
- **Health Checks**: IP discovery integrated with health monitoring
- **Service Management**: Works with existing service control scripts

### ðŸ“š **Detailed Documentation**

For complete documentation on the IP management system, see:
- **[Automatic IP Management Guide](docs/automatic-ip-management-system.md)** - Comprehensive system documentation
- **Configuration files**: `scripts/network/` directory
- **Generated access info**: `CURRENT_PI_ACCESS.md` (auto-generated)

### ðŸŽ‰ **Result**

Your eForm Locker System is now **network-agnostic** and will work seamlessly regardless of IP address changes. No more manual configuration headaches!

## ðŸ¤– Automation Scripts

The system includes comprehensive automation for production deployment:

### ðŸ”§ Installation & Setup

- **`quick-setup.sh`** - Complete Raspberry Pi setup in one command
- **`install.sh`** - Production installation with security hardening
- **`setup-config.js`** - Automated configuration generation

### ðŸ“¦ Package Management

- **`package.sh`** - Create deployment packages with checksums
- **`sign-package.sh`** - Digital signing for secure distribution
- **`deploy.sh`** - Zero-downtime deployment with rollback
- **`canary-deploy.sh`** - Gradual rollout deployment

### ðŸ” Monitoring & Maintenance

- **`health-check.sh`** - Comprehensive system health validation
- **`backup.sh`** - Automated backup with retention policies
- **`deployment-monitor.sh`** - Real-time deployment monitoring

## ðŸ“ Project Structure

This project follows standardized Node.js conventions with clear separation of concerns:

```
eform-locker-system/
â”œâ”€â”€ app/                          # ðŸ—ï¸ Application Services (Microservices)
â”‚   â”œâ”€â”€ gateway/                  # API Gateway service (Port 3000)
â”‚   â”œâ”€â”€ kiosk/                    # Kiosk hardware control (Port 3002)
â”‚   â”œâ”€â”€ panel/                    # Admin web interface (Port 3001)
â”‚   â””â”€â”€ agent/                    # Background task processing
â”œâ”€â”€ shared/                       # ðŸ”§ Shared Utilities & Libraries
â”‚   â”œâ”€â”€ controllers/              # Common controller logic
â”‚   â”œâ”€â”€ services/                 # Business logic services
â”‚   â”œâ”€â”€ types/                    # TypeScript definitions
â”‚   â””â”€â”€ database/                 # Database utilities
â”œâ”€â”€ tests/                        # ðŸ§ª Test Suites
â”‚   â”œâ”€â”€ integration/              # Cross-service integration tests
â”‚   â””â”€â”€ README.md                 # Testing documentation
â”œâ”€â”€ scripts/                      # âš™ï¸ Operational Scripts (60 essential)
â”‚   â”œâ”€â”€ deployment/               # Deployment automation
â”‚   â”œâ”€â”€ testing/                  # Test execution utilities
â”‚   â”œâ”€â”€ maintenance/              # System maintenance tools
â”‚   â”œâ”€â”€ emergency/                # Emergency response procedures
â”‚   â””â”€â”€ setup/                    # Initial setup scripts
â”œâ”€â”€ docs/                         # ðŸ“š Documentation (7 essential files)
â”‚   â”œâ”€â”€ troubleshooting/          # Issue resolution guides
â”‚   â”œâ”€â”€ integrations/             # External system integrations
â”‚   â””â”€â”€ maintenance/              # Maintenance procedures
â”œâ”€â”€ migrations/                   # ðŸ—„ï¸ Database Schema Migrations
â”œâ”€â”€ config/                       # âš™ï¸ Environment Configuration
â”œâ”€â”€ data/                         # ðŸ’¾ Database Files (gitignored)
â”œâ”€â”€ logs/                         # ðŸ“‹ Application Logs (gitignored)
â””â”€â”€ .kiro/                        # ðŸ¤– Kiro IDE Configuration
    â”œâ”€â”€ specs/                    # Feature specifications
    â””â”€â”€ steering/                 # Development guidelines
```

### ðŸŽ¯ Directory Organization Principles

**Service Architecture**: Each service in `app/` is self-contained with its own `src/`, `dist/`, and dependencies.

**Shared Resources**: Common utilities in `shared/` prevent code duplication across services.

**Operational Excellence**: Scripts organized by purpose in `scripts/` with clear naming conventions.

**Documentation First**: Essential documentation in `docs/` with comprehensive guides and troubleshooting.

**Clean Separation**: Tests, configuration, and build artifacts properly organized and gitignored.

For detailed directory structure and organization principles, see [DIRECTORY_STRUCTURE.md](DIRECTORY_STRUCTURE.md).

## ðŸ“š Documentation & Organization

**Complete documentation is available in the [`docs/`](docs/) folder:**

- **[🔗 Integrations](docs/integrations/)** - External system integrations

- **[ðŸ“‹ Documentation Overview](docs/README.md)** - Start here for navigation
- **[ðŸš€ Deployment Guide](docs/DEPLOYMENT_README.md)** - Production deployment procedures
- **[ðŸ“¡ API Reference](docs/API_REFERENCE.md)** - Comprehensive API documentation
- **[ðŸ“Š Performance Monitoring](docs/performance-monitoring-guide.md)** - System monitoring and optimization
- **[ðŸ”§ Kiosk Troubleshooting](docs/kiosk-troubleshooting-guide.md)** - Hardware and software issues
- **[ðŸ¥§ Pi Configuration](docs/pi-configuration-guide.md)** - Raspberry Pi specific settings
- **[ðŸ”„ Rollback Procedures](docs/rollback-procedures.md)** - Emergency recovery procedures

### **ðŸ”§ Health Monitoring & Diagnostics**

- **`scripts/deployment/health-check.sh`** - Comprehensive system health validation
  - Service status monitoring (Gateway, Panel, Kiosk)
  - Hardware connectivity checks (USB-RS485 port)
  - Database availability verification
  - System resource monitoring (CPU, Memory, Disk)
- **Windows Pi Manager** - Remote health monitoring from development PC
  - `.\scripts\deployment\pi-manager.ps1 health` - Full system diagnostics
  - Real-time service status and resource usage
  - Automated troubleshooting recommendations

### **ðŸ—‚ï¸ Specialized Documentation**

- **[ðŸ”— Integrations](docs/integrations/)** - External system integrations (Maksisoft)
- **[ðŸ”§ Troubleshooting](docs/troubleshooting/)** - Issue resolution guides and incident reports
- **[âš™ï¸ Maintenance](docs/maintenance/)** - System maintenance procedures and fixes

### **ðŸŽ¯ File Organization Principles**

**Documentation Strategy**:

- Essential docs in root `docs/` for quick access
- Specialized guides in categorized subdirectories
- Historical incidents preserved for learning

**Script Organization**:

- 60 essential scripts organized by purpose in `scripts/`
- Emergency procedures in `scripts/emergency/`
- Deployment automation in `scripts/deployment/`
- Testing utilities in `scripts/testing/`

**Code Structure**:

- Microservices in `app/` with independent build systems
- Shared utilities in `shared/` to prevent duplication
- Tests co-located with code and in dedicated `tests/` directory

## ðŸŽ¯ System Overview

### **Architecture**

- **Gateway Service** (Port 3000): API coordination and admin management
- **Kiosk Service** (Port 3002): Hardware control and RFID processing
- **Panel Service** (Port 3001): Web administration and direct relay control

### **Hardware Integration**

- **Raspberry Pi 4**: Main controller with Linux OS
- **USB-RS485 Adapter**: Modbus RTU communication
- **Waveshare Relay Cards**: Physical locker control (30 lockers)
- **Sycreader RFID Reader**: Card-based authentication

### **Key Features**

- âœ… **Multi-User RFID Support**: Session-based card management
- âœ… **Real-time Hardware Control**: Direct relay activation via Modbus
- âœ… **Web Administration**: Complete locker management interface
- âœ… **Production Ready**: Comprehensive monitoring and documentation

## ðŸš€ Developer Onboarding Guide

### **ðŸŽ¯ New Developer Quick Start**

**1. Repository Navigation**

```bash
# Clone and explore the repository structure
git clone https://github.com/mredag/eformLockerRoom.git eform-locker
cd eform-locker

# Understand the project structure
cat DIRECTORY_STRUCTURE.md          # Detailed directory guide
ls app/                              # View available services
ls scripts/                          # View operational scripts
ls docs/                             # Browse documentation
```

**2. Development Environment Setup**

```bash
# Install dependencies for all services
npm install

# Build all services
npm run build:gateway
npm run build:kiosk
npm run build:panel

# Set up development environment
cp .env.example .env                 # Configure environment variables
npm run migrate                      # Set up database
```

**3. Understanding the Codebase**

- **Start with**: `docs/README.md` for documentation navigation
- **Architecture**: Each service in `app/` is independent with its own build system
- **Shared Code**: Common utilities in `shared/` prevent duplication
- **Testing**: Integration tests in `tests/`, unit tests co-located with code

**4. Running Services Locally**

```bash
# Development mode (with hot reload)
npm run dev:gateway &               # API Gateway (Port 3000)
npm run dev:kiosk &                 # Kiosk Service (Port 3002)
npm run dev:panel &                 # Admin Panel (Port 3001)

# Check service health
curl http://localhost:3000/health   # Gateway
curl http://localhost:3002/health   # Kiosk
curl http://localhost:3001/health   # Panel
```

**5. Key Development Resources**

- **API Testing**: Use Postman with endpoints in `docs/API_REFERENCE.md`
- **Hardware Testing**: Scripts in `scripts/testing/` for relay control
- **Troubleshooting**: `docs/troubleshooting/` for common issues
- **Code Standards**: Follow patterns in existing services

### **ðŸ—ºï¸ Repository Navigation Map**

**For Frontend Development**:

- `app/panel/src/views/` - Admin interface templates
- `app/kiosk/src/ui/` - Kiosk user interface
- `shared/services/` - Shared frontend utilities

**For Backend Development**:

- `app/*/src/routes/` - API endpoints
- `app/*/src/controllers/` - Business logic
- `shared/services/` - Shared backend services

**For Hardware Integration**:

- `app/kiosk/src/hardware/` - Modbus and relay control
- `scripts/testing/` - Hardware testing utilities
- `docs/troubleshooting/hardware-integration-guide.md` - Hardware guides

**For Testing**:

- `tests/integration/` - Cross-service tests
- `app/*/src/__tests__/` - Service-specific unit tests
- `scripts/testing/` - Test execution utilities

**For Deployment**:

- `scripts/deployment/` - Deployment automation
- `docs/DEPLOYMENT_README.md` - Deployment procedures
- `config/` - Environment configurations

### ðŸ› ï¸ Hardware Validation

- **`validate-waveshare-hardware.js`** - Waveshare relay card testing
- **`hardware-diagnostics.js`** - Complete hardware diagnostics

```bash
# Example automation workflow
./scripts/package.sh create deployment        # Create package
./scripts/sign-package.sh sign package.tar.gz # Sign package
sudo ./scripts/deploy.sh deploy package.tar.gz # Deploy with rollback
./scripts/health-check.sh                     # Validate deployment
```

## ðŸš€ Features

### Core Functionality

- **ðŸ” Secure Kiosk Provisioning**: Token-based registration with HMAC authentication
- **âš™ï¸ Configuration Management**: Centralized configuration distribution with version control and hash verification
- **ðŸ“¡ Real-time Monitoring**: Heartbeat monitoring and comprehensive status tracking
- **ðŸ”„ Atomic Operations**: Configuration changes with automatic rollback capabilities
- **ðŸ“Š Audit Logging**: Complete event logging and audit trails
- **ðŸŒ Web Interface**: Browser-based management panel for monitoring and control

### Technical Highlights

- **Version Control**: SHA256-based configuration versioning
- **Rollback Capability**: Automatic and manual rollback for failed deployments
- **Zone Management**: Deploy configurations to specific zones or individual kiosks
- **Status Tracking**: Real-time kiosk status with configuration state monitoring
- **Concurrent Access**: SQLite with WAL mode for high-performance concurrent operations

## ðŸ—ï¸ Architecture

The system is built with modern technologies:

- **Backend**: Node.js with Fastify framework for high performance
- **Database**: SQLite with Write-Ahead Logging (WAL) for concurrent access
- **Security**: HMAC-based authentication and cryptographic token validation
- **Configuration**: Version-controlled packages with SHA256 hash verification
- **Testing**: Comprehensive test suite with Vitest
- **Build System**: ESBuild for fast compilation and bundling

## ðŸ“‹ Prerequisites

- **Node.js**: Version 20.0.0 or higher
- **npm**: Package manager (comes with Node.js)
- **Git**: For version control

## ðŸ› ï¸ Installation

```bash
# Clone the repository
git clone https://github.com/mredag/eformLockerRoom.git
cd eformLockerRoom

# Install dependencies
npm install

# Build the project
npm run build
```

## ðŸš¦ Getting Started

### Development Mode

```bash
# Start development server with hot reload
npm run dev

# The server will start on http://localhost:3000
```

### Production Mode

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Test configuration system end-to-end
npm run config-test
```

## ðŸŒ Web Interfaces

- **Configuration Panel**: http://localhost:3000/config-panel
- **Health Check**: http://localhost:3000/health

## ðŸ“¡ API Endpoints

### Provisioning System

```http
POST /api/provisioning/token          # Generate provisioning token
POST /api/provisioning/register       # Register new kiosk
POST /api/provisioning/validate       # Validate kiosk identity
GET  /api/provisioning/kiosks          # List all kiosks
POST /api/provisioning/cleanup         # Cleanup expired tokens
```

### Configuration Management

```http
GET  /api/configuration/default                    # Get default configuration
POST /api/configuration/packages                   # Create configuration package
GET  /api/configuration/packages/:version          # Get specific configuration
POST /api/configuration/deploy                     # Deploy configuration
GET  /api/configuration/kiosks/status              # Get all kiosk statuses
GET  /api/configuration/kiosks/:id/pending         # Get pending config for kiosk
POST /api/configuration/kiosks/:id/apply           # Apply configuration
POST /api/configuration/kiosks/:id/rollback        # Rollback configuration
GET  /api/configuration/deployments                # Get deployment history
```

## ðŸ§ª Testing & Quality Assurance

The project maintains high code quality with comprehensive testing:

- **Unit Tests**: 58 passing tests covering all core functionality
- **Integration Tests**: End-to-end testing of complete workflows
- **Service Tests**: Database operations and business logic validation
- **Controller Tests**: API endpoint testing with various scenarios

```bash
# Run specific test suites
npm test src/services/__tests__/configuration.test.ts
npm test src/controllers/__tests__/provisioning.test.ts

# Generate test coverage report
npm run test:coverage
```

## ðŸ“š Documentation

- **[Configuration System](docs/configuration-system.md)** - Comprehensive configuration management guide
- **[API Reference](docs/api-reference.md)** - Complete API documentation
- **[Deployment Guide](docs/deployment.md)** - Production deployment instructions
- **[Architecture Overview](docs/architecture.md)** - System architecture and design decisions

## ðŸ”§ Configuration

### System Configuration Parameters

The system supports comprehensive configuration management with the following parameters:

```typescript
interface SystemConfig {
  BULK_INTERVAL_MS: number; // Bulk operation interval
  RESERVE_TTL_SECONDS: number; // Reservation time-to-live
  OPEN_PULSE_MS: number; // Locker open pulse duration
  OPEN_BURST_SECONDS: number; // Open burst duration
  OPEN_BURST_INTERVAL_MS: number; // Interval between bursts
  MASTER_LOCKOUT_FAILS: number; // Failed attempts before lockout
  MASTER_LOCKOUT_MINUTES: number; // Lockout duration
  HEARTBEAT_SEC: number; // Heartbeat interval
  OFFLINE_SEC: number; // Offline threshold
  LOG_RETENTION_DAYS: number; // Log retention period
  RATE_LIMIT_IP_PER_MIN: number; // IP rate limiting
  RATE_LIMIT_CARD_PER_MIN: number; // Card rate limiting
  RATE_LIMIT_LOCKER_PER_MIN: number; // Locker rate limiting
  RATE_LIMIT_DEVICE_PER_SEC: number; // Device rate limiting
}
```

## ðŸš€ Deployment

### Environment Variables

```bash
# Optional environment variables
PROVISIONING_SECRET=your-secret-key
PANEL_URL=https://your-domain.com
PORT=3000
```

### Production Deployment

```bash
# Build the application
npm run build

# Start with PM2 (recommended)
pm2 start dist/index.js --name eform-locker-system

# Or start directly
npm start
```

## ðŸ¤ Contributing Guidelines

### **ðŸ“‹ Development Workflow**

1. **Fork and Branch**

   ```bash
   git fork https://github.com/mredag/eformLockerRoom.git
   git checkout -b feature/descriptive-feature-name
   ```

2. **Follow Repository Structure**

   - Place new services in `app/` with proper structure
   - Add shared utilities to `shared/` to prevent duplication
   - Put operational scripts in appropriate `scripts/` subdirectories
   - Add documentation to `docs/` with proper categorization

3. **Code Standards**

   - Follow existing naming conventions (kebab-case for files)
   - Include unit tests for new functionality
   - Update documentation for any new features
   - Ensure services build successfully: `npm run build:all`

4. **Testing Requirements**

   ```bash
   # Run tests before committing
   npm test                          # Unit tests
   npm run test:integration          # Integration tests
   node scripts/testing/validate-build.js  # Build validation
   ```

5. **Documentation Updates**
   - Update relevant documentation in `docs/`
   - Add API endpoints to `docs/API_REFERENCE.md`
   - Include troubleshooting info if applicable
   - Update this README if structure changes

### **ðŸ—‚ï¸ File Organization Rules**

**DO:**

- âœ… Place files in appropriate directories following `DIRECTORY_STRUCTURE.md`
- âœ… Use descriptive, kebab-case file names
- âœ… Include proper documentation for new features
- âœ… Add tests for new functionality
- âœ… Follow existing code patterns and conventions

**DON'T:**

- âŒ Add temporary files to the repository (use `.gitignore`)
- âŒ Create new root-level directories without discussion
- âŒ Duplicate functionality that exists in `shared/`
- âŒ Skip documentation for new features
- âŒ Break existing service interfaces

### **ðŸ§¹ Repository Cleanliness**

**Automated Prevention**: The repository uses enhanced `.gitignore` patterns to prevent accumulation of:

- Build artifacts (`dist/`, `build/`, `*.tsbuildinfo`)
- Temporary files (`temp-*`, `debug-*`, `*-summary.md`)
- Log files (`logs/`, `*.log`)
- Environment files (`.env`, but not `.env.example`)

**Manual Maintenance**:

- Remove temporary debugging files after use
- Consolidate related documentation instead of creating multiple files
- Use existing scripts in `scripts/` before creating new ones
- Archive or remove obsolete code rather than commenting it out

### **ðŸ”„ Pull Request Process**

1. **Pre-submission Checklist**

   - [ ] Code follows repository structure guidelines
   - [ ] All tests pass (`npm test`)
   - [ ] Documentation updated for changes
   - [ ] No temporary or debug files included
   - [ ] Services build successfully

2. **Commit Message Format**

   ```
   type(scope): brief description

   Detailed explanation if needed

   - Specific change 1
   - Specific change 2
   ```

3. **Review Process**
   - Automated checks for build and test success
   - Manual review for code quality and structure adherence
   - Documentation review for completeness
   - Integration testing on target hardware (if applicable)

### **ðŸ“ž Getting Help**

- **Documentation**: Start with `docs/README.md` for navigation
- **Issues**: Check existing issues before creating new ones
- **Architecture Questions**: Review `docs/SYSTEM_DOCUMENTATION.md`
- **Hardware Setup**: Follow `docs/pi-configuration-guide.md`

### **ðŸŽ¯ Contribution Areas**

**High Priority**:

- Bug fixes and stability improvements
- Performance optimizations
- Documentation improvements
- Test coverage expansion

**Medium Priority**:

- New feature development
- UI/UX enhancements
- Integration improvements
- Monitoring and logging enhancements

**Guidelines for Specific Areas**:

- **Hardware Integration**: Test on actual Raspberry Pi hardware
- **API Changes**: Update `docs/API_REFERENCE.md`
- **UI Changes**: Ensure accessibility and mobile compatibility
- **Database Changes**: Include proper migrations in `migrations/`

For detailed contributing guidelines, see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## ðŸ“Š Repository Status

### **ðŸ§¹ Recent Cleanup (August 2025)**

The repository underwent comprehensive cleanup and organization:

- **âœ… 105 files removed**: Eliminated obsolete and redundant files
- **âœ… Documentation consolidated**: 7 essential docs with clear navigation
- **âœ… Scripts organized**: 60 essential scripts categorized by purpose
- **âœ… Structure standardized**: Node.js conventions with clear hierarchy
- **âœ… Automated prevention**: Enhanced .gitignore prevents future accumulation

**Detailed cleanup report**: [REPOSITORY_CLEANUP_REPORT.md](REPOSITORY_CLEANUP_REPORT.md)

### **ðŸŽ¯ Current Status**

- **Repository**: Clean, organized, production-ready
- **Documentation**: Comprehensive with clear navigation
- **Code Quality**: Standardized structure and conventions
- **Maintenance**: Automated prevention of file accumulation

## ðŸ“Š Project Status

- âœ… **Kiosk Provisioning System**: Complete with secure token-based registration
- âœ… **Configuration Distribution**: Complete with version control and rollback
- âœ… **Web Interface**: Complete with real-time monitoring dashboard
- âœ… **Testing Suite**: Comprehensive test coverage (58 tests passing)
- âœ… **Documentation**: Complete API and system documentation

## ðŸ”’ Security Features

- **HMAC Authentication**: Cryptographic validation of kiosk identities
- **Token Expiration**: Time-limited provisioning tokens
- **Hash Verification**: SHA256 verification of configuration integrity
- **Audit Logging**: Complete audit trail of all system operations
- **Rollback Protection**: Automatic rollback on configuration failures

## ðŸ“ˆ Performance

- **Concurrent Operations**: SQLite WAL mode for high-performance concurrent access
- **Efficient Bundling**: ESBuild for fast compilation and small bundle sizes
- **Memory Optimization**: Efficient database connection pooling
- **Caching**: Intelligent caching of configuration packages

## ðŸ“„ License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ðŸ™ Acknowledgments

- Built with [Fastify](https://www.fastify.io/) for high-performance HTTP server
- Database operations powered by [SQLite](https://www.sqlite.org/)
- Testing framework: [Vitest](https://vitest.dev/)
- Build system: [ESBuild](https://esbuild.github.io/)

## ðŸš¨ Troubleshooting & Common Issues

### **Permission Denied Errors**

```bash
# Fix script permissions after Git clone
chmod +x scripts/maintenance/*.sh
chmod +x scripts/deployment/*.sh
chmod +x scripts/*.sh

# Run script with bash if permissions can't be changed
bash scripts/maintenance/health-check.sh
```

### **Services Won't Start**

```bash
# Check systemd service status
sudo systemctl status eform-locker
sudo journalctl -u eform-locker -f

# Manual service start for debugging
cd /home/pi/eform-locker
./scripts/maintenance/startup-services.sh

# Check if ports are in use
sudo netstat -tulpn | grep :300
```

### **Hardware Issues**

```bash
# Check USB serial devices
ls -la /dev/ttyUSB*
lsusb

# Test relay control directly
node scripts/test-basic-relay-control.js

# Reinitialize hardware
sudo ./scripts/maintenance/hardware-init.sh
```

### **Pi IP Address Changed**

```powershell
# From Windows PC - automatically discover new IP
.\scripts\network\simple-ip-manager.ps1 discover

# Check current status and test connection
.\scripts\network\simple-ip-manager.ps1 status
.\scripts\network\simple-ip-manager.ps1 test

# Legacy method (still works)
.\scripts\deployment\discover-pi.ps1

# Test connection with new IP
.\scripts\deployment\pi-manager.ps1 health
```

**Note**: The new IP management system automatically updates all scripts, so manual editing is no longer needed!

### **Web Interface Not Loading**

```bash
# Check if services are running
./scripts/deployment/health-check.sh

# Or check individual services
curl http://192.168.1.8:3001/health
curl http://192.168.1.8:3002/health
curl http://192.168.1.8:3000/health

# From Windows PC
.\scripts\deployment\pi-manager.ps1 health

# Check firewall
sudo ufw status
sudo ufw allow 3000:3002/tcp
```

### **Database Issues**

```bash
# Check database integrity
node scripts/database-health-check.js

# Rebuild database if corrupted
node fix-corrupted-database.js
```

### **High Resource Usage**

```bash
# Check system resources
./scripts/maintenance/health-check.sh
top
free -h
df -h

# View system alerts
cat /home/pi/eform-locker/.system-alerts
```

### **Getting Help**

- **ðŸ“š Documentation**: Check `docs/` folder for detailed guides
- **ðŸ” Logs**: View logs with `./scripts/maintenance/health-check.sh`
- **âš™ï¸ Scripts**: Use `scripts/maintenance/` for common tasks
- **ðŸŒ Web Interface**: Admin panel at `http://PI_IP:3001`

---

**Made with â¤ï¸ for enterprise locker management systems**

## New: Second-Scan Decision Screen (Kiosk)

To prevent accidental releases with solenoid locks, the kiosk now asks users what to do when the same card is scanned again and already owns a locker:

- “Esyami almak için aç” — opens the locker without releasing ownership
- “Dolabi teslim etmek istiyorum” — opens and releases the locker

Implementation summary:
- Frontend (kiosk UI): app/kiosk/src/ui/static/app-simple.js
  - On existing-card scan, shows a decision overlay instead of auto-releasing.
  - Calls new backend endpoint for open-only, or existing release flow for finish.
- Backend (kiosk service):
  - New endpoint: POST /api/locker/open-again (opens without DB release)
  - File: app/kiosk/src/controllers/ui-controller.ts

Docs: docs/developer-guides/second-scan-decision-screen.md

## Maintenance: script cleanup

Removed obviously outdated/empty scripts:
- scripts/start-dual-kiosks.sh (0-byte placeholder)
- scripts/maintenance/install-production.sh (0-byte placeholder)
- fix-config-to-32-lockers.js (0-byte)

Note: If you add new scripts, document them in scripts/README.md and reference from package.json where applicable.
