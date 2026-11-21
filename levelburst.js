/* CC.LevelBurst - the level-up shockwave.
 *   start(hero)   a tiny misty ring opens right on the hero and grows: slowly at first, then faster and faster (about half way through it is racing), and
 *                 keeps going until it has run off the edge of the screen and across the whole map. Everything it sweeps over is lit up, knocked back
 *                 and hurt a little - hard and far at close range, barely at all when the ring reaches it from far away.
 *                 Swordsman: blue mist. Necromancer: green mist with drifting skulls. Thief: sharp red blades. Wizard: violet-white arcane mist.
 *   levelupvoice.mp3 is queued 1.55 s after the start (the level-up sound itself starts at once).
 * Hooks in main.js: update(dt), draw(ctx, cam) (world space), clear().
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, LB = CC.LevelBurst = {}, TAU = Math.PI * 2;
  var R0 = 6, V0 = 90, ACC = 560, R_END = 1500, VOICE_AT = 1.55, st = null;
  var STYLE = { // c: mist colours (rgb), core: bright edge, kind of art
    swordsman: { mist: '70,150,255', deep: '20,60,200', core: '#e4f4ff', kind: 'mist' },
    necromancer: { mist: '90,230,120', deep: '10,110,50', core: '#e6ffe8', kind: 'skull' },
    thief: { mist: '255,50,70', deep: '150,0,24', core: '#ffe4e8', kind: 'blade' },
    wizard: { mist: '190,150,255', deep: '90,40,200', core: '#f4ecff', kind: 'mist' }
  };
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function H(i, k) { var s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }
  function radius(t) { return R0 + V0 * t + 0.5 * ACC * t * t; }
  function foes() { var E = CC.Enemies, out = [], i; if (E && E.list) for (i = 0; i < E.list.length; i++) { var e = E.list[i]; if (e && !e.dead && e.hp > 0) out.push(e); } return out; }
  function solidAt(x, y) { var D = CC.Dungeon; try { return !!(D && D.isSolid && D.isSolid(x, y)); } catch (e) { return false; } }
  var pend = null; // a level-up whose shockwave is waiting for the perk screen to be dismissed
  LB.clear = function () { st = null; pend = null; };
  LB.active = function () { return !!st; };
  // the level-up sound plays at once (with the perk screen); the shockwave, its blast and the voice come after the perk is chosen
  LB.start = function (p) {
    if (!p || p.stub) return;
    if (CC.Audio) CC.Audio.play('levelup', { vol: 1, gap: 0, vary: 0 });
    if (!pend && !st) pend = { p: p, w: 2 };
  };
  function begin(p) {
    if (CC.Audio) { CC.Audio.play('levelupvoice', { vol: 1, gap: 0, vary: 0, delay: VOICE_AT }); CC.Audio.play('charge_blast', { vol: 0.7, gap: 0, delay: 0.05 }); }
    var sty = STYLE[p.classId] || STYLE.swordsman;
    st = { p: p, x: p.x, y: p.y, t: 0, r: R0, sty: sty, hit: {}, seed: Math.floor(Math.random() * 999) };
    if (CC.fx && CC.fx.shake) CC.fx.shake(6);
  }
  LB.update = function (dt) {
    if (pend) { // wait a couple of frames (the perk screen opens just after the level-up), then for it to close
      if (pend.p.perkOpen) pend.w = 2; else if (--pend.w <= 0) { var pp = pend.p; pend = null; begin(pp); }
      return;
    }
    if (!st) return; var p = st.p, i, f = foes(); dt = Math.min(dt, 0.05); st.t += dt; st.r = radius(st.t);
    var base = Math.max(4, p.dmg || (p.stats && p.stats.dmg) || 10);
    for (i = 0; i < f.length; i++) { // the front reaches a monster: one hit, strong when close, weak when far
      var e = f[i], key = e.id != null ? e.id : i, dx = e.x - st.x, dy = e.y - st.y, d = Math.hypot(dx, dy) || 1;
      if (st.hit[key] || d > st.r) continue; st.hit[key] = 1;
      var fall = Math.exp(-d / 230), dmg = Math.max(1, Math.round(base * (0.22 + 1.5 * fall)));
      e.kb = { vx: dx / d, vy: dy / d, sp: (e.boss ? 0.3 : 1) * (60 + 640 * fall), t: 0.36 };
      if (!e.boss) { e.state = 'stunned'; e.t = 0.25 + 0.7 * fall; }
      if (CC.Enemies && CC.Enemies.damage) CC.Enemies.damage(e, dmg, 'magic');
      if (CC.fx && CC.fx.burst && d < 600) CC.fx.burst(e.x, e.y, '#' + (st.sty.core.slice(1)), 4 + Math.round(6 * fall), 70);
    }
    for (i = 0; i < f.length; i++) { // knockback glide, wall-safe
      var g = f[i].kb; if (!g) continue; g.t -= dt; if (g.t <= 0) { f[i].kb = null; continue; }
      var sp = g.sp * (g.t / 0.36), nx = f[i].x + g.vx * sp * dt, ny = f[i].y + g.vy * sp * dt;
      if (!solidAt(nx, ny)) { f[i].x = nx; f[i].y = ny; } else f[i].kb = null;
    }
    if (st.t < 0.9 && CC.fx && CC.fx.shake && Math.random() < 0.4) CC.fx.shake(3 * (1 - st.t / 0.9) + 1);
    if (st.r > R_END) st = null;
  };

  function skull(c, x, y, s, rot, a) {
    c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = a;
    c.fillStyle = 'rgba(214,255,220,1)'; c.beginPath(); c.arc(0, -s * 0.15, s * 0.62, Math.PI, 0); c.lineTo(s * 0.4, s * 0.55); c.lineTo(-s * 0.4, s * 0.55); c.closePath(); c.fill();
    c.fillStyle = 'rgba(6,50,20,0.95)'; c.beginPath(); c.arc(-s * 0.24, -s * 0.12, s * 0.17, 0, TAU); c.arc(s * 0.24, -s * 0.12, s * 0.17, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(0, s * 0.08); c.lineTo(-s * 0.08, s * 0.28); c.lineTo(s * 0.08, s * 0.28); c.fill();
    c.restore();
  }
  LB.draw = function (c, cam) {
    if (!st) return; var sty = st.sty, t = st.t, r = st.r, x = st.x - cam.x, y = st.y - cam.y, i;
    var band = 12 + r * 0.14, fade = clamp((R_END - r) / 500, 0, 1), grow = clamp(r / 40, 0.25, 1), a0 = fade * grow;
    var far = Math.hypot(Math.max(Math.abs(x), Math.abs(cam.w - x)), Math.max(Math.abs(y), Math.abs(cam.h - y))); if (r - band * 6 > far + 60) return; // the whole screen is behind the wave
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    // the light the wave leaves behind: the ground it has crossed glows, fading with distance behind the front
    var inner = Math.max(0, r - band * 7), lg = c.createRadialGradient(x, y, inner, x, y, r + band * 0.8);
    lg.addColorStop(0, 'rgba(' + sty.mist + ',0)'); lg.addColorStop(0.7, 'rgba(' + sty.mist + ',' + (0.17 * a0) + ')'); lg.addColorStop(1, 'rgba(' + sty.mist + ',0)');
    c.fillStyle = lg; c.fillRect(0, 0, cam.w, cam.h);
    if (r < 90) { var cg = c.createRadialGradient(x, y, 0, x, y, r * 1.6 + 24); cg.addColorStop(0, 'rgba(255,255,255,' + (0.8 * (1 - r / 90)) + ')'); cg.addColorStop(1, 'rgba(' + sty.mist + ',0)'); c.fillStyle = cg; c.fillRect(x - r * 2 - 30, y - r * 2 - 30, r * 4 + 60, r * 4 + 60); }
    // the misty ring: overlapping soft blobs that churn and drift, a bright thin core on the front edge
    var N = Math.round(clamp(r / 3, 44, 340)), spin = t * 0.9;
    for (i = 0; i < N; i++) {
      var ang = i / N * TAU + spin * (i % 2 ? 1 : -0.6), wob = Math.sin(ang * 5 + t * 6 + st.seed) * band * 0.2 + Math.sin(ang * 11 - t * 4) * band * 0.14;
      var rr = r - band * 0.3 + wob, px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
      if (px < -band * 3 || px > cam.w + band * 3 || py < -band * 3 || py > cam.h + band * 3) continue;
      var br = band * (1.5 + 1.3 * H(i, st.seed)), al = a0 * (0.42 + 0.26 * H(i, 3 + st.seed)), g = c.createRadialGradient(px, py, 0, px, py, br);
      g.addColorStop(0, 'rgba(' + sty.mist + ',' + al + ')'); g.addColorStop(0.5, 'rgba(' + sty.deep + ',' + al * 0.55 + ')'); g.addColorStop(1, 'rgba(' + sty.deep + ',0)');
      c.fillStyle = g; c.fillRect(px - br, py - br, br * 2, br * 2);
    }
    if (sty.kind === 'blade') { // sharp red shards pointing outward along the front
      var M = Math.round(clamp(r / 9, 18, 120));
      for (i = 0; i < M; i++) {
        var aa = i / M * TAU + t * 0.25, len = band * (1.2 + 1.6 * H(i, 7)), bx = x + Math.cos(aa) * (r - band * 0.4), by = y + Math.sin(aa) * (r - band * 0.4);
        if (bx < -80 || bx > cam.w + 80 || by < -80 || by > cam.h + 80) continue;
        var ca = Math.cos(aa), sa = Math.sin(aa);
        c.globalAlpha = a0 * 0.9; c.fillStyle = i % 3 ? '#ff3a52' : sty.core; c.beginPath(); c.moveTo(bx + ca * len, by + sa * len); c.lineTo(bx - sa * 3 - ca * 2, by + ca * 3 - sa * 2); c.lineTo(bx + sa * 3 - ca * 2, by - ca * 3 - sa * 2); c.closePath(); c.fill();
      }
      c.globalAlpha = a0; c.strokeStyle = '#ff2a44'; c.lineWidth = 2.2; c.beginPath(); for (i = 0; i <= 90; i++) { var q = i / 90 * TAU, jr = r + (i % 2 ? band * 0.35 : -band * 0.12); if (i) c.lineTo(x + Math.cos(q) * jr, y + Math.sin(q) * jr); else c.moveTo(x + jr, y); } c.stroke();
    }
    if (sty.kind === 'skull') { // pale skulls drifting in the green mist
      var K = Math.round(clamp(r / 40, 4, 30));
      for (i = 0; i < K; i++) {
        var sa2 = i / K * TAU + t * 0.5 + H(i, 5) * 0.5, sr = r - band * (0.2 + 0.9 * H(i, 9)) + Math.sin(t * 3 + i) * 4, sx = x + Math.cos(sa2) * sr, sy = y + Math.sin(sa2) * sr;
        if (sx < -30 || sx > cam.w + 30 || sy < -30 || sy > cam.h + 30) continue;
        c.globalCompositeOperation = 'source-over'; skull(c, sx, sy, 8 + band * 0.4, sa2 + Math.PI / 2 + Math.sin(t * 4 + i) * 0.3, a0 * 0.55); c.globalCompositeOperation = 'lighter';
      }
    }
    c.globalAlpha = a0 * 0.4; c.strokeStyle = sty.core; c.lineWidth = Math.max(1.2, band * 0.08); c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); // the bright front
    c.restore();
  };
})(window);
