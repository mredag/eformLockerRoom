---
inclusion: always
---

# Clean Work Etiquette for Kiro AI Development

## 🎯 **Purpose**

This guide ensures that Kiro AI maintains repository cleanliness and follows established organizational standards while developing features for the eForm Locker System.

## 🧹 **Pre-Work Routine**

### **Before Starting Any Development Task**

1. **Repository Health Check**
   ```powershell
   # Quick health assessment
   .\scripts\maintenance\daily-routine.ps1 -Quick
   
   # View current status
   bash scripts/maintenance/maintenance-dashboard.sh
   ```

2. **Clean Workspace**
   ```powershell
   # Remove any temporary files
   bash scripts/maintenance/daily-cleanup.sh
   
   # Check for uncommitted changes
   git status
   ```

3. **Verify Git Hooks**
   ```powershell
   # Ensure quality gates are active
   ls .git/hooks/pre-commit
   ls .git/hooks/pre-push
   ```

## 📁 **File Organization Standards**

### **Directory Placement Rules**

| File Type | Correct Location | Examples |
|-----------|------------------|----------|
| **Application Code** | `app/{service}/src/` | `app/kiosk/src/controllers/` |
| **Shared Utilities** | `shared/` | `shared/services/`, `shared/types/` |
| **Documentation** | `docs/` | `docs/deployment-guide.md` |
| **Scripts** | `scripts/{category}/` | `scripts/maintenance/`, `scripts/testing/` |
| **Tests** | `tests/` or `app/{service}/__tests__/` | `tests/integration/`, `app/kiosk/__tests__/` |
| **Configuration** | `config/` or root level | `config/database.json`, `.env.example` |
| **Database** | `migrations/` | `migrations/001_initial_schema.sql` |

### **File Naming Conventions**

✅ **CORRECT Examples:**
- `user-authentication.ts`
- `relay-controller.js`
- `maksi-integration.test.ts`
- `deployment-guide.md`
- `health-check-kiosk.sh`

❌ **INCORRECT Examples:**
- `UserAuthentication.ts` (PascalCase)
- `relay controller.js` (spaces)
- `maksi_integration.test.ts` (snake_case)
- `DeploymentGuide.md` (PascalCase)
- `healthCheckKiosk.sh` (camelCase)

### **File Size Guidelines**

- **Maximum file size**: 10MB (use Git LFS for larger files)
- **Recommended code file size**: <500 lines
- **Documentation files**: <50KB for readability
- **Test files**: Group related tests, split if >1000 lines

## 🚫 **Prohibited Practices**

### **Never Create These File Types**

❌ **Temporary Files**
- `*.tmp`, `*.temp`, `*.bak`
- Files with timestamp patterns: `file-2024-08-28-debug.log`
- Debug output files: `debug-output.txt`, `test-results-123.json`

❌ **Problematic Names**
- Files with spaces: `my file.js`
- Very long names: `this-is-a-very-long-filename-that-exceeds-fifty-characters.js`
- Uppercase extensions: `.JS`, `.TS`, `.HTML`
- Non-descriptive names: `temp.js`, `test.ts`, `file1.md`

❌ **Wrong Locations**
- Scripts in root directory
- Documentation outside `docs/`
- Test files mixed with source code (unless in `__tests__/`)
- Configuration files scattered throughout project

### **Sensitive File Handling**

❌ **Never Commit**
- `.env` files (except `.env.example`)
- Private keys: `*.key`, `*.pem`, `*.p12`
- Passwords or secrets in any form
- Personal configuration files

## 🔄 **During Development Workflow**

### **File Creation Process**

1. **Choose Appropriate Location**
   ```
   # Ask: What type of file am I creating?
   # Application code → app/{service}/src/
   # Shared utility → shared/
   # Documentation → docs/
   # Script → scripts/{category}/
   # Test → tests/ or __tests__/
   ```

2. **Use Proper Naming**
   ```
   # Use kebab-case
   # Be descriptive but concise
   # Include file purpose in name
   # Max 50 characters
   ```

3. **Verify Placement**
   ```powershell
   # Check organization compliance
   node scripts/maintenance/file-organization-checker.js
   ```

### **Code Development Standards**

✅ **Good Practices:**
- Create files in appropriate directories
- Use descriptive, kebab-case filenames
- Include proper file headers/comments
- Follow existing code structure patterns
- Write accompanying tests when appropriate

❌ **Avoid:**
- Creating files in root directory
- Using temporary or debug filenames
- Mixing different concerns in single files
- Creating duplicate functionality
- Ignoring existing patterns

### **Testing and Validation**

```powershell
# Before committing, always run:
git add .

# Git hooks will automatically check:
# - No temporary files
# - Proper naming conventions
# - File size limits
# - No sensitive data

# Manual verification if needed:
node scripts/maintenance/file-organization-checker.js --verbose
```

