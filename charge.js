/* Emberdeep charge attacks: hold Space (or the ATK button) past a short tap window to charge, release to unleash.
 * A tap still performs the normal attack (the shell fires that on press). Each class has its own charge look and release:
 *   swordsman   Earthsplitter  - a travelling shockwave that hurls foes back and stuns them
 *   wizard      Meteor Call    - a telegraphed meteor drops on the nearest foe (or ahead) and explodes
 *   necromancer Bone Tide      - a draining nova that heals you and raises skeletons
 *   thief       Shadow Flurry  - blink through several nearby foes, backstabbing each
 * API (CC.Charge): update(dt, holding), draw(ctx, cam), cancel(), state. The shell calls update after Classes.update.
 * Uses only public APIs: CC.Classes.hitEnemy/status/heal/minions, CC.Enemies.list, CC.Dungeon.moveWithCollision, CC.fx.
 * Cost: 30% of max mana (min 12) paid on release, plus an 8s cooldown. Release before ARM seconds fizzles for free.
 */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var CC = root.CC = root.CC || {};

  var TAP = 0.22;   // seconds held before a press counts as charging (shorter = just the normal attack)
  var FULL = 1.1;   // seconds of charging for full power
  var ARM = 0.4;    // minimum charge time for the release to fire
  var COOLDOWN = 8;
  var st = { hold: 0, on: false, t: 0, cool: 0, coolMax: COOLDOWN, anim: 0, warned: false, flashed: false };
  var effects = [];

  var NAMES = { swordsman: 'Earthsplitter', wizard: 'Meteor Call', necromancer: 'Bone Tide', thief: 'Shadow Flurry' };
  var COLORS = { swordsman: '#ff8a4a', wizard: '#8fd8ff', necromancer: '#7dff9a', thief: '#b9a6ff' };

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function fx() { return CC.fx || null; }
  function text(x, y, s, c, size) { var f = fx(); if (f && f.text) f.text(x, y, s, c, size); }
  function burst(x, y, c, n, sp) { var f = fx(); if (f && f.burst) f.burst(x, y, c, n, sp); }
  function shake(v) { var f = fx(); if (f && f.shake) f.shake(v); }
  function player() {
    var s = CC.state, p = s && s.player;
    return p && p.isHero && p.stats && s.mode === 'dungeon' ? p : null;
  }
  function foes() { var l = CC.Enemies && CC.Enemies.list; return Array.isArray(l) ? l : []; }
  function alive(e) { return !!e && e.hp > 0 && !e.dead; }
  function cost(p) { return Math.max(12, Math.round(p.maxMana * 0.3)); }
  function hit(e, dmg, type) { return CC.Classes && CC.Classes.hitEnemy ? CC.Classes.hitEnemy(e, dmg, type) : 0; }
  function status(e, k, t, m) { if (CC.Classes && CC.Classes.status) CC.Classes.status(e, k, t, m); }

  function move(e, dx, dy) {
    var D = CC.Dungeon;
    if (D && typeof D.moveWithCollision === 'function') { try { D.moveWithCollision(e, dx, dy); return; } catch (err) { /* fall through */ } }
    e.x += dx; e.y += dy;
  }
  function knock(e, fx0, fy0, dist) {
    var dx = e.x - fx0, dy = e.y - fy0, l = Math.sqrt(dx * dx + dy * dy) || 1;
    move(e, dx / l * dist, dy / l * dist);
  }
  function nearest(x, y, range) {
    var best = null, bd = range * range, l = foes();
    for (var i = 0; i < l.length; i++) {
      var e = l[i]; if (!alive(e)) continue;
      var dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = e; }
    }
    return best;
  }
  function aim(p) {
    var t = nearest(p.x, p.y, 170), dx, dy;
    if (t) { dx = t.x - p.x; dy = t.y - p.y; } else { dx = p.aimX || p.face || 1; dy = p.aimY || 0; }
    var l = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / l, y: dy / l, target: t };
  }

  /* ---------- release effects ---------- */
  function skillIndex(p) { return CC.SkillTree && CC.SkillTree.chargeSelected ? CC.SkillTree.chargeSelected(p) : 0; }
  function skillName(p) { var l = CC.SkillTree && CC.SkillTree.chargeSkills(p.classId); var i = skillIndex(p); return l && l[i] ? l[i].name : NAMES[p.classId]; }
  function within(p, r) { return foes().filter(function (f) { return alive(f) && Math.hypot(f.x - p.x, f.y - p.y) <= r + (f.r || 8); }); }
  function later(t, fn) { effects.push({ kind: 'later', t: t, max: t, fn: fn, x: 0, y: 0 }); }
  function ring(x, y, rad, col, t) { effects.push({ kind: 'ring', x: x, y: y, rad: rad, col: col, t: t, max: t }); }
  function beam(x, y, x2, y2, col, t) { effects.push({ kind: 'beam', x: x, y: y, x2: x2, y2: y2, col: col, t: t, max: t }); }

  // The charge attacks unlocked at levels 10, 20 and 30 (CC.SkillTree.CHARGE, index 1-3); index 0 is each class's original attack in release().
  function releaseSkill(p, cls, idx, pow, a, scale) {
    var dmg = p.stats.dmg, i, l, e;
    if (cls === 'swordsman') {
      if (idx === 1) { // Blade Storm: three spinning cuts around the hero
        for (i = 0; i < 3; i++) (function (n) {
          later(0.14 * n, function () {
            within(p, 62).forEach(function (f) { hit(f, dmg * 1.7 * scale, 'slash'); knock(f, p.x, p.y, 6); });
            if (CC.Vfx) CC.Vfx.spawn('bladeStorm', p.x, p.y, 62, {}); else ring(p.x, p.y, 62, '#ffffff', 0.25);
            burst(p.x, p.y, '#ffd36b', 14, 130); shake(3);
          });
        })(i);
      } else if (idx === 2) { // Dragon Rush: a long cutting dash
        var len = 130 + 40 * pow, steps = 10, hitList = [], sx = p.x, sy = p.y;
        p.iframes = Math.max(p.iframes || 0, 0.5);
        for (i = 0; i < steps; i++) {
          move(p, a.x * len / steps, a.y * len / steps);
          within(p, 14).forEach(function (f) { if (hitList.indexOf(f) < 0) { hitList.push(f); hit(f, dmg * 3.4 * scale, 'slash'); burst(f.x, f.y, '#ffd36b', 10, 120); } });
        }
        if (CC.Vfx) CC.Vfx.spawn('rush', sx, sy, 0, { x2: p.x, y2: p.y }); else beam(sx, sy, p.x, p.y, '#ffffff', 0.4);
        shake(6);
      } else { // Sky Cleaver: three huge shockwaves
        [-0.5, 0, 0.5].forEach(function (off) {
          var ca = Math.atan2(a.y, a.x) + off;
          effects.push({ kind: 'wave', x: p.x, y: p.y, dx: Math.cos(ca), dy: Math.sin(ca), run: 0, range: 240 + 80 * pow, w: 26, dmg: dmg * 4.2 * scale, hit: [], trail: [] });
        });
        shake(9); burst(p.x, p.y, '#ff8a4a', 30, 160); ring(p.x, p.y, 50, '#ffd0a0', 0.4);
        if (CC.Vfx) [-0.5, 0, 0.5].forEach(function (off) { CC.Vfx.spawn('earthSpikes', p.x, p.y, 240 + 80 * pow, { a: Math.atan2(a.y, a.x) + off }); });
      }
    } else if (cls === 'wizard') {
      if (idx === 1) { // Chain Lightning
        var cur = { x: p.x, y: p.y }, left = foes().filter(function (f) { return alive(f) && Math.hypot(f.x - p.x, f.y - p.y) <= 190; }), n = 0;
        var chainPts = [{ x: p.x, y: p.y }];
        while (left.length && n < 6) {
          left.sort(function (u, v) { return Math.hypot(u.x - cur.x, u.y - cur.y) - Math.hypot(v.x - cur.x, v.y - cur.y); });
          e = left.shift(); chainPts.push({ x: e.x, y: e.y }); if (!CC.Vfx) beam(cur.x, cur.y, e.x, e.y, '#bfe9ff', 0.35); hit(e, dmg * (3.2 - n * 0.3) * scale, 'arcane'); status(e, 'stun', 0.5);
          burst(e.x, e.y, '#bfe9ff', 10, 110); cur = { x: e.x, y: e.y }; n++;
        }
        if (CC.Vfx && chainPts.length > 1) CC.Vfx.chain(chainPts); // forked yellow lightning, and the sky flashes
        shake(4);
      } else if (idx === 2) { // Blizzard
        var rad = 96 + 20 * pow; if (CC.Vfx) CC.Vfx.spawn('blizzard', p.x, p.y, rad, { life: 0.9 }); else ring(p.x, p.y, rad, '#9fe3ff', 0.7);
        for (i = 0; i < 4; i++) (function (k) {
          later(0.18 * k, function () { within(p, rad).forEach(function (f) { hit(f, dmg * 1.3 * scale, 'frost'); status(f, 'slow', 3, 0.4); }); burst(p.x, p.y, '#cfefff', 18, 150); });
        })(i);
        shake(4);
      } else { // Meteor Storm
        var tg = foes().filter(function (f) { return alive(f) && Math.hypot(f.x - p.x, f.y - p.y) <= 200; });
        for (i = 0; i < 5; i++) (function (k) {
          later(0.22 * k, function () {
            var f = tg.length ? tg[k % tg.length] : null, live = f && alive(f);
            var tx = live ? f.x : p.x + a.x * (50 + k * 20) + rnd(-30, 30), ty = live ? f.y : p.y + a.y * (50 + k * 20) + rnd(-30, 30);
            effects.push({ kind: 'meteor', x: tx, y: ty, t: 0.6, max: 0.6, rad: 52, dmg: dmg * 3.6 * scale });
          });
        })(i);
      }
    } else if (cls === 'necromancer') {
      if (idx === 1) { // Soul Spear: a piercing drain along a line
        var healed = 0, reach = 190 + 40 * pow;
        if (CC.Vfx) CC.Vfx.spawn('soulSpear', p.x, p.y, 0, { x2: p.x + a.x * reach, y2: p.y + a.y * reach }); else beam(p.x, p.y, p.x + a.x * reach, p.y + a.y * reach, '#7dff9a', 0.45);
        foes().forEach(function (f) {
          if (!alive(f)) return;
          var px = f.x - p.x, py = f.y - p.y, along = px * a.x + py * a.y, off = Math.abs(px * -a.y + py * a.x);
          if (along > 0 && along < reach && off < 18 + (f.r || 8)) {
            hit(f, dmg * 2.65 * scale, 'drain');
            if (healed < 5) { healed++; if (CC.Classes.heal) CC.Classes.heal(p, p.maxHp * 0.025); }
            burst(f.x, f.y, '#7dff9a', 8, 100);
          }
        });
        shake(4);
      } else if (idx === 2) { // Plague Nova
        var pr = 120 + 30 * pow; if (CC.Vfx) CC.Vfx.spawn('plagueNova', p.x, p.y, pr, {}); else ring(p.x, p.y, pr, '#9acd32', 0.7);
        within(p, pr).forEach(function (f) { hit(f, dmg * 2.15 * scale, 'poison'); status(f, 'slow', 3.5, 0.55); burst(f.x, f.y, '#9acd32', 8, 90); });
        shake(5);
      } else { // Army of the Dead
        var mm = CC.Classes.minions, cap = 9;
        for (i = 0; i < 4 && mm && mm.length < cap; i++) {
          var ang = rnd(0, 6.28), hp = 40 + p.level * 4;
          mm.push({ x: p.x + Math.cos(ang) * 24, y: p.y + Math.sin(ang) * 24, r: 6, hp: hp, maxHp: hp, life: 18, dmg: 5 + dmg * 0.54, atkCd: 0, anim: rnd(0, 6), face: 1, spawn: 0.35 });
        }
        within(p, 90).forEach(function (f) { hit(f, dmg * 2.0 * scale, 'drain'); status(f, 'stun', 0.8); });
        if (CC.Vfx) { CC.Vfx.spawn('boneNova', p.x, p.y, 90, {}); for (i = 0; i < 4; i++) CC.Vfx.spawn('raise', p.x + Math.cos(i * 1.57 + 0.7) * 30, p.y + Math.sin(i * 1.57 + 0.7) * 22, 16, { local: true }); }
        else { ring(p.x, p.y, 90, '#7dff9a', 0.6); burst(p.x, p.y, '#7dff9a', 30, 150); }
        shake(8);
      }
    } else { // thief
      if (idx === 1) { // Venom Burst
        if (CC.Vfx) CC.Vfx.spawn('venom', p.x, p.y, 80, {}); else ring(p.x, p.y, 80, '#7dff5a', 0.6);
        within(p, 80).forEach(function (f) { hit(f, dmg * 2.4 * scale, 'poison'); status(f, 'slow', 3, 0.5); burst(f.x, f.y, '#7dff5a', 8, 90); });
        shake(3);
      } else if (idx === 2) { // Phantom Blades: up to five foes, two strikes each
        l = foes().filter(function (f) { return alive(f) && Math.hypot(f.x - p.x, f.y - p.y) <= 160; })
          .sort(function (u, v) { return Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y); }).slice(0, 5);
        p.iframes = Math.max(p.iframes || 0, 1.0); p.ambushT = 2;
        l.forEach(function (f, n) {
          later(0.12 * n, function () {
            if (!alive(f)) return;
            var fx0 = p.x, fy0 = p.y, ddx = f.x - p.x, ddy = f.y - p.y, d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
            move(p, ddx / d * Math.max(0, d - 12), ddy / d * Math.max(0, d - 12)); if (CC.Vfx) CC.Vfx.spawn('slash', fx0, fy0, 0, { x2: p.x, y2: p.y }); else beam(fx0, fy0, p.x, p.y, '#d8ccff', 0.3);
            hit(f, dmg * 1.5 * scale, 'shadow'); if (alive(f)) hit(f, dmg * 1.5 * scale, 'shadow');
            burst(f.x, f.y, '#b9a6ff', 10, 110);
          });
        });
        shake(3);
      } else { // Deathmark
        l = within(p, 210); p.iframes = Math.max(p.iframes || 0, 0.8);
        l.forEach(function (f) { if (CC.Vfx) CC.Vfx.spawn('mark', f.x, f.y, 14, { life: 1.0 }); else ring(f.x, f.y, 14, '#ff5a6a', 1.0); });
        later(1.0, function () { l.forEach(function (f) { if (!alive(f)) return; hit(f, dmg * 7 * scale, 'shadow'); burst(f.x, f.y, '#ff5a6a', 16, 140); }); shake(8); });
      }
    }
  }

  function release(p, pow) {
    var cls = p.classId, dmg = p.stats.dmg, a = aim(p), i, e, l;
    var scale = 0.6 + 0.6 * pow; // a partial charge is weaker, a full one hits hardest
    var sidx = skillIndex(p);
    if (sidx > 0) {
      releaseSkill(p, cls, sidx, pow, a, scale);
      text(p.x, p.y - 26, skillName(p) + (pow >= 0.99 ? '!' : ''), COLORS[cls] || '#fff', pow >= 0.99 ? 13 : 10);
      return;
    }
    if (cls === 'swordsman') {
      effects.push({ kind: 'wave', x: p.x, y: p.y, dx: a.x, dy: a.y, run: 0, range: 190 + 90 * pow, w: 20 + 10 * pow,
        dmg: dmg * 3.2 * scale, hit: [], trail: [] });
      shake(5); burst(p.x, p.y, '#ff8a4a', 14, 120);
      if (CC.Vfx) CC.Vfx.spawn('earthSpikes', p.x, p.y, 190 + 90 * pow, { a: Math.atan2(a.y, a.x) });
    } else if (cls === 'wizard') {
      var tx = a.target ? a.target.x : p.x + a.x * 90, ty = a.target ? a.target.y : p.y + a.y * 90;
      effects.push({ kind: 'meteor', x: tx, y: ty, t: 0.7, max: 0.7, rad: 48 + 22 * pow, dmg: dmg * 4 * scale });
    } else if (cls === 'necromancer') {
      var rad = 70 + 30 * pow, healed = 0;
      l = foes();
      for (i = 0; i < l.length; i++) {
        e = l[i]; if (!alive(e)) continue;
        var dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy > (rad + (e.r || 8)) * (rad + (e.r || 8))) continue;
        hit(e, dmg * 1.85 * scale, 'drain');
        if (healed < 4) { healed++; if (CC.Classes.heal) CC.Classes.heal(p, p.maxHp * 0.025); }
      }
      var n = 1 + Math.round(2 * pow), mm = CC.Classes.minions;
      for (i = 0; i < n && mm && mm.length < 8; i++) {
        var ang = rnd(0, 6.28), hp = 30 + p.level * 3;
        mm.push({ x: p.x + Math.cos(ang) * 20, y: p.y + Math.sin(ang) * 20, r: 6, hp: hp, maxHp: hp, life: 18,
          dmg: 5 + dmg * 0.44, atkCd: 0, anim: rnd(0, 6), face: 1, spawn: 0.35 });
      }
      if (CC.Vfx) CC.Vfx.spawn('boneNova', p.x, p.y, rad, {}); else effects.push({ kind: 'nova', x: p.x, y: p.y, t: 0.55, max: 0.55, rad: rad });
      shake(4); burst(p.x, p.y, '#7dff9a', 22, 130);
    } else { // thief
      var targets = [], cap = 2 + Math.round(3 * pow);
      l = foes().filter(function (f) { return alive(f) && Math.hypot(f.x - p.x, f.y - p.y) <= 150; });
      l.sort(function (u, v) { return Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y); });
      targets = l.slice(0, cap);
      p.iframes = Math.max(p.iframes || 0, 0.7);
      p.ambushT = 2; // the first strike is a guaranteed backstab crit
      for (i = 0; i < targets.length; i++) {
        e = targets[i];
        var fx0 = p.x, fy0 = p.y;
        var ddx = e.x - p.x, ddy = e.y - p.y, d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        move(p, ddx / d * Math.max(0, d - 12), ddy / d * Math.max(0, d - 12));
        if (CC.Vfx) CC.Vfx.spawn('slash', fx0, fy0, 0, { x2: p.x, y2: p.y }); else effects.push({ kind: 'slash', x: fx0, y: fy0, x2: p.x, y2: p.y, t: 0.35 + 0.08 * i, max: 0.35 + 0.08 * i });
        hit(e, dmg * 1.8 * scale, 'shadow');
        burst(e.x, e.y, '#b9a6ff', 8, 100);
      }
      shake(3);
    }
    text(p.x, p.y - 26, NAMES[cls] + (pow >= 0.99 ? '!' : ''), COLORS[cls] || '#fff', pow >= 0.99 ? 13 : 10);
  }

  function ready(p) {
    if (p.classId !== 'thief') return true;
    return !!foes().filter(function (f) { return alive(f) && Math.hypot(f.x - p.x, f.y - p.y) <= 150; }).length;
  }

  /* ---------- update ---------- */
  function updateEffects(dt) {
    for (var k = effects.length - 1; k >= 0; k--) {
      var f = effects[k], i, l, e;
      if (f.kind === 'wave') {
        var step = 330 * dt;
        f.run += step; f.x += f.dx * step; f.y += f.dy * step;
        f.trail.push({ x: f.x, y: f.y, a: 1 }); if (f.trail.length > 14) f.trail.shift();
        if (CC.Vfx) { // dust and flying rock behind the shockwave
          CC.Vfx.emit({ kind: 'smoke', x: f.x, y: f.y + 4, vx: rnd(-12, 12), vy: rnd(-20, -5), life: 0.5, size: 5, grow: 9, col: '#8a7355', alpha: 0.7 });
          if (Math.random() < 0.5) CC.Vfx.emit({ kind: 'dot', x: f.x, y: f.y, vx: rnd(-40, 40), vy: -rnd(60, 130), ay: 480, life: 0.5, size: rnd(1.4, 2.6), col: '#7a5a3a' });
        }
        l = foes();
        for (i = 0; i < l.length; i++) {
          e = l[i];
          if (!alive(e) || f.hit.indexOf(e) >= 0) continue;
          var dx = e.x - f.x, dy = e.y - f.y;
          if (dx * dx + dy * dy > (f.w + (e.r || 8)) * (f.w + (e.r || 8))) continue;
          f.hit.push(e);
          hit(e, f.dmg, 'physical');
          if (alive(e)) { knock(e, f.x - f.dx * 10, f.y - f.dy * 10, 16); status(e, 'stun', 0.7); }
          burst(e.x, e.y, '#ffb070', 8, 100);
        }
        if (f.run >= f.range) effects.splice(k, 1);
      } else if (f.kind === 'later') {
        f.t -= dt;
        if (f.t <= 0) { effects.splice(k, 1); try { f.fn(); } catch (err) { /* a skill step never breaks the loop */ } }
      } else if (f.kind === 'meteor') {
        f.t -= dt;
        if (f.t <= 0) {
          l = foes();
          for (i = 0; i < l.length; i++) {
            e = l[i]; if (!alive(e)) continue;
            var ex = e.x - f.x, ey = e.y - f.y;
            if (ex * ex + ey * ey > (f.rad + (e.r || 8)) * (f.rad + (e.r || 8))) continue;
            hit(e, f.dmg, 'fire'); status(e, 'stun', 0.5);
          }
          burst(f.x, f.y, '#ffb04a', 30, 170); shake(8);
          if (CC.Vfx) { CC.Vfx.spawn('meteorBoom', f.x, f.y, f.rad, {}); effects.splice(k, 1); }
          else effects[k] = { kind: 'boom', x: f.x, y: f.y, t: 0.4, max: 0.4, rad: f.rad };
        }
      } else {
        f.t -= dt;
        if (f.t <= 0) effects.splice(k, 1);
      }
    }
  }

  function update(dt, holding) {
    var p = player();
    st.anim += dt;
    st.cool = Math.max(0, st.cool - dt);
    updateEffects(dt);
    if (!p || p.hp <= 0) { cancel(); return; }
    if (holding) {
      if (!st.on) {
        st.hold += dt;
        if (st.hold >= TAP) {
          if (st.cool > 0 || p.mana < cost(p)) {
            if (!st.warned) {
              st.warned = true;
              text(p.x, p.y - 22, st.cool > 0 ? 'Charge ' + st.cool.toFixed(1) + 's' : 'No mana', '#9aa8c8', 9);
            }
          } else { st.on = true; st.t = 0; st.flashed = false; }
        }
      } else {
        st.t = Math.min(FULL, st.t + dt);
        if (st.t >= FULL && !st.flashed) { st.flashed = true; burst(p.x, p.y, COLORS[p.classId] || '#fff', 16, 110); shake(2); }
      }
    } else {
      if (st.on) {
        if (st.t < ARM) text(p.x, p.y - 22, 'Fizzle', '#9aa8c8', 9);
        else if (!ready(p)) text(p.x, p.y - 22, 'No targets', '#9aa8c8', 9);
        else {
          p.mana -= cost(p);
          release(p, st.t / FULL);
          st.cool = st.coolMax = COOLDOWN;
        }
      }
      cancel();
    }
  }

  function cancel() { st.hold = 0; st.on = false; st.t = 0; st.warned = false; st.flashed = false; }

  /* ---------- drawing ---------- */
  function arc(ctx, x, y, r, a0, a1, col, w, alpha) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
  }

  function drawCharge(ctx, cam, p) {
    var px = p.x - cam.x, py = p.y - cam.y, f = st.t / FULL, col = COLORS[p.classId] || '#fff', T = st.anim, i, a;
    var full = f >= 1, pulse = 0.65 + 0.35 * Math.sin(T * (full ? 20 : 9));
    ctx.save();
    ctx.lineCap = 'round';
    if (p.classId === 'swordsman') { // cracks spread across the ground as the blow winds up
      for (i = 0; i < 7; i++) {
        a = i * 0.9 + 0.3;
        ctx.globalAlpha = 0.55 * pulse; ctx.strokeStyle = '#ff6a2a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * 8, py + 6 + Math.sin(a) * 4);
        ctx.lineTo(px + Math.cos(a) * (10 + 26 * f), py + 6 + Math.sin(a) * (5 + 13 * f)); ctx.stroke();
      }
    } else if (p.classId === 'wizard') { // rune orbs orbit faster and tighter as the spell builds
      for (i = 0; i < 3; i++) {
        a = T * (3 + 6 * f) + i * 2.094;
        ctx.globalAlpha = 0.9; ctx.fillStyle = i === 1 ? '#ffd27a' : col;
        ctx.beginPath(); ctx.arc(px + Math.cos(a) * (26 - 8 * f), py - 4 + Math.sin(a) * (11 - 3 * f), 2.5 + 2 * f, 0, 6.3); ctx.fill();
      }
    } else if (p.classId === 'necromancer') { // souls spiral inward
      for (i = 0; i < 8; i++) {
        var ph = ((T * 0.9 + i / 8) % 1);
        a = T * 4 + i * 0.785;
        ctx.globalAlpha = 0.8 * (1 - ph); ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(px + Math.cos(a) * (34 * (1 - ph) + 6), py + Math.sin(a) * (34 * (1 - ph) + 6), 2.2, 0, 6.3); ctx.fill();
      }
    } else { // thief: shadow afterimages fan out behind
      for (i = 1; i <= 3; i++) {
        ctx.globalAlpha = 0.18 * f * (4 - i) / 3;
        ctx.fillStyle = '#7a62d8';
        ctx.beginPath(); ctx.ellipse(px - (p.face || 1) * i * 6 * (0.3 + f), py + 2, 6, 9, 0, 0, 6.3); ctx.fill();
      }
    }
    arc(ctx, px, py + 2, 17, 0, 6.2832, '#000', 4, 0.35);
    arc(ctx, px, py + 2, 17, -Math.PI / 2, -Math.PI / 2 + 6.2832 * f, full ? '#ffffff' : col, 3, full ? pulse : 0.95);
    if (full) arc(ctx, px, py + 2, 22 + 3 * pulse, 0, 6.2832, col, 1.5, 0.6);
    ctx.restore();
  }

  function draw(ctx, cam) {
    var p = player(), k, f, i, a;
    if (p && st.on && st.t > 0.05) drawCharge(ctx, cam, p);
    if (p && st.cool > 0 && st.cool < st.coolMax) { // slim cooldown bar under the hero
      var bx = p.x - cam.x - 10, by = p.y - cam.y + 14;
      ctx.save();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#000'; ctx.fillRect(bx, by, 20, 2);
      ctx.fillStyle = COLORS[p.classId] || '#fff'; ctx.fillRect(bx, by, 20 * (1 - st.cool / st.coolMax), 2);
      ctx.restore();
    }
    ctx.save();
    ctx.lineCap = 'round';
    for (k = 0; k < effects.length; k++) {
      f = effects[k];
      var sx = f.x - cam.x, sy = f.y - cam.y;
      if (f.kind === 'wave') {
        for (i = 0; i < f.trail.length; i++) {
          var tp = f.trail[i];
          ctx.globalAlpha = 0.5 * (i + 1) / f.trail.length;
          ctx.fillStyle = '#7a4a22';
          ctx.fillRect(tp.x - cam.x - 3, tp.y - cam.y - 2, 6, 4);
        }
        a = Math.atan2(f.dy, f.dx);
        arc(ctx, sx, sy, f.w, a - 1.1, a + 1.1, '#ffd0a0', 4, 0.95);
        arc(ctx, sx, sy, f.w * 0.65, a - 0.9, a + 0.9, '#ff8a4a', 3, 0.8);
      } else if (f.kind === 'meteor' && CC.Vfx && CC.Vfx.drawMeteor) {
        CC.Vfx.drawMeteor(ctx, sx, sy, 1 - f.t / f.max, f.rad);
      } else if (f.kind === 'meteor') {
        var q = 1 - f.t / f.max;
        arc(ctx, sx, sy, f.rad, 0, 6.2832, '#ff7a3a', 2, 0.35 + 0.4 * q);
        arc(ctx, sx, sy, f.rad * (1 - q), 0, 6.2832, '#ffd27a', 1.5, 0.7);
        var my = sy - f.t / f.max * 150; // falls from above
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffb04a';
        ctx.beginPath(); ctx.arc(sx, my, 9, 0, 6.3); ctx.fill();
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#ff5a1a';
        ctx.beginPath(); ctx.moveTo(sx - 7, my); ctx.lineTo(sx + 7, my); ctx.lineTo(sx, my - 28); ctx.closePath(); ctx.fill();
      } else if (f.kind === 'boom') {
        var u = 1 - f.t / f.max;
        arc(ctx, sx, sy, f.rad * (0.4 + 0.6 * u), 0, 6.2832, '#ffb04a', 5 * (1 - u) + 1, 1 - u);
      } else if (f.kind === 'nova') {
        var v = 1 - f.t / f.max;
        arc(ctx, sx, sy, f.rad * v, 0, 6.2832, '#7dff9a', 6 * (1 - v) + 1, 1 - v);
        arc(ctx, sx, sy, f.rad * v * 0.7, 0, 6.2832, '#2a8a4a', 3, 0.6 * (1 - v));
      } else if (f.kind === 'ring') {
        var rv = 1 - f.t / f.max;
        arc(ctx, sx, sy, f.rad * (0.3 + 0.7 * rv), 0, 6.2832, f.col, 4 * (1 - rv) + 1, 1 - rv);
      } else if (f.kind === 'beam') {
        var bw = f.t / f.max;
        ctx.globalAlpha = bw; ctx.strokeStyle = f.col; ctx.lineWidth = 3 * bw + 0.8;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(f.x2 - cam.x, f.y2 - cam.y); ctx.stroke();
      } else if (f.kind === 'slash') {
        var w = f.t / f.max;
        ctx.globalAlpha = w; ctx.strokeStyle = '#d8ccff'; ctx.lineWidth = 3 * w + 0.5;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(f.x2 - cam.x, f.y2 - cam.y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  CC.Charge = { update: update, draw: draw, cancel: cancel, state: st, names: NAMES };
})();
