# 🔐 Eform Locker System

**Production-Ready RFID Locker Management System**

A comprehensive locker management solution designed for Raspberry Pi with Waveshare relay cards, featuring RFID/QR access, multi-language support, VIP user management, and enterprise-grade security.

## 🚀 Quick Start

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

### For Development
```bash
git clone https://github.com/mredag/eformLockerRoom.git
cd eformLockerRoom
npm install
npm run config:setup-dev
npm run migrate
npm run dev:gateway & npm run dev:kiosk & npm run dev:panel &
```

## 🤖 Automation Scripts

The system includes comprehensive automation for production deployment:

### 🔧 Installation & Setup
- **`quick-setup.sh`** - Complete Raspberry Pi setup in one command
- **`install.sh`** - Production installation with security hardening
- **`setup-config.js`** - Automated configuration generation

### 📦 Package Management
- **`package.sh`** - Create deployment packages with checksums
- **`sign-package.sh`** - Digital signing for secure distribution
- **`deploy.sh`** - Zero-downtime deployment with rollback
- **`canary-deploy.sh`** - Gradual rollout deployment

### 🔍 Monitoring & Maintenance
- **`health-check.sh`** - Comprehensive system health validation
- **`backup.sh`** - Automated backup with retention policies
- **`deployment-monitor.sh`** - Real-time deployment monitoring

## 📁 Project Structure

This project follows standardized Node.js conventions with clear separation of concerns:

```
eform-locker-system/
├── app/                          # 🏗️ Application Services (Microservices)
│   ├── gateway/                  # API Gateway service (Port 3000)
│   ├── kiosk/                    # Kiosk hardware control (Port 3002)
│   ├── panel/                    # Admin web interface (Port 3001)
│   └── agent/                    # Background task processing
├── shared/                       # 🔧 Shared Utilities & Libraries
│   ├── controllers/              # Common controller logic
│   ├── services/                 # Business logic services
│   ├── types/                    # TypeScript definitions
│   └── database/                 # Database utilities
├── tests/                        # 🧪 Test Suites
│   ├── integration/              # Cross-service integration tests
│   └── README.md                 # Testing documentation
├── scripts/                      # ⚙️ Operational Scripts (60 essential)
│   ├── deployment/               # Deployment automation
│   ├── testing/                  # Test execution utilities
│   ├── maintenance/              # System maintenance tools
│   ├── emergency/                # Emergency response procedures
│   └── setup/                    # Initial setup scripts
├── docs/                         # 📚 Documentation (7 essential files)
│   ├── troubleshooting/          # Issue resolution guides
│   ├── integrations/             # External system integrations
│   └── maintenance/              # Maintenance procedures
├── migrations/                   # 🗄️ Database Schema Migrations
├── config/                       # ⚙️ Environment Configuration
├── data/                         # 💾 Database Files (gitignored)
├── logs/                         # 📋 Application Logs (gitignored)
└── .kiro/                        # 🤖 Kiro IDE Configuration
    ├── specs/                    # Feature specifications
    └── steering/                 # Development guidelines
```

### 🎯 Directory Organization Principles

**Service Architecture**: Each service in `app/` is self-contained with its own `src/`, `dist/`, and dependencies.

**Shared Resources**: Common utilities in `shared/` prevent code duplication across services.

**Operational Excellence**: Scripts organized by purpose in `scripts/` with clear naming conventions.

**Documentation First**: Essential documentation in `docs/` with comprehensive guides and troubleshooting.

**Clean Separation**: Tests, configuration, and build artifacts properly organized and gitignored.

For detailed directory structure and organization principles, see [DIRECTORY_STRUCTURE.md](DIRECTORY_STRUCTURE.md).

## 📚 Documentation & Organization

**Complete documentation is available in the [`docs/`](docs/) folder:**

### **📋 Essential Documentation (7 Core Files)**
- **[📋 Documentation Overview](docs/README.md)** - Start here for navigation
- **[🚀 Deployment Guide](docs/DEPLOYMENT_README.md)** - Production deployment procedures  
- **[📡 API Reference](docs/API_REFERENCE.md)** - Comprehensive API documentation
- **[📊 Performance Monitoring](docs/performance-monitoring-guide.md)** - System monitoring and optimization
- **[🔧 Kiosk Troubleshooting](docs/kiosk-troubleshooting-guide.md)** - Hardware and software issues
- **[🥧 Pi Configuration](docs/pi-configuration-guide.md)** - Raspberry Pi specific settings
- **[🔄 Rollback Procedures](docs/rollback-procedures.md)** - Emergency recovery procedures

