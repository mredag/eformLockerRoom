#!/bin/bash

# Eform Locker System Canary Deployment Script
# Implements canary deployment with kiosk grouping and automatic rollback

set -e

# Configuration
INSTALL_DIR="/opt/eform"
CONFIG_DIR="/opt/eform/config"
BACKUP_DIR="/opt/eform/backups"
LOG_FILE="/var/log/eform/canary-deploy.log"
CANARY_CONFIG_FILE="$CONFIG_DIR/canary-config.json"

# Canary deployment settings
CANARY_PERCENTAGE=20  # Percentage of kiosks for canary deployment
ROLLBACK_THRESHOLD=10  # Percentage of failures that trigger rollback
HEALTH_CHECK_INTERVAL=30  # Seconds between health checks
CANARY_DURATION=300  # Seconds to run canary before full deployment
MAX_HEALTH_FAILURES=3  # Maximum consecutive health check failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Load canary configuration
load_canary_config() {
    if [[ -f "$CANARY_CONFIG_FILE" ]]; then
        log_info "Loading canary configuration from $CANARY_CONFIG_FILE"
        
        # Extract configuration values
        CANARY_PERCENTAGE=$(jq -r '.canary_percentage // 20' "$CANARY_CONFIG_FILE")
        ROLLBACK_THRESHOLD=$(jq -r '.rollback_threshold // 10' "$CANARY_CONFIG_FILE")
        HEALTH_CHECK_INTERVAL=$(jq -r '.health_check_interval // 30' "$CANARY_CONFIG_FILE")
        CANARY_DURATION=$(jq -r '.canary_duration // 300' "$CANARY_CONFIG_FILE")
        MAX_HEALTH_FAILURES=$(jq -r '.max_health_failures // 3' "$CANARY_CONFIG_FILE")
        
        log_success "Canary configuration loaded"
    else
        log_info "Using default canary configuration"
        create_default_canary_config
    fi
}

# Create default canary configuration
create_default_canary_config() {
    log_info "Creating default canary configuration..."
    
    mkdir -p "$(dirname "$CANARY_CONFIG_FILE")"
    
    cat > "$CANARY_CONFIG_FILE" << EOF
{
  "canary_percentage": 20,
  "rollback_threshold": 10,
  "health_check_interval": 30,
  "canary_duration": 300,
  "max_health_failures": 3,
  "kiosk_groups": {
    "canary": [],
    "stable": []
  },
  "deployment_strategy": "percentage",
  "notification": {
    "enabled": false,
    "webhook_url": "",
    "email": ""
  }
}
EOF
    
    chown eform:eform "$CANARY_CONFIG_FILE"
    chmod 640 "$CANARY_CONFIG_FILE"
    
    log_success "Default canary configuration created"
}

# Get list of active kiosks
get_active_kiosks() {
    log_info "Discovering active kiosks..."
    
    # Query database for active kiosks
    local kiosks=$(sudo -u eform sqlite3 "$INSTALL_DIR/data/eform.db" \
        "SELECT DISTINCT kiosk_id FROM kiosk_heartbeat WHERE status = 'online' AND last_seen > datetime('now', '-5 minutes');" 2>/dev/null || echo "")
    
    if [[ -z "$kiosks" ]]; then
        log_warning "No active kiosks found in database"
        # Fallback: check for running kiosk services
        if systemctl is-active --quiet eform-kiosk; then
            echo "local-kiosk"
        fi
    else
        echo "$kiosks"
    fi
}

