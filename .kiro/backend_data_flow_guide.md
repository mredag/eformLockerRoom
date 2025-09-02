# Backend Data Flow Guide

## 1. Overview
The backend runs three Fastify services on the Raspberry Pi.

- Gateway (3000). Public admin API and service router.
- Panel (3001). Admin web app API and SSR pages.
- Kiosk (3002). Kiosk API and UI. Talks to hardware.

All services share one SQLite database file.

## 2. Lifecycle: Request to Data
1. Client sends HTTP request.
2. Target service authenticates the request.
3. Service validates input.
4. Service reads or writes SQLite.
5. Service triggers side effects if needed (relay, session, config deploy).
6. Service returns JSON or HTML.

## 3. Data Sources
- SQLite (file eform.db). Single source of truth.
- Hardware via serial RS485 (kiosk only).
- In‑memory session cache (kiosk).
- Config packages (stored in DB and disk).

## 4. Environment Variables
- EFORM_DB_PATH. Absolute path to eform.db.
- GATEWAY_BASE_URL, PANEL_BASE_URL, KIOSK_BASE_URL. Service routing.
- PROVISIONING_SECRET. HMAC for kiosk registration.
- SESSION_SECRET. Cookie/session signing.
- RATE_LIMIT_* values. Throttling.
- SERIAL_PORT. e.g. /dev/ttyUSB0 for Waveshare.

## 5. Core Models (DB)
- lockers: kiosk_id, locker_id, status, owner_key, reserved_at, owned_at, is_vip.
- staff_users: id, username, pass_hash, role, status, pin_expires_at, last_login_at.
- config_packages: id, version, sha256, created_at, payload.
- kiosk_status: kiosk_id, last_heartbeat_at, version.
- audit_logs: id, ts, actor, action, details.

## 6. Gateways and Fetching Paths
### 6.1 Admin actions (through Gateway)
- POST /api/admin/lockers/:id/open → Gateway → Kiosk → Modbus relay → DB update.
- GET /api/admin/lockers → Gateway → DB read → JSON list.
- POST /api/configuration/deploy → Gateway → write package → notify kiosks.

### 6.2 Panel direct reads
- GET /lockers (HTML) → Panel reads DB → server‑renders status table.
- POST /login → Panel checks staff_users → sets session cookie.

### 6.3 Kiosk user flow
- POST /api/rfid/session → Kiosk verifies/creates session in memory and DB.
- POST /api/lockers/select → Kiosk writes ownership → pulses relay.
- POST /api/master/open-locker → Kiosk checks PIN → pulses relay.

## 7. API Contracts (JSON)
### 7.1 Locker status
- Request: GET /api/admin/lockers
- Response:
```
{
  "kiosk_id": 1,
  "lockers": [
    {"locker_id": 5, "status": "Owned", "owner_key": "1234567890", "owned_at": "2025-09-02T10:21:00Z"},
    {"locker_id": 6, "status": "Free"}
  ]
}
```

### 7.2 Open locker (admin)
- Request: POST /api/admin/lockers/5/open
```
{ "reason": "user forgot" }
```
- Response:
```
{ "ok": true, "pulsed_ms": 500 }
```

### 7.3 Select locker (kiosk)
- Request: POST /api/lockers/select
```
{ "rfid": "1234567890", "locker_id": 8 }
```
- Response:
```
{ "ok": true, "status": "Owned", "locker_id": 8 }
```

### 7.4 Master PIN verify
- Request: POST /api/master/verify-pin
```
{ "pin": "****" }
```
- Response:
```
{ "ok": true, "token": "master-session" }
```

## 8. Auth and Sessions
- Panel uses cookie sessions. Fastify session plugin with SESSION_SECRET.
- Gateway admin endpoints expect a valid panel session or admin token.
- Kiosk uses RFID as identity. Stores active sessions in memory with TTL.
- Master PIN creates a short‑lived master session token on kiosk.

## 9. Data Fetching Patterns
- Reads: parameterized SQL with prepared statements.
- Writes: transaction per critical change (assign, release, deploy).
- Concurrency: SQLite WAL. Keep operations short. Avoid long transactions.
- Caching: kiosk holds hot session state and latest locker map in memory.
- Consistency: always update DB before pulsing relay if ownership changes.