### **🗂️ Specialized Documentation**
- **[🔗 Integrations](docs/integrations/)** - External system integrations (Maksisoft)
- **[🔧 Troubleshooting](docs/troubleshooting/)** - Issue resolution guides and incident reports
- **[⚙️ Maintenance](docs/maintenance/)** - System maintenance procedures and fixes

### **🎯 File Organization Principles**

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

## 🎯 System Overview

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
- ✅ **Multi-User RFID Support**: Session-based card management
- ✅ **Real-time Hardware Control**: Direct relay activation via Modbus
- ✅ **Web Administration**: Complete locker management interface
- ✅ **Production Ready**: Comprehensive monitoring and documentation

## 🚀 Developer Onboarding Guide

### **🎯 New Developer Quick Start**

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

### **🗺️ Repository Navigation Map**

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

### 🛠️ Hardware Validation
- **`validate-waveshare-hardware.js`** - Waveshare relay card testing
- **`hardware-diagnostics.js`** - Complete hardware diagnostics

```bash
# Example automation workflow
./scripts/package.sh create deployment        # Create package
./scripts/sign-package.sh sign package.tar.gz # Sign package
sudo ./scripts/deploy.sh deploy package.tar.gz # Deploy with rollback
./scripts/health-check.sh                     # Validate deployment
```

## 🚀 Features

### Core Functionality
- **🔐 Secure Kiosk Provisioning**: Token-based registration with HMAC authentication
- **⚙️ Configuration Management**: Centralized configuration distribution with version control and hash verification
- **📡 Real-time Monitoring**: Heartbeat monitoring and comprehensive status tracking
- **🔄 Atomic Operations**: Configuration changes with automatic rollback capabilities
- **📊 Audit Logging**: Complete event logging and audit trails
- **🌐 Web Interface**: Browser-based management panel for monitoring and control

### Technical Highlights
- **Version Control**: SHA256-based configuration versioning
- **Rollback Capability**: Automatic and manual rollback for failed deployments
- **Zone Management**: Deploy configurations to specific zones or individual kiosks
- **Status Tracking**: Real-time kiosk status with configuration state monitoring
- **Concurrent Access**: SQLite with WAL mode for high-performance concurrent operations

## 🏗️ Architecture

The system is built with modern technologies:

- **Backend**: Node.js with Fastify framework for high performance
- **Database**: SQLite with Write-Ahead Logging (WAL) for concurrent access
- **Security**: HMAC-based authentication and cryptographic token validation
- **Configuration**: Version-controlled packages with SHA256 hash verification
- **Testing**: Comprehensive test suite with Vitest
- **Build System**: ESBuild for fast compilation and bundling

## 📋 Prerequisites

- **Node.js**: Version 20.0.0 or higher
- **npm**: Package manager (comes with Node.js)
- **Git**: For version control

## 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/mredag/eformLockerRoom.git
cd eformLockerRoom

# Install dependencies
npm install

