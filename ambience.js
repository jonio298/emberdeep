/* CC.Ambience - the little living details of the outdoors.
 *   fireflies   drifting, blinking lights with a soft glow in the Giant Forest and the Rolling Plains: a handful by day, a swarm at night
 *   frogs       small green frogs sitting on the shore of the plains' ponds that hop around the bank and dive in with a splash and ripples
 * (the plains' wind-swept grass is drawn by plains.js itself, with travelling gusts)
 * draw(ctx, cam)      world pass, with the entities (frogs, ripples)
 * drawGlow(ctx, cam)  after the lighting pass, so the fireflies shine OVER the darkness
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, A = CC.Ambience = {}, PI2 = Math.PI * 2, T = CC.TILE || 32;
  var flies = [], frogs = [], ripples = [], last = 0, scanT = 0, seedBase = 1;
  function R() { return Math.random(); }
  function area() { return CC.state && CC.state.area; }
  function night() { return CC.DayNight && CC.DayNight.nightness ? CC.DayNight.nightness() : 0; }
  function solid(x, y) { return !!(CC.Dungeon && CC.Dungeon.isSolid && CC.Dungeon.isSolid(x, y)); }
  function kindAt(m, x, y) { var tx = Math.floor(x / T), ty = Math.floor(y / T); return m && tx >= 0 && ty >= 0 && tx < m.w && ty < m.h ? m.kind[ty * m.w + tx] : 9; }
  function inView(o, cam, pad) { return o.x > cam.x - pad && o.x < cam.x + cam.w + pad && o.y > cam.y - pad && o.y < cam.y + cam.h + pad; }
  A.clear = function () { flies.length = frogs.length = ripples.length = 0; watchers.length = 0; };

  /* ---------- fireflies ---------- */
  function wantFlies() { var a = area(), n = night(), cut = 1 - 0.4 * n; // 40% fewer fireflies at night
    return a === 'forest' ? Math.round((9 + 34 * n) * cut) : a === 'plains' ? Math.round((6 + 28 * n) * cut) : 0; }
  function stepFlies(dt, cam) {
    var want = wantFlies(), i, f;
    for (i = flies.length - 1; i >= 0; i--) {
      f = flies[i]; f.a += (Math.sin(f.t * 0.9 + f.s) * 1.6 + (R() - 0.5) * 0.8) * dt * 2; f.t += dt;
      f.x += Math.cos(f.a) * f.v * dt; f.y += Math.sin(f.a) * f.v * dt * 0.8 + Math.sin(f.t * 2.3 + f.s) * 4 * dt;
      if (!inView(f, cam, 70) || solid(f.x, f.y)) flies.splice(i, 1);
    }
    var tries = 0;
    while (flies.length < want && tries++ < 12 && flies.length < 60) { // new ones appear just inside the screen, on open ground
      var x = cam.x + R() * cam.w, y = cam.y + R() * cam.h;
      if (solid(x, y)) continue;
      flies.push({ x: x, y: y, a: R() * PI2, v: 7 + R() * 9, t: R() * 50, s: R() * 50, sz: 0.8 + R() * 0.8, f: 1.2 + R() * 1.6 });
    }
    if (flies.length > want + 6) flies.splice(0, flies.length - want - 6);
  }
  /* ---------- the dark beyond your light: pale eyes that open and close out in the gloom ---------- */
  var watchers = [];
  function stepWatchers(dt, cam) {
    var p = CC.state && CC.state.player, n = night(), want = (CC.DayNight && CC.DayNight.outdoors && CC.DayNight.outdoors()) ? Math.round(7 * n) : 0, i, w;
    for (i = watchers.length - 1; i >= 0; i--) { w = watchers[i]; w.t += dt; if (w.t >= w.life || !p || Math.hypot(w.x - p.x, w.y - p.y) < 190) watchers.splice(i, 1); }
    if (!p) return;
    if (watchers.length < want && Math.random() < dt * 1.2) {
      var a = Math.random() * PI2, d = 230 + Math.random() * 190, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (!solid(x, y)) watchers.push({ x: x, y: y, t: 0, life: 3.5 + Math.random() * 3.5, sep: 4.5 + Math.random() * 3, col: Math.random() < 0.7 ? '255,70,55' : '200,225,255', blink: Math.random() * 6 });
    }
  }
  function drawWatchers(ctx, cam) {
    var n = night(); if (n < 0.1 || !watchers.length) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < watchers.length; i++) {
      var w = watchers[i], u = w.t / w.life, a = Math.sin(Math.PI * u) * 0.6 * n, x = w.x - cam.x, y = w.y - cam.y;
      if ((w.t + w.blink) % 2.6 < 0.16) a = 0; // a slow blink
      if (a <= 0.01) continue;
      for (var k = -1; k <= 1; k += 2) {
        var g = ctx.createRadialGradient(x + k * w.sep, y, 0, x + k * w.sep, y, 7); g.addColorStop(0, 'rgba(' + w.col + ',' + a + ')'); g.addColorStop(1, 'rgba(' + w.col + ',0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + k * w.sep, y, 7, 0, PI2); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,230,' + a + ')'; ctx.fillRect(x + k * w.sep - 0.7, y - 1.6, 1.4, 3.2);
      }
    }
    ctx.restore();
  }
  A.drawGlow = function (ctx, cam) {
    var nowW = Date.now() / 1000, dtW = Math.min(0.1, nowW - (A._wt || nowW)); A._wt = nowW; stepWatchers(dtW, cam); drawWatchers(ctx, cam);
    var a = area(); if (a !== 'forest' && a !== 'plains') return;
    var now = Date.now() / 1000, dt = Math.min(0.1, now - last || 0); if (dt > 0) { last = now; stepFlies(dt, cam); }
    var n = night(), i, f;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < flies.length; i++) {
      f = flies[i];
      var blink = Math.max(0, Math.sin(f.t * f.f + f.s)), glow = (0.25 + 0.75 * blink * blink) * (0.45 + 0.55 * n), x = f.x - cam.x, y = f.y - cam.y - 6 - Math.sin(f.t * 1.7 + f.s) * 2, r = (6 + 10 * n) * f.sz;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(230,255,140,' + 0.85 * glow + ')'); g.addColorStop(0.35, 'rgba(190,255,90,' + 0.35 * glow + ')'); g.addColorStop(1, 'rgba(120,230,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,220,' + (0.35 + 0.65 * glow) + ')'; ctx.fillRect(x - 0.8, y - 0.8, 1.6 * f.sz, 1.6 * f.sz);
    }
    ctx.restore();
  };

  /* ---------- frogs by the pond ---------- */
  function findShore(m, cam) { // a land tile beside water, somewhere on screen
    for (var k = 0; k < 40; k++) {
      var tx = Math.floor(cam.x / T) + Math.floor(R() * (cam.w / T + 2)), ty = Math.floor(cam.y / T) + Math.floor(R() * (cam.h / T + 2));
      if (tx < 1 || ty < 1 || tx >= m.w - 1 || ty >= m.h - 1 || m.kind[ty * m.w + tx] !== 5) continue;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], d = dirs[Math.floor(R() * 4)], lx = tx + d[0], ly = ty + d[1];
      if (m.kind[ly * m.w + lx] === 5 || m.tiles[ly * m.w + lx]) continue;
      return { x: (tx + 0.5 + d[0] * 0.62) * T + (R() - 0.5) * 8, y: (ty + 0.5 + d[1] * 0.62) * T + (R() - 0.5) * 8 };
    }
    return null;
  }
  function ripple(x, y, big) { if (ripples.length < 24) ripples.push({ x: x, y: y, age: 0, big: big ? 1 : 0 }); }
  function stepFrogs(dt, cam) {
    var m = CC.Dungeon, i, f;
    if (area() !== 'plains' || !m || !m.kind) { frogs.length = 0; return; }
    for (i = ripples.length - 1; i >= 0; i--) { ripples[i].age += dt; if (ripples[i].age > 1.3) ripples.splice(i, 1); }
    scanT -= dt;
    if (scanT <= 0) { scanT = 0.6; if (frogs.length < 7) { var sh = findShore(m, cam); if (sh) frogs.push({ x: sh.x, y: sh.y, hx: sh.x, hy: sh.y, st: 'sit', t: 0.5 + R() * 3, face: R() < 0.5 ? -1 : 1, u: 0, z: 0, fx: 0, fy: 0, tx: 0, ty: 0, croak: 0 }); } }
    for (i = frogs.length - 1; i >= 0; i--) {
      f = frogs[i]; f.t -= dt;
      if (!inView(f, cam, 140)) { frogs.splice(i, 1); continue; }
      if (f.st === 'sit') {
        f.croak = Math.max(0, f.croak - dt);
        if (f.t <= 0) {
          var a = R() * PI2, d = 12 + R() * 22, tx = f.x + Math.cos(a) * d, ty = f.y + Math.sin(a) * d, kd = kindAt(m, tx, ty);
          if (kd === 9 || (kd !== 5 && solid(tx, ty))) { f.t = 0.4; continue; }
          f.st = 'hop'; f.u = 0; f.fx = f.x; f.fy = f.y; f.tx = tx; f.ty = ty; f.face = tx >= f.x ? 1 : -1;
        } else if (f.t < 0.5 && f.croak <= 0 && R() < dt * 2) f.croak = 0.5; // a throat bubble before a hop
      } else if (f.st === 'hop') {
        f.u += dt / 0.4; var u = Math.min(1, f.u);
        f.x = f.fx + (f.tx - f.fx) * u; f.y = f.fy + (f.ty - f.fy) * u; f.z = Math.sin(Math.PI * u) * 11;
        if (u >= 1) {
          f.z = 0;
          if (kindAt(m, f.x, f.y) === 5) { // it lands in the water: a splash, ripples, and it dives
            ripple(f.x, f.y, true); if (CC.fx && CC.fx.burst) CC.fx.burst(f.x, f.y, '#bfe6f4', 6, 45);
            if (CC.Audio && CC.Audio.fx) CC.Audio.fx('waterdrop' + (1 + Math.floor(R() * 2)), { x: f.x, y: f.y, vol: 0.22, gap: 200 });
            f.st = 'dive'; f.t = 2 + R() * 3;
          } else { f.st = 'sit'; f.t = 1 + R() * 4; }
        }
      } else if (f.st === 'dive') { // under the water, then back up on the bank
        if (f.t <= 0) { f.x = f.hx; f.y = f.hy; ripple(f.x, f.y, false); f.st = 'sit'; f.t = 1 + R() * 3; }
      }
    }
  }
  A.draw = function (ctx, cam) {
    if (area() !== 'plains') return;
    var now = Date.now() / 1000, dt = Math.min(0.1, now - (A._ft || now)); A._ft = now; stepFrogs(dt, cam);
    var i, f;
    ctx.save(); ctx.lineWidth = 1;
    for (i = 0; i < ripples.length; i++) { // ripple rings spreading on the water
      var q = ripples[i], u = q.age / 1.3, rr = (q.big ? 4 : 2.5) + u * (q.big ? 16 : 10);
      ctx.globalAlpha = 0.55 * (1 - u); ctx.strokeStyle = '#cfeaf5'; ctx.beginPath(); ctx.ellipse(q.x - cam.x, q.y - cam.y, rr, rr * 0.55, 0, 0, PI2); ctx.stroke();
      if (u > 0.25) { ctx.globalAlpha = 0.3 * (1 - u); ctx.beginPath(); ctx.ellipse(q.x - cam.x, q.y - cam.y, rr * 0.6, rr * 0.33, 0, 0, PI2); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < frogs.length; i++) {
      f = frogs[i]; if (f.st === 'dive') continue;
      var x = f.x - cam.x, y = f.y - cam.y, hop = f.st === 'hop', s = f.face;
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 4.2 - f.z * 0.1, 1.8, 0, 0, PI2); ctx.fill();
      ctx.save(); ctx.translate(x, y - f.z - 2); ctx.scale(s, 1);
      ctx.strokeStyle = '#3f8a3a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; // hind legs: folded when sitting, stretched when it jumps
      ctx.beginPath(); if (hop) { ctx.moveTo(-1, 1); ctx.lineTo(-6, 3); ctx.moveTo(-1, 2); ctx.lineTo(-5.5, 5); } else { ctx.moveTo(-1.5, 1); ctx.lineTo(-4, -0.5); ctx.lineTo(-2.5, 2.5); } ctx.stroke();
      ctx.fillStyle = '#5da84a'; ctx.beginPath(); ctx.ellipse(0, 0, 4.2, 2.9, hop ? -0.35 : 0, 0, PI2); ctx.fill(); // body
      ctx.fillStyle = '#c9e49a'; ctx.beginPath(); ctx.ellipse(0.8, 1.2, 2.4, 1.2, 0, 0, PI2); ctx.fill(); // pale belly
      ctx.fillStyle = '#5da84a'; ctx.beginPath(); ctx.arc(3, -1.6, 1.5, 0, PI2); ctx.arc(1.4, -2.2, 1.4, 0, PI2); ctx.fill(); // eye bumps
      ctx.fillStyle = '#10200c'; ctx.fillRect(3.4, -2, 0.9, 1.1); ctx.fillRect(1.8, -2.6, 0.9, 1.1);
      if (f.croak > 0) { ctx.fillStyle = 'rgba(210,240,150,' + (0.5 + 0.5 * Math.sin(f.croak * 30)) + ')'; ctx.beginPath(); ctx.arc(3.6, 1, 1.3 + Math.sin(f.croak * 30) * 0.5, 0, PI2); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
  };
})(window);
