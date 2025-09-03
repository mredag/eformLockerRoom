-- Configuration Templates System
-- Task 10.3: Create Configuration Templates System

-- Create configuration templates table
CREATE TABLE IF NOT EXISTS configuration_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    version TEXT NOT NULL DEFAULT '1.0.0',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL DEFAULT 'system',
    tags TEXT DEFAULT '[]', -- JSON array of tags
    configuration TEXT NOT NULL, -- JSON configuration data
    compatibility TEXT DEFAULT '{}', -- JSON compatibility requirements
    metadata TEXT DEFAULT '{}' -- JSON metadata (locker count, card types, etc.)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_configuration_templates_name ON configuration_templates(name);
CREATE INDEX IF NOT EXISTS idx_configuration_templates_created_at ON configuration_templates(created_at);
CREATE INDEX IF NOT EXISTS idx_configuration_templates_created_by ON configuration_templates(created_by);

-- Create template usage tracking table
CREATE TABLE IF NOT EXISTS template_usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'applied', 'exported', 'validated'
    user_id TEXT NOT NULL DEFAULT 'system',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    details TEXT DEFAULT '{}', -- JSON details about the action
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    FOREIGN KEY (template_id) REFERENCES configuration_templates(id) ON DELETE CASCADE
);

-- Create index for usage tracking
CREATE INDEX IF NOT EXISTS idx_template_usage_log_template_id ON template_usage_log(template_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_log_timestamp ON template_usage_log(timestamp);

-- Insert default templates for common configurations

-- Standard 16-locker single card setup
INSERT OR IGNORE INTO configuration_templates (
    id,
    name,
    description,
    version,
    created_by,
    tags,
    configuration,
    compatibility,
    metadata
) VALUES (
    'default-16-locker-single-card',
    'Standard 16-Locker Single Card',
    'Basic configuration for a single Waveshare 16-channel relay card with 16 lockers in a 4x4 grid layout.',
    '1.0.0',
    'system',
    '["default", "single-card", "16-locker", "waveshare", "basic"]',
    '{
        "hardware": {
            "modbus": {
                "port": "/dev/ttyUSB0",
                "baudrate": 9600,
                "timeout_ms": 2000,
                "pulse_duration_ms": 500,
                "command_interval_ms": 100,
                "max_retries": 3,
                "use_multiple_coils": false,
                "verify_writes": true
            },
            "relay_cards": [
                {
                    "slave_address": 1,
                    "channels": 16,
                    "type": "waveshare_16ch",
                    "dip_switches": "00000001",
                    "description": "Main Locker Bank 1-16",
                    "enabled": true
                }
            ]
        },
        "lockers": {
            "total_count": 16,
            "reserve_ttl_seconds": 300,
            "layout": {
                "rows": 4,
                "columns": 4,
                "numbering_scheme": "sequential"
            },
            "auto_release_hours": 24,
            "maintenance_mode": false
        }
    }',
    '{
        "min_version": "1.0.0",
        "hardware_requirements": ["modbus_rtu", "serial_port", "waveshare_16ch"]
    }',
    '{
        "total_lockers": 16,
        "total_cards": 1,
        "card_types": ["waveshare_16ch"],
        "layout_type": "sequential"
    }'
);

-- Standard 32-locker dual card setup
INSERT OR IGNORE INTO configuration_templates (
    id,
    name,
    description,
    version,
    created_by,
    tags,
    configuration,
    compatibility,
    metadata
) VALUES (
    'default-32-locker-dual-card',
    'Standard 32-Locker Dual Card',
    'Configuration for two Waveshare 16-channel relay cards with 32 lockers in a 4x8 grid layout. Based on proven dual card solution.',
    '1.0.0',
    'system',
    '["default", "dual-card", "32-locker", "waveshare", "production"]',
    '{
        "hardware": {
            "modbus": {
                "port": "/dev/ttyUSB0",
                "baudrate": 9600,
                "timeout_ms": 2000,
                "pulse_duration_ms": 500,
                "command_interval_ms": 100,
                "max_retries": 3,
                "use_multiple_coils": false,
                "verify_writes": true
            },
            "relay_cards": [
                {
                    "slave_address": 1,
                    "channels": 16,
                    "type": "waveshare_16ch",
                    "dip_switches": "00000001",
                    "description": "Main Locker Bank 1-16",
                    "enabled": true
                },
                {
                    "slave_address": 2,
                    "channels": 16,
                    "type": "waveshare_16ch",
                    "dip_switches": "00000010",
                    "description": "Main Locker Bank 17-32",
                    "enabled": true
                }
            ]
        },
        "lockers": {
            "total_count": 32,
            "reserve_ttl_seconds": 300,
            "layout": {
                "rows": 4,
                "columns": 8,
                "numbering_scheme": "sequential"
            },
            "auto_release_hours": 24,
            "maintenance_mode": false
        }
    }',
    '{
        "min_version": "1.0.0",
        "hardware_requirements": ["modbus_rtu", "serial_port", "waveshare_16ch"]
    }',
    '{
        "total_lockers": 32,
        "total_cards": 2,
        "card_types": ["waveshare_16ch"],
        "layout_type": "sequential"
    }'
);

