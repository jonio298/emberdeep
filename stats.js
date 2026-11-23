/* Emberdeep traffic monitor: a small, private, privacy-friendly visitor counter.
 *
 *   What it counts:  page loads, unique visitors per day, games started (and which hero), and who is connected right now (co-op sockets).
 *   What it keeps:   only numbers. A visitor is a one-way hash of (a salt that changes every day + IP + browser) held in memory just long enough to count
 *                    "unique today", and it is never written to disk or shown. No IPs, no cookies, no tracking of what anyone does in the game.
 *   Where to look:   /stats?key=YOUR_KEY (a simple page) or /api/stats?key=YOUR_KEY (JSON). Nothing links to it and a wrong or missing key gets a plain 404.
 *   The key:         set STATS_KEY in the host's environment (on Render: Environment -> STATS_KEY). If it is not set, a random key is made at start-up and
 *                    printed in the server log, so a fresh deploy is never open to the world.
 *   Persistence:     counts are saved to data/stats.json every minute and loaded at start-up. Free hosts with a throw-away disk lose them on redeploy.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(process.env.STATS_DIR || 'data', 'stats.json');
const KEY = process.env.STATS_KEY || randomBytes(9).toString('base64url');
const KEY_GENERATED = !process.env.STATS_KEY;
const KEEP_DAYS = 60, CLASSES = new Set(['swordsman', 'thief', 'wizard', 'necromancer']), BOT = /bot|crawl|spider|slurp|preview|monitor|curl|wget|headless/i;
const started = Date.now();

let data = { since: new Date().toISOString().slice(0, 10), days: {} };
try { const d = JSON.parse(readFileSync(FILE, 'utf8')); if (d && d.days) data = d; } catch { /* first run */ }

let salt = randomBytes(16).toString('hex'), saltDay = day();
const seen = new Set(); // today's visitor hashes, memory only
const hitRate = new Map(); // abuse guard for the public beacon: hash -> [window start, count]

function day() { return new Date().toISOString().slice(0, 10); }
function today() {
  const d = day();
  if (d !== saltDay) { saltDay = d; salt = randomBytes(16).toString('hex'); seen.clear(); hitRate.clear(); } // a new day: new salt, so yesterday's hashes can never match
  return data.days[d] || (data.days[d] = { views: 0, uniques: 0, bots: 0, starts: 0, classes: {} });
}
function who(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  return createHash('sha256').update(salt + '|' + ip + '|' + (req.headers['user-agent'] || '')).digest('hex').slice(0, 24);
}
function trim() { const ks = Object.keys(data.days).sort(); while (ks.length > KEEP_DAYS) delete data.days[ks.shift()]; }
function save() { try { trim(); mkdirSync(join(FILE, '..'), { recursive: true }); writeFileSync(FILE, JSON.stringify(data)); } catch { /* read-only disk: counts just live in memory */ } }
setInterval(save, 60000).unref();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); process.exit(0); });