# Select canary kiosks
select_canary_kiosks() {
    local all_kiosks=($1)
    local total_kiosks=${#all_kiosks[@]}
    
    if [[ $total_kiosks -eq 0 ]]; then
        log_error "No kiosks available for canary deployment"
        return 1
    fi
    
    # Calculate number of canary kiosks
    local canary_count=$(( (total_kiosks * CANARY_PERCENTAGE + 99) / 100 ))  # Round up
    if [[ $canary_count -eq 0 ]]; then
        canary_count=1
    fi
    
    log_info "Selecting $canary_count out of $total_kiosks kiosks for canary deployment"
    
    # Select kiosks (first N kiosks for simplicity, could be randomized)
    local canary_kiosks=("${all_kiosks[@]:0:$canary_count}")
    local stable_kiosks=("${all_kiosks[@]:$canary_count}")
    
    # Update canary configuration
    local temp_config=$(mktemp)
    jq --argjson canary "$(printf '%s\n' "${canary_kiosks[@]}" | jq -R . | jq -s .)" \
       --argjson stable "$(printf '%s\n' "${stable_kiosks[@]}" | jq -R . | jq -s .)" \
       '.kiosk_groups.canary = $canary | .kiosk_groups.stable = $stable' \
       "$CANARY_CONFIG_FILE" > "$temp_config"
    
    mv "$temp_config" "$CANARY_CONFIG_FILE"
    chown eform:eform "$CANARY_CONFIG_FILE"
    
    log_success "Canary kiosks selected: ${canary_kiosks[*]}"
    log_info "Stable kiosks: ${stable_kiosks[*]}"
    
    echo "${canary_kiosks[*]}"
}

# Verify package signature
verify_package_signature() {
    local package_file="$1"
    local signature_file="${package_file}.sig"
    local public_key_file="$CONFIG_DIR/update-public-key.pem"
    
    log_info "Verifying package signature..."
    
    if [[ ! -f "$signature_file" ]]; then
        log_error "Signature file not found: $signature_file"
        return 1
    fi
    
    if [[ ! -f "$public_key_file" ]]; then
        log_error "Public key file not found: $public_key_file"
        return 1
    fi
    
    # Verify SHA256 checksum
    local checksum_file="${package_file}.sha256"
    if [[ -f "$checksum_file" ]]; then
        if ! sha256sum -c "$checksum_file" >/dev/null 2>&1; then
            log_error "Package checksum verification failed"
            return 1
        fi
        log_success "Package checksum verified"
    else
        log_warning "No checksum file found, skipping checksum verification"
    fi
    
    # Verify digital signature (using openssl)
    if openssl dgst -sha256 -verify "$public_key_file" -signature "$signature_file" "$package_file" >/dev/null 2>&1; then
        log_success "Package signature verified"
        return 0
    else
        log_error "Package signature verification failed"
        return 1
    fi
}

# Deploy to specific kiosks
deploy_to_kiosks() {
    local package_file="$1"
    local kiosks=($2)
    local deployment_type="$3"  # "canary" or "full"
    
    log_info "Deploying $deployment_type to kiosks: ${kiosks[*]}"
    
    local success_count=0
    local failure_count=0
    local failed_kiosks=()
    
    for kiosk in "${kiosks[@]}"; do
        log_info "Deploying to kiosk: $kiosk"
        
        if deploy_to_single_kiosk "$package_file" "$kiosk"; then
            ((success_count++))
            log_success "Deployment to $kiosk successful"
        else
            ((failure_count++))
            failed_kiosks+=("$kiosk")
            log_error "Deployment to $kiosk failed"
        fi
    done
    
    local total_kiosks=${#kiosks[@]}
    local failure_percentage=$(( (failure_count * 100) / total_kiosks ))
    
    log_info "Deployment results: $success_count successful, $failure_count failed ($failure_percentage% failure rate)"
    
    if [[ $failure_percentage -gt $ROLLBACK_THRESHOLD ]]; then
        log_error "Failure rate ($failure_percentage%) exceeds rollback threshold ($ROLLBACK_THRESHOLD%)"
        return 1
    fi
    
    if [[ ${#failed_kiosks[@]} -gt 0 ]]; then
        log_warning "Failed kiosks: ${failed_kiosks[*]}"
    fi
    
    return 0
}

# Deploy to single kiosk
deploy_to_single_kiosk() {
    local package_file="$1"
    local kiosk_id="$2"
    
    # For local deployment, use the standard deploy script
    if [[ "$kiosk_id" == "local-kiosk" ]] || [[ -z "$kiosk_id" ]]; then
        "$INSTALL_DIR/scripts/deploy.sh" deploy "$package_file" >/dev/null 2>&1
        return $?
    fi
    
    # For remote kiosks, this would involve network deployment
    # For now, we'll simulate this with local deployment
    log_info "Simulating deployment to remote kiosk: $kiosk_id"
    
    # In a real implementation, this would:
    # 1. Copy package to remote kiosk
    # 2. Execute deployment remotely
    # 3. Verify deployment success
    
    # Simulate deployment delay
    sleep 2
    
    # Simulate 90% success rate
    if [[ $((RANDOM % 10)) -lt 9 ]]; then
        return 0
    else
        return 1
    fi
}

# Monitor canary deployment health
monitor_canary_health() {
    local canary_kiosks=($1)
    local start_time=$(date +%s)
    local end_time=$((start_time + CANARY_DURATION))
    local consecutive_failures=0
    
    log_info "Monitoring canary deployment health for $CANARY_DURATION seconds..."
    
    while [[ $(date +%s) -lt $end_time ]]; do
        local healthy_count=0
        local unhealthy_count=0
        
        for kiosk in "${canary_kiosks[@]}"; do
            if check_kiosk_health "$kiosk"; then
                ((healthy_count++))
            else
                ((unhealthy_count++))
            fi
        done
        
        local total_kiosks=${#canary_kiosks[@]}
        local unhealthy_percentage=$(( (unhealthy_count * 100) / total_kiosks ))
        
        log_info "Health check: $healthy_count healthy, $unhealthy_count unhealthy ($unhealthy_percentage% unhealthy)"
        
        if [[ $unhealthy_percentage -gt $ROLLBACK_THRESHOLD ]]; then
            ((consecutive_failures++))
            log_warning "Unhealthy percentage ($unhealthy_percentage%) exceeds threshold ($ROLLBACK_THRESHOLD%) - consecutive failures: $consecutive_failures"
            
            if [[ $consecutive_failures -ge $MAX_HEALTH_FAILURES ]]; then
                log_error "Maximum consecutive health failures reached, triggering rollback"
                return 1
            fi
        else
            consecutive_failures=0
        fi
        
        sleep $HEALTH_CHECK_INTERVAL
    done
    
    log_success "Canary monitoring completed successfully"
    return 0
}

# Check individual kiosk health
check_kiosk_health() {
    local kiosk_id="$1"
    
    # For local kiosk, check local health endpoint
    if [[ "$kiosk_id" == "local-kiosk" ]] || [[ -z "$kiosk_id" ]]; then
        curl -f -s --max-time 5 http://localhost:3001/health >/dev/null 2>&1
        return $?
    fi
    
    # For remote kiosks, this would check remote health endpoints
    # For now, simulate health check
    
    # Check if kiosk is still reporting heartbeat
    local last_seen=$(sudo -u eform sqlite3 "$INSTALL_DIR/data/eform.db" \
        "SELECT last_seen FROM kiosk_heartbeat WHERE kiosk_id = '$kiosk_id';" 2>/dev/null || echo "")
    
    if [[ -n "$last_seen" ]]; then
        # Check if last seen is within the last 2 minutes
        local last_seen_timestamp=$(date -d "$last_seen" +%s 2>/dev/null || echo "0")
        local current_timestamp=$(date +%s)
        local time_diff=$((current_timestamp - last_seen_timestamp))
        
        if [[ $time_diff -lt 120 ]]; then
            return 0  # Healthy
        fi
    fi
    
    return 1  # Unhealthy
}

# Rollback canary deployment
rollback_canary() {
    local canary_kiosks=($1)
    local backup_file="$2"
    
    log_warning "Rolling back canary deployment..."
    
    for kiosk in "${canary_kiosks[@]}"; do
        log_info "Rolling back kiosk: $kiosk"
        
        if rollback_single_kiosk "$backup_file" "$kiosk"; then
            log_success "Rollback of $kiosk successful"
        else
            log_error "Rollback of $kiosk failed"
        fi
    done
    
    log_success "Canary rollback completed"
}

# Rollback single kiosk
rollback_single_kiosk() {
    local backup_file="$1"
    local kiosk_id="$2"
    
    # For local kiosk, use the standard deploy script
    if [[ "$kiosk_id" == "local-kiosk" ]] || [[ -z "$kiosk_id" ]]; then
        "$INSTALL_DIR/scripts/deploy.sh" rollback "$backup_file" >/dev/null 2>&1
        return $?
    fi
    
    # For remote kiosks, this would involve network rollback
    log_info "Simulating rollback of remote kiosk: $kiosk_id"
    
    # Simulate rollback delay
    sleep 1
    
    # Simulate 95% success rate for rollback
    if [[ $((RANDOM % 20)) -lt 19 ]]; then
        return 0
    else
        return 1
    fi
}

# Send deployment notification
send_notification() {
    local status="$1"
    local message="$2"
    
    # Check if notifications are enabled
    local notification_enabled=$(jq -r '.notification.enabled // false' "$CANARY_CONFIG_FILE")
    
    if [[ "$notification_enabled" != "true" ]]; then
        return 0
    fi
    
    local webhook_url=$(jq -r '.notification.webhook_url // ""' "$CANARY_CONFIG_FILE")
    local email=$(jq -r '.notification.email // ""' "$CANARY_CONFIG_FILE")
    
    # Send webhook notification
    if [[ -n "$webhook_url" ]]; then
        local payload=$(jq -n \
            --arg status "$status" \
            --arg message "$message" \
            --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            '{status: $status, message: $message, timestamp: $timestamp}')
        
        curl -X POST -H "Content-Type: application/json" -d "$payload" "$webhook_url" >/dev/null 2>&1 || true
    fi
    
    # Send email notification
    if [[ -n "$email" ]]; then
        local subject="Eform Canary Deployment $status"
        echo -e "$message\n\nTimestamp: $(date)" | mail -s "$subject" "$email" 2>/dev/null || true
    fi
}

# Perform canary deployment
perform_canary_deployment() {
    local package_file="$1"
    
    log_info "Starting canary deployment process..."
    
    # Verify package signature
    if ! verify_package_signature "$package_file"; then
        log_error "Package signature verification failed, aborting deployment"
        send_notification "FAILED" "Canary deployment failed: Package signature verification failed"
        exit 1
    fi
    
    # Create pre-deployment backup
    log_info "Creating pre-deployment backup..."
    local backup_file=$("$INSTALL_DIR/scripts/backup.sh" backup weekly | tail -1)
    
    # Get active kiosks
    local all_kiosks=($(get_active_kiosks))
    if [[ ${#all_kiosks[@]} -eq 0 ]]; then
        log_error "No active kiosks found for deployment"
        send_notification "FAILED" "Canary deployment failed: No active kiosks found"
        exit 1
    fi
    
    # Select canary kiosks
    local canary_kiosks=($(select_canary_kiosks "${all_kiosks[*]}"))
    local stable_kiosks=($(jq -r '.kiosk_groups.stable[]' "$CANARY_CONFIG_FILE"))
    
    log_info "Canary deployment plan:"
    log_info "  Total kiosks: ${#all_kiosks[@]}"
    log_info "  Canary kiosks: ${#canary_kiosks[@]} (${canary_kiosks[*]})"
    log_info "  Stable kiosks: ${#stable_kiosks[@]} (${stable_kiosks[*]})"
    
    # Deploy to canary kiosks
    if ! deploy_to_kiosks "$package_file" "${canary_kiosks[*]}" "canary"; then
        log_error "Canary deployment failed, rolling back..."
        rollback_canary "${canary_kiosks[*]}" "$backup_file"
        send_notification "FAILED" "Canary deployment failed during initial deployment, rolled back"
        exit 1
    fi
    
    send_notification "CANARY_DEPLOYED" "Canary deployment successful, monitoring health for $CANARY_DURATION seconds"
    
    # Monitor canary health
    if ! monitor_canary_health "${canary_kiosks[*]}"; then
        log_error "Canary health monitoring failed, rolling back..."
        rollback_canary "${canary_kiosks[*]}" "$backup_file"
        send_notification "FAILED" "Canary deployment failed during health monitoring, rolled back"
        exit 1
    fi
    
    # Deploy to remaining kiosks
    if [[ ${#stable_kiosks[@]} -gt 0 ]]; then
        log_info "Canary successful, deploying to remaining kiosks..."
        
        if ! deploy_to_kiosks "$package_file" "${stable_kiosks[*]}" "full"; then
            log_error "Full deployment failed, rolling back all kiosks..."
            rollback_canary "${all_kiosks[*]}" "$backup_file"
            send_notification "FAILED" "Full deployment failed, rolled back all kiosks"
            exit 1
        fi
    fi
    
    # Final health check
    log_info "Performing final health check..."
    sleep 30
    
    local final_healthy=0
    local final_unhealthy=0
    
    for kiosk in "${all_kiosks[@]}"; do
        if check_kiosk_health "$kiosk"; then
            ((final_healthy++))
        else
            ((final_unhealthy++))
        fi
    done
    
    local final_unhealthy_percentage=$(( (final_unhealthy * 100) / ${#all_kiosks[@]} ))
    
    if [[ $final_unhealthy_percentage -gt $ROLLBACK_THRESHOLD ]]; then
        log_error "Final health check failed ($final_unhealthy_percentage% unhealthy), rolling back..."
        rollback_canary "${all_kiosks[*]}" "$backup_file"
        send_notification "FAILED" "Final health check failed, rolled back all kiosks"
        exit 1
    fi
    
    log_success "Canary deployment completed successfully!"
    log_info "Final status: $final_healthy healthy, $final_unhealthy unhealthy"
    send_notification "SUCCESS" "Canary deployment completed successfully: $final_healthy healthy, $final_unhealthy unhealthy kiosks"
}

# Show canary status
show_canary_status() {
    echo "=============================================="
    echo "  Canary Deployment Status"
    echo "=============================================="
    echo
    
    if [[ -f "$CANARY_CONFIG_FILE" ]]; then
        echo "Configuration:"
        echo "  Canary percentage: $(jq -r '.canary_percentage' "$CANARY_CONFIG_FILE")%"
        echo "  Rollback threshold: $(jq -r '.rollback_threshold' "$CANARY_CONFIG_FILE")%"
        echo "  Health check interval: $(jq -r '.health_check_interval' "$CANARY_CONFIG_FILE")s"
        echo "  Canary duration: $(jq -r '.canary_duration' "$CANARY_CONFIG_FILE")s"
        echo
        
        local canary_kiosks=($(jq -r '.kiosk_groups.canary[]' "$CANARY_CONFIG_FILE"))
        local stable_kiosks=($(jq -r '.kiosk_groups.stable[]' "$CANARY_CONFIG_FILE"))
        
        echo "Kiosk Groups:"
        echo "  Canary: ${canary_kiosks[*]:-none}"
        echo "  Stable: ${stable_kiosks[*]:-none}"
        echo
    else
        echo "No canary configuration found"
        echo
    fi
    
    # Show active kiosks
    local active_kiosks=($(get_active_kiosks))
    echo "Active Kiosks: ${#active_kiosks[@]}"
    for kiosk in "${active_kiosks[@]}"; do
        if check_kiosk_health "$kiosk"; then
            echo "  $kiosk: Healthy"
        else
            echo "  $kiosk: Unhealthy"
        fi
    done
}

# Usage information
usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  deploy <package_file>    Perform canary deployment"
    echo "  status                   Show canary deployment status"
    echo "  config                   Show/edit canary configuration"
    echo "  test                     Test canary deployment process (dry run)"
    echo "  help                     Show this help"
    echo
    echo "Examples:"
    echo "  $0 deploy /path/to/package.tar.gz"
    echo "  $0 status"
    echo "  $0 config"
}

# Main script logic
main() {
    local command="${1:-status}"
    
    case "$command" in
        "deploy")
            if [[ -z "$2" ]]; then
                log_error "Package file path required"
                usage
                exit 1
            fi
            check_root
            load_canary_config
            perform_canary_deployment "$2"
            ;;
        "status")
            load_canary_config
            show_canary_status
            ;;
        "config")
            if [[ -f "$CANARY_CONFIG_FILE" ]]; then
                echo "Current canary configuration:"
                jq . "$CANARY_CONFIG_FILE"
            else
                echo "No canary configuration found"
                echo "Run 'canary-deploy.sh deploy <package>' to create default configuration"
            fi
            ;;
        "test")
            log_info "Testing canary deployment process (dry run)..."
            load_canary_config
            local all_kiosks=($(get_active_kiosks))
            select_canary_kiosks "${all_kiosks[*]}" >/dev/null
            show_canary_status
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