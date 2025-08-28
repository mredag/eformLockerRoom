#!/bin/bash

# Maksisoft Integration Backup Script (Linux/macOS)
# Creates a complete backup before deployment

set -e

BACKUP_DIR="backups/pre-maksisoft-$(date +%Y%m%d-%H%M%S)"

echo "🔄 Creating Maksisoft Integration Backup..."
echo "Backup Directory: $BACKUP_DIR"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Files to backup
FILES_TO_BACKUP=(
    "app/panel/src/services/maksi.ts"
    "app/panel/src/services/maksi-types.ts"
    "app/panel/src/routes/maksi-routes.ts"
    "app/panel/src/middleware/rate-limit.ts"
    "app/panel/src/views/lockers.html"
    "app/panel/src/index.ts"
    ".env.example"
    "app/panel/src/__tests__/maksi-data-mapping.test.ts"
    "app/panel/src/__tests__/maksi-service.test.ts"
    "app/panel/src/__tests__/maksi-rate-limiter.test.ts"
    "app/panel/src/__tests__/maksi-routes.test.ts"
    "app/panel/src/__tests__/maksi-integration.test.ts"
    "app/panel/src/__tests__/maksi-modal-display.test.ts"
    "app/panel/src/__tests__/maksi-mvp-validation.test.ts"
    "app/panel/src/__tests__/maksi-manual-validation.js"
    "app/panel/src/__tests__/maksi-test-summary.md"
    "app/panel/src/__tests__/MAKSISOFT_MVP_VALIDATION_REPORT.md"
    "app/panel/src/services/maksi-config.md"
    ".kiro/panel-maksisoft-integration.md"
    ".kiro/steering/maksisoft-spec-help.md"
    ".kiro/specs/maksisoft-integration/requirements.md"
    ".kiro/specs/maksisoft-integration/design.md"
    ".kiro/specs/maksisoft-integration/tasks.md"
    "scripts/validate-maksisoft-mvp.js"
)

# Create manifest
MANIFEST_FILE="$BACKUP_DIR/backup-manifest.json"
cat > "$MANIFEST_FILE" << EOF
{
  "backupDate": "$(date -Iseconds)",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
  "filesBackedUp": [],
  "newFiles": [],
  "modifiedFiles": []
}
EOF

echo ""
echo "📋 Analyzing files..."

BACKED_UP_FILES=()
NEW_FILES=()

for file in "${FILES_TO_BACKUP[@]}"; do
    if [ -f "$file" ]; then
        # File exists - backup it
        backup_path="$BACKUP_DIR/$file"
        backup_dir=$(dirname "$backup_path")
        
        # Create directory structure
        mkdir -p "$backup_dir"
        
        # Copy file
        cp "$file" "$backup_path"
        BACKED_UP_FILES+=("$file")
        
        echo "  ✅ Backed up: $file"
    else
        # File doesn't exist - will be new
        NEW_FILES+=("$file")
        echo "  📄 New file: $file"
    fi
done

# Create rollback script
ROLLBACK_SCRIPT="$BACKUP_DIR/rollback-maksisoft.sh"
cat > "$ROLLBACK_SCRIPT" << 'EOF'
#!/bin/bash

# Rollback Maksisoft Integration changes

set -e

echo "🔄 Rolling back Maksisoft Integration..."

# Remove new files that were added
NEW_FILES=(
EOF

for file in "${NEW_FILES[@]}"; do
    echo "    \"$file\"" >> "$ROLLBACK_SCRIPT"
done

cat >> "$ROLLBACK_SCRIPT" << 'EOF'
)

for file in "${NEW_FILES[@]}"; do
    if [ -f "$file" ]; then
        rm -f "$file"
        echo "  🗑️  Removed: $file"
    fi
done

# Restore modified files from backup
MODIFIED_FILES=(
EOF

for file in "${BACKED_UP_FILES[@]}"; do
    echo "    \"$file\"" >> "$ROLLBACK_SCRIPT"
done

cat >> "$ROLLBACK_SCRIPT" << EOF

)

BACKUP_DIR="$BACKUP_DIR"

for file in "\${MODIFIED_FILES[@]}"; do
    backup_path="\$BACKUP_DIR/\$file"
    if [ -f "\$backup_path" ]; then
        # Ensure directory exists
        dir=\$(dirname "\$file")
        if [ -n "\$dir" ] && [ ! -d "\$dir" ]; then
            mkdir -p "\$dir"
        fi
        
        cp "\$backup_path" "\$file"
        echo "  ↩️  Restored: \$file"
    fi
done

# Remove empty directories
DIRS_TO_CHECK=(
    "app/panel/src/__tests__"
    "app/panel/src/services"
    "app/panel/src/routes"
    "app/panel/src/middleware"
    ".kiro/specs/maksisoft-integration"
)

for dir in "\${DIRS_TO_CHECK[@]}"; do
    if [ -d "\$dir" ] && [ -z "\$(ls -A "\$dir")" ]; then
        rmdir "\$dir"
        echo "  🗑️  Removed empty directory: \$dir"
    fi
done

echo ""
echo "✅ Rollback completed!"
echo "You may need to:"
echo "  1. Restart panel service"
echo "  2. Clear browser cache"
echo "  3. Verify functionality"
EOF

chmod +x "$ROLLBACK_SCRIPT"

# Create Git stash as additional backup
echo ""
echo "💾 Creating Git stash backup..."
STASH_NAME="pre-maksisoft-backup-$(date +%Y%m%d-%H%M%S)"
git add . 2>/dev/null || true
if git stash push -m "$STASH_NAME" 2>/dev/null; then
    echo "  ✅ Git stash created: $STASH_NAME"
    STASH_CREATED="$STASH_NAME"
else
    echo "  ⚠️  Git stash failed (no changes to stash)"
    STASH_CREATED=""
fi

# Summary
echo ""
echo "📊 Backup Summary:"
echo "=================="
echo "Backup Directory: $BACKUP_DIR"
echo "Files Backed Up: ${#BACKED_UP_FILES[@]}"
echo "New Files: ${#NEW_FILES[@]}"
echo "Git Commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
echo "Git Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
if [ -n "$STASH_CREATED" ]; then
    echo "Git Stash: $STASH_CREATED"
fi

echo ""
echo "🛡️  Rollback Options:"
echo "1. Run rollback script: ./$ROLLBACK_SCRIPT"
if [ -n "$STASH_CREATED" ]; then
    echo "2. Git stash pop: git stash pop stash@{0}"
fi
echo "3. Manual restore from: $BACKUP_DIR"

echo ""
echo "✅ Backup completed successfully!"
echo "You can now safely push to main."