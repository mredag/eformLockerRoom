#!/bin/bash
# Repository Health Check Script
# Comprehensive analysis of repository structure and organization

set -e

echo "🏥 Repository Health Check - $(date)"
echo "=================================================="

# Configuration
MAX_FILE_COUNT=2000
MAX_DOC_FILES=20
MAX_SCRIPT_FILES=100
MIN_TEST_COVERAGE_FILES=10
MAX_REPO_SIZE_MB=500

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Health score tracking
health_score=100
issues_found=0
warnings_found=0

# Function to print status with color
print_status() {
    local status=$1
    local message=$2
    case $status in
        "PASS")
            echo -e "  ${GREEN}✓ PASS${NC}: $message"
            ;;
        "WARN")
            echo -e "  ${YELLOW}⚠ WARN${NC}: $message"
            warnings_found=$((warnings_found + 1))
            health_score=$((health_score - 5))
            ;;
        "FAIL")
            echo -e "  ${RED}✗ FAIL${NC}: $message"
            issues_found=$((issues_found + 1))
            health_score=$((health_score - 10))
            ;;
        "INFO")
            echo -e "  ${BLUE}ℹ INFO${NC}: $message"
            ;;
    esac
}

# 1. File Count Analysis
echo "📊 File Count Analysis"
echo "======================"

total_files=$(find . -type f -not -path "./.git/*" -not -path "./node_modules/*" | wc -l)
app_files=$(find app/ -type f 2>/dev/null | wc -l || echo 0)
doc_files=$(find docs/ -name "*.md" 2>/dev/null | wc -l || echo 0)
script_files=$(find scripts/ -type f 2>/dev/null | wc -l || echo 0)
test_files=$(find . -name "*.test.*" -not -path "./node_modules/*" | wc -l)
config_files=$(find config/ -type f 2>/dev/null | wc -l || echo 0)

echo "  Total files: $total_files"
echo "  App files: $app_files"
echo "  Documentation files: $doc_files"
echo "  Script files: $script_files"
echo "  Test files: $test_files"
echo "  Config files: $config_files"

# Check file count thresholds
if [ $total_files -gt $MAX_FILE_COUNT ]; then
    print_status "WARN" "Total file count ($total_files) exceeds recommended maximum ($MAX_FILE_COUNT)"
else
    print_status "PASS" "Total file count within acceptable range"
fi

if [ $doc_files -gt $MAX_DOC_FILES ]; then
    print_status "WARN" "Documentation file count ($doc_files) may indicate need for consolidation"
elif [ $doc_files -lt 5 ]; then
    print_status "WARN" "Documentation file count ($doc_files) may be insufficient"
else
    print_status "PASS" "Documentation file count appropriate"
fi

if [ $script_files -gt $MAX_SCRIPT_FILES ]; then
    print_status "WARN" "Script file count ($script_files) may need organization review"
else
    print_status "PASS" "Script file count manageable"
fi

if [ $test_files -lt $MIN_TEST_COVERAGE_FILES ]; then
    print_status "WARN" "Test file count ($test_files) may indicate insufficient test coverage"
else
    print_status "PASS" "Test file count suggests good coverage"
fi

# 2. Directory Structure Compliance
echo ""
echo "🏗️  Directory Structure Compliance"
echo "=================================="

# Check for required directories
required_dirs=("app" "docs" "scripts" "tests" "shared" "config")
for dir in "${required_dirs[@]}"; do
    if [ -d "$dir" ]; then
        print_status "PASS" "Required directory '$dir' exists"
    else
        print_status "FAIL" "Required directory '$dir' missing"
    fi
done

# Check for proper script organization
if [ -d "scripts" ]; then
    script_subdirs=("deployment" "testing" "maintenance" "emergency")
    organized_scripts=0
    total_script_subdirs=0
    
    for subdir in "${script_subdirs[@]}"; do
        if [ -d "scripts/$subdir" ]; then
            organized_scripts=$((organized_scripts + 1))
            print_status "PASS" "Script category '$subdir' properly organized"
        fi
        total_script_subdirs=$((total_script_subdirs + 1))
    done
    
    organization_ratio=$((organized_scripts * 100 / total_script_subdirs))
    if [ $organization_ratio -ge 75 ]; then
        print_status "PASS" "Script organization compliance: ${organization_ratio}%"
    else
        print_status "WARN" "Script organization compliance low: ${organization_ratio}%"
    fi
fi

# 3. File Naming Convention Compliance
echo ""
echo "📝 File Naming Convention Compliance"
echo "===================================="

# Check for problematic file names
problematic_names=0

# Files with spaces
space_files=$(find . -name "* *" -not -path "./.git/*" -not -path "./node_modules/*" | wc -l)
if [ $space_files -gt 0 ]; then
    print_status "WARN" "$space_files files contain spaces in names"
    problematic_names=$((problematic_names + space_files))