-- Development/Testing template
INSERT OR IGNORE INTO configuration_templates (
    id,
    name,
    description,
    version,
    created_by,
    tags,
    configuration,
    compatibility,
    metadata
) VALUES (
    'development-test-setup',
    'Development & Testing Setup',
    'Minimal configuration for development and testing with relaxed timeouts and debug settings.',
    '1.0.0',
    'system',
    '["development", "testing", "debug", "minimal"]',
    '{
        "hardware": {
            "modbus": {
                "port": "/dev/ttyUSB0",
                "baudrate": 9600,
                "timeout_ms": 5000,
                "pulse_duration_ms": 1000,
                "command_interval_ms": 200,
                "max_retries": 5,
                "use_multiple_coils": false,
                "verify_writes": true
            },
            "relay_cards": [
                {
                    "slave_address": 1,
                    "channels": 8,
                    "type": "waveshare_8ch",
                    "dip_switches": "00000001",
                    "description": "Development Test Card",
                    "enabled": true
                }
            ]
        },
        "lockers": {
            "total_count": 8,
            "reserve_ttl_seconds": 600,
            "layout": {
                "rows": 2,
                "columns": 4,
                "numbering_scheme": "sequential"
            },
            "auto_release_hours": 1,
            "maintenance_mode": false
        }
    }',
    '{
        "min_version": "1.0.0",
        "hardware_requirements": ["modbus_rtu", "serial_port"]
    }',
    '{
        "total_lockers": 8,
        "total_cards": 1,
        "card_types": ["waveshare_8ch"],
        "layout_type": "sequential"
    }'
);

-- High-capacity template
INSERT OR IGNORE INTO configuration_templates (
    id,
    name,
    description,
    version,
    created_by,
    tags,
    configuration,
    compatibility,
    metadata
) VALUES (
    'high-capacity-64-locker',
    'High-Capacity 64-Locker Setup',
    'Large installation with four Waveshare 16-channel cards supporting 64 lockers in an 8x8 grid layout.',
    '1.0.0',
    'system',
    '["high-capacity", "64-locker", "quad-card", "enterprise", "large-scale"]',
    '{
        "hardware": {
            "modbus": {
                "port": "/dev/ttyUSB0",
                "baudrate": 9600,
                "timeout_ms": 2000,
                "pulse_duration_ms": 500,
                "command_interval_ms": 150,
                "max_retries": 3,
                "use_multiple_coils": false,
                "verify_writes": true
            },
            "relay_cards": [
                {
                    "slave_address": 1,
                    "channels": 16,
                    "type": "waveshare_16ch",
                    "dip_switches": "00000001",
                    "description": "Locker Bank 1-16",
                    "enabled": true
                },
                {
                    "slave_address": 2,
                    "channels": 16,
                    "type": "waveshare_16ch",
                    "dip_switches": "00000010",
                    "description": "Locker Bank 17-32",
                    "enabled": true
                },
                {
                    "slave_address": 3,
                    "channels": 16,
                    "type": "waveshare_16ch",
                    "dip_switches": "00000011",
                    "description": "Locker Bank 33-48",
                    "enabled": true
                },
                {
                    "slave_address": 4,
                    "channels": 16,
                    "type": "waveshare_16ch",
                    "dip_switches": "00000100",
                    "description": "Locker Bank 49-64",
                    "enabled": true
                }
            ]
        },
        "lockers": {
            "total_count": 64,
            "reserve_ttl_seconds": 300,
            "layout": {
                "rows": 8,
                "columns": 8,
                "numbering_scheme": "sequential"
            },
            "auto_release_hours": 24,
            "maintenance_mode": false
        }
    }',
    '{
        "min_version": "1.0.0",
        "hardware_requirements": ["modbus_rtu", "serial_port", "waveshare_16ch", "high_capacity"]
    }',
    '{
        "total_lockers": 64,
        "total_cards": 4,
        "card_types": ["waveshare_16ch"],
        "layout_type": "sequential"
    }'
);

-- Log the creation of default templates
INSERT INTO template_usage_log (template_id, action, user_id, details) VALUES
('default-16-locker-single-card', 'created', 'system', '{"type": "default_template", "auto_created": true}'),
('default-32-locker-dual-card', 'created', 'system', '{"type": "default_template", "auto_created": true}'),
('development-test-setup', 'created', 'system', '{"type": "default_template", "auto_created": true}'),
('high-capacity-64-locker', 'created', 'system', '{"type": "default_template", "auto_created": true}');