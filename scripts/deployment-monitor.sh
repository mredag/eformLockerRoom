#!/bin/bash

# Eform Deployment Monitoring Script
# Monitors deployment health and provides rollback recommendations

set -e

# Configuration
INSTALL_DIR="/opt/eform"
CONFIG_DIR="/opt/eform/config"
LOG_DIR="/var/log/eform"
MONITOR_LOG="$LOG_DIR/deployment-monitor.log"
METRICS_FILE="/tmp/eform-deployment-metrics.json"

# Monitoring thresholds
CPU_THRESHOLD=80          # CPU usage percentage
MEMORY_THRESHOLD=85       # Memory usage percentage
DISK_THRESHOLD=90         # Disk usage percentage
ERROR_RATE_THRESHOLD=5    # Error rate percentage
RESPONSE_TIME_THRESHOLD=2000  # Response time in milliseconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$MONITOR_LOG"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$MONITOR_LOG"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$MONITOR_LOG"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$MONITOR_LOG"
}

# Initialize monitoring
init_monitoring() {
    mkdir -p "$LOG_DIR"
    touch "$MONITOR_LOG"
    
    # Create initial metrics file
    cat > "$METRICS_FILE" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "deployment_start": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "monitoring",
  "services": {},
  "system": {},
  "health_checks": [],
  "alerts": []
}
EOF
}

# Get service metrics
get_service_metrics() {
    local service="$1"
    local pid=$(systemctl show --property MainPID --value "$service" 2>/dev/null || echo "0")
    
    if [[ "$pid" == "0" ]] || [[ -z "$pid" ]]; then
        echo '{"status": "stopped", "pid": 0, "cpu": 0, "memory": 0, "uptime": "0"}'
        return
    fi
    
    local cpu_usage=$(ps -p "$pid" -o %cpu --no-headers 2>/dev/null | tr -d ' ' || echo "0")
    local mem_usage=$(ps -p "$pid" -o %mem --no-headers 2>/dev/null | tr -d ' ' || echo "0")
    local uptime=$(ps -p "$pid" -o etime --no-headers 2>/dev/null | tr -d ' ' || echo "0")
    local status="running"
    
    # Check if service is actually active
    if ! systemctl is-active --quiet "$service"; then
        status="inactive"
    fi
    
    echo "{\"status\": \"$status\", \"pid\": $pid, \"cpu\": $cpu_usage, \"memory\": $mem_usage, \"uptime\": \"$uptime\"}"
}

# Get system metrics
get_system_metrics() {
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 | cut -d',' -f1)
    local mem_total=$(free -m | awk '/^Mem:/ {print $2}')
    local mem_used=$(free -m | awk '/^Mem:/ {print $3}')
    local mem_percentage=$(( (mem_used * 100) / mem_total ))
    
    local disk_usage=$(df -h "$INSTALL_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | cut -d',' -f1 | tr -d ' ')
    
    echo "{\"cpu_usage\": $cpu_usage, \"memory_usage\": $mem_percentage, \"disk_usage\": $disk_usage, \"load_average\": $load_avg}"
}

# Check service health
check_service_health() {
    local service="$1"
    local port="$2"
    local endpoint="${3:-/health}"
    
    local url="http://localhost:$port$endpoint"
    local start_time=$(date +%s%3N)
    
    if curl -f -s --max-time 5 "$url" >/dev/null 2>&1; then
        local end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))
        echo "{\"status\": \"healthy\", \"response_time\": $response_time, \"url\": \"$url\"}"
    else
        echo "{\"status\": \"unhealthy\", \"response_time\": -1, \"url\": \"$url\"}"
    fi
}

# Analyze error logs
analyze_error_logs() {
    local service="$1"
    local time_window="${2:-5}"  # minutes
    
    # Count errors in the last N minutes
    local error_count=$(journalctl -u "$service" --since "$time_window minutes ago" --no-pager | grep -i "error\|fatal\|exception" | wc -l)
    local total_logs=$(journalctl -u "$service" --since "$time_window minutes ago" --no-pager | wc -l)
    
    local error_rate=0
    if [[ $total_logs -gt 0 ]]; then
        error_rate=$(( (error_count * 100) / total_logs ))
    fi
    
    echo "{\"error_count\": $error_count, \"total_logs\": $total_logs, \"error_rate\": $error_rate}"
}

