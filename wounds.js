/* CC.Wounds - bleeding wounds, bite marks and blinding for the hero and for monsters.
 *
 *   apply(target, {dur, dps, src})   open a wound: it bleeds for `dur` seconds, hurting `dps` per second. The gash is drawn on the body, and
 *                                    once a second (a heartbeat) it spurts blood in an arc; between beats it seeps. A moving, bleeding body
 *                                    leaves a blood trail on the ground.
 *   blind(hero, sec)                 a bird pecks the eyes: "Blinded" in red and the sight radius drops to a few steps for `sec` seconds.
 *   chomp(x, y, ang, size)           animated fangs snap shut on a spot (the wolf's and the bear's bites).
 *   drawJaws(ctx, x, y, len, open, o) shared jaw art for monster heads (local coords, facing +x; open = 0..1.2 radians-ish).
 *   onHit(player, enemy, dmg)        called by enemies.js when a monster's hit lands: wolves bite (1 in 5 wounds), birds peck (may blind).
 * Hooks in main.js: update, drawGround (trail), draw (gash + spurts + bites), drawScreen (heartbeat vignette, blindness), clear.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, W = CC.Wounds = {}, TAU = Math.PI * 2;
  var trail = [], parts = [], bites = [], pulseScreen = 0, blindFade = 0;
  function R() { return Math.random(); }
  function hero() { var s = CC.state; return s && s.player && !s.player.stub ? s.player : null; }
  function alive(e) { return !!e && e.hp > 0 && !e.dead; }
  function fxText(x, y, s, c, z) { if (CC.fx && CC.fx.text) CC.fx.text(x, y, s, c, z); }
  function bodies() {
    var out = [], p = hero(), E = CC.Enemies, i;
    if (p) out.push(p);
    if (E && E.list) for (i = 0; i < E.list.length; i++) if (E.list[i].wound) out.push(E.list[i]);
    return out;
  }

  /* ---------- opening a wound ---------- */
  W.apply = function (t, o) {
    if (!t || !alive(t) || t.isDefenseBox) return false;
    o = o || {};
    var dur = o.dur || 2.5, dps = Math.max(1, o.dps || 2), w = t.wound, isHero = t === hero();
    if (w && w.t > 0) { w.t = Math.max(w.t, dur); w.max = Math.max(w.max, w.t); w.dps = Math.max(w.dps, dps); }
    else {
      t.wound = { t: dur, max: dur, dps: dps, beat: 0.12, seep: 0.2, tick: 0.5, pulse: 1, ox: (R() - 0.5) * 7, oy: -3 - R() * 6, lx: t.x, ly: t.y, dist: 0, seed: R() * 99 };
      fxText(t.x, t.y - (t.r || 10) - 16, isHero ? 'WOUNDED' : 'GASHED', '#ff3a4a', isHero ? 13 : 10);
      spurt(t, 16, 1.25); splat(t.x, t.y + 4, 6, 8);
    }
    return true;
  };
  W.isWounded = function (t) { return !!(t && t.wound && t.wound.t > 0); };
  W.blind = function (p, sec) {
    if (!p || p !== hero() || p.hp <= 0) return;
    if (!(p.blindT > 0)) { fxText(p.x, p.y - 26, 'BLINDED', '#ff2a2a', 14); if (CC.Audio) CC.Audio.fx('peck', { vol: 0.8 }); }
    p.blindT = Math.max(p.blindT || 0, sec || 1.5);
    if (CC.fx) { if (CC.fx.shake) CC.fx.shake(2); if (CC.fx.burst) CC.fx.burst(p.x, p.y - 8, '#1a1620', 6, 60); if (CC.fx.flash) CC.fx.flash('#ff2a2a', 0.1); }
  };
  W.chomp = function (x, y, ang, size) { if (bites.length > 12) bites.shift(); bites.push({ x: x, y: y, ang: ang || 0, size: size || 14, t: 0, dur: 0.5, bled: false }); };

  // monsters' landed hits: bites and pecks
  W.onHit = function (p, e, dmg) {
    if (!p || !e || p.isDefenseBox) return;
    var ang = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.type === 'merehorror' && p === hero() && R() < 0.3) { W.apply(p, { dur: 2.5, dps: Math.max(2, (e.dmg || 8) * 0.28), src: 'claw' }); return; }
    if (e.type === 'direwolf' || (e.type === 'bear' && e.atk === 'bite')) {
      W.chomp(p.x, p.y - 2, ang, e.type === 'bear' ? 20 : 15);
      if (e.type === 'direwolf' && p === hero() && R() < 0.2) W.apply(p, { dur: 2.5, dps: Math.max(2, (e.dmg || 8) * 0.28), src: 'bite' });
    } else if ((e.type === 'crow' || e.type === 'raven') && p === hero()) {
      if (CC.fx && CC.fx.burst) CC.fx.burst(p.x + Math.cos(ang + 3.14) * 4, p.y - 9, '#1a1620', 3, 40);
      if (R() < 0.34) W.blind(p, 1.5);
    }
  };

  /* ---------- blood ---------- */
  function splat(x, y, n, spread) {
    for (var i = 0; i < n; i++) {
      if (trail.length > 340) trail.shift();
      trail.push({ x: x + (R() - 0.5) * spread, y: y + (R() - 0.5) * spread * 0.6, r: 1 + R() * 2.4, rot: R() * 3, sq: 0.45 + R() * 0.4, age: 0, c: R() < 0.5 ? '#8e0e16' : '#6a0a10' });
    }
  }
  function spurt(t, n, power) { // an arc of blood out of the gash: droplets rise, fall and stain the ground where they land
    var w = t.wound, face = t.face || 1, bx = t.x + w.ox * face, by = t.y + w.oy, base = (face >= 0 ? -0.5 : Math.PI + 0.5) + (R() - 0.5) * 0.9;
    for (var i = 0; i < n; i++) {
      if (parts.length > 260) parts.shift();
      var a = base + (R() - 0.5) * 1.6, v = (50 + R() * 90) * power;
      parts.push({ x: bx, y: t.y, z: -w.oy + 4, px: bx, py: t.y, pz: -w.oy + 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, vz: (70 + R() * 130) * power, life: 1, w: 1 + R() * 1.6 });
    }
  }
  W.clear = function () { trail.length = 0; parts.length = 0; bites.length = 0; pulseScreen = 0; var p = hero(); if (p) { p.blindT = 0; p.wound = null; } };

  W.update = function (dt) {
    var list = bodies(), i, t, w, step;
    for (i = 0; i < list.length; i++) {
      t = list[i]; w = t.wound;
      if (!w) continue;
      if (!alive(t)) { if (t.hp <= 0 && !t._bledOut) { t._bledOut = true; splat(t.x, t.y + 3, 10, 18); } t.wound = null; continue; }
      w.t -= dt; w.pulse = Math.max(0, w.pulse - dt * 3);
      if (w.t <= 0) { t.wound = null; continue; }
      // the trail: a drop every ~12 px moved
      step = Math.hypot(t.x - w.lx, t.y - w.ly); w.dist += step; w.lx = t.x; w.ly = t.y;
      while (w.dist > 12) { w.dist -= 12; splat(t.x, t.y + (t.r || 10) * 0.5, 1, 5); }
      // seep between beats, strong spurt on each beat (a heartbeat every second)
      w.seep -= dt; if (w.seep <= 0) { w.seep = 0.16; spurt(t, 1, 0.3); }
      w.beat -= dt;
      if (w.beat <= 0) {
        w.beat = 1; w.pulse = 1; spurt(t, 15, 1); splat(t.x, t.y + 3, 3, 9); if (CC.Audio) CC.Audio.fx('wet', { x: t.x, y: t.y, vol: 0.5 });
        if (t === hero()) { if (CC.Audio) CC.Audio.fx('thump', { vol: 0.7 }); pulseScreen = 1; if (CC.fx && CC.fx.shake) CC.fx.shake(1.2); }
      }
      w.tick -= dt;
      if (w.tick <= 0) {
        w.tick = 0.5; var dmg = Math.max(1, Math.round(w.dps * 0.5));
        if (t === hero()) { t.hp -= dmg; t.hurtFlash = Math.max(t.hurtFlash || 0, 0.08); fxText(t.x, t.y - 12, '-' + dmg, '#a01018', 10); }
        else if (CC.Classes && CC.Classes.hitEnemy) CC.Classes.hitEnemy(t, dmg, 'poison', { noCrit: true, minion: true });
        else t.hp -= dmg;
      }
    }
    for (i = parts.length - 1; i >= 0; i--) {
      var q = parts[i];
      q.px = q.x; q.py = q.y; q.pz = q.z;
      q.vz -= 380 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.z <= 0) { if (q.w > 1.4 || R() < 0.5) splat(q.x, q.y, 1, 2); if (CC.Audio && R() < 0.4) CC.Audio.splatter(1, q.x, q.y); parts.splice(i, 1); }
    }
    for (i = trail.length - 1; i >= 0; i--) { trail[i].age += dt; if (trail[i].age > 26) trail.splice(i, 1); }
    for (i = bites.length - 1; i >= 0; i--) {
      var b = bites[i]; b.t += dt;
      if (!b.bled && b.t > b.dur * 0.42) { b.bled = true; if (CC.Audio) CC.Audio.fx('crunch', { x: b.x, y: b.y, vol: 0.9 }); if (CC.fx && CC.fx.blood) CC.fx.blood(b.x, b.y, 7, Math.cos(b.ang), Math.sin(b.ang)); splat(b.x, b.y + 4, 3, 8); if (CC.fx && CC.fx.shake) CC.fx.shake(2); }
      if (b.t > b.dur) bites.splice(i, 1);
    }
    var p = hero();
    if (p && p.blindT > 0) { p.blindT -= dt; blindFade = Math.min(1, blindFade + dt * 8); }
    else blindFade = Math.max(0, blindFade - dt * 4);
    pulseScreen = Math.max(0, pulseScreen - dt * 2.2);
  };

  /* ---------- drawing ---------- */
  W.drawGround = function (c, cam) {
    for (var i = 0; i < trail.length; i++) {
      var b = trail[i], x = b.x - cam.x, y = b.y - cam.y;
      if (x < -10 || y < -10 || x > cam.w + 10 || y > cam.h + 10) continue;
      var fade = b.age > 18 ? 1 - (b.age - 18) / 8 : 1, dry = Math.min(1, b.age / 10);
      c.globalAlpha = 0.85 * fade; c.fillStyle = dry > 0.6 ? '#4e0a0e' : b.c;
      c.beginPath(); c.ellipse(x, y, b.r, b.r * b.sq, b.rot, 0, TAU); c.fill();
      if (b.age < 0.5) { c.globalAlpha = 0.5; c.fillStyle = '#d02a34'; c.fillRect(x - 0.5, y - 0.5, 1, 1); } // fresh and wet
    }
    c.globalAlpha = 1;
  };
  function gash(c, t, cam) {
    var w = t.wound, face = t.face || 1, sc = Math.max(0.8, (t.r || 10) / 10), gx = t.x - cam.x + w.ox * face, gy = t.y - cam.y + w.oy * sc, tm = Date.now() / 1000;
    var flare = w.pulse, fadeOut = Math.min(1, w.t / 0.5);
    c.save(); c.translate(gx, gy); c.scale(sc * face, sc); c.globalAlpha = fadeOut;
    c.shadowColor = '#ff2030'; c.shadowBlur = 3 + flare * 9;
    c.strokeStyle = '#2a0408'; c.lineWidth = 3.4; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-6, -2.5); c.lineTo(-2, 0.5); c.lineTo(0, -1.5); c.lineTo(3.5, 1.5); c.lineTo(6.5, 0); c.stroke(); // the torn edges
    c.strokeStyle = flare > 0.2 ? '#ff4a55' : '#b0121c'; c.lineWidth = 1.8 + flare * 0.9; c.stroke();
    c.shadowBlur = 0; c.fillStyle = 'rgba(255,150,150,' + (0.4 + 0.4 * flare) + ')'; c.fillRect(-1, -1.2, 2.2, 1.1); // raw flesh
    // blood sheeting down the body, longer right after the beat
    for (var k = 0; k < 3; k++) {
      var dx = -4 + k * 4.2 + Math.sin(tm * 2 + k + w.seed) * 0.5, len = 4 + k % 2 * 3 + flare * 5 + (Math.sin(tm * 5 + k * 2) + 1) * 1.5;
      c.strokeStyle = k % 2 ? '#c2182a' : '#8e0e16'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(dx, 1); c.lineTo(dx + 0.4, 1 + len); c.stroke();
      c.fillStyle = '#d4202e'; c.beginPath(); c.arc(dx + 0.4, 2 + len + ((tm * 14 + k * 5) % 7), 1, 0, TAU); c.fill();
    }
    c.restore();
  }
  W.draw = function (c, cam) {
    var list = bodies(), i;
    for (i = 0; i < list.length; i++) {
      var t = list[i];
      if (t.wound && t.wound.t > 0 && alive(t) && t.x > cam.x - 40 && t.x < cam.x + cam.w + 40 && t.y > cam.y - 40 && t.y < cam.y + cam.h + 40) gash(c, t, cam);
    }
    for (i = 0; i < parts.length; i++) { // the arcing spurts, drawn as streaks
      var q = parts[i], x = q.x - cam.x, y = q.y - q.z - cam.y, px = q.px - cam.x, py = q.py - q.pz - cam.y;
      c.strokeStyle = '#a0101a'; c.lineWidth = q.w + 0.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
      c.strokeStyle = '#e8404c'; c.lineWidth = Math.max(0.6, q.w * 0.45); c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
    }
    for (i = 0; i < bites.length; i++) drawBite(c, bites[i], cam);
    var hp = hero();
    if (hp && hp.blindT > 0) { // the pecked eyes: streaks of red across the face
      c.save(); c.globalAlpha = 0.6 + 0.3 * Math.sin(Date.now() / 60); c.fillStyle = '#ff2a2a'; c.font = 'bold 10px Georgia, serif'; c.textAlign = 'center';
      c.strokeStyle = '#2a0000'; c.lineWidth = 3; c.strokeText('BLINDED', hp.x - cam.x, hp.y - cam.y - 24); c.fillText('BLINDED', hp.x - cam.x, hp.y - cam.y - 24); c.restore();
    }
  };

  // a mouth of fangs closing: upper and lower rows of teeth swing shut across the spot, then flash blood
  function fangRow(c, n, width, len, dir) {
    for (var k = 0; k < n; k++) {
      var fx = -width + (k + 0.5) * (width * 2 / n), big = k === 0 || k === n - 1 || k === (n >> 1), l = len * (big ? 1.25 : 0.8);
      c.beginPath(); c.moveTo(fx - 2.4, 0); c.lineTo(fx + 2.4, 0); c.lineTo(fx + 0.4, dir * l); c.closePath(); c.fill();
    }
  }
  function drawBite(c, b, cam) {
    var u = b.t / b.dur, close = u < 0.42 ? 1 - Math.pow(1 - u / 0.42, 2) : 1, open = (1 - close) * 1.0, hold = u > 0.42 ? 1 - (u - 0.42) / 0.58 : 1, s = b.size;
    c.save(); c.translate(b.x - cam.x, b.y - cam.y); c.rotate(b.ang + Math.PI / 2); c.globalAlpha = Math.max(0, hold);
    var gap = (s * 0.1 + open * s * 1.2);
    c.shadowColor = '#000'; c.shadowBlur = 3;
    c.fillStyle = '#6e0c14'; c.fillRect(-s, -gap - 3, s * 2, 3.5); c.fillRect(-s, gap - 0.5, s * 2, 3.5); // gums
    c.fillStyle = '#f6ecd6'; c.save(); c.translate(0, -gap); fangRow(c, 7, s, s * 0.55, 1); c.restore(); // upper fangs point down
    c.save(); c.translate(0, gap); fangRow(c, 7, s, s * 0.5, -1); c.restore(); // lower fangs point up
    if (u > 0.42) { c.fillStyle = 'rgba(170,10,20,' + (0.8 * hold) + ')'; for (var k = 0; k < 7; k++) c.fillRect(-s + (k + 0.5) * (s * 2 / 7) - 1, -2 + Math.sin(k * 2.1) * 2, 2, 4 + (k % 2) * 3); } // punctures welling up
    c.restore();
  }

  /* shared jaw art for monster heads: (x,y) is the corner of the mouth, facing +x. open ~0..1.1 is how far the lower jaw drops (radians) */
  W.drawJaws = function (c, x, y, len, open, o) {
    o = o || {};
    var fur = o.fur || '#55535a', dark = o.dark || '#2c2a30', tooth = o.tooth || '#f4ecd8', drool = o.drool !== false, n = o.teeth || 4, tm = Date.now() / 1000;
    var gape = Math.max(0, open);
    c.save(); c.translate(x, y);
    // the dark maw and tongue between the jaws
    if (gape > 0.12) {
      c.fillStyle = '#2a060c'; c.beginPath(); c.moveTo(0, 0); c.lineTo(len, 0); c.lineTo(len * Math.cos(gape), len * Math.sin(gape)); c.closePath(); c.fill();
      c.fillStyle = '#b8323f'; c.beginPath(); c.moveTo(len * 0.1, len * 0.05); c.quadraticCurveTo(len * 0.5, Math.sin(gape) * len * 0.45, len * 0.84 * Math.cos(gape * 0.7), len * 0.84 * Math.sin(gape * 0.7)); c.lineTo(len * 0.2, len * 0.08); c.fill();
    }
    // lower jaw: swings down on the hinge
    c.save(); c.rotate(gape);
    c.fillStyle = o.lower || dark; c.beginPath(); c.moveTo(-len * 0.1, -len * 0.04); c.lineTo(len, -len * 0.02); c.lineTo(len * 0.92, len * 0.2); c.lineTo(len * 0.1, len * 0.26); c.closePath(); c.fill();
    c.fillStyle = tooth; // lower fangs point up
    for (var k = 0; k < n; k++) { var tx = len * (0.28 + k * 0.7 / n), tl = len * (k === n - 1 ? 0.3 : 0.17); c.beginPath(); c.moveTo(tx - len * 0.045, -len * 0.03); c.lineTo(tx + len * 0.045, -len * 0.03); c.lineTo(tx + len * 0.01, -len * 0.03 - tl); c.fill(); }
    c.restore();
    // upper jaw / snout with long fangs pointing down
    c.fillStyle = fur; c.beginPath(); c.moveTo(-len * 0.2, -len * 0.3); c.lineTo(len * 1.02, -len * 0.14); c.lineTo(len * 1.0, 0); c.lineTo(0, len * 0.04); c.closePath(); c.fill();
    c.fillStyle = tooth;
    for (k = 0; k < n; k++) { var ux = len * (0.22 + k * 0.72 / n), ul = len * (k === n - 1 ? 0.34 : k === 0 ? 0.26 : 0.17); c.beginPath(); c.moveTo(ux - len * 0.05, 0.5); c.lineTo(ux + len * 0.05, 0.5); c.lineTo(ux + len * 0.01, 0.5 + ul); c.fill(); }
    c.fillStyle = '#0a0608'; c.beginPath(); c.arc(len * 0.98, -len * 0.1, len * 0.09, 0, TAU); c.fill(); // nose
    if (drool && gape > 0.35) { c.strokeStyle = 'rgba(214,226,236,0.75)'; c.lineWidth = 1; for (k = 0; k < 2; k++) { var dx = len * (0.4 + k * 0.3); c.beginPath(); c.moveTo(dx, len * 0.18 * Math.sin(gape)); c.lineTo(dx + 0.5, len * 0.4 * Math.sin(gape) + 3 + Math.sin(tm * 6 + k) * 1.5); c.stroke(); } }
    c.restore();
  };

  /* ---------- screen effects: the heartbeat vignette and blindness ---------- */
  W.drawScreen = function (c, Wd, Hd) {
    var p = hero(), cam = CC.getCamera ? CC.getCamera() : null;
    if (p && p.wound && p.wound.t > 0) {
      var a = 0.12 + pulseScreen * 0.32; if (a > 0.01) {
        var g = c.createRadialGradient(Wd / 2, Hd / 2, Math.min(Wd, Hd) * 0.3, Wd / 2, Hd / 2, Math.max(Wd, Hd) * 0.75);
        g.addColorStop(0, 'rgba(120,0,10,0)'); g.addColorStop(1, 'rgba(150,6,16,' + a + ')'); c.fillStyle = g; c.fillRect(0, 0, Wd, Hd);
      }
    }
    if (blindFade > 0 && p && cam) { // sight shrinks to a few steps around the hero
      var zx = Wd / cam.w, zy = Hd / cam.h, z = zx, sx = (p.x - cam.x) * zx, sy = (p.y - cam.y) * zy, r = 40 * z * (1 + 0.1 * Math.sin(Date.now() / 90));
      var g2 = c.createRadialGradient(sx, sy, r * 0.35, sx, sy, r * 1.35);
      g2.addColorStop(0, 'rgba(8,0,4,0)'); g2.addColorStop(1, 'rgba(8,0,4,' + (0.97 * blindFade) + ')');
      c.save(); c.fillStyle = g2; c.fillRect(0, 0, Wd, Hd);
      c.globalAlpha = 0.16 * blindFade; c.fillStyle = '#7a0008'; c.fillRect(0, 0, Wd, Hd); c.globalAlpha = blindFade;
      c.textAlign = 'center'; c.font = 'bold 22px Georgia, serif'; c.strokeStyle = '#1a0000'; c.lineWidth = 4; c.fillStyle = '#ff2a2a';
      c.strokeText('Blinded', Wd / 2, Hd * 0.2); c.fillText('Blinded', Wd / 2, Hd * 0.2); c.restore();
    }
  };
})(window);
