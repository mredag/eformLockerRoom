#!/bin/bash

# Eform Package Signing Script
# Creates and verifies digital signatures for deployment packages

set -e

# Configuration
KEYS_DIR="/opt/eform/keys"
PRIVATE_KEY_FILE="$KEYS_DIR/update-private-key.pem"
PUBLIC_KEY_FILE="$KEYS_DIR/update-public-key.pem"

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

# Generate key pair
generate_keys() {
    log_info "Generating RSA key pair for package signing..."
    
    mkdir -p "$KEYS_DIR"
    
    # Generate private key (4096-bit RSA)
    openssl genpkey -algorithm RSA -pkcs8 -out "$PRIVATE_KEY_FILE" -pkeyopt rsa_keygen_bits:4096
    
    # Generate public key
    openssl pkey -in "$PRIVATE_KEY_FILE" -pubout -out "$PUBLIC_KEY_FILE"
    
    # Set secure permissions
    chmod 600 "$PRIVATE_KEY_FILE"
    chmod 644 "$PUBLIC_KEY_FILE"
    chown root:root "$PRIVATE_KEY_FILE" "$PUBLIC_KEY_FILE"
    
    log_success "Key pair generated successfully"
    log_info "Private key: $PRIVATE_KEY_FILE"
    log_info "Public key: $PUBLIC_KEY_FILE"
    
    # Display public key fingerprint
    local fingerprint=$(openssl pkey -pubin -in "$PUBLIC_KEY_FILE" -outform DER | sha256sum | cut -d' ' -f1)
    log_info "Public key fingerprint (SHA256): $fingerprint"
}

# Sign package
sign_package() {
    local package_file="$1"
    local signature_file="${package_file}.sig"
    
    if [[ ! -f "$package_file" ]]; then
        log_error "Package file not found: $package_file"
        return 1
    fi
    
    if [[ ! -f "$PRIVATE_KEY_FILE" ]]; then
        log_error "Private key not found: $PRIVATE_KEY_FILE"
        log_info "Run '$0 generate-keys' to create signing keys"
        return 1
    fi
    
    log_info "Signing package: $(basename "$package_file")"
    
    # Create SHA256 checksum
    local checksum_file="${package_file}.sha256"
    sha256sum "$package_file" > "$checksum_file"
    log_info "Created checksum file: $(basename "$checksum_file")"
    
    # Create digital signature
    openssl dgst -sha256 -sign "$PRIVATE_KEY_FILE" -out "$signature_file" "$package_file"
    
    log_success "Package signed successfully"
    log_info "Signature file: $(basename "$signature_file")"
    
    # Verify signature immediately
    if verify_package "$package_file"; then
        log_success "Signature verification passed"
    else
        log_error "Signature verification failed"
        return 1
    fi
}

# Verify package signature
verify_package() {
    local package_file="$1"
    local signature_file="${package_file}.sig"
    local checksum_file="${package_file}.sha256"
    local public_key="${2:-$PUBLIC_KEY_FILE}"
    
    if [[ ! -f "$package_file" ]]; then
        log_error "Package file not found: $package_file"
        return 1
    fi
    
    if [[ ! -f "$signature_file" ]]; then
        log_error "Signature file not found: $signature_file"
        return 1
    fi
    
    if [[ ! -f "$public_key" ]]; then
        log_error "Public key not found: $public_key"
        return 1
    fi
    
    log_info "Verifying package: $(basename "$package_file")"
    
    # Verify checksum if available
    if [[ -f "$checksum_file" ]]; then
        if sha256sum -c "$checksum_file" >/dev/null 2>&1; then
            log_success "Package checksum verified"
        else
            log_error "Package checksum verification failed"
            return 1
        fi
    else
        log_warning "No checksum file found, skipping checksum verification"
    fi
    
    # Verify digital signature
    if openssl dgst -sha256 -verify "$public_key" -signature "$signature_file" "$package_file" >/dev/null 2>&1; then
        log_success "Package signature verified"
        return 0
    else
        log_error "Package signature verification failed"
        return 1
    fi
}

