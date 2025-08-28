#!/bin/bash
# Daily Repository Cleanup Script
# Automatically removes temporary files and maintains repository cleanliness

set -e

echo "🧹 Starting daily repository cleanup - $(date)"
echo "=================================================="

# Configuration
TEMP_FILE_AGE=1      # Remove temp files older than 1 day
DEBUG_FILE_AGE=3     # Remove debug files older than 3 days
LOG_ROTATION_AGE=7   # Rotate logs older than 7 days
ARCHIVE_CLEANUP_AGE=30 # Remove archived logs older than 30 days

# Counters for reporting
temp_files_removed=0
debug_files_removed=0
logs_rotated=0
archives_cleaned=0

# Function to safely remove files and count them
safe_remove() {
    local pattern="$1"
    local age="$2"
    local description="$3"
    
    if [ -n "$pattern" ] && [ -n "$age" ]; then
        local count=$(find . -name "$pattern" -mtime +$age -not -path "./node_modules/*" -not -path "./.git/*" | wc -l)
        if [ $count -gt 0 ]; then
            find . -name "$pattern" -mtime +$age -not -path "./node_modules/*" -not -path "./.git/*" -delete
            echo "  ✓ Removed $count $description files"
            return $count
        else
            echo "  ℹ No $description files found to remove"
            return 0
        fi
    fi
    return 0
}

# 1. Remove temporary files
echo "🗑️  Cleaning temporary files..."
safe_remove "*.tmp" $TEMP_FILE_AGE "temporary"
temp_files_removed=$?

safe_remove "*.temp" $TEMP_FILE_AGE "temp"
temp_files_removed=$((temp_files_removed + $?))

safe_remove "*.bak" $TEMP_FILE_AGE "backup"
temp_files_removed=$((temp_files_removed + $?))

# Remove files with timestamp patterns (e.g., file-2024-08-28-*.ext)
timestamp_count=$(find . -name "*-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*" -mtime +$TEMP_FILE_AGE -not -path "./node_modules/*" -not -path "./.git/*" | wc -l)
if [ $timestamp_count -gt 0 ]; then
    find . -name "*-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*" -mtime +$TEMP_FILE_AGE -not -path "./node_modules/*" -not -path "./.git/*" -delete
    echo "  ✓ Removed $timestamp_count timestamped files"
    temp_files_removed=$((temp_files_removed + timestamp_count))
fi

# 2. Clean debug files
echo "🐛 Cleaning debug files..."
safe_remove "*debug*" $DEBUG_FILE_AGE "debug"
debug_files_removed=$?

safe_remove "*.debug" $DEBUG_FILE_AGE "debug extension"
debug_files_removed=$((debug_files_removed + $?))

# Remove test artifacts with specific patterns
test_artifact_count=$(find . -name "test-output-*" -o -name "*-test-[0-9]*" -mtime +$DEBUG_FILE_AGE -not -path "./node_modules/*" -not -path "./.git/*" | wc -l)
if [ $test_artifact_count -gt 0 ]; then
    find . -name "test-output-*" -o -name "*-test-[0-9]*" -mtime +$DEBUG_FILE_AGE -not -path "./node_modules/*" -not -path "./.git/*" -delete
    echo "  ✓ Removed $test_artifact_count test artifact files"
    debug_files_removed=$((debug_files_removed + test_artifact_count))
fi

# 3. Log file management
echo "📋 Managing log files..."
if [ -d "logs" ]; then
    # Rotate logs older than specified age
    log_count=$(find logs/ -name "*.log" -mtime +$LOG_ROTATION_AGE | wc -l)
    if [ $log_count -gt 0 ]; then
        find logs/ -name "*.log" -mtime +$LOG_ROTATION_AGE -exec gzip {} \;
        echo "  ✓ Rotated $log_count log files"
        logs_rotated=$log_count
    else
        echo "  ℹ No logs need rotation"
    fi
    
    # Clean old archived logs
    archive_count=$(find logs/ -name "*.log.gz" -mtime +$ARCHIVE_CLEANUP_AGE | wc -l)
    if [ $archive_count -gt 0 ]; then
        find logs/ -name "*.log.gz" -mtime +$ARCHIVE_CLEANUP_AGE -delete
        echo "  ✓ Removed $archive_count archived log files"
        archives_cleaned=$archive_count
    else
        echo "  ℹ No archived logs need cleanup"
    fi