# Update metrics file
update_metrics() {
    local temp_file=$(mktemp)
    
    # Get current metrics
    local gateway_metrics=$(get_service_metrics "eform-gateway")
    local kiosk_metrics=$(get_service_metrics "eform-kiosk")
    local panel_metrics=$(get_service_metrics "eform-panel")
    local agent_metrics=$(get_service_metrics "eform-agent")
    
    local system_metrics=$(get_system_metrics)
    
    local gateway_health=$(check_service_health "eform-gateway" "3000")
    local kiosk_health=$(check_service_health "eform-kiosk" "3001")
    local panel_health=$(check_service_health "eform-panel" "3002")
    
    local gateway_errors=$(analyze_error_logs "eform-gateway")
    local kiosk_errors=$(analyze_error_logs "eform-kiosk")
    local panel_errors=$(analyze_error_logs "eform-panel")
    
    # Build metrics JSON
    jq -n \
        --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --argjson gateway_metrics "$gateway_metrics" \
        --argjson kiosk_metrics "$kiosk_metrics" \
        --argjson panel_metrics "$panel_metrics" \
        --argjson agent_metrics "$agent_metrics" \
        --argjson system_metrics "$system_metrics" \
        --argjson gateway_health "$gateway_health" \
        --argjson kiosk_health "$kiosk_health" \
        --argjson panel_health "$panel_health" \
        --argjson gateway_errors "$gateway_errors" \
        --argjson kiosk_errors "$kiosk_errors" \
        --argjson panel_errors "$panel_errors" \
        '{
            timestamp: $timestamp,
            deployment_start: (if has("deployment_start") then .deployment_start else $timestamp end),
            status: "monitoring",
            services: {
                gateway: ($gateway_metrics + {health: $gateway_health, errors: $gateway_errors}),
                kiosk: ($kiosk_metrics + {health: $kiosk_health, errors: $kiosk_errors}),
                panel: ($panel_metrics + {health: $panel_health, errors: $panel_errors}),
                agent: $agent_metrics
            },
            system: $system_metrics,
            health_checks: [],
            alerts: []
        }' > "$temp_file"
    
    # Merge with existing metrics if available
    if [[ -f "$METRICS_FILE" ]]; then
        jq -s '.[1] * .[0]' "$METRICS_FILE" "$temp_file" > "$METRICS_FILE"
    else
        mv "$temp_file" "$METRICS_FILE"
    fi
    
    rm -f "$temp_file"
}

# Check deployment health
check_deployment_health() {
    local alerts=()
    local health_status="healthy"
    
    # Read current metrics
    if [[ ! -f "$METRICS_FILE" ]]; then
        log_error "Metrics file not found"
        return 1
    fi
    
    local system_cpu=$(jq -r '.system.cpu_usage' "$METRICS_FILE")
    local system_memory=$(jq -r '.system.memory_usage' "$METRICS_FILE")
    local system_disk=$(jq -r '.system.disk_usage' "$METRICS_FILE")
    
    # Check system thresholds
    if [[ $(echo "$system_cpu > $CPU_THRESHOLD" | bc -l) -eq 1 ]]; then
        alerts+=("High CPU usage: ${system_cpu}%")
        health_status="warning"
    fi
    
    if [[ $system_memory -gt $MEMORY_THRESHOLD ]]; then
        alerts+=("High memory usage: ${system_memory}%")
        health_status="warning"
    fi
    
    if [[ $system_disk -gt $DISK_THRESHOLD ]]; then
        alerts+=("High disk usage: ${system_disk}%")
        health_status="critical"
    fi
    
    # Check service health
    local services=("gateway" "kiosk" "panel" "agent")
    for service in "${services[@]}"; do
        local service_status=$(jq -r ".services.$service.status" "$METRICS_FILE")
        local service_health=$(jq -r ".services.$service.health.status // \"unknown\"" "$METRICS_FILE")
        local error_rate=$(jq -r ".services.$service.errors.error_rate // 0" "$METRICS_FILE")
        local response_time=$(jq -r ".services.$service.health.response_time // 0" "$METRICS_FILE")
        
        if [[ "$service_status" != "running" ]]; then
            alerts+=("Service $service is not running")
            health_status="critical"
        fi
        
        if [[ "$service_health" == "unhealthy" ]]; then
            alerts+=("Service $service health check failed")
            health_status="critical"
        fi
        
        if [[ $error_rate -gt $ERROR_RATE_THRESHOLD ]]; then
            alerts+=("High error rate in $service: ${error_rate}%")
            health_status="warning"
        fi
        
        if [[ $response_time -gt $RESPONSE_TIME_THRESHOLD ]] && [[ $response_time -gt 0 ]]; then
            alerts+=("Slow response time in $service: ${response_time}ms")
            health_status="warning"
        fi
    done
    
    # Update metrics with alerts
    local alerts_json=$(printf '%s\n' "${alerts[@]}" | jq -R . | jq -s .)
    local temp_file=$(mktemp)
    
    jq --argjson alerts "$alerts_json" --arg status "$health_status" \
        '.alerts = $alerts | .status = $status' \
        "$METRICS_FILE" > "$temp_file"
    
    mv "$temp_file" "$METRICS_FILE"
    
    echo "$health_status"
}

