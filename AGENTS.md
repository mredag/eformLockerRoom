# eForm Locker System - Repository Guidelines

## Project Structure & Module Organization

- **`app/gateway`** (Port 3000): Main API coordinator, handles admin requests and authentication
- **`app/kiosk`** (Port 3002): Hardware control service, manages Modbus RTU communication and RFID sessions
- **`app/panel`** (Port 3001): Admin web interface with Turkish UI, direct relay control and locker management
- **`app/agent`** (Optional): Background task processing, updates, and automation
- **`shared`**: TypeScript shared libraries (database repos, services, i18n, performance monitoring)
- **`scripts`**: deployment, maintenance, testing, emergency procedures, and Pi management utilities
- **`migrations`**: SQL schema files for SQLite database evolution (applied via migration runner)
- **`config`**: environment JSON configurations (`development.json`, `production.json`, `system.json`)
- **`tests/integration`**: cross-service integration tests, accessibility validation, Turkish language tests
- **`docs`**: comprehensive documentation including Pi setup, performance monitoring, troubleshooting guides
- **`.kiro/steering`**: AI assistant context and development guidelines

## Build, Test, and Development Commands

- **Install**: `npm run install-all` (root + workspaces)
- **Build all/workspace**: `npm run build` / `npm run build:<gateway|kiosk|panel|agent|shared>`
- **Dev (watch)**: `npm run dev:<gateway|kiosk|panel|agent>`
- **Start (built)**: `npm run start:<gateway|kiosk|panel|agent>`
- **Tests**: `npm test` (all) or `npm run test --workspace=app/gateway`
- **E2E**: `npm run test:e2e:full` (Linux/macOS) or `npm run test:e2e:full:windows`
- **Provisioning & config**: `npm run provision`, `npm run config-test`, `npm run config:validate`
- **Migrations**: `npm run migrate`, `npm run migrate:status`, `npm run migrate:verify`

### Hardware & System Testing

- **Hardware test**: `node scripts/test-basic-relay-control.js`
- **Multi-relay test**: `node scripts/test-relays-1-8.js`
- **Emergency controls**: `node scripts/emergency-relay-reset.js`
- **Service management**: `./scripts/start-all-clean.sh`
- **Health monitoring**: `./scripts/health-check-kiosk.sh`
- **Database checks**: `node scripts/database-health-check.js`

### Maintenance & Deployment

- **Daily maintenance**: `.\scripts\maintenance\daily-routine.ps1 -Quick` (Windows)
- **Repository health**: `bash scripts/maintenance/repository-health-check.sh`
- **Pi deployment**: `.\scripts\deployment\smart-pi-manager.ps1` (Windows)
- **Multi-Pi management**: `.\scripts\deployment\manage-all-pis.ps1`

## Coding Style & Naming Conventions

- **Language**: TypeScript (Node 20+ at root). Use 2‑space indentation
- **Files**: kebab-case (`locker-state-manager.ts`); classes PascalCase; vars/functions camelCase; constants UPPER_SNAKE
- **File naming rules**: Max 50 characters, no spaces, descriptive names
- **Prefer named exports** in `shared/*`; avoid module side effects—use `src/index.ts` as entry points
- **Keep Fastify routes/controllers thin**; push logic into `shared/services/*` and database repos
- **Data consistency**: Database uses English status values (`Free`, `Owned`, `Opening`, `Error`, `Blocked`)
- **UI localization**: Turkish display mapping via i18n service (`Free` → `Boş`, `Owned` → `Dolu`)
- **CSS classes**: Turkish-based (`.state-bos`, `.state-dolu`, `.state-aciliyor`)
- **Hardware mapping**: Locker ID → Card/Relay calculation for Modbus RTU communication

## Testing Guidelines

- **Frameworks**: Vitest for gateway/kiosk/panel/shared; Jest for agent
- **Unit tests**: `*.test.ts` adjacent to code or under `__tests__`
- **Integration**: `tests/integration/*.test.ts` (multi-service, RFID, accessibility, Turkish language)
- **Run**: `npm test`, or `npm run test --workspace=<pkg>`, or `npm run test:watch` where supported
- **Add tests for new logic**, mock hardware/IO, and avoid real DB writes in unit tests
- **Hardware testing**: Use dedicated scripts for Modbus RTU and relay control validation
- **Accessibility**: Comprehensive WCAG compliance testing with automated reports
- **Performance**: Monitor response times, memory usage, and system resource consumption
- **Multi-language**: Validate Turkish character support and UI translation accuracy
- **RFID sessions**: Test multi-user card management (no automatic timeout)

## Commit & Pull Request Guidelines

- **Conventional commits**: `feat(scope): …`, `fix(scope): …`, `docs: …`, `chore: …`, `style(scope): …`
  - Example: `feat(kiosk): add RFID session management without automatic timeout`
  - Example: `fix(modbus): resolve CRC16 calculation for relay control`
- **PRs**: clear description, linked issue, screenshots/logs for UI/CLI, test notes, and call out config/migration changes
- **Pre-commit validation**: Git hooks automatically run quality checks and file organization validation
- **Ensure** `npm run build` and `npm test` pass locally before requesting review
- **Hardware changes**: Include test results from relay control scripts
- **UI changes**: Include accessibility audit results and Turkish translation validation
- **Performance impact**: Document any changes affecting system resource usage

## Security & Configuration Tips

