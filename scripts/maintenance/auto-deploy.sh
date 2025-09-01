#!/bin/bash

# eForm Locker System - Automated Deployment Script
# Automatically commits changes, pushes to Git, pulls to Raspberry Pi, and restarts services

set -e  # Exit on any error

# Configuration
PI_HOST="pi@pi-eform-locker"
PI_PROJECT_PATH="/home/pi/eform-locker"
BRANCH="main"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default parameters
COMMIT_MESSAGE=""
SKIP_TESTS=false
FORCE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--message)
            COMMIT_MESSAGE="$2"
            shift 2
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -m, --message MSG    Custom commit message"
            echo "  --skip-tests         Skip post-deployment tests"
            echo "  --force              Force deployment even if no changes"
            echo "  -h, --help           Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Helper functions
log_step() {
    echo -e "${BLUE}🚀 $1${NC}"
    echo "=================================================="
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if there are changes to commit
has_changes() {
    [[ -n $(git status --porcelain) ]]
}

# Generate automatic commit message
generate_commit_message() {
    local changed_files=$(git diff --name-only HEAD)
    local added_files=$(git ls-files --others --exclude-standard)
    
    if [[ -n "$changed_files" || -n "$added_files" ]]; then
        local file_types=()
        
        # Analyze changed files
        for file in $changed_files $added_files; do
            case "$file" in
                *.ts|*.js) file_types+=("code") ;;
                *.html|*.css) file_types+=("ui") ;;
                *.md) file_types+=("docs") ;;
                *.json|*.yml|*.yaml) file_types+=("config") ;;
                *test*|*spec*) file_types+=("tests") ;;
            esac
        done
        
        # Remove duplicates and join
        local unique_types=($(printf "%s\n" "${file_types[@]}" | sort -u))
        local type_string=$(IFS=", "; echo "${unique_types[*]}")
        
        echo "chore: automated deployment - update $type_string files"
    else
        echo "chore: automated deployment"
    fi
}

# Pre-deployment checks
pre_deployment_checks() {
    log_step "Pre-deployment Checks"
    
    # Check if we're in a git repository
    if [[ ! -d ".git" ]]; then
        log_error "Not in a Git repository!"
        exit 1
    fi
    
    # Check current branch
    local current_branch=$(git branch --show-current)
    if [[ "$current_branch" != "$BRANCH" ]]; then
        log_warning "Currently on branch '$current_branch', expected '$BRANCH'"
        if [[ "$FORCE" != true ]]; then
            read -p "Continue anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_error "Deployment cancelled"
                exit 1
            fi
        fi
    fi
    
    # Check for uncommitted changes
    if ! has_changes && [[ "$FORCE" != true ]]; then
        log_warning "No changes detected"
        read -p "Force deployment anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_error "Deployment cancelled - no changes to deploy"
            exit 0
        fi
    fi
    
    log_success "Pre-deployment checks passed"
}

# Local Git operations
local_git_operations() {
    log_step "Local Git Operations"
    
    # Add all changes
    echo "📝 Adding changes..."
    git add .
    
    # Check if there are changes to commit
    if [[ -z $(git diff --cached --name-only) && "$FORCE" != true ]]; then
        log_warning "No staged changes to commit"
        return 1
    fi
    
    # Generate commit message
    local commit_msg
    if [[ -n "$COMMIT_MESSAGE" ]]; then
        commit_msg="$COMMIT_MESSAGE"
    else
        commit_msg=$(generate_commit_message)
    fi
    
    echo "💬 Commit message: $commit_msg"
    
    # Commit changes
    echo "📦 Committing changes..."
    if ! git commit -m "$commit_msg"; then
        if [[ "$FORCE" != true ]]; then
            log_error "Git commit failed"
            return 1
        fi
    fi
    
    # Push to remote
    echo "🚀 Pushing to remote..."
    if ! git push origin "$BRANCH"; then
        log_error "Git push failed"
        return 1
    fi
    
    log_success "Local Git operations completed"
    return 0
}

