/* bossarrows.js - a purple, stylised arrow beside the hero pointing at every ACTIVATED special monster that is off screen: the Patchwork Horror, the Grinning Mask,
 * mini-bosses and bosses. CC.BossArrows.draw(ctx, cam) runs in world space (the same context the quest arrow uses). */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, TAU = Math.PI * 2, SPECIAL = { grinmask: 1, weaselDemon: 1 };
  function special(e) { return e && !e.dead && e.hp > 0 && !e.asleep && !e.hidden && !e.nightStalker && (e.boss || e.miniBoss || e.stitched || SPECIAL[e.type]); }
  function arrow(c, x, y, a, len, pulse) {
    c.save(); c.translate(x, y); c.rotate(a);
    var g = c.createLinearGradient(-len * 0.5, 0, len * 0.6, 0); g.addColorStop(0, '#4a1f8a'); g.addColorStop(0.55, '#9a55f0'); g.addColorStop(1, '#d9b0ff');
    c.shadowColor = 'rgba(170,90,255,0.95)'; c.shadowBlur = 9 + 5 * pulse;
    c.beginPath(); // a broad, notched arrow: tail fins, a tapering shaft, a barbed head
    c.moveTo(len * 0.62, 0); c.lineTo(len * 0.12, -len * 0.34); c.lineTo(len * 0.2, -len * 0.11); c.lineTo(-len * 0.36, -len * 0.11); c.lineTo(-len * 0.52, -len * 0.26); c.lineTo(-len * 0.4, 0);
    c.lineTo(-len * 0.52, len * 0.26); c.lineTo(-len * 0.36, len * 0.11); c.lineTo(len * 0.2, len * 0.11); c.lineTo(len * 0.12, len * 0.34); c.closePath();
    c.fillStyle = g; c.fill(); c.shadowBlur = 0;
    c.lineJoin = 'round'; c.lineWidth = 1.6; c.strokeStyle = 'rgba(236,214,255,0.95)'; c.stroke();
    c.strokeStyle = 'rgba(40,12,80,0.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-len * 0.3, 0); c.lineTo(len * 0.5, 0); c.stroke(); // a dark spine down the middle
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.moveTo(len * 0.5, -0.5); c.lineTo(len * 0.2, -len * 0.2); c.lineTo(len * 0.22, -len * 0.06); c.closePath(); c.fill(); // a glint on the head
    c.restore();
  }
  function draw(c, cam) {
    var s = CC.state, p = s && s.player, E = CC.Enemies; if (!s || s.mode !== 'dungeon' || !p || p.hp <= 0 || !E || !E.list) return;
    var list = E.list, near = [], i, t = (E._time || Date.now() / 1000);
    for (i = 0; i < list.length; i++) {
      var e = list[i]; if (!special(e)) continue;
      if (e.x > cam.x - 8 && e.x < cam.x + cam.w + 8 && e.y > cam.y - 8 && e.y < cam.y + cam.h + 8) continue; // already on screen
      near.push({ e: e, a: Math.atan2(e.y - p.y, e.x - p.x), d: Math.hypot(e.x - p.x, e.y - p.y) });
    }
    if (!near.length) return;
    near.sort(function (a, b) { return a.d - b.d; });
    var px = p.x - cam.x, py = p.y - (p.r || 8) - cam.y + 4, used = [];
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 8px Georgia, serif';
    for (i = 0; i < near.length && i < 4; i++) {
      var n = near[i], ring = 38, k;
      for (k = 0; k < used.length; k++) if (Math.abs(Math.atan2(Math.sin(n.a - used[k].a), Math.cos(n.a - used[k].a))) < 0.4) ring = Math.max(ring, used[k].ring + 17);
      used.push({ a: n.a, ring: ring });
      var bob = Math.sin(t * 5 + i) * 1.6, ax = px + Math.cos(n.a) * (ring + bob), ay = py + Math.sin(n.a) * (ring + bob) * 0.9;
      arrow(c, ax, ay, n.a, 21, 0.5 + 0.5 * Math.sin(t * 6));
      var nm = String(n.e.name || (CC.Enemies.TYPES[n.e.type] && CC.Enemies.TYPES[n.e.type].name) || '').replace(/^The /, '');
      if (nm) { var lx = ax + Math.cos(n.a) * 2, ly = ay + (Math.sin(n.a) >= 0 ? 15 : -15); c.lineWidth = 3; c.strokeStyle = 'rgba(20,6,40,0.9)'; c.strokeText(nm.toUpperCase(), lx, ly); c.fillStyle = '#e4ccff'; c.fillText(nm.toUpperCase(), lx, ly); }
    }
    c.restore();
  }
  CC.BossArrows = { draw: draw, special: special };
})(window);