- **Do not commit secrets**. Manage env via `config/*.json` and setup scripts (`npm run config:setup-dev`, `npm run config:validate`)
- **Apply DB changes** through `migrations/*.sql`; run migrations and commit the SQL alongside related code
- **Hardware security**: USB-RS485 adapter access requires proper permissions (`chmod 666 /dev/ttyUSB0`)
- **Network security**: Services run on specific ports (3000, 3001, 3002) with authentication where required
- **RFID data**: Card IDs stored securely with session-based access control
- **Admin authentication**: Panel service requires proper credentials for web interface access
- **Pi access**: SSH key-based authentication recommended for production deployment

## Hardware & System Architecture

- **Target Platform**: Raspberry Pi 5 with USB-RS485 adapter
- **Relay Control**: Waveshare relay cards via Modbus RTU protocol
- **RFID Reader**: Sycreader USB RFID (HID keyboard mode)
- **Serial Communication**: `/dev/ttyUSB0` (9600 baud, 8N1)
- **Modbus Protocol**: Custom CRC16 calculation, Function Code 0x05 (Write Single Coil)
- **Hardware Mapping**: Locker ID → Card/Relay calculation (16 relays per card)

## Production Environment

- **Development**: Windows PC
- **Production**: Raspberry Pi at `192.168.1.8`
- **SSH Access**: `ssh pi@pi-eform-locker` (passwordless)
- **Service URLs**:
  - Gateway: `http://192.168.1.10:3000` (API coordinator)
  - Panel: `http://192.168.1.10:3001` (Admin interface)
  - Kiosk: `http://192.168.1.10:3002` (User interface)

## Key Features & Capabilities

- **Multi-User RFID**: Session-based card management (no automatic timeout)
- **Real-time Hardware Control**: Direct relay activation via Modbus RTU
- **Turkish Localization**: Complete UI translation with character support
- **Performance Monitoring**: System resource tracking and health checks
- **Locker Naming**: Custom display names with Turkish character support
- **Accessibility Compliance**: WCAG-compliant interface design
- **Fault Tolerance**: Automatic service recovery and error handling

## Zone Features (Zones MVP)

- **Overview**: Zone-aware locker management that groups lockers into logical zones (e.g., mens, womens, floors), enabling per‑zone filtering in UIs and zone‑aware hardware mapping. Backward compatible when zones are disabled.
- **Config keys** (`config/system.json`):
  - `features.zones_enabled: boolean`
  - `zones[]`: `{ id: string, name?: string, enabled: boolean, ranges: [start, end][], relay_cards: number[] }`
  - Ranges are inclusive. Each 16 positions in a zone map to one relay card in `relay_cards` (position→cardIndex=floor((pos-1)/16), coil=((pos-1)%16)+1).
- **Core logic locations**:
  - `shared/services/zone-helpers.ts`: `getLockerPositionInZone`, `computeHardwareMappingFromPosition`, `getZoneAwareHardwareMapping`, `getLockersInZone`, `validateZoneConfiguration`.
  - `shared/services/locker-layout-service.ts`: zone‑aware layout generation with optional `zoneId` parameter; defaults preserve previous behavior when omitted.
- **API & UI usage**:
  - Kiosk/Gateway endpoints accept optional `zone` query (e.g., `?zone=mens`) to return only lockers in that zone; no parameter returns all.
  - Panel and kiosk UIs may request layouts per zone to render zone‑specific tiles/screens.
- **Automatic zone extension**:
  - When new relay cards are added in hardware config, the last active zone can automatically extend to cover new lockers; database sync creates missing lockers accordingly. Validation, backup, and logging are required before applying.
- **Testing**:
  - Unit/integration: validate position→hardware mapping, zone filtering, and config validation.
  - Local scripts: `node test-zone-features.js` (repo root) for helper and integration smoke checks. For Pi, use `test-zone-features-pi.js`.
- **Operational notes**:
  - Restart services after changing `system.json` zones: `./scripts/start-all-clean.sh` (on Pi).
  - Keep zones disabled in config for legacy behavior or during staged rollout.

## Repository Maintenance System

- **Automated Cleanup**: Daily removal of temporary files and artifacts
- **Health Monitoring**: Repository organization and compliance checking
- **Git Hooks**: Pre-commit quality gates and file organization validation
- **Scheduled Maintenance**: Windows Task Scheduler integration
- **File Organization**: Automated placement and naming validation
- **Quality Gates**: Prevent repository degradation through automated checks

## Emergency Procedures

- **Relay Reset**: `node scripts/emergency-relay-reset.js`
- **Service Recovery**: `./scripts/start-all-clean.sh`
- **Database Repair**: `node scripts/fix-corrupted-database.js`
- **Port Conflicts**: `sudo lsof /dev/ttyUSB0` and `sudo killall node`
- **Hardware Debug**: `node scripts/test-basic-relay-control.js`

## Documentation Structure

- **`docs/DEPLOYMENT_README.md`**: Complete deployment guide
- **`docs/performance-monitoring-guide.md`**: System monitoring procedures
- **`docs/kiosk-troubleshooting-guide.md`**: Hardware troubleshooting
- **`docs/pi-configuration-guide.md`**: Raspberry Pi setup
- **`docs/REPOSITORY_MAINTENANCE_GUIDE.md`**: Maintenance procedures
- **`RASPBERRY_PI_STARTUP_SYSTEM_COMPLETE.md`**: Startup automation
- **`SYSTEM_DOCUMENTATION.md`**: Complete system overview
