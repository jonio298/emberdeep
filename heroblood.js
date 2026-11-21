/* CC.HeroBlood - what getting hurt does to the hero.
 *   - a hit makes him flinch (a quick lean and recoil away from the blow, a red flash) and sends blood spurting in arcs from the wound
 *   - the lower his health, the bloodier he looks: blotches, splashes and drips build up on the body, one by one, in a fixed pattern. The look follows
 *     the health percentage, so a potion or any healing washes it away again (with a green-white sparkle), all the way back to clean at full health.
 *     Nothing is ever lost: no limbs, no head.
 * Hooks: update(dt), draw(ctx, cam) (world space spurts), clear(); classes.js asks flinch(p) for the pose and calls overlay(ctx, p, x, y) over the sprite.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, HB = CC.HeroBlood = {}, TAU = Math.PI * 2;
  var spurts = [], prevHp = null, prevFlash = 0, sev = 0, fl = null, sparkT = 0;
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hero() { var s = CC.state; return s && s.player && !s.player.stub ? s.player : null; }
  // the stain pattern, in the order it appears. x, y are body offsets from the hero's centre (feet are about y+10, head about y-14); t: 0 blotch, 1 splash, 2 drip
  var ST = [
    { x: 0, y: -3, r: 3.4, t: 0 }, { x: -3, y: 2, r: 2.4, t: 1 }, { x: 3, y: -6, r: 2.2, t: 0 }, { x: -1, y: -12, r: 2.2, t: 1 }, { x: 4, y: 3, r: 2.6, t: 0 },
    { x: -5, y: -5, r: 2, t: 2, l: 6 }, { x: 2, y: -10, r: 1.8, t: 0 }, { x: -3, y: 6, r: 2.2, t: 1 }, { x: 5, y: -2, r: 1.8, t: 2, l: 7 }, { x: 0, y: 5, r: 3, t: 0 },
    { x: -4, y: -9, r: 1.6, t: 1 }, { x: 3, y: 7, r: 1.8, t: 2, l: 5 }, { x: 1, y: -1, r: 3.6, t: 1 }, { x: -6, y: 1, r: 1.8, t: 0 }, { x: 6, y: -8, r: 1.6, t: 1 },
    { x: -2, y: -14, r: 1.6, t: 0 }, { x: 4, y: 8, r: 1.6, t: 0 }, { x: -1, y: 8, r: 2, t: 2, l: 4 }, { x: 0, y: -7, r: 4.2, t: 1 }, { x: -4, y: 4, r: 2.8, t: 0 }
  ];
  var COLS = ['#8c0e14', '#b01a22', '#5c070c', '#a0141c'];
  HB.clear = function () { spurts.length = 0; prevHp = null; fl = null; sev = 0; };
  HB.severity = function () { return sev; };
  function foe(p) { var E = CC.Enemies, best = null, bd = 90; if (E && E.list) for (var i = 0; i < E.list.length; i++) { var e = E.list[i]; if (!e || e.dead) continue; var d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } } return best; }
  function onHit(p, lost) {
    var e = foe(p), a = e ? Math.atan2(p.y - e.y, p.x - e.x) : Math.random() * TAU, frac = clamp(lost / Math.max(1, p.maxHp), 0, 0.5);
    fl = { t: 0.3, max: 0.3, dx: Math.cos(a), dy: Math.sin(a), s: 0.6 + frac * 2 };
    var n = 5 + Math.round(frac * 30) + Math.floor(Math.random() * 3), i;
    for (i = 0; i < n; i++) { // arcing spurts out of the wound, mostly away from the attacker
      var aa = a + (Math.random() - 0.5) * 1.5, v = 45 + Math.random() * 90;
      spurts.push({ x: p.x, y: p.y - 3, z: 4 + Math.random() * 8, vx: Math.cos(aa) * v, vy: Math.sin(aa) * v * 0.7, vz: 55 + Math.random() * 70, px: p.x, py: p.y - 3, pz: 6, w: 1 + Math.random() * 1.4, life: 0.7 });
    }
    if (CC.fx && CC.fx.blood) CC.fx.blood(p.x, p.y, 4 + Math.round(frac * 20), Math.cos(a), Math.sin(a), '#9a1218');
  }
  HB.update = function (dt) {
    var p = hero(); if (!p) { prevHp = null; return; } dt = Math.min(dt, 0.05);
    if (prevHp !== null) {
      var lost = prevHp - p.hp;
      if (lost > 0.01 && (p.hurtFlash || 0) >= 0.15 && prevFlash < (p.hurtFlash || 0)) onHit(p, lost);
      if (p.hp - prevHp >= 1 && sev > 0.02 && sparkT <= 0 && CC.fx && CC.fx.burst) { CC.fx.burst(p.x, p.y - 4, '#c8ffd8', 8, 60); sparkT = 0.25; }
    }
    prevHp = p.hp; prevFlash = p.hurtFlash || 0; sparkT -= dt;
    var target = clamp((0.95 - p.hp / Math.max(1, p.maxHp)) / 0.9, 0, 1); if (p.hp <= 0) target = 1;
    sev += (target - sev) * Math.min(1, dt * (target > sev ? 9 : 1.6)); // gets bloody fast, cleans up over about a second
    if (fl) { fl.t -= dt; if (fl.t <= 0) fl = null; }
    for (var i = spurts.length - 1; i >= 0; i--) {
      var q = spurts[i]; q.px = q.x; q.py = q.y; q.pz = q.z; q.vz -= 420 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.life -= dt;
      if (q.z <= 0 || q.life <= 0) spurts.splice(i, 1);
    }
  };
  // the flinch: lean away from the blow and shake it off
  HB.flinch = function (p) {
    if (!fl) return null; var u = fl.t / fl.max, k = Math.sin(Math.min(1, (1 - u) * 3.2) * Math.PI) * u * 0.9 + u * 0.1; // quick jolt, then settle
    return { ox: fl.dx * 3.2 * fl.s * u, oy: fl.dy * 1.6 * fl.s * u, rot: (fl.dx >= 0 ? 1 : -1) * 0.28 * fl.s * k, red: u };
  };
  function stain(c, s, a, x, y, t) {
    c.globalAlpha = a; var col = COLS[(s.x * 7 + s.y * 3 + 40 | 0) % 4];
    c.fillStyle = col; c.beginPath(); c.ellipse(x + s.x, y + s.y, s.r, s.r * 0.78, s.x * 0.5, 0, TAU); c.fill();
    if (s.t === 1) { c.fillStyle = COLS[1]; for (var k = 0; k < 4; k++) { var aa = k * 1.7 + s.x; c.fillRect(x + s.x + Math.cos(aa) * s.r * 1.5 - 0.5, y + s.y + Math.sin(aa) * s.r * 1.3 - 0.5, 1.2, 1.2); } }
    if (s.t === 2) { var ln = s.l * (0.6 + 0.4 * Math.min(1, a * 1.4)) + Math.sin(t * 1.5 + s.x) * 0.6; c.fillStyle = COLS[2]; c.fillRect(x + s.x - 0.6, y + s.y, 1.2, ln); c.beginPath(); c.arc(x + s.x, y + s.y + ln, 1, 0, TAU); c.fill(); }
  }
  // drawn right over the hero sprite (in the same, flinching, transform)
  HB.overlay = function (c, p, x, y) {
    var n = ST.length, i, t = Date.now() / 1000, f = HB.flinch(p), keep = c.globalAlpha;
    if (sev > 0.01) {
      c.save();
      for (i = 0; i < n; i++) { var a = clamp(sev * (n + 1) - i, 0, 1) * 0.82; if (a <= 0.02) break; stain(c, ST[i], a * keep, x, y, t); }
      if (sev > 0.5 && p.hp > 0) { // fresh drops falling off the body
        var dr = (t * 1.3) % 1; c.globalAlpha = 0.8 * keep; c.fillStyle = COLS[1]; c.fillRect(x - 2 + Math.sin(t * 0.7) * 3, y + 4 + dr * 7, 1.2, 2.2);
      }
      c.restore();
    }
    if (f && f.red > 0.05) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = f.red * 0.45 * keep; c.fillStyle = '#ff2a2a'; c.beginPath(); c.ellipse(x, y - 2, 8, 12, 0, 0, TAU); c.fill(); c.restore(); }
    c.globalAlpha = keep;
  };
  HB.draw = function (c, cam) {
    if (!spurts.length) return; c.save(); c.lineCap = 'round';
    for (var i = 0; i < spurts.length; i++) {
      var q = spurts[i]; c.strokeStyle = i % 3 ? '#b4141c' : '#7a0a10'; c.lineWidth = q.w; c.globalAlpha = Math.min(1, q.life * 2.2);
      c.beginPath(); c.moveTo(q.px - cam.x, q.py - q.pz - cam.y); c.lineTo(q.x - cam.x, q.y - q.z - cam.y); c.stroke();
    }
    c.restore();
  };
})(window);
