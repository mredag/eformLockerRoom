# 🔄 Maksisoft Integration Rollback Instructions

## Quick Rollback (If Needed)

If you need to revert the Maksisoft integration, you have a backup branch ready.

### Option 1: Reset to Backup Branch (Complete Rollback)

```bash
# Reset main branch to the backup point
git reset --hard backup/pre-maksisoft-integration

# Force push to update remote (⚠️ Use with caution!)
git push origin main --force
```

### Option 2: Create Revert Commit (Safer)

```bash
# Find the commit hash of the Maksisoft integration
git log --oneline -5

# Revert the Maksisoft commit (replace COMMIT_HASH)
git revert f42177d

# Push the revert commit
git push origin main
```

### Option 3: Switch to Backup Branch Temporarily

```bash
# Switch to the backup branch
git checkout backup/pre-maksisoft-integration

# Create a new branch from backup if needed
git checkout -b main-without-maksisoft

# Push the new branch
git push origin main-without-maksisoft
```

## 🚨 Emergency Production Rollback

If deployed to Raspberry Pi and causing issues:

### 1. Quick Disable (Immediate Fix)
```bash
# SSH to Pi
ssh pi@pi-eform-locker

# Disable Maksisoft feature
export MAKSISOFT_ENABLED=false

# Restart panel service
sudo pkill -f "panel"
npm run start:panel &
```

### 2. Full Git Rollback on Pi
```bash
# SSH to Pi
ssh pi@pi-eform-locker
cd /home/pi/eform-locker

# Reset to backup branch
git fetch origin
git reset --hard origin/backup/pre-maksisoft-integration

# Rebuild and restart
npm run build:panel
sudo pkill -f "panel"
npm run start:panel &
```

## 📊 Current State

- **✅ Backup Branch Created**: `backup/pre-maksisoft-integration`
- **✅ Maksisoft Integration Pushed**: Commit `f42177d`
- **✅ Both branches on GitHub**: Safe to rollback anytime

## 🔍 Verify Rollback Worked

After rollback, check:

```bash
# Verify no Maksisoft files exist
ls app/panel/src/services/maksi*  # Should show "No such file"
ls app/panel/src/routes/maksi*    # Should show "No such file"

# Check panel service works
curl http://localhost:3001/health

# Verify lockers page loads without Maksisoft buttons
curl http://localhost:3001/lockers | grep -i maksisoft  # Should return nothing
```

## 📋 Files That Will Be Removed in Rollback

- `app/panel/src/services/maksi.ts`
- `app/panel/src/services/maksi-types.ts`
- `app/panel/src/routes/maksi-routes.ts`
- `app/panel/src/middleware/rate-limit.ts`
- All `app/panel/src/__tests__/maksi-*.test.ts` files
- `.kiro/specs/maksisoft-integration/` directory
- Maksisoft-related documentation files

## 🎯 Backup Branch Details

- **Branch Name**: `backup/pre-maksisoft-integration`
- **Commit**: `c821979` - "Fix Panel relay timeout issue after 30 minutes"
- **Date**: Before Maksisoft integration
- **Status**: Clean, working system without Maksisoft features

---

**Remember**: The backup branch preserves the exact working state before Maksisoft integration. You can always return to this stable point if needed!