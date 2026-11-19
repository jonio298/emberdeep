/* CC.Minimap - the corner minimap: a round, framed window that follows the hero and shows the area around them.
 *
 * API: CC.Minimap.draw(ctx, x, y, addHit) draws it with its top-left corner at (x,y) in HUD (screen) space; size/width/height tell the
 *   HUD how much room it takes (the shell puts the bars to its right and the boss bar under it). addHit(x,y,w,h,cb) registers taps:
 *   a tap on the map opens the full map overlay (dungeon only); the two little plates on the rim zoom in and out.
 * Reads whatever CC.Dungeon currently is, so it works in the caves (CC.Dungeon), the Giant Forest, the Rolling Plains and the town:
 *   explored tiles only (fog of war; the small town is always fully shown), tiles out of sight are dimmed, terrain colours follow the
 *   tile kinds. Markers: stairs (pulsing gold diamond, with a rim pointer when off the map), unopened chests (orange), people (green or
 *   gold), enemies that are in sight (red; elites ringed, bosses large and pulsing, ghosts pale), and the hero as a white arrow pointing
 *   the way they walk. A plaque under the frame names the place. The terrain is painted into a small cached canvas a few times a second.
 * Load order: anywhere before main.js; it only uses CC.Dungeon, CC.state, CC.Enemies and CC.UI when they exist.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var T = CC.TILE = CC.TILE || 32;
  var PI2 = Math.PI * 2;
  var SIZE = 104, MARGIN = 6, ZOOMS = [12, 18, 26, 40], zi = 1;
  var M = CC.Minimap = { size: SIZE, margin: MARGIN, width: SIZE + MARGIN * 2, height: SIZE + 14 + MARGIN, zoomIndex: function () { return zi; } };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mk(w, h) { var d = root.document, c = d && d.createElement ? d.createElement('canvas') : null; if (c) { c.width = w; c.height = h; } return c; }

  /* ---------- terrain ---------- */
  var REALM = [[38, 64, 44], [120, 88, 52], [150, 126, 84], [22, 50, 30], [112, 74, 42], [30, 88, 132], [120, 86, 50], [104, 72, 44], [112, 112, 120], [98, 98, 104]]; // realm tile kinds 0..9
  var CAVE_FLOOR = [[96, 112, 90], [112, 106, 98], [82, 106, 126], [130, 94, 82]], CAVE_WALL = [[38, 50, 40], [50, 46, 46], [30, 46, 64], [64, 36, 32]];
  var cache = null;

  function paint(D, p) {
    var W = D.w, H = D.h, k = cache, i, x, y, o;
    if (!k || k.D !== D) {
      var cv = mk(W, H);
      cache = k = { D: D, cv: cv, c: cv && cv.getContext ? cv.getContext('2d') : null, img: null, t: 0 };
      if (k.c && k.c.createImageData) k.img = k.c.createImageData(W, H);
    }
    if (!k.img) return;
    var now = Date.now();
    if (now - k.t < 200) return;
    k.t = now;
    var d = k.img.data, kind = D.realm ? D.kind : null, tiles = D.tiles, ex = D.explored, vis = D.vis, all = D.name === 'Hollowpine Hold';
    var plains = D.name === 'Rolling Plains', forest = D.name === 'Giant Forest', bi = clamp(D.biome | 0, 0, 3);
    var ptx = p ? p.x / T : -999, pty = p ? p.y / T : -999, c, kd, dim, n, dx, dy, solid;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x; o = i * 4;
      if (!all && !(ex && ex[i])) { d[o + 3] = 0; continue; }
      solid = tiles[i];
      if (kind) {
        kd = kind[i];
        c = REALM[kd < 10 ? kd : 0];
        if (kd === 0 && plains) c = [86, 124, 60];
        else if (kd === 6 && forest) c = [66, 52, 44];       // the creepy side trails
        else if (kd === 2 && forest) c = [118, 100, 70];
      } else c = solid ? CAVE_WALL[bi] : CAVE_FLOOR[bi];
      n = ((x * 7 + y * 13) % 5) * 2 - 4;
      dx = x - ptx; dy = y - pty;
      dim = vis ? (vis[i] ? 1 : 0.62) : all ? 0.9 : (dx * dx + dy * dy > 120 ? 0.7 : 1);
      d[o] = clamp((c[0] + n) * dim, 0, 255); d[o + 1] = clamp((c[1] + n) * dim, 0, 255); d[o + 2] = clamp((c[2] + n) * dim, 0, 255); d[o + 3] = 255;
    }
    k.c.putImageData(k.img, 0, 0);
  }

  /* ---------- the frame: painted once into a 2x sprite ---------- */
  var frame;
  function paintFrame(c) {
    var R = SIZE / 2, inner = R - 7, i, g;
    g = c.createRadialGradient(R, R, inner * 0.7, R, R, inner); // soft inner shadow so the edge of the world melts away
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
    c.fillStyle = g; c.beginPath(); c.arc(R, R, inner, 0, PI2); c.fill();
    g = c.createLinearGradient(0, 0, SIZE, SIZE); // bronze ring
    g.addColorStop(0, '#9a7440'); g.addColorStop(0.5, '#4a3018'); g.addColorStop(1, '#7a5a30');
    c.fillStyle = g; c.beginPath(); c.arc(R, R, R - 0.5, 0, PI2); c.arc(R, R, inner, 0, PI2, true); c.fill('evenodd');
    c.strokeStyle = '#1a0e06'; c.lineWidth = 1.2; c.beginPath(); c.arc(R, R, R - 0.8, 0, PI2); c.stroke();
    c.strokeStyle = 'rgba(224,168,74,0.7)'; c.lineWidth = 1; c.beginPath(); c.arc(R, R, inner + 0.5, 0, PI2); c.stroke();
    c.strokeStyle = 'rgba(224,168,74,0.28)'; c.beginPath(); c.arc(R, R, R - 3, 0, PI2); c.stroke();
    c.fillStyle = 'rgba(240,210,150,0.8)'; // cardinal studs
    for (i = 0; i < 4; i++) { var a = i * Math.PI / 2; c.beginPath(); c.arc(R + Math.cos(a) * (R - 3.5), R + Math.sin(a) * (R - 3.5), 1.4, 0, PI2); c.fill(); }
    c.font = 'bold 8px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#12080a'; c.fillText('N', R + 0.6, 3.9); c.fillStyle = '#ff6a5a'; c.fillText('N', R, 3.3);
  }
  function getFrame() {
    if (frame !== undefined) return frame;
    var cv = mk(SIZE * 2, SIZE * 2), c = cv && cv.getContext ? cv.getContext('2d') : null;
    if (!c) return (frame = null);
    c.scale(2, 2); paintFrame(c);
    return (frame = cv);
  }

  /* ---------- drawing ---------- */
  var lastD = null, lx = 0, ly = 0, face = -Math.PI / 2;
  function facing(D, p) { // the way the hero is walking; keeps the last heading while standing still
    if (D !== lastD) { lastD = D; lx = p.x; ly = p.y; face = -Math.PI / 2; }
    var dx = p.x - lx, dy = p.y - ly;
    if (Math.hypot(dx, dy) > 0.4) { var a = Math.atan2(dy, dx), diff = Math.atan2(Math.sin(a - face), Math.cos(a - face)); face += diff * 0.35; }
    lx = p.x; ly = p.y;
    return face;
  }
  function plate(ctx, x, y, text) { // a small rim button
    ctx.fillStyle = 'rgba(16,10,20,0.9)'; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, PI2); ctx.fill();
    ctx.lineWidth = 1.3; ctx.strokeStyle = '#8a6a3a'; ctx.stroke();
    ctx.fillStyle = '#f0dcb0'; ctx.fillRect(x - 3, y - 0.6, 6, 1.4); if (text === '+') ctx.fillRect(x - 0.7, y - 3, 1.4, 6);
  }

  M.draw = function (ctx, x, y, addHit) {
    var D = CC.Dungeon, s = CC.state, p = s && s.player;
    if (!D || !D.w || !D.tiles || !p) return;
    var R = SIZE / 2, cx = x + R, cy = y + R, inner = R - 7, sc = inner / ZOOMS[zi], now = Date.now() / 1000, W = D.w, i, a;
    var ex = D.explored, all = D.name === 'Hollowpine Hold';
    paint(D, p);
    var ang = facing(D, p), ptx = p.x / T, pty = p.y / T;
    function sx(wx) { return cx + (wx / T - ptx) * sc; }
    function sy(wy) { return cy + (wy / T - pty) * sc; }
    function seen(tx, ty) { return all || (ex && tx >= 0 && ty >= 0 && tx < W && ty < D.h && ex[ty * W + tx]); }
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, inner, 0, PI2); ctx.fillStyle = '#070912'; ctx.fill();
    ctx.save(); ctx.clip();
    if (cache && cache.cv && cache.D === D) { // terrain, centred on the hero
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-ptx, -pty); ctx.drawImage(cache.cv, 0, 0); ctx.restore();
    }
    var near = ZOOMS[zi] * 1.15, k, e, pr, st = D.stairs, pulse = 0.5 + 0.5 * Math.sin(now * 4);
    if (st && st.x > -900 && seen(st.tx, st.ty)) { // stairs: pulsing gold diamond with a glow
      var gx = sx(st.x), gy = sy(st.y), gr = 4 + pulse * 1.5;
      ctx.fillStyle = 'rgba(255,210,74,' + (0.18 + 0.12 * pulse) + ')'; ctx.beginPath(); ctx.arc(gx, gy, gr + 2, 0, PI2); ctx.fill();
      ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#3a2408'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, gy - gr); ctx.lineTo(gx + gr, gy); ctx.lineTo(gx, gy + gr); ctx.lineTo(gx - gr, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    for (k = 0; D.chests && k < D.chests.length; k++) { // unopened chests
      var ch = D.chests[k];
      if (ch.opened || !seen(ch.tx, ch.ty) || Math.abs(ch.x - p.x) / T > near || Math.abs(ch.y - p.y) / T > near) continue;
      ctx.fillStyle = '#2a1608'; ctx.fillRect(sx(ch.x) - 3, sy(ch.y) - 3, 6, 6);
      ctx.fillStyle = '#ffb02a'; ctx.fillRect(sx(ch.x) - 2, sy(ch.y) - 2, 4, 4); ctx.fillStyle = '#fff2b0'; ctx.fillRect(sx(ch.x) - 1, sy(ch.y) - 2, 2, 1);
    }
    for (k = 0; D.npcs && k < D.npcs.length; k++) { // people: shopkeepers gold, others green
      pr = D.npcs[k];
      if (!seen(Math.floor(pr.x / T), Math.floor(pr.y / T)) || Math.abs(pr.x - p.x) / T > near || Math.abs(pr.y - p.y) / T > near) continue;
      ctx.fillStyle = '#0a1a0c'; ctx.beginPath(); ctx.arc(sx(pr.x), sy(pr.y), 3, 0, PI2); ctx.fill();
      ctx.fillStyle = pr.shop ? '#ffd24a' : pr.guard ? '#9ab0ff' : '#6aff8a'; ctx.beginPath(); ctx.arc(sx(pr.x), sy(pr.y), 2, 0, PI2); ctx.fill();
    }
    var E = CC.Enemies, list = E && E.list;
    for (k = 0; list && k < list.length; k++) { // enemies in sight
      e = list[k];
      if (e.dead || e.hidden || Math.abs(e.x - p.x) / T > near || Math.abs(e.y - p.y) / T > near) continue;
      if (D.isVisible && !D.isVisible(e.x, e.y)) continue;
      var ex2 = sx(e.x), ey2 = sy(e.y), rad = e.boss ? 4.2 : e.elite ? 2.8 : 2;
      ctx.globalAlpha = e.asleep ? 0.65 : 1;
      if (e.boss) { ctx.fillStyle = 'rgba(255,40,40,' + (0.2 + 0.2 * pulse) + ')'; ctx.beginPath(); ctx.arc(ex2, ey2, rad + 3, 0, PI2); ctx.fill(); }
      ctx.fillStyle = '#1a0406'; ctx.beginPath(); ctx.arc(ex2, ey2, rad + 1, 0, PI2); ctx.fill();
      ctx.fillStyle = e.ghost ? '#a8e0ff' : e.boss ? '#ff3030' : '#ff4a3a'; ctx.beginPath(); ctx.arc(ex2, ey2, rad, 0, PI2); ctx.fill();
      if (e.elite && !e.boss) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ex2, ey2, rad + 1.2, 0, PI2); ctx.stroke(); }
      if (e.boss) { ctx.fillStyle = '#fff'; ctx.fillRect(ex2 - 1.5, ey2 - 1, 1, 1.4); ctx.fillRect(ex2 + 0.5, ey2 - 1, 1, 1.4); }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(cx, cy, 6.5, 0, PI2); ctx.fill(); // the hero: a white arrow
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#10141c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(5.5, 0); ctx.lineTo(-3.6, 3.6); ctx.lineTo(-1.6, 0); ctx.lineTo(-3.6, -3.6); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
    if (st && st.x > -900 && seen(st.tx, st.ty)) { // stairs off the map: a pointer on the rim
      var ddx = (st.x - p.x) / T * sc, ddy = (st.y - p.y) / T * sc;
      if (Math.hypot(ddx, ddy) > inner - 2) {
        a = Math.atan2(ddy, ddx); ctx.save(); ctx.translate(cx + Math.cos(a) * (inner - 4), cy + Math.sin(a) * (inner - 4)); ctx.rotate(a);
        ctx.fillStyle = 'rgba(255,210,74,' + (0.7 + 0.3 * pulse) + ')'; ctx.strokeStyle = '#3a2408'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-3, 3.4); ctx.lineTo(-3, -3.4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore(); // end clip
    var fr = getFrame();
    if (fr) ctx.drawImage(fr, x, y, SIZE, SIZE); else { ctx.lineWidth = 5; ctx.strokeStyle = '#6a4a28'; ctx.beginPath(); ctx.arc(cx, cy, inner + 2.5, 0, PI2); ctx.stroke(); }
    plate(ctx, cx - R * 0.71, cy + R * 0.71, '-'); plate(ctx, cx + R * 0.71, cy + R * 0.71, '+'); // zoom plates
    var name = D.realm ? (D.name || 'Realm') : (D.biomeName || 'Caves') + (s.floor ? '  F' + s.floor : '');
    ctx.font = 'bold 9px Georgia, "Palatino Linotype", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var pw = Math.min(SIZE + 8, ctx.measureText(name).width + 18), py = y + SIZE - 1; // a name plaque hangs from the bottom of the frame
    ctx.fillStyle = 'rgba(16,10,20,0.92)'; ctx.fillRect(cx - pw / 2, py - 2, pw, 15); ctx.lineWidth = 1.3; ctx.strokeStyle = '#8a6a3a'; ctx.strokeRect(cx - pw / 2 + 0.5, py - 1.5, pw - 1, 14);
    ctx.fillStyle = 'rgba(224,168,74,0.3)'; ctx.fillRect(cx - pw / 2 + 2, py, pw - 4, 1);
    ctx.fillStyle = '#12080a'; ctx.fillText(name, cx + 0.6, py + 6.6); ctx.fillStyle = '#f0dcb0'; ctx.fillText(name, cx, py + 6);
    ctx.restore();
    if (addHit) {
      addHit(x, y, SIZE, SIZE, function () { if (s.mode === 'dungeon' && CC.UI && CC.UI.toggle) CC.UI.toggle('map'); }); // tap the map for the full map
      addHit(cx - R * 0.71 - 9, cy + R * 0.71 - 9, 18, 18, function () { zi = Math.min(ZOOMS.length - 1, zi + 1); }); // '-' zooms out (wider view); registered last, so these win the tap
      addHit(cx + R * 0.71 - 9, cy + R * 0.71 - 9, 18, 18, function () { zi = Math.max(0, zi - 1); }); // '+' zooms in
    }
  };

})(window);