## 📝 **Commit Standards**

### **Commit Message Format**

```
type(scope): description

Examples:
feat(auth): add RFID authentication system
fix(relay): resolve modbus communication timeout
docs(api): update endpoint documentation
test(kiosk): add session management tests
cleanup: remove temporary debug files
refactor(ui): improve component organization
```

### **Commit Types**
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `cleanup`: Repository cleanup activities

## 🔍 **Post-Development Cleanup**

### **After Completing Features**

1. **Verify Organization**
   ```powershell
   # Check what was created/modified
   git status
   git diff --name-only
   
   # Verify organization compliance
   node scripts/maintenance/file-organization-checker.js
   ```

2. **Clean Up Artifacts**
   ```powershell
   # Remove any temporary files created during development
   bash scripts/maintenance/daily-cleanup.sh
   
   # Check for large files
   git ls-files | xargs ls -la | awk '$5 > 10485760 { print $9, $5 }'
   ```

3. **Health Check**
   ```powershell
   # Final repository health verification
   bash scripts/maintenance/repository-health-check.sh
   ```

## 🎯 **Quality Gates**

### **Automated Checks (Git Hooks)**

The following checks run automatically on commit/push:

✅ **Pre-commit Checks:**
- No temporary file patterns
- File size limits (<10MB)
- Naming convention compliance
- No sensitive files
- Documentation link validation

✅ **Pre-push Checks:**
- Repository health score >75
- File organization compliance
- No broken references

### **Manual Quality Verification**

```powershell
# Comprehensive quality check
.\scripts\maintenance\daily-routine.ps1 -Full

# Organization-specific check
node scripts/maintenance/file-organization-checker.js --verbose

# Health score check
bash scripts/maintenance/repository-health-check.sh
```

## 🚨 **Emergency Procedures**

### **If Quality Gates Fail**

1. **Identify Issues**
   ```powershell
   # Check what's blocking the commit
   git status
   node scripts/maintenance/file-organization-checker.js
   ```

2. **Fix Common Issues**
   ```powershell
   # Remove temporary files
   bash scripts/maintenance/daily-cleanup.sh
   
   # Rename files with spaces or wrong case
   # Move files to correct directories
   # Reduce file sizes if needed
   ```

3. **Bypass Only If Necessary**
   ```powershell
   # Only use in emergencies (not recommended)
   git commit --no-verify -m "emergency: description"
   ```

### **Repository Recovery**

```powershell
# If repository becomes disorganized:

# 1. Run comprehensive maintenance
.\scripts\maintenance\daily-routine.ps1 -Full

# 2. Check for issues
bash scripts/maintenance/repository-health-check.sh

# 3. Manual cleanup if needed
node scripts/maintenance/automated-maintenance.js --dry-run --verbose

# 4. Apply fixes
node scripts/maintenance/automated-maintenance.js
```

## 📊 **Monitoring and Metrics**

### **Repository Health Indicators**

Monitor these metrics regularly:

- **Health Score**: Should stay >75 (target: >90)
- **File Count**: Total files <2000
- **Temporary Files**: Should be 0
- **Large Files**: <5 files >10MB
- **Root Files**: <15 files in root directory
- **Organization Compliance**: >90%

### **Dashboard Usage**

```powershell
# Daily status check
bash scripts/maintenance/maintenance-dashboard.sh

# Detailed metrics
node scripts/maintenance/file-organization-checker.js --verbose

# Health trends
cat scripts/maintenance/health-check.log | tail -10
```

## 🎓 **Best Practices Summary**

### **Golden Rules for Kiro AI**

1. **Always check repository health before starting work**
2. **Follow directory structure and naming conventions**
3. **Never create temporary or debug files in commits**
4. **Use descriptive, kebab-case filenames**
5. **Place files in appropriate directories**
6. **Run cleanup after completing features**
7. **Verify quality gates pass before pushing**
8. **Monitor repository health metrics**

### **Quick Reference Commands**

```powershell
# Pre-work setup
.\scripts\maintenance\daily-routine.ps1 -Quick

# During development
node scripts/maintenance/file-organization-checker.js

# Post-work cleanup
bash scripts/maintenance/daily-cleanup.sh

# Health verification
bash scripts/maintenance/repository-health-check.sh

# Emergency maintenance
.\scripts\maintenance\daily-routine.ps1 -Full
```

## 🔄 **Continuous Improvement**

### **Regular Maintenance Schedule**

- **Before each work session**: Quick health check
- **After major features**: Comprehensive cleanup
- **Weekly**: Full repository health review
- **Monthly**: Maintenance system updates

### **Feedback Loop**

- Monitor health scores and trends
- Adjust rules based on common issues
- Update automation based on new patterns
- Refine quality gates for better coverage

---

**Remember**: A clean repository is a productive repository. These practices ensure the eForm Locker System remains maintainable, scalable, and professional as it grows.