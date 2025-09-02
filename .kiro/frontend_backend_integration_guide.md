# Frontend–Backend Integration Guide

## 1. Panels and Active Services

| Panel / Client | UI Location | Uses Services | Purpose |
|---|---|---|---|
| Kiosk Panel | http://<pi>:3002 | Kiosk API, Gateway (read-only), SQLite via Kiosk | End‑user flows with RFID and locker control |
| Admin Panel | http://<pi>:3001 | Panel API, Gateway admin API, SQLite | Staff management, monitoring, config, manual open |
| External Admin (optional) | Browser from LAN/VPN | Gateway admin API | Centralized API access and automation |

Notes.
- Kiosk only the kiosk service talks to hardware and serial.
- Panel reads DB and calls gateway for cross‑service actions.
- Gateway aggregates APIs and coordinates kiosk actions.

## 2. Frontend Fetch Patterns

### 2.1 Authenticated fetch (Panel)
```ts
// keep cookies for session auth
const r = await fetch('/api/admin/lockers', { credentials: 'include' });
if (!r.ok) throw new Error('Failed');
const data = await r.json();
```

### 2.2 Kiosk action flow
```ts
// user chose a locker after RFID session exists in kiosk
await fetch('/api/lockers/select', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rfid, locker_id })
});
```

### 2.3 Admin open locker via Gateway
```ts
await fetch('/api/admin/lockers/5/open', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ reason: 'assist user' })
});
```

### 2.4 Polling locker status (simple)
```ts
async function pollLockers(setter: (x:any)=>void) {
  const r = await fetch('/api/admin/lockers', { credentials: 'include' });
  const data = await r.json();
  setter(data);
  setTimeout(() => pollLockers(setter), 1500);
}
```

## 3. React Examples

### 3.1 Admin Dashboard list
```tsx
import { useEffect, useState } from 'react';

type Locker = { locker_id:number; status:string; owner_key?:string };

export default function LockersAdmin() {
  const [lockers, setLockers] = useState<Locker[]>([]);
  const load = async () => {
    const r = await fetch('/api/admin/lockers', { credentials: 'include' });
    if (!r.ok) return;
    const data = await r.json();
    setLockers(data.lockers);
  };
  useEffect(() => { load(); const t = setInterval(load, 2000); return () => clearInterval(t); }, []);
  const openLocker = async (id:number) => {
    await fetch(`/api/admin/lockers/${id}/open`, {
      method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ reason: 'admin open' })
    });
    load();
  };
  return (
    <div>
      <h2>Lockers</h2>
      <ul>
        {lockers.map(l => (
          <li key={l.locker_id}>
            #{l.locker_id} · {l.status} {l.owner_key ? `· ${l.owner_key}` : ''}
            <button onClick={() => openLocker(l.locker_id)}>Open</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### 3.2 Kiosk Select Locker screen
```tsx
import { useEffect, useState } from 'react';

export default function KioskSelect({ rfid }:{ rfid:string }) {
  const [free, setFree] = useState<number[]>([]);
  useEffect(() => { (async () => {
    const r = await fetch('/api/kiosk/free-lockers');
    const data = await r.json();
    setFree(data.ids);
  })(); }, []);

  const choose = async (locker_id:number) => {
    const r = await fetch('/api/lockers/select', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ rfid, locker_id })
    });
    const res = await r.json();
    if (res.ok) window.location.href = '/opened';
  };

  return (
    <div>
      <h1>Choose Locker</h1>
      <div>
        {free.map(id => (
          <button key={id} onClick={() => choose(id)}>#{id}</button>
        ))}
      </div>
    </div>
  );
}
```

## 4. Route Map by Panel

### 4.1 Kiosk Panel (Service: Kiosk)
- GET `/` kiosk UI shell.
- GET `/api/kiosk/free-lockers` list of free lockers.
- POST `/api/rfid/session` create or resume session after RFID keystrokes.
- POST `/api/lockers/select` assign and open locker.
- POST `/api/master/verify-pin` verify master.
- POST `/api/master/open-locker` open by override.

### 4.2 Admin Panel (Service: Panel + Gateway)
- GET `/login` form. POST `/login` create session.
- GET `/dashboard` SSR. Uses fetch `/api/admin/lockers`.
- GET `/users` list staff. POST `/users/create` add user.
- POST `/api/admin/lockers/:id/open` open via Gateway → Kiosk.
- POST `/api/configuration/deploy` deploy config via Gateway.
- GET `/hardware-config` tools page (panel‑local hardware test endpoints if enabled).

### 4.3 External Admin / Scripts (Service: Gateway)
- GET `/api/admin/lockers`
- POST `/api/admin/lockers/:id/open`
- POST `/api/configuration/packages`
- POST `/api/configuration/deploy`

## 5. State and Caching on Client
- Keep session cookie. Use `credentials: 'include'` on admin requests.
- Debounce user clicks. Prevent duplicate open calls.
- Poll every 1–2 s on dashboards, or switch to SSE/WebSocket when added.

## 6. Error Handling UX
- 401. Redirect to /login.
- 403. Show “Not allowed”.
- 409. Show “Locker changed state. Refresh.”
- 503. Show “Device busy. Try again.” Add retry button.

## 7. CORS and Origins
- Admin and Gateway on same origin. No CORS needed in-panel.
- If calling Gateway from another origin, enable CORS for that origin.

## 8. Build and Paths
- Serve static React build from Panel and Kiosk services.
- Prefix admin API with `/api/admin/*`.
- Prefix kiosk API with `/api/*`.

## 9. Local Dev Setup
- Panel at http://localhost:3001
- Kiosk at http://localhost:3002
- Gateway at http://localhost:3000
- Set `EFORM_DB_PATH` to a temp dev DB. Seed lockers.

## 10. Quick E2E Flow
1. Admin logs in on Panel.
2. Dashboard polls `/api/admin/lockers`.
3. User scans card at Kiosk. Kiosk creates session.
4. User selects locker. Kiosk opens it and writes DB.
5. Panel shows status change on next poll.
6. Admin can open a locker via Gateway when needed.

## 11. Minimal SSR example (Panel)
```ts
// fastify route example
fastify.get('/dashboard', async (req, reply) => {
  const r = await fetch(process.env.GATEWAY_BASE_URL + '/api/admin/lockers', {
    headers: { cookie: req.headers.cookie || '' }
  });
  const data = await r.json();
  return reply.view('/views/dashboard.ejs', { lockers: data.lockers });
});
```

## 12. Security on Frontend
- Never store passwords in localStorage.
- Use HttpOnly cookies for admin sessions.
- Hide master flows behind PIN and short‑lived tokens.

## 13. Service Responsibilities Matrix

| Feature | Kiosk | Panel | Gateway |
|---|---|---|---|
| RFID ingest | ✓ |  |  |
| Relay control | ✓ | (Fallback tools) |  |
| Locker assign/open | ✓ | ✓ (via Gateway) | ✓ (routes) |
| Staff auth |  | ✓ |  |
| Config deploy |  | ✓ | ✓ |
| Audit log write | ✓ | ✓ | ✓ |
| Health/heartbeat | ✓ | ✓ | ✓ |

This guide shows how each frontend talks to the backend services with code examples, route maps, and clear responsibilities. Hook these examples into your actual route names for a 1:1 implementation.

