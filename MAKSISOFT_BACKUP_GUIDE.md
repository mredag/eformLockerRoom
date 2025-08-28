# Maksisoft Integration Backup & Rollback Guide

## 🛡️ Pre-Deployment Backup

Before pushing the Maksisoft integration to main, create a complete backup:

### Windows (PowerShell)
```powershell
.\scripts\backup-maksisoft-integration.ps1
```

### Linux/macOS (Bash)
```bash
chmod +x scripts/backup-maksisoft-integration.sh
./scripts/backup-maksisoft-integration.sh
```

## 📋 What Gets Backed Up

### Core Implementation Files (8 files)
- `app/panel/src/services/maksi.ts` - Main API service
- `app/panel/src/services/maksi-types.ts` - Type definitions  
- `app/panel/src/routes/maksi-routes.ts` - REST API endpoints
- `app/panel/src/middleware/rate-limit.ts` - Rate limiting middleware
- `app/panel/src/views/lockers.html` - UI integration (modified)
- `app/panel/src/index.ts` - Service registration (modified)
- `.env.example` - Configuration template (modified)
- `app/panel/src/services/maksi-config.md` - Configuration docs

### Test Suite (10 files)
- `app/panel/src/__tests__/maksi-*.test.ts` - Unit tests (7 files)
- `app/panel/src/__tests__/maksi-manual-validation.js` - Browser testing
- `app/panel/src/__tests__/maksi-test-summary.md` - Test documentation
- `app/panel/src/__tests__/MAKSISOFT_MVP_VALIDATION_REPORT.md` - Validation report

### Documentation & Specs (6 files)
- `.kiro/specs/maksisoft-integration/` - Complete spec (3 files)
- `.kiro/panel-maksisoft-integration.md` - Implementation notes
- `.kiro/steering/maksisoft-spec-help.md` - Development guide
- `scripts/validate-maksisoft-mvp.js` - Validation script

## 🔄 Rollback Options

If you need to revert the Maksisoft integration, you have 3 options:

### Option 1: Automated Rollback Script (Recommended)
```bash
# The backup script creates a custom rollback script
./backups/pre-maksisoft-YYYYMMDD-HHMMSS/rollback-maksisoft.ps1  # Windows
./backups/pre-maksisoft-YYYYMMDD-HHMMSS/rollback-maksisoft.sh   # Linux/macOS
```

### Option 2: Git Stash (If Available)
```bash
# Check available stashes
git stash list

# Apply the pre-maksisoft stash
git stash pop stash@{0}  # Use the correct stash number
```

### Option 3: Manual File Restoration
```bash
# Copy files back from backup directory
cp -r backups/pre-maksisoft-YYYYMMDD-HHMMSS/* .
```

## 🚨 Emergency Rollback (Production)

If the integration causes issues in production:

### 1. Quick Disable (Immediate)
```bash
# SSH to Pi and disable feature flag
ssh pi@pi-eform-locker
export MAKSI_ENABLED=false
# Restart panel service
sudo pkill -f "panel"
npm run start:panel &
```

### 2. Full Rollback (Complete)
```bash
# SSH to Pi and run rollback
ssh pi@pi-eform-locker
cd /home/pi/eform-locker

# Option A: Use rollback script (if backup exists)
./backups/pre-maksisoft-*/rollback-maksisoft.sh

# Option B: Git revert to previous commit
git log --oneline -10  # Find commit before Maksisoft
git reset --hard COMMIT_HASH
npm run build:panel
sudo pkill -f "panel"
npm run start:panel &
```

## 📊 Backup Verification

After creating backup, verify it contains:

```bash
# Check backup directory structure
ls -la backups/pre-maksisoft-*/

# Should contain:
# - backup-manifest.json (backup metadata)
# - rollback-maksisoft.* (rollback script)
# - app/ (backed up application files)
# - .kiro/ (backed up configuration)
# - scripts/ (backed up scripts)
```

## 🔍 Testing After Rollback

After rollback, verify system works:

1. **Panel Service**: `curl http://localhost:3001/health`
2. **Locker Page**: Visit `/lockers` - should load without Maksisoft buttons
3. **API Endpoints**: Maksisoft endpoints should return 404
4. **Existing Features**: RFID assignment, relay control should work normally

## 📝 Backup Manifest

Each backup includes a `backup-manifest.json` with:

```json
{
  "backupDate": "2025-08-27T10:30:00Z",
  "gitCommit": "abc123...",
  "gitBranch": "main", 
  "filesBackedUp": ["list of existing files backed up"],
  "newFiles": ["list of new files that will be added"],
  "modifiedFiles": ["list of files that will be changed"],
  "gitStash": "pre-maksisoft-backup-20250827-103000"
}
```

## ⚡ Quick Commands

```bash
# Create backup before deployment
./scripts/backup-maksisoft-integration.ps1

# Deploy to production
git add .
git commit -m "feat: Add Maksisoft integration MVP"
git push origin main

# If rollback needed
./backups/pre-maksisoft-*/rollback-maksisoft.ps1

# Verify rollback worked
curl http://localhost:3001/lockers | grep -i maksisoft  # Should return nothing
```

## 🎯 Safe Deployment Checklist

- [ ] ✅ Backup created successfully
- [ ] ✅ Rollback script tested (dry run)
- [ ] ✅ Git stash created as secondary backup
- [ ] ✅ Production environment variables ready
- [ ] ✅ Maksisoft credentials obtained
- [ ] ✅ Team notified of deployment window
- [ ] ✅ Rollback plan communicated

---

**Remember**: The backup scripts preserve the exact state before Maksisoft integration, allowing you to completely revert if needed. Always test the rollback process in a development environment first!