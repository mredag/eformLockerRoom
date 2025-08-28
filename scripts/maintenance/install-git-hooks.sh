#!/bin/bash
# Install Git Hooks for Repository Maintenance
# Sets up automated checks to prevent accumulation of temporary files

set -e

echo "🔧 Installing Git Hooks for Repository Maintenance"
echo "=================================================="

# Ensure .git/hooks directory exists
if [ ! -d ".git/hooks" ]; then
    echo "❌ Error: Not in a Git repository or .git/hooks directory missing"
    exit 1
fi

# Create pre-commit hook
echo "📝 Creating pre-commit hook..."
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Pre-commit hook for repository maintenance
# Prevents commits of temporary files and enforces naming conventions

set -e

echo "🔍 Running pre-commit checks..."

# Configuration
MAX_FILE_SIZE=10485760  # 10MB in bytes
TEMP_PATTERNS=("*.tmp" "*.temp" "*.bak" "*debug*" "*.debug")
TIMESTAMP_PATTERN="*-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Track issues
issues_found=0

# Function to report issues
report_issue() {
    echo -e "${RED}❌ $1${NC}"
    issues_found=$((issues_found + 1))
}

report_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

report_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Get list of files being committed
staged_files=$(git diff --cached --name-only)

if [ -z "$staged_files" ]; then
    echo "No files staged for commit"
    exit 0
fi

echo "Checking $(echo "$staged_files" | wc -l) staged files..."

# Check 1: Temporary file patterns
echo "🗑️  Checking for temporary files..."
temp_files_found=0

for pattern in "${TEMP_PATTERNS[@]}"; do
    matches=$(echo "$staged_files" | grep -E "$(echo "$pattern" | sed 's/\*/.*/')" || true)
    if [ -n "$matches" ]; then
        report_issue "Temporary files detected with pattern '$pattern':"
        echo "$matches" | sed 's/^/    /'
        temp_files_found=1
    fi
done

# Check for timestamp patterns
timestamp_matches=$(echo "$staged_files" | grep -E ".*-[0-9]{4}-[0-9]{2}-[0-9]{2}.*" || true)
if [ -n "$timestamp_matches" ]; then
    report_issue "Files with timestamp patterns detected:"
    echo "$timestamp_matches" | sed 's/^/    /'
    temp_files_found=1
fi

if [ $temp_files_found -eq 0 ]; then
    report_success "No temporary files detected"
fi

# Check 2: Large files
echo "📏 Checking for large files..."
large_files_found=0

while IFS= read -r file; do
    if [ -f "$file" ]; then
        file_size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0)
        if [ "$file_size" -gt $MAX_FILE_SIZE ]; then
            size_mb=$(echo "scale=2; $file_size / 1048576" | bc -l 2>/dev/null || echo "large")
            report_issue "Large file detected: $file (${size_mb}MB)"
            large_files_found=1
        fi
    fi
done <<< "$staged_files"

if [ $large_files_found -eq 0 ]; then
    report_success "No large files detected"
fi

# Check 3: File naming conventions
echo "📝 Checking naming conventions..."
naming_issues=0

