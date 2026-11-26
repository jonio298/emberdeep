/* perfectwarp.js - a PERFECT basic shot (wizard orb / necromancer shard).
 *  - the shot itself is a golden, swirling projectile fired straight from the player: a bright core with turning spiral arms, a twin-helix comet tail
 *    and golden lights circling it (drawShot, called from classes.js in place of the normal projectile art, in world space)
 *  - while it flies the area dims, with a soft clear pool of light round the shot; the dark fades away after it lands (drawScreen)
 *  - where it lands there is a big animated golden explosion: flash, shock rings, radiant rays, spiralling sparks, rising embers.
 *    The explosion always plays, whether or not the hit kills (a perfect KILL keeps its own cutscene on top of this).
 * CC.PerfectWarp.fire(projectile) when it leaves the staff, .land(projectile, target) when it ends, .drawShot(ctx, proj, cam),
 * .drawScreen(ctx, W, H, camX, camY, zoom) after the world (screen space), .clear(). */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, fxs = [], TAU = Math.PI * 2, LAND = 1.0, FADE = 0.7, last = 0;
  var GOLD = '255,208,72', PALE = '255,246,210', DEEP = '255,150,30';
  function now() { return (root.performance && performance.now ? performance.now() : Date.now()) / 1000; }
  function fire(pr) {
    if (!pr) return;
    fxs.push({ pr: pr, x: pr.x, y: pr.y, t: 0, landed: false, lt: 0, seed: Math.random() * 100 });
    if (fxs.length > 4) fxs.shift();
    if (CC.fx && CC.fx.burst) CC.fx.burst(pr.x, pr.y, '#ffd34a', 10, 90); // a flare at the staff
  }
  function land(pr, target) {
    for (var i = 0; i < fxs.length; i++) {
      var f = fxs[i];
      if (f.pr !== pr || f.landed) continue;
      f.landed = true; f.lt = 0; f.x = pr.x; f.y = pr.y;
      if (target && isFinite(target.x) && isFinite(target.y)) { // explode ON the foe: centred on its body and following it
        f.target = target; f.ox = 0; f.oy = -(target.r || 8) * 0.35; f.x = target.x; f.y = target.y + f.oy;
      }
      if (CC.fx) { if (CC.fx.shake) CC.fx.shake(6); if (CC.fx.burst) CC.fx.burst(f.x, f.y, '#ffd34a', 26, 160); }
      if (CC.Audio && CC.Audio.event) CC.Audio.event('explosion', { x: f.x, y: f.y });
      return;
    }
  }
  function clear() { fxs.length = 0; }

  /* ---------- the projectile, in world space ---------- */
  function glow(c, x, y, r, a, rgb) {
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(0.45, 'rgba(' + rgb + ',' + a * 0.45 + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  function drawShot(c, s, cam) {
    var x = s.x - cam.x, y = s.y - cam.y, t = now(), r = Math.max(5, s.r || 6), a = typeof s.a === 'number' ? s.a : 0, bx = -Math.cos(a), by = -Math.sin(a), nx = -by, ny = bx, k, j;
    c.save();
    c.globalCompositeOperation = 'lighter';
    glow(c, x, y, r * 6.5, 0.5 + 0.12 * Math.sin(t * 18), DEEP); // the wide golden halo
    // twin-helix comet tail: two strands winding round the line of flight
    for (j = 0; j < 2; j++) {
      c.beginPath();
      for (k = 0; k <= 16; k++) {
        var back = k * 4.2, w = Math.sin(t * 16 - k * 0.62 + j * Math.PI) * r * 0.95 * (1 - k / 18), px = x + bx * back + nx * w, py = y + by * back + ny * w - 2;
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.strokeStyle = 'rgba(' + (j ? PALE : GOLD) + ',0.7)'; c.lineWidth = 2.2; c.lineCap = 'round'; c.stroke();
    }
    for (k = 1; k <= 7; k++) glow(c, x + bx * k * 5, y + by * k * 5 - 2, r * (1.7 - k * 0.15), 0.28 * (1 - k / 8), GOLD); // soft tail body
    // the swirling core: three spiral arms turning round a white-hot centre
    glow(c, x, y - 2, r * 2.6, 0.95, GOLD);
    for (k = 0; k < 3; k++) {
      c.beginPath();
      for (j = 0; j <= 12; j++) {
        var u = j / 12, ang = t * 9 + k * TAU / 3 + u * 2.6, rad = r * (0.25 + u * 1.5);
        if (j === 0) c.moveTo(x + Math.cos(ang) * rad, y - 2 + Math.sin(ang) * rad * 0.9); else c.lineTo(x + Math.cos(ang) * rad, y - 2 + Math.sin(ang) * rad * 0.9);
      }
      c.strokeStyle = 'rgba(' + PALE + ',0.85)'; c.lineWidth = 1.7; c.stroke();
    }
    c.fillStyle = 'rgb(255,252,232)'; c.beginPath(); c.arc(x, y - 2, r * 0.55, 0, TAU); c.fill();
    // golden lights circling the shot, each dragging a short bright arc
    for (k = 0; k < 6; k++) {
      var oa = t * 5.5 + k * TAU / 6, orad = r * (2.3 + 0.5 * Math.sin(t * 3 + k * 1.7)), ox = x + Math.cos(oa) * orad, oy = y - 2 + Math.sin(oa) * orad * 0.72;
      c.beginPath(); c.arc(x, y - 2, orad, oa - 0.7, oa); // the trailing arc (drawn as a circle segment, squashed below)
      c.save(); c.translate(x, y - 2); c.scale(1, 0.72); c.translate(-x, -(y - 2));
      c.beginPath(); c.arc(x, y - 2, orad, oa - 0.7, oa); c.strokeStyle = 'rgba(' + GOLD + ',0.55)'; c.lineWidth = 1.4; c.stroke(); c.restore();
      glow(c, ox, oy, 4.5, 0.95, PALE);
    }
    c.restore();
  }

  /* ---------- the dim, and the explosion, in screen space ---------- */
  function explosion(c, sx, sy, zoom, lt, seed) {
    var p = lt / LAND, e = 1 - Math.pow(1 - Math.min(1, p * 1.6), 3), i, R = 78 * zoom;
    c.save(); c.globalCompositeOperation = 'lighter';
    if (lt < 0.2) glow(c, sx, sy, R * (0.7 + lt * 4), 1 - lt / 0.2, '255,252,236'); // the white-gold flash
    glow(c, sx, sy, R * (0.6 + 0.9 * e), 0.55 * (1 - p), GOLD);
    for (i = 0; i < 2; i++) { // shock rings
      var rp = Math.max(0, Math.min(1, p * 1.5 - i * 0.18)); if (rp <= 0 || rp >= 1) continue;
      var rr = R * 1.5 * (1 - Math.pow(1 - rp, 3)) + 6 * zoom;
      c.strokeStyle = 'rgba(' + (i ? PALE : GOLD) + ',' + 0.85 * (1 - rp) + ')'; c.lineWidth = (4 - i * 1.6) * (1 - rp) * zoom + 1; c.beginPath(); c.ellipse(sx, sy, rr, rr * 0.78, 0, 0, TAU); c.stroke();
    }
    for (i = 0; i < 16; i++) { // radiant rays, slowly turning
      var ang = i * TAU / 16 + seed + p * 0.9, len = R * (0.4 + (i % 3) * 0.28) * (0.3 + e) * (1 - p * 0.5), w = (i % 2 ? 2.2 : 3.4) * zoom * (1 - p);
      var ca = Math.cos(ang), sa = Math.sin(ang), g = c.createLinearGradient(sx, sy, sx + ca * len, sy + sa * len * 0.78);
      g.addColorStop(0, 'rgba(' + PALE + ',' + 0.9 * (1 - p) + ')'); g.addColorStop(1, 'rgba(' + GOLD + ',0)');
      c.strokeStyle = g; c.lineWidth = Math.max(0.6, w); c.beginPath(); c.moveTo(sx + ca * 8 * zoom, sy + sa * 8 * zoom * 0.78); c.lineTo(sx + ca * len, sy + sa * len * 0.78); c.stroke();
    }
    for (i = 0; i < 36; i++) { // sparks spiralling outwards
      var q = (i * 0.6180339 + seed) % 1, delay = q * 0.25, sp = Math.max(0, Math.min(1, (p - delay) / (1 - delay))); if (sp <= 0) continue;
      var dist = R * (0.25 + q * 1.1) * (1 - Math.pow(1 - sp, 2)), sang = i * 2.399 + sp * (2.2 + q * 2.5), px = sx + Math.cos(sang) * dist, py = sy + Math.sin(sang) * dist * 0.78 - sp * 12 * zoom * q;
      glow(c, px, py, (2.2 + q * 3) * zoom, 0.9 * (1 - sp), q > 0.6 ? PALE : GOLD);
    }
    c.restore();
  }
  function drawScreen(ctx, W, H, cx, cy, zoom) {
    var tn = now(), dt = Math.min(0.1, tn - last || 0), i; last = tn;
    if (!fxs.length) return;
    for (i = fxs.length - 1; i >= 0; i--) {
      var f = fxs[i], inflight = !f.landed;
      f.t += dt;
      if (inflight && f.pr && f.pr.life > 0 && !f.pr.dead) { f.x = f.pr.x; f.y = f.pr.y; }
      if (f.landed) { f.lt += dt; if (f.target && isFinite(f.target.x) && isFinite(f.target.y)) { f.x = f.target.x; f.y = f.target.y + f.oy; } }
      if ((f.landed && f.lt >= Math.max(LAND, FADE)) || (inflight && f.t > 4)) { fxs.splice(i, 1); continue; }
      var sx = (f.x - cx) * zoom, sy = (f.y - cy) * zoom;
      var dark = inflight ? Math.min(1, f.t / 0.15) : Math.max(0, 1 - f.lt / FADE); // dims quickly, lingers while the shot flies, then lifts
      dark = dark * dark * (3 - 2 * dark);
      if (dark > 0.01) {
        ctx.save();
        var dg = ctx.createRadialGradient(sx, sy, 14 * zoom, sx, sy, Math.max(W, H) * 0.7); // a gentle dim with a pool of clear light round the shot
        dg.addColorStop(0, 'rgba(10,6,2,0)'); dg.addColorStop(0.3, 'rgba(10,6,2,' + 0.22 * dark + ')'); dg.addColorStop(1, 'rgba(8,4,2,' + 0.5 * dark + ')');
        ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter'; glow(ctx, sx, sy, 90 * zoom, 0.16 * dark, GOLD); // golden light pooled on the ground
        ctx.restore();
      }
      if (f.landed) explosion(ctx, sx, sy, zoom, f.lt, f.seed);
    }
  }
  CC.PerfectWarp = { fire: fire, land: land, drawShot: drawShot, drawScreen: drawScreen, clear: clear, active: function () { return fxs.length > 0; } };
})(window);
