#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '..', 'config', 'system.json');

function readFileSafe(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeFileSafe(p, data) {
  fs.writeFileSync(p, data, 'utf8');
}

function cleanLeadingGarbage(jsonText) {
  let text = jsonText;
  // Remove UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  // Trim left whitespace
  const trimmedLeft = text.replace(/^\s+/, '');
  if (trimmedLeft.startsWith('{')) return trimmedLeft;
  // If it starts with stray characters before the first '{', drop them cautiously
  const firstBrace = trimmedLeft.indexOf('{');
  if (firstBrace > 0) {
    const candidate = trimmedLeft.slice(firstBrace);
    try { JSON.parse(candidate); return candidate; } catch {}
  }
  throw new Error('system.json appears corrupted at the start; cannot safely fix.');
}

function ensurePorts(cfg) {
  let changed = false;
  cfg.services = cfg.services || {};
  cfg.services.gateway = cfg.services.gateway || {};
  cfg.services.panel = cfg.services.panel || {};
  cfg.services.kiosk = cfg.services.kiosk || {};
  const expected = { gateway: 3000, panel: 3001, kiosk: 3002 };
  for (const key of Object.keys(expected)) {
    const want = expected[key];
    const cur = cfg.services[key].port;
    if (cur !== want) { cfg.services[key].port = want; changed = true; }
  }
  return changed;
}

(function main(){
  let text = readFileSafe(CONFIG_PATH);
  let cleaned = text;
  let fixedLeading = false;
  try {
    JSON.parse(text);
  } catch {
    cleaned = cleanLeadingGarbage(text);
    fixedLeading = cleaned !== text;
  }
  let cfg;
  try {
    cfg = JSON.parse(cleaned);
  } catch (e) {
    console.error('❌ system.json is invalid JSON:', e.message);
    process.exit(1);
  }
  // Normalize zones and features
  const zoneChanges = normalizeZones(cfg);
  const portsChanged = ensurePorts(cfg);
  if (fixedLeading || portsChanged || zoneChanges.changed) {
    const pretty = JSON.stringify(cfg, null, 2) + '\n';
    writeFileSafe(CONFIG_PATH, pretty);
    console.log('🔧 Fixed system.json:', [fixedLeading && 'leading-bytes', portsChanged && 'ports', zoneChanges.changed && `zones(${zoneChanges.summary})`].filter(Boolean).join(', '));
  } else {
    console.log('✅ system.json validated');
  }
})();

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
    // Ensure unique ids
    let base = z.id; let suffix = 2;
    while (seenIds.has(z.id)) { z.id = `${base}-${suffix++}`; changed = true; notes.push('dedupe ids'); }
    seenIds.add(z.id);
    // Relay cards
    if (!Array.isArray(z.relay_cards)) z.relay_cards = [];
    z.relay_cards = Array.from(new Set(z.relay_cards.map(Number).filter(n => Number.isFinite(n) && hwCards.includes(n)))).sort((a,b)=>a-b);
    // Enabled flag based on presence of relay cards
    const desiredEnabled = z.relay_cards.length > 0;
    if (z.enabled !== desiredEnabled) { z.enabled = desiredEnabled; changed = true; notes.push(`enabled:${z.id}`); }
    // Ranges must be array of [start,end] numbers; sanitize and merge
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
