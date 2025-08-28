# Scripts Directory

This directory contains organized utility scripts for the eForm Locker System.

## Directory Structure

### `/deployment/` - Deployment & Installation
Scripts for system deployment, installation, and packaging.
- Complete system installation and setup
- Production deployment with rollback capability
- Package creation and digital signing
- System removal and cleanup

### `/testing/` - Testing & Validation
Scripts for testing, validation, and quality assurance.
- Hardware testing (relay, RFID, Modbus)
- System validation and compatibility checks
- End-to-end testing suites
- WebSocket and real-time functionality testing

### `/maintenance/` - System Maintenance
Scripts for ongoing system maintenance and monitoring.
- Health monitoring and service management
- Backup and restore operations
- Service startup and cleanup
- Performance monitoring and upgrades

### `/emergency/` - Emergency & Diagnostics
Scripts for emergency procedures and troubleshooting.
- Emergency relay shutdown and reset
- Hardware diagnostics and issue resolution
- System debugging and problem analysis
- RFID device checking and validation

### `/setup/` - Initial Setup & Configuration
Scripts for initial system setup and configuration.
- Environment and database setup
- User management and authentication
- Configuration initialization
- Migration and data management

### `/analysis/` - Code Analysis & Repository Tools
Scripts for repository analysis and code quality assessment.
- Repository structure analysis
- File categorization and organization
- Safety and security assessment
- Dependency analysis and cleanup

### `/systemd/` - System Service Management
SystemD service files and related configuration.

## Usage

Navigate to the appropriate subdirectory and refer to the README.md file in each category for specific usage instructions.

```bash
# Example: Run hardware testing
cd scripts/testing
node test-basic-relay-control.js

# Example: Start services
cd scripts/maintenance
./start-all-clean.sh
```

## Safety Notes

- Emergency scripts should only be used when necessary
- Always test hardware scripts in a safe environment
- Backup system state before running maintenance scripts
- Review individual script documentation before use

## Recent Organization (August 2025)

This directory has been reorganized from a flat structure to a categorized structure for better maintainability:

- **Removed**: 15+ obsolete scripts (fix-*, quick-fix-*, temporary files)
- **Organized**: 60+ essential scripts into 6 logical categories
- **Documented**: Each category has its own README with usage instructions
- **Maintained**: All production-critical scripts preserved and organized

For the complete list of changes, see the repository cleanup documentation.