fi

# Files with uppercase extensions
uppercase_ext=$(find . -name "*.JS" -o -name "*.TS" -o -name "*.HTML" -o -name "*.CSS" -not -path "./node_modules/*" | wc -l)
if [ $uppercase_ext -gt 0 ]; then
    print_status "WARN" "$uppercase_ext files have uppercase extensions"
    problematic_names=$((problematic_names + uppercase_ext))
fi

# Very long filenames (>50 characters)
long_names=$(find . -type f -not -path "./.git/*" -not -path "./node_modules/*" -exec basename {} \; | awk 'length > 50' | wc -l)
if [ $long_names -gt 0 ]; then
    print_status "WARN" "$long_names files have very long names (>50 chars)"
    problematic_names=$((problematic_names + long_names))
fi

if [ $problematic_names -eq 0 ]; then
    print_status "PASS" "All files follow naming conventions"
fi

# 4. Temporary File Detection
echo ""
echo "🗑️  Temporary File Detection"
echo "============================"

temp_patterns=("*.tmp" "*.temp" "*.bak" "*debug*" "*.debug")
total_temp_files=0

for pattern in "${temp_patterns[@]}"; do
    count=$(find . -name "$pattern" -not -path "./node_modules/*" -not -path "./.git/*" | wc -l)
    total_temp_files=$((total_temp_files + count))
    if [ $count -gt 0 ]; then
        print_status "WARN" "$count files match temporary pattern '$pattern'"
    fi
done

# Check for timestamp patterns
timestamp_files=$(find . -name "*-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*" -not -path "./node_modules/*" -not -path "./.git/*" | wc -l)
total_temp_files=$((total_temp_files + timestamp_files))
if [ $timestamp_files -gt 0 ]; then
    print_status "WARN" "$timestamp_files files have timestamp patterns"
fi

if [ $total_temp_files -eq 0 ]; then
    print_status "PASS" "No temporary files detected"
elif [ $total_temp_files -lt 10 ]; then
    print_status "WARN" "$total_temp_files temporary files found - cleanup recommended"
else
    print_status "FAIL" "$total_temp_files temporary files found - immediate cleanup required"
fi

# 5. Repository Size Analysis
echo ""
echo "💾 Repository Size Analysis"
echo "=========================="

# Calculate repository size (excluding .git and node_modules)
repo_size_kb=$(du -sk . --exclude=.git --exclude=node_modules 2>/dev/null | cut -f1)
repo_size_mb=$((repo_size_kb / 1024))

echo "  Repository size: ${repo_size_mb}MB"

if [ $repo_size_mb -gt $MAX_REPO_SIZE_MB ]; then
    print_status "WARN" "Repository size (${repo_size_mb}MB) exceeds recommended maximum (${MAX_REPO_SIZE_MB}MB)"
else
    print_status "PASS" "Repository size within acceptable range"
fi

# Check for large files
large_files=$(find . -size +10M -not -path "./node_modules/*" -not -path "./data/*" -not -path "./.git/*" | wc -l)
if [ $large_files -gt 0 ]; then
    print_status "WARN" "$large_files files larger than 10MB detected"
    echo "  Large files:"
    find . -size +10M -not -path "./node_modules/*" -not -path "./data/*" -not -path "./.git/*" -exec ls -lh {} \; | awk '{print "    " $5 " " $9}'
else
    print_status "PASS" "No problematic large files found"
fi

# 6. Documentation Quality Check
echo ""
echo "📚 Documentation Quality Check"
echo "=============================="

# Check for README files
if [ -f "README.md" ]; then
    readme_size=$(wc -c < README.md)
    if [ $readme_size -gt 1000 ]; then
        print_status "PASS" "Main README.md exists and has substantial content"
    else
        print_status "WARN" "Main README.md exists but may need more content"
    fi
else
    print_status "FAIL" "Main README.md missing"
fi