# Remote deployment
remote_deployment() {
    log_step "Remote Deployment to Raspberry Pi"
    
    # Test SSH connection
    echo "🔗 Testing SSH connection..."
    if ! ssh -o ConnectTimeout=10 "$PI_HOST" "echo 'SSH connection successful'" >/dev/null 2>&1; then
        log_error "SSH connection failed"
        return 1
    fi
    
    log_success "SSH connection established"
    
    # Pull latest changes
    echo "📥 Pulling latest changes on Pi..."
    if ! ssh "$PI_HOST" "cd $PI_PROJECT_PATH && git pull origin $BRANCH"; then
        log_error "Git pull failed on Pi"
        return 1
    fi
    
    log_success "Changes pulled successfully"
    
    # Restart services
    echo "🔄 Restarting services..."
    if ! ssh "$PI_HOST" "cd $PI_PROJECT_PATH && ./scripts/start-all-clean.sh"; then
        log_warning "Service restart may have issues"
        return 1
    fi
    
    log_success "Services restarted successfully"
    return 0
}

# Post-deployment tests
post_deployment_tests() {
    if [[ "$SKIP_TESTS" == true ]]; then
        log_warning "Skipping post-deployment tests"
        return 0
    fi
    
    log_step "Post-deployment Validation"
    
    # Test service health
    echo "🏥 Testing service health..."
    
    local services=("Gateway:3000" "Panel:3001" "Kiosk:3002")
    local all_healthy=true
    
    for service_info in "${services[@]}"; do
        local service_name="${service_info%:*}"
        local port="${service_info#*:}"
        
        echo "  Testing $service_name (port $port)..."
        
        if ! ssh "$PI_HOST" "curl -s -f http://localhost:$port/health" >/dev/null 2>&1; then
            log_warning "$service_name health check failed"
            all_healthy=false
        else
            log_success "$service_name is healthy"
        fi
    done
    
    if [[ "$all_healthy" != true ]]; then
        log_warning "Some services may have issues"
        return 1
    fi
    
    # Test layout service if available
    echo "🧪 Testing layout service..."
    if ! ssh "$PI_HOST" "cd $PI_PROJECT_PATH && timeout 30 node scripts/test-layout-service.js" >/dev/null 2>&1; then
        log_warning "Layout service test failed or timed out"
    else
        log_success "Layout service test passed"
    fi
    
    log_success "Post-deployment validation completed"
    return 0
}

# Show deployment summary
show_deployment_summary() {
    local success=$1
    
    log_step "Deployment Summary"
    
    if [[ "$success" == true ]]; then
        log_success "🎉 Deployment completed successfully!"
        echo ""
        echo "📊 Access Points:"
        echo "  • Admin Panel:     http://192.168.1.8:3001"
        echo "  • Kiosk UI:        http://192.168.1.8:3002"
        echo "  • Gateway API:     http://192.168.1.8:3000"
        echo "  • Hardware Config: http://192.168.1.8:3001/hardware-config"
        echo ""
        echo "📝 Monitor logs with:"
        echo "  ssh $PI_HOST 'cd $PI_PROJECT_PATH && tail -f logs/*.log'"
    else
        log_error "❌ Deployment failed!"
        echo ""
        echo "🔧 Troubleshooting:"
        echo "  • Check SSH connection: ssh $PI_HOST"
        echo "  • Check Pi logs: ssh $PI_HOST 'cd $PI_PROJECT_PATH && tail -20 logs/*.log'"
        echo "  • Manual restart: ssh $PI_HOST 'cd $PI_PROJECT_PATH && ./scripts/start-all-clean.sh'"
    fi
}

# Main execution
main() {
    local start_time=$(date '+%Y-%m-%d %H:%M:%S')
    
    echo -e "${BLUE}🚀 eForm Locker System - Automated Deployment${NC}"
    echo "============================================================"
    echo "Start time: $start_time"
    echo ""
    
    # Execute deployment steps
    pre_deployment_checks
    
    if ! local_git_operations; then
        show_deployment_summary false
        exit 1
    fi
    
    if ! remote_deployment; then
        show_deployment_summary false
        exit 1
    fi
    
    local test_success=true
    if ! post_deployment_tests; then
        test_success=false
    fi
    
    local end_time=$(date '+%Y-%m-%d %H:%M:%S')
    local duration=$(($(date -d "$end_time" +%s) - $(date -d "$start_time" +%s)))
    
    echo ""
    echo "End time: $end_time"
    echo "Duration: $(date -d@$duration -u +%M:%S)"
    
    show_deployment_summary $test_success
    
    if [[ "$test_success" == true ]]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"