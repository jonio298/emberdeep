/* Emberdeep eagle companion. When the quest egg hatches (hero level 10) the eagle joins the hero for good:
 *   - it circles the hero when nothing is in sight, fights when something is, and flies loot back to the hero;
 *   - its attacks (unlocked as it levels with the hero: eagle level = hero level - 9): Dive Strike, Talon Flurry (lvl 3), Gale Sweep (lvl 6),
 *     Screech (lvl 10), Skyfall (lvl 15). Every hit can crit for double damage;
 *   - it sees farther than the hero: tiles around it are revealed on the map (fog of war), and its sight circle is drawn on the minimap.
 * API (CC.Eagle): update(dt) every game step, draw(ctx, cam) in world space, drawMinimap(ctx, sx, sy, sc), level(), sightTiles(), active(), reset().
 * Reads CC.EggQuest.status().hatched, CC.state.player, CC.Enemies.list, CC.Loot.drops, CC.Dungeon (explored, moveWithCollision); damage goes through
 * CC.Classes.hitEnemy as minion hits so it never triggers the hero's own critical scene or life steal.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, TAU = Math.PI * 2, E = null, clock = 0;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function hero() { var s = CC.state; return s && s.player && s.player.isHero ? s.player : null; }
  function alive(e) { return !!e && e.hp > 0 && !e.dead && !e.hidden; }
  function foes() { var l = CC.Enemies && CC.Enemies.list; return Array.isArray(l) ? l : []; }
  function fx() { return CC.fx || {}; }
  function active() {
    var q = CC.EggQuest, p = hero(), s = CC.state;
    return !!(q && q.status && q.status().hatched && p && s && (s.mode === 'town' || s.mode === 'dungeon'));
  }
  function level() { var p = hero(); return Math.max(1, ((p && p.level) || 10) - 9); }
  function sightTiles() { return 6 + Math.min(5, Math.floor(level() / 4)); }
  function dmgBase() { var p = hero(); return 4 + level() * 1.4 + ((p && p.stats && p.stats.dmg) || 10) * 0.4; }
  function critChance() { return Math.min(0.5, 0.12 + 0.012 * level()); }
  function text(x, y, s, c, size) { if (fx().text) fx().text(x, y, s, c, size); }
  function burst(x, y, c, n, sp) { if (fx().burst) fx().burst(x, y, c, n, sp); }

  function create(p) {
    E = { x: p.x, y: p.y - 10, z: 18, face: 1, flap: 0, ang: rnd(0, TAU), atk: null, carry: null, gcd: 1, lvl: level(), reveal: 0, bank: 0, fxs: [], trail: [], windup: 0,
      cd: { dive: 0, flurry: 1, gale: 3, screech: 4, skyfall: 7 }, tx: p.x, ty: p.y };
  }

  function moveTo(tx, ty, speed, dt, ease) {
    var dx = tx - E.x, dy = ty - E.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.5) return d;
    var step = ease ? Math.min(d, d * Math.min(1, dt * ease)) : Math.min(d, speed * dt);
    E.x += dx / d * step; E.y += dy / d * step;
    if (Math.abs(dx) > 2) E.face = dx > 0 ? 1 : -1;
    E.bank = dy / (d || 1) * 0.5;
    return d - step;
  }
  function knock(e, dist) {
    var dx = e.x - E.x, dy = e.y - E.y, l = Math.sqrt(dx * dx + dy * dy) || 1, D = CC.Dungeon;
    if (D && typeof D.moveWithCollision === 'function') { try { D.moveWithCollision(e, dx / l * dist, dy / l * dist); return; } catch (err) { /* fall through */ } }
    e.x += dx / l * dist; e.y += dy / l * dist;
  }
  function addFx(o) { o.max = o.t; E.fxs.push(o); if (E.fxs.length > 40) E.fxs.shift(); }

  // one talon hit: crit chance of its own, damage as a minion hit through the hero's damage code
  function strike(e, mult, claw) {
    if (!alive(e)) return 0;
    var crit = Math.random() < critChance(), dmg = dmgBase() * mult * (crit ? 2 : 1), dealt = 0;
    if (CC.Classes && CC.Classes.hitEnemy) dealt = CC.Classes.hitEnemy(e, dmg, 'slash', { noCrit: true, minion: true }); else e.hp -= dmg;
    if (claw !== false) addFx({ kind: 'claw', x: e.x, y: e.y, ang: rnd(-0.6, 0.6), t: 0.24, crit: crit });
    if (crit) {
      // an eagle crit is only the word and a small flash: no freeze, no black screen (those belong to the hero's own crits)
      text(e.x, e.y - (e.r || 8) - 16, 'Critical!', '#ffe27a', 11);
      burst(e.x, e.y, '#ffe27a', 12, 120); addFx({ kind: 'ring', x: e.x, y: e.y, r: 20, t: 0.25, col: '#ffe27a' });
    } else burst(e.x, e.y, '#f3e7c8', 4, 70);
    return dealt;
  }

  function nearbyFoes(p, r) {
    var out = [], l = foes(), i;
    for (i = 0; i < l.length; i++) { var e = l[i]; if (alive(e) && Math.hypot(e.x - p.x, e.y - p.y) <= r) out.push(e); }
    return out;
  }
  function closest(list, x, y) {
    var best = null, bd = 1e9, i;
    for (i = 0; i < list.length; i++) { var d = Math.hypot(list[i].x - x, list[i].y - y); if (d < bd) { bd = d; best = list[i]; } }
    return best;
  }
  function toughest(list) {
    var best = null, i;
    for (i = 0; i < list.length; i++) if (!best || (list[i].boss ? 1e6 : 0) + (list[i].maxHp || 0) > (best.boss ? 1e6 : 0) + (best.maxHp || 0)) best = list[i];
    return best;
  }

  /* ---------- attacks ---------- */
  function begin(kind, target) {
    E.atk = { kind: kind, t: 0, ph: 0, target: target, hit: [] };
    E.cd[kind] = { dive: 2.2, flurry: 5, gale: 7, screech: 9, skyfall: 14 }[kind];
    E.gcd = 0.35;
    if (kind === 'screech') text(E.x, E.y - E.z - 18, 'SCREECH!', '#bfe9ff', 10);
    if (CC.Audio) CC.Audio.fx('eagle', { x: E.x, y: E.y, vol: kind === 'screech' ? 0.9 : 0.5, gap: 300 });
    if (kind === 'skyfall') text(E.x, E.y - E.z - 18, 'SKYFALL!', '#ffd36b', 11);
  }

  function runAttack(dt, p) {
    var a = E.atk, t = a.target, k = a.kind, i, l;
    a.t += dt;
    if (k !== 'screech' && (!alive(t))) { // the target died: finish the move quietly
      if (k !== 'skyfall' || a.ph < 2) { E.atk = null; return; }
    }
    if (k === 'dive') {
      if (a.ph === 0) { // rise above and behind the target
        E.z += (38 - E.z) * Math.min(1, dt * 9); moveTo(t.x - E.face * 26, t.y, 260, dt);
        if (a.t > 0.3) { a.ph = 1; a.t = 0; a.sx = t.x; a.sy = t.y; }
      } else if (a.ph === 1) { // plunge
        var left = moveTo(t.x, t.y, 380, dt); E.z += (6 - E.z) * Math.min(1, dt * 14);
        if (left < 11 || a.t > 0.4) { strike(t, 1.5); knock(t, 6); if (fx().shake) fx().shake(2); a.ph = 2; a.t = 0; }
      } else { E.z += (30 - E.z) * Math.min(1, dt * 8); moveTo(p.x + 30 * E.face, p.y - 20, 240, dt); if (a.t > 0.25) E.atk = null; }
    } else if (k === 'flurry') {
      moveTo(t.x - E.face * 20, t.y - 4, 300, dt); E.z += (14 - E.z) * Math.min(1, dt * 10);
      var n = Math.floor(a.t / 0.14);
      if (n > a.ph && n <= 3) { a.ph = n; strike(t, 0.7); E.windup = 0.12; }
      if (a.t > 0.7) E.atk = null;
    } else if (k === 'gale') {
      var dx = t.x - p.x, dy = t.y - p.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
      if (a.ph === 0) {
        if (!a.dir) { a.dir = { x: dx / dl, y: dy / dl }; a.s = { x: t.x - a.dir.x * 90, y: t.y - a.dir.y * 90 }; }
        E.z += (16 - E.z) * Math.min(1, dt * 9);
        if (moveTo(a.s.x, a.s.y, 400, dt) < 8 || a.t > 0.6) { a.ph = 1; a.t = 0; addFx({ kind: 'wind', x: E.x, y: E.y, ang: Math.atan2(a.dir.y, a.dir.x), t: 0.4 }); }
      } else if (a.ph === 1) { // the sweep: everything in the path is cut and thrown aside
        E.x += a.dir.x * 640 * dt; E.y += a.dir.y * 640 * dt; E.face = a.dir.x >= 0 ? 1 : -1;
        l = foes();
        for (i = 0; i < l.length; i++) { var f = l[i]; if (alive(f) && a.hit.indexOf(f) < 0 && Math.hypot(f.x - E.x, f.y - E.y) < 20 + (f.r || 8)) { a.hit.push(f); strike(f, 1.1); knock(f, 14); } }
        if (a.t > 0.28) { a.ph = 2; a.t = 0; }
      } else { E.z += (26 - E.z) * Math.min(1, dt * 8); if (a.t > 0.2) E.atk = null; }
    } else if (k === 'screech') {
      moveTo(p.x, p.y - 6, 300, dt); E.z += (28 - E.z) * Math.min(1, dt * 9); E.windup = 0.2;
      if (a.ph === 0 && a.t > 0.35) {
        a.ph = 1; l = nearbyFoes(E, 85);
        for (i = 0; i < l.length; i++) { strike(l[i], 1.0, false); if (CC.Classes && CC.Classes.status) CC.Classes.status(l[i], 'stun', 1.0); }
        addFx({ kind: 'ring', x: E.x, y: E.y, r: 85, t: 0.5, col: '#bfe9ff' }); addFx({ kind: 'ring', x: E.x, y: E.y, r: 55, t: 0.4, col: '#ffffff' });
        if (fx().shake) fx().shake(3);
      }
      if (a.t > 0.6) E.atk = null;
    } else if (k === 'skyfall') {
      if (a.ph === 0) { // climb out of sight above the target
        E.z += (130 - E.z) * Math.min(1, dt * 6); moveTo(t.x, t.y, 320, dt);
        if (a.t > 0.55) { a.ph = 1; a.t = 0; a.ix = t.x; a.iy = t.y; }
      } else if (a.ph === 1) { // marker on the ground
        a.tx = alive(t) ? t.x : a.ix; a.ty = alive(t) ? t.y : a.iy; moveTo(a.tx, a.ty, 300, dt);
        if (a.t > 0.3) { a.ph = 2; a.t = 0; }
      } else if (a.ph === 2) { // plunge
        E.z += (0 - E.z) * Math.min(1, dt * 18); E.x += (a.tx - E.x) * Math.min(1, dt * 20); E.y += (a.ty - E.y) * Math.min(1, dt * 20);
        if (a.t > 0.17 || E.z < 6) {
          l = nearbyFoes({ x: a.tx, y: a.ty }, 55);
          for (i = 0; i < l.length; i++) { strike(l[i], 3.2); if (CC.Classes && CC.Classes.status) CC.Classes.status(l[i], 'stun', 0.6); }
          addFx({ kind: 'ring', x: a.tx, y: a.ty, r: 55, t: 0.5, col: '#ffd36b' }); burst(a.tx, a.ty, '#f3e7c8', 26, 160); burst(a.tx, a.ty, '#c9a15a', 12, 110);
          if (fx().shake) fx().shake(8); a.ph = 3; a.t = 0;
        }
      } else { E.z += (26 - E.z) * Math.min(1, dt * 7); if (a.t > 0.35) E.atk = null; }
    }
  }

  function chooseAttack(p, list) {
    var L = level(), cd = E.cd, pick = [], t = closest(list, E.x, E.y), tough = toughest(list);
    if (L >= 15 && cd.skyfall <= 0 && tough && (tough.boss || tough.elite || list.length >= 3)) return begin('skyfall', tough);
    if (L >= 10 && cd.screech <= 0 && nearbyFoes(p, 80).length >= 2) return begin('screech', t);
    if (L >= 6 && cd.gale <= 0 && list.length >= 2) pick.push('gale');
    if (L >= 3 && cd.flurry <= 0) pick.push('flurry');
    if (cd.dive <= 0) pick.push('dive');
    if (pick.length) begin(pick[Math.floor(Math.random() * pick.length)], t);
  }

  /* ---------- loot ---------- */
  function dropsNear(p) {
    var L = CC.Loot && CC.Loot.drops, out = [], i;
    if (!Array.isArray(L)) return out;
    for (i = 0; i < L.length; i++) if (!L[i].carried && (L[i].age || 0) >= 0.6 && Math.hypot(L[i].x - p.x, L[i].y - p.y) < 260) out.push(L[i]);
    return out;
  }
  function stillThere(d) { var L = CC.Loot && CC.Loot.drops; return Array.isArray(L) && L.indexOf(d) >= 0; }

  /* ---------- fog of war ---------- */
  function reveal() {
    var D = CC.Dungeon, T = CC.TILE || 32;
    if (!D || !D.explored || !D.w || !D.h) return;
    var R = sightTiles(), tx = Math.floor(E.x / T), ty = Math.floor(E.y / T), x, y, W = D.w, H = D.h, changed = false;
    for (y = Math.max(0, ty - R); y <= Math.min(H - 1, ty + R); y++) for (x = Math.max(0, tx - R); x <= Math.min(W - 1, tx + R); x++) {
      if ((x - tx) * (x - tx) + (y - ty) * (y - ty) > R * R) continue;
      if (!D.explored[y * W + x]) { D.explored[y * W + x] = 1; changed = true; }
    }
    if (changed) D._mmDirty = true;
  }

  /* ---------- update ---------- */
  function update(dt) {
    clock += dt;
    var p = hero();
    if (!active()) { E = null; return; }
    if (!E) create(p);
    var L = level();
    if (L > E.lvl) { E.lvl = L; text(E.x, E.y - E.z - 20, 'EAGLE LEVEL ' + L, '#ffe27a', 12); burst(E.x, E.y - E.z, '#ffe27a', 22, 120);
      var names = { 3: 'Talon Flurry', 6: 'Gale Sweep', 10: 'Screech', 15: 'Skyfall' }; if (names[L]) text(E.x, E.y - E.z - 34, 'NEW: ' + names[L], '#bfe9ff', 10); }
    E.lvl = L;
    E.flap += dt * (E.atk ? 22 : 13 + Math.abs(E.z - 18) * 0.05);
    E.gcd -= dt; E.windup = Math.max(0, E.windup - dt);
    for (var k in E.cd) E.cd[k] = Math.max(0, E.cd[k] - dt);
    for (var i = E.fxs.length - 1; i >= 0; i--) { E.fxs[i].t -= dt; if (E.fxs[i].t <= 0) E.fxs.splice(i, 1); }
    E.reveal -= dt; if (E.reveal <= 0) { E.reveal = 0.2; reveal(); }
    if (E.script) { // a cutscene flies the eagle (CC.RockPass scouting)
      var sc = E.script; E.atk = null; E.carry = null; E.x = sc.x; E.y = sc.y; E.z = sc.z; E.bank = 0.3 * Math.sin(clock * 3);
      E.trail.push({ x: E.x, y: E.y - E.z }); if (E.trail.length > 7) E.trail.shift();
      return;
    }
    if (Math.hypot(E.x - p.x, E.y - p.y) > 420) { E.x = p.x; E.y = p.y - 10; E.atk = null; E.carry = null; }
    E.trail.push({ x: E.x, y: E.y - E.z }); if (E.trail.length > 7) E.trail.shift();

    var inDungeon = CC.state.mode === 'dungeon', list = inDungeon ? nearbyFoes(p, 190) : [];
    if (E.atk) { runAttack(dt, p); return; }
    if (E.carry) { // carry loot to the hero
      var d = E.carry;
      if (!stillThere(d)) { E.carry = null; return; }
      d.x = E.x; d.y = E.y; d.age = 0; d.z = Math.max(0, E.z - 10); d.vz = 0;
      E.z += (16 - E.z) * Math.min(1, dt * 6);
      if (moveTo(p.x, p.y, 260, dt) < 22) { d.carried = false; d.x = p.x + rnd(-4, 4); d.y = p.y + rnd(-3, 3); d.age = 1; d.z = 0; E.carry = null; text(p.x, p.y - 22, 'Eagle fetched it', '#f3e7c8', 9); }
      return;
    }
    if (list.length && E.gcd <= 0) { chooseAttack(p, list); if (E.atk) return; }
    if (list.length) { // circle the nearest foe between attacks
      var t = closest(list, p.x, p.y); E.ang += dt * 3.2;
      moveTo(t.x + Math.cos(E.ang) * 42, t.y + Math.sin(E.ang) * 24, 0, dt, 5); E.z += (24 + Math.sin(clock * 3) * 4 - E.z) * Math.min(1, dt * 5); return;
    }
    var dr = inDungeon ? dropsNear(p) : [];
    if (dr.length) { // fetch the nearest drop
      var best = closest(dr, E.x, E.y); E.z += (10 - E.z) * Math.min(1, dt * 6);
      if (moveTo(best.x, best.y, 280, dt) < 12) { E.carry = best; best.carried = true; best.age = 0; }
      return;
    }
    E.ang += dt * 1.9; // nothing in sight: fly circles around the hero
    moveTo(p.x + Math.cos(E.ang) * 42, p.y + Math.sin(E.ang) * 26 - 4, 0, dt, 6);
    E.z += (18 + Math.sin(clock * 2.3) * 4 - E.z) * Math.min(1, dt * 4);
    E.face = Math.cos(E.ang + 1.57) >= 0 ? -1 : 1; E.face = -E.face; // face the way it flies around the circle
    E.bank = Math.cos(E.ang) * 0.25;
  }

  /* ---------- drawing ---------- */
  function line(c, x1, y1, x2, y2, col, w) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }

  // one talon glove with the claws out; reach 0..1 spreads and lengthens the claws
  function talon(c, x, y, reach) {
    c.save(); c.translate(x, y);
    line(c, 0, -4, 0, 0, '#d9a93a', 1.6); // yellow leg
    c.fillStyle = '#3f4452'; c.fillRect(-2.6, -0.5, 5.2, 3.2); // gauntlet cuff
    c.fillStyle = '#c08a3a'; c.fillRect(-2.9, -0.8, 5.8, 1); // bronze rim
    c.fillStyle = '#5b6272'; c.beginPath(); c.moveTo(-2.4, 2.6); c.lineTo(2.8, 2.6); c.lineTo(3.4, 4.4); c.lineTo(-1.6, 4.8); c.closePath(); c.fill(); // glove
    c.fillStyle = '#d6b05a'; c.fillRect(-1.4, 3, 0.9, 0.9); c.fillRect(0.6, 3, 0.9, 0.9); // knuckle studs
    var len = 3.6 + 3.6 * reach, i;
    for (i = 0; i < 3; i++) { // three claws forward and down, curved
      var a = 0.35 + i * 0.42 + reach * 0.15 * (i - 1), cx = 2.4 + i * -1.4, cy = 4.4;
      c.strokeStyle = '#eef3fa'; c.lineWidth = 1.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo(cx + Math.cos(a) * len * 0.8, cy + Math.sin(a) * len * 0.5 + 1, cx + Math.cos(a) * len * 0.9 + 1.2, cy + Math.sin(a) * len + 1.2); c.stroke();
      c.fillStyle = '#ffffff'; c.fillRect(cx + Math.cos(a) * len * 0.9 + 0.6, cy + Math.sin(a) * len + 0.8, 1, 1);
    }
    line(c, -2, 4, -4 - reach * 2, 6.5 + reach, '#eef3fa', 1.3); // the back claw
    c.restore();
  }

  function bird(c, flap, reach, spread, lvl) {
    var wingA = -0.95 + Math.sin(flap) * 0.85, i, a, len;
    function wing(side, shade) {
      for (i = 0; i < 6; i++) {
        a = wingA - 0.5 + i * 0.2; len = 17 - i * 1.4 + spread * 2;
        c.strokeStyle = i > 3 ? '#2a1a0e' : shade; c.lineWidth = 3.6 - i * 0.12; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-2 + side, -3); c.lineTo(-2 + side + Math.sin(a) * len * 0.35 - 3 - i * 0.6, -3 + Math.cos(a - 1.3) * len * 0.55 * (side ? 1 : 0.9) - 9 * (side ? 0 : 0.5)); c.stroke();
      }
    }
    // tail fan
    c.fillStyle = '#f1ead8'; c.beginPath(); c.moveTo(-8, -1); c.lineTo(-19, -4); c.lineTo(-20, 0); c.lineTo(-19, 4); c.lineTo(-8, 2); c.closePath(); c.fill();
    c.fillStyle = '#4a2f18'; c.fillRect(-19, -3, 3.5, 6);
    // far wing, body, near wing
    c.save(); c.globalAlpha = 0.85; c.translate(1, -1); c.scale(1, 0.9); wing(0, '#5a3a1f'); c.restore();
    c.fillStyle = '#7b4f2a'; c.beginPath(); c.ellipse(0, 0, 10, 5.6, 0, 0, TAU); c.fill();
    c.fillStyle = '#a9783f'; c.beginPath(); c.ellipse(1.5, 2, 6.5, 3, 0.1, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(40,24,10,.55)'; c.lineWidth = 0.8; for (i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-3 + i * 3, 1.4); c.lineTo(-2 + i * 3, 3.4); c.stroke(); }
    wing(1, '#8a5a2a');
    // head: white, hooked yellow beak, fierce eye
    c.fillStyle = '#f6f0df'; c.beginPath(); c.arc(9, -3.2, 4.8, 0, TAU); c.fill();
    if (lvl >= 10) { c.fillStyle = '#f6f0df'; c.beginPath(); c.moveTo(5, -6); c.lineTo(2.5, -9.5); c.lineTo(7, -7.4); c.fill(); } // crest feathers
    c.fillStyle = '#e8b23a'; c.beginPath(); c.moveTo(12.4, -4.6); c.quadraticCurveTo(18.8, -3.8, 17.6, 0.4); c.lineTo(16.2, -0.6); c.quadraticCurveTo(14.4, -2.2, 12.4, -1.4); c.closePath(); c.fill();
    c.fillStyle = '#b8801a'; c.fillRect(13.4, -2.9, 2.4, 0.8);
    c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(10.6, -4.1, 1.5, 0, TAU); c.fill();
    c.fillStyle = '#120b04'; c.beginPath(); c.arc(10.9, -4.1, 0.85, 0, TAU); c.fill();
    c.strokeStyle = '#3a2410'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(8.6, -6.4); c.lineTo(12.4, -4.9); c.stroke(); // angry brow
    // talon gloves, claws out
    talon(c, 1, 4.2, reach); talon(c, 5.6, 4.6, reach);
  }

  function drawFx(c, cam) {
    var i, f, u;
    for (i = 0; i < E.fxs.length; i++) {
      f = E.fxs[i]; u = f.t / f.max;
      var sx = f.x - cam.x, sy = f.y - cam.y;
      c.save(); c.globalAlpha = Math.min(1, u * 1.4); c.lineCap = 'round';
      if (f.kind === 'claw') {
        c.translate(sx, sy - 6); c.rotate(f.ang);
        for (var k = -1; k <= 1; k++) { var o = k * 5; line(c, -9 + o * 0.3, -9 + o, 9 + o * 0.3, 9 + o, f.crit ? '#ffe27a' : '#ffffff', 2.4 * u + 0.6); line(c, -9 + o * 0.3, -9 + o, 9 + o * 0.3, 9 + o, 'rgba(255,200,90,.5)', 5 * u); }
      } else if (f.kind === 'ring') {
        c.strokeStyle = f.col; c.lineWidth = 3 * u + 0.8; c.beginPath(); c.arc(sx, sy, f.r * (1 - u * 0.85 + 0.15), 0, TAU); c.stroke();
      } else if (f.kind === 'wind') {
        c.translate(sx, sy); c.rotate(f.ang); c.strokeStyle = '#d8f2ff'; c.lineWidth = 1.6;
        for (var w = 0; w < 4; w++) { c.beginPath(); c.moveTo(-60 - w * 8, -8 + w * 5); c.quadraticCurveTo(-10, -12 + w * 5, 70, -8 + w * 5); c.stroke(); }
      }
      c.restore();
    }
  }

  function draw(c, cam) {
    if (!E || !active()) return;
    var a = E.atk, reach = E.windup > 0 || (a && (a.kind === 'dive' && a.ph === 1 || a.kind === 'flurry' || a.kind === 'skyfall' && a.ph >= 2)) ? 1 : 0.35;
    var sx = E.x - cam.x, sy = E.y - cam.y;
    // ground marker for Skyfall and a shadow that shrinks with height
    if (a && a.kind === 'skyfall' && a.ph >= 1 && a.ph < 3) {
      var u = a.ph === 1 ? a.t / 0.3 : 1; c.save(); c.globalAlpha = 0.5; c.strokeStyle = '#ff7a3a'; c.lineWidth = 2; c.beginPath(); c.arc((a.tx || E.x) - cam.x, (a.ty || E.y) - cam.y, 55 * (1.1 - 0.6 * u), 0, TAU); c.stroke();
      c.fillStyle = 'rgba(255,90,40,.15)'; c.fill(); c.restore();
    }
    c.save(); c.globalAlpha = Math.max(0.12, 0.38 - E.z / 360); c.fillStyle = '#000'; c.beginPath(); c.ellipse(sx, sy + 4, Math.max(4, 11 - E.z * 0.06), 3.2, 0, 0, TAU); c.fill(); c.restore();
    // motion trail
    for (var i = 0; i < E.trail.length - 1; i++) { c.globalAlpha = i / E.trail.length * 0.25; c.fillStyle = '#e8d9b0'; c.beginPath(); c.arc(E.trail[i].x - cam.x, E.trail[i].y - cam.y, 2.2, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    var sc = 0.85 + Math.min(0.5, level() * 0.022);
    c.save(); c.translate(sx, sy - E.z); c.rotate(E.bank * 0.4 * E.face); c.scale(E.face * sc, sc);
    if (level() >= 10) { c.shadowColor = level() >= 20 ? '#9fd8ff' : '#ffd36b'; c.shadowBlur = level() >= 20 ? 9 : 5; }
    if (E.carry) { c.fillStyle = E.carry.item && E.carry.item.color || '#ffd24a'; c.beginPath(); c.arc(3.4, 10, 2.6, 0, TAU); c.fill(); }
    bird(c, E.flap, reach, a && a.kind === 'screech' ? 1 : 0, level());
    c.restore();
    drawFx(c, cam);
    c.save(); c.globalAlpha = 0.85; c.textAlign = 'center'; c.font = 'bold 7px Georgia'; c.fillStyle = '#ffe9a8'; c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineWidth = 2;
    var tag = (petName ? petName + '  ' : '') + 'Lv ' + level();
    c.strokeText(tag, sx, sy - E.z - 14); c.fillText(tag, sx, sy - E.z - 14); c.restore();
  }

  /* ---------- the hatching scene (hero level 10) ---------- */
  var NAMES = ['Emberwing', 'Skyreaver', 'Ashtalon', 'Stormclaw', 'Dawnfeather', 'Cinderbeak', 'Talonfire', 'Galewing', 'Ironquill', 'Duskrazor'], petName = '', scene = null, keyBound = false;
  function randomName(not) { var n; do { n = NAMES[Math.floor(Math.random() * NAMES.length)]; } while (n === not && NAMES.length > 1); return n; }
  function finish() {
    var s = scene; if (!s) return;
    petName = s.name; scene = null;
    if (s.done) s.done(petName);
  }
  function beginHatch(done) {
    if (scene) return;
    scene = { t0: Date.now(), name: randomName(), done: done, hits: 0 };
    if (!keyBound && typeof root.addEventListener === 'function') {
      keyBound = true;
      root.addEventListener('keydown', function (e) { if (scene && sceneTime() > 3.6 && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); finish(); } });
    }
  }
  function sceneTime() { return scene ? (Date.now() - scene.t0) / 1000 : 0; }
  function setName(n) { petName = String(n || '').slice(0, 16); }

  function drawScene(c, W, H, addHit) {
    if (!scene) return;
    var t = sceneTime(), cx = W / 2, cy = H * 0.4, i;
    c.save();
    c.globalAlpha = Math.min(0.88, t / 0.8); c.fillStyle = '#05040a'; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (t < 3.3) { // the egg in the bag wobbles, cracks, then bursts
      var shake = Math.sin(t * (14 + t * 6)) * Math.min(1, t / 2) * (3 + t * 2);
      c.save(); c.translate(cx + shake, cy); c.rotate(shake * 0.02);
      c.shadowColor = '#ffd98a'; c.shadowBlur = 10 + t * 8;
      c.fillStyle = '#efe0bd'; c.beginPath(); c.ellipse(0, 0, 26, 34, 0, 0, TAU); c.fill(); c.shadowBlur = 0;
      c.fillStyle = 'rgba(120,90,50,.35)'; for (i = 0; i < 5; i++) { c.beginPath(); c.arc(-12 + i * 6, -10 + (i % 2) * 14, 3, 0, TAU); c.fill(); }
      c.strokeStyle = '#4a3418'; c.lineWidth = 1.6;
      var cracks = t > 1.0 ? Math.min(5, Math.floor((t - 1.0) * 2.4) + 1) : 0;
      for (i = 0; i < cracks; i++) { c.beginPath(); c.moveTo(-8 + i * 4, -30 + i * 3); c.lineTo(-3 + i * 3, -14 + i * 4); c.lineTo(-10 + i * 5, 0 + i * 3); c.lineTo(-2 + i * 4, 12 + i * 2); c.stroke(); }
      c.restore();
      c.font = 'italic 15px Georgia'; c.fillStyle = '#f0dfae';
      var msg = 'Something is moving in your bag...', shown = Math.min(msg.length, Math.floor(t * 18));
      c.fillText(msg.slice(0, shown), cx, cy + 70);
    } else {
      var u = t - 3.3;
      if (u < 0.35) { c.globalAlpha = 1 - u / 0.35; c.fillStyle = '#fff6da'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; } // the flash as the shell breaks
      for (i = 0; i < 14; i++) { var a = i / 14 * TAU, d = Math.min(1, u * 1.4) * (40 + (i % 3) * 18); c.fillStyle = '#efe0bd'; c.fillRect(cx + Math.cos(a) * d - 2, cy + Math.sin(a) * d * 0.8 - 2, 5, 4); } // shell pieces
      c.save(); c.translate(cx, cy + 4); var grow = Math.min(1, u * 1.6); c.scale(4.2 * (0.4 + 0.6 * grow), 4.2 * (0.4 + 0.6 * grow));
      c.shadowColor = '#ffd98a'; c.shadowBlur = 6; bird(c, t * 9, 0.6, 0, 1); c.restore();
      if (t > 3.6) {
        c.font = 'bold 18px Georgia'; c.fillStyle = '#ffe9a8'; c.fillText('Your eagle has hatched!', cx, cy + 74);
        c.font = '13px Georgia'; c.fillStyle = '#d8cdb8'; c.fillText('Give it a name', cx, cy + 98);
        c.font = 'bold 26px Georgia'; c.fillStyle = '#ffffff'; c.shadowColor = '#ffb24a'; c.shadowBlur = 10; c.fillText(scene.name, cx, cy + 130); c.shadowBlur = 0;
        var bw = Math.min(150, W * 0.42), by = cy + 160;
        function btn(x, y, w, label, col, cb) {
          c.fillStyle = col; c.fillRect(x, y, w, 30); c.strokeStyle = '#c9a15a'; c.lineWidth = 1.5; c.strokeRect(x, y, w, 30);
          c.font = 'bold 12px Georgia'; c.fillStyle = '#fff'; c.fillText(label, x + w / 2, y + 15.5); addHit(x, y, w, 30, cb);
        }
        btn(cx - bw - 4, by, bw, 'Another name', '#3a2e4a', function () { scene.name = randomName(scene.name); });
        btn(cx + 4, by, bw, 'Type a name', '#2e3a4a', function () {
          var v = typeof root.prompt === 'function' ? root.prompt('Name your eagle (up to 16 letters):', scene.name) : null;
          if (v && v.trim()) scene.name = v.trim().slice(0, 16);
        });
        btn(cx - bw - 4, by + 40, bw * 2 + 8, 'Keep "' + scene.name + '"  [Enter]', '#3a5a2a', finish);
      }
    }
    c.restore();
  }

  // minimap: the eagle's sight circle and a small bird; sx / sy map world px to minimap px, sc is minimap px per tile
  function drawMinimap(c, sx, sy, sc) {
    if (!E || !active()) return;
    var x = sx(E.x), y = sy(E.y), r = sightTiles() * sc;
    c.save(); c.fillStyle = 'rgba(150,225,255,0.10)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.setLineDash([3, 3]); c.strokeStyle = 'rgba(190,235,255,0.6)'; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
    c.translate(x, y); c.scale(E.face, 1);
    c.fillStyle = '#10141c'; c.beginPath(); c.moveTo(-5, 3); c.lineTo(0, -4); c.lineTo(5, 3); c.lineTo(0, 1); c.closePath(); c.fill();
    c.fillStyle = '#ffe9a8'; c.beginPath(); c.moveTo(-4, 2); c.lineTo(0, -3); c.lineTo(4, 2); c.lineTo(0, 0.6); c.closePath(); c.fill();
    c.restore();
  }

  CC.Eagle = { update: update, draw: draw, drawMinimap: drawMinimap, level: level, sightTiles: sightTiles, active: active,
    beginHatch: beginHatch, drawScene: drawScene, sceneActive: function () { return !!scene; }, setName: setName, name: function () { return petName; },
    reset: function () { E = null; scene = null; petName = ''; }, _state: function () { return E; } };
})(typeof window !== 'undefined' ? window : globalThis);
