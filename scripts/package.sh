#!/bin/bash

# Eform Locker System Package Creation Script
# Creates deployment packages for the Eform Locker System

set -e

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$PROJECT_ROOT/dist/packages"
BUILD_DIR="$PROJECT_ROOT/dist/build"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get version from package.json
get_version() {
    if [[ -f "$PROJECT_ROOT/package.json" ]]; then
        grep '"version"' "$PROJECT_ROOT/package.json" | cut -d'"' -f4
    else
        echo "unknown"
    fi
}

# Clean build directory
clean_build() {
    log_info "Cleaning build directory..."
    
    rm -rf "$BUILD_DIR"
    mkdir -p "$BUILD_DIR"
    mkdir -p "$PACKAGE_DIR"
    
    log_success "Build directory cleaned"
}

# Build application
build_application() {
    log_info "Building application..."
    
    cd "$PROJECT_ROOT"
    
    # Install dependencies
    npm install
    
    # Build all workspaces
    npm run build
    
    log_success "Application built successfully"
}

# Create package structure
create_package_structure() {
    local package_name="$1"
    local package_path="$BUILD_DIR/$package_name"
    
    log_info "Creating package structure..."
    
    mkdir -p "$package_path"
    
    # Copy application files
    cp -r app/ "$package_path/"
    cp -r shared/ "$package_path/"
    cp -r migrations/ "$package_path/"
    cp -r static/ "$package_path/"
    
    # Copy package files
    cp package.json "$package_path/"
    cp package-lock.json "$package_path/" 2>/dev/null || true
    cp README.md "$package_path/" 2>/dev/null || true
    cp LICENSE "$package_path/" 2>/dev/null || true
    
    # Copy scripts
    mkdir -p "$package_path/scripts"
    cp scripts/migrate.ts "$package_path/scripts/"
    
    # Copy configuration template
    mkdir -p "$package_path/config"
    cp config/system.json "$package_path/config/"
    
    log_success "Package structure created"
}

# Generate package metadata
generate_metadata() {
    local package_path="$1"
    local version="$2"
    
    log_info "Generating package metadata..."
    
    cat > "$package_path/PACKAGE_INFO.json" << EOF
{
  "name": "eform-locker-system",
  "version": "$version",
  "build_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "build_host": "$(hostname)",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "node_version": "$(node --version)",
  "npm_version": "$(npm --version)",
  "components": [
    "gateway",
    "kiosk", 
    "panel",
    "agent"
  ],
  "dependencies": {
    "node": ">=20.0.0",
    "sqlite3": "^5.1.6",
    "fastify": "^4.24.3"
  },
  "installation": {
    "supported_os": ["ubuntu", "debian"],
    "supported_arch": ["x86_64"],
    "install_script": "scripts/install.sh"
  }
}
EOF

    log_success "Package metadata generated"
}

# Calculate checksums
calculate_checksums() {
    local package_path="$1"
    
    log_info "Calculating checksums..."
    
    cd "$package_path"
    
    # Calculate SHA256 for all files
    find . -type f -exec sha256sum {} \; | sort > CHECKSUMS.sha256
    
    # Calculate overall package checksum
    sha256sum CHECKSUMS.sha256 > PACKAGE.sha256
    
    log_success "Checksums calculated"
}

# Create deployment package
create_deployment_package() {
    local package_name="$1"
    local package_path="$BUILD_DIR/$package_name"
    local archive_name="$package_name.tar.gz"
    local archive_path="$PACKAGE_DIR/$archive_name"
    
    log_info "Creating deployment package..."
    
    cd "$BUILD_DIR"
    
    # Create compressed archive
    tar -czf "$archive_path" "$package_name"
    
    # Calculate archive checksum
    cd "$PACKAGE_DIR"
    sha256sum "$archive_name" > "$archive_name.sha256"
    
    # Get package size
    local package_size=$(du -h "$archive_path" | cut -f1)
    
    log_success "Deployment package created: $archive_name ($package_size)"
    
    echo "$archive_path"
}

# Create installation package
create_installation_package() {
    local package_name="$1"
    local package_path="$BUILD_DIR/$package_name"
    local install_package_name="${package_name}-installer"
    local install_package_path="$BUILD_DIR/$install_package_name"
    
    log_info "Creating installation package..."
    
    # Copy deployment package
    cp -r "$package_path" "$install_package_path"
    
    # Add installation scripts
    cp -r scripts/ "$install_package_path/"
    
    # Create installation archive
    cd "$BUILD_DIR"
    local archive_name="$install_package_name.tar.gz"
    local archive_path="$PACKAGE_DIR/$archive_name"
    
    tar -czf "$archive_path" "$install_package_name"
    
    # Calculate checksum
    cd "$PACKAGE_DIR"
    sha256sum "$archive_name" > "$archive_name.sha256"
    
    local package_size=$(du -h "$archive_path" | cut -f1)
    
    log_success "Installation package created: $archive_name ($package_size)"
    
    echo "$archive_path"
}

