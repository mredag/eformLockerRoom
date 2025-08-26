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

## 📚 Documentation

**Complete documentation is available in the [`docs/`](docs/) folder:**

### **Essential Documentation**
- **[📋 Documentation Overview](docs/README.md)** - Start here for navigation
- **[⚡ Quick Reference](docs/QUICK_REFERENCE.md)** - Essential commands and operations
- **[🏗️ System Documentation](docs/SYSTEM_DOCUMENTATION.md)** - Complete technical guide
- **[📡 API Reference](docs/API_REFERENCE.md)** - Comprehensive API documentation
- **[📊 Monitoring Guide](docs/MONITORING_GUIDE.md)** - Operations and troubleshooting

### **Setup & Deployment**
- **[🚀 Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment procedures
- **[💻 Development Setup](docs/DEVELOPMENT_ENVIRONMENT_SETUP.md)** - Local development environment
- **[🥧 Raspberry Pi Setup](docs/RASPBERRY_PI_ENVIRONMENT_SETUP.md)** - Pi-specific configuration

### **Project Information**
- **[✅ Production Summary](docs/PRODUCTION_READY_SUMMARY.md)** - Project completion overview
- **[🔧 Troubleshooting](docs/troubleshooting/)** - Historical issue reports and solutions

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

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

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