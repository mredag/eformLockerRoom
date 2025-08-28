1) Env and minimal types
# panel/.env
MAKSI_BASE=https://eformhatay.maksionline.com
MAKSI_SEARCH_PATH=/react-system/api_php/user_search/users.php
MAKSI_CRITERIA_FOR_RFID=0
MAKSI_BOOTSTRAP_COOKIE=PHPSESSID=...; AC-C=ac-c
MAKSI_ENABLED=true

// app/panel/src/services/maksi-types.ts
export type MaksiHit = {
  id:number; name:string; phone:string; type:number;
  sex:string; gsm:string; photo:string;
  checkListDate:string; checkListStatus:string;
  endDate:string; proximity:string; tc:string;
};

export type MaksiUser = {
  id:number; fullName:string|null; phone:string|null; rfid:string;
  gender:string|null; membershipType:number|null;
  membershipEndsAt:string|null; lastCheckAt:string|null;
  lastCheckStatus:string|null; tcMasked:string|null; photoFile:string|null;
};

export function mapMaksi(h:MaksiHit):MaksiUser{
  return {
    id:h.id,
    fullName:h.name?.trim()||null,
    phone:(h.phone||h.gsm||"").trim()||null,
    rfid:h.proximity,
    gender:h.sex||null,
    membershipType:Number.isFinite(h.type)?h.type:null,
    membershipEndsAt:h.endDate||null,
    lastCheckAt:h.checkListDate||null,
    lastCheckStatus:h.checkListStatus||null,
    tcMasked:h.tc||null,
    photoFile:h.photo||null,
  };
}


(Tasks 1.1, 1.2. 
)

2) Basic service with 5 s timeout and mapping
// app/panel/src/services/maksi.ts
import { mapMaksi, type MaksiHit, type MaksiUser } from './maksi-types';

const BASE   = process.env.MAKSI_BASE!;
const PATH   = process.env.MAKSI_SEARCH_PATH!;
const COOKIE = process.env.MAKSI_BOOTSTRAP_COOKIE||'';
const CRIT   = process.env.MAKSI_CRITERIA_FOR_RFID||'0';

export async function searchMaksiByRFID(rfid:string):Promise<{hits:MaksiUser[]}>{
  const url = `${BASE}${PATH}?text=${encodeURIComponent(rfid)}&criteria=${CRIT}`;
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort(), 5000);

  try{
    const res = await fetch(url, {
      headers:{ Accept:'application/json', ...(COOKIE?{Cookie:COOKIE}:{}) },
      redirect:'manual',
      signal:ac.signal,
    });
    if(!res.ok) throw new Error(`upstream_${res.status}`);
    const ct = res.headers.get('content-type')||'';
    if(!ct.includes('application/json')) throw new Error('invalid_response');
    const raw = await res.json() as MaksiHit[];
    const hits = Array.isArray(raw)? raw.map(mapMaksi): [];
    return { hits };
  }catch(e:any){
    if(e.name==='AbortError') throw new Error('network_timeout');
    throw e;
  }finally{ clearTimeout(t); }
}


(Tasks 2.1. 
)

3) Simple rate limit 1 req/sec per IP+RFID
// app/panel/src/middleware/rate-limit.ts
const seen = new Map<string, number>();

export function rateLimit(req:any, res:any, next:any){
  const ip = req.ip || req.headers['x-forwarded-for'] || '0';
  const rfid = (req.query?.rfid||req.body?.rfid||'').toString();
  const key = `${ip}:${rfid}`;
  const now = Date.now();
  const last = seen.get(key)||0;
  // cleanup old entries
  if(now-last > 60000) seen.delete(key);
  if(now-last < 1000) return res.code?.(429).send?.({ success:false, error:'rate_limited' });
  seen.set(key, now);
  next();
}


(Tasks 2.2. 
)

4) API route with flag, validation, logging, errors
// app/panel/src/routes/maksi.ts
import crypto from 'node:crypto';
import { searchMaksiByRFID } from '../services/maksi';

const SALT = process.env.RFID_LOG_SALT || 'locker';

function hashRFID(rfid:string){
  return crypto.createHash('sha256').update(SALT+rfid).digest('hex').slice(0,12);
}

export default async function registerMaksi(fastify:any){
  fastify.get('/api/maksi/search-by-rfid', { preHandler: [fastify.rateLimitMaksi] }, // attach middleware
  async (req:any, reply:any)=>{
    if(process.env.MAKSI_ENABLED!=='true') return reply.code(404).send({ success:false, error:'disabled' });

    const rfid = req.query?.rfid?.toString().trim();
    if(!rfid) return reply.code(400).send({ success:false, error:'missing_rfid' });

    try{
      const t0 = Date.now();
      const out = await searchMaksiByRFID(rfid);
      const ms = Date.now()-t0;
      fastify.log.info({ route:'maksi', status:200, ms, rfid:hashRFID(rfid) });
      return { success:true, hits:out.hits };
    }catch(e:any){
      const code = mapError(e.message);
      fastify.log.warn({ route:'maksi', status:code.status, err:code.error, rfid:hashRFID(rfid) });
      return reply.code(code.status).send({ success:false, error:code.error });
    }
  });
}

function mapError(tag:string){
  // requirements: friendly messages and mapping :contentReference[oaicite:6]{index=6}
  if(tag==='network_timeout')     return { status:504, error:'network_error' };
  if(tag==='invalid_response')    return { status:502, error:'invalid_response' };
  if(tag.startsWith('upstream_401')||tag.startsWith('upstream_403')) return { status:401, error:'auth_error' };
  if(tag==='rate_limited')        return { status:429, error:'rate_limited' };
  return { status:502, error:'unknown_error' };
}


