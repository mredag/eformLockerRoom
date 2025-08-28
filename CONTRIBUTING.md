# Contributing to eForm Locker System

## 🎯 Overview

Thank you for your interest in contributing to the eForm Locker System! This document provides comprehensive guidelines for maintaining the clean, organized repository structure that was established through our recent cleanup initiative.

## 📋 Repository Structure Guidelines

### **🗂️ Directory Organization**

Our repository follows strict organizational principles. Before contributing, familiarize yourself with:

- **[DIRECTORY_STRUCTURE.md](DIRECTORY_STRUCTURE.md)** - Complete directory guide
- **[README.md](README.md)** - Project overview and structure
- **[docs/README.md](docs/README.md)** - Documentation navigation

### **📁 File Placement Rules**

**Services & Applications**
```
app/
├── gateway/          # API Gateway service (Port 3000)
├── kiosk/           # Hardware control service (Port 3002)  
├── panel/           # Admin web interface (Port 3001)
└── agent/           # Background processing service
```

**Shared Resources**
```
shared/
├── controllers/     # Common controller logic
├── services/        # Business logic services
├── types/          # TypeScript definitions
└── database/       # Database utilities
```

**Operational Scripts**
```
scripts/
├── deployment/     # Deployment automation
├── testing/        # Test utilities
├── maintenance/    # System maintenance
├── emergency/      # Emergency procedures
└── setup/         # Initial setup
```

**Documentation**
```
docs/
├── integrations/   # External system guides
├── troubleshooting/ # Issue resolution
├── maintenance/    # System maintenance
└── [core files]    # Essential documentation
```

## 🧹 Cleanliness Standards

### **✅ DO: Follow These Practices**

**File Organization**
- Place files in appropriate directories following the established structure
- Use kebab-case for file names (`user-service.ts`, not `UserService.ts`)
- Group related functionality together
- Follow existing naming conventions

**Code Quality**
- Include unit tests for new functionality
- Add integration tests for cross-service features
- Document new APIs in `docs/API_REFERENCE.md`
- Follow TypeScript best practices

**Documentation**
- Update relevant documentation for any changes
- Add troubleshooting information for new features
- Include examples in documentation
- Keep documentation current and accurate

### **❌ DON'T: Avoid These Practices**

**File Management**
- Don't add temporary files to the repository
- Don't create new root-level directories without discussion
- Don't duplicate functionality that exists in `shared/`
- Don't leave commented-out code blocks

**Code Practices**
- Don't skip tests for new functionality
- Don't break existing service interfaces
- Don't add dependencies without justification
- Don't ignore TypeScript errors or warnings

## 🔄 Development Workflow

### **1. Setup and Preparation**

```bash
# Fork and clone the repository
git clone https://github.com/your-username/eformLockerRoom.git
cd eformLockerRoom

# Install dependencies
npm install

# Create feature branch
git checkout -b feature/descriptive-name
```

### **2. Development Process**

```bash
# Build services to ensure everything works
npm run build:gateway
npm run build:kiosk
npm run build:panel

# Run tests
npm test                    # Unit tests
npm run test:integration    # Integration tests

# Test specific functionality
node scripts/testing/test-basic-relay-control.js
```

### **3. Code Standards**

**Service Structure**: Each service in `app/` should have:
```
service-name/
├── src/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   └── __tests__/
├── dist/              # Build output (gitignored)
├── package.json       # Service dependencies
└── tsconfig.json      # TypeScript config
```

**Shared Utilities**: Place reusable code in `shared/`:
```
shared/
├── services/
│   ├── service-name.ts
│   └── __tests__/
│       └── service-name.test.ts
└── types/
    └── common-types.ts
```

### **4. Testing Requirements**

**Unit Tests**: Required for all new functionality
```typescript
// app/service/src/__tests__/feature.test.ts
import { describe, it, expect } from 'vitest';
import { newFeature } from '../feature';

describe('New Feature', () => {
  it('should work correctly', () => {
    expect(newFeature()).toBe(expected);
  });
});
```

**Integration Tests**: Required for cross-service features
```typescript
// tests/integration/new-feature.test.ts
import { describe, it, expect } from 'vitest';
// Test cross-service functionality
```

### **5. Documentation Updates**

**API Changes**: Update API documentation
```markdown
<!-- docs/API_REFERENCE.md -->
### New Endpoint
POST /api/new-feature
- Description: What this endpoint does
- Parameters: Request parameters
- Response: Response format
```

