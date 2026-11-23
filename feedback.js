/* Emberdeep beta-tester feedback: the server side of the "The developer would like your opinions!" box.
 *
 *   POST /api/feedback         { balance, favorite, wish, contact?, minutes?, hero? }  (the game sends this when a tester presses Send)
 *   GET  /api/feedback-list?key=STATS_KEY   the last 100 answers (private, same key as the traffic monitor)
 *
 * Every answer is appended to data/feedback.jsonl (so nothing is lost even if email is not set up). If these environment variables are set on the host
 * (on Render: Environment), each answer is also emailed to the developer, through Resend (https://resend.com, free tier):
 *     RESEND_API_KEY   your Resend API key
 *     FEEDBACK_TO      the address that should receive the feedback (your own)
 *     FEEDBACK_FROM    optional sender, default "Emberdeep <onboarding@resend.dev>" (on the free tier Resend only delivers that sender to your own account address)
 * No address or key is ever stored in the code or sent to the browser. A hidden honeypot field and a per-visitor rate limit keep spam out.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { statsAuth } from './stats.js';

const FILE = join(process.env.STATS_DIR || 'data', 'feedback.jsonl');
const MAX_BODY = 8000, MAX_FIELD = 1500, LIMIT = 4, WINDOW = 3600000;
const hits = new Map();

function who(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  return createHash('sha256').update('fb|' + ip + '|' + (req.headers['user-agent'] || '')).digest('hex').slice(0, 20);
}
function clean(v, n = MAX_FIELD) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}
async function email(entry) {
  const key = process.env.RESEND_API_KEY, to = process.env.FEEDBACK_TO; if (!key || !to) return false;
  const text = ['Needs balancing / tweaking:', entry.balance || '(blank)', '', 'Favourite part:', entry.favorite || '(blank)', '', 'Would like added:', entry.wish || '(blank)', '', 'Contact: ' + (entry.contact || '(none given)'),
    'Hero: ' + (entry.hero || '?') + '   Played this session: ' + (entry.minutes || '?') + ' min   At: ' + entry.at].join('\n');
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.FEEDBACK_FROM || 'Emberdeep <onboarding@resend.dev>', to: [to], subject: 'Emberdeep beta feedback', text }) });
    return r.ok;
  } catch { return false; }
}
function json(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); }

/** Handle /api/feedback and /api/feedback-list. Returns true if the request was dealt with. */
export function handleFeedback(req, res) {
  let url; try { url = new URL(req.url || '/', 'http://x'); } catch { return false; }
  if (url.pathname === '/api/feedback-list') {
    res.setHeader('X-Robots-Tag', 'noindex');
    if (!statsAuth(url)) { res.statusCode = 404; res.end('Not found'); return true; }
    let rows = []; try { rows = readFileSync(FILE, 'utf8').split('\n').filter(Boolean).slice(-100).map((l) => JSON.parse(l)); } catch { /* none yet */ }
    json(res, 200, { count: rows.length, entries: rows.reverse() }); return true;
  }
  if (url.pathname !== '/api/feedback') return false;
  if (req.method !== 'POST') { json(res, 405, { ok: false }); return true; }
  const h = who(req), now = Date.now(), r = hits.get(h) || [now, 0];
  if (now - r[0] > WINDOW) { r[0] = now; r[1] = 0; } r[1]++; hits.set(h, r);
  if (r[1] > LIMIT) { json(res, 429, { ok: false, error: 'Too many submissions, thank you!' }); return true; }
  readBody(req).then(async (raw) => {
    let b; try { b = JSON.parse(raw); } catch { return json(res, 400, { ok: false }); }
    if (b.website) return json(res, 200, { ok: true }); // the honeypot: a person never fills it in
    const entry = { at: new Date().toISOString(), balance: clean(b.balance), favorite: clean(b.favorite), wish: clean(b.wish), contact: clean(b.contact, 200), hero: clean(b.hero, 20), minutes: Math.max(0, Math.min(10000, Number(b.minutes) | 0)) };
    if (!entry.balance && !entry.favorite && !entry.wish) return json(res, 400, { ok: false, error: 'Please write something first.' });
    try { mkdirSync(join(FILE, '..'), { recursive: true }); appendFileSync(FILE, JSON.stringify(entry) + '\n'); } catch { /* read-only disk: email may still go out */ }
    const emailed = await email(entry);
    json(res, 200, { ok: true, emailed });
  }).catch(() => json(res, 413, { ok: false }));
  return true;
}
