# Project Structure

This document describes the reorganized project structure following the /opt/eform layout specification for the Eform Locker System.

## Directory Structure

```
eform-locker-system/
├── app/                          # Application services
│   ├── gateway/                  # Central coordination service
│   │   ├── src/
│   │   │   ├── controllers/      # API controllers
│   │   │   ├── services/         # Business logic services
│   │   │   ├── routes/           # Route definitions
│   │   │   ├── middleware/       # Custom middleware
│   │   │   ├── utils/            # Utility functions and CLI tools
│   │   │   └── index.ts          # Gateway service entry point
│   │   ├── __tests__/            # Gateway service tests
│   │   ├── dist/                 # Compiled output
│   │   ├── package.json          # Gateway dependencies
│   │   └── tsconfig.json         # Gateway TypeScript config
│   │
│   ├── kiosk/                    # Room-level kiosk service
│   │   ├── src/
│   │   │   ├── controllers/      # Kiosk API controllers
│   │   │   ├── services/         # Kiosk business logic
│   │   │   ├── hardware/         # Hardware interfaces (Modbus, RFID)
│   │   │   ├── ui/               # Kiosk user interface
│   │   │   └── index.ts          # Kiosk service entry point
│   │   ├── __tests__/            # Kiosk service tests
│   │   ├── dist/                 # Compiled output
│   │   ├── package.json          # Kiosk dependencies
│   │   └── tsconfig.json         # Kiosk TypeScript config
│   │
│   ├── panel/                    # Staff management panel
│   │   ├── src/
│   │   │   ├── controllers/      # Panel API controllers
│   │   │   ├── services/         # Panel business logic
│   │   │   ├── middleware/       # Authentication, authorization
│   │   │   ├── views/            # HTML templates and static files
│   │   │   └── index.ts          # Panel service entry point
│   │   ├── __tests__/            # Panel service tests
│   │   ├── dist/                 # Compiled output
│   │   ├── package.json          # Panel dependencies
│   │   └── tsconfig.json         # Panel TypeScript config
│   │
│   └── agent/                    # Update and monitoring agent
│       ├── src/
│       │   ├── services/         # Update and monitoring logic
│       │   └── index.ts          # Agent service entry point
│       ├── __tests__/            # Agent service tests
│       ├── dist/                 # Compiled output
│       ├── package.json          # Agent dependencies
│       └── tsconfig.json         # Agent TypeScript config
│
├── shared/                       # Shared components and utilities
│   ├── types/                    # TypeScript type definitions
│   │   ├── core-entities.ts      # Core entity interfaces
│   │   └── index.ts              # Type exports
│   ├── database/                 # Database utilities
│   │   ├── connection.ts         # Database connection manager
│   │   ├── migration-runner.ts   # Database migration system
│   │   └── schema.sql            # Legacy schema (for compatibility)
│   ├── services/                 # Shared business logic
│   │   ├── locker-state-manager.ts    # Locker state management
│   │   └── command-queue-manager.ts   # Command queue management
│   ├── utils/                    # Shared utility functions
│   ├── __tests__/                # Shared component tests
│   ├── package.json              # Shared dependencies
│   └── tsconfig.json             # Shared TypeScript config
│
├── config/                       # Configuration files
│   └── system.json               # System configuration
│
├── data/                         # Database and data files (gitignored)
│   └── eform.db                  # SQLite database
│
├── logs/                         # Log files (gitignored)
│   ├── gateway.log
│   ├── kiosk.log
│   ├── panel.log
│   └── agent.log
│
├── migrations/                   # Database migration files
│   ├── 001_initial_schema.sql    # Initial database schema
│   └── 002_provisioning_and_config.sql  # Provisioning and config tables
│
├── static/                       # Static assets
│   ├── css/                      # Stylesheets
│   ├── js/                       # Client-side JavaScript
│   └── images/                   # Images and icons
│
├── scripts/                      # Utility scripts
│   └── migrate.ts                # Database migration runner
│
├── docs/                         # Documentation
│   ├── project-structure.md      # This document
│   └── configuration-system.md   # Configuration system docs
│
├── src/                          # Legacy source (to be removed)
├── dist/                         # Legacy build output (to be removed)
├── package.json                  # Root package.json with workspace config
├── tsconfig.json                 # Root TypeScript configuration
├── .gitignore                    # Git ignore rules
├── README.md                     # Project README
└── LICENSE                       # MIT License
```

## Service Architecture

### Gateway Service (`app/gateway/`)

The central coordination service that handles:
- Kiosk provisioning and registration
- Configuration management and distribution
- Command queue coordination
- Database operations
- API gateway functionality

**Key Components:**
- `ProvisioningService`: Manages kiosk registration and enrollment
- `ConfigurationService`: Handles configuration packages and deployment
- `CommandQueueManager`: Coordinates commands across kiosks

### Kiosk Service (`app/kiosk/`)

Room-level service running on each kiosk that handles:
- RFID card scanning and processing
- QR code access (optional)
- Hardware control (Modbus relays)
- User interface display
- Local command execution