# Verify package
verify_package() {
    local package_path="$1"
    
    log_info "Verifying package..."
    
    # Check if it's a valid tar.gz
    if ! tar -tzf "$package_path" >/dev/null 2>&1; then
        log_error "Package is not a valid tar.gz file"
        return 1
    fi
    
    # Check for required files
    local required_files=("package.json" "app/" "shared/" "migrations/")
    
    for file in "${required_files[@]}"; do
        if ! tar -tzf "$package_path" | grep -q "^[^/]*/\?$file"; then
            log_error "Required file/directory missing: $file"
            return 1
        fi
    done
    
    # Verify checksum
    local checksum_file="${package_path}.sha256"
    if [[ -f "$checksum_file" ]]; then
        cd "$(dirname "$package_path")"
        if sha256sum -c "$(basename "$checksum_file")" >/dev/null 2>&1; then
            log_success "Package checksum verified"
        else
            log_error "Package checksum verification failed"
            return 1
        fi
    fi
    
    log_success "Package verification passed"
    return 0
}

# Show package information
show_package_info() {
    local package_path="$1"
    
    echo "=============================================="
    echo "  Package Information"
    echo "=============================================="
    echo
    echo "Package: $(basename "$package_path")"
    echo "Size: $(du -h "$package_path" | cut -f1)"
    echo "Created: $(stat -c %y "$package_path" | cut -d' ' -f1-2)"
    echo
    
    # Show checksum
    local checksum_file="${package_path}.sha256"
    if [[ -f "$checksum_file" ]]; then
        echo "SHA256: $(cat "$checksum_file" | cut -d' ' -f1)"
    fi
    echo
    
    # Show contents
    echo "Contents:"
    tar -tzf "$package_path" | head -20
    local total_files=$(tar -tzf "$package_path" | wc -l)
    if [[ $total_files -gt 20 ]]; then
        echo "... and $((total_files - 20)) more files"
    fi
    echo
}

# List existing packages
list_packages() {
    echo "=============================================="
    echo "  Existing Packages"
    echo "=============================================="
    echo
    
    if [[ -d "$PACKAGE_DIR" ]] && [[ $(find "$PACKAGE_DIR" -name "*.tar.gz" | wc -l) -gt 0 ]]; then
        find "$PACKAGE_DIR" -name "*.tar.gz" -printf '%T@ %p\n' | sort -rn | while read timestamp filepath; do
            local date=$(date -d "@$timestamp" "+%Y-%m-%d %H:%M:%S")
            local size=$(du -h "$filepath" | cut -f1)
            local name=$(basename "$filepath")
            echo "$name - $date ($size)"
        done
    else
        echo "No packages found"
    fi
    echo
}

# Clean old packages
clean_packages() {
    local keep_count="${1:-5}"
    
    log_info "Cleaning old packages (keeping $keep_count most recent)..."
    
    if [[ -d "$PACKAGE_DIR" ]]; then
        # Remove old packages, keeping the most recent ones
        find "$PACKAGE_DIR" -name "*.tar.gz" -printf '%T@ %p\n' | sort -rn | tail -n +$((keep_count + 1)) | cut -d' ' -f2- | while read filepath; do
            rm -f "$filepath"
            rm -f "${filepath}.sha256"
            log_info "Removed old package: $(basename "$filepath")"
        done
    fi
    
    log_success "Package cleanup completed"
}

# Main packaging function
create_package() {
    local package_type="${1:-deployment}"
    local version=$(get_version)
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local package_name="eform-locker-system-v${version}-${timestamp}"
    
    log_info "Creating $package_type package: $package_name"
    
    clean_build
    build_application
    create_package_structure "$package_name"
    generate_metadata "$BUILD_DIR/$package_name" "$version"
    calculate_checksums "$BUILD_DIR/$package_name"
    
    case "$package_type" in
        "deployment")
            local package_path=$(create_deployment_package "$package_name")
            ;;
        "installation")
            local package_path=$(create_installation_package "$package_name")
            ;;
        "both")
            local deploy_package=$(create_deployment_package "$package_name")
            local install_package=$(create_installation_package "$package_name")
            
            echo
            show_package_info "$deploy_package"
            show_package_info "$install_package"
            return 0
            ;;
        *)
            log_error "Unknown package type: $package_type"
            exit 1
            ;;
    esac
    
    if verify_package "$package_path"; then
        echo
        show_package_info "$package_path"
        log_success "Package creation completed successfully!"
    else
        log_error "Package verification failed"
        exit 1
    fi
}

# Usage information
usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  create [deployment|installation|both]  Create package (default: deployment)"
    echo "  list                                   List existing packages"
    echo "  clean [count]                          Clean old packages (default: keep 5)"
    echo "  verify <package_file>                  Verify package integrity"
    echo "  info <package_file>                    Show package information"
    echo "  help                                   Show this help"
    echo
    echo "Examples:"
    echo "  $0 create deployment"
    echo "  $0 create installation"
    echo "  $0 create both"
    echo "  $0 list"
    echo "  $0 clean 3"
    echo "  $0 verify dist/packages/eform-locker-system-v1.0.0-20231201_120000.tar.gz"
}

# Main script logic
main() {
    local command="${1:-create}"
    
    case "$command" in
        "create")
            create_package "${2:-deployment}"
            ;;
        "list")
            list_packages
            ;;
        "clean")
            clean_packages "${2:-5}"
            ;;
        "verify")
            if [[ -z "$2" ]]; then
                log_error "Package file path required"
                usage
                exit 1
            fi
            verify_package "$2"
            ;;
        "info")
            if [[ -z "$2" ]]; then
                log_error "Package file path required"
                usage
                exit 1
            fi
            show_package_info "$2"
            ;;
        "help"|"-h"|"--help")
            usage
            ;;
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"