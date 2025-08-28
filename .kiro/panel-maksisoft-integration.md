docs/panel-maksisoft-integration.md
Purpose

Search a Maksisoft member by RFID on the panel lockers page. Add a button to each locker card. The panel server calls Maksisoft. The browser shows a modal with the result.

Why we add this

Speed up staff workflow on the lockers page.
Avoid CORS by calling Maksisoft from the server.
Keep Maksisoft cookies and credentials on the server.
Keep the feature optional with one flag.
Auto refresh the session cookie when it expires.

Flow

Operator clicks the new button on a locker card.

Browser calls GET /api/maksi/search-by-rfid?rfid=... on the panel server.

Server sends GET https://eformhatay.maksionline.com/react-system/api_php/user_search/users.php?text=<RFID>&criteria=<N>.

Server includes a valid session cookie. If invalid, server logs in and retries once.

Server returns JSON.

Browser shows a modal and a link to the profile page.

Sample response from Maksisoft
[
  {
    "id": 1026,
    "name": "",
    "phone": "",
    "type": 0,
    "sex": "Bay",
    "gsm": "0(506)7070403",
    "photo": "86f874b99c.jpg",
    "checkListDate": "2019-04-20 16:38",
    "checkListStatus": "out",
    "endDate": "2019-11-05",
    "proximity": "0006851540",
    "tc": "5125******"
  }
]

Configuration

Add these to the panel service environment. Do not commit secrets.

MAKSI_BASE=https://eformhatay.maksionline.com
MAKSI_SEARCH_PATH=/react-system/api_php/user_search/users.php
MAKSI_CRITERIA_FOR_RFID=0

# optional bootstrap cookie to start faster
MAKSI_BOOTSTRAP_COOKIE=PHPSESSID=...; AC-C=ac-c

# auto login settings
MAKSI_LOGIN_URL=https://eformhatay.maksionline.com/ceo/login.php
MAKSI_LOGIN_FORM_JSON={"username":"admin","password":"972257"}

MAKSI_ENABLED=true


MAKSI_CRITERIA_FOR_RFID should match the value you saw for the target search filter. Use the value for Kart if you want strict card matching.

Server code
Types and mapper

Create app/panel/src/services/maksi.ts.

export type MaksiHit = {
  id: number;
  name: string;
  phone: string;
  type: number;
  sex: string;
  gsm: string;
  photo: string;
  checkListDate: string;
  checkListStatus: string;
  endDate: string;
  proximity: string;
  tc: string;
};

export type MaksiUser = {
  id: number;
  fullName: string | null;
  phone: string | null;
  rfid: string;
  gender: string | null;
  membershipType: number | null;
  membershipEndsAt: string | null;
  lastCheckAt: string | null;
  lastCheckStatus: string | null;
  tcMasked: string | null;
  photoFile: string | null;
};

export function mapMaksi(hit: MaksiHit): MaksiUser {
  return {
    id: hit.id,
    fullName: hit.name?.trim() || null,
    phone: (hit.phone || hit.gsm || "").trim() || null,
    rfid: hit.proximity,
    gender: hit.sex || null,
    membershipType: Number.isFinite(hit.type) ? hit.type : null,
    membershipEndsAt: hit.endDate || null,
    lastCheckAt: hit.checkListDate || null,
    lastCheckStatus: hit.checkListStatus || null,
    tcMasked: hit.tc || null,
    photoFile: hit.photo || null,
  };
}

Auto session manager

Create app/panel/src/services/maksi-session.ts.

// Node 18+
// npm i set-cookie-parser
import setCookie from 'set-cookie-parser';

const BASE = process.env.MAKSI_BASE!;
const LOGIN_URL = process.env.MAKSI_LOGIN_URL!;
const SEARCH_URL = `${BASE}${process.env.MAKSI_SEARCH_PATH!}`;
const CRITERIA = process.env.MAKSI_CRITERIA_FOR_RFID || '0';

let cookie = process.env.MAKSI_BOOTSTRAP_COOKIE || '';
let lastLogin = 0;
let loggingIn: Promise<void> | null = null;