# Generate deployment report
generate_report() {
    local output_file="${1:-deployment-report.json}"
    
    if [[ ! -f "$METRICS_FILE" ]]; then
        log_error "No metrics available for report generation"
        return 1
    fi
    
    log_info "Generating deployment report..."
    
    # Add report metadata
    local temp_file=$(mktemp)
    jq --arg report_generated "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        '. + {report_generated: $report_generated}' \
        "$METRICS_FILE" > "$temp_file"
    
    mv "$temp_file" "$output_file"
    
    log_success "Deployment report generated: $output_file"
}

# Show deployment status
show_deployment_status() {
    if [[ ! -f "$METRICS_FILE" ]]; then
        log_error "No metrics available"
        return 1
    fi
    
    echo "=============================================="
    echo "  Deployment Status"
    echo "=============================================="
    echo
    
    local status=$(jq -r '.status' "$METRICS_FILE")
    local timestamp=$(jq -r '.timestamp' "$METRICS_FILE")
    local deployment_start=$(jq -r '.deployment_start' "$METRICS_FILE")
    
    echo "Status: $status"
    echo "Last Update: $timestamp"
    echo "Deployment Started: $deployment_start"
    echo
    
    echo "System Metrics:"
    local cpu=$(jq -r '.system.cpu_usage' "$METRICS_FILE")
    local memory=$(jq -r '.system.memory_usage' "$METRICS_FILE")
    local disk=$(jq -r '.system.disk_usage' "$METRICS_FILE")
    local load=$(jq -r '.system.load_average' "$METRICS_FILE")
    
    echo "  CPU Usage: ${cpu}%"
    echo "  Memory Usage: ${memory}%"
    echo "  Disk Usage: ${disk}%"
    echo "  Load Average: $load"
    echo
    
    echo "Service Status:"
    local services=("gateway" "kiosk" "panel" "agent")
    for service in "${services[@]}"; do
        local service_status=$(jq -r ".services.$service.status" "$METRICS_FILE")
        local health_status=$(jq -r ".services.$service.health.status // \"unknown\"" "$METRICS_FILE")
        local response_time=$(jq -r ".services.$service.health.response_time // 0" "$METRICS_FILE")
        local error_rate=$(jq -r ".services.$service.errors.error_rate // 0" "$METRICS_FILE")
        
        echo "  $service: $service_status ($health_status)"
        if [[ $response_time -gt 0 ]]; then
            echo "    Response Time: ${response_time}ms"
        fi
        echo "    Error Rate: ${error_rate}%"
    done
    echo
    
    # Show alerts
    local alerts_count=$(jq -r '.alerts | length' "$METRICS_FILE")
    if [[ $alerts_count -gt 0 ]]; then
        echo "Active Alerts ($alerts_count):"
        jq -r '.alerts[]' "$METRICS_FILE" | while read alert; do
            echo "  - $alert"
        done
        echo
    fi
}

