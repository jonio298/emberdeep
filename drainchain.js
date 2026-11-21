/* CC.DrainChain - the necromancer's Life Drain as a channelled chain.
 *   start(hero, enemy)   the hero latches on to the nearby enemy with a chain of green misty energy. For about 2.4 s it pulses every 0.4 s: each pulse damages the
 *                        enemy and heals the hero, and you can SEE both - a bright packet of life runs down the chain into the hero, a big green "+N" floats up, a ring
 *                        and rising crosses glow around the hero, and the enemy flinches in a green flash. The chain snaps if the enemy dies or gets too far away.
 * Hooks in main.js: update(dt), draw(ctx, cam) (world space), clear(). classes.js supplies drainTick(hero, enemy, mul) for the damage and healing.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, DC = CC.DrainChain = {}, TAU = Math.PI * 2;
  var DUR = 2.4, EVERY = 0.4, LEASH = 175, PACKET = 0.34, ch = null, wisps = [], crosses = [];
  function R() { return Math.random(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  DC.active = function () { return !!ch; };
  DC.clear = function () { ch = null; wisps.length = 0; crosses.length = 0; };
  DC.start = function (p, t) {
    if (!p || !t) return; ch = { p: p, t: t, age: 0, tick: 0.12, pulse: 0, hpulse: 0, packets: [], snap: 0, n: 0, healed: 0 }; wisps.length = 0; crosses.length = 0;
    if (CC.Audio) CC.Audio.fx('drain', { x: p.x, y: p.y, vol: 0.9, gap: 0 });
  };
  function geo(p, t, age) { // the two ends and the sagging middle of the chain
    var x0 = p.x, y0 = p.y - 4, x1 = t.x, y1 = t.y - (t.r || 8) * 0.25, mx = (x0 + x1) / 2, my = (y0 + y1) / 2, L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L, ny = (x1 - x0) / L, sag = 9 * Math.sin(age * 2.6) + 6;
    return { x0: x0, y0: y0, x1: x1, y1: y1, cx: mx + nx * sag, cy: my + ny * sag + 6, nx: nx, ny: ny, L: L };
  }
  function pt(g, f, age, amp) { // a point along the chain (f: 0 at the hero, 1 at the enemy), swaying as it pulls
    var u = 1 - f, x = u * u * g.x0 + 2 * u * f * g.cx + f * f * g.x1, y = u * u * g.y0 + 2 * u * f * g.cy + f * f * g.y1, w = Math.sin(f * 10 - age * 12) * (amp === undefined ? 3 : amp) * Math.sin(f * Math.PI);
    return { x: x + g.nx * w, y: y + g.ny * w };
  }
  DC.update = function (dt) {
    if (!ch) return; dt = Math.min(dt, 0.05); var p = ch.p, t = ch.t, i;
    ch.age += dt; ch.pulse = Math.max(0, ch.pulse - dt * 3); ch.hpulse = Math.max(0, ch.hpulse - dt * 2.6);
    if (ch.snap > 0) { ch.snap -= dt; if (ch.snap <= 0) ch = null; return; }
    var dist = Math.hypot(t.x - p.x, t.y - p.y);
    if (!t || t.dead || t.hp <= 0 || p.hp <= 0 || dist > LEASH || ch.age >= DUR || (CC.state && CC.state.mode !== 'dungeon')) { // the chain breaks
      ch.snap = 0.3; if (CC.fx && CC.fx.burst) CC.fx.burst(t.x, t.y, '#7dff9a', 10, 90); return;
    }
    ch.tick -= dt;
    if (ch.tick <= 0) { // a pulse: damage the enemy, heal the hero, and show both
      ch.tick += EVERY; ch.n++; var r = CC.Classes && CC.Classes.drainTick ? CC.Classes.drainTick(p, t, 0.45) : null;
      ch.pulse = 1; ch.packets.push({ a: 0, got: r ? r.got : 0 });
      if (CC.fx && CC.fx.burst) CC.fx.burst(t.x, t.y, '#7dff9a', 6, 70);
      if (CC.fx && CC.fx.shake) CC.fx.shake(1.2);
      if (CC.Audio) CC.Audio.fx('drain', { x: t.x, y: t.y, vol: 0.55, gap: 0 });
    }
    for (i = ch.packets.length - 1; i >= 0; i--) { // a packet of stolen life runs down the chain; when it lands the hero glows and the plus-signs rise
      var pk = ch.packets[i]; pk.a += dt / PACKET;
      if (pk.a >= 1) { ch.hpulse = 1; for (var k = 0; k < 4; k++) crosses.push({ x: p.x + (R() - 0.5) * 16, y: p.y - 2 + (R() - 0.5) * 8, vy: -(26 + R() * 20), life: 0.7, max: 0.7, s: 2.2 + R() * 1.6 }); ch.packets.splice(i, 1); }
    }
    if (R() < 0.9) wisps.push({ f: 1, v: 0.7 + R() * 0.6, off: (R() - 0.5) * 12, size: 5 + R() * 6, ph: R() * TAU });
    for (i = wisps.length - 1; i >= 0; i--) { wisps[i].f -= wisps[i].v * dt; if (wisps[i].f <= 0) wisps.splice(i, 1); }
    for (i = crosses.length - 1; i >= 0; i--) { var c = crosses[i]; c.y += c.vy * dt; c.life -= dt; if (c.life <= 0) crosses.splice(i, 1); }
  };
  function soft(c, x, y, r, col, a) { var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = a; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  DC.draw = function (c, cam) {
    if (!ch && !crosses.length) return; var i, k;
    c.save(); c.translate(-cam.x, -cam.y); c.lineCap = 'round'; c.globalCompositeOperation = 'lighter';
    if (ch) {
      var p = ch.p, t = ch.t, age = ch.age, fa = ch.snap > 0 ? ch.snap / 0.3 : Math.min(1, age / 0.18), g = geo(p, t, age), N = Math.max(10, Math.round(g.L / 7));
      // 1. the mist: a wide soft green haze hugging the chain, thicker on each pulse
      for (i = 0; i <= N; i++) { var q = pt(g, i / N, age, 4); soft(c, q.x, q.y, 11 + 6 * ch.pulse, 'rgba(70,230,130,1)', (0.16 + 0.16 * ch.pulse) * fa); }
      for (i = 0; i < wisps.length; i++) { var w = wisps[i], q2 = pt(g, w.f, age, 4); soft(c, q2.x + g.nx * w.off * Math.sin(w.ph + age * 3), q2.y + g.ny * w.off * Math.sin(w.ph + age * 3), w.size, 'rgba(160,255,190,1)', 0.3 * fa * Math.sin(w.f * Math.PI)); } // wisps streaming toward the hero
      // 2. two twisting strands
      for (k = 0; k < 2; k++) {
        c.beginPath(); for (i = 0; i <= N; i++) { var s = pt(g, i / N, age, 3 + k), o = Math.sin(i * 0.9 - age * 16 + k * Math.PI) * 3.2 * Math.sin(Math.PI * i / N); if (i) c.lineTo(s.x + g.nx * o, s.y + g.ny * o); else c.moveTo(s.x + g.nx * o, s.y + g.ny * o); }
        c.globalAlpha = 0.45 * fa; c.strokeStyle = '#2fd871'; c.lineWidth = 5 + 2 * ch.pulse; c.stroke(); c.globalAlpha = fa; c.strokeStyle = k ? '#d6ffe2' : '#7dff9a'; c.lineWidth = 1.6; c.stroke();
      }
      // 3. the chain itself: glowing links, alternately turned, brightening as a pulse runs past
      var nl = Math.max(4, Math.round(g.L / 11));
      for (i = 1; i < nl; i++) {
        var f = i / nl, a1 = pt(g, f, age, 3), a2 = pt(g, Math.min(1, f + 0.02), age, 3), ang = Math.atan2(a2.y - a1.y, a2.x - a1.x), glow = 0;
        for (k = 0; k < ch.packets.length; k++) glow = Math.max(glow, 1 - Math.min(1, Math.abs((1 - ch.packets[k].a) - f) * 6));
        c.save(); c.translate(a1.x, a1.y); c.rotate(ang); c.globalAlpha = (0.55 + 0.45 * glow) * fa; c.strokeStyle = glow > 0.2 ? '#f2fff6' : '#8dffb0'; c.lineWidth = 1.4;
        c.beginPath(); if (i % 2) c.ellipse(0, 0, 4.2, 2.2, 0, 0, TAU); else c.ellipse(0, 0, 2.2, 1.1, 0, 0, TAU); c.stroke(); c.restore();
      }
      // 4. packets of stolen life racing down to the hero
      for (i = 0; i < ch.packets.length; i++) { var pa = ch.packets[i], pp = pt(g, 1 - pa.a, age, 3); soft(c, pp.x, pp.y, 13, 'rgba(210,255,225,1)', 0.95 * fa); soft(c, pp.x, pp.y, 5, 'rgba(255,255,255,1)', fa); }
      // 5. the enemy end: a clawing green vortex round its feet, a flash and a spreading ring on each pulse
      var tr = (t.r || 8), fy = t.y + tr * 0.55;
      soft(c, t.x, t.y, tr * 2.4 + 8 * ch.pulse, 'rgba(60,220,120,1)', (0.28 + 0.4 * ch.pulse) * fa);
      for (k = 0; k < 2; k++) { c.globalAlpha = (0.55 - k * 0.15) * fa; c.strokeStyle = k ? '#7dff9a' : '#d6ffe2'; c.lineWidth = 1.6; c.setLineDash([5, 4]); c.beginPath(); c.ellipse(t.x, fy, tr + 5 + k * 4, (tr + 5 + k * 4) * 0.42, 0, age * (k ? -3 : 3), age * (k ? -3 : 3) + TAU * 0.85); c.stroke(); c.setLineDash([]); }
      if (ch.pulse > 0) { var rp = 1 - ch.pulse; c.globalAlpha = ch.pulse * fa; c.strokeStyle = '#eafff0'; c.lineWidth = 2.4 * ch.pulse + 0.6; c.beginPath(); c.ellipse(t.x, fy, tr + 4 + rp * 26, (tr + 4 + rp * 26) * 0.45, 0, 0, TAU); c.stroke(); }
      // 6. the hero end: a green swirl, and on every heal a big glow and ring so the healing is unmistakable
      soft(c, p.x, p.y - 2, 22 + 14 * ch.hpulse, 'rgba(90,255,150,1)', (0.2 + 0.55 * ch.hpulse) * fa);
      c.globalAlpha = (0.45 + 0.4 * ch.hpulse) * fa; c.strokeStyle = '#9dffbc'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(p.x, p.y + 8, 11 + 8 * (1 - ch.hpulse), 4.5 + 3 * (1 - ch.hpulse), 0, 0, TAU); c.stroke();
      if (ch.hpulse > 0) { var rh = 1 - ch.hpulse; c.globalAlpha = ch.hpulse * fa; c.strokeStyle = '#eafff0'; c.lineWidth = 2.4 * ch.hpulse + 0.5; c.beginPath(); c.arc(p.x, p.y - 2, 8 + rh * 30, 0, TAU); c.stroke(); }
    }
    // the plus-signs rising off the hero while he heals
    c.globalCompositeOperation = 'source-over';
    for (i = 0; i < crosses.length; i++) { var cr = crosses[i], al = clamp(cr.life / cr.max, 0, 1); c.globalAlpha = al; c.fillStyle = '#b6ffcc'; c.fillRect(cr.x - cr.s * 0.35, cr.y - cr.s, cr.s * 0.7, cr.s * 2); c.fillRect(cr.x - cr.s, cr.y - cr.s * 0.35, cr.s * 2, cr.s * 0.7); }
    c.restore(); c.globalAlpha = 1;
  };
})(window);
