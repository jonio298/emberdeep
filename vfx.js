/* Emberdeep VFX: a layer of stylised spell effects on top of the combat code.
 * Particles (embers, ice shards, smoke, bones, souls, sparks) plus timed effects (nova rings, explosions, lightning, sigils),
 * all drawn in world space just above the ground, plus screen flashes (the sky flashing yellow for chain lightning)
 * and the Patchwork Horror's darkness. Nothing here touches gameplay; spawn() is also mirrored to the co-op partner.
 *   CC.Vfx.spawn(type, x, y, r, opts)   CC.Vfx.emit({...particle})   CC.Vfx.chain(points)   CC.Vfx.skyFlash(col, sec)
 *   CC.Vfx.update(dt)   CC.Vfx.draw(ctx, cam)   CC.Vfx.drawScreen(ctx, W, H)   CC.Vfx.drawDarkness(ctx, cam)
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, V = CC.Vfx = {}, TAU = Math.PI * 2;
  var fxs = [], parts = [], T = 0, sky = { t: 0, max: 1, col: '#ffe14a', a: 0.4 }, bolts = [], dark = { lvl: 0, at: 0 };
  var MAXP = 460, MAXF = 26;

  /* ---------- small helpers ---------- */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { t = cl(t, 0, 1); return t * t * (3 - 2 * t); }
  function out(t) { t = cl(t, 0, 1); return 1 - (1 - t) * (1 - t); }
  function back(t) { t = cl(t, 0, 1); var s = 1.7; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
  function hash(i, s) { var x = Math.sin(i * 127.1 + (s || 0) * 311.7) * 43758.5453; return x - Math.floor(x); }
  var rgbCache = {};
  function rgb(hex) {
    var v = rgbCache[hex];
    if (v) return v;
    var h = String(hex || '#fff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    v = rgbCache[hex] = [parseInt(h.substr(0, 2), 16) || 0, parseInt(h.substr(2, 2), 16) || 0, parseInt(h.substr(4, 2), 16) || 0];
    return v;
  }
  function rgba(hex, a) { var v = rgb(hex); return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + cl(a, 0, 1).toFixed(3) + ')'; }
  function soft(c, x, y, r, col, a) { // a soft radial glow
    if (r < 0.5 || a <= 0.004) return;
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(0.45, rgba(col, a * 0.45)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  function ringS(c, x, y, r, col, w, a) { if (r < 0.5 || a <= 0.004) return; c.globalAlpha = cl(a, 0, 1); c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
  function poly(c, pts, col) { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); }
  function add(c, on) { c.globalCompositeOperation = on ? 'lighter' : 'source-over'; }
  function shake(n) { if (CC.fx && CC.fx.shake) CC.fx.shake(n); }
  function mpSend(type, x, y, r, o) {
    var M = CC.Multiplayer;
    if (!M || !M.sendFx || !M.active) return;
    var d = { y: type, x: Math.round(x), py: Math.round(y), r: Math.round(r || 0) };
    if (o) for (var k in o) if (typeof o[k] === 'number' && k !== 'remote') d[k] = Math.round(o[k] * 100) / 100;
    M.sendFx('vf', d);
  }

  /* ---------- particles ---------- */
  // kinds: dot, streak, shard, smoke, ember, bone, soul, star, snow, drop
  V.emit = function (o) {
    if (parts.length >= MAXP) parts.shift();
    o.life = o.life || 0.6; o.max = o.life; o.vx = o.vx || 0; o.vy = o.vy || 0; o.size = o.size || 2; o.rot = o.rot || 0;
    o.col = o.col || '#fff'; o.kind = o.kind || 'dot';
    parts.push(o); return o;
  };
  function burstP(x, y, n, f) { for (var i = 0; i < n; i++) f(i, rnd(0, TAU)); }
  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      if ((p.life -= dt) <= 0) { parts.splice(i, 1); continue; }
      if (p.delay > 0) { p.delay -= dt; p.life += dt; continue; }
      if (p.ax) p.vx += p.ax * dt;
      if (p.ay) p.vy += p.ay * dt;
      if (p.drag) { var k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += (p.vr || 0) * dt;
      if (p.grow) p.size += p.grow * dt;
    }
  }
  function drawParts(c, cam) {
    var i, p;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (p.delay > 0) continue;
      var x = p.x - cam.x, y = p.y - cam.y;
      if (x < -40 || y < -60 || x > cam.w + 40 || y > cam.h + 40) continue;
      var u = p.life / p.max, a = cl(u * (p.fade === false ? 1 : 1.3), 0, 1) * (p.alpha === undefined ? 1 : p.alpha);
      c.globalAlpha = a;
      add(c, !!p.add);
      var s = Math.max(0.3, p.size * (p.shrink ? (0.3 + 0.7 * u) : 1));
      if (p.kind === 'smoke') { soft(c, x, y, s, p.col, a * (p.add ? 0.8 : 0.55)); c.globalAlpha = 1; }
      else if (p.kind === 'streak') {
        var sp = Math.hypot(p.vx, p.vy) || 1, l = Math.min(14, 2 + sp * 0.05);
        c.strokeStyle = p.col; c.lineWidth = s; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - p.vx / sp * l, y - p.vy / sp * l); c.stroke();
      } else if (p.kind === 'shard') {
        c.save(); c.translate(x, y); c.rotate(p.rot);
        poly(c, [0, -s * 1.9, s * 0.75, 0, 0, s * 1.5, -s * 0.75, 0], p.col);
        poly(c, [0, -s * 1.9, s * 0.75, 0, 0, 0], p.col2 || '#ffffff');
        c.restore();
      } else if (p.kind === 'ember') {
        var fl = 0.6 + 0.4 * Math.sin(T * 30 + p.rot * 9);
        c.fillStyle = p.col; c.fillRect(x - s / 2, y - s / 2, s * fl + 0.6, s * fl + 0.6);
      } else if (p.kind === 'bone') {
        c.save(); c.translate(x, y); c.rotate(p.rot); c.strokeStyle = '#2a2a24'; c.lineWidth = s * 0.9 + 1.2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.stroke();
        c.strokeStyle = p.col; c.lineWidth = s * 0.9; c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.stroke();
        c.fillStyle = p.col; c.beginPath(); c.arc(-s, -s * 0.35, s * 0.5, 0, TAU); c.arc(-s, s * 0.35, s * 0.5, 0, TAU); c.arc(s, -s * 0.35, s * 0.5, 0, TAU); c.arc(s, s * 0.35, s * 0.5, 0, TAU); c.fill();
        c.restore();
      } else if (p.kind === 'soul') {
        c.save(); c.translate(x, y); c.rotate(Math.atan2(p.vy, p.vx) + Math.PI / 2);
        var tl = s * 3.2;
        c.fillStyle = rgba(p.col, a * 0.55); c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(s * 1.1, 0, 0, tl); c.quadraticCurveTo(-s * 1.1, 0, 0, -s); c.fill();
        c.fillStyle = rgba('#ffffff', a * 0.85); c.beginPath(); c.arc(0, -s * 0.25, s * 0.55, 0, TAU); c.fill();
        c.restore();
      } else if (p.kind === 'star') {
        c.save(); c.translate(x, y); c.rotate(p.rot); c.fillStyle = p.col;
        c.beginPath(); c.moveTo(0, -s * 2); c.lineTo(s * 0.3, -s * 0.3); c.lineTo(s * 2, 0); c.lineTo(s * 0.3, s * 0.3); c.lineTo(0, s * 2); c.lineTo(-s * 0.3, s * 0.3); c.lineTo(-s * 2, 0); c.lineTo(-s * 0.3, -s * 0.3); c.closePath(); c.fill();
        c.restore();
      } else { // dot / snow / drop
        c.fillStyle = p.col; c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
      }
    }
    add(c, false); c.globalAlpha = 1;
  }

  /* ---------- drawing primitives ---------- */
  function flame(c, x, y, h, w, t, seed, hot) { // a licking teardrop flame, base at (x,y), tip upward
    var sw = Math.sin(t * 9 + seed * 3) * w * 0.35, sw2 = Math.sin(t * 13 + seed) * w * 0.2;
    c.fillStyle = hot ? '#ff5a1a' : '#c2260f';
    c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.9 + sw2, y - h * 0.55, x + sw, y - h); c.quadraticCurveTo(x + w * 0.9 + sw2, y - h * 0.55, x + w, y); c.closePath(); c.fill();
    c.fillStyle = '#ff9a2e';
    c.beginPath(); c.moveTo(x - w * 0.62, y); c.quadraticCurveTo(x - w * 0.5 + sw2, y - h * 0.5, x + sw * 0.8, y - h * 0.8); c.quadraticCurveTo(x + w * 0.5 + sw2, y - h * 0.5, x + w * 0.62, y); c.closePath(); c.fill();
    c.fillStyle = '#ffe58a';
    c.beginPath(); c.moveTo(x - w * 0.3, y); c.quadraticCurveTo(x - w * 0.2, y - h * 0.4, x + sw * 0.5, y - h * 0.5); c.quadraticCurveTo(x + w * 0.2, y - h * 0.4, x + w * 0.3, y); c.closePath(); c.fill();
  }
  function crystal(c, x, y, ang, len, w, col1, col2) { // a sharp faceted crystal, base at (x,y)
    c.save(); c.translate(x, y); c.rotate(ang);
    poly(c, [0, -w, len * 0.72, -w * 0.55, len, 0, len * 0.72, w * 0.55, 0, w], col1);
    poly(c, [0, -w, len * 0.72, -w * 0.55, len, 0, len * 0.3, 0], col2);
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(1, -w * 0.5); c.lineTo(len * 0.9, -0.5); c.stroke();
    c.restore();
  }
  function jag(x1, y1, x2, y2, seed, amp, seg) { // a jagged polyline between two points
    var pts = [x1, y1], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    seg = seg || Math.max(3, Math.round(L / 9));
    for (var i = 1; i < seg; i++) {
      var u = i / seg, off = (hash(i, seed) - 0.5) * 2 * amp * Math.sin(u * Math.PI);
      pts.push(x1 + dx * u + nx * off, y1 + dy * u + ny * off);
    }
    pts.push(x2, y2); return pts;
  }
  function path(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); }
  // a crackling bolt: wide glow, coloured body, white-hot core, and a couple of forks
  function bolt(c, x1, y1, x2, y2, seed, amp, w, col, a, forks) {
    var pts = jag(x1, y1, x2, y2, seed, amp);
    c.lineCap = 'round'; c.lineJoin = 'round';
    add(c, true);
    c.globalAlpha = a * 0.35; c.strokeStyle = col; c.lineWidth = w * 4.2; path(c, pts); c.stroke();
    c.globalAlpha = a * 0.8; c.strokeStyle = col; c.lineWidth = w * 1.7; path(c, pts); c.stroke();
    c.globalAlpha = a; c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(0.8, w * 0.7); path(c, pts); c.stroke();
    if (forks) for (var f = 0; f < forks; f++) {
      var k = 2 + 2 * Math.floor(hash(f, seed + 5) * (pts.length / 2 - 3)), bx = pts[k], by = pts[k + 1];
      var ang = Math.atan2(y2 - y1, x2 - x1) + (hash(f, seed + 9) - 0.5) * 2.2, fl = (6 + hash(f, seed + 7) * 16) * (w / 2 + 0.5);
      var fp = jag(bx, by, bx + Math.cos(ang) * fl, by + Math.sin(ang) * fl, seed + f, 3, 3);
      c.globalAlpha = a * 0.6; c.strokeStyle = col; c.lineWidth = w * 0.9; path(c, fp); c.stroke();
      c.globalAlpha = a * 0.9; c.strokeStyle = '#fff'; c.lineWidth = Math.max(0.6, w * 0.35); path(c, fp); c.stroke();
    }
    add(c, false); c.globalAlpha = 1;
  }
  function runes(c, x, y, r, col, t, n, a) { // a spinning magic circle with glyphs and an inscribed star
    c.save(); c.translate(x, y); c.globalAlpha = a;
    c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
    c.lineWidth = 0.8; c.beginPath(); c.arc(0, 0, r * 0.84, 0, TAU); c.stroke();
    var k, g = 'ᚠᚨᚱᛟᛉᚢᛖᚹᛇᛏᛒᛞ';
    c.font = 'bold ' + Math.max(7, r * 0.14) + 'px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col;
    for (k = 0; k < (n || 8); k++) { var an = k * TAU / (n || 8) + t * 0.4; c.fillText(g[k % g.length], Math.cos(an) * r * 0.92, Math.sin(an) * r * 0.92); }
    c.rotate(-t * 0.5); c.lineWidth = 1;
    for (k = 0; k < 2; k++) { c.rotate(k * Math.PI / 3); c.beginPath(); for (var j = 0; j < 3; j++) { var aa = j * TAU / 3 - Math.PI / 2; c.lineTo(Math.cos(aa) * r * 0.7, Math.sin(aa) * r * 0.7); } c.closePath(); c.stroke(); }
    c.restore();
  }
  function skull(c, x, y, s, col, a) {
    c.save(); c.translate(x, y); c.scale(s, s); c.globalAlpha = a;
    c.fillStyle = col; c.beginPath(); c.ellipse(0, -1, 7, 7.5, 0, 0, TAU); c.fill(); c.fillRect(-4, 4, 8, 5);
    c.fillStyle = '#10131a'; c.beginPath(); c.ellipse(-3, -1.5, 2, 2.6, 0, 0, TAU); c.ellipse(3, -1.5, 2, 2.6, 0, 0, TAU); c.fill();
    c.fillRect(-0.7, 2, 1.4, 2); c.fillRect(-2.5, 6, 1, 3); c.fillRect(0, 6, 1, 3); c.fillRect(2.5, 6, 1, 3);
    c.restore();
  }
  function gnd(c, x, y, rx, col, a) { // soft ground-contact ellipse
    if (a <= 0.004) return; c.save(); c.translate(x, y); c.scale(1, 0.55); soft(c, 0, 0, rx, col, a); c.restore();
  }

  V._h = { rnd: rnd, cl: cl, ease: ease, out: out, back: back, hash: hash, rgba: rgba, soft: soft, ringS: ringS, poly: poly, add: add, flame: flame, crystal: crystal, bolt: bolt, runes: runes, skull: skull, gnd: gnd, path: path, jag: jag, shake: shake, burstP: burstP };
  V._s = { fxs: fxs, parts: parts, sky: sky, bolts: bolts, dark: dark };
  V._drawParts = drawParts;
  V._T = function () { return T; };
  V._tick = function (dt) { T += dt; };
})(window);