**Troubleshooting**: Add troubleshooting information
```markdown
<!-- docs/troubleshooting/new-feature-issues.md -->
# New Feature Troubleshooting
Common issues and solutions for the new feature.
```

## 📝 Pull Request Guidelines

### **Pre-submission Checklist**

- [ ] **Structure**: Files placed in correct directories
- [ ] **Tests**: All tests pass (`npm test`)
- [ ] **Build**: All services build successfully
- [ ] **Documentation**: Updated for changes
- [ ] **Cleanliness**: No temporary or debug files
- [ ] **Standards**: Follows coding conventions

### **Commit Message Format**

```
type(scope): brief description

Detailed explanation if needed

- Specific change 1
- Specific change 2

Closes #issue-number
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
**Scopes**: `gateway`, `kiosk`, `panel`, `shared`, `docs`, `scripts`

### **Pull Request Template**

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring
- [ ] Performance improvement

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Documentation
- [ ] API documentation updated
- [ ] README updated if needed
- [ ] Troubleshooting guide updated

## Checklist
- [ ] Code follows repository structure
- [ ] All tests pass
- [ ] Documentation is complete
- [ ] No temporary files included
```

## 🛠️ Maintenance Guidelines

### **Regular Maintenance Tasks**

**Weekly**:
- Review and remove any temporary files
- Check for outdated documentation
- Validate that all services build successfully
- Run integration tests

**Monthly**:
- Review script usage and remove unused scripts
- Update dependencies and check for security issues
- Review and consolidate related documentation
- Check for code duplication that could be moved to `shared/`

### **File Lifecycle Management**

**Adding New Files**:
1. Determine appropriate directory based on file purpose
2. Follow naming conventions
3. Add to appropriate `.gitignore` if temporary
4. Document purpose if not obvious

**Modifying Existing Files**:
1. Maintain existing structure and conventions
2. Update related documentation
3. Ensure backward compatibility
4. Add tests for new functionality

**Removing Files**:
1. Check for dependencies and references
2. Update documentation that references the file
3. Consider archiving instead of deleting if historically valuable
4. Update any scripts or configurations that reference the file

## 🔍 Code Review Process

### **Automated Checks**

- **Build Validation**: All services must build successfully
- **Test Execution**: All tests must pass
- **Linting**: Code must pass linting rules
- **Structure Validation**: Files must be in correct directories

### **Manual Review Focus Areas**

**Architecture**:
- Does the change fit the existing architecture?
- Is functionality placed in the appropriate service?
- Are shared utilities used instead of duplication?

**Quality**:
- Is the code well-documented?
- Are tests comprehensive?
- Does it follow existing patterns?

**Maintenance**:
- Will this change be easy to maintain?
- Is documentation updated appropriately?
- Are there any potential future issues?

## 📞 Getting Help

### **Resources**

- **Documentation**: `docs/README.md` for navigation
- **Architecture**: `docs/SYSTEM_DOCUMENTATION.md`
- **API Reference**: `docs/API_REFERENCE.md`
- **Troubleshooting**: `docs/troubleshooting/`

### **Communication**

- **Issues**: Use GitHub issues for bugs and feature requests
- **Discussions**: Use GitHub discussions for questions
- **Documentation**: Check existing docs before asking questions

### **Development Environment**

- **Hardware Testing**: Requires Raspberry Pi with relay hardware
- **Local Development**: Can run services locally without hardware
- **API Testing**: Use Postman or curl for endpoint testing

## 🎯 Contribution Priorities

### **High Priority**
- Bug fixes and stability improvements
- Performance optimizations
- Security enhancements
- Documentation improvements

### **Medium Priority**
- New feature development
- UI/UX improvements
- Integration enhancements
- Test coverage expansion

### **Low Priority**
- Code refactoring (unless improving maintainability)
- Cosmetic changes
- Non-essential feature additions

## 📊 Success Metrics

We measure contribution success by:

- **Code Quality**: Test coverage and documentation completeness
- **Structure Adherence**: Following repository organization guidelines
- **Maintainability**: How easy the code is to understand and modify
- **Functionality**: Does it work as intended and integrate well?

Thank you for contributing to the eForm Locker System! Your efforts help maintain a clean, professional, and maintainable codebase.