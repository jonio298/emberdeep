/* CC.Frost - cold on monsters: chilled (slowed, tinted blue) and frozen solid (a block of ice).
 *
 *   chill(e, secs)       slows the monster and tints it blue for 3 seconds
 *   coldProc(e)          any cold damage: a 1 in 4 chance to chill the target
 *   freeze(e, secs)      frozen solid: it cannot move or act, and it is drawn inside a block of ice you can see it through (never bosses)
 *   freezeRoll(e, p)     p (default 1 in 10): maybe freeze the target (Frost Nova and Blizzard)
 *   immune(e)            bosses, mini-bosses and night stalkers cannot be frozen
 * Hooks: CC.Classes.hitEnemy (cold damage), Enemies.update (timers, the shatter) and Enemies.draw (tint and ice block).
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, F = CC.Frost = {}, E = CC.Enemies, PI2 = Math.PI * 2;
  var CHILL_FOR = 3, FREEZE_FOR = 2.4, CHILL_ODDS = 0.25, FREEZE_ODDS = 0.1;
  function alive(e) { return !!e && !e.dead && e.hp > 0; }
  F.immune = function (e) { return !!(e && (e.boss || e.miniBoss || e.nightStalker || e.isDefenseBox)); };
  F.chill = function (e, secs) {
    if (!alive(e)) return false;
    e.chillT = Math.max(e.chillT || 0, secs || CHILL_FOR);
    if (CC.Classes && CC.Classes.status) CC.Classes.status(e, 'slow', secs || CHILL_FOR, Math.min(e.slowT > 0 && e.slowMul ? e.slowMul : 1, F.immune(e) ? 0.8 : 0.6));
    return true;
  };
  F.coldProc = function (e) { if (alive(e) && Math.random() < CHILL_ODDS) F.chill(e, CHILL_FOR); };
  F.freeze = function (e, secs) {
    if (!alive(e) || F.immune(e) || (e.iceT || 0) > 0 || (e.iceLock || 0) > 0) return false;
    secs = secs || FREEZE_FOR;
    e.iceT = e.iceMax = secs; e.iceLock = secs + 3; e.chillT = Math.max(e.chillT || 0, secs); e.iceSeed = Math.random() * 100;
    if (CC.Classes && CC.Classes.status) CC.Classes.status(e, 'stun', secs);
    if (CC.fx) { if (CC.fx.text) CC.fx.text(e.x, e.y - (e.r || 8) - 22, 'FROZEN!', '#c8f0ff', 12); if (CC.fx.burst) CC.fx.burst(e.x, e.y, '#dff8ff', 14, 110); }
    if (CC.Audio && CC.Audio.fx) CC.Audio.fx('crit', { x: e.x, y: e.y, vol: 0.4, gap: 120 });
    return true;
  };
  F.freezeRoll = function (e, p) { return Math.random() < (p === undefined ? FREEZE_ODDS : p) ? F.freeze(e) : false; };
  F.ODDS = { chill: CHILL_ODDS, freeze: FREEZE_ODDS };

  function update(dt) {
    var list = E && E.list; if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var e = list[i]; if (!e) continue;
      if (e.chillT > 0) e.chillT -= dt;
      if (e.iceLock > 0 && !(e.iceT > 0)) e.iceLock -= dt;
      if (e.iceT > 0) {
        e.iceT -= dt;
        if (!e.dead) e.stunT = Math.max(e.stunT || 0, 0.2); // stays frozen solid for as long as the ice lasts
        if (e.iceT <= 0 || e.dead) { // the ice shatters
          e.iceT = 0;
          if (CC.fx && CC.fx.burst) { CC.fx.burst(e.x, e.y - 4, '#e8fbff', 16, 150); CC.fx.burst(e.x, e.y, '#8fd8ff', 10, 110); }
          if (CC.Vfx && CC.Vfx.spawn) CC.Vfx.spawn('iceShatter', e.x, e.y, (e.r || 8) * 1.6, {});
          if (CC.Audio && CC.Audio.fx) CC.Audio.fx('hit', { x: e.x, y: e.y, vol: 0.35, gap: 80 });
        }
      }
    }
  }
  function rr(c, x, y, w, h, r, keep) { if (!keep) c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }

  // a slight blue tint over the body of a chilled monster, with a few cold sparkles
  function drawChill(c, e, sx, sy, t) {
    var r = e.r || 8, a = Math.min(1, e.chillT / 0.6) * 0.34;
    c.save(); c.globalAlpha = a; c.fillStyle = '#5aa8ff';
    c.beginPath(); c.ellipse(sx, sy - r * 0.25, r * 1.15, r * 1.35, 0, 0, PI2); c.fill();
    c.globalAlpha = a * 1.4; c.fillStyle = '#dff6ff';
    for (var k = 0; k < 3; k++) { var ph = (t * 1.3 + k * 0.37 + (e.id || 0) * 0.11) % 1; c.fillRect(sx + Math.sin(k * 2.7 + (e.id || 0)) * r * 0.9, sy - r * 1.2 + ph * r * 1.8, 1.6, 1.6); }
    c.restore();
  }
  // a block of ice: frosted at the edges, clear in the middle so the monster shows through, with facets, glints and cracks
  function drawIce(c, e, sx, sy, t) {
    var r = e.r || 8, w = r * 2.9, h = r * 3.2, x = sx - w / 2, y = sy - r * 1.75, life = e.iceMax ? e.iceT / e.iceMax : 1, melt = life < 0.25 ? life / 0.25 : 1, seed = e.iceSeed || 0, k;
    c.save(); c.globalAlpha = melt;
    c.fillStyle = 'rgba(40,90,140,0.25)'; c.beginPath(); c.ellipse(sx, sy + r * 1.1, w * 0.58, r * 0.45, 0, 0, PI2); c.fill(); // the shadow
    // the frosted frame: the whole block minus a clear window
    c.beginPath(); rr(c, x, y, w, h, r * 0.5, true);
    var wx = x + w * 0.17, wy = y + h * 0.15, ww = w * 0.66, wh = h * 0.7; rr(c, wx, wy, ww, wh, r * 0.4, true);
    var g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(235,252,255,0.80)'); g.addColorStop(0.5, 'rgba(150,210,245,0.62)'); g.addColorStop(1, 'rgba(100,170,225,0.74)');
    c.fillStyle = g; try { c.fill('evenodd'); } catch (err) { c.fill(); }
    // a faint blue wash over the clear middle (the monster stays visible)
    rr(c, wx, wy, ww, wh, r * 0.4); c.fillStyle = 'rgba(160,215,255,0.16)'; c.fill();
    // outline and inner edge
    rr(c, x, y, w, h, r * 0.5); c.lineWidth = 1.8; c.strokeStyle = 'rgba(235,252,255,0.95)'; c.stroke();
    rr(c, wx, wy, ww, wh, r * 0.4); c.lineWidth = 1; c.strokeStyle = 'rgba(220,245,255,0.7)'; c.stroke();
    // facets: bright slanted glints across the frame
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + w * 0.1, y + h * 0.3); c.lineTo(x + w * 0.3, y + h * 0.08); c.moveTo(x + w * 0.74, y + h * 0.92); c.lineTo(x + w * 0.92, y + h * 0.7); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 3.4; c.beginPath(); c.moveTo(x + w * 0.06, y + h * 0.5); c.lineTo(x + w * 0.16, y + h * 0.36); c.stroke();
    // icicles hanging under the block, and frost spikes on the top
    c.fillStyle = 'rgba(210,242,255,0.85)';
    for (k = 0; k < 4; k++) { var ix = x + w * (0.18 + k * 0.22), il = r * (0.45 + 0.3 * Math.abs(Math.sin(seed + k * 1.7))); c.beginPath(); c.moveTo(ix - 2.4, y + h - 1); c.lineTo(ix + 2.4, y + h - 1); c.lineTo(ix + 0.3, y + h + il); c.closePath(); c.fill(); }
    for (k = 0; k < 3; k++) { var tx = x + w * (0.25 + k * 0.25), tl = r * (0.4 + 0.3 * Math.abs(Math.cos(seed + k * 2.3))); c.beginPath(); c.moveTo(tx - 3, y + 1); c.lineTo(tx + 3, y + 1); c.lineTo(tx, y - tl); c.closePath(); c.fill(); }
    // cracks, more of them as the ice runs out
    var cr = life < 0.7 ? Math.ceil((0.7 - life) * 9) : 0; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1;
    for (k = 0; k < cr; k++) { var cx0 = wx + ww * (0.15 + 0.7 * ((k * 0.37 + seed) % 1)), cy0 = wy + wh * (0.1 + 0.8 * ((k * 0.53 + seed * 0.3) % 1)); c.beginPath(); c.moveTo(cx0, cy0); c.lineTo(cx0 + (k % 2 ? 6 : -6), cy0 + 5); c.lineTo(cx0 + (k % 2 ? 3 : -3), cy0 + 11); c.stroke(); }
    // twinkles
    c.fillStyle = '#ffffff';
    for (k = 0; k < 4; k++) { var tw = 0.5 + 0.5 * Math.sin(t * 5 + seed + k * 1.9); if (tw < 0.55) continue; var px = x + w * ((k * 0.29 + seed * 0.1) % 1), py = y + h * ((k * 0.43 + seed * 0.2) % 1); c.globalAlpha = melt * tw; c.fillRect(px - 0.8, py - 3, 1.6, 6); c.fillRect(px - 3, py - 0.8, 6, 1.6); }
    c.restore();
  }
  if (E && E.draw) {
    var prevDraw = E.draw;
    E.draw = function (ctx, cam) {
      var r = prevDraw.apply(this, arguments), list = E.list, t = Date.now() / 1000, i, e;
      if (!cam || !list) return r;
      try {
        for (i = 0; i < list.length; i++) {
          e = list[i]; if (!e || e.dead || e.collapsed || !(e.chillT > 0 || e.iceT > 0)) continue;
          var sx = e.x - cam.x, sy = e.y - cam.y; if (sx < -60 || sy < -60 || sx > (cam.w || 9999) + 60 || sy > (cam.h || 9999) + 60) continue;
          if (e.chillT > 0 && !(e.iceT > 0)) drawChill(ctx, e, sx, sy, t);
          if (e.iceT > 0) drawIce(ctx, e, sx, sy, t);
        }
      } catch (err) { if (root.console) console.error(err); }
      return r;
    };
  }
  if (E && E.update) { var prevUpdate = E.update; E.update = function (dt) { var r = prevUpdate.apply(this, arguments); try { update(dt); } catch (err) { if (root.console) console.error(err); } return r; }; }
  if (CC.Classes && CC.Classes.hitEnemy) { // cold damage from any source: a 1 in 4 chance to chill
    var prevHit = CC.Classes.hitEnemy;
    CC.Classes.hitEnemy = function (e, dmg, type) { var dealt = prevHit.apply(this, arguments); if (type === 'frost' && dealt > 0) F.coldProc(e); return dealt; };
  }
})(typeof window !== 'undefined' ? window : globalThis);