/* CC.Vfx part 2: the timed effects (explosions, novas, lightning, sigils) and their spawners. */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, V = CC.Vfx, H = V._h, S = V._s, TAU = Math.PI * 2;
  var fxs = S.fxs, parts = S.parts, bolts = S.bolts, sky = S.sky;
  var rnd = H.rnd, cl = H.cl, ease = H.ease, out = H.out, back = H.back, hash = H.hash, rgba = H.rgba, soft = H.soft, ringS = H.ringS, poly = H.poly,
      add = H.add, flame = H.flame, crystal = H.crystal, bolt = H.bolt, runes = H.runes, skull = H.skull, gnd = H.gnd, shake = H.shake, jag = H.jag, path = H.path;
  function tick() { return V._T(); }
  function push(e) { if (fxs.length >= 26) fxs.shift(); e.t = 0; e.seed = Math.random() * 100; fxs.push(e); return e; }
  function emit(o) { return V.emit(o); }
  function mp(type, x, y, r, o) {
    var M = CC.Multiplayer;
    if (!M || !M.sendFx || !M.active || (o && o.remote)) return;
    var d = { y: type, x: Math.round(x), py: Math.round(y), r: Math.round(r || 0) };
    if (o) for (var k in o) if (typeof o[k] === 'number') d[k] = Math.round(o[k] * 100) / 100;
    M.sendFx('vf', d);
  }
  var SP = {}, D = {};

  /* ============ FIRE ============ */
  SP.fireBoom = function (x, y, r, o) {
    var big = o.big ? 1.5 : 1, i;
    push({ type: 'fireBoom', x: x, y: y, r: r * big, life: o.big ? 1.1 : 0.8 });
    push({ type: 'scorch', x: x, y: y, r: r * 0.85 * big, life: 3.4 });
    for (i = 0; i < 26 * big; i++) { var a = rnd(0, TAU), v = rnd(50, 170) * big; emit({ kind: 'ember', add: true, x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, ay: -50, drag: 1.1, life: rnd(0.5, 1.1), size: rnd(1.6, 3.4), col: i % 3 ? '#ffb347' : '#fff0a0', rot: rnd(0, 6) }); }
    for (i = 0; i < 9 * big; i++) { var b = rnd(0, TAU), w = rnd(10, 50); emit({ kind: 'smoke', x: x + Math.cos(b) * r * 0.3, y: y + Math.sin(b) * r * 0.3, vx: Math.cos(b) * w, vy: Math.sin(b) * w - 24, drag: 1.4, life: rnd(0.7, 1.3), size: r * rnd(0.25, 0.45), grow: r * 0.35, col: i % 2 ? '#3a302c' : '#6a5a50', delay: rnd(0.05, 0.25) }); }
    for (i = 0; i < 8; i++) { var c2 = rnd(0, TAU), s2 = rnd(80, 190); emit({ kind: 'dot', x: x, y: y, vx: Math.cos(c2) * s2, vy: Math.sin(c2) * s2 - 90, ay: 420, life: rnd(0.4, 0.7), size: rnd(1.4, 2.4), col: '#2c1e1a' }); }
  };
  D.fireBoom = function (c, e, x, y, u, tt) {
    var r = e.r, i;
    add(c, true);
    if (u < 0.22) soft(c, x, y, r * 1.7 * (1 - u / 0.22 * 0.4), '#fff0b0', (1 - u / 0.22) * 0.9);
    var core = r * (0.3 + 0.7 * out(u * 1.6));
    soft(c, x, y - 2, core * 1.15, '#ff6a1a', (1 - u) * 0.85); soft(c, x, y - 2, core * 0.6, '#ffd27a', (1 - u) * 0.9);
    add(c, false);
    c.lineCap = 'round';
    c.globalAlpha = 1 - u; c.strokeStyle = '#ffe0a0'; c.lineWidth = 4 * (1 - u) + 1; c.beginPath(); c.arc(x, y, r * out(u * 1.3), 0, TAU); c.stroke();
    c.globalAlpha = (1 - u) * 0.8; c.strokeStyle = '#ff6a1a'; c.lineWidth = 2.5 * (1 - u) + 0.6; c.beginPath(); c.arc(x, y, r * out(u) * 0.78, 0, TAU); c.stroke();
    for (i = 0; i < 9; i++) {
      var a = i * TAU / 9 + e.seed, dist = r * 0.62 * out(Math.min(1, u * 2.2)), h = r * (0.5 + 0.3 * hash(i, e.seed)) * (1 - ease(u)) * (u < 0.15 ? u / 0.15 : 1);
      c.globalAlpha = 1 - u * 0.5;
      flame(c, x + Math.cos(a) * dist, y + Math.sin(a) * dist * 0.62 + 4, h, r * 0.15, tt, i, true);
    }
    c.globalAlpha = 1;
  };
  D.scorch = function (c, e, x, y, u) {
    var a = (u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9) * 0.5;
    gnd(c, x, y + 3, e.r, '#000000', a);
    if (u < 0.35) { c.globalAlpha = (1 - u / 0.35) * 0.8; c.strokeStyle = '#ff7a2a'; c.lineWidth = 1.2; for (var i = 0; i < 7; i++) { var an = i * 0.9 + e.seed; c.beginPath(); c.moveTo(x, y + 3); c.lineTo(x + Math.cos(an) * e.r * 0.7, y + 3 + Math.sin(an) * e.r * 0.4); c.stroke(); } c.globalAlpha = 1; }
  };
  SP.meteorBoom = function (x, y, r, o) {
    SP.fireBoom(x, y, r, { big: true, remote: true });
    push({ type: 'dust', x: x, y: y, r: r * 1.6, life: 0.9 });
    for (var i = 0; i < 14; i++) { var a = rnd(0, TAU), v = rnd(90, 240); emit({ kind: 'ember', add: true, x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, ay: 360, life: rnd(0.7, 1.3), size: rnd(2, 4), col: '#ff9a2e', rot: rnd(0, 6) }); }
    V.skyFlash('#ffb04a', 0.3, 0.3); shake(7);
  };
  D.dust = function (c, e, x, y, u) {
    c.globalAlpha = (1 - u) * 0.5; c.strokeStyle = '#b79a72'; c.lineWidth = 6 * (1 - u) + 1; c.beginPath(); c.arc(x, y, e.r * out(u * 1.4), 0, TAU); c.stroke();
    c.globalAlpha = (1 - u) * 0.35; c.strokeStyle = '#6a5640'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, e.r * out(u) * 0.8, 0, TAU); c.stroke(); c.globalAlpha = 1;
  };
  // the meteor itself plus its warning circle (screen coords of the impact point; q: 0 = just called, 1 = impact)
  V.drawMeteor = function (c, x, y, q, rad) {
    var tt = tick();
    c.save();
    c.globalAlpha = 0.5 + 0.4 * q; c.strokeStyle = '#ff7a3a'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.stroke();
    c.globalAlpha = 0.9; c.strokeStyle = '#ffd27a'; c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, rad * (1 - q * 0.9), 0, TAU); c.stroke();
    c.globalAlpha = 1; add(c, true); soft(c, x, y, rad * 1.1, '#ff5a1a', 0.12 + 0.3 * q); add(c, false);
    runes(c, x, y, rad * 0.9, '#ff9a4a', tt * 1.5, 8, 0.35 + 0.3 * q);
    var mx = x + (1 - q) * 55, my = y - (1 - q) * 175;
    c.globalAlpha = 1;
    // fiery tail
    var tx = mx + 46, ty = my - 62;
    poly(c, [mx - 9, my + 2, mx + 9, my - 2, tx + 6, ty, tx - 8, ty + 6], 'rgba(255,70,20,.55)');
    poly(c, [mx - 6, my + 1, mx + 6, my - 1, tx - 1, ty + 10], 'rgba(255,150,50,.75)');
    poly(c, [mx - 3, my, mx + 3, my, tx - 14, ty + 30], 'rgba(255,235,150,.9)');
    add(c, true); soft(c, mx, my, 30, '#ff7a1a', 0.7); soft(c, mx, my, 14, '#fff0b0', 0.8); add(c, false);
    c.fillStyle = '#2e211d'; c.beginPath(); c.arc(mx, my, 9.5, 0, TAU); c.fill();
    c.fillStyle = '#4a342b'; c.beginPath(); c.arc(mx - 2, my - 2, 6, 0, TAU); c.fill();
    c.strokeStyle = '#ff9a2e'; c.lineWidth = 1.4; for (var i = 0; i < 4; i++) { c.beginPath(); c.moveTo(mx + Math.cos(i * 1.7) * 2, my + Math.sin(i * 1.7) * 2); c.lineTo(mx + Math.cos(i * 1.7 + 0.5) * 8, my + Math.sin(i * 1.7 + 0.5) * 8); c.stroke(); }
    c.restore();
  };

  /* ============ FROST ============ */
  SP.frostNova = function (x, y, r, o) {
    push({ type: 'frostNova', x: x, y: y, r: r, life: 1.8 });
    var i;
    for (i = 0; i < 34; i++) { var a = rnd(0, TAU), v = rnd(80, 260); emit({ kind: 'shard', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 70, ay: 260, life: rnd(0.5, 1.1), size: rnd(1.8, 3.6), col: '#8fd8ff', col2: '#ffffff' }); }
    for (i = 0; i < 13; i++) { var b = rnd(0, TAU), w = rnd(24, 90); emit({ kind: 'smoke', x: x, y: y, vx: Math.cos(b) * w, vy: Math.sin(b) * w * 0.6, drag: 1.4, life: rnd(0.8, 1.5), size: r * rnd(0.16, 0.3), grow: r * 0.22, col: '#cfeeff' }); }
    for (i = 0; i < 46; i++) { var c2 = rnd(0, TAU), d = Math.sqrt(Math.random()) * r * 1.05; emit({ kind: 'star', add: true, delay: rnd(0, 0.45), x: x + Math.cos(c2) * d, y: y + Math.sin(c2) * d * 0.85, vy: rnd(-26, -6), life: rnd(0.7, 1.5), size: rnd(1.2, 3), col: i % 3 ? '#eaffff' : '#9fe8ff', vr: rnd(-4, 4), rot: rnd(0, 3) }); }
    for (i = 0; i < 22; i++) { var d2 = rnd(0.1, 1.1) * r, a2 = rnd(0, TAU); emit({ kind: 'snow', add: true, delay: rnd(0, 0.5), x: x + Math.cos(a2) * d2, y: y + Math.sin(a2) * d2 * 0.8 - 70, vx: rnd(-18, 18), vy: rnd(40, 90), life: rnd(0.8, 1.4), size: rnd(1.2, 2.6), col: '#ffffff' }); }
    shake(5);
  };
  D.frostNova = function (c, e, x, y, u, tt) {
    var r = e.r, g = out(Math.min(1, u * 3.2)), fade = u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1, i, k;
    c.save();
    if (u < 0.16) { add(c, true); soft(c, x, y, r * (0.5 + g), '#ffffff', (1 - u / 0.16) * 0.85); add(c, false); } // the flash of white
    // the frost that settles on the ground and lingers
    c.globalAlpha = 0.62 * fade; var fg = c.createRadialGradient(x, y, r * 0.1, x, y, r * g * 1.02);
    fg.addColorStop(0, 'rgba(235,252,255,0.75)'); fg.addColorStop(0.7, 'rgba(170,222,250,0.6)'); fg.addColorStop(1, 'rgba(120,190,240,0)');
    c.fillStyle = fg; c.beginPath(); c.ellipse(x, y, r * g * 1.02, r * g * 0.88, 0, 0, TAU); c.fill();
    c.globalAlpha = 1;
    // frost ferns: jagged crystal veins running out from the centre
    c.strokeStyle = 'rgba(245,253,255,' + (0.8 * fade).toFixed(3) + ')'; c.lineWidth = 1.3; c.lineCap = 'round';
    for (k = 0; k < 14; k++) { var va = k * TAU / 14 + e.seed, pts = jag(x, y, x + Math.cos(va) * r * 0.94 * g, y + Math.sin(va) * r * 0.82 * g, e.seed + k, 6, 7); c.beginPath(); c.moveTo(pts[0], pts[1]); for (i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke(); }
    // the snowflake etched in the ground
    if (u < 0.9) {
      c.save(); c.translate(x, y); c.rotate(tt * 0.22); c.globalAlpha = 0.9 * fade; c.strokeStyle = '#ffffff'; c.lineWidth = 1.8;
      for (k = 0; k < 6; k++) {
        c.save(); c.rotate(k * Math.PI / 3); c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 0.86 * g, 0); c.stroke();
        [0.3, 0.52, 0.72, 0.9].forEach(function (f, n) { var bx = r * f * g, bl = r * (0.2 - n * 0.03) * g; c.beginPath(); c.moveTo(bx, 0); c.lineTo(bx + bl * 0.7, bl * 0.6); c.moveTo(bx, 0); c.lineTo(bx + bl * 0.7, -bl * 0.6); c.stroke(); });
        c.restore();
      }
      c.restore();
    }
    // the shockwave: white, then cyan, then a ghost ring behind it
    ringS(c, x, y, r * out(Math.min(1, u * 2.6)), '#ffffff', 5 * (1 - u) + 1.5, Math.min(1, (1 - u) * 1.6));
    ringS(c, x, y, r * out(Math.min(1, u * 2.1)) * 0.92, '#7fd8ff', 3, (1 - u) * 0.8);
    ringS(c, x, y, r * out(Math.min(1, u * 1.7)) * 0.8, '#cfefff', 1.6, (1 - u) * 0.6);
    // jagged ice erupting along the wave, then standing as a crown until it melts
    var rr = r * out(Math.min(1, u * 2.6)) * 0.98;
    for (i = 0; i < 28; i++) { var an = i * TAU / 28 + e.seed, gr = cl((u - 0.03 * (i % 4)) * 4, 0, 1), L = r * 0.3 * back(gr) * fade * (0.65 + 0.7 * hash(i, e.seed)); if (L < 1) continue; crystal(c, x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.88, an + (Math.sin(an) < 0 ? -0.0 : 0), L, 3 + hash(i, 3) * 3, '#69c4f2', '#e8fbff'); }
    for (i = 0; i < 14; i++) { var b = i * TAU / 14 + 0.3, gb = cl((u - 0.05) * 3.5, 0, 1); crystal(c, x + Math.cos(b) * rr * 0.58, y + Math.sin(b) * rr * 0.5, b, r * 0.19 * back(gb) * fade, 2.4, '#8fd4f8', '#f4fdff'); }
    // sparkling glints everywhere
    add(c, true);
    for (i = 0; i < 34; i++) {
      var ga = hash(i, e.seed) * TAU, gd = Math.sqrt(hash(i, 9 + e.seed)) * r * g, tw = 0.5 + 0.5 * Math.sin(tt * 8 + i * 1.7); if (tw < 0.35 || u < 0.08) continue;
      var gx = x + Math.cos(ga) * gd, gy = y + Math.sin(ga) * gd * 0.85, gs = (2 + 4 * tw) * fade;
      c.globalAlpha = tw * fade; c.fillStyle = '#ffffff'; c.fillRect(gx - 0.7, gy - gs, 1.4, gs * 2); c.fillRect(gx - gs, gy - 0.7, gs * 2, 1.4);
      soft(c, gx, gy, gs * 2.2, '#bfefff', 0.5 * tw * fade);
    }
    add(c, false); c.restore(); c.globalAlpha = 1;
  };
  SP.iceShatter = function (x, y, r, o) {
    push({ type: 'iceShatter', x: x, y: y, r: r, life: 0.5 });
    for (var i = 0; i < 18; i++) { var a = rnd(0, TAU), v = rnd(60, 190); emit({ kind: 'shard', x: x, y: y - 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, ay: 300, life: rnd(0.4, 0.8), size: rnd(1.6, 3.4), col: '#bfeaff', col2: '#ffffff' }); }
  };
  D.iceShatter = function (c, e, x, y, u, tt) {
    c.save(); add(c, true); soft(c, x, y - 6, e.r * (0.8 + u), '#dff8ff', (1 - u) * 0.7); add(c, false); ringS(c, x, y - 6, e.r * (0.5 + 1.3 * out(u)), '#ffffff', 2.5 * (1 - u) + 0.5, 1 - u); c.restore(); c.globalAlpha = 1;
  };
  // BLIZZARD: a storm that lasts several seconds: heavy snow, glacial spikes crashing down and standing in the ground, the whole area coated in frost
  SP.blizzard = function (x, y, r, o) { push({ type: 'blizzard', x: x, y: y, r: r, life: o.life || 3.8, spikes: [], nextSp: 0.12 }); shake(5); };
  D.blizzard = function (c, e, x, y, u, tt) {
    var r = e.r, k, i, a = u < 0.08 ? u / 0.08 : u > 0.82 ? (1 - u) / 0.18 : 1, g = out(Math.min(1, u * 5));
    c.save();
    // the sky darkens and goes blue-grey over the area, the ground goes white
    var dg = c.createRadialGradient(x, y, r * 0.2, x, y, r * 1.25 * g); dg.addColorStop(0, 'rgba(40,70,110,' + (0.28 * a).toFixed(3) + ')'); dg.addColorStop(1, 'rgba(40,70,110,0)');
    c.fillStyle = dg; c.beginPath(); c.arc(x, y, r * 1.25 * g, 0, TAU); c.fill();
    var fg = c.createRadialGradient(x, y, r * 0.05, x, y, r * g * 1.02); fg.addColorStop(0, 'rgba(235,250,255,' + (0.5 * a).toFixed(3) + ')'); fg.addColorStop(0.75, 'rgba(185,225,250,' + (0.4 * a).toFixed(3) + ')'); fg.addColorStop(1, 'rgba(150,205,245,0)');
    c.fillStyle = fg; c.beginPath(); c.ellipse(x, y, r * g * 1.02, r * g * 0.9, 0, 0, TAU); c.fill();
    // drifts of snow and ice sheets lying on the ground
    for (i = 0; i < 40; i++) {
      var ra = hash(i, e.seed) * TAU, rd = Math.sqrt(hash(i, 4 + e.seed)) * r * 0.96 * g, rx = r * (0.05 + 0.06 * hash(i, 7)), gx = x + Math.cos(ra) * rd, gy = y + Math.sin(ra) * rd * 0.88;
      c.globalAlpha = (0.28 + 0.2 * hash(i, 2)) * a; c.fillStyle = i % 4 ? '#f4fcff' : '#d4eefc'; c.beginPath(); c.ellipse(gx, gy, rx, rx * 0.45, hash(i, 5) * 3, 0, TAU); c.fill();
    }
    c.globalAlpha = 0.7 * a; c.strokeStyle = '#ffffff'; c.lineWidth = 1.2; c.lineCap = 'round';
    for (k = 0; k < 16; k++) { var va = k * TAU / 16 + e.seed, pts = jag(x, y, x + Math.cos(va) * r * 0.97 * g, y + Math.sin(va) * r * 0.85 * g, e.seed + k, 7, 8); c.beginPath(); c.moveTo(pts[0], pts[1]); for (i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke(); } // frost veins
    c.globalAlpha = 1;
    runes(c, x, y, r * 0.95, '#e4f8ff', tt, 12, 0.45 * a);
    // glacial spikes: they fall from the storm, stab the ground and stand there
    var sp = e.spikes || [];
    for (i = 0; i < sp.length; i++) {
      var q = sp[i], age = e.t - q.t0, L = q.h * (q.big ? 1.5 : 1);
      if (age < 0.24) { var fy = q.y - 230 * Math.pow(1 - age / 0.24, 1.6); c.globalAlpha = 0.95; crystal(c, q.x, fy - L, Math.PI / 2, L, q.w, '#2f8fd0', '#d8f4ff'); c.globalAlpha = 0.25; c.fillStyle = '#ffffff'; c.fillRect(q.x - 1, fy - L - 40, 2, 40); }
      else { var gr = back(cl((age - 0.24) / 0.18, 0, 1)), shr = a < 1 ? a : 1; c.globalAlpha = shr; crystal(c, q.x, q.y + 3, -Math.PI / 2, L * (0.55 + 0.45 * gr) * shr, q.w, '#2a86c8', '#cfeffd'); c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(q.x, q.y + 3, q.w * 1.4, q.w * 0.55, 0, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
    c.lineCap = 'round';
    for (k = 0; k < 6; k++) { // swirling wind
      var ra2 = r * (0.3 + k * 0.13), a0 = tt * (2.6 - k * 0.25) + k * 1.3;
      c.globalAlpha = 0.5 * a; c.strokeStyle = k % 2 ? '#ffffff' : '#a8e0ff'; c.lineWidth = 2 + (k % 2); c.beginPath(); c.ellipse(x, y, ra2, ra2 * 0.8, 0, a0, a0 + 1.4); c.stroke();
    }
    c.globalAlpha = 1; c.restore();
  };

  /* ============ SMOKE / SHADOW ============ */
  SP.smokeBomb = function (x, y, r, o) { push({ type: 'smokeBomb', x: x, y: y, r: r, life: 1.7 }); shake(2); for (var i = 0; i < 10; i++) { var a = rnd(0, TAU); emit({ kind: 'streak', x: x, y: y, vx: Math.cos(a) * rnd(60, 150), vy: Math.sin(a) * rnd(60, 150), drag: 2.5, life: 0.3, size: 1.4, col: '#c8c4e0' }); } };
  D.smokeBomb = function (c, e, x, y, u, tt) {
    var r = e.r, i;
    if (u < 0.12) { add(c, true); soft(c, x, y, r * 0.9, '#ffffff', (1 - u / 0.12) * 0.6); add(c, false); }
    for (i = 0; i < 15; i++) {
      var a = i * TAU / 15 + hash(i, e.seed) + u * 0.7 * (i % 2 ? 1 : -1), d = r * (0.12 + 0.68 * out(u * 1.5)) * (0.55 + 0.45 * hash(i, 3)), R = r * (0.3 + 0.2 * hash(i, 5)) * (0.45 + 0.55 * out(u * 2));
      soft(c, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8 - u * 9, R, i % 3 ? '#7a7498' : '#2c2840', (1 - ease(u)) * 0.9);
    }
    soft(c, x, y - 4, r * 0.55, '#9a95b8', (1 - u) * 0.5);
    ringS(c, x, y, r * out(u * 1.5), '#b0acca', 2, (1 - u) * 0.45);
  };

  /* ============ UNDEAD ============ */
  SP.raise = function (x, y, r, o) {
    push({ type: 'raise', x: x, y: y, r: r || 24, life: 1.2 });
    for (var i = 0; i < 6; i++) { var a = rnd(0, TAU); emit({ kind: 'soul', add: true, x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 6, vx: rnd(-10, 10), vy: rnd(-70, -35), life: rnd(0.7, 1.2), size: rnd(2, 3.4), col: '#7dff9a', delay: rnd(0, 0.3) }); }
  };
  function claw(c, x, y, h, a, flip) {
    c.save(); c.translate(x, y); c.lineCap = 'round';
    for (var f = 0; f < 4; f++) {
      var fx = (f - 1.5) * 3.2, fh = h * (0.7 + 0.1 * (f % 2) + (f === 1 || f === 2 ? 0.25 : 0)), cur = (f - 1.5) * 1.6;
      c.globalAlpha = a; c.strokeStyle = '#2a2a24'; c.lineWidth = 3.2; c.beginPath(); c.moveTo(fx, 0); c.quadraticCurveTo(fx + cur, -fh * 0.5, fx + cur * 1.6, -fh); c.stroke();
      c.strokeStyle = '#ece8d2'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(fx, 0); c.quadraticCurveTo(fx + cur, -fh * 0.5, fx + cur * 1.6, -fh); c.stroke();
    }
    c.fillStyle = '#d6d2bc'; c.fillRect(-5, -2, 10, 4);
    c.restore(); c.globalAlpha = 1;
  }
  D.raise = function (c, e, x, y, u, tt) {
    var r = e.r, a = u < 0.2 ? u / 0.2 : u > 0.8 ? (1 - u) / 0.2 : 1, i;
    if (u < 0.25) { add(c, true); soft(c, x, y, r * 2, '#aaffc4', (1 - u / 0.25) * 0.6); add(c, false); }
    soft(c, x, y, r * 1.4, '#3fdc78', 0.3 * a);
    runes(c, x, y, r * 1.1, '#7dff9a', tt, 8, 0.7 * a);
    var h = 13 * back(u * 3) * (u > 0.72 ? Math.max(0, 1 - (u - 0.72) / 0.18) : 1);
    for (i = 0; i < 3; i++) { var an = i * TAU / 3 + 0.5; claw(c, x + Math.cos(an) * r * 0.78, y + Math.sin(an) * r * 0.55 + 3, h, a); }
  };
  SP.boneNova = function (x, y, r, o) {
    push({ type: 'boneNova', x: x, y: y, r: r, life: 0.95 });
    for (var i = 0; i < 18; i++) { var a = rnd(0, TAU), v = rnd(50, 150); emit({ kind: 'soul', add: true, x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 20, drag: 1.2, life: rnd(0.6, 1.1), size: rnd(2, 3.4), col: i % 2 ? '#7dff9a' : '#b9f7c8' }); }
    for (i = 0; i < 12; i++) { var b = rnd(0, TAU), w = rnd(60, 140); emit({ kind: 'bone', x: x, y: y, vx: Math.cos(b) * w, vy: Math.sin(b) * w - 60, ay: 260, life: rnd(0.5, 0.9), size: rnd(2, 3.2), col: '#ece8d2', vr: rnd(-12, 12), rot: rnd(0, 6) }); }
    shake(4);
  };
  D.boneNova = function (c, e, x, y, u, tt) {
    var r = e.r, g = out(u * 1.5), i;
    if (u < 0.2) { add(c, true); soft(c, x, y, r * 0.9, '#bfffd0', (1 - u / 0.2) * 0.7); add(c, false); }
    soft(c, x, y, r * g, '#2fa85a', 0.28 * (1 - u));
    runes(c, x, y, r * g * 0.92, '#7dff9a', tt * 1.4, 10, 0.8 * (1 - u));
    ringS(c, x, y, r * g, '#9dffb8', 3.5 * (1 - u) + 1, (1 - u));
    for (i = 0; i < 14; i++) {
      var a = i * TAU / 14 + tt * 0.6, bx = x + Math.cos(a) * r * g * 0.97, by = y + Math.sin(a) * r * g * 0.97;
      c.save(); c.translate(bx, by); c.rotate(a + Math.PI / 2); c.globalAlpha = (1 - u) * 0.95;
      c.strokeStyle = '#2a2a24'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-5, 0); c.lineTo(5, 0); c.stroke();
      c.strokeStyle = '#ece8d2'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-5, 0); c.lineTo(5, 0); c.stroke();
      c.fillStyle = '#ece8d2'; c.beginPath(); c.arc(-5, -1.3, 1.7, 0, TAU); c.arc(-5, 1.3, 1.7, 0, TAU); c.arc(5, -1.3, 1.7, 0, TAU); c.arc(5, 1.3, 1.7, 0, TAU); c.fill();
      c.restore();
    }
    add(c, true); for (i = 0; i < 8; i++) { var w = i * TAU / 8 + 0.4; soft(c, x + Math.cos(w) * r * g * 0.7, y + Math.sin(w) * r * g * 0.7 - u * 10, 11, '#5dff90', (1 - u) * 0.35); } add(c, false);
    c.globalAlpha = 1;
  };
  SP.plagueNova = function (x, y, r, o) {
    push({ type: 'plagueNova', x: x, y: y, r: r, life: 1.0 });
    for (var i = 0; i < 20; i++) { var a = rnd(0, TAU), v = rnd(40, 140); emit({ kind: 'dot', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, ay: 180, life: rnd(0.5, 0.9), size: rnd(1.4, 2.6), col: i % 2 ? '#9acd32' : '#c9ff5a' }); }
    shake(4);
  };
  D.plagueNova = function (c, e, x, y, u, tt) {
    var r = e.r, g = out(u * 1.3), i;
    soft(c, x, y, r * g, '#5a8a1a', 0.35 * (1 - u));
    ringS(c, x, y, r * g, '#c9ff5a', 3 * (1 - u) + 1, 1 - u);
    for (i = 0; i < 18; i++) { var a = i * TAU / 18 + u * (i % 2 ? 0.8 : -0.8), d = r * g * (0.55 + 0.4 * hash(i, 1)); soft(c, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85 - u * 14, r * 0.26, i % 3 ? '#8fd14a' : '#3f5f12', (1 - u) * 0.55); }
    c.lineWidth = 1.2; for (i = 0; i < 9; i++) { var bb = hash(i, 4) * TAU, bd = r * g * hash(i, 6), by = y + Math.sin(bb) * bd - u * 18 * (1 + hash(i, 8)); c.globalAlpha = (1 - u) * 0.8; c.strokeStyle = '#d9ff7a'; c.beginPath(); c.arc(x + Math.cos(bb) * bd, by, 2 + 3 * hash(i, 9), 0, TAU); c.stroke(); }
    skull(c, x, y - 10 - u * 28, 1.2, '#c9ff5a', (1 - u) * 0.55);
    c.globalAlpha = 1;
  };
  SP.venom = function (x, y, r, o) {
    push({ type: 'plagueNova', x: x, y: y, r: r, life: 0.75 });
    for (var i = 0; i < 16; i++) { var a = rnd(0, TAU), v = rnd(50, 150); emit({ kind: 'drop', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 70, ay: 360, life: rnd(0.4, 0.8), size: rnd(1.4, 2.6), col: i % 2 ? '#6fe84a' : '#b6ff7a' }); }
  };

  /* ============ STEEL ============ */
  function shield(c, x, y, rot, s) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    var g = c.createLinearGradient(-8, -9, 8, 11); g.addColorStop(0, '#cfe6ff'); g.addColorStop(0.5, '#5f9be0'); g.addColorStop(1, '#2a4f9a');
    c.fillStyle = g; c.strokeStyle = '#f2f8ff'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-8, -9); c.lineTo(8, -9); c.lineTo(8, 2); c.quadraticCurveTo(8, 8, 0, 12); c.quadraticCurveTo(-8, 8, -8, 2); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffd36b'; c.fillRect(-1.2, -7, 2.4, 14); c.fillRect(-5, -2, 10, 2.4);
    c.restore();
  }
  SP.bash = function (x, y, r, o) {
    push({ type: 'bash', x: x, y: y, r: r, a: o.a || 0, life: 0.42 });
    var a0 = o.a || 0;
    for (var i = 0; i < 16; i++) { var a = a0 + rnd(-0.8, 0.8), v = rnd(120, 260); emit({ kind: 'streak', add: true, x: x + Math.cos(a0) * r * 0.5, y: y + Math.sin(a0) * r * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.4, life: rnd(0.2, 0.4), size: 1.5, col: i % 2 ? '#9fd2ff' : '#ffffff' }); }
  };
  D.bash = function (c, e, x, y, u, tt) {
    var r = e.r, a = e.a, d = r * out(u * 1.6), sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d, k;
    c.lineCap = 'round';
    for (k = 0; k < 3; k++) { c.globalAlpha = (1 - u) * (0.8 - k * 0.2); c.strokeStyle = k === 0 ? '#ffffff' : k === 1 ? '#9fd2ff' : '#4f8fe0'; c.lineWidth = 4 - k; c.beginPath(); c.arc(x, y, r * (0.55 + 0.2 * k) * (0.6 + 0.4 * out(u * 1.6)), a - 0.85, a + 0.85); c.stroke(); }
    c.globalAlpha = 1; add(c, true); soft(c, sx, sy, 20, '#6bb8ff', 0.5 * (1 - u)); add(c, false);
    c.globalAlpha = Math.min(1, (1 - u) * 1.6); shield(c, sx, sy, a + Math.PI / 2, 1.6 - 0.35 * u); c.globalAlpha = 1;
    if (u > 0.35 && u < 0.8) { var f = 1 - (u - 0.35) / 0.45; add(c, true); c.fillStyle = rgba('#d8ecff', f); c.save(); c.translate(sx + Math.cos(a) * 8, sy + Math.sin(a) * 8); c.rotate(u * 3); var s = 10 * f; c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.2, -s * 0.2); c.lineTo(s, 0); c.lineTo(s * 0.2, s * 0.2); c.lineTo(0, s); c.lineTo(-s * 0.2, s * 0.2); c.lineTo(-s, 0); c.lineTo(-s * 0.2, -s * 0.2); c.closePath(); c.fill(); c.restore(); add(c, false); }
  };
  SP.whirl = function (x, y, r, o) { push({ type: 'whirl', own: o.own || null, x: x, y: y, r: r || 28, life: o.life || 0.7 }); };
  D.whirl = function (c, e, x, y, u, tt) {
    if (e.own) { x = e.own.x - (e.camx || 0); y = e.own.y - (e.camy || 0); }
    var k, r = e.r, a = u < 0.12 ? u / 0.12 : u > 0.8 ? (1 - u) / 0.2 : 1;
    gnd(c, x, y + 8, r * 1.5, '#8a7a5a', 0.3 * a);
    c.lineCap = 'round';
    for (k = 0; k < 3; k++) {
      var a0 = tt * 22 + k * TAU / 3;
      c.globalAlpha = 0.4 * a; c.strokeStyle = '#6bb8ff'; c.lineWidth = 9; c.beginPath(); c.arc(x, y, r, a0 - 1.5, a0); c.stroke();
      c.globalAlpha = 0.8 * a; c.strokeStyle = '#a8dcff'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, r, a0 - 1.2, a0); c.stroke();
      c.globalAlpha = a; c.strokeStyle = '#ffffff'; c.lineWidth = 1.6; c.beginPath(); c.arc(x, y, r, a0 - 0.8, a0); c.stroke();
      add(c, true); soft(c, x + Math.cos(a0) * r, y + Math.sin(a0) * r, 6, '#ffffff', 0.8 * a); add(c, false);
    }
    c.globalAlpha = 0.4 * a; c.strokeStyle = '#cfe8ff'; c.lineWidth = 1.2;
    for (k = 0; k < 5; k++) { var b0 = -tt * 14 + k * 1.26; c.beginPath(); c.arc(x, y, r * 1.35, b0, b0 + 0.5); c.stroke(); }
    c.globalAlpha = 1;
  };
  SP.bladeStorm = function (x, y, r, o) { push({ type: 'whirl', x: x, y: y, r: r, life: 0.5 }); shake(3); };

  /* ============ EARTH ============ */
  SP.earthSpikes = function (x, y, r, o) {
    push({ type: 'earthSpikes', x: x, y: y, r: r, a: o.a || 0, life: 0.8 });
    var a0 = o.a || 0;
    for (var i = 0; i < 12; i++) { var d = rnd(10, r), a = a0 + rnd(-0.6, 0.6); emit({ kind: 'smoke', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: rnd(-14, 14), vy: rnd(-30, -10), life: rnd(0.5, 0.9), size: rnd(6, 11), grow: 10, col: '#8a7355', alpha: 0.7, delay: rnd(0, 0.25) }); }
    for (i = 0; i < 10; i++) { var b = a0 + rnd(-0.7, 0.7), v = rnd(60, 170); emit({ kind: 'dot', x: x + Math.cos(b) * rnd(10, r), y: y + Math.sin(b) * rnd(10, r), vx: Math.cos(b) * v * 0.3, vy: -rnd(90, 190), ay: 520, life: rnd(0.4, 0.8), size: rnd(1.4, 2.8), col: i % 2 ? '#6a5640' : '#b79a72' }); }
  };
  D.earthSpikes = function (c, e, x, y, u, tt) {
    var a = e.a, r = e.r, n = 8, i;
    for (i = 0; i < n; i++) {
      var d = r * (0.18 + 0.82 * (i + 1) / n), side = Math.sin(i * 2.3 + e.seed) * r * 0.22, px = x + Math.cos(a) * d - Math.sin(a) * side, py = y + Math.sin(a) * d + Math.cos(a) * side;
      var delay = i * 0.05, k = cl((u - delay * 1.2) * 3.2, 0, 1), h = (13 + 10 * hash(i, e.seed)) * back(k) * (u > 0.65 ? Math.max(0, 1 - (u - 0.65) / 0.3) : 1);
      if (k <= 0) continue;
      c.globalAlpha = 0.9 * (u > 0.8 ? (1 - u) / 0.2 : 1);
      c.globalAlpha *= 0.3; c.strokeStyle = '#ffb04a'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); c.lineTo(px, py); c.stroke(); c.globalAlpha = 0.9 * (u > 0.8 ? (1 - u) / 0.2 : 1);
      poly(c, [px - 6, py + 2, px - 2.5, py - h * 0.7, px + 0.5, py - h, px + 3.5, py - h * 0.6, px + 6.5, py + 2], '#8a6a48');
      poly(c, [px - 6, py + 2, px - 2.5, py - h * 0.7, px + 0.5, py - h, px - 0.5, py + 2], '#d6b27c');
      c.strokeStyle = 'rgba(40,24,12,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + 0.5, py - h); c.lineTo(px + 3, py + 2); c.stroke();
    }
    c.globalAlpha = 1;
  };

  /* ============ LIGHTNING (and the sky) ============ */
  V.skyFlash = function (col, a, sec) { sky.col = col || '#ffe14a'; sky.a = a || 0.4; sky.max = sky.t = sec || 0.5; sky.start = 0; };
  // points: [{x,y}, ...] the hero first, then each struck foe
  V.chain = function (pts, o) {
    if (!pts || pts.length < 2) return;
    bolts.push({ pts: pts.slice(0, 8), t: 0, life: 0.5, seed: Math.random() * 90 });
    if (bolts.length > 6) bolts.shift();
    V.skyFlash('#ffe14a', 0.5, 0.55); shake(5);
    for (var i = 1; i < pts.length; i++) {
      for (var k = 0; k < 7; k++) { var a = rnd(0, TAU), v = rnd(60, 190); emit({ kind: 'streak', add: true, x: pts[i].x, y: pts[i].y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.2, life: rnd(0.2, 0.45), size: 1.5, col: k % 2 ? '#fff6a0' : '#ffffff' }); }
      emit({ kind: 'star', add: true, x: pts[i].x, y: pts[i].y - 4, life: 0.35, size: 6, col: '#fffbd0', vr: 5 });
    }
    if (!o || !o.remote) {
      var M = CC.Multiplayer;
      if (M && M.sendFx && M.active) { var flat = []; for (var j = 0; j < Math.min(6, pts.length); j++) flat.push(Math.round(pts[j].x), Math.round(pts[j].y)); M.sendFx('vf', { y: 'chain', x: 0, py: 0, r: 0, p: flat }); }
    }
  };
  function drawBolts(c, cam) {
    var tt = tick();
    for (var b = 0; b < bolts.length; b++) {
      var q = bolts[b], u = q.t / q.life, a = cl((1 - u) * 1.5, 0, 1) * (0.75 + 0.25 * Math.sin(q.t * 70)), seed = q.seed + Math.floor(tt * 16);
      for (var i = 1; i < q.pts.length; i++) {
        var p0 = q.pts[i - 1], p1 = q.pts[i], x0 = p0.x - cam.x, y0 = p0.y - cam.y, x1 = p1.x - cam.x, y1 = p1.y - cam.y, L = Math.hypot(x1 - x0, y1 - y0);
        bolt(c, x0, y0 - (i === 1 ? 8 : 4), x1, y1 - 4, seed + i * 7, Math.min(18, 5 + L * 0.14), 2.6 * (1 - u * 0.4), '#ffe14a', a, 3);
        if (hash(i, seed) > 0.4) bolt(c, x0, y0 - 6, x1, y1 - 4, seed + i * 11 + 3, Math.min(10, 3 + L * 0.08), 1.2, '#fff6a0', a * 0.6, 0);
      }
      for (i = 1; i < q.pts.length; i++) { // blinding impact bloom + ground scorch ring at each foe
        var px = q.pts[i].x - cam.x, py = q.pts[i].y - cam.y;
        add(c, true); soft(c, px, py - 4, 34 * (1 - u * 0.5), '#fff2a0', a * 0.9); soft(c, px, py - 4, 16, '#ffffff', a); add(c, false);
        ringS(c, px, py, 8 + u * 30, '#ffe14a', 2, a * 0.8);
        for (var k = 0; k < 3; k++) bolt(c, px, py - 3, px + Math.cos(seed + k * 2.1) * 20, py - 3 + Math.sin(seed + k * 2.1) * 14, seed + k, 4, 1.4, '#ffee80', a * 0.7, 0);
      }
    }
  }
  V.drawScreen = function (c, W, H) {
    if (sky.t > 0) { // the sky flashes yellow: a couple of quick strobes
      var t = sky.max - sky.t, f = Math.max(Math.exp(-Math.pow((t - 0.03) / 0.05, 2)), 0.75 * Math.exp(-Math.pow((t - 0.17) / 0.07, 2)), 0.4 * Math.exp(-Math.pow((t - 0.33) / 0.1, 2))) * sky.a;
      if (f > 0.004) {
        c.save();
        var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, rgba(sky.col, f * 1.15)); g.addColorStop(0.55, rgba(sky.col, f * 0.7)); g.addColorStop(1, rgba(sky.col, f * 0.4));
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba('#fff7c0', f * 0.25); c.fillRect(0, 0, W, H); // blown-out highlights
        c.restore();
      }
    }
  };

  /* ============ SIGILS & STREAKS ============ */
  SP.mark = function (x, y, r, o) { push({ type: 'mark', x: x, y: y, r: r || 14, life: o.life || 1.0 }); };
  D.mark = function (c, e, x, y, u, tt) {
    var p = 1 + 0.15 * Math.sin(tt * 14);
    ringS(c, x, y, e.r * (1.3 - 0.3 * u) * p, '#ff3a4e', 1.8, 0.9);
    ringS(c, x, y, e.r * 0.6, '#ff7a86', 1, 0.7);
    skull(c, x, y - e.r - 8 - Math.sin(u * 3) * 2, 1, '#ffd8dc', 0.9);
    add(c, true); soft(c, x, y, e.r * 1.6, '#ff2a3e', 0.25 + 0.2 * u); add(c, false);
    if (u > 0.9) { c.globalAlpha = 1; add(c, true); soft(c, x, y, e.r * 3, '#ffffff', (u - 0.9) * 8); add(c, false); }
  };
  SP.slash = function (x, y, r, o) { push({ type: 'slash', x: x, y: y, x2: o.x2, y2: o.y2, life: o.life || 0.32, col: o.col || '#b9a6ff' }); };
  D.slash = function (c, e, x, y, u, tt) {
    var x2 = e.x2 - (x - e.x), y2 = e.y2 - (y - e.y), dx = x2 - x, dy = y2 - y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * 4, ny = dx / L * 4, a = 1 - u;
    c.globalAlpha = a * 0.5; poly(c, [x, y, x2 + nx, y2 + ny, x2 - nx, y2 - ny], '#3a2570');
    c.globalAlpha = a; poly(c, [x, y, x2 + nx * 0.45, y2 + ny * 0.45, x2 - nx * 0.45, y2 - ny * 0.45], '#d8ccff');
    add(c, true); soft(c, x2, y2, 12, '#cdbfff', a * 0.7); add(c, false);
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x2 - 7, y2 - 7); c.lineTo(x2 + 7, y2 + 7); c.moveTo(x2 + 7, y2 - 7); c.lineTo(x2 - 7, y2 + 7); c.stroke(); c.globalAlpha = 1;
  };
  SP.rush = function (x, y, r, o) { push({ type: 'rush', x: x, y: y, x2: o.x2, y2: o.y2, life: 0.5 }); };
  D.rush = function (c, e, x, y, u, tt) {
    var x2 = e.x2 - (x - e.x), y2 = e.y2 - (y - e.y), a = 1 - u, i;
    c.lineCap = 'round';
    for (i = 0; i < 4; i++) { var off = (i - 1.5) * 4; c.globalAlpha = a * (0.85 - i * 0.1); c.strokeStyle = i % 2 ? '#ffd36b' : '#fff2c0'; c.lineWidth = 4 - i * 0.6; c.beginPath(); c.moveTo(x, y + off); c.lineTo(x2, y2 + off); c.stroke(); }
    add(c, true); soft(c, x2, y2, 22, '#ffb03a', a * 0.6); add(c, false); c.globalAlpha = 1;
  };
  SP.soulSpear = function (x, y, r, o) {
    push({ type: 'spear', x: x, y: y, x2: o.x2, y2: o.y2, life: 0.5 });
    for (var i = 0; i < 10; i++) { var t = i / 10; emit({ kind: 'soul', add: true, x: x + (o.x2 - x) * t, y: y + (o.y2 - y) * t, vx: rnd(-14, 14), vy: rnd(-40, -10), life: rnd(0.4, 0.8), size: rnd(2, 3.2), col: '#7dff9a', delay: t * 0.15 }); }
  };
  D.spear = function (c, e, x, y, u, tt) {
    var x2 = e.x2 - (x - e.x), y2 = e.y2 - (y - e.y), dx = x2 - x, dy = y2 - y, L = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx), grow = out(u * 2.5), len = L * grow;
    c.save(); c.translate(x, y); c.rotate(a); c.globalAlpha = 1 - ease(u);
    add(c, true); c.fillStyle = rgba('#35e07a', 0.35); c.beginPath(); c.moveTo(0, -6); c.lineTo(len * 0.9, -2); c.lineTo(len + 8, 0); c.lineTo(len * 0.9, 2); c.lineTo(0, 6); c.closePath(); c.fill(); add(c, false);
    poly(c, [0, -3, len * 0.85, -1.4, len + 6, 0, len * 0.85, 1.4, 0, 3], '#9dffb8'); poly(c, [0, -1, len * 0.9, -0.5, len, 0, len * 0.9, 0.5, 0, 1], '#ffffff');
    for (var k = 0; k < 6; k++) { var wx = len * (0.1 + k * 0.15), wy = Math.sin(tt * 12 + k * 1.7) * 5; c.strokeStyle = rgba('#7dff9a', 0.6); c.lineWidth = 1.2; c.beginPath(); c.moveTo(wx, 0); c.quadraticCurveTo(wx - 8, wy, wx - 16, wy * 1.6); c.stroke(); }
    skull(c, len + 8, 0, 0.9, '#d6ffe2', 0.95);
    c.restore(); c.globalAlpha = 1;
  };

  /* ============ spawn + update + draw ============ */
  V.spawn = function (type, x, y, r, o) {
    o = o || {};
    var f = SP[type];
    if (!f) return;
    f(x, y, r, o);
    if (!o.remote && !o.local && type !== 'whirl') mp(type, x, y, r, o);
  };
  V.addRemote = function (d) {
    if (!d || typeof d.y !== 'string') return;
    if (d.y === 'chain') { if (Array.isArray(d.p) && d.p.length >= 4) { var pts = []; for (var i = 0; i + 1 < d.p.length; i += 2) pts.push({ x: d.p[i], y: d.p[i + 1] }); V.chain(pts, { remote: true }); } return; }
    if (!SP[d.y] || !isFinite(d.x) || !isFinite(d.py)) return;
    var o = { remote: true }; for (var k in d) if (k !== 'y' && k !== 'x' && k !== 'py' && k !== 'r' && typeof d[k] === 'number') o[k] = d[k];
    SP[d.y](d.x, d.py, Math.min(220, d.r || 40), o);
  };
  V.update = function (dt) {
    V._tick(dt);
    var i;
    for (i = fxs.length - 1; i >= 0; i--) {
      var e = fxs[i]; e.t += dt;
      if (e.t >= e.life) { fxs.splice(i, 1); continue; }
      if (e.type === 'blizzard') { // heavy snow, and glacial spikes that fall every fraction of a second
        for (var k = 0; k < 9; k++) {
          var a = rnd(0, TAU), d = Math.sqrt(Math.random()) * e.r * 1.1;
          emit({ kind: 'snow', add: k % 3 !== 0, x: e.x + Math.cos(a) * d + 60, y: e.y + Math.sin(a) * d * 0.9 - 150 - rnd(0, 60), vx: -rnd(60, 130), vy: rnd(190, 330), life: 0.62, size: rnd(1.2, 3.2), col: '#ffffff' });
        }
        if (Math.random() < 0.35) { var b2 = rnd(0, TAU), bd = Math.sqrt(Math.random()) * e.r; emit({ kind: 'shard', x: e.x + Math.cos(b2) * bd, y: e.y + Math.sin(b2) * bd * 0.9 - 110, vx: -20, vy: 300, life: 0.34, size: 2.2, col: '#bfeaff', col2: '#ffffff' }); }
        e.nextSp -= dt;
        if (e.nextSp <= 0 && e.t < e.life - 1.0 && e.spikes.length < 46) {
          var sa = rnd(0, TAU), sd = Math.sqrt(Math.random()) * e.r * 0.92, big = Math.random() < 0.22;
          e.spikes.push({ x: e.x + Math.cos(sa) * sd, y: e.y + Math.sin(sa) * sd * 0.88, t0: e.t, h: rnd(50, 96), w: rnd(5.5, 9), big: big, hit: false }); e.nextSp = rnd(0.07, 0.17);
        }
        for (var si = 0; si < e.spikes.length; si++) {
          var q = e.spikes[si];
          if (!q.hit && e.t - q.t0 >= 0.24) { q.hit = true; for (var m = 0; m < (q.big ? 10 : 6); m++) { var ma = rnd(0, TAU), mv = rnd(40, 150); emit({ kind: 'shard', x: q.x, y: q.y, vx: Math.cos(ma) * mv, vy: Math.sin(ma) * mv * 0.6 - 70, ay: 260, life: rnd(0.3, 0.6), size: rnd(1.2, 2.6), col: '#cfefff', col2: '#ffffff' }); } if (q.big) shake(2); }
        }
      } else if (e.type === 'whirl') {
        var wa = rnd(0, TAU), ox = e.own ? e.own.x : e.x, oy = e.own ? e.own.y : e.y;
        emit({ kind: 'smoke', x: ox + Math.cos(wa) * e.r, y: oy + 8 + Math.sin(wa) * e.r * 0.4, vx: Math.cos(wa + 1.5) * 50, vy: Math.sin(wa + 1.5) * 20 - 10, life: 0.4, size: 5, grow: 8, col: '#9a8a68', alpha: 0.6 });
        if (Math.random() < 0.5) emit({ kind: 'streak', add: true, x: ox + Math.cos(wa) * e.r, y: oy + Math.sin(wa) * e.r, vx: Math.cos(wa + 1.5) * 170, vy: Math.sin(wa + 1.5) * 170, drag: 2, life: 0.22, size: 1.4, col: '#cfe8ff' });
      }
    }
    for (i = bolts.length - 1; i >= 0; i--) { bolts[i].t += dt; if (bolts[i].t >= bolts[i].life) bolts.splice(i, 1); }
    if (sky.t > 0) sky.t = Math.max(0, sky.t - dt);
    // particles
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      if ((p.life -= dt) <= 0) { parts.splice(i, 1); continue; }
      if (p.delay > 0) { p.delay -= dt; p.life += dt; continue; }
      if (p.ax) p.vx += p.ax * dt;
      if (p.ay) p.vy += p.ay * dt;
      if (p.drag) { var kk = Math.max(0, 1 - p.drag * dt); p.vx *= kk; p.vy *= kk; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += (p.vr || 0) * dt; if (p.grow) p.size += p.grow * dt;
    }
  };
  V.clear = function (resetDarkness) {
    fxs.length = parts.length = bolts.length = 0;
    sky.t = 0;
    if (resetDarkness) V._s.dark.lvl = 0;
  };
  V.draw = function (c, cam) {
    var tt = tick(), i, e;
    c.save();
    for (i = 0; i < fxs.length; i++) { // ground layer first
      e = fxs[i]; if (e.type !== 'scorch') continue;
      D.scorch(c, e, e.x - cam.x, e.y - cam.y, e.t / e.life);
    }
    for (i = 0; i < fxs.length; i++) {
      e = fxs[i]; if (e.type === 'scorch') continue;
      var f = D[e.type]; if (!f) continue;
      var x = e.x - cam.x, y = e.y - cam.y;
      if (e.type === 'whirl') { e.camx = cam.x; e.camy = cam.y; }
      else if (x < -e.r * 2 - 60 || y < -e.r * 2 - 120 || x > cam.w + e.r * 2 + 60 || y > cam.h + e.r * 2 + 60) continue;
      c.globalAlpha = 1; add(c, false);
      f(c, e, x, y, e.t / e.life, tt);
    }
    c.globalAlpha = 1; add(c, false);
    drawBolts(c, cam);
    c.restore();
    V._drawParts(c, cam);
  };
  V._SP = SP; V._D = D;
})(window);

