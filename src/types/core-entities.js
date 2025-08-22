/**
 * Core Entity Interfaces for Eform Locker System
 * Following the design specification for multi-room locker management
 */
// ============================================================================
// EVENT ENTITIES
// ============================================================================
export var EventType;
(function (EventType) {
    // System events
    EventType["SYSTEM_RESTARTED"] = "restarted";
    EventType["KIOSK_ONLINE"] = "kiosk_online";
    EventType["KIOSK_OFFLINE"] = "kiosk_offline";
    // User events
    EventType["RFID_ASSIGN"] = "rfid_assign";
    EventType["RFID_RELEASE"] = "rfid_release";
    EventType["QR_ASSIGN"] = "qr_assign";
    EventType["QR_RELEASE"] = "qr_release";
    // Staff events
    EventType["STAFF_OPEN"] = "staff_open";
    EventType["STAFF_BLOCK"] = "staff_block";
    EventType["STAFF_UNBLOCK"] = "staff_unblock";
    EventType["BULK_OPEN"] = "bulk_open";
    EventType["MASTER_PIN_USED"] = "master_pin_used";
    // VIP events
    EventType["VIP_CONTRACT_CREATED"] = "vip_contract_created";
    EventType["VIP_CONTRACT_EXTENDED"] = "vip_contract_extended";
    EventType["VIP_CONTRACT_CANCELLED"] = "vip_contract_cancelled";
    EventType["VIP_CARD_CHANGED"] = "vip_card_changed";
    EventType["VIP_TRANSFER_REQUESTED"] = "vip_transfer_requested";
    EventType["VIP_TRANSFER_APPROVED"] = "vip_transfer_approved";
    EventType["VIP_TRANSFER_REJECTED"] = "vip_transfer_rejected";
    EventType["VIP_TRANSFER_COMPLETED"] = "vip_transfer_completed";
    // Configuration events
    EventType["CONFIG_PACKAGE_CREATED"] = "config_package_created";
    EventType["CONFIG_DEPLOYMENT_INITIATED"] = "config_deployment_initiated";
    EventType["CONFIG_APPLIED"] = "config_applied";
    EventType["CONFIG_ROLLBACK"] = "config_rollback";
    // Provisioning events
    EventType["PROVISIONING_TOKEN_GENERATED"] = "provisioning_token_generated";
    EventType["KIOSK_REGISTERED"] = "kiosk_registered";
    EventType["KIOSK_ENROLLED"] = "kiosk_enrolled";
    EventType["PROVISIONING_ROLLBACK"] = "provisioning_rollback";
})(EventType || (EventType = {}));
export var Permission;
(function (Permission) {
    Permission["VIEW_LOCKERS"] = "view_lockers";
    Permission["OPEN_LOCKER"] = "open_locker";
    Permission["BULK_OPEN"] = "bulk_open";
    Permission["BLOCK_LOCKER"] = "block_locker";
    Permission["MANAGE_VIP"] = "manage_vip";
    Permission["MANAGE_MASTER_PIN"] = "manage_master_pin";
    Permission["VIEW_EVENTS"] = "view_events";
    Permission["EXPORT_REPORTS"] = "export_reports";
    Permission["SYSTEM_CONFIG"] = "system_config";
})(Permission || (Permission = {}));
//# sourceMappingURL=core-entities.js.map