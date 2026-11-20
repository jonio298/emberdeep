/* Emberdeep two-player room service. Vercel Functions (native WebSocket) + Redis.
 * Without REDIS_URL it deliberately runs in single-instance memory mode for local testing;
 * production on Vercel requires Redis for cross-instance rooms and fanout.
 */
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';

const TTL = 60 * 60 * 4;
const PREFIX = 'emberdeep:coop:';
const memory = new Map();
const sessions = new Map();
const channels = new Map();
const wsClients = new Map();
const rateLimits = new WeakMap();
const REDIS_URL = process.env.REDIS_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_URL || '';
const redis = REDIS_URL ? new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1, enableReadyCheck: true
}) : null;
const subscriber = redis ? redis.duplicate() : null;
if (subscriber) {
  subscriber.on('message', (channel, raw) => {
    try {
      const code = channel.slice((PREFIX + 'channel:').length);
      const data = JSON.parse(raw);
      deliver(code, data);
    } catch { /* malformed room event */ }
  });
}
const digest = (s) => createHash('sha256').update(s).digest('hex');
const token = () => randomBytes(24).toString('hex');
const makeCode = () => randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
const roomKey = (code) => PREFIX + 'room:' + code;
const packet = (type, fields = {}) => ({ type, ...fields });
const safeText = (s, max = 80) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const validHero = (s) => ['swordsman', 'wizard', 'necromancer', 'thief'].includes(s) ? s : 'swordsman';