/** Count one load of the game page. */
export function recordView(req) {
  const t = today();
  if (BOT.test(req.headers['user-agent'] || '')) { t.bots++; return; }
  t.views++;
  const h = who(req); if (!seen.has(h)) { seen.add(h); t.uniques++; }
}
/** The public beacon: the game says "a run started" (hero only). Returns true when it handled the request. */
function beacon(req, res, url) {
  res.statusCode = 204; res.setHeader('Cache-Control', 'no-store');
  const h = who(req), now = Date.now(), r = hitRate.get(h) || [now, 0];
  if (now - r[0] > 60000) { r[0] = now; r[1] = 0; } r[1]++; hitRate.set(h, r);
  if (r[1] <= 12 && !BOT.test(req.headers['user-agent'] || '') && url.searchParams.get('e') === 'start') {
    const t = today(), c = url.searchParams.get('c'); t.starts++; if (CLASSES.has(c)) t.classes[c] = (t.classes[c] || 0) + 1;
  }
  res.end(); return true;
}
export function statsAuth(url) { return authorized(url); } // reused by the feedback list
function authorized(url) {
  const a = Buffer.from(String(url.searchParams.get('key') || '')), b = Buffer.from(KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}
function summary(live) {
  const t = today(), ds = Object.keys(data.days).sort(), sum = (k) => ds.reduce((n, d) => n + (data.days[d][k] || 0), 0), cls = {};
  for (const d of ds) for (const [c, n] of Object.entries(data.days[d].classes || {})) cls[c] = (cls[c] || 0) + n;
  return { now: new Date().toISOString(), uptimeHours: +((Date.now() - started) / 3600000).toFixed(1), liveConnections: live, today: t, since: data.since,
    totals: { views: sum('views'), uniqueVisitorDays: sum('uniques'), starts: sum('starts'), bots: sum('bots') }, heroes: cls, days: ds.slice(-30).map((d) => ({ day: d, ...data.days[d] })) };
}
function page(s) {
  const max = Math.max(1, ...s.days.map((d) => d.views)), esc = (x) => String(x).replace(/[&<>]/g, '');
  const rows = s.days.slice().reverse().map((d) => `<tr><td>${esc(d.day)}</td><td>${d.views}</td><td>${d.uniques}</td><td>${d.starts}</td><td class="b"><i style="width:${Math.round(d.views / max * 100)}%"></i></td></tr>`).join('');
  const heroes = Object.entries(s.heroes).map(([c, n]) => `${esc(c)}: <b>${n}</b>`).join(' &middot; ') || 'none yet';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="30"><title>Emberdeep traffic</title>
<style>:root{color-scheme:dark}body{margin:0;background:#120d09;color:#f0e6d0;font:14px Georgia,serif;padding:18px;max-width:640px;margin:auto}h1{color:#ffd890;font-size:20px;margin:0 0 4px}small{color:#a89a82}
.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:14px 0}.c{background:#241912;border:1px solid #8a5a26;border-radius:8px;padding:10px}.c b{display:block;font-size:26px;color:#ffe3a0}.c span{color:#a89a82;font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:8px}td,th{padding:4px 6px;text-align:right;border-bottom:1px solid #3a2a1c}th{color:#a89a82;font-weight:normal}td:first-child,th:first-child{text-align:left}.b{width:35%}.b i{display:block;height:8px;background:#d9a95a;border-radius:4px}</style>
<h1>Emberdeep traffic</h1><small>numbers only, nothing personal is stored &middot; refreshes every 30 s &middot; up ${s.uptimeHours} h</small>
<div class="cards"><div class="c"><b>${s.liveConnections}</b><span>connected right now (co-op)</span></div><div class="c"><b>${s.today.views}</b><span>page loads today</span></div><div class="c"><b>${s.today.uniques}</b><span>unique visitors today</span></div><div class="c"><b>${s.today.starts}</b><span>games started today</span></div></div>
<p>All time since ${esc(s.since)}: <b>${s.totals.views}</b> loads &middot; <b>${s.totals.uniqueVisitorDays}</b> visitor-days &middot; <b>${s.totals.starts}</b> games started &middot; ${s.totals.bots} bot hits ignored</p><p>Heroes picked: ${heroes}</p>
<table><tr><th>day</th><th>loads</th><th>unique</th><th>starts</th><th></th></tr>${rows}</table>`;
}
/** Handle /stats, /api/stats and /api/hit. Returns true if the request was dealt with. `live` is a function giving the live connection count. */
export function handleStats(req, res, live) {
  let url; try { url = new URL(req.url || '/', 'http://x'); } catch { return false; }
  const p = url.pathname;
  if (p === '/api/hit') return beacon(req, res, url);
  if (p !== '/stats' && p !== '/api/stats') return false;
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex');
  if (!authorized(url)) { res.statusCode = 404; res.end('Not found'); return true; }
  const s = summary(live ? live() : 0);
  if (p === '/api/stats') { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(s)); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(page(s)); }
  return true;
}
export function statsKeyNote() { return KEY_GENERATED ? 'Traffic monitor key (random, set STATS_KEY to choose your own): ' + KEY : 'Traffic monitor: enabled (key from STATS_KEY)'; }
export const _test = { summary, recordView, today };
