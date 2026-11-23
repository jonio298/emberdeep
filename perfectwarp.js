/* perfectwarp.js - the moment a PERFECT basic shot (wizard orb / necromancer shard) is fired:
 * the world bends round a glowing golden orb (a lens that magnifies the picture, plus a refracting shock ring), and the rest of the screen drops to dark
 * and fades quickly back in. Drawn in screen space after the world: CC.PerfectWarp.fire(projectile), CC.PerfectWarp.drawScreen(ctx,W,H,camX,camY,zoom). */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, fxs = [], TAU = Math.PI * 2, LEN = 0.85, last = 0;
  function now() { return (root.performance && performance.now ? performance.now() : Date.now()) / 1000; }
  function fire(pr) { if (!pr) return; fxs.push({ pr: pr, x: pr.x, y: pr.y, t: 0 }); if (fxs.length > 3) fxs.shift(); }
  function clear() { fxs.length = 0; }
  function drawScreen(ctx, W, H, cx, cy, zoom) {
    var tn = now(), dt = Math.min(0.1, tn - last || 0); last = tn;
    if (!fxs.length) return;
    var cv = ctx.canvas, i, k;
    for (i = fxs.length - 1; i >= 0; i--) {
      var f = fxs[i]; f.t += dt;
      if (f.t >= LEN) { fxs.splice(i, 1); continue; }
      if (f.pr && f.pr.life > 0 && !f.pr.dead) { f.x = f.pr.x; f.y = f.pr.y; }
      var sx = (f.x - cx) * zoom, sy = (f.y - cy) * zoom, p = f.t / LEN;
      var dark = f.t < 0.09 ? f.t / 0.09 : Math.pow(1 - (f.t - 0.09) / (LEN - 0.09), 1.6); // down fast, back up smoothly
      var R = (30 + 22 * Math.min(1, f.t / 0.25)) * zoom, mag = 1 + 0.75 * dark;
      ctx.save();
      // the darkness, with a clear hole round the orb
      var dg = ctx.createRadialGradient(sx, sy, R * 0.6, sx, sy, Math.max(W, H) * 0.75);
      dg.addColorStop(0, 'rgba(4,2,10,0)'); dg.addColorStop(0.35, 'rgba(4,2,10,' + 0.55 * dark + ')'); dg.addColorStop(1, 'rgba(4,2,10,' + 0.86 * dark + ')');
      ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);
      // the lens: the picture round the orb is pulled in and magnified
      var dpr = cv.width / W;
      if (dark > 0.05) {
        ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, R, 0, TAU); ctx.clip();
        var sr = R / mag; try { ctx.drawImage(cv, (sx - sr) * dpr, (sy - sr) * dpr, sr * 2 * dpr, sr * 2 * dpr, sx - R, sy - R, R * 2, R * 2); } catch (e) { /* tainted or empty: skip the lens */ }
        ctx.restore();
      }
      // a refracting ring runs outwards: a thin band of the picture, stretched
      var rr = R * 0.9 + p * Math.max(W, H) * 0.55, bw = 18 + 22 * (1 - p);
      if (rr < Math.max(W, H)) {
        ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, rr + bw, 0, TAU); ctx.arc(sx, sy, rr, 0, TAU, true); ctx.clip('evenodd');
        var sc = 1.1 + 0.1 * (1 - p), cw = W / sc, ch = H / sc;
        try { ctx.drawImage(cv, (sx - (sx) / sc) * dpr, (sy - (sy) / sc) * dpr, cw * dpr, ch * dpr, 0, 0, W, H); } catch (e) { /* skip */ }
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,214,90,' + 0.7 * (1 - p) + ')'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(sx, sy, rr + bw * 0.5, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,245,200,' + 0.45 * (1 - p) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, rr, 0, TAU); ctx.stroke();
      }
      // the golden orb and its light
      ctx.globalCompositeOperation = 'lighter';
      var gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 1.1), a = 0.35 + 0.65 * dark;
      gl.addColorStop(0, 'rgba(255,250,215,' + a + ')'); gl.addColorStop(0.25, 'rgba(255,214,80,' + 0.7 * a + ')'); gl.addColorStop(1, 'rgba(255,160,30,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(sx, sy, R * 1.1, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,140,' + 0.6 * dark + ')'; ctx.lineWidth = 1.5;
      for (k = 0; k < 3; k++) { var ra = R * (0.45 + 0.22 * k) * (1 + 0.06 * Math.sin(f.t * 30 + k)); ctx.beginPath(); ctx.ellipse(sx, sy, ra, ra * (0.8 - 0.1 * k), f.t * (2 + k), 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
  }
  CC.PerfectWarp = { fire: fire, drawScreen: drawScreen, clear: clear, active: function () { return fxs.length > 0; } };
})(window);