async function readRoom(code) {
  if (redis) {
    const raw = await redis.get(roomKey(code));
    return raw ? JSON.parse(raw) : null;
  }
  const r = memory.get(code);
  if (!r || Date.now() - r.updated > TTL * 1000) { memory.delete(code); return null; }
  return r;
}
async function writeRoom(room) {
  room.updated = Date.now();
  if (redis) {
    await redis.multi().set(roomKey(room.code), JSON.stringify(room), 'EX', TTL)
      .zadd(PREFIX + 'index', room.updated, room.code).exec();
  } else memory.set(room.code, room);
}
async function deleteRoom(code) {
  if (redis) await redis.multi().del(roomKey(code), PREFIX + 'scene:' + code, PREFIX + 'snapshot:' + code,
    PREFIX + 'trade:' + code).zrem(PREFIX + 'index', code).exec();
  else { memory.delete(code); sessions.delete(PREFIX + 'scene:' + code); sessions.delete(PREFIX + 'snapshot:' + code); sessions.delete(PREFIX + 'trade:' + code); }
}
async function put(key, value, seconds = TTL) {
  if (redis) await redis.set(PREFIX + key, JSON.stringify(value), 'EX', seconds);
  else sessions.set(PREFIX + key, { value, until: Date.now() + seconds * 1000 });
}
async function get(key) {
  if (redis) {
    const v = await redis.get(PREFIX + key);
    return v ? JSON.parse(v) : null;
  }
  const v = sessions.get(PREFIX + key);
  if (!v || v.until < Date.now()) { sessions.delete(PREFIX + key); return null; }
  return v.value;
}
async function take(key) {
  if (redis) {
    const v = await redis.call('GETDEL', PREFIX + key);
    return v ? JSON.parse(v) : null;
  }
  const v = await get(key);
  sessions.delete(PREFIX + key);
  return v;
}
async function subscribe(code, ws) {
  let set = channels.get(code);
  if (!set) {
    set = new Set();
    channels.set(code, set);
    if (subscriber) await subscriber.subscribe(PREFIX + 'channel:' + code);
  }
  set.add(ws);
}
async function unsubscribe(code, ws) {
  const set = channels.get(code);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) {
    channels.delete(code);
    if (subscriber) await subscriber.unsubscribe(PREFIX + 'channel:' + code);
  }
}
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    const raw = JSON.stringify(data);
    if (raw.length < 145000) ws.send(raw);
  }
}
function deliver(code, data) {
  const set = channels.get(code);
  if (set) for (const ws of set) send(ws, data);
}
async function publish(code, data) {
  if (redis) await redis.publish(PREFIX + 'channel:' + code, JSON.stringify(data));
  else deliver(code, data);
}
function publicRoom(r) {
  return {
    code: r.code, title: r.title, private: r.private, mode: r.mode === 'defense' ? 'defense' : 'cave',
    host: { name: r.host.name, hero: r.host.hero },
    guest: r.guest ? { name: r.guest.name, hero: r.guest.hero } : null,
    players: r.guest ? 2 : 1, capacity: 2,
    created: r.created
  };
}
async function listRooms(ws) {
  const codes = redis ? await redis.zrevrange(PREFIX + 'index', 0, 49) :
    [...memory.keys()];
  const rooms = [];
  for (const code of codes) {
    const r = await readRoom(code);
    if (r && !r.private && !r.guest) rooms.push(publicRoom(r));
    if (rooms.length >= 20) break;
  }
  send(ws, packet('rooms', { rooms }));
}
function rate(ws, kind, limit, interval = 1000) {
  let state = rateLimits.get(ws);
  if (!state) { state = {}; rateLimits.set(ws, state); }
  let b = state[kind];
  if (!b || Date.now() - b.at >= interval) b = state[kind] = { at: Date.now(), n: 0 };
  return ++b.n <= limit;
}
function fail(ws, reason) { send(ws, packet('error', { message: reason })); }
async function attach(ws, room, role, secret) {
  if (wsClients.has(ws)) throw new Error('Already in a room');
  await subscribe(room.code, ws);
  wsClients.set(ws, { code: room.code, role, name: room[role].name, secret });
  const [scene, snapshot, trade] = await Promise.all([
    get('scene:' + room.code), get('snapshot:' + room.code), get('trade:' + room.code)
  ]);
  send(ws, packet('welcome', {
    role, code: room.code, token: secret, room: publicRoom(room), scene, snapshot,
    trade: trade ? { id: trade.id, from: trade.from, item: trade.item } : null
  }));
  await publish(room.code, packet('players', { room: publicRoom(room) }));
}
async function create(ws, data) {
  if (wsClients.has(ws)) return fail(ws, 'Already in a room');
  const name = safeText(data.name, 22);
  if (!name) return fail(ws, 'Enter your name first');
  let code, duplicate;
  for (let i = 0; i < 10; i++) {
    code = makeCode();
    duplicate = await readRoom(code);
    if (!duplicate) break;
  }
  if (duplicate) return fail(ws, 'Unable to create game; retry');
  const secret = token(), now = Date.now(), room = {
    code, created: now, updated: now, title: safeText(data.title, 42) || name + "'s Adventure",
    private: !!data.private, mode: data.mode === 'defense' ? 'defense' : 'cave',
    host: { name, hero: validHero(data.hero), hash: digest(secret) },
    guest: null
  };
  if (redis) {
    const saved = await redis.set(roomKey(code), JSON.stringify(room), 'EX', TTL, 'NX');
    if (saved !== 'OK') return fail(ws, 'Code collision; retry');
    await redis.zadd(PREFIX + 'index', now, code);
  } else memory.set(code, room);
  await attach(ws, room, 'host', secret);
}
async function join(ws, data) {
  if (wsClients.has(ws)) return fail(ws, 'Already in a room');
  const name = safeText(data.name, 22), code = safeText(data.code, 6).toUpperCase();
  if (!name || !/^[0-9A-F]{6}$/.test(code)) return fail(ws, 'Enter a name and valid room code');
  const secret = token(), hash = digest(secret);
  let room;
  if (redis) {
    // WATCH guarantees two simultaneous guests cannot claim the same slot.
    for (let i = 0; i < 5; i++) {
      await redis.watch(roomKey(code));
      const raw = await redis.get(roomKey(code));
      if (!raw) { await redis.unwatch(); return fail(ws, 'Game not found or expired'); }
      room = JSON.parse(raw);
      if (room.guest) { await redis.unwatch(); return fail(ws, 'Game is full'); }
      room.guest = { name, hero: validHero(data.hero), hash };
      room.updated = Date.now();
      const done = await redis.multi().set(roomKey(code), JSON.stringify(room), 'EX', TTL).exec();
      if (done) break;
      if (i === 4) return fail(ws, 'Someone joined first. Retry.');
    }
  } else {
    room = await readRoom(code);
    if (!room) return fail(ws, 'Game not found');
    if (room.guest) return fail(ws, 'Game is full');
    room.guest = { name, hero: validHero(data.hero), hash };
    await writeRoom(room);
  }
  await attach(ws, room, 'guest', secret);
}
async function resume(ws, data) {
  if (wsClients.has(ws)) return;
  const code = safeText(data.code, 6).toUpperCase(), secret = safeText(data.token, 100);
  const room = await readRoom(code);
  if (!room) return fail(ws, 'Game expired; create a new room');
  const hash = digest(secret);
  const role = room.host.hash === hash ? 'host' : room.guest?.hash === hash ? 'guest' : null;
  if (!role) return fail(ws, 'Session expired or invalid');
  await attach(ws, room, role, secret);
}
// Keep only plain numbers, booleans, short strings, small arrays and shallow objects.
function cleanFx(v, depth) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.max(-30000, Math.min(30000, v)) : undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.slice(0, 32);
  if (depth > 3 || !v || typeof v !== 'object') return undefined;
  if (Array.isArray(v)) {
    return v.slice(0, 12).map((x) => cleanFx(x, depth + 1)).filter((x) => x !== undefined);
  }
  const out = {};
  for (const k of Object.keys(v).slice(0, 40)) {
    if (!/^[A-Za-z0-9_]{1,16}$/.test(k)) continue;
    const c = cleanFx(v[k], depth + 1);
    if (c !== undefined) out[k] = c;
  }
  return out;
}
async function relay(ws, data) {
  const info = wsClients.get(ws);
  if (!info) return fail(ws, 'Join a game first');
  const room = await readRoom(info.code);
  if (!room || room[info.role]?.hash !== digest(info.secret)) return fail(ws, 'Room expired');
  const code = info.code, role = info.role;
  if (data.type === 'leave') {
    if (role === 'host') {
      await publish(code, packet('closed', { message: 'Host ended the game' }));
      await deleteRoom(code);
    } else {
      room.guest = null;
      await writeRoom(room);
      await publish(code, packet('players', { room: publicRoom(room) }));
    }
    wsClients.delete(ws);
    await unsubscribe(code, ws);
    send(ws, packet('left'));
    return;
  }
  if (data.type === 'chat') {
    if (!rate(ws, 'chat', 3, 2500)) return;
    const text = safeText(data.text, 200);
    if (text) await publish(code, packet('chat', { from: role, name: info.name, text, at: Date.now() }));
    return;
  }
  if (data.type === 'position') {
    if (!rate(ws, 'position', 24)) return;
    const p = data.player || {};
    const clean = {};
    for (const k of ['x','y','hp','maxHp','mana','maxMana','level','face','anim','atkAnim','swingAng',
                     'swingSign','castFlash','whirlT','dashT','pwb','sc','pta','ptx','pty','ptr','ptf','ptt','cpa','cpx','cpy','cpf','cpt']) {
      if (Number.isFinite(p[k])) clean[k] = Math.max(-20000, Math.min(20000, p[k]));
    }
    clean.classId = room[role].hero;
    clean.moving = !!p.moving;
    await publish(code, packet('position', { from: role, player: clean }));
    return;
  }
  if (data.type === 'fx') {
    // Visual-only combat effects (slashes, spells, projectiles, minions) mirrored to the partner.
    if (!rate(ws, 'fx', 70)) return;
    if (!['fx', 'pr', 'sc', 'mn', 'df', 'tb', 'tc', 'opt', 'ch', 'qs', 'qe', 'vf', 'gp'].includes(data.k)) return;
    if ((data.k === 'df' || data.k === 'tb' || data.k === 'opt' || data.k === 'ch' || data.k === 'qs' || data.k === 'qe' || data.k === 'gp') && role !== 'host') return; // wave state and crossbow fire come from the host
    if (data.k === 'tc' && role !== 'guest') return; // crossbow requests come from the guest
    const d = cleanFx(data.d, 0);
    if (d === undefined || JSON.stringify(d).length > 2500) return;
    await publish(code, packet('fx', { from: role, k: data.k, d }));
    return;
  }
  if (data.type === 'kill' && role === 'host') {
    if (!rate(ws, 'kill', 25)) return;
    const xp=Number(data.xp);
    if (Number.isFinite(xp) && xp>0 && xp<5000)
      await publish(code,packet('kill',{xp:Math.round(xp)}));
    return;
  }
  if (data.type === 'damage_guest' && role === 'host') {
    if (!rate(ws, 'damage_guest', 18)) return;
    const amount = Number(data.damage);
    if (Number.isFinite(amount) && amount > 0 && amount <= 250)
      await publish(code, packet('damage_guest', { to: 'guest', damage: amount }));
    return;
  }
  if (data.type === 'hit' && role === 'guest') {
    if (!rate(ws, 'hit', 34)) return;
    const id = Number(data.id), damage = Number(data.damage);
    if (!Number.isInteger(id) || !Number.isFinite(damage) || damage <= 0 || damage > 450) return;
    await publish(code, packet('hit', { from: role, id, damage, kind: safeText(data.kind, 24) }));
    return;
  }
  if (data.type === 'drop_item' && role === 'guest') {
    if (!rate(ws, 'drop', 5, 5000)) return;
    const item = data.item;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const js = JSON.stringify(item);
    if (js.length > 3000) return;
    await publish(code, packet('drop_item', { from: role, item: JSON.parse(js) }));
    return;
  }
  if (data.type === 'pickup_request' && role === 'guest') {
    if (!rate(ws, 'pickup', 8)) return;
    const id = safeText(data.id, 50);
    if (id) await publish(code, packet('pickup_request', { from: role, id }));
    return;
  }
  if (data.type === 'pickup_grant' && role === 'host') {
    if (!rate(ws, 'pickup_grant', 10)) return;
    const reward = data.reward;
    if (reward && ['item','gold','potion','mpotion','hp','mana'].includes(reward.kind) && JSON.stringify(reward).length <= 5000)
      await publish(code, packet('pickup_grant', { to: 'guest', id: safeText(data.id, 50), reward }));
    return;
  }
  if (data.type === 'scene' && role === 'host') {
    if (!rate(ws, 'scene', 4)) return;
    const scene = data.scene || {};
    if (!['cave', 'defense', 'forest', 'tree-tunnel', 'plains', 'tree-ascent', 'rocky-pass', 'village', 'village-cellar'].includes(scene.area) || !Number.isFinite(scene.seed) ||
        !Number.isInteger(scene.floor) || scene.floor < 1 || scene.floor > 200) return;
    const clean = { area: scene.area, seed: scene.seed, floor: scene.floor };
    if (Number.isInteger(scene.tf) && scene.tf >= 1 && scene.tf <= 5) clean.tf = scene.tf;
    if (Number.isFinite(scene.px) && Number.isFinite(scene.py)) { clean.px = Math.max(-20000, Math.min(20000, scene.px)); clean.py = Math.max(-20000, Math.min(20000, scene.py)); }
    await put('scene:' + code, clean);
    await publish(code, packet('scene', { scene: clean }));
    return;
  }
  if (data.type === 'snapshot' && role === 'host') {
    if (!rate(ws, 'snapshot', 13)) return;
    const snapshot = data.snapshot;
    if (!snapshot || !Array.isArray(snapshot.enemies) || snapshot.enemies.length > 150 ||
        JSON.stringify(snapshot).length > 105000) return;
    if (!info.lastSnapshot || Date.now() - info.lastSnapshot > 900) {
      await put('snapshot:' + code, snapshot);
      info.lastSnapshot = Date.now();
    }
    await publish(code, packet('snapshot', { snapshot }));
    return;
  }
  if (data.type === 'trade_offer') {
    if (!room.guest) return fail(ws, 'Wait for the other adventurer before trading');
    if (!rate(ws, 'trade', 3, 5000)) return;
    let item = data.item;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    // Never accept executable or unbounded item payloads.
    const json = JSON.stringify(item);
    if (json.length > 3000) return fail(ws, 'Item too large');
    item = JSON.parse(json);
    const existing = await get('trade:' + code);
    if (existing) return fail(ws, 'A trade is already pending');
    const offer = { id: token().slice(0, 16), from: role, item };
    await put('trade:' + code, offer, 120);
    await publish(code, packet('trade_offer', offer));
    return;
  }
  if (data.type === 'trade_accept' || data.type === 'trade_decline') {
    if (!rate(ws, 'trade_response', 5, 5000)) return;
    const offer = await get('trade:' + code);
    if (!offer || offer.id !== data.id || offer.from === role) return;
    // GETDEL gives at-most-once completion across server instances.
    const result = await take('trade:' + code);
    if (!result || result.id !== offer.id) return;
    await publish(code, data.type === 'trade_accept' ?
      packet('trade_commit', { ...result, to: role }) :
      packet('trade_decline', { ...result }));
  }
}
const server = createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ name: 'Emberdeep Multiplayer', webSocket: '/api/ws',
    configured: !!redis || !process.env.VERCEL, version: 1 }));
});
const wss = new WebSocketServer({ server, maxPayload: 145000, perMessageDeflate: false });
wss.on('connection', (ws) => {
  if (!redis && process.env.VERCEL) {
    send(ws, packet('error', { message: 'Server needs REDIS_URL in Vercel project settings' }));
    ws.close(1013, 'Configuration required');
    return;
  }
  let pending = Promise.resolve();
  ws.on('message', (raw) => {
    pending = pending.then(async () => {
      if (!rate(ws, 'frames', 100)) return;
      let data;
      try { data = JSON.parse(raw.toString()); } catch { return fail(ws, 'Invalid message'); }
      if (!data || typeof data !== 'object') return;
      if (data.type === 'list') await listRooms(ws);
      else if (data.type === 'create') await create(ws, data);
      else if (data.type === 'join') await join(ws, data);
      else if (data.type === 'resume') await resume(ws, data);
      else await relay(ws, data);
    }).catch(e => { console.error('Emberdeep multiplayer:', e); fail(ws, 'Server action failed'); });
  });
  ws.on('close', () => {
    const info = wsClients.get(ws);
    wsClients.delete(ws);
    if (info) {
      void unsubscribe(info.code, ws);
      void publish(info.code, packet('presence', { from: info.role, online: false }));
    }
  });
  ws.on('error', () => {});
});
export { wss };
export default server;