Wire middleware:

// app/panel/src/index.ts
import { rateLimit } from './middleware/rate-limit';
fastify.decorate('rateLimitMaksi', rateLimit);
await fastify.register(import('./routes/maksi')).catch(console.error);


(Tasks 3.1, 3.2. 
)

5) Locker card button, feature flag, prefill RFID
<!-- panel lockers template -->
<% if (process.env.MAKSI_ENABLED === 'true') { %>
  <button
    class="btn btn-secondary btn-maksi"
    data-locker-id="<%= locker.id %>"
    data-owner-rfid="<%= locker.owner?.rfid || '' %>">
    Maksisoft
  </button>
<% } %>


(Tasks 4.1. 
)

6) Modal HTML
<!-- public fragment or injected once -->
<div id="maksiModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,.35);">
  <div style="max-width:720px; margin:5% auto; background:#fff; border-radius:12px; overflow:hidden;">
    <div style="display:flex; justify-content:space-between; padding:12px 16px;">
      <h5 style="margin:0;">Maksisoft Arama</h5>
      <button type="button" data-close>&times;</button>
    </div>
    <div style="padding:12px 16px;">
      <pre id="maksiBody" style="white-space:pre-wrap; margin:0;"></pre>
    </div>
    <div style="padding:12px 16px; display:flex; gap:8px; justify-content:flex-end;">
      <a id="maksiProfileLink" class="btn btn-link" target="_blank" rel="noopener">Profili Aç</a>
      <button type="button" class="btn btn-secondary" data-close>Kapat</button>
    </div>
  </div>
</div>


(Tasks 4.2. 
)

7) Client script. Click handler, loading, API call, Turkish messages
// app/panel/src/public/js/lockers.js
(function(){
  function q(s,el=document){return el.querySelector(s);}
  function modal(){ const m=q('#maksiModal'); m.style.display='block'; return m; }
  function close(){ q('#maksiModal').style.display='none'; }
  document.addEventListener('click', e=>{ if(e.target.matches('#maksiModal,[data-close]')) close(); });

  const M = {
    auth_error: 'Kimlik doğrulama hatası',
    rate_limited: 'Çok fazla istek',
    network_error: 'Bağlantı hatası',
    invalid_response: 'Geçersiz yanıt',
    unknown_error: 'Bilinmeyen hata',
  };

  async function search(rfid){
    const r = await fetch(`/api/maksi/search-by-rfid?rfid=${encodeURIComponent(rfid)}`, { headers:{Accept:'application/json'} });
    const j = await r.json().catch(()=>({success:false,error:'invalid_response'}));
    return { ok:r.ok && j.success!==false, data:j };
  }

  function render(u){
    return [
      `ID: ${u.id}`,
      `RFID: ${u.rfid}`,
      `Ad: ${u.fullName || '(boş)'}`,
      `Telefon: ${u.phone || '-'}`,
      `Üyelik Bitiş: ${u.membershipEndsAt || '-'}`,
      `Son Giriş Çıkış: ${u.lastCheckAt || '-'} (${u.lastCheckStatus || '-'})`,
    ].join('\n');
  }

  async function onClick(e){
    const btn = e.target.closest('.btn-maksi');
    if(!btn) return;

    const preset = btn.dataset.ownerRfid || '';
    const rfid = preset || window.prompt('RFID numarası:');
    if(!rfid) return;

    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Sorgulanıyor…';

    try{
      const { ok, data } = await search(rfid);
      const pre = q('#maksiBody'); const link = q('#maksiProfileLink');
      if(!ok){
        pre.textContent = M[data.error] || 'Hata';
        link.href = '#';
        modal(); return;
      }
      const hits = Array.isArray(data.hits)? data.hits: [];
      pre.textContent = hits.length ? hits.map(render).join('\n\n') : 'Kayıt bulunamadı';
      link.href = `https://eformhatay.maksionline.com/ceo/index.php?page=user_search&search=${encodeURIComponent(rfid)}`;
      modal();
    }finally{
      btn.disabled = false; btn.textContent = original;
    }
  }

  document.addEventListener('click', onClick);
})();


(Tasks 5.1, 5.2. 
 
)

8) Tests. Unit stubs you can expand
// app/panel/test/maksi-map.test.ts
import { mapMaksi } from '../src/services/maksi-types';

test('maps MaksiHit to MaksiUser', ()=>{
  const u = mapMaksi({
    id:1026,name:'',phone:'',type:0,sex:'Bay',gsm:'0(506)7070403',photo:'x.jpg',
    checkListDate:'2019-04-20 16:38',checkListStatus:'out',endDate:'2019-11-05',
    proximity:'0006851540',tc:'5125******'
  } as any);
  expect(u.id).toBe(1026);
  expect(u.rfid).toBe('0006851540');
});

// app/panel/test/rate-limit.test.ts
import { rateLimit } from '../src/middleware/rate-limit';

test('limits to 1 req/sec', done=>{
  const req:any = { ip:'1.2.3.4', query:{rfid:'X'} };
  const res:any = { code:(c:number)=>({ send:(b:any)=>{ expect(c).toBe(429); done(); } }) };
  rateLimit(req, { code:()=>({send:()=>{}}) } as any, ()=>{ // first allowed
    rateLimit(req, res, ()=>{});
  });
});


(Tasks 6.1. 
)