else
    echo "  ℹ No logs directory found"
fi

# 4. Build artifact cleanup
echo "🔨 Cleaning build artifacts..."
build_artifacts_removed=0

# Clean dist directories that are not currently in use
for dist_dir in $(find . -name "dist" -type d -not -path "./node_modules/*"); do
    if [ -d "$dist_dir" ]; then
        # Check if dist directory is older than 1 day and not recently built
        if [ $(find "$dist_dir" -mtime -1 | wc -l) -eq 0 ]; then
            # Only clean if there's a corresponding src directory (indicating it can be rebuilt)
            src_dir=$(dirname "$dist_dir")/src
            if [ -d "$src_dir" ]; then
                rm -rf "$dist_dir"
                echo "  ✓ Cleaned build artifacts in $dist_dir"
                build_artifacts_removed=$((build_artifacts_removed + 1))
            fi
        fi
    fi
done

# Clean node_modules cache directories
if [ -d "node_modules/.cache" ]; then
    rm -rf node_modules/.cache/*
    echo "  ✓ Cleaned node_modules cache"
fi

# 5. Check for large files that shouldn't be in repository
echo "📏 Checking for large files..."
large_files=$(find . -size +10M -not -path "./node_modules/*" -not -path "./data/*" -not -path "./.git/*" | wc -l)
if [ $large_files -gt 0 ]; then
    echo "  ⚠️  Found $large_files large files (>10MB):"
    find . -size +10M -not -path "./node_modules/*" -not -path "./data/*" -not -path "./.git/*" -ls
    echo "  💡 Consider using Git LFS or excluding these files"
else
    echo "  ✓ No problematic large files found"
fi

# 6. Summary report
echo ""
echo "📊 Cleanup Summary"
echo "=================="
echo "  Temporary files removed: $temp_files_removed"
echo "  Debug files removed: $debug_files_removed"
echo "  Log files rotated: $logs_rotated"
echo "  Archived logs cleaned: $archives_cleaned"
echo "  Build artifacts cleaned: $build_artifacts_removed"
echo "  Large files detected: $large_files"

total_cleaned=$((temp_files_removed + debug_files_removed + archives_cleaned + build_artifacts_removed))
echo "  Total files processed: $total_cleaned"

# 7. Repository health metrics
echo ""
echo "📈 Repository Health Metrics"
echo "============================"
echo "  Total files in repository: $(find . -type f -not -path "./.git/*" -not -path "./node_modules/*" | wc -l)"
echo "  Documentation files: $(find docs/ -name "*.md" 2>/dev/null | wc -l)"
echo "  Script files: $(find scripts/ -type f 2>/dev/null | wc -l)"
echo "  Test files: $(find . -name "*.test.*" -not -path "./node_modules/*" | wc -l)"

# 8. Generate cleanup log entry
log_entry="$(date): Cleaned $total_cleaned files (temp:$temp_files_removed, debug:$debug_files_removed, logs:$archives_cleaned, build:$build_artifacts_removed)"
echo "$log_entry" >> scripts/maintenance/cleanup.log

echo ""
echo "✅ Daily cleanup completed successfully - $(date)"
echo "📝 Log entry added to scripts/maintenance/cleanup.log"

# Exit with appropriate code
if [ $large_files -gt 0 ]; then
    echo "⚠️  Warning: Large files detected - manual review recommended"
    exit 1
else
    exit 0
fi