**Key Components:**
- `RfidHandler`: RFID card scanning and processing
- `QrHandler`: QR code access management
- `ModbusController`: Hardware relay control
- `KioskUI`: Touch interface management

### Panel Service (`app/panel/`)

Web-based staff management interface that provides:
- Real-time locker status monitoring
- Staff authentication and authorization
- VIP contract management
- Bulk operations and reporting
- System configuration

**Key Components:**
- `StaffController`: Staff operations and authentication
- `VipController`: VIP contract management
- `ReportingService`: CSV reports and analytics

### Agent Service (`app/agent/`)

Update and monitoring agent that handles:
- Automatic system updates
- Health monitoring
- Log management
- Backup operations

**Key Components:**
- `UpdateAgent`: Secure update management
- `HealthMonitor`: System health checks
- `BackupService`: Database and config backups

## Shared Components (`shared/`)

### Types (`shared/types/`)

Comprehensive TypeScript interfaces for all system entities:
- `Locker`: Locker state and ownership
- `VipContract`: VIP locker contracts
- `Event`: System event logging
- `Command`: Command queue operations
- `KioskHeartbeat`: Kiosk status and health

### Database (`shared/database/`)

Database management utilities:
- `DatabaseConnection`: SQLite connection with WAL mode
- `MigrationRunner`: Incremental schema migrations
- Connection pooling and error handling

### Services (`shared/services/`)

Shared business logic:
- `LockerStateManager`: Locker state transitions and validation
- `CommandQueueManager`: Command queuing with retry logic

## Configuration Management

### System Configuration (`config/system.json`)

Centralized configuration for all services:
- Service ports and endpoints
- Hardware settings (Modbus, RFID)
- Security parameters
- Rate limiting rules
- Logging configuration

### Environment-Specific Config

Each service can override configuration through environment variables:
- `EFORM_GATEWAY_PORT`: Gateway service port
- `EFORM_KIOSK_PORT`: Kiosk service port
- `EFORM_PANEL_PORT`: Panel service port
- `EFORM_DB_PATH`: Database file path

## Database Migrations

### Migration System

Incremental database schema changes using numbered SQL files:
- `001_initial_schema.sql`: Core tables and indexes
- `002_provisioning_and_config.sql`: Provisioning and configuration tables

### Migration Commands

```bash
# Run all pending migrations
npm run migrate

# Check migration status
npm run migrate:status

# Verify migration checksums
npm run migrate:verify
```

## Build and Development

### Workspace Commands

```bash
# Install all dependencies
npm run install-all

# Build all services
npm run build

# Build specific service
npm run build:gateway
npm run build:kiosk
npm run build:panel
npm run build:agent

# Development mode (with hot reload)
npm run dev:gateway
npm run dev:kiosk
npm run dev:panel
npm run dev:agent

# Run tests
npm test

# Start production services
npm run start:gateway
npm run start:kiosk
npm run start:panel
npm run start:agent
```

### Service-Specific Commands

Each service has its own package.json with specific commands:

```bash
# Gateway service
cd app/gateway
npm run dev          # Development mode
npm run build        # Build service
npm run test         # Run tests
npm run provision    # CLI provisioning tool
npm run config-test  # Configuration test

# Similar commands available for kiosk, panel, and agent services
```

## Deployment Structure

### Production Layout (`/opt/eform/`)

```
/opt/eform/
├── app/                    # Application services
├── shared/                 # Shared components
├── config/                 # Configuration files
├── data/                   # Database and data files
├── logs/                   # Log files
├── migrations/             # Database migrations
├── static/                 # Static assets
└── scripts/                # Utility scripts
```

### Service Management

Each service runs as a separate systemd service:
- `eform-gateway.service`
- `eform-kiosk.service`
- `eform-panel.service`
- `eform-agent.service`

## Migration from Legacy Structure

### Completed Migrations

1. ✅ Created new directory structure following /opt/eform layout
2. ✅ Moved existing code to appropriate service directories
3. ✅ Updated import paths and dependencies
4. ✅ Created comprehensive TypeScript interfaces
5. ✅ Implemented database migration system
6. ✅ Set up workspace configuration
7. ✅ Created service-specific package.json files

### Remaining Tasks

1. 🔄 Complete import path updates in all moved files
2. 🔄 Implement missing service components (kiosk, panel, agent)
3. 🔄 Create hardware interface implementations
4. 🔄 Build comprehensive test suites for all services
5. 🔄 Remove legacy `src/` directory after migration complete

## Benefits of New Structure

### Modularity
- Clear separation of concerns between services
- Independent deployment and scaling
- Easier testing and maintenance

### Scalability
- Services can be deployed on separate machines
- Horizontal scaling of kiosk services
- Independent update cycles

### Development Experience
- Workspace-based development with shared components
- Type safety across all services
- Consistent build and test processes

### Production Readiness
- Service-specific configuration and logging
- Database migration system
- Health monitoring and updates

This structure provides a solid foundation for the multi-room locker management system with clear separation of concerns and production-ready architecture.