#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.resolve(__dirname, '..', 'config');
const FILES = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.json'));

function read(p){ return fs.readFileSync(p,'utf8'); }
function write(p,s){ fs.writeFileSync(p,s,'utf8'); }
function cleanLeadingGarbage(text){
  let t = text;
  if (t.length && t.charCodeAt(0) === 0xFEFF) t = t.slice(1); // BOM
  t = t.replace(/^\s+/, '');
  if (t.startsWith('{') || t.startsWith('[')) return t;
  const i = t.indexOf('{');
  const j = t.indexOf('[');
  let k = -1;
  if (i >= 0 && j >= 0) k = Math.min(i,j); else k = Math.max(i,j);
  if (k > 0) {
    const cand = t.slice(k);
    try { JSON.parse(cand); return cand; } catch {}
  }
  throw new Error('Cannot safely repair: leading non-JSON content');
}

function ensurePortsIfSystem(cfg){
  let changed = false;
  if (!cfg || typeof cfg !== 'object') return changed;
  if (!cfg.services) return changed;
  const expected = { gateway: 3000, panel: 3001, kiosk: 3002 };
  for (const key of Object.keys(expected)){
    if (!cfg.services[key]) continue;
    if (cfg.services[key].port !== expected[key]){
      cfg.services[key].port = expected[key];
      changed = true;
    }
  }
  return changed;
}

function normalizeZones(cfg){
  let changed = false; const notes = [];
  cfg.features = cfg.features || {};
  if (typeof cfg.features.zones_enabled !== 'boolean') { cfg.features.zones_enabled = !!cfg.zones && cfg.zones.length > 0; changed = true; notes.push('features.zones_enabled'); }
  if (!Array.isArray(cfg.zones)) return { changed, summary: notes.join(',') };
  const hwCards = (cfg.hardware?.relay_cards || []).map(c => Number(c.slave_address)).filter(n => Number.isFinite(n));
  const seenIds = new Set();
  for (const z of cfg.zones) {
    if (!z) continue;
    if (!('id' in z) && ('d' in z)) { z.id = String(z.d); delete z.d; changed = true; notes.push('rename d->id'); }
    if (typeof z.id !== 'string' || !z.id.trim()) { z.id = `zone-${Math.random().toString(36).slice(2,7)}`; changed = true; notes.push('fill zone.id'); }
    let base = z.id; let suffix = 2; while (seenIds.has(z.id)) { z.id = `${base}-${suffix++}`; changed = true; notes.push('dedupe ids'); }
    seenIds.add(z.id);
    if (!Array.isArray(z.relay_cards)) z.relay_cards = [];
    z.relay_cards = Array.from(new Set(z.relay_cards.map(Number).filter(n => Number.isFinite(n) && hwCards.includes(n)))).sort((a,b)=>a-b);
    const desiredEnabled = z.relay_cards.length > 0;
    if (z.enabled !== desiredEnabled) { z.enabled = desiredEnabled; changed = true; notes.push(`enabled:${z.id}`); }
    if (!Array.isArray(z.ranges)) z.ranges = [];
    const norm = [];
    for (const r of z.ranges) {
      if (!Array.isArray(r) || r.length < 2) continue;
      const a = Number(r[0]); const b = Number(r[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const s = Math.max(1, Math.min(a,b));
      const e = Math.max(1, Math.max(a,b));
      if (s <= e) norm.push([s,e]);
    }
    norm.sort((x,y)=>x[0]-y[0]);
    const merged = [];
    for (const [s,e] of norm) {
      if (!merged.length || s > merged[merged.length-1][1] + 1) merged.push([s,e]);
      else merged[merged.length-1][1] = Math.max(merged[merged.length-1][1], e);
    }
    if (JSON.stringify(z.ranges) !== JSON.stringify(merged)) { z.ranges = merged; changed = true; notes.push(`ranges:${z.id}`); }
  }
  return { changed, summary: Array.from(new Set(notes)).join('|') };
}

let anyChanged = false; let messages=[];
for (const f of FILES){
  const p = path.join(CONFIG_DIR, f);
  const original = read(p);
  let cleaned = original;
  let fixedLeading = false;
  try { JSON.parse(original); }
  catch { cleaned = cleanLeadingGarbage(original); fixedLeading = cleaned !== original; }
  let cfg;
  try { cfg = JSON.parse(cleaned); }
  catch (e){ console.error(`❌ ${f} invalid JSON: ${e.message}`); process.exitCode = 1; continue; }
  let portsChanged = false;
  if (f === 'system.json') portsChanged = ensurePortsIfSystem(cfg);
  if (f === 'system.json') {
    const zoneChanges = normalizeZones(cfg);
    if (zoneChanges.changed) messages.push(`${f}: zones(${zoneChanges.summary})`), anyChanged = true;
  }
  if (fixedLeading || portsChanged){
    write(p, JSON.stringify(cfg, null, 2) + '\n');
    anyChanged = true; messages.push(`${f}: ${[fixedLeading && 'leading-bytes', portsChanged && 'ports'].filter(Boolean).join(', ')}`);
  }
}

if (messages.length) console.log('🔧 Fixed:', messages.join(' | '));
console.log(anyChanged ? '✅ Configs repaired/validated' : '✅ All configs valid');
