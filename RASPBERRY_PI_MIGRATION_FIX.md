# Raspberry Pi Migration Fix

## Issue
After the recent update, the system may fail to start on Raspberry Pi due to duplicate migration conflicts. This happens when migrations 015 and 016 try to apply changes that were already applied by migrations 009 and 010.

## Symptoms
- Kiosk service fails with "SQLITE_ERROR: no such table: lockers"
- Migration errors about duplicate column names
- Services fail to start properly

## Solution

### Automatic Fix (Recommended)
Run this command on your Raspberry Pi to automatically fix the migration conflicts:

```bash
npm run migrate:fix-duplicates
```

### Manual Fix (If needed)
If the automatic fix doesn't work, you can manually run:

```bash
node scripts/fix-duplicate-migrations.js
```

### Verification
After running the fix, verify everything is working:

```bash
# Check migration status
npm run migrate:status

# Start the services
npm run start
```

## What the Fix Does
1. Removes duplicate migration entries (015 and 016) from the database
2. Keeps the original migrations (009 and 010) that were already applied
3. Ensures all services can start without migration conflicts

## Prevention
This issue has been resolved in the codebase by:
- Removing the duplicate migration files
- Adding the fix script to package.json
- Ensuring consistent migration numbering

The fix is safe to run multiple times and will only remove the problematic duplicate entries.