# Show package information
show_package_info() {
    local package_file="$1"
    local signature_file="${package_file}.sig"
    local checksum_file="${package_file}.sha256"
    
    echo "=============================================="
    echo "  Package Information"
    echo "=============================================="
    echo
    echo "Package: $(basename "$package_file")"
    
    if [[ -f "$package_file" ]]; then
        echo "Size: $(du -h "$package_file" | cut -f1)"
        echo "Modified: $(stat -c %y "$package_file" | cut -d' ' -f1-2)"
    else
        echo "Status: Not found"
    fi
    
    echo
    echo "Signature: $(basename "$signature_file")"
    if [[ -f "$signature_file" ]]; then
        echo "Size: $(du -h "$signature_file" | cut -f1)"
        echo "Modified: $(stat -c %y "$signature_file" | cut -d' ' -f1-2)"
        
        # Show signature verification status
        if verify_package "$package_file" >/dev/null 2>&1; then
            echo "Status: Valid"
        else
            echo "Status: Invalid"
        fi
    else
        echo "Status: Not found"
    fi
    
    echo
    echo "Checksum: $(basename "$checksum_file")"
    if [[ -f "$checksum_file" ]]; then
        echo "SHA256: $(cat "$checksum_file" | cut -d' ' -f1)"
    else
        echo "Status: Not found"
    fi
}

# List signed packages
list_signed_packages() {
    local search_dir="${1:-.}"
    
    echo "=============================================="
    echo "  Signed Packages"
    echo "=============================================="
    echo
    
    local found_packages=0
    
    find "$search_dir" -name "*.tar.gz" -type f | while read package_file; do
        local signature_file="${package_file}.sig"
        
        if [[ -f "$signature_file" ]]; then
            ((found_packages++))
            local package_name=$(basename "$package_file")
            local package_size=$(du -h "$package_file" | cut -f1)
            local package_date=$(stat -c %y "$package_file" | cut -d' ' -f1)
            
            # Check signature validity
            if verify_package "$package_file" >/dev/null 2>&1; then
                local status="Valid"
            else
                local status="Invalid"
            fi
            
            echo "$package_name - $package_date ($package_size) [$status]"
        fi
    done
    
    if [[ $found_packages -eq 0 ]]; then
        echo "No signed packages found in $search_dir"
    fi
    echo
}

# Export public key
export_public_key() {
    local output_file="${1:-update-public-key.pem}"
    
    if [[ ! -f "$PUBLIC_KEY_FILE" ]]; then
        log_error "Public key not found: $PUBLIC_KEY_FILE"
        log_info "Run '$0 generate-keys' to create signing keys"
        return 1
    fi
    
    cp "$PUBLIC_KEY_FILE" "$output_file"
    chmod 644 "$output_file"
    
    log_success "Public key exported to: $output_file"
    
    # Display fingerprint
    local fingerprint=$(openssl pkey -pubin -in "$output_file" -outform DER | sha256sum | cut -d' ' -f1)
    log_info "Public key fingerprint (SHA256): $fingerprint"
}

# Import public key
import_public_key() {
    local input_file="$1"
    local target_file="${2:-$PUBLIC_KEY_FILE}"
    
    if [[ ! -f "$input_file" ]]; then
        log_error "Input file not found: $input_file"
        return 1
    fi
    
    # Verify it's a valid public key
    if ! openssl pkey -pubin -in "$input_file" -noout >/dev/null 2>&1; then
        log_error "Invalid public key file: $input_file"
        return 1
    fi
    
    mkdir -p "$(dirname "$target_file")"
    cp "$input_file" "$target_file"
    chmod 644 "$target_file"
    
    log_success "Public key imported to: $target_file"
    
    # Display fingerprint
    local fingerprint=$(openssl pkey -pubin -in "$target_file" -outform DER | sha256sum | cut -d' ' -f1)
    log_info "Public key fingerprint (SHA256): $fingerprint"
}