# Monitor deployment continuously
monitor_deployment() {
    local duration="${1:-300}"  # Default 5 minutes
    local interval="${2:-30}"   # Default 30 seconds
    
    log_info "Starting deployment monitoring for $duration seconds (interval: ${interval}s)"
    
    init_monitoring
    
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        update_metrics
        local health_status=$(check_deployment_health)
        
        log_info "Health check: $health_status"
        
        if [[ "$health_status" == "critical" ]]; then
            log_error "Critical issues detected, consider rollback"
            
            # Show current alerts
            if [[ -f "$METRICS_FILE" ]]; then
                jq -r '.alerts[]' "$METRICS_FILE" | while read alert; do
                    log_error "Alert: $alert"
                done
            fi
            
            return 1
        elif [[ "$health_status" == "warning" ]]; then
            log_warning "Warning conditions detected"
        fi
        
        sleep "$interval"
    done
    
    log_success "Deployment monitoring completed successfully"
    generate_report
    return 0
}

# Recommend rollback
recommend_rollback() {
    if [[ ! -f "$METRICS_FILE" ]]; then
        log_error "No metrics available for rollback recommendation"
        return 1
    fi
    
    local health_status=$(check_deployment_health)
    local alerts_count=$(jq -r '.alerts | length' "$METRICS_FILE")
    
    echo "=============================================="
    echo "  Rollback Recommendation"
    echo "=============================================="
    echo
    
    echo "Current Health Status: $health_status"
    echo "Active Alerts: $alerts_count"
    echo
    
    if [[ "$health_status" == "critical" ]]; then
        echo "RECOMMENDATION: IMMEDIATE ROLLBACK REQUIRED"
        echo
        echo "Critical issues detected:"
        jq -r '.alerts[]' "$METRICS_FILE" | while read alert; do
            echo "  - $alert"
        done
        echo
        echo "Suggested actions:"
        echo "  1. Execute rollback immediately"
        echo "  2. Investigate root cause"
        echo "  3. Fix issues before next deployment"
        return 1
    elif [[ "$health_status" == "warning" ]] && [[ $alerts_count -gt 3 ]]; then
        echo "RECOMMENDATION: CONSIDER ROLLBACK"
        echo
        echo "Multiple warning conditions detected:"
        jq -r '.alerts[]' "$METRICS_FILE" | while read alert; do
            echo "  - $alert"
        done
        echo
        echo "Suggested actions:"
        echo "  1. Monitor for 5-10 more minutes"
        echo "  2. If conditions don't improve, rollback"
        echo "  3. Check system resources and logs"
        return 2
    else
        echo "RECOMMENDATION: CONTINUE MONITORING"
        echo
        echo "System appears stable. Continue monitoring."
        if [[ $alerts_count -gt 0 ]]; then
            echo
            echo "Minor alerts:"
            jq -r '.alerts[]' "$METRICS_FILE" | while read alert; do
                echo "  - $alert"
            done
        fi
        return 0
    fi
}

# Usage information
usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  monitor [duration] [interval]    Monitor deployment (default: 300s, 30s interval)"
    echo "  status                           Show current deployment status"
    echo "  check                            Perform single health check"
    echo "  report [output_file]             Generate deployment report"
    echo "  recommend                        Get rollback recommendation"
    echo "  init                             Initialize monitoring"
    echo "  help                             Show this help"
    echo
    echo "Examples:"
    echo "  $0 monitor 600 60               # Monitor for 10 minutes, 60s intervals"
    echo "  $0 status"
    echo "  $0 check"
    echo "  $0 report deployment-report.json"
    echo "  $0 recommend"
}

# Main script logic
main() {
    local command="${1:-status}"
    
    case "$command" in
        "monitor")
            monitor_deployment "$2" "$3"
            ;;
        "status")
            show_deployment_status
            ;;
        "check")
            update_metrics
            check_deployment_health
            show_deployment_status
            ;;
        "report")
            generate_report "$2"
            ;;
        "recommend")
            recommend_rollback
            ;;
        "init")
            init_monitoring
            log_success "Monitoring initialized"
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