# Check for broken links in documentation
broken_links=0
if command -v grep >/dev/null 2>&1; then
    for md_file in $(find docs/ -name "*.md" 2>/dev/null); do
        # Simple check for internal links that might be broken
        while IFS= read -r line; do
            if [[ $line =~ \[.*\]\(\./ ]]; then
                link=$(echo "$line" | sed -n 's/.*\[\([^]]*\)\](\([^)]*\)).*/\2/p')
                if [ -n "$link" ] && [ ! -f "$link" ] && [ ! -d "$link" ]; then
                    broken_links=$((broken_links + 1))
                fi
            fi
        done < "$md_file"
    done
fi

if [ $broken_links -eq 0 ]; then
    print_status "PASS" "No broken internal links detected in documentation"
else
    print_status "WARN" "$broken_links potential broken links found in documentation"
fi

# 7. Git Repository Health
echo ""
echo "🔧 Git Repository Health"
echo "======================="

# Check for .gitignore
if [ -f ".gitignore" ]; then
    gitignore_size=$(wc -l < .gitignore)
    if [ $gitignore_size -gt 10 ]; then
        print_status "PASS" ".gitignore exists with $gitignore_size rules"
    else
        print_status "WARN" ".gitignore exists but may need more comprehensive rules"
    fi
else
    print_status "FAIL" ".gitignore file missing"
fi

# Check for untracked files that might need attention
if command -v git >/dev/null 2>&1 && [ -d ".git" ]; then
    untracked_count=$(git ls-files --others --exclude-standard | wc -l)
    if [ $untracked_count -eq 0 ]; then
        print_status "PASS" "No untracked files"
    elif [ $untracked_count -lt 10 ]; then
        print_status "INFO" "$untracked_count untracked files (review recommended)"
    else
        print_status "WARN" "$untracked_count untracked files (cleanup may be needed)"
    fi
    
    # Check for files that should probably be ignored
    should_ignore=$(git ls-files --others --exclude-standard | grep -E '\.(log|tmp|temp|bak)$|node_modules|\.DS_Store' | wc -l)
    if [ $should_ignore -gt 0 ]; then
        print_status "WARN" "$should_ignore untracked files should probably be in .gitignore"
    fi
fi

# 8. Security and Sensitive Data Check
echo ""
echo "🔒 Security and Sensitive Data Check"
echo "===================================="

# Check for potential sensitive files
sensitive_patterns=("*.key" "*.pem" "*.p12" "*.pfx" "*password*" "*secret*")
sensitive_files=0

for pattern in "${sensitive_patterns[@]}"; do
    count=$(find . -name "$pattern" -not -path "./node_modules/*" -not -path "./.git/*" | wc -l)
    sensitive_files=$((sensitive_files + count))
    if [ $count -gt 0 ]; then
        print_status "WARN" "$count files match sensitive pattern '$pattern'"
    fi
done

# Check for .env files (should be in .gitignore)
env_files=$(find . -name ".env*" -not -name ".env.example" -not -path "./node_modules/*" | wc -l)
if [ $env_files -gt 0 ]; then
    print_status "WARN" "$env_files .env files found - ensure they're in .gitignore"
    sensitive_files=$((sensitive_files + env_files))
fi

if [ $sensitive_files -eq 0 ]; then
    print_status "PASS" "No obvious sensitive files detected"
fi

# 9. Final Health Score and Recommendations
echo ""
echo "🎯 Health Score and Recommendations"
echo "=================================="

# Adjust health score based on severity
if [ $health_score -lt 0 ]; then
    health_score=0
fi

echo "  Overall Health Score: $health_score/100"
echo "  Issues Found: $issues_found"
echo "  Warnings Found: $warnings_found"

if [ $health_score -ge 90 ]; then
    print_status "PASS" "Repository is in excellent health"
elif [ $health_score -ge 75 ]; then
    print_status "WARN" "Repository health is good but has room for improvement"
elif [ $health_score -ge 50 ]; then
    print_status "WARN" "Repository health needs attention"
else
    print_status "FAIL" "Repository health is poor - immediate action required"
fi

# Generate recommendations
echo ""
echo "💡 Recommendations"
echo "=================="

if [ $total_temp_files -gt 0 ]; then
    echo "  • Run daily cleanup script to remove $total_temp_files temporary files"
fi

if [ $large_files -gt 0 ]; then
    echo "  • Review $large_files large files - consider Git LFS or exclusion"
fi

if [ $broken_links -gt 0 ]; then
    echo "  • Fix $broken_links broken links in documentation"
fi

if [ $script_files -gt 50 ] && [ $organized_scripts -lt 3 ]; then
    echo "  • Organize scripts into subdirectories by purpose"
fi

if [ $doc_files -gt 15 ]; then
    echo "  • Consider consolidating documentation files"
fi

if [ $untracked_count -gt 10 ]; then
    echo "  • Review and clean up $untracked_count untracked files"
fi

if [ $sensitive_files -gt 0 ]; then
    echo "  • Review $sensitive_files potentially sensitive files"
fi

# Log the health check results
log_entry="$(date): Health Score: $health_score/100, Issues: $issues_found, Warnings: $warnings_found, Files: $total_files"
echo "$log_entry" >> scripts/maintenance/health-check.log

echo ""
echo "✅ Health check completed - $(date)"
echo "📝 Results logged to scripts/maintenance/health-check.log"

# Exit with appropriate code based on health score
if [ $health_score -ge 75 ]; then
    exit 0
elif [ $health_score -ge 50 ]; then
    exit 1
else
    exit 2
fi