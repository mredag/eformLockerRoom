# Backend Architecture and Data Flow Documentation

## 1. Backend Overview
The backend of the eForm Locker System is built with **Node.js (Fastify framework)** and designed as a **microservice cluster**. Each service runs independently, but they communicate with each other and share a common SQLite database.

### Services Recap
- **Gateway Service**: Central API router.
- **Kiosk Service**: User interaction and hardware control.
- **Panel Service**: Admin web dashboard.

---

## 2. Database Access
The backend uses **SQLite** as the primary data store.

- All services connect to the same `eform.db` file.
- SQLite runs in **WAL (Write-Ahead Logging)** mode for safe concurrent access.
- Access is managed through the `DatabaseManager` utility in the `shared/` directory.
- Tables include:
  - `lockers`
  - `staff_users`
  - `sessions`
  - `logs`

### Fetching Data
- **Read Queries**: Services use SQL SELECT statements to fetch data directly from `eform.db`.
- **Write Queries**: Insert, update, and delete statements are executed with transaction safety.
- **Triggers**: Automatic timestamp updates on locker state changes.

---

## 3. API Communication
All data fetching in the backend is exposed via **RESTful endpoints**.

### Gateway Service Endpoints
- `/api/admin/lockers` → Fetches locker status list (reads from `lockers` table).
- `/api/admin/open-locker/:id` → Calls kiosk service to open a locker.
- `/api/configuration/*` → Fetch and deploy system configuration.

### Kiosk Service Endpoints
- `/api/rfid/session` → Creates session for scanned card.
- `/api/lockers/select` → Assigns locker to user (updates DB).
- `/api/master/verify-pin` → Validates master PIN.
- `/api/master/open-locker` → Opens locker by override.

### Panel Service Endpoints
- `/login` → Authenticates admin (queries `staff_users`).
- `/dashboard` → Fetches locker and system status.
- `/users/create` → Inserts new staff user into DB.
- `/hardware-config` → Direct relay control endpoints.

---

## 4. Data Flow Example: RFID User
1. RFID card scanned → Kiosk service captures ID.
2. Kiosk service queries DB for existing session.
   - If found → locker info returned, relay triggered.
   - If not found → kiosk presents locker options.
3. User selects locker → kiosk updates DB (`lockers.status = Owned`, `owner_key = RFID_ID`).
4. Relay command sent to hardware.
5. DB updated → gateway and panel reflect new state.

---

## 5. Data Flow Example: Admin Panel
1. Admin logs in → `/login` checks `staff_users` table.
2. Panel dashboard queries gateway → gateway fetches from DB.
3. Admin opens locker → `/api/admin/open-locker/:id` triggers gateway.
4. Gateway forwards to kiosk → kiosk activates relay and updates DB.
5. Updated locker state immediately visible in panel.

---

## 6. Shared Utilities
- **Logging**: Centralized log system writes per-service logs.
- **i18n**: Language support loaded by kiosk and panel for UI.
- **Sessions**: In-memory + DB persistence.
- **Security**: Middleware checks tokens, session cookies, and HMAC signatures for provisioning.

---

## 7. External Integrations
- External enterprise systems fetch locker and usage data through Gateway endpoints.
- Outbound HTTP requests (integration adapters) push logs and usage to third-party APIs.

---

## 8. Backend Data Fetching Principles
- Services never bypass the DB directly from UI.
- Data always flows: **Frontend → Backend Endpoint → DB → Response**.
- Hardware operations always go through kiosk APIs.
- Gateway acts as the API aggregator to maintain consistency.

---

This documentation explains in detail how the backend works, how services fetch and process data, and how flows move between UI, APIs, database, and hardware.

