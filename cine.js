/* Emberdeep critical-hit cinematics: freeze-frame, the screen drops to black, a short staged move, then slow motion fading back to the fight.
 *   swordsman  Slice: the hero streaks in through the foe, a white cut hangs in the dark, then slices back out the other way (samurai-style).
 *   thief      Shadow X: the same in-and-out, quicker, with two crossed cuts and a violet trail.
 *   wizard     Arcane Burst: rune rings and rays bloom around the foe while time stops.
 *   necromancer Soul Rip: green souls spiral out of the foe into the hero.
 * API (CC.Cine): crit(hero, foe, kind?) starts one (ignored while one runs or inside its cool-down), tick(realDt) is called by the shell every frame
 * before the game update and sets CC.fx.scale (the game's time scale), draw(ctx, cam) paints the dark overlay and the staged figures, active().
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var CC = root.CC = root.CC || {};

  var COOLDOWN = 2.4;
  var cine = null, cool = 0;
  var PLAN = {
    slice: { total: 1.08, freeze: 0.16, inEnd: 0.34, holdEnd: 0.46, outEnd: 0.62 },
    xcut:  { total: 0.9, freeze: 0.12, inEnd: 0.27, holdEnd: 0.36, outEnd: 0.5 },
    arcane: { total: 1.0, freeze: 0.16, inEnd: 0.5, holdEnd: 0.5, outEnd: 0.5 },
    soul: { total: 1.0, freeze: 0.16, inEnd: 0.55, holdEnd: 0.55, outEnd: 0.55 }
  };
  var KIND = { swordsman: 'slice', thief: 'xcut', wizard: 'arcane', necromancer: 'soul' };
  var TRAIL = { slice: '#ffffff', xcut: '#c9a8ff', arcane: '#9fe3ff', soul: '#7dff9a' };

  function ease(v) { v = Math.max(0, Math.min(1, v)); return 1 - Math.pow(1 - v, 3); }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function fxs() { return CC.fx || {}; }

  function stepMove(p, dx, dy) {
    var D = CC.Dungeon, n = 6, i;
    for (i = 0; i < n; i++) {
      var ox = p.x, oy = p.y;
      if (D && typeof D.moveWithCollision === 'function') { try { D.moveWithCollision(p, dx / n, dy / n); } catch (e) { p.x += dx / n; p.y += dy / n; } }
      else { p.x += dx / n; p.y += dy / n; }
      if (D && typeof D.isSolid === 'function' && D.isSolid(p.x, p.y)) { p.x = ox; p.y = oy; break; }
    }
  }

  function crit(p, e, kind) {
    if (cine || cool > 0 || !p || !e) return false;
    kind = kind || KIND[p.classId] || 'slice';
    var plan = PLAN[kind]; if (!plan) return false;
    var dx = e.x - p.x, dy = e.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    cine = { kind: kind, plan: plan, t: 0, p: p, e: e, ox: p.x, oy: p.y, ex: e.x, ey: e.y, ux: dx / d, uy: dy / d, d: d,
      stage: 0, face: p.face || 1, dmg: Math.max(1, Math.round((p.stats && p.stats.dmg || 10) * 1.2)) };
    cine.reach = Math.min(70, d + 26);
    p.iframes = Math.max(p.iframes || 0, plan.total);
    return true;
  }

  function tick(dt) {
    var f = fxs();
    if (cool > 0) cool = Math.max(0, cool - dt);
    if (!cine) { f.scale = 1; return; }
    var c = cine, pl = c.plan, p = c.p;
    c.t += dt;
    p.iframes = Math.max(p.iframes || 0, 0.1);
    var scale = 1;
    if (c.t < pl.freeze) scale = 0;
    else if (c.t < pl.holdEnd) scale = 0;
    else scale = 0.22;
    if (c.kind === 'arcane' || c.kind === 'soul') scale = c.t < pl.outEnd ? 0 : 0.22;
    f.scale = scale;
    var alive = c.e && c.e.hp > 0 && !c.e.dead;
    if (c.kind === 'slice' || c.kind === 'xcut') {
      if (c.stage === 0 && c.t >= pl.inEnd) { // arrive on the far side of the foe
        c.stage = 1;
        stepMove(p, c.ux * c.reach, c.uy * c.reach);
        c.fx = p.x; c.fy = p.y; p.face = c.ux >= 0 ? 1 : -1;
        if (f.shake) f.shake(5);
        if (f.burst) f.burst(c.ex, c.ey, '#ffffff', 16, 140);
      }
      if (c.stage === 1 && c.t >= pl.outEnd) { // back out the other way, a second cut
        c.stage = 2;
        stepMove(p, -c.ux * (c.reach * 0.9), -c.uy * (c.reach * 0.9));
        p.face = c.ux >= 0 ? -1 : 1;
        if (alive && CC.Classes && CC.Classes.hitEnemy) CC.Classes.hitEnemy(c.e, c.dmg, 'slash', { noCrit: true, noCine: true });
        if (f.shake) f.shake(6);
        if (f.blood) f.blood(c.ex, c.ey, 16, c.ux, c.uy);
        if (f.burst) f.burst(c.ex, c.ey, c.kind === 'xcut' ? '#c9a8ff' : '#ffd24a', 18, 160);
      }
    } else if (c.stage === 0 && c.t >= pl.freeze) {
      c.stage = 1;
      if (f.shake) f.shake(4);
      if (alive && CC.Classes && CC.Classes.hitEnemy) CC.Classes.hitEnemy(c.e, c.dmg, c.kind === 'arcane' ? 'fire' : 'drain', { noCrit: true, noCine: true });
      if (f.burst) f.burst(c.ex, c.ey, TRAIL[c.kind], 24, 150);
    }
    if (c.t >= pl.total) { cine = null; cool = COOLDOWN; f.scale = 1; }
  }

  function line(c, x1, y1, x2, y2, col, w, a) {
    c.globalAlpha = a; c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }

  function draw(c, cam) {
    if (!cine) return;
    var k = cine, pl = k.plan, t = k.t, p = k.p;
    var dark = t < pl.freeze ? ease(t / pl.freeze) * 0.84 : t < pl.holdEnd + 0.1 ? 0.84 : 0.84 * (1 - clamp01((t - pl.holdEnd - 0.1) / (pl.total - pl.holdEnd - 0.1)));
    c.save();
    c.globalAlpha = dark; c.fillStyle = '#020104'; c.fillRect(0, 0, cam.w, cam.h);
    // thin letterbox bars sell the freeze
    var bar = 14 * Math.min(1, dark / 0.84);
    c.globalAlpha = 1; c.fillStyle = '#000'; c.fillRect(0, 0, cam.w, bar); c.fillRect(0, cam.h - bar, cam.w, bar);
    var ex = k.ex - cam.x, ey = k.ey - cam.y, ox = k.ox - cam.x, oy = k.oy - cam.y, ux = k.ux, uy = k.uy, nx = -uy, ny = ux;
    var col = TRAIL[k.kind];
    // the foe, lit against the dark
    var glow = c.createRadialGradient(ex, ey, 2, ex, ey, 34);
    glow.addColorStop(0, 'rgba(255,255,255,0.55)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalAlpha = Math.min(1, dark * 1.2); c.fillStyle = glow; c.beginPath(); c.arc(ex, ey, 34, 0, 6.2832); c.fill();

    if (k.kind === 'slice' || k.kind === 'xcut') {
      var far = { x: ex + ux * k.reach, y: ey + uy * k.reach };
      var gx, gy, ga = 1;
      if (t < pl.freeze) { gx = ox; gy = oy; ga = ease(t / pl.freeze); }
      else if (t < pl.inEnd) { var a = ease((t - pl.freeze) / (pl.inEnd - pl.freeze)); gx = ox + (far.x - ox) * a; gy = oy + (far.y - oy) * a;
        line(c, ox, oy, gx, gy, col, 3, 0.9); line(c, ox, oy, gx, gy, '#ffffff', 1, 1);
        for (var n = 1; n <= 3; n++) { var b = Math.max(0, a - n * 0.12); if (CC.Classes && CC.Classes.drawHero) { c.globalAlpha = 0.28 / n; CC.Classes.drawHero(c, p, ox + (far.x - ox) * b, oy + (far.y - oy) * b); } }
      } else if (t < pl.outEnd) { gx = p.x - cam.x; gy = p.y - cam.y;
        if (t >= pl.holdEnd) { var a2 = ease((t - pl.holdEnd) / (pl.outEnd - pl.holdEnd)); var nr = { x: ex - ux * k.reach * 0.9, y: ey - uy * k.reach * 0.9 };
          gx = far.x + (nr.x - far.x) * a2; gy = far.y + (nr.y - far.y) * a2;
          line(c, far.x, far.y, gx, gy, col, 3, 0.9); line(c, far.x, far.y, gx, gy, '#ffffff', 1, 1); } }
      else { gx = p.x - cam.x; gy = p.y - cam.y; }
      // hero, bright over the dark
      c.globalAlpha = 1; if (CC.Classes && CC.Classes.drawHero) CC.Classes.drawHero(c, p, gx, gy);
      // the cuts: a white gash through the foe that holds in the dark, then fades
      var cut1 = t >= pl.inEnd ? clamp01(1 - (t - pl.inEnd) / 0.55) : 0;
      if (cut1 > 0) { var len1 = 30 * Math.min(1, (t - pl.inEnd) / 0.05 + 0.2); line(c, ex - ux * len1 - nx * 6, ey - uy * len1 - ny * 6, ex + ux * len1 + nx * 6, ey + uy * len1 + ny * 6, '#ffffff', 2.4, cut1); line(c, ex - ux * len1, ey - uy * len1, ex + ux * len1, ey + uy * len1, col, 6, cut1 * 0.35); }
      var cut2 = t >= pl.outEnd ? clamp01(1 - (t - pl.outEnd) / 0.45) : 0;
      if (cut2 > 0) { var sl = 28, cx = Math.cos(0.9) * ux - Math.sin(0.9) * uy, cy = Math.sin(0.9) * ux + Math.cos(0.9) * uy;
        line(c, ex - cx * sl, ey - cy * sl, ex + cx * sl, ey + cy * sl, '#ffffff', 2.4, cut2); line(c, ex - cx * sl, ey - cy * sl, ex + cx * sl, ey + cy * sl, col, 6, cut2 * 0.35); }
    } else if (k.kind === 'arcane') {
      var ra = clamp01((t - pl.freeze) / 0.4);
      for (var r = 0; r < 3; r++) { var rr = (10 + 34 * ease(ra)) * (1 + r * 0.55); line(c, ex + rr, ey, ex + rr, ey, col, 1, 0); c.globalAlpha = (1 - ra * 0.6) * (0.9 - r * 0.25); c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.arc(ex, ey, rr, 0, 6.2832); c.stroke(); }
      for (var q = 0; q < 12; q++) { var an = q / 12 * 6.2832 + t * 2, l1 = 8 + 40 * ease(ra); line(c, ex + Math.cos(an) * 8, ey + Math.sin(an) * 8, ex + Math.cos(an) * l1, ey + Math.sin(an) * l1, col, 1.2, 0.8 * (1 - ra * 0.5)); }
      c.globalAlpha = 1; if (CC.Classes && CC.Classes.drawHero) CC.Classes.drawHero(c, p, p.x - cam.x, p.y - cam.y);
    } else { // soul
      var sa = clamp01((t - pl.freeze) / 0.45), hx = p.x - cam.x, hy = p.y - cam.y;
      for (var s = 0; s < 9; s++) { var ph = clamp01(sa * 1.2 - s * 0.05), ang = s * 0.7 + ph * 5, rad = (1 - ph) * 26;
        var mx = ex + (hx - ex) * ph + Math.cos(ang) * rad * (1 - ph), my = ey + (hy - ey) * ph + Math.sin(ang) * rad * (1 - ph);
        c.globalAlpha = 0.9 * (1 - ph * 0.3); c.fillStyle = col; c.beginPath(); c.arc(mx, my, 2.2, 0, 6.2832); c.fill(); }
      c.globalAlpha = 1; if (CC.Classes && CC.Classes.drawHero) CC.Classes.drawHero(c, p, hx, hy);
    }
    c.restore();
  }

  CC.Cine = { crit: crit, tick: tick, draw: draw, active: function () { return !!cine; }, KIND: KIND };
})();