while IFS= read -r file; do
    filename=$(basename "$file")
    
    # Check for spaces in filenames
    if [[ "$filename" == *" "* ]]; then
        report_issue "Filename contains spaces: $file"
        naming_issues=1
    fi
    
    # Check for very long filenames
    if [ ${#filename} -gt 50 ]; then
        report_warning "Very long filename (${#filename} chars): $file"
    fi
    
    # Check for uppercase extensions
    extension="${filename##*.}"
    if [ "$extension" != "${extension,,}" ] && [ "$filename" != "$extension" ]; then
        report_warning "Uppercase file extension: $file"
    fi
    
done <<< "$staged_files"

if [ $naming_issues -eq 0 ]; then
    report_success "Naming conventions look good"
fi

# Check 4: Sensitive files
echo "🔒 Checking for sensitive files..."
sensitive_patterns=("*.key" "*.pem" "*.p12" "*.pfx" "*password*" "*secret*")
sensitive_files_found=0

for pattern in "${sensitive_patterns[@]}"; do
    matches=$(echo "$staged_files" | grep -iE "$(echo "$pattern" | sed 's/\*/.*/')" || true)
    if [ -n "$matches" ]; then
        report_warning "Potentially sensitive files detected with pattern '$pattern':"
        echo "$matches" | sed 's/^/    /'
        sensitive_files_found=1
    fi
done

# Check for .env files (except .env.example)
env_matches=$(echo "$staged_files" | grep -E "\.env$|\.env\." | grep -v "\.env\.example" || true)
if [ -n "$env_matches" ]; then
    report_warning "Environment files detected (ensure they're needed in repository):"
    echo "$env_matches" | sed 's/^/    /'
    sensitive_files_found=1
fi

if [ $sensitive_files_found -eq 0 ]; then
    report_success "No sensitive files detected"
fi

# Check 5: Documentation links (for markdown files)
echo "📚 Checking documentation links..."
broken_links=0

markdown_files=$(echo "$staged_files" | grep "\.md$" || true)
if [ -n "$markdown_files" ]; then
    while IFS= read -r md_file; do
        if [ -f "$md_file" ]; then
            # Simple check for internal links
            while IFS= read -r line; do
                if [[ $line =~ \[.*\]\(\./ ]]; then
                    link=$(echo "$line" | sed -n 's/.*\[\([^]]*\)\](\([^)]*\)).*/\2/p')
                    if [ -n "$link" ] && [ ! -f "$link" ] && [ ! -d "$link" ]; then
                        report_warning "Potentially broken link in $md_file: $link"
                        broken_links=1
                    fi
                fi
            done < "$md_file"
        fi
    done <<< "$markdown_files"
fi

if [ $broken_links -eq 0 ] && [ -n "$markdown_files" ]; then
    report_success "Documentation links look good"
fi

# Final decision
echo ""
if [ $issues_found -gt 0 ]; then
    echo -e "${RED}❌ Pre-commit check failed with $issues_found issues${NC}"
    echo "Please fix the issues above before committing."
    echo ""
    echo "To bypass this check (not recommended), use:"
    echo "  git commit --no-verify"
    echo ""
    echo "To clean temporary files, run:"
    echo "  ./scripts/maintenance/daily-cleanup.sh"
    exit 1
else
    echo -e "${GREEN}✅ All pre-commit checks passed!${NC}"
    exit 0
fi
EOF

# Make pre-commit hook executable
chmod +x .git/hooks/pre-commit
echo "  ✓ Pre-commit hook installed and made executable"

# Create pre-push hook
echo "📤 Creating pre-push hook..."
cat > .git/hooks/pre-push << 'EOF'
#!/bin/bash
# Pre-push hook for repository maintenance
# Runs comprehensive checks before pushing to remote

set -e

echo "🚀 Running pre-push checks..."

# Run repository health check
if [ -f "scripts/maintenance/repository-health-check.sh" ]; then
    echo "🏥 Running repository health check..."
    if ! bash scripts/maintenance/repository-health-check.sh; then
        echo "❌ Repository health check failed"
        echo "Run the health check manually to see detailed issues:"
        echo "  bash scripts/maintenance/repository-health-check.sh"
        exit 1
    fi
else
    echo "⚠️  Repository health check script not found, skipping..."
fi

# Run file organization check
if [ -f "scripts/maintenance/file-organization-checker.js" ]; then
    echo "📁 Running file organization check..."
    if ! node scripts/maintenance/file-organization-checker.js; then
        echo "❌ File organization check failed"
        echo "Run the organization checker manually to see detailed issues:"
        echo "  node scripts/maintenance/file-organization-checker.js"
        exit 1
    fi
else
    echo "⚠️  File organization checker not found, skipping..."
fi

echo "✅ All pre-push checks passed!"
exit 0
EOF

# Make pre-push hook executable
chmod +x .git/hooks/pre-push
echo "  ✓ Pre-push hook installed and made executable"

# Create commit-msg hook for commit message standards
echo "💬 Creating commit-msg hook..."
cat > .git/hooks/commit-msg << 'EOF'
#!/bin/bash
# Commit message hook for repository maintenance
# Enforces commit message standards

commit_regex='^(feat|fix|docs|style|refactor|test|chore|cleanup)(\(.+\))?: .{1,50}'

error_msg="Invalid commit message format.

Commit message should follow the pattern:
  type(scope): description

Types: feat, fix, docs, style, refactor, test, chore, cleanup
Scope: optional, e.g., (auth), (ui), (api)
Description: 1-50 characters

Examples:
  feat(auth): add RFID authentication
  fix(relay): resolve modbus communication issue
  docs: update deployment guide
  cleanup: remove temporary debug files"

if ! grep -qE "$commit_regex" "$1"; then
    echo "$error_msg" >&2
    exit 1
fi
EOF

# Make commit-msg hook executable
chmod +x .git/hooks/commit-msg
echo "  ✓ Commit-msg hook installed and made executable"

# Create post-commit hook for logging
echo "📊 Creating post-commit hook..."
cat > .git/hooks/post-commit << 'EOF'
#!/bin/bash
# Post-commit hook for repository maintenance
# Logs commit information for maintenance tracking

# Create maintenance log directory if it doesn't exist
mkdir -p scripts/maintenance

# Log commit information
commit_hash=$(git rev-parse HEAD)
commit_message=$(git log -1 --pretty=%B)
commit_author=$(git log -1 --pretty=%an)
commit_date=$(git log -1 --pretty=%cd)
files_changed=$(git diff-tree --no-commit-id --name-only -r HEAD | wc -l)

log_entry="$(date): Commit $commit_hash by $commit_author - $files_changed files changed"
echo "$log_entry" >> scripts/maintenance/commit-log.txt

# Run quick cleanup if many files were added
if [ $files_changed -gt 20 ]; then
    echo "Large commit detected ($files_changed files), running quick cleanup..."
    if [ -f "scripts/maintenance/daily-cleanup.sh" ]; then
        bash scripts/maintenance/daily-cleanup.sh > /dev/null 2>&1 || true
    fi
fi
EOF

# Make post-commit hook executable
chmod +x .git/hooks/post-commit
echo "  ✓ Post-commit hook installed and made executable"

# Create maintenance log directory
mkdir -p scripts/maintenance
touch scripts/maintenance/commit-log.txt
touch scripts/maintenance/cleanup.log
touch scripts/maintenance/health-check.log

echo ""
echo "✅ Git hooks installation completed!"
echo ""
echo "Installed hooks:"
echo "  • pre-commit: Prevents temporary files and enforces naming"
echo "  • pre-push: Runs comprehensive health and organization checks"
echo "  • commit-msg: Enforces commit message standards"
echo "  • post-commit: Logs commits and triggers cleanup for large changes"
echo ""
echo "To test the hooks:"
echo "  git add . && git commit -m 'test: verify git hooks'"
echo ""
echo "To temporarily bypass hooks (not recommended):"
echo "  git commit --no-verify"
echo "  git push --no-verify"