function mergeSetCookie(headers: Headers): string {
  const raw = (headers as any).getSetCookie?.() || headers.get('set-cookie') || [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const parsed = setCookie.parse(arr, { map: false });
  const jar: Record<string,string> = {};
  for (const c of parsed) jar[c.name] = c.value;
  return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
}

async function login() {
  const formJson = process.env.MAKSI_LOGIN_FORM_JSON || '{}';
  const fields = JSON.parse(formJson) as Record<string, string>;
  const body = new URLSearchParams(fields);

  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual',
  });

  const set = mergeSetCookie(res.headers);
  if (!set) throw new Error('login_no_set_cookie');
  cookie = set;
  lastLogin = Date.now();
}

function looksLikeLogin(res: Response, ct: string | null) {
  if (res.status === 401 || res.status === 403 || res.status === 302) return true;
  if (ct && !ct.includes('application/json')) return true;
  return false;
}

async function withSession(url: string, init: RequestInit = {}, expectJson = true) {
  const baseHeaders: Record<string, string> = { ...(init.headers as any) };
  if (cookie) baseHeaders['Cookie'] = cookie;
  baseHeaders['Accept'] = expectJson ? 'application/json' : '*/*';

  let res = await fetch(url, { ...init, headers: baseHeaders, redirect: 'manual' });
  let ct = res.headers.get('content-type');

  if (looksLikeLogin(res, ct)) {
    if (!loggingIn) loggingIn = login().finally(() => { loggingIn = null; });
    await loggingIn;
    const retryHeaders: Record<string, string> = { ...(init.headers as any), Cookie: cookie, Accept: baseHeaders['Accept'] };
    res = await fetch(url, { ...init, headers: retryHeaders, redirect: 'manual' });
    ct = res.headers.get('content-type');
  }

  return { res, ct };
}

export async function maksiSearchRFID(rfid: string, criteria = CRITERIA) {
  const url = `${SEARCH_URL}?text=${encodeURIComponent(rfid)}&criteria=${criteria}`;
  const { res, ct } = await withSession(url, {}, true);
  if (!res.ok) throw new Error(`maksi_${res.status}`);
  if (!ct || !ct.includes('application/json')) {
    const peek = (await res.text()).slice(0, 200);
    throw new Error(`unexpected_content_type ${ct || 'none'} ${peek}`);
  }
  return res.json();
}

Search wrapper

Extend app/panel/src/services/maksi.ts.

import { maksiSearchRFID } from './maksi-session';
import type { MaksiHit } from './maksi';
import { mapMaksi } from './maksi';

export async function searchMaksiByRFID(rfid: string) {
  if (process.env.MAKSI_ENABLED !== "true") return { hits: [], disabled: true };
  const raw = await maksiSearchRFID(rfid) as MaksiHit[];
  const hits = Array.isArray(raw) ? raw.map(mapMaksi) : [];
  return { hits };
}

API route

Add to the panel server entry, for example app/panel/src/index.ts.

import { searchMaksiByRFID } from "./services/maksi";

fastify.get("/api/maksi/search-by-rfid", async (req, reply) => {
  const rfid = (req.query as any).rfid?.toString().trim();
  if (!rfid) return reply.code(400).send({ error: "missing_rfid" });

  try {
    const result = await searchMaksiByRFID(rfid);
    return { success: true, ...result };
  } catch (e: any) {
    return reply.code(502).send({ success: false, error: e.message });
  }
});

Optional throttle
const seen = new Map<string, number>();
fastify.addHook("preHandler", (req, reply, done) => {
  if (req.url.startsWith("/api/maksi/search-by-rfid")) {
    const rfid = (req.query as any).rfid || "";
    const key = `${req.ip}:${rfid}`;
    const last = seen.get(key) || 0;
    const now = Date.now();
    if (now - last < 1000) return reply.code(429).send({ error: "too_many_requests" });
    seen.set(key, now);
  }
  done();
});

UI changes

Add a button to every locker card template used on /lockers.

<button
  class="btn btn-secondary btn-maksi"
  data-locker-id="{{locker.id}}"
  data-owner-rfid="{{locker.owner?.rfid || ''}}"
>
  Maksisoft
</button>


Create app/panel/src/public/js/lockers.js. Load it on the page.

<script src="/js/lockers.js" defer></script>


lockers.js:

(function(){
  function q(sel, el=document){ return el.querySelector(sel); }

  async function searchMaksi(rfid) {
    const res = await fetch(`/api/maksi/search-by-rfid?rfid=${encodeURIComponent(rfid)}`, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`panel_${res.status}`);
    return await res.json();
  }

  function ensureModal() {
    let m = q('#maksiModal');
    if (m) return m;
    const html = `
<div id="maksiModal" class="modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,.35);">
  <div class="modal-dialog" style="max-width:720px; margin:5% auto;">
    <div class="modal-content" style="background:#fff; border-radius:12px; overflow:hidden;">
      <div class="modal-header" style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px;">
        <h5 class="modal-title" style="margin:0;">Maksisoft Arama</h5>
        <button type="button" class="btn-close" data-close>&times;</button>
      </div>
      <div class="modal-body" style="padding:12px 16px;">
        <pre id="maksiBody" style="white-space:pre-wrap; margin:0;"></pre>
      </div>
      <div class="modal-footer" style="padding:12px 16px; display:flex; gap:8px; justify-content:flex-end;">
        <a id="maksiProfileLink" class="btn btn-link" target="_blank" rel="noopener">Profili Aç</a>
        <button type="button" class="btn btn-secondary" data-close>Kapat</button>
      </div>
    </div>
  </div>
</div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    m = q('#maksiModal');
    m.addEventListener('click', e => {
      if (e.target.matches('[data-close]') || e.target === m) m.style.display = 'none';
    });
    return m;
  }

  function renderSummary(u){
    const lines = [
      `ID: ${u.id}`,
      `RFID: ${u.rfid}`,
      `Ad: ${u.fullName || '(boş)'}`,
      `Telefon: ${u.phone || '-'}`,
      `Cinsiyet: ${u.gender || '-'}`,
      `Üyelik Tipi: ${u.membershipType ?? '-'}`,
      `Üyelik Bitiş: ${u.membershipEndsAt || '-'}`,
      `Son Giriş Çıkış: ${u.lastCheckAt || '-'} (${u.lastCheckStatus || '-'})`,
      `TC: ${u.tcMasked || '-'}`,
    ];
    return lines.join('\n');
  }

  function openModal(payload, rfid) {
    const m = ensureModal();
    const pre = document.getElementById('maksiBody');
    const link = document.getElementById('maksiProfileLink');

    const arr = Array.isArray(payload.hits) ? payload.hits : Array.isArray(payload) ? payload : [];
    pre.textContent = arr.length ? arr.map(renderSummary).join('\n\n') : 'Kayıt bulunamadı';
    link.href = `https://eformhatay.maksionline.com/ceo/index.php?page=user_search&search=${encodeURIComponent(rfid)}`;
    m.style.display = 'block';
  }

  async function onMaksiClick(e) {
    const btn = e.target.closest('.btn-maksi');
    if (!btn) return;

    const preset = btn.dataset.ownerRfid || "";
    const rfid = preset || window.prompt("RFID numarası:");
    if (!rfid) return;

    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Sorgulanıyor…";

    try {
      const data = await searchMaksi(rfid);
      if (data.success === false) {
        openModal({ error: data.error || 'Hata' }, rfid);
      } else {
        openModal(data, rfid);
      }
    } catch (err) {
      openModal({ error: err.message }, rfid);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  document.addEventListener('click', onMaksiClick);
})();

Testing methods

A. Logged in browser. DevTools Console.

fetch('/react-system/api_php/user_search/users.php?text=0006851540&criteria=0',{credentials:'include'})
  .then(r=>r.json()).then(console.log).catch(console.error)


B. curl.

export COOKIE='PHPSESSID=...; AC-C=ac-c'
curl 'https://eformhatay.maksionline.com/react-system/api_php/user_search/users.php?text=0006851540&criteria=0' \
  -H "Accept: application/json" \
  -H "Cookie: $COOKIE"


C. Node one liner.

export COOKIE='PHPSESSID=...; AC-C=ac-c'
node -e "fetch('https://eformhatay.maksionline.com/react-system/api_php/user_search/users.php?text=0006851540&criteria=0',{headers:{Cookie:process.env.COOKIE}}).then(r=>r.json()).then(x=>console.log(JSON.stringify(x,null,2))).catch(console.error)"


Checks. Status 200 and application json. Non empty array for a match. If you get 401 or 403, the session expired. Auto login will refresh on the next call if you set the login env values.

Security

Keep cookies and credentials on the server.
Do not log personal data. Log status code and an RFID hash only.
Add a short rate limit to the new route.

Troubleshooting

Empty results. Confirm the RFID and the criteria value.
Auth errors. Set correct login URL and form fields.
Wrong content type. Check the search path and headers.
CORS in the browser. Ensure the browser only calls the panel route.