## 10. Hardware I/O Flow (Kiosk)
1. Build Modbus frame for target relay.
2. Open serial port once at boot. Keep handle.
3. Write frame. Wait for ACK.
4. On success, return { ok: true }.
5. On CRC or I/O error, log and return { ok: false, error }.

## 11. Validation and Errors
- Use schema validators for each route.
- Return 400 for invalid input.
- Return 401/403 on auth errors.
- Return 409 on locker state conflicts.
- Return 503 on hardware unavailable.
- Log every 4xx/5xx with correlation id.

## 12. Rate Limiting
- Per IP and per route limits at Gateway and Kiosk.
- Per RFID operation limits to prevent abuse.

## 13. Logging and Audit
- Structured logs: ts, service, route, actor, action, result, latency.
- Audit events: login, open_locker, assign_locker, config_deploy, master_override.
- Persist audit to DB. Rotate service logs daily.

## 14. Configuration Deploy Flow
1. Panel creates package → Gateway stores with sha256.
2. Admin triggers deploy.
3. Gateway marks new version active.
4. Kiosk polls or receives notify. Downloads package.
5. Kiosk verifies sha256. Applies. Writes version to DB.
6. On failure, kiosk rolls back and reports.

## 15. Startup Sequence
1. Load env. Verify EFORM_DB_PATH.
2. Migrate DB schema if needed.
3. Open SQLite with WAL.
4. Kiosk: open serial. Map relays. Self test.
5. Start Fastify servers. Register routes.
6. Announce health on /health.

## 16. Security Controls
- Argon2id or bcrypt for staff passwords.
- HttpOnly, Secure cookies.
- CSRF on Panel form posts.
- HMAC tokens for provisioning.
- Input sanitization. Output escaping for SSR.

## 17. Service‑to‑Service Calls
- Gateway → Kiosk. HTTP with internal base URLs.
- Gateway → Panel. Minimal, for SSR assets.
- Retry policy: 3 tries, backoff 100/250/500 ms.
- Timeouts: 2 s for reads, 5 s for actions.

## 18. Health and Metrics
- /health returns { ok, version, uptime }.
- Counters: requests, errors, relay_pulses, rfid_scans.
- Gauges: active_sessions, db_connections.

## 19. Backup and Recovery
- Nightly SQLite backup to /var/backups/eform-YYYYMMDD.db.
- On boot, if DB missing, restore latest backup.
- Test restore weekly.

## 20. Testing Checklist
- Unit: SQL repos, validators, auth.
- Integration: assign/open/release flows.
- Hardware: relay pulse ack, CRC fail path.
- Security: auth bypass attempts, rate limits.
- Regression: session loss, dual DB path, serial lock.

## 21. Example SQL
```
-- Get visible lockers
SELECT locker_id, status, owner_key, owned_at
FROM lockers
WHERE kiosk_id = ?
ORDER BY locker_id;

-- Assign locker
BEGIN;
UPDATE lockers
SET status = 'Owned', owner_key = ?, owned_at = CURRENT_TIMESTAMP
WHERE kiosk_id = ? AND locker_id = ? AND status = 'Free';
SELECT changes() AS rows;
COMMIT;
```

## 22. Frontend Fetch Examples
- Panel JS fetch
```
const r = await fetch('/api/admin/lockers', { credentials: 'include' });
const data = await r.json();
```
- Kiosk UI fetch
```
await fetch('/api/lockers/select', {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ rfid, locker_id })
});
```

## 23. Deployment Notes
- Build each service with esbuild. Output to dist/.
- Systemd units manage services. Restart=on-failure.
- Log to journald and service log files.

## 24. Constraints to Respect in Redesign
- Do not change DB schema without migration.
- Do not access serial from Panel.
- Keep API routes stable. Add new routes with versioning if needed.
- Keep EFORM_DB_PATH identical across services.

## 25. Glossary
- RFID. Card identifier used as user key.
- Relay pulse. Timed activation to open a locker.
- WAL. SQLite write‑ahead logging mode.
- Provisioning. Secure kiosk registration.