# Show key information
show_key_info() {
    echo "=============================================="
    echo "  Signing Key Information"
    echo "=============================================="
    echo
    
    echo "Private Key: $PRIVATE_KEY_FILE"
    if [[ -f "$PRIVATE_KEY_FILE" ]]; then
        echo "Status: Present"
        echo "Size: $(openssl pkey -in "$PRIVATE_KEY_FILE" -text -noout | grep "Private-Key:" | cut -d'(' -f2 | cut -d' ' -f1)"
        echo "Modified: $(stat -c %y "$PRIVATE_KEY_FILE" | cut -d' ' -f1-2)"
    else
        echo "Status: Not found"
    fi
    
    echo
    echo "Public Key: $PUBLIC_KEY_FILE"
    if [[ -f "$PUBLIC_KEY_FILE" ]]; then
        echo "Status: Present"
        echo "Size: $(openssl pkey -pubin -in "$PUBLIC_KEY_FILE" -text -noout | grep "Public-Key:" | cut -d'(' -f2 | cut -d' ' -f1)"
        echo "Modified: $(stat -c %y "$PUBLIC_KEY_FILE" | cut -d' ' -f1-2)"
        
        local fingerprint=$(openssl pkey -pubin -in "$PUBLIC_KEY_FILE" -outform DER | sha256sum | cut -d' ' -f1)
        echo "Fingerprint: $fingerprint"
    else
        echo "Status: Not found"
    fi
    echo
}

# Batch sign packages
batch_sign() {
    local search_dir="${1:-.}"
    
    log_info "Batch signing packages in: $search_dir"
    
    local signed_count=0
    local failed_count=0
    
    find "$search_dir" -name "*.tar.gz" -type f | while read package_file; do
        local signature_file="${package_file}.sig"
        
        # Skip if already signed
        if [[ -f "$signature_file" ]]; then
            log_info "Skipping already signed package: $(basename "$package_file")"
            continue
        fi
        
        if sign_package "$package_file"; then
            ((signed_count++))
        else
            ((failed_count++))
        fi
    done
    
    log_info "Batch signing completed: $signed_count signed, $failed_count failed"
}

# Usage information
usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  generate-keys                    Generate new signing key pair"
    echo "  sign <package_file>              Sign a package"
    echo "  verify <package_file> [pubkey]   Verify package signature"
    echo "  info <package_file>              Show package signature information"
    echo "  list [directory]                 List signed packages"
    echo "  batch-sign [directory]           Sign all unsigned packages in directory"
    echo "  export-key [output_file]         Export public key"
    echo "  import-key <input_file> [target] Import public key"
    echo "  key-info                         Show signing key information"
    echo "  help                             Show this help"
    echo
    echo "Examples:"
    echo "  $0 generate-keys"
    echo "  $0 sign package.tar.gz"
    echo "  $0 verify package.tar.gz"
    echo "  $0 info package.tar.gz"
    echo "  $0 list /opt/eform/packages"
    echo "  $0 export-key public-key.pem"
}

# Main script logic
main() {
    local command="${1:-help}"
    
    case "$command" in
        "generate-keys")
            if [[ $EUID -ne 0 ]]; then
                log_error "Root privileges required for key generation"
                exit 1
            fi
            generate_keys
            ;;
        "sign")
            if [[ -z "$2" ]]; then
                log_error "Package file path required"
                usage
                exit 1
            fi
            sign_package "$2"
            ;;
        "verify")
            if [[ -z "$2" ]]; then
                log_error "Package file path required"
                usage
                exit 1
            fi
            verify_package "$2" "$3"
            ;;
        "info")
            if [[ -z "$2" ]]; then
                log_error "Package file path required"
                usage
                exit 1
            fi
            show_package_info "$2"
            ;;
        "list")
            list_signed_packages "$2"
            ;;
        "batch-sign")
            batch_sign "$2"
            ;;
        "export-key")
            export_public_key "$2"
            ;;
        "import-key")
            if [[ -z "$2" ]]; then
                log_error "Input file path required"
                usage
                exit 1
            fi
            import_public_key "$2" "$3"
            ;;
        "key-info")
            show_key_info
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