# Build the project
npm run build
```

## 🚦 Getting Started

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

## 🌐 Web Interfaces

- **Configuration Panel**: http://localhost:3000/config-panel
- **Health Check**: http://localhost:3000/health

## 📡 API Endpoints

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

## 🧪 Testing & Quality Assurance

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

## 📚 Documentation

- **[Configuration System](docs/configuration-system.md)** - Comprehensive configuration management guide
- **[API Reference](docs/api-reference.md)** - Complete API documentation
- **[Deployment Guide](docs/deployment.md)** - Production deployment instructions
- **[Architecture Overview](docs/architecture.md)** - System architecture and design decisions

## 🔧 Configuration

### System Configuration Parameters

The system supports comprehensive configuration management with the following parameters:

```typescript
interface SystemConfig {
  BULK_INTERVAL_MS: number;           // Bulk operation interval
  RESERVE_TTL_SECONDS: number;        // Reservation time-to-live
  OPEN_PULSE_MS: number;              // Locker open pulse duration
  OPEN_BURST_SECONDS: number;         // Open burst duration
  OPEN_BURST_INTERVAL_MS: number;     // Interval between bursts
  MASTER_LOCKOUT_FAILS: number;       // Failed attempts before lockout
  MASTER_LOCKOUT_MINUTES: number;     // Lockout duration
  HEARTBEAT_SEC: number;              // Heartbeat interval
  OFFLINE_SEC: number;                // Offline threshold
  LOG_RETENTION_DAYS: number;         // Log retention period
  RATE_LIMIT_IP_PER_MIN: number;      // IP rate limiting
  RATE_LIMIT_CARD_PER_MIN: number;    // Card rate limiting
  RATE_LIMIT_LOCKER_PER_MIN: number;  // Locker rate limiting
  RATE_LIMIT_DEVICE_PER_SEC: number;  // Device rate limiting
}
```

## 🚀 Deployment

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

## 🤝 Contributing Guidelines

### **📋 Development Workflow**

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

### **🗂️ File Organization Rules**

**DO:**
- ✅ Place files in appropriate directories following `DIRECTORY_STRUCTURE.md`
- ✅ Use descriptive, kebab-case file names
- ✅ Include proper documentation for new features
- ✅ Add tests for new functionality
- ✅ Follow existing code patterns and conventions

**DON'T:**
- ❌ Add temporary files to the repository (use `.gitignore`)
- ❌ Create new root-level directories without discussion
- ❌ Duplicate functionality that exists in `shared/`
- ❌ Skip documentation for new features
- ❌ Break existing service interfaces

### **🧹 Repository Cleanliness**

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

### **🔄 Pull Request Process**

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

### **📞 Getting Help**

- **Documentation**: Start with `docs/README.md` for navigation
- **Issues**: Check existing issues before creating new ones
- **Architecture Questions**: Review `docs/SYSTEM_DOCUMENTATION.md`
- **Hardware Setup**: Follow `docs/pi-configuration-guide.md`

### **🎯 Contribution Areas**

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

## 📊 Repository Status

### **🧹 Recent Cleanup (August 2025)**

The repository underwent comprehensive cleanup and organization:

- **✅ 105 files removed**: Eliminated obsolete and redundant files
- **✅ Documentation consolidated**: 7 essential docs with clear navigation
- **✅ Scripts organized**: 60 essential scripts categorized by purpose
- **✅ Structure standardized**: Node.js conventions with clear hierarchy
- **✅ Automated prevention**: Enhanced .gitignore prevents future accumulation

**Detailed cleanup report**: [REPOSITORY_CLEANUP_REPORT.md](REPOSITORY_CLEANUP_REPORT.md)

### **🎯 Current Status**
- **Repository**: Clean, organized, production-ready
- **Documentation**: Comprehensive with clear navigation
- **Code Quality**: Standardized structure and conventions
- **Maintenance**: Automated prevention of file accumulation

## 📊 Project Status

- ✅ **Kiosk Provisioning System**: Complete with secure token-based registration
- ✅ **Configuration Distribution**: Complete with version control and rollback
- ✅ **Web Interface**: Complete with real-time monitoring dashboard
- ✅ **Testing Suite**: Comprehensive test coverage (58 tests passing)
- ✅ **Documentation**: Complete API and system documentation

## 🔒 Security Features

- **HMAC Authentication**: Cryptographic validation of kiosk identities
- **Token Expiration**: Time-limited provisioning tokens
- **Hash Verification**: SHA256 verification of configuration integrity
- **Audit Logging**: Complete audit trail of all system operations
- **Rollback Protection**: Automatic rollback on configuration failures

## 📈 Performance

- **Concurrent Operations**: SQLite WAL mode for high-performance concurrent access
- **Efficient Bundling**: ESBuild for fast compilation and small bundle sizes
- **Memory Optimization**: Efficient database connection pooling
- **Caching**: Intelligent caching of configuration packages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Fastify](https://www.fastify.io/) for high-performance HTTP server
- Database operations powered by [SQLite](https://www.sqlite.org/)
- Testing framework: [Vitest](https://vitest.dev/)
- Build system: [ESBuild](https://esbuild.github.io/)

---

**Made with ❤️ for enterprise locker management systems**