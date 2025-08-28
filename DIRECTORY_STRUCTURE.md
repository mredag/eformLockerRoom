# eForm Locker System - Directory Structure

This document outlines the standardized directory structure following Node.js conventions.

## Root Directory Structure

```
eform-locker-system/
├── app/                          # Application services (microservices architecture)
│   ├── gateway/                  # API Gateway service (Port 3000)
│   ├── kiosk/                    # Kiosk hardware control service (Port 3002)
│   ├── panel/                    # Admin panel web interface (Port 3001)
│   └── agent/                    # Background task processing service
├── shared/                       # Shared utilities and libraries
│   ├── controllers/              # Shared controller logic
│   ├── services/                 # Shared business logic services
│   ├── types/                    # TypeScript type definitions
│   └── database/                 # Database utilities and connections
├── tests/                        # Test suites
│   ├── integration/              # Integration tests
│   └── README.md                 # Test documentation
├── scripts/                      # Operational and utility scripts
│   ├── deployment/               # Deployment scripts
│   ├── testing/                  # Test execution scripts
│   ├── maintenance/              # System maintenance scripts
│   ├── emergency/                # Emergency response scripts
│   └── setup/                    # Initial setup scripts
├── docs/                         # Project documentation
│   ├── troubleshooting/          # Troubleshooting guides
│   ├── integrations/             # Integration documentation
│   └── maintenance/              # Maintenance procedures
├── migrations/                   # Database migration files
├── config/                       # Configuration files
├── data/                         # Database files (gitignored)
├── logs/                         # Log files (gitignored)
├── legacy-src/                   # Legacy source code (to be reviewed)
├── .kiro/                        # Kiro IDE configuration
│   ├── specs/                    # Feature specifications
│   └── steering/                 # Development guidelines
├── .github/                      # GitHub workflows and templates
├── .vscode/                      # VS Code configuration
└── node_modules/                 # Dependencies (gitignored)
```

## File Organization Principles

### Source Code
- **app/**: Contains all microservices, each with their own src/, dist/, and package.json
- **shared/**: Common utilities used across multiple services
- **legacy-src/**: Legacy code that needs review and potential migration

### Tests
- **tests/integration/**: Cross-service integration tests
- **app/*/src/__tests__/**: Unit tests within each service
- **shared/**/__tests__/**: Tests for shared utilities

### Documentation
- **docs/**: Essential project documentation
- **README.md**: Main project overview
- **DIRECTORY_STRUCTURE.md**: This file

### Scripts
- **scripts/deployment/**: Deployment automation
- **scripts/testing/**: Test execution utilities
- **scripts/maintenance/**: System maintenance tools
- **scripts/emergency/**: Emergency response procedures

### Configuration
- **config/**: Environment-specific configuration
- **.env**: Environment variables (gitignored)
- **.env.example**: Environment template
- **tsconfig.json**: TypeScript configuration
- **package.json**: Main project dependencies

## Naming Conventions

### Files
- Use kebab-case for file names: `user-service.ts`
- Use PascalCase for class files: `UserService.ts`
- Use lowercase for directories: `user-management/`

### Directories
- Use kebab-case: `user-management/`
- Use descriptive names: `integration-tests/` not `tests/int/`

### Services
- Each service in `app/` should have:
  - `src/`: Source code
  - `dist/`: Compiled output (gitignored)
  - `package.json`: Service-specific dependencies
  - `tsconfig.json`: Service-specific TypeScript config

## Build Artifacts

Build artifacts are automatically generated and should not be committed:
- `dist/`: Compiled JavaScript
- `build/`: Build outputs
- `assets/index-*.js`: Generated asset bundles
- `*.tsbuildinfo`: TypeScript build info

## Temporary Files

The following patterns are gitignored to prevent accumulation:
- `*-summary.md`: Task completion summaries
- `debug-*.*`: Debug files
- `temp-*.*`: Temporary files
- `test-*.html`: Test artifacts
- `*.tmp`, `*.temp`: System temporary files

## Migration Notes

### Recent Changes
- Moved deployment scripts from root to `scripts/deployment/`
- Moved legacy `src/` to `legacy-src/` for review
- Moved task summaries to `docs/`
- Removed build artifacts from `assets/` and `dist/`
- Enhanced `.gitignore` to prevent future file accumulation

### Legacy Code
- `legacy-src/`: Contains old configuration and provisioning code
- Review needed to determine if code should be:
  - Migrated to appropriate services
  - Moved to shared utilities
  - Archived or removed

## 🧹 Maintenance Guidelines

### **Daily Development Practices**
1. **Follow Naming Conventions**: Use kebab-case for files and directories
2. **Proper File Placement**: Place files in appropriate directories per this guide
3. **Use .gitignore Patterns**: Leverage enhanced patterns to prevent temporary file accumulation
4. **Document New Features**: Update relevant documentation for any changes

### **Weekly Maintenance Tasks**
- Review and remove any temporary files that bypassed .gitignore
- Check for outdated documentation and update as needed
- Validate that all services build successfully
- Ensure no duplicate functionality across services

### **Monthly Reviews**
- Assess script usage and remove unused utilities
- Review documentation accuracy and completeness
- Check for code duplication that could be moved to `shared/`
- Update dependencies and check for security issues

### **Quarterly Assessments**
- Comprehensive review of repository organization
- Evaluation of directory structure effectiveness
- Assessment of developer onboarding experience
- Review and update maintenance procedures

### **Automated Prevention Measures**
The repository includes enhanced `.gitignore` patterns that automatically prevent:
- Build artifacts (`dist/`, `build/`, `*.tsbuildinfo`)
- Temporary files (`temp-*`, `debug-*`, `*-summary.md`)
- Log files (`logs/`, `*.log`)
- Environment files (`.env`, but preserves `.env.example`)
- IDE-specific files and system artifacts

### **File Lifecycle Management**

**Adding New Files**:
1. Determine appropriate directory based on file purpose
2. Follow established naming conventions
3. Add proper documentation if the purpose isn't obvious
4. Include in appropriate .gitignore if temporary

**Modifying Existing Files**:
1. Maintain existing structure and conventions
2. Update related documentation
3. Ensure backward compatibility
4. Add tests for new functionality

**Removing Files**:
1. Check for dependencies and references in codebase
2. Update documentation that references the file
3. Consider archiving instead of deleting if historically valuable
4. Update scripts or configurations that reference the file

## Related Documentation

- `docs/README.md`: Documentation index
- `scripts/README.md`: Script usage guide
- `tests/README.md`: Testing procedures
- Individual service README files in `app/*/`