/* CC.Vfx part 3: held-spell areas (flamethrower, icicle barrage, razor rain, ...), weapon art, and the Patchwork Horror's darkness. */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, V = CC.Vfx, H = V._h, TAU = Math.PI * 2;
  var rnd = H.rnd, cl = H.cl, ease = H.ease, out = H.out, back = H.back, hash = H.hash, rgba = H.rgba, soft = H.soft, ringS = H.ringS, poly = H.poly,
      add = H.add, flame = H.flame, crystal = H.crystal, runes = H.runes, skull = H.skull, gnd = H.gnd;

  /* ---------- the area spells the player holds and aims (CC.SpellCharge) ---------- */
  var SC = {};
  // Flamethrower: a roaring cone of layered flame with licking tongues, heat glow and drifting embers
  SC.flame = function (c, e, x, y, u, tt) {
    var a = Math.atan2(e.dy, e.dx), R = e.range, i;
    c.save(); c.translate(x, y); c.rotate(a);
    var life = 1 - ease(Math.max(0, (u - 0.7) / 0.3)), warm = Math.min(1, u * 8);
    add(c, true);
    for (i = 0; i < 5; i++) soft(c, R * (0.18 + 0.17 * i), 0, R * (0.2 + 0.05 * i), i < 2 ? '#fff0b0' : '#ff7a1a', 0.3 * life * warm);
    add(c, false);
    var gr = c.createLinearGradient(0, 0, R, 0); gr.addColorStop(0, 'rgba(255,240,170,.5)'); gr.addColorStop(0.5, 'rgba(255,120,30,.45)'); gr.addColorStop(1, 'rgba(240,50,12,0)');
    c.globalAlpha = life; c.fillStyle = gr; c.beginPath(); c.moveTo(0, -4); c.lineTo(R * 0.92, -R * 0.4); c.quadraticCurveTo(R * 1.1, 0, R * 0.92, R * 0.4); c.closePath(); c.fill();
    for (i = 0; i < 22; i++) {
      var cyc = ((hash(i, 1) + tt * (0.9 + 0.5 * hash(i, 2))) % 1), dist = cyc * R, lat = Math.sin(i * 2.31 + tt * 6 + dist * 0.05) * dist * 0.3, sz = 3 + dist * 0.075;
      c.globalAlpha = Math.pow(1 - cyc, 0.6) * life;
      c.save(); c.translate(dist, lat); c.rotate(Math.PI / 2);
      flame(c, 0, 0, 12 + dist * 0.18, sz, tt, i, dist < R * 0.5);
      c.restore();
    }
    c.restore(); c.globalAlpha = 1;
  };
  // Icicle Barrage: a frozen sigil under a rain of falling ice spears that stab into the ground and shatter
  SC.icicles = function (c, e, x, y, u, tt) {
    var r = e.r || 60, k, fade = u < 0.1 ? u / 0.1 : u > 0.85 ? (1 - u) / 0.15 : 1;
    soft(c, x, y, r * 1.15, '#aee8ff', 0.3 * fade);
    runes(c, x, y, r * 0.95, '#bfeaff', tt, 8, 0.55 * fade);
    ringS(c, x, y, r * (0.92 + 0.05 * Math.sin(tt * 5)), '#e8fbff', 1.6, 0.6 * fade);
    for (k = 0; k < 11; k++) {
      var per = 0.6, cyc = Math.floor(e.t / per + hash(k, 1)), ph = ((e.t / per) + hash(k, 1)) % 1, a = hash(k + cyc * 13, 2) * TAU, d = Math.sqrt(hash(k + cyc * 7, 3)) * r * 0.92;
      var px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (ph < 0.42) { // plummeting
        var f = ph / 0.42, h = (1 - f) * (110 + 40 * hash(k, 5));
        c.globalAlpha = Math.min(1, f * 3) * fade;
        c.strokeStyle = 'rgba(200,240,255,.35)'; c.lineWidth = 3; c.beginPath(); c.moveTo(px, py - h - 34); c.lineTo(px, py - h); c.stroke();
        crystal(c, px, py - h, Math.PI / 2, 26, 4, '#6fc8f2', '#e4f8ff');
      } else if (ph < 0.78) { // standing in the ground, frost spreading
        var g = (ph - 0.42) / 0.36;
        c.globalAlpha = (1 - g * g) * fade;
        crystal(c, px, py, -Math.PI / 2, 15 * (1 - g * 0.4), 3.4, '#6fc8f2', '#e4f8ff');
        ringS(c, px, py, 4 + g * 20, '#dff8ff', 1.6 * (1 - g), (1 - g) * 0.8);
        c.globalAlpha = (1 - g) * 0.5 * fade; add(c, true); soft(c, px, py, 16, '#9fe3ff', 0.5); add(c, false);
      } else if (ph < 0.9) { // shatter
        var s = (ph - 0.78) / 0.12;
        c.globalAlpha = (1 - s) * fade; c.strokeStyle = '#eaffff'; c.lineWidth = 1.4;
        for (var q = 0; q < 6; q++) { var qa = q * 1.05 + k; c.beginPath(); c.moveTo(px + Math.cos(qa) * 4, py + Math.sin(qa) * 3 - 3); c.lineTo(px + Math.cos(qa) * (6 + s * 14), py + Math.sin(qa) * (4 + s * 9) - 3 - s * 5); c.stroke(); }
      }
    }
    c.globalAlpha = 1;
  };
  // Razor Rain: spinning crimson blades fall in a bloody sigil and bite the earth
  SC.razor = function (c, e, x, y, u, tt) {
    var r = e.r || 60, k, fade = u < 0.1 ? u / 0.1 : u > 0.85 ? (1 - u) / 0.15 : 1;
    soft(c, x, y, r * 1.15, '#ff3a5a', 0.22 * fade);
    runes(c, x, y, r * 0.95, '#ff7a8c', -tt, 7, 0.55 * fade);
    ringS(c, x, y, r * (0.92 + 0.04 * Math.sin(tt * 6)), '#ffb0ba', 1.5, 0.55 * fade);
    for (k = 0; k < 13; k++) {
      var per = 0.5, cyc = Math.floor(e.t / per + hash(k, 1)), ph = ((e.t / per) + hash(k, 1)) % 1, a = hash(k + cyc * 11, 2) * TAU, d = Math.sqrt(hash(k + cyc * 5, 3)) * r * 0.92;
      var px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (ph < 0.45) {
        var f = ph / 0.45, h = (1 - f) * (95 + 35 * hash(k, 5)), spin = tt * 18 + k;
        c.globalAlpha = Math.min(1, f * 3) * fade; c.strokeStyle = 'rgba(255,120,140,.3)'; c.lineWidth = 2; c.beginPath(); c.moveTo(px, py - h - 28); c.lineTo(px, py - h); c.stroke();
        c.save(); c.translate(px, py - h); c.rotate(spin); c.globalAlpha = Math.min(1, f * 3) * fade;
        poly(c, [-8, 0, -2, -3, 9, 0, -2, 3], '#ffb3c0'); poly(c, [-8, 0, -2, -3, 9, 0], '#ffffff'); c.strokeStyle = '#ff3a5a'; c.lineWidth = 1; c.beginPath(); c.moveTo(-6, 0); c.lineTo(8, 0); c.stroke();
        c.restore();
      } else if (ph < 0.8) {
        var g = (ph - 0.45) / 0.35;
        c.globalAlpha = (1 - g) * fade;
        c.save(); c.translate(px, py - 2); c.rotate(0.5 + k); poly(c, [-7, 0, 0, -3, 8, 0, 0, 3], '#ffb3c0'); c.restore();
        add(c, true); c.strokeStyle = '#ffd0d8'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(px - 11 * (1 - g), py - 8 * (1 - g)); c.lineTo(px + 11 * (1 - g), py + 8 * (1 - g)); c.stroke(); soft(c, px, py, 12, '#ff3a5a', 0.45 * (1 - g)); add(c, false);
      }
    }
    c.globalAlpha = 1;
  };
  // Vortex Cleave: a tornado of spinning blades with wind streaks and swirling dust
  SC.vortex = function (c, e, x, y, u, tt) {
    var r = e.r || 72, k, j, fade = u < 0.1 ? u / 0.1 : u > 0.8 ? (1 - u) / 0.2 : 1, spin = tt * 8;
    gnd(c, x, y + 4, r * 1.1, '#8a7aa8', 0.28 * fade);
    c.lineCap = 'round';
    for (k = 0; k < 3; k++) for (j = 0; j < 3; j++) {
      var ra = r * (0.42 + k * 0.28), a0 = spin * (1 + k * 0.15) * (k % 2 ? -1 : 1) + j * TAU / 3 + k;
      c.globalAlpha = 0.35 * fade; c.strokeStyle = '#a58be0'; c.lineWidth = 8 - k * 1.4; c.beginPath(); c.arc(x, y, ra, a0 - 1.1, a0); c.stroke();
      c.globalAlpha = 0.85 * fade; c.strokeStyle = '#e8dcff'; c.lineWidth = 3.4 - k * 0.6; c.beginPath(); c.arc(x, y, ra, a0 - 0.9, a0); c.stroke();
      c.globalAlpha = fade; c.strokeStyle = '#ffffff'; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, ra, a0 - 0.5, a0); c.stroke();
      add(c, true); soft(c, x + Math.cos(a0) * ra, y + Math.sin(a0) * ra, 7, '#ffffff', 0.7 * fade); add(c, false);
    }
    c.globalAlpha = 0.4 * fade; c.strokeStyle = '#d6c8f5'; c.lineWidth = 1;
    for (k = 0; k < 8; k++) { var wa = -spin * 0.6 + k * 0.78, wr = r * (0.75 + 0.35 * hash(k, 2)); c.beginPath(); c.arc(x, y, wr, wa, wa + 0.35); c.stroke(); }
    add(c, true); soft(c, x, y, r * 0.4, '#efe4ff', 0.35 * fade); add(c, false); c.globalAlpha = 1;
  };
  // Phantom Shroud: a heavy, writhing cloud of dark smoke shot with violet
  SC.smoke = function (c, e, x, y, u, tt) {
    var r = e.r || 70, k, fade = u < 0.12 ? u / 0.12 : u > 0.8 ? (1 - u) / 0.2 : 1;
    soft(c, x, y, r * 1.1, '#2a2540', 0.5 * fade);
    for (k = 0; k < 18; k++) {
      var a = k * TAU / 18 + tt * (k % 2 ? 0.5 : -0.4) + hash(k, 1) * 2, d = r * (0.18 + 0.6 * hash(k, 2)), R = r * (0.28 + 0.16 * hash(k, 3)) * (1 + 0.1 * Math.sin(tt * 3 + k));
      soft(c, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8 - 3, R, k % 3 ? '#4a4468' : '#7a66a8', 0.5 * fade);
    }
    add(c, true); for (k = 0; k < 5; k++) { var wa = tt * 1.5 + k * 1.3; soft(c, x + Math.cos(wa) * r * 0.5, y + Math.sin(wa) * r * 0.4, 10, '#a796ce', 0.2 * fade); } add(c, false);
    ringS(c, x, y, r, '#a796ce', 1.2, 0.35 * fade);
  };
  // Grave Choir: bone hands claw up through green runes while ghostly singers wail rings of sound
  SC.grave = function (c, e, x, y, u, tt) {
    var r = e.r || 60, k, fade = u < 0.12 ? u / 0.12 : u > 0.8 ? (1 - u) / 0.2 : 1;
    soft(c, x, y, r * 1.1, '#3fdc78', 0.3 * fade);
    runes(c, x, y, r * 0.95, '#9bd99f', tt, 9, 0.65 * fade);
    for (k = 0; k < 6; k++) {
      var a = k * TAU / 6 + 0.3, d = r * 0.62, h = 14 * back(Math.min(1, e.t * 2.4 - k * 0.12)) * (0.7 + 0.3 * Math.sin(tt * 4 + k));
      if (h <= 0) continue; c.globalAlpha = fade;
      c.save(); c.translate(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8 + 4); c.lineCap = 'round';
      for (var f = 0; f < 4; f++) { var fx = (f - 1.5) * 3, cur = (f - 1.5) * 1.5, fh = h * (0.75 + (f === 1 || f === 2 ? 0.25 : 0)); c.strokeStyle = '#26261f'; c.lineWidth = 3; c.beginPath(); c.moveTo(fx, 0); c.quadraticCurveTo(fx + cur, -fh * 0.5, fx + cur * 1.5, -fh); c.stroke(); c.strokeStyle = '#ece8d2'; c.lineWidth = 1.7; c.stroke(); }
      c.restore();
    }
    for (k = 0; k < 4; k++) {
      var sa = k * TAU / 4 + tt * 0.8, sx = x + Math.cos(sa) * r * 0.32, sy = y + Math.sin(sa) * r * 0.25 - 14 - Math.sin(tt * 3 + k) * 4, w = (tt * 1.4 + k * 0.25) % 1;
      add(c, true); soft(c, sx, sy, 15, '#7dff9a', 0.28 * fade); add(c, false);
      skull(c, sx, sy, 0.95, '#d6ffe2', 0.85 * fade);
      ringS(c, sx, sy + 2, 6 + w * 26, '#9dffb8', 1.2, (1 - w) * 0.6 * fade);
    }
    c.globalAlpha = 1;
  };
  // Soul Well: a black whirlpool of spiralling souls
  SC.soul = function (c, e, x, y, u, tt) {
    var r = e.r || 74, k, j, fade = u < 0.1 ? u / 0.1 : u > 0.85 ? (1 - u) / 0.15 : 1;
    soft(c, x, y, r * 1.1, '#6a3fc8', 0.3 * fade);
    soft(c, x, y, r * 0.48, '#0c0618', 0.85 * fade);
    runes(c, x, y, r * 0.96, '#b79cf6', -tt * 1.2, 8, 0.5 * fade);
    for (k = 0; k < 3; k++) for (j = 0; j < 9; j++) {
      var f = (j / 9 + tt * 0.35) % 1, rad = r * (0.95 - 0.8 * f), ang = k * TAU / 3 + f * 4.2 - tt * 1.2, sx = x + Math.cos(ang) * rad, sy = y + Math.sin(ang) * rad * 0.85;
      c.globalAlpha = Math.min(1, (1 - f) * 1.5) * fade; add(c, true); soft(c, sx, sy, 6 + (1 - f) * 3, '#c9a8ff', 0.7); add(c, false);
      c.fillStyle = '#f3eaff'; c.beginPath(); c.ellipse(sx, sy, 1.6, 3.2 * (1 - f * 0.4), ang + Math.PI / 2, 0, TAU); c.fill();
    }
    c.globalAlpha = 0.6 * fade; c.strokeStyle = '#8a64e0'; c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, r * 0.5 + Math.sin(tt * 6) * 2, 0, TAU); c.stroke();
    c.globalAlpha = 1;
  };
  // Earthbreaker: stone spikes burst from the ground in a fan, throwing dust
  SC.earth = function (c, e, x, y, u, tt) {
    var d = V._D.earthSpikes, o = { x: x, y: y, r: (e.r || 95) * 0.95, a: Math.atan2(e.dy, e.dx), seed: e.sd || (e.sd = Math.random() * 50), t: e.t, life: e.life };
    d(c, o, x, y, u, tt);
    var a = o.a; c.globalAlpha = 0.5 * (1 - u); c.lineCap = 'round';
    for (var s = -1; s <= 1; s += 2) { c.strokeStyle = '#ffb04a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a + s * 0.6) * o.r, y + Math.sin(a + s * 0.6) * o.r); c.stroke(); }
    c.globalAlpha = 1;
  };
  SC.impact = function (c, e, x, y, u, tt) {
    var k, a = 1 - u;
    if (e.style === 'icicles') {
      for (k = 0; k < 7; k++) { var an = k * 0.9 + 0.3, l = 5 + u * 17; c.globalAlpha = a; c.strokeStyle = k % 2 ? '#eaffff' : '#8fd8ff'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x + Math.cos(an) * 3, y + Math.sin(an) * 2); c.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l * 0.7 - u * 4); c.stroke(); }
      add(c, true); soft(c, x, y, 16, '#9fe3ff', 0.5 * a); add(c, false);
    } else {
      add(c, true); c.globalAlpha = a; c.strokeStyle = '#ffd0d8'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 11 * a, y - 8 * a); c.lineTo(x + 11 * a, y + 8 * a); c.moveTo(x + 9 * a, y - 8 * a); c.lineTo(x - 9 * a, y + 8 * a); c.stroke();
      soft(c, x, y, 14, '#ff3a5a', 0.5 * a); add(c, false);
    }
    c.globalAlpha = 1;
  };
  V.drawSC = function (c, e, x, y, progress, tt) {
    var f = SC[e.kind]; if (!f) return false;
    c.save(); c.globalAlpha = 1; try { f(c, e, x, y, progress, tt); } catch (err) { /* a broken effect never stops the game */ } c.restore();
    return true;
  };
  // small bursts the spell code can request
  V.flameEmbers = function (x, y, dx, dy, range) {
    for (var i = 0; i < 3; i++) { var a = Math.atan2(dy, dx) + rnd(-0.45, 0.45), d = rnd(0.3, 1) * range, v = rnd(30, 80); V.emit({ kind: 'ember', add: true, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 25, ay: -40, drag: 1, life: rnd(0.4, 0.9), size: rnd(1.5, 3), col: i % 2 ? '#ff9a2e' : '#ffe58a', rot: rnd(0, 6) }); }
  };

  /* ---------- weapons: spinning knives, bolts, fireballs ---------- */
  V.drawFireball = function (c, s, x, y, tt) {
    var a = typeof s.a === 'number' ? s.a : Math.atan2(s.vy || 0, s.vx || 1), r = s.r + 2;
    c.save(); add(c, true); soft(c, x, y, r * 4.5, '#ff6a1a', 0.45); soft(c, x, y, r * 2.2, '#ffd27a', 0.7); add(c, false);
    c.translate(x, y); c.rotate(a);
    var wob = Math.sin(tt * 30 + x) * 1.2;
    poly(c, [0, -r, -r * 5.2, wob * 2, 0, r], 'rgba(255,60,20,.55)');
    poly(c, [0, -r * 0.8, -r * 3.6, -wob, 0, r * 0.8], 'rgba(255,150,40,.8)');
    poly(c, [0, -r * 0.5, -r * 2.2, wob, 0, r * 0.5], 'rgba(255,235,150,.95)');
    c.fillStyle = '#ff8a2a'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(1, 0, r * 0.62, 0, TAU); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(1.5, 0, r * 0.3, 0, TAU); c.fill();
    c.restore();
    if (Math.random() < 0.7) V.emit({ kind: 'ember', add: true, x: s.x - Math.cos(a) * 4, y: s.y - Math.sin(a) * 4, vx: rnd(-18, 18) - Math.cos(a) * 25, vy: rnd(-26, 6) - Math.sin(a) * 25, ay: -30, life: rnd(0.25, 0.55), size: rnd(1.5, 2.8), col: Math.random() < 0.5 ? '#ff9a2e' : '#ffe58a', rot: rnd(0, 6) });
  };
  V.drawKnife = function (c, s, x, y, tt) { // a spinning throwing knife with a glinting trail
    var a = typeof s.a === 'number' ? s.a : 0, spin = tt * 28 + x * 0.1;
    c.save();
    for (var i = 1; i <= 5; i++) { c.globalAlpha = 0.32 - i * 0.055; c.strokeStyle = '#d8e4ff'; c.lineWidth = 2.4 - i * 0.35; c.beginPath(); c.moveTo(x - Math.cos(a) * (i * 4 - 2), y - Math.sin(a) * (i * 4 - 2)); c.lineTo(x - Math.cos(a) * i * 5, y - Math.sin(a) * i * 5); c.stroke(); }
    c.globalAlpha = 1; c.translate(x, y); c.rotate(spin);
    poly(c, [-3, -1, 0, -1.4, 8, 0, 0, 1.4, -3, 1], '#e8f0ff'); poly(c, [-3, -1, 0, -1.4, 8, 0, 0, 0], '#ffffff');
    c.fillStyle = '#5a3a24'; c.fillRect(-8, -1.2, 5, 2.4); c.fillStyle = '#c9a24a'; c.fillRect(-3.4, -3, 1.6, 6);
    c.restore();
    if (Math.sin(spin * 2) > 0.85) { add(c, true); soft(c, x, y, 7, '#ffffff', 0.7); add(c, false); }
  };
  V.drawBolt = function (c, s, x, y, tt) { // the wizard's arcane bolt: a crackling violet star with orbiting sparks
    var a = typeof s.a === 'number' ? s.a : 0, r = s.r;
    c.save();
    for (var i = 1; i <= 6; i++) { c.globalAlpha = 0.34 - i * 0.05; add(c, true); soft(c, x - Math.cos(a) * i * r * 1.2, y - Math.sin(a) * i * r * 1.2, Math.max(1.5, r * (1.5 - i * 0.18)), s.col || '#c9a8ff', 0.9); add(c, false); }
    c.globalAlpha = 1; add(c, true); soft(c, x, y, r * 3.2, s.col || '#c9a8ff', 0.6); add(c, false);
    c.fillStyle = s.col || '#c9a8ff'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x, y, r * 0.55, 0, TAU); c.fill();
    for (i = 0; i < 3; i++) { var oa = tt * 14 + i * 2.094; c.fillStyle = '#eaf6ff'; c.beginPath(); c.arc(x + Math.cos(oa) * (r + 4), y + Math.sin(oa) * (r + 3), 1.2, 0, TAU); c.fill(); }
    c.restore();
  };
  // The necromancer's shot: a small green skull in profile, facing the way it flies, trailing green smoke and a ghostly tail
  V.drawBone = function (c, s, x, y, tt) {
    var a = typeof s.a === 'number' ? s.a : Math.atan2(s.vy || 0, s.vx || 1), ca = Math.cos(a), sa = Math.sin(a), wob = Math.sin(tt * 26 + x * 0.2);
    c.save();
    add(c, true); soft(c, x, y, 13, '#3dff88', 0.4); soft(c, x - ca * 6, y - sa * 6, 10, '#1fbf5a', 0.3); add(c, false);
    c.translate(x, y); c.rotate(a);
    c.scale(1.3, ca < 0 ? -1.3 : 1.3); // a touch bigger; flying left, the skull stays the right way up
    // ghostly flame tail
    c.fillStyle = 'rgba(70,230,120,.45)'; c.beginPath(); c.moveTo(-1, -3.4); c.quadraticCurveTo(-8, -4 + wob * 1.5, -15, wob * 2); c.quadraticCurveTo(-8, 4 + wob, -1, 3.4); c.closePath(); c.fill();
    c.fillStyle = 'rgba(200,255,215,.55)'; c.beginPath(); c.moveTo(-1, -1.8); c.quadraticCurveTo(-6, wob, -10, wob * 1.4); c.quadraticCurveTo(-6, 1.8, -1, 1.8); c.closePath(); c.fill();
    // the skull, seen from the side: cranium, brow, eye, cheekbone, teeth and jaw toward the front
    c.fillStyle = '#e4f8e6'; c.beginPath(); c.arc(0, -0.4, 4.2, 0, TAU); c.fill();
    c.fillStyle = '#b8dcc0'; c.beginPath(); c.arc(-1.4, 0.6, 3.1, 0.4, 3.6); c.fill();           // shaded back of the skull
    c.fillStyle = '#e4f8e6'; c.fillRect(1.2, 1.2, 4.4, 2.8);                                        // upper jaw and face
    c.fillStyle = '#c9e8d0'; c.fillRect(1.4, 3.6, 4, 1.8);                                           // lower jaw
    c.fillStyle = '#0c2414'; c.beginPath(); c.ellipse(1.3, -0.5, 1.5, 1.7, 0, 0, TAU); c.fill();     // eye socket
    c.fillStyle = '#59ff90'; c.beginPath(); c.arc(1.5, -0.5, 0.8 + 0.2 * wob, 0, TAU); c.fill();      // burning eye
    c.fillStyle = '#0c2414'; c.fillRect(3.6, 1.4, 1.2, 1); c.fillStyle = '#7a9a82'; for (var i = 0; i < 3; i++) c.fillRect(2 + i * 1.3, 3.2, 0.7, 1.2); // nose hole and teeth
    c.restore();
    // green smoke pouring out behind it
    for (var sm = 0; sm < 2; sm++) V.emit({ kind: 'smoke', x: s.x - ca * (4 + sm * 5) + rnd(-1.5, 1.5), y: s.y - sa * (4 + sm * 5) + rnd(-1.5, 1.5), vx: rnd(-9, 9) - ca * 14, vy: rnd(-12, 2) - sa * 14, drag: 1.1, life: rnd(0.55, 0.95), size: rnd(4, 6.5), grow: rnd(8, 13), col: Math.random() < 0.55 ? '#46e07a' : '#1f8a44', alpha: 0.85 });
    if (Math.random() < 0.22) V.emit({ kind: 'soul', add: true, x: s.x - ca * 6, y: s.y - sa * 6, vx: rnd(-14, 14), vy: rnd(-24, -6), life: rnd(0.4, 0.7), size: rnd(1.4, 2.2), col: '#9bffb8' });
  };

  /* ---------- a lightning-style beam / soul-drain beam (used by CC.Classes) ---------- */
  V.drawBeam = function (c, x1, y1, x2, y2, col, a, tt) {
    var green = col === '#7dff9a' || col === '#7dff5a';
    if (!green) { H.bolt(c, x1, y1, x2, y2, Math.floor(tt * 20), 7, 2 * a + 0.6, col || '#bfe9ff', a, 2); return; }
    var L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / L, ny = (x2 - x1) / L, i, n = 14;
    c.save(); c.lineCap = 'round';
    for (var s = 0; s < 2; s++) { // twin spiralling strands
      c.beginPath();
      for (i = 0; i <= n; i++) { var f = i / n, off = Math.sin(f * 11 - tt * 18 + s * Math.PI) * 5 * Math.sin(f * Math.PI); var px = x1 + (x2 - x1) * f + nx * off, py = y1 + (y2 - y1) * f + ny * off; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      c.globalAlpha = a * 0.4; c.strokeStyle = '#35e07a'; c.lineWidth = 6; c.stroke();
      c.globalAlpha = a; c.strokeStyle = s ? '#baffd0' : '#7dff9a'; c.lineWidth = 2; c.stroke();
    }
    add(c, true);
    for (i = 0; i < 5; i++) { var fr = 1 - ((tt * 1.8 + i / 5) % 1); soft(c, x1 + (x2 - x1) * fr, y1 + (y2 - y1) * fr, 5, '#d6ffe2', a * 0.9); } // souls streaming to the caster
    soft(c, x2, y2, 14, '#5dff90', a * 0.6); add(c, false);
    c.restore(); c.globalAlpha = 1;
  };

  /* ---------- the Patchwork Horror: the world goes dark around it until it is slain ---------- */
  var off = null, offc = null, lastAt = 0;
  V.drawEndlessDarkness = function (c, cam, ambient, radius) {
    if (!(ambient < 1)) return;
    if (!off) { off = document.createElement('canvas'); offc = off.getContext('2d'); }
    var w = Math.ceil(cam.w), h = Math.ceil(cam.h);
    if (off.width !== w || off.height !== h) { off.width = w; off.height = h; }
    var o = offc;
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, w, h);
    o.fillStyle = 'rgba(5,3,12,' + Math.min(1, 1 - ambient) + ')';
    o.fillRect(0, 0, w, h);
    o.globalCompositeOperation = 'destination-out';
    CC.Endless.livingHeroes().forEach(function (hero) {
      var x = hero.x - cam.x, y = hero.y - cam.y;
      var light = o.createRadialGradient(x, y, radius * 0.3, x, y, radius);
      light.addColorStop(0, '#000');
      light.addColorStop(1, 'transparent');
      o.fillStyle = light;
      o.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    });
    c.drawImage(off, 0, 0, cam.w, cam.h);
  };

  V.drawDarkness = function (c, cam) {
    var now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - lastAt) / 1000)); lastAt = now;
    var E = CC.Enemies, hero = CC.state && CC.state.player, horror = null, i;
    if (E && E.list && !(CC.CriticalScene && CC.CriticalScene.isActive && CC.CriticalScene.isActive())) {
      for (i = 0; i < E.list.length; i++) { var e = E.list[i]; if (e.stitched && !e.dead && e.hp > 0) { horror = e; break; } }
    }
    var d = V._s.dark; d.lvl += ((horror ? 1 : 0) - d.lvl) * Math.min(1, dt * (horror ? 1.4 : 0.9));
    if (d.lvl < 0.01) return;
    var w = Math.ceil(cam.w), h = Math.ceil(cam.h);
    if (!off) { off = document.createElement('canvas'); offc = off.getContext('2d'); }
    if (off.width !== w || off.height !== h) { off.width = w; off.height = h; }
    var o = offc, tt = V._T(), pulse = 0.5 + 0.5 * Math.sin(tt * 2.2);
    o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, w, h);
    o.fillStyle = 'rgba(2,0,8,' + (0.9 * d.lvl).toFixed(3) + ')'; o.fillRect(0, 0, w, h);
    o.globalCompositeOperation = 'destination-out';
    function hole(x, y, r, a) { var g = o.createRadialGradient(x, y, r * 0.15, x, y, r); g.addColorStop(0, 'rgba(0,0,0,' + a + ')'); g.addColorStop(0.6, 'rgba(0,0,0,' + a * 0.55 + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = g; o.beginPath(); o.arc(x, y, r, 0, TAU); o.fill(); }
    if (hero) hole(hero.x - cam.x, hero.y - cam.y, 118 + 6 * pulse, 1); // your own light holds the dark back
    var hx = 0, hy = 0;
    if (horror) { hx = horror.x - cam.x; hy = horror.y - cam.y; hole(hx, hy, 70, 0.9); } // so its attacks stay readable
    c.save();
    c.globalAlpha = 1; c.drawImage(off, 0, 0, cam.w, cam.h);
    if (horror) { // a sickly violet-red aura and creeping tendrils of dark around it
      c.globalCompositeOperation = 'lighter';
      soft(c, hx, hy, 58 + 8 * pulse, '#8a1f5a', 0.28 * d.lvl); soft(c, hx, hy, 26, '#c2336a', 0.28 * d.lvl);
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = 'rgba(20,4,30,' + (0.55 * d.lvl).toFixed(3) + ')'; c.lineWidth = 3; c.lineCap = 'round';
      for (i = 0; i < 7; i++) { var a = i * TAU / 7 + tt * 0.35, r0 = 40 + 8 * Math.sin(tt * 2 + i), r1 = 78 + 16 * Math.sin(tt * 1.4 + i * 2); c.beginPath(); c.moveTo(hx + Math.cos(a) * r0, hy + Math.sin(a) * r0); c.quadraticCurveTo(hx + Math.cos(a + 0.5) * (r0 + r1) * 0.55, hy + Math.sin(a + 0.5) * (r0 + r1) * 0.55, hx + Math.cos(a + 0.2) * r1, hy + Math.sin(a + 0.2) * r1); c.stroke(); }
    }
    c.restore();
  };
  V.darkness = function () { return V._s.dark.lvl; };
})(window);
