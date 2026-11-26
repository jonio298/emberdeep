/* CC.Emberdeep - the Emberdeep itself: the earth's angry, lava-filled, boiling core, where the curse is coming from.
 *
 * The Hearthkeeper's furnace door (the Cinderwake's last floor) opens onto it once he has fallen. Two floors:
 *   1  THE BOILING DESCENT   a winding cave of obsidian causeways between pools of lava, with geysers that erupt on a rhythm; the Cinderwake's creatures
 *                            are stronger here
 *   2  THE CORE              a round hall: a ring of lava crossed by four stone causeways around an island, and on the island THE EMBERHEART, the beating
 *                            molten heart of the curse. Breaking it ends the curse.
 * Lava is an impassable, glowing floor. Geysers and the Emberheart's lava bursts are telegraphed on the ground before they hurt.
 *
 *   generate(floor, seed) -> map   enter() leave() interact() nearAction() drawOverlay(c,W,H)   hazards   isCursed() (the curse is broken)
 * Design: the story layer lives in cinderwake_story.js (the sealed door, the quest "The Source of the Curse").
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, T = CC.TILE || 32, PI2 = Math.PI * 2, E = CC.Enemies, F = CC.Forest, EM = CC.Emberdeep = { hazards: [] };
  var LAVA = 5, SIZES = [[56, 44], [44, 44]], ACTION = 54, speech = null, titleAt = 0, shown = null, cursed = false;
  function R() { return Math.random(); }
  function seeded(seed) { return function () { var n = seed = (seed + 0x6D2B79F5) >>> 0; n = Math.imul(n ^ (n >>> 15), n | 1); n ^= n + Math.imul(n ^ (n >>> 7), n | 61); return ((n ^ (n >>> 14)) >>> 0) / 4294967296; }; }
  function point(tx, ty) { return { tx: tx, ty: ty, x: (tx + 0.5) * T, y: (ty + 0.5) * T }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hero() { return CC.state && CC.state.player; }
  function active() { var s = CC.state; return s && s.area === 'emberdeep' && s.map && s.map.emberdeep ? s.map : null; }
  EM.isCursed = function () { return cursed; };
  EM.setCursed = function (v) { cursed = !!v; };

  /* ---------- the maps ---------- */
  function generate(floor, seed) {
    if (floor !== 1 && floor !== 2) throw new RangeError('Emberdeep floor must be 1 or 2');
    seed = Number.isFinite(seed) ? seed >>> 0 : (Math.random() * 0x100000000) >>> 0;
    for (var attempt = 0; attempt < 30; attempt++) { var map = floor === 1 ? descent(seeded((seed + attempt * 7919) ^ 0x51ed), seed) : core(seeded(seed ^ 0xc0de), seed); if (map) return map; }
    throw new Error('Emberdeep generation failed');
  }
  function finish(o, floor, seed, extra) {
    var map = CC.Realm.create(Object.assign({ ambient: '30,8,4,0.62', playerLight: 135, viewR: 190, fog: 0.16, fogColor: '170,70,30', ground: ground, detail: detail, drawSolid: wall, afterLight: haze }, o));
    return Object.assign(map, { floor: floor, seed: seed, emberdeep: true, hazards: [] }, extra);
  }
  function reach(tiles, W, H, sx, sy) { var seen = new Uint8Array(W * H), q = [[sx, sy]]; seen[sy * W + sx] = 1; for (var i = 0; i < q.length; i++) { var c = q[i]; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var x = c[0] + d[0], y = c[1] + d[1]; if (x < 0 || y < 0 || x >= W || y >= H || seen[y * W + x] || tiles[y * W + x]) return; seen[y * W + x] = 1; q.push([x, y]); }); } return seen; }
  function descent(rng, seed) {
    var W = SIZES[0][0], H = SIZES[0][1], tiles = new Uint8Array(W * H).fill(1), kind = new Uint8Array(W * H).fill(9), x, y, i;
    function carve(cx, cy, r) { for (var yy = Math.max(1, cy - r); yy <= Math.min(H - 2, cy + r); yy++) for (var xx = Math.max(1, cx - r); xx <= Math.min(W - 2, cx + r); xx++) if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r) { tiles[yy * W + xx] = 0; kind[yy * W + xx] = 0; } }
    var layout = [[8, 36, 5], [21, 32, 5], [32, 22, 5], [19, 15, 5], [35, 8, 5], [47, 14, 5]];
    var rooms = layout.map(function (r) { var p = point(r[0] + Math.floor(rng() * 3) - 1, r[1] + Math.floor(rng() * 3) - 1); carve(p.tx, p.ty, r[2]); p.r = r[2]; return p; });
    for (i = 1; i < rooms.length; i++) {
      var a = rooms[i - 1], b = rooms[i], corner = rng() < 0.5 ? point(a.tx, b.ty) : point(b.tx, a.ty);
      for (x = Math.min(a.tx, b.tx); x <= Math.max(a.tx, b.tx); x++) carve(x, corner.ty, 1);
      for (y = Math.min(a.ty, b.ty); y <= Math.max(a.ty, b.ty); y++) carve(corner.tx, y, 1);
    }
    var spawn = rooms[0], last = rooms[rooms.length - 1], retreat = point(spawn.tx - 3, spawn.ty), lights = [], props = [], geysers = [];
    // lava pools in the rooms (never on the entry, the stairs or the room centres) and geysers beside them
    rooms.forEach(function (rm, ri) {
      if (ri === 0 || ri === rooms.length - 1) return;
      var n = 2 + Math.floor(rng() * 2);
      for (var k = 0; k < n; k++) { var ang = rng() * PI2 + k * 2.1, rr = 2.6 + rng() * 1.2, lx = Math.round(rm.tx + Math.cos(ang) * rr), ly = Math.round(rm.ty + Math.sin(ang) * rr); for (var yy = ly - 1; yy <= ly + 1; yy++) for (var xx = lx - 1; xx <= lx + 1; xx++) if (!(xx === rm.tx && yy === rm.ty) && (xx - lx) * (xx - lx) + (yy - ly) * (yy - ly) <= 1.8 && tiles[yy * W + xx] === 0) { tiles[yy * W + xx] = 1; kind[yy * W + xx] = LAVA; } lights.push({ x: (lx + 0.5) * T, y: (ly + 0.5) * T, r: 82, color: '255,96,24', inten: 0.62, flicker: 0.16 }); }
      for (k = 0; k < 2; k++) { var ga = rng() * PI2, gp = point(Math.round(rm.tx + Math.cos(ga) * 3.5), Math.round(rm.ty + Math.sin(ga) * 3.5)); if (tiles[gp.ty * W + gp.tx] === 0) geysers.push({ x: gp.x, y: gp.y, period: 4.2 + rng() * 2.4, t: rng() * 5, warn: 0 }); }
    });
    // a bridge of lava-free ground must still join everything
    var seen = reach(tiles, W, H, spawn.tx, spawn.ty);
    if (rooms.some(function (rm) { return !seen[rm.ty * W + rm.tx]; })) return null;
    rooms.forEach(function (rm) { lights.push({ x: rm.x, y: rm.y, r: 120, color: '255,120,40', inten: 0.4, flicker: 0.12 }); });
    var types = ['sootwretch', 'embermoth', 'slagcrawler', 'candlewraith'], spawns = [];
    rooms.forEach(function (rm, ri) {
      if (ri === 0) return;
      [[-2, 2], [2, 2], [-2, -2], [2, -2]].forEach(function (off, k) { if (k >= 2 + (ri > 2 ? 1 : 0) + (ri > 4 ? 1 : 0)) return; var p = point(rm.tx + off[0], rm.ty + off[1]); if (tiles[p.ty * W + p.tx] || !seen[p.ty * W + p.tx]) return; spawns.push({ x: p.x, y: p.y, type: types[(ri + k) % types.length] }); });
    });
    var chests = [];
    [[last, 3, 2], [rooms[3], -3, 1]].forEach(function (c0) { // a reachable, open tile near each spot for a chest
      for (var d = 0; d < 6; d++) for (var oy = -d; oy <= d; oy++) for (var ox = -d; ox <= d; ox++) {
        var cx2 = c0[0].tx + c0[1] + ox, cy2 = c0[0].ty + c0[2] + oy;
        if (chests.length > 0 && chests[chests.length - 1].placed === c0) continue;
        if (cx2 < 1 || cy2 < 1 || cx2 >= W - 1 || cy2 >= H - 1 || tiles[cy2 * W + cx2] || !seen[cy2 * W + cx2]) continue;
        if (Math.hypot(cx2 - c0[0].tx, cy2 - c0[0].ty) < 1.5 || chests.some(function (q) { return q.tx === cx2 && q.ty === cy2; })) continue;
        var pp = point(cx2, cy2); pp.opened = false; pp.tier = 2; pp.placed = c0; chests.push(pp); return;
      }
    });
    chests.forEach(function (q) { delete q.placed; });
    props.push({ x: retreat.x, y: retreat.y, draw: function (c, sx, sy) { steps(c, sx, sy, true); c.save(); c.textAlign = 'center'; c.font = 'bold 10px Georgia, serif'; c.fillStyle = '#ffd0a0'; c.fillText('THE CINDERWAKE', sx, sy - 20); c.restore(); } });
    return finish({ name: 'The Boiling Descent', w: W, h: H, tiles: tiles, kind: kind, spawn: spawn, stairs: last, enemySpawns: spawns, chests: chests, props: props, lights: lights, drawStairs: function (c, sx, sy) { steps(c, sx, sy, false); } }, 1, seed, { retreat: retreat, geysers: geysers });
  }
  function core(rng, seed) {
    var W = SIZES[1][0], H = SIZES[1][1], tiles = new Uint8Array(W * H).fill(1), kind = new Uint8Array(W * H).fill(9), cx = 22, cy = 21, x, y, k;
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) { var d = Math.hypot(x - cx, y - cy); if (d <= 17) { tiles[y * W + x] = 0; kind[y * W + x] = 0; } }
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) { // the ring of lava, crossed by four causeways
      var dd = Math.hypot(x - cx, y - cy), an = Math.atan2(y - cy, x - cx), cross = false;
      for (k = 0; k < 4; k++) { var a = k * Math.PI / 2 + Math.PI / 4, off = Math.abs(Math.sin(an - a)) * dd; if (Math.cos(an - a) > 0 && off < 1.9) cross = true; }
      if (dd > 8.5 && dd < 12.5 && !cross) { tiles[y * W + x] = 1; kind[y * W + x] = LAVA; }
    }
    var spawn = point(cx, cy + 15), boss = point(cx, cy - 1), retreat = point(cx + 4, cy + 15), lights = [], props = [];
    var seen = reach(tiles, W, H, spawn.tx, spawn.ty);
    if (!seen[boss.ty * W + boss.tx]) return null;
    for (k = 0; k < 4; k++) { var pa = k * Math.PI / 2 + Math.PI / 4; var pp = point(Math.round(cx + Math.cos(pa) * 5.5), Math.round(cy + Math.sin(pa) * 5.5)); props.push({ x: pp.x, y: pp.y, draw: function (c, sx, sy) { pillar(c, sx, sy); } }); }
    for (k = 0; k < 10; k++) { var la = k * PI2 / 10; lights.push({ x: (cx + 0.5 + Math.cos(la) * 10.5) * T, y: (cy + 0.5 + Math.sin(la) * 10.5) * T, r: 110, color: '255,90,20', inten: 0.6, flicker: 0.18 }); }
    lights.push({ x: boss.x, y: boss.y, r: 190, color: '255,170,70', inten: 0.75, flicker: 0.1 });
    props.push({ x: retreat.x, y: retreat.y, draw: function (c, sx, sy) { steps(c, sx, sy, true); c.save(); c.textAlign = 'center'; c.font = 'bold 10px Georgia, serif'; c.fillStyle = '#ffd0a0'; c.fillText('THE DESCENT', sx, sy - 20); c.restore(); } });
    return finish({ name: 'The Core', w: W, h: H, tiles: tiles, kind: kind, spawn: spawn, enemySpawns: [{ x: boss.x, y: boss.y, type: 'emberheart' }], chests: [], props: props, lights: lights, playerLight: 150 }, 2, seed, { retreat: retreat, geysers: [], bossPoint: boss, center: point(cx, cy) });
  }

  /* ---------- art ---------- */
  function ground(kd, hv, tx, ty) { if (kd === LAVA) return hv < 0.5 ? '#c4350c' : '#d4440f'; var v = Math.floor(hv * 10); return 'rgb(' + (46 + v) + ',' + (36 + v) + ',' + (40 + v) + ')'; }
  function detail(c, kd, x, y, hv, t, tx, ty) {
    if (kd === LAVA) { // slow, bright swirls and bubbling
      var s = Math.sin(t * 1.3 + hv * 40 + tx * 0.5), a = 0.5 + 0.5 * s;
      c.fillStyle = 'rgba(255,200,70,' + (0.18 + 0.3 * a) + ')'; c.beginPath(); c.ellipse(x + 16 + Math.cos(t * 0.8 + hv * 9) * 6, y + 16 + s * 5, 9, 4, hv * 3, 0, PI2); c.fill();
      c.fillStyle = 'rgba(70,10,4,0.25)'; c.fillRect(x + hv * 20, y + 4 + hv * 16, 7, 2);
      if (hv > 0.88) { var u = (t * 0.6 + hv * 10) % 1; c.fillStyle = 'rgba(255,230,140,' + 0.8 * (1 - u) + ')'; c.beginPath(); c.arc(x + 8 + hv * 16, y + 22 - u * 14, 1.5 + u * 2, 0, PI2); c.fill(); }
      return;
    }
    if (hv > 0.9) { var g = 0.4 + 0.3 * Math.sin(t * 2 + hv * 50); c.strokeStyle = 'rgba(255,110,30,' + g + ')'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 4, y + T - 4); c.lineTo(x + T * 0.5, y + T * 0.45); c.lineTo(x + T - 3, y + T * 0.5); c.stroke(); }
    c.fillStyle = 'rgba(8,4,6,0.3)'; c.fillRect(x + hv * 22, y + 6, 6, 2);
  }
  function wall(c, kd, x, y, hv) { c.fillStyle = '#1a0f10'; c.fillRect(x, y, T, T); c.fillStyle = 'rgba(255,120,60,0.16)'; c.fillRect(x, y, T, 4); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x, y + T - 4, T, 4); if (hv > 0.7) { c.strokeStyle = 'rgba(255,100,30,0.35)'; c.beginPath(); c.moveTo(x + 5, y + T); c.lineTo(x + 13 + hv * 6, y + 12); c.stroke(); } }
  function haze(c, cam, map) { // embers rising and a red heat shimmer
    var t = map._t || 0, w = cam.w + 16, h = cam.h + 16;
    for (var i = 0; i < 46; i++) { var px = (i * 131.7 + Math.sin(t * 0.7 + i) * 18) % w - 8, py = h - ((i * 61.3 + t * (14 + i % 9)) % h) - 8, a = 0.3 + 0.35 * Math.sin(t * 3 + i); c.fillStyle = 'rgba(255,' + (140 + (i % 4) * 25) + ',50,' + a + ')'; c.fillRect(px, py, i % 5 === 0 ? 2 : 1, 2); }
  }
  function steps(c, x, y, up) { c.fillStyle = '#16100f'; c.fillRect(x - 16, y - 13, 32, 26); for (var i = 0; i < 4; i++) { c.fillStyle = up ? '#e8b480' : '#9a4a2a'; var ins = (up ? 3 - i : i) * 2; c.fillRect(x - 13 + ins, y - 9 + i * 5, 26 - ins * 2, 2); } }
  function pillar(c, x, y) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x, y + 8, 14, 5, 0, 0, PI2); c.fill(); c.fillStyle = '#2a1c1c'; c.fillRect(x - 8, y - 30, 16, 38); c.fillStyle = '#4a2a22'; c.fillRect(x - 8, y - 30, 4, 38); c.fillStyle = 'rgba(255,110,40,0.7)'; c.fillRect(x - 2, y - 24, 4, 20); }

  /* ---------- hazards: geysers and lava bursts, telegraphed then erupting ---------- */
  function hurt(p, amt, srcName) {
    if (!p || p.hp <= 0 || p.invuln > 0) return 0;
    var dmg = Math.max(1, Math.round(amt * 100 / (100 + (p.armor || 0))));
    p.hp -= dmg; p.invuln = 0.5; p.hurtFlash = 0.2;
    if (CC.fx) { if (CC.fx.shake) CC.fx.shake(4); if (CC.fx.text) CC.fx.text(p.x, p.y - 14, '-' + dmg, '#ff9a3a', 12); }
    return dmg;
  }
  function burst(x, y, r, delay, dmg) { if (EM.hazards.length < 40) EM.hazards.push({ x: x, y: y, r: r, t: 0, delay: delay, dmg: dmg, done: false }); }
  EM.burst = burst;
  function stepHazards(dt) {
    var p = hero(), i, h, m = active();
    for (i = EM.hazards.length - 1; i >= 0; i--) {
      h = EM.hazards[i]; h.t += dt;
      if (!h.done && h.t >= h.delay) { h.done = true; if (p && Math.hypot(p.x - h.x, p.y - h.y) < h.r + (p.r || 8)) hurt(p, h.dmg); if (CC.fx) { CC.fx.burst(h.x, h.y, '#ff8a2a', 16, 140); CC.fx.burst(h.x, h.y, '#ffe08a', 8, 90); if (h.r > 30) CC.fx.shake(3); } if (CC.Audio && CC.Audio.event) CC.Audio.event('explosion', { x: h.x, y: h.y }); }
      if (h.t > h.delay + 0.5) EM.hazards.splice(i, 1);
    }
    if (m && m.geysers) m.geysers.forEach(function (g) { g.t += dt; if (g.t >= g.period) { g.t = 0; burst(g.x, g.y, 34, 0.9, 12 + (m.floor || 1) * 2); g.warn = 0.9; } if (g.warn > 0) g.warn -= dt; });
  }
  function drawHazards(ctx, cam) {
    var i, h, t = E._time || 0;
    ctx.save();
    for (i = 0; i < EM.hazards.length; i++) {
      h = EM.hazards[i]; var x = h.x - cam.x, y = h.y - cam.y;
      if (!h.done) { var u = clamp(h.t / h.delay, 0, 1); ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 18); ctx.fillStyle = 'rgba(255,60,20,' + (0.12 + 0.25 * u) + ')'; ctx.beginPath(); ctx.ellipse(x, y, h.r, h.r * 0.7, 0, 0, PI2); ctx.fill(); ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.ellipse(x, y, h.r * u, h.r * u * 0.7, 0, 0, PI2); ctx.stroke(); }
      else { var e = (h.t - h.delay) / 0.5; ctx.globalAlpha = 1 - e; var g = ctx.createRadialGradient(x, y - 10 * e, 2, x, y - 10 * e, h.r * (1 + 0.4 * e)); g.addColorStop(0, 'rgba(255,240,170,0.95)'); g.addColorStop(0.5, 'rgba(255,120,30,0.75)'); g.addColorStop(1, 'rgba(180,30,10,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 10 * e, h.r * (1 + 0.4 * e), 0, PI2); ctx.fill(); }
    }
    ctx.restore();
  }

  /* ---------- the Emberheart ---------- */
  if (E && E.TYPES && !E.TYPES.emberheart) {
    E.TYPES.emberheart = { name: 'The Emberheart', hp: 1100, spd: 0, dmg: 18, r: 26, xp: 700, color: '#ff6a1a', w: 0, fire: true, blood: '#ff7a1a', telRad: 60 };
    var prevThink = E._think;
    E._think = function (e, dt, p, d, ang, f) {
      if (e.type !== 'emberheart') return prevThink.apply(this, arguments);
      e.cd -= dt; e.dangerous = false; e.anim = (e.anim || 0) + dt;
      var fr = e.hp / e.maxHp, ph = fr < 0.33 ? 3 : fr < 0.66 ? 2 : 1;
      if (ph !== e.phase) { if (e.phase) { shake(8); say(e, ph === 2 ? 'THE DEEP STIRS' : 'ERUPTION', '#ffb04a'); } e.phase = ph; }
      e.ringT = (e.ringT === undefined ? 2 : e.ringT) - dt; e.geyT = (e.geyT === undefined ? 3 : e.geyT) - dt; e.sumT = (e.sumT === undefined ? 9 : e.sumT) - dt; e.spinT = (e.spinT || 0) - dt;
      if (e.ringT <= 0) { // a ring of magma, with a gap that turns each cast
        e.ringT = ph === 1 ? 2.6 : ph === 2 ? 2.0 : 1.5; e.gap = ((e.gap === undefined ? -1 : e.gap) + 3) % 14; var n = ph === 3 ? 16 : 14, base = Math.random() * 0.2;
        for (var i = 0; i < n; i++) if (ph === 3 || i % 14 !== e.gap % 14) E._shoot(e, base + i * PI2 / n, 96 + ph * 12, e.dmg * 0.6, '#ff8a2a', 'orb', 3);
        shake(3); if (CC.fx) CC.fx.burst(e.x, e.y, '#ffb04a', 16, 120);
      }
      if (ph >= 2 && e.geyT <= 0 && p) { // lava bursts bloom around you
        e.geyT = ph === 2 ? 1.5 : 0.85; for (var g = 0; g < (ph === 3 ? 3 : 2); g++) burst(p.x + (Math.random() - 0.5) * 150, p.y + (Math.random() - 0.5) * 150, 32, 0.9, e.dmg * 0.7);
      }
      if (ph === 3 && e.spinT <= 0) { e.spinT = 0.2; e.spin = (e.spin || 0) + 0.5; E._shoot(e, e.spin, 150, e.dmg * 0.4, '#ffd070', 'orb', 2.4); } // the spiral
      if (ph >= 2 && e.sumT <= 0) { // cinder moths pour from the core
        e.sumT = 11; var alive = 0; E.list.forEach(function (o) { if (o.type === 'embermoth' && !o.dead) alive++; });
        if (alive < 6) for (var k = 0; k < 3; k++) { var m = E.spawn('embermoth', e.x + Math.cos(k * 2.1) * 50, e.y + Math.sin(k * 2.1) * 50, 8, { awake: true }); m.asleep = false; m.group = 9700; }
      }
    };
    var prevSpawnOne = E.spawn;
    E.spawn = function (type) { var e = prevSpawnOne.apply(this, arguments); if (type === 'emberheart') { e.miniBoss = true; e.noKnock = true; } return e; };
  }
  function shake(n) { if (CC.fx && CC.fx.shake) CC.fx.shake(n); }
  function say(e, s, col) { if (CC.fx && CC.fx.text) CC.fx.text(e.x, e.y - e.r - 24, s, col || '#ffb04a', 11); }
  function heartArt(ctx, e, r, col, dark, t) {
    var beat = 1 + 0.07 * Math.pow(Math.max(0, Math.sin(t * (2.4 + (e.phase || 1) * 0.5))), 3), R2 = r * beat, k, g;
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 1.2, r * 0.35, 0, 0, PI2); ctx.fill();
    g = ctx.createRadialGradient(0, -2, 2, 0, 0, R2 * 1.6); g.addColorStop(0, 'rgba(255,240,170,0.9)'); g.addColorStop(0.4, 'rgba(255,120,30,0.5)'); g.addColorStop(1, 'rgba(200,40,10,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R2 * 1.6, 0, PI2); ctx.fill(); // the glow
    g = ctx.createRadialGradient(-R2 * 0.2, -R2 * 0.25, 1, 0, 0, R2); g.addColorStop(0, '#fff2b0'); g.addColorStop(0.35, '#ff9a2a'); g.addColorStop(0.8, '#d43a10'); g.addColorStop(1, '#6a1408');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R2, 0, PI2); ctx.fill(); // the molten heart
    ctx.strokeStyle = 'rgba(70,10,4,0.7)'; ctx.lineWidth = 1.6; for (k = 0; k < 7; k++) { var a = k * 0.9 + 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R2 * 0.2, Math.sin(a) * R2 * 0.2); ctx.lineTo(Math.cos(a + 0.2) * R2 * 0.6, Math.sin(a + 0.2) * R2 * 0.6); ctx.lineTo(Math.cos(a - 0.1) * R2 * 0.95, Math.sin(a - 0.1) * R2 * 0.95); ctx.stroke(); }
    for (k = 0; k < 5; k++) { var oa = t * (0.5 + 0.12 * k) + k * 1.26, orad = R2 * (1.15 + 0.1 * (k % 2)); ctx.save(); ctx.translate(Math.cos(oa) * orad, Math.sin(oa) * orad * 0.7); ctx.rotate(oa * 2); ctx.fillStyle = '#1c1214'; ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(7, -3); ctx.lineTo(5, 5); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,110,40,0.7)'; ctx.stroke(); ctx.restore(); } // obsidian shards
    ctx.restore();
  }
  if (F && !F._emberDraw) {
    F._emberDraw = true;
    var prevDraw = F.drawMonster;
    F.drawMonster = function (ctx, e, r, col, dark, t) { if (e.type === 'emberheart') { heartArt(ctx, e, r, col, dark, t); return true; } return prevDraw ? prevDraw.apply(this, arguments) : false; };
  }
  var prevSpawn = E && E.spawnForFloor;
  if (E) E.spawnForFloor = function (floor, points) {
    if (!(CC.state && CC.state.area === 'emberdeep')) return prevSpawn.apply(this, arguments);
    this.list.length = 0; this.projectiles.length = 0; this.boss = null; this.zones = []; this.remains = []; if (this.gore) this.gore = [];
    EM.hazards.length = 0; if (CC.Loot && CC.Loot.clear) CC.Loot.clear();
    var lvl = 8 + (floor || 1), grp = 9800;
    for (var i = 0; i < points.length; i++) {
      var pt = points[i], k, e;
      if (pt.type === 'embermoth') { grp++; for (k = 0; k < 3; k++) { e = this.spawn('embermoth', pt.x + (R() - 0.5) * 40, pt.y + (R() - 0.5) * 40, lvl); e.group = grp; } }
      else { e = this.spawn(pt.type, pt.x, pt.y, lvl); if (e && pt.type !== 'emberheart') { e.maxHp *= 1.5; e.hp *= 1.5; e.dmg *= 1.25; } } // stronger down here
    }
    return this.list;
  };

  /* ---------- the boss bar, hazards per frame, and the curse breaking ---------- */
  function ending(e) {
    cursed = true; var p = hero(), m = active();
    if (p && CC.fx) CC.fx.text(p.x, p.y - 44, 'THE CURSE IS BROKEN', '#ffd36b', 15);
    shake(14); if (CC.Audio && CC.Audio.event) CC.Audio.event('newquest');
    if (CC.CinderwakeStory && CC.CinderwakeStory.markCore) CC.CinderwakeStory.markCore();
    if (CC.Loot && CC.Loot._spawn && CC.Loot.drops && CC.Loot.makeItem) { // a legendary from the heart of the earth
      var it = CC.Loot.makeItem(14, 4); CC.Loot.drops.push(CC.Loot._spawn('item', e.x, e.y, { item: it, rarity: it.rarity, color: it.color }));
      var s = CC.Loot.roll ? CC.Loot.roll({ x: e.x, y: e.y, boss: true }, 14, 6) : null;
    }
    if (m) { m.cursedEnd = true; EM.hazards.length = 0; }
    speech = { name: 'Halric Vane', text: 'The book... balances. The furnace is cold at last. Thank you, traveller. Let the valley have its winters back.', t0: Date.now(), more: true, next: 'The Emberdeep gutters out, and for the first time in a hundred years the ash stops falling over the valley. The curse is broken.' };
    if (CC.SaveGame && CC.SaveGame.save) CC.SaveGame.save();
  }
  if (E) {
    var prevKill = E._kill;
    E._kill = function (e) { var was = !!(e && e.dead), r = prevKill.apply(this, arguments); if (e && e.dead && !was && e.type === 'emberheart') { try { ending(e); } catch (err) { if (root.console) console.error(err); } } return r; };
    var prevUpdate = E.update;
    E.update = function (dt) {
      var r = prevUpdate.apply(this, arguments), m = active();
      if (m) {
        stepHazards(dt);
        var boss = null, i; for (i = 0; i < E.list.length; i++) if (E.list[i].type === 'emberheart' && !E.list[i].dead) boss = E.list[i];
        if (boss) { boss.bar = boss.bar || { name: 'The Emberheart', pct: 1, phase: 1, phases: 3, color: '#ff7a1a', intro: 0 }; if (E.boss !== boss) E.boss = boss; }
      } else if (E.boss && E.boss.type === 'emberheart') E.boss = null;
      return r;
    };
    var prevEDraw = E.draw;
    E.draw = function (ctx, cam) { var r = prevEDraw.apply(this, arguments); if (cam && active() && EM.hazards.length) drawHazards(ctx, cam); return r; };
  }

  /* ---------- travel, prompts and speech ---------- */
  function nearRetreat(m) { var p = hero(); return !!(m && p && m.retreat && Math.hypot(p.x - m.retreat.x, p.y - m.retreat.y) <= ACTION); }
  EM.enter = function () { return !!(CC.enterEmberdeep && CC.enterEmberdeep() !== false); };
  EM.leave = function () { return !!(CC.leaveEmberdeep && CC.leaveEmberdeep() !== false); };
  EM.nearAction = function () { var m = active(); return nearRetreat(m); };
  EM.interact = function () { var m = active(); if (nearRetreat(m)) return EM.leave(); return false; };
  EM.drawOverlay = function (c, W, Hh) {
    var m = active();
    if (m !== shown) { shown = m; titleAt = Date.now(); speech = null; }
    if (!m) return;
    var el = (Date.now() - titleAt) / 1000;
    if (el < 5) { c.save(); c.globalAlpha = Math.min(1, el / 0.55, (5 - el) / 1.25); c.textAlign = 'center'; c.shadowColor = '#d83a10'; c.shadowBlur = 14; c.fillStyle = '#ffe0c0'; c.font = 'italic ' + Math.min(42, W / 9) + 'px Georgia, serif'; c.fillText('The Emberdeep', W / 2, Hh * 0.28); c.font = '18px Georgia, serif'; c.fillText(m.name, W / 2, Hh * 0.28 + 28); c.restore(); }
    if (speech && CC.DialogBox) CC.DialogBox.draw(c, W, Hh, function () {}, { name: speech.name, text: speech.text, low: true, onTap: function () { var s = speech; speech = s && s.next ? { name: 'The Emberdeep', text: s.next, t0: Date.now() } : null; } });
  };
  EM.generate = generate;
  EM.reset = function () { cursed = false; speech = null; EM.hazards.length = 0; };
  EM.serialize = function () { return cursed ? 1 : 0; };
})(window);
