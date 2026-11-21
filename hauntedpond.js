/* CC.HauntedPond - the haunted pond of the Rolling Plains.
 *
 * From the shore it is a lovely pond: lilies and lotus, flowers, blossoming trees, and a beautiful woman standing on a little island in the
 * middle, reached by a wooden bridge. Every step along the bridge turns it a little more nightmarish (the hero's progress sets `h`, 0..1):
 * the light dims, fog swirls in, the grass browns and dead blades grow red eyes, the trees blacken, grow eyes and a mouth, the water goes dark,
 * and the bridge rots plank by plank. The woman never changes - until you speak to her. Then she turns and the Mere Horror rises: a hard fight.
 *
 *   carve(g)         called by plains.js while building the map: carves the pond, island, bridge, ringed trees and the woman. Returns the pond data.
 *   ground / detail / tree / after   hooks called from plains.js (terrain colour, tile art, tree art, light-pass overlays: dark, fog, glowing eyes)
 *   talk(pr)         the woman's line; starts the transformation
 *   update(dt)       through CC.Enemies.update: progress, transformation, boss bar, victory
 * The Mere Horror (type merehorror) has its own brain and art below. Victory is saved with the quest (EggQuest serialize/restore: `pond`).
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, T = CC.TILE || 32, TAU = Math.PI * 2, HP = CC.HauntedPond = { done: false };
  var E = CC.Enemies, F = CC.Forest;
  function R() { return Math.random(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sm(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function hash(x, y) { var n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function mix(a, b, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; }
  function css(a) { return 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')'; }
  function parse(c) {
    if (c.charAt(0) === '#') { var n = parseInt(c.substr(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    var m = c.match(/\d+/g); return m ? [+m[0], +m[1], +m[2]] : [60, 100, 50];
  }
  function hero() { var s = CC.state; return s && s.player && !s.player.stub ? s.player : null; }
  function pond() { var P = CC.Plains, m = P && P.map; return m && m.pond && CC.Dungeon === m ? m.pond : null; }
  function fxText(x, y, s, c, z) { if (CC.fx && CC.fx.text) CC.fx.text(x, y, s, c, z); }
  HP.isDone = function () { return !!HP.done; };
  HP.setDone = function (v) { HP.done = !!v; };

  /* ---------- map generation (called from plains.js build) ---------- */
  HP.carve = function (g) {
    var W = g.W, H = g.H, at = g.at, rng = g.rng, samples = g.samples, RX = 44, RY = 27, RI = 7, best = null, s, x, y, k;
    for (s = 0; s < 400 && !best; s++) { // a vast pond anywhere the plains have room, with the bridge along its long axis; a path joins its foot to the nearest bit of road
      var cx = RX + 6 + Math.floor(rng() * (W - 2 * RX - 13)), cy = RY + 8 + Math.floor(rng() * (H - 2 * RY - 20)), dx0 = rng() < 0.5 ? -1 : 1, fx = cx + dx0 * (RX + 1), sp = null, bd = 1e9, ok = true;
      for (k = 0; k < samples.length; k += 2) { var dd = Math.abs(samples[k].x - fx) + Math.abs(samples[k].y - cy); if (dd < bd) { bd = dd; sp = samples[k]; } }
      if (!sp || bd > 70) continue;
      for (y = cy - RY - 3; ok && y <= cy + RY + 3; y++) for (x = cx - RX - 3; x <= cx + RX + 3; x++) { var nx = (x - cx) / (RX + 3), ny = (y - cy) / (RY + 3); if (nx * nx + ny * ny <= 1 && g.res[at(x, y)]) { ok = false; break; } }
      if (ok) best = { cx: cx, cy: cy, sp: sp, dirx: dx0 };
    }
    if (!best) return null;
    var cx0 = best.cx, cy0 = best.cy, dirx = best.dirx, kind = g.kind, tiles = g.tiles, art = g.art;
    for (y = cy0 - RY - 1; y <= cy0 + RY + 1; y++) for (x = cx0 - RX - 1; x <= cx0 + RX + 1; x++) {
      var ex = (x - cx0) / RX, ey = (y - cy0) / RY;
      if (ex * ex + ey * ey <= 1) { kind[at(x, y)] = 5; tiles[at(x, y)] = 1; art[at(x, y)] = 0; }
      if (ex * ex + ey * ey <= 1.12) g.res[at(x, y)] = 1;
    }
    g.disc(cx0, cy0, RI, function (xx, yy) { kind[at(xx, yy)] = 0; tiles[at(xx, yy)] = 0; });
    var bx0 = cx0 + dirx * (RI - 1), bx1 = cx0 + dirx * (RX + 1);
    for (k = 0; k <= 1; k += 0.5 / Math.abs(bx1 - bx0)) g.disc(bx0 + (bx1 - bx0) * k, cy0, 1.2, function (xx, yy) { if (kind[at(xx, yy)] === 5) { kind[at(xx, yy)] = 6; tiles[at(xx, yy)] = 0; } });
    // the way in from the road: a path from the bridge's foot to the road
    var px0 = Math.round(bx1), spx = Math.round(best.sp.x), spy = Math.round(best.sp.y), stepx = Math.sign(spx - px0) || 1, stepy = Math.sign(spy - cy0) || 1;
    function pathAt(xx, yy) { g.disc(xx, yy, 1.3, function (ax, ay) { if (kind[at(ax, ay)] !== 5 && kind[at(ax, ay)] !== 6) { kind[at(ax, ay)] = 2; tiles[at(ax, ay)] = 0; } }); g.reserve(xx, yy, 2.5); }
    for (x = px0; x !== spx + stepx; x += stepx) pathAt(x, cy0);
    for (y = cy0; y !== spy + stepy; y += stepy) pathAt(spx, y);
    // a thick ring of blossom trees around the shore (leaving the bridge's side open), and a ring of them on the island
    var trees = [], treeSet = {}, islandTrees = [], tries = 0;
    function addTree(tx, ty, isl) {
      if (tx < 3 || ty < 3 || tx >= W - 3 || ty >= H - 3 || kind[at(tx, ty)] !== 0 || tiles[at(tx, ty)]) return false;
      for (var q = 0; q < trees.length; q++) if (!trees[q].island && Math.abs(trees[q].tx - tx) < 2 && Math.abs(trees[q].ty - ty) < 2) return false;
      kind[at(tx, ty)] = 3; tiles[at(tx, ty)] = 1; art[at(tx, ty)] = 0; treeSet[at(tx, ty)] = 1; var o = { tx: tx, ty: ty, island: !!isl }; trees.push(o); if (isl) islandTrees.push(o); return true;
    }
    while (trees.length < 120 && tries++ < 1400) {
      var a = rng() * TAU, ca = Math.cos(a), sa = Math.sin(a), tx = Math.round(cx0 + ca * (RX + 1.5 + rng() * 6)), ty = Math.round(cy0 + sa * (RY + 1.5 + rng() * 6));
      if (ca * dirx > 0 && Math.abs(ty - cy0) < 4) continue; // keep the bridge's approach clear
      if (Math.abs(tx - spx) < 3 && Math.abs(ty - cy0) < Math.abs(spy - cy0) + 3) continue;
      addTree(tx, ty, false);
    }
    for (k = 0; k < 10; k++) { var ia = k / 10 * TAU + 0.3; if (Math.cos(ia) * dirx > 0.7) continue; addTree(Math.round(cx0 + Math.cos(ia) * (RI - 1.8)), Math.round(cy0 + Math.sin(ia) * (RI - 1.8)), true); }
    var pd = { cx: cx0, cy: cy0, R: RX, ry: RY, ri: RI, x: cx0 * T + 16, y: cy0 * T + 16, dirx: dirx, W: W, trees: trees, islandTrees: islandTrees, treeSet: treeSet, stage: HP.done ? 'won' : 'calm', h: 0, fire: 0, turnT: 0, boss: null, ghosts: [],
      startX: (bx1 + 0.5) * T, edgeX: (cx0 + dirx * (RI - 0.5) + 0.5) * T, ix: cx0, iy: cy0 };
    g.lights.push({ x: pd.x, y: pd.y, r: 230, color: '255,214,230', inten: 0.5, flicker: 0.04 });
    if (!HP.done) {
      var lady = { x: pd.x, y: pd.y + 6, name: 'The Lady of the Pond', line: 0, seed: 3.3, npc: true, healed: true, sortY: 0, lines: ['...'], talk: function (n) { return HP.talk(n); }, draw: function () {} }; // she is painted in the light pass, above the fog and the dark, so she never changes
      g.props.push(lady); g.npcs.push(lady); pd.lady = lady;
    }
    return pd;
  };
  HP.keepClear = function (x, y) { var P = CC.Plains, pd = P && P.map && P.map.pond; if (!pd) return true; var dx = (x - pd.x) / T, dy = (y - pd.y) / T * (pd.R / pd.ry); return Math.hypot(dx, dy) > pd.R + 7; };

  /* ---------- terrain: colour and tile art (plains.js calls these for every tile) ---------- */
  function zone(tx, ty, pd, extra) { var dx = tx + 0.5 - pd.cx, dy = (ty + 0.5 - pd.cy) * (pd.R / pd.ry), d = Math.hypot(dx, dy); return d <= pd.R + (extra || 22) ? d : -1; }
  HP.ground = function (c, kind, hv, tx, ty) {
    var pd = pond(); if (!pd) return c;
    var d = zone(tx, ty, pd); if (d < 0) return c;
    var h = pd.h;
    if (kind === 5 || kind === 6) {
      var calm = [56 + hv * 10, 146 + hv * 12, 178 + hv * 10], green = [26 + hv * 6, 84 + hv * 8, 62 + hv * 6], murk = [5, 24 + hv * 4, 16];
      var col = mix(calm, green, clamp(h * 1.7, 0, 1)); col = mix(col, murk, clamp((h - 0.35) / 0.65, 0, 1));
      return css(col);
    }
    if (kind === 0 || kind === 2) {
      var k = h * (1 - sm((d - (pd.R + 3)) / 13)); if (k <= 0.01) return c;
      var rgb = parse(c), brown = kind === 2 ? [92, 66, 44] : [82, 62, 34];
      return css(mix(rgb, [brown[0] * (1 - 0.3 * k), brown[1] * (1 - 0.3 * k), brown[2] * (1 - 0.3 * k)], k * 0.9));
    }
    return c;
  };
  var FLOWER = ['#f27aa6', '#fff2f6', '#ffd75a', '#b98af2', '#ff9a6a'];
  HP.detail = function (c, kind, sx, sy, hv, t, tx, ty) {
    var pd = pond(); if (!pd) return false;
    var d = zone(tx, ty, pd); if (d < 0) return false;
    var h = pd.h, fall = 1 - sm((d - (pd.R + 3)) / 13), hh = h * fall, i;
    if (kind === 5) { // the water: sparkling and lily-strewn, then oily, rotten and bubbling
      var o = Math.sin(t * 1.5 + hv * 20) * 3;
      c.strokeStyle = 'rgba(' + (h < 0.5 ? '210,238,250' : '90,150,120') + ',' + (0.3 - 0.15 * h) + ')'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx + 5 + o, sy + 9 + hv * 12); c.lineTo(sx + 19 + o, sy + 9 + hv * 12); c.stroke();
      if (h < 0.6 && hv > 0.82) { c.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.3 * Math.sin(t * 3 + hv * 30)) * (1 - h) + ')'; c.fillRect(sx + 12, sy + 14, 2, 2); }
      if (hv < 0.2 && d < pd.R - 0.8) { // a lily pad (a lotus flower while it is lovely)
        var px = sx + 8 + hv * 60, py = sy + 12 + Math.sin(hv * 40) * 4, pc = mix([80, 170, 90], [70, 52, 30], clamp(h * 1.4, 0, 1));
        c.fillStyle = css(pc); c.beginPath(); c.arc(px, py, 7, 0.3, TAU - 0.3); c.lineTo(px, py); c.fill();
        if (hv < 0.11) { var fc = mix([250, 150, 190], [40, 20, 28], clamp(h * 1.5, 0, 1)); c.fillStyle = css(fc); for (i = 0; i < 5; i++) { var fa = i / 5 * TAU; c.beginPath(); c.ellipse(px + Math.cos(fa) * 2.4, py - 2 + Math.sin(fa) * 1.6, 2.2, 1.4, fa, 0, TAU); c.fill(); } c.fillStyle = h < 0.7 ? '#ffe27a' : '#802020'; c.fillRect(px - 1, py - 3, 2, 2); }
      }
      if (h > 0.18 && hash(tx * 3 + 8, ty * 5 + 1) < 0.18 + 0.5 * h) { // the water begins to bubble, harder as you near the island
        for (i = 0; i < 1 + Math.floor(h * 3); i++) { var bph = (t * (0.5 + h) + hv * 9 + i * 0.37) % 1, bxx = sx + 5 + ((hv * (i + 3) * 811) % 1) * 22, byy = sy + 24 - bph * 20;
          if (bph < 0.85) { c.strokeStyle = 'rgba(150,200,170,' + (0.5 - 0.3 * bph) + ')'; c.lineWidth = 1; c.beginPath(); c.arc(bxx, byy, 1.4 + i * 0.7 + bph * 1.5, 0, TAU); c.stroke(); }
          else { c.strokeStyle = 'rgba(150,200,170,' + (1 - bph) * 3 + ')'; c.beginPath(); c.ellipse(bxx, byy, 3 + (bph - 0.85) * 40, 1.5 + (bph - 0.85) * 18, 0, 0, TAU); c.stroke(); } } }
      return true;
    }
    if (kind === 6) { bridge(c, sx, sy, hv, t, tx, ty, pd); return true; }
    if (kind === 0 || kind === 2) { // grass and flowers, withering into brown
      var n = kind === 2 ? 1 : 3 + ((hv * 3) | 0), gc = mix([88, 140, 58], [96, 70, 38], clamp(hh * 1.3, 0, 1));
      if (kind === 0) {
        c.strokeStyle = css(gc); c.lineWidth = 1.1; c.beginPath();
        for (i = 0; i < n; i++) {
          var x = sx + ((hv * (i + 3) * 977) % 1) * 28 + 2, y = sy + ((hv * (i + 5) * 313) % 1) * 22 + 9, sw = Math.sin(t * (1.7 - hh) + tx * 0.32 + ty * 0.11 + i) * (2.2 - hh) + 2, h2 = 8 - hh * 3;
          c.moveTo(x, y); c.quadraticCurveTo(x + sw * 0.4, y - h2 * 0.5, x + sw + hh * 2, y - h2);
        }
        c.stroke();
        var fh = hash(tx * 3 + 1, ty * 5 + 2);
        if (fh < 0.22 && d > 1) { // flowers: bright and swaying, then drooped, greyed and dropping petals
          var fx = sx + 6 + fh * 90, fy = sy + 8 + fh * 70 % 18, fc2 = parse(FLOWER[(fh * 50) | 0 % FLOWER.length] || FLOWER[0]), fcol = mix(fc2, [60, 50, 50], clamp(hh * 1.5, 0, 1));
          var droop = hh * 4, sway2 = Math.sin(t * 2 + fh * 40) * 1.5;
          c.strokeStyle = css(mix([70, 130, 60], [70, 50, 30], hh)); c.lineWidth = 1; c.beginPath(); c.moveTo(fx, fy + 6); c.quadraticCurveTo(fx + sway2, fy + 2, fx + sway2 + droop, fy - 2 + droop); c.stroke();
          c.fillStyle = css(fcol); for (i = 0; i < 5; i++) { var a2 = i / 5 * TAU; c.beginPath(); c.arc(fx + sway2 + droop + Math.cos(a2) * 2, fy - 2 + droop + Math.sin(a2) * 2, 1.7, 0, TAU); c.fill(); }
          c.fillStyle = hh < 0.5 ? '#ffe27a' : '#4a2a20'; c.fillRect(fx + sway2 + droop - 1, fy - 3 + droop, 2, 2);
          if (hh > 0.3) { c.fillStyle = css(fcol); c.fillRect(fx + 3 + (hash(tx, ty) * 5), fy + 8, 1.5, 1.5); } // fallen petals
        }
      } else if (hv > 0.45) { c.fillStyle = 'rgba(40,25,15,.25)'; c.fillRect(sx + 4, sy + 6 + hv * 40 % 20, 22, 2); }
      return true;
    }
    return false;
  };

  /* the bridge: weathered planks over two dark stringers; it ages slowly, first hairline cracks and grey grain, then split planks, sagging boards,
     rot, splinters and gaps, rails that lean and ropes that fray. `dl` (decay) lags well behind the horror so the break-up is gradual. */
  function bridge(c, sx, sy, hv, t, tx, ty, pd) {
    var h = pd.h, dl = Math.pow(h, 1.9), i, lat = ty + 0.5 - pd.cy, edge = Math.abs(lat) > 0.7, side = lat < 0 ? -1 : 1;
    // the two stringer beams under the planks, seen through the gaps
    c.fillStyle = 'rgba(14,12,12,.55)'; c.fillRect(sx, sy + 4, T, 4); c.fillRect(sx, sy + 24, T, 4);
    for (i = 0; i < 4; i++) {
      var sd = hash(tx * 4 + i, ty * 7 + 3), sd2 = hash(tx * 9 + i, ty * 3 + 5), px = sx + i * 8;
      var state = sd < dl * 0.32 ? 3 : sd < dl * 0.62 ? 2 : sd < dl * 0.95 ? 1 : 0; // 3 gone, 2 snapped, 1 cracked, 0 sound
      var wood = mix([164, 124, 78], [58, 50, 40], clamp(dl * 1.15, 0, 1)), dark = mix(wood, [0, 0, 0], 0.35), pale = mix(wood, [255, 236, 200], 0.22 * (1 - dl));
      if (state === 3) { // fallen away: ragged stubs left at the stringers, dark water below
        c.fillStyle = 'rgba(6,10,10,.78)'; c.fillRect(px + 1, sy, 6, T);
        c.fillStyle = css(dark); c.beginPath(); c.moveTo(px + 1, sy + 3); c.lineTo(px + 3, sy + 8 + sd2 * 3); c.lineTo(px + 5, sy + 3 + sd2 * 2); c.lineTo(px + 7, sy + 9); c.lineTo(px + 7, sy + 3); c.fill();
        c.beginPath(); c.moveTo(px + 1, sy + T - 3); c.lineTo(px + 4, sy + T - 9 - sd * 3); c.lineTo(px + 6, sy + T - 4); c.lineTo(px + 7, sy + T - 3); c.fill();
        if (dl > 0.6) { c.fillStyle = 'rgba(110,220,170,' + 0.2 * (dl - 0.5) + ')'; c.fillRect(px + 3, sy + 10 + sd2 * 10, 2, 2); }
        continue;
      }
      var split = 10 + sd2 * 12; // where a snapped plank breaks across
      c.save(); c.translate(px + 4, sy + 16);
      function plank(y0, y1, tilt, drop, jag) { // one board (or half board) with grain, nails and an optional jagged break
        c.save(); c.translate(0, drop); c.rotate(tilt);
        c.fillStyle = css(wood); c.beginPath(); c.moveTo(-4, y0); c.lineTo(3.4, y0);
        if (jag) { c.lineTo(3.4, y1 - 2); c.lineTo(2, y1 + 1); c.lineTo(0.5, y1 - 2); c.lineTo(-1, y1 + 2); c.lineTo(-2.4, y1 - 1); c.lineTo(-4, y1 + 1); } else { c.lineTo(3.4, y1); c.lineTo(-4, y1); }
        c.closePath(); c.fill();
        c.fillStyle = css(pale); c.fillRect(-4, y0, 1.2, y1 - y0); c.fillStyle = css(dark); c.fillRect(2.4, y0, 1, y1 - y0); // lit and shaded edges
        c.strokeStyle = css(mix(wood, [0, 0, 0], 0.3 + 0.2 * dl)); c.lineWidth = 0.7; c.beginPath(); // wood grain
        for (var gI = 0; gI < 3; gI++) { var gx = -2.2 + gI * 2.2 + sd2 * 0.6; c.moveTo(gx, y0 + 1); c.quadraticCurveTo(gx + (gI % 2 ? 0.8 : -0.8), (y0 + y1) / 2, gx, y1 - 1); } c.stroke();
        c.fillStyle = 'rgba(30,24,20,.8)'; c.fillRect(-2.4, y0 + 2, 1.6, 1.6); c.fillRect(1, y0 + 2, 1.6, 1.6); // nail heads
        c.restore();
      }
      if (state === 2) { // snapped in two: the halves hang apart, one dropped, the other tilted, splinters between
        var tilt1 = (sd - 0.5) * 0.16, tilt2 = (sd2 - 0.5) * 0.22;
        plank(-16, -16 + split, tilt1, 0, true); plank(-16 + split + 4, 16, tilt2, 1.5 + sd * 2, false);
        c.fillStyle = css(pale); c.beginPath(); c.moveTo(-3, -16 + split + 1); c.lineTo(-1, -16 + split + 5); c.lineTo(0, -16 + split + 1); c.lineTo(2, -16 + split + 4); c.lineTo(3, -16 + split); c.fill(); // splinters
        c.fillStyle = 'rgba(6,10,10,.6)'; c.fillRect(-3, -16 + split + 3, 6, 2);
      } else {
        var tl = state === 1 ? (sd - 0.5) * 0.08 : 0; plank(-16, 16, tl, state === 1 ? 1 : 0, false);
        if (state === 1 || dl > 0.12 && sd2 < dl * 2) { // cracks: a hairline first, then a long forked split with a dark gap
          c.strokeStyle = 'rgba(14,10,8,.85)'; c.lineWidth = state === 1 ? 1.3 : 0.7; c.beginPath(); var cy0 = -12 + sd2 * 16; c.moveTo(-3, cy0); c.lineTo(-1, cy0 + 4); c.lineTo(-2.4, cy0 + 8); c.lineTo(0.6, cy0 + 12); c.lineTo(-0.8, cy0 + 17); c.stroke();
          if (state === 1) { c.beginPath(); c.moveTo(-1, cy0 + 4); c.lineTo(2, cy0 + 6); c.moveTo(0.6, cy0 + 12); c.lineTo(3, cy0 + 13); c.lineWidth = 0.8; c.stroke(); c.strokeStyle = 'rgba(255,230,190,.25)'; c.beginPath(); c.moveTo(-2.4, cy0 + 8); c.lineTo(-1.8, cy0 + 11); c.stroke(); }
        }
      }
      if (dl > 0.35 && sd > 0.45) { c.fillStyle = 'rgba(66,96,52,' + 0.55 * Math.min(1, dl) + ')'; c.beginPath(); c.ellipse(-0.5, -14 + sd * 26, 3.4, 2.4 + sd, 0, 0, TAU); c.fill(); } // moss and rot
      if (dl > 0.5 && sd2 > 0.7) { c.fillStyle = 'rgba(20,16,12,.55)'; c.beginPath(); c.arc(1, -6 + sd2 * 14, 1.8, 0, TAU); c.fill(); } // rot holes
      c.restore();
    }
    if (edge) { // the rail: posts, a handrope; posts crack and lean, ropes fray and snap
      var ry = side < 0 ? sy + 2 : sy + T - 3, snapped = hash(tx, ty + 9) < dl * 0.9, lean = (hash(tx + 4, ty) - 0.5) * dl * 7, rotpost = dl > 0.4 && hash(tx, ty + 3) < dl;
      c.strokeStyle = css(mix([120, 86, 52], [34, 30, 26], dl)); c.lineWidth = 3.2;
      for (i = 0; i < 2; i++) {
        var pxx = sx + 2.5 + i * 24.5; c.beginPath(); c.moveTo(pxx, ry + 4); c.lineTo(pxx + lean * (i ? -0.6 : 1), ry - 6 - (rotpost && i ? 3 : 0)); c.stroke();
        if (rotpost && !i) { c.strokeStyle = 'rgba(14,10,8,.8)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(pxx - 1, ry - 2); c.lineTo(pxx + 1, ry); c.stroke(); c.strokeStyle = css(mix([120, 86, 52], [34, 30, 26], dl)); c.lineWidth = 3.2; }
      }
      c.strokeStyle = css(mix([196, 170, 120], [66, 58, 44], dl)); c.lineWidth = 1.5; c.beginPath(); c.moveTo(sx + 2.5 + lean, ry - 4);
      if (snapped) { c.lineTo(sx + 11, ry + 1 + Math.sin(t * 1.4 + tx) * 1.2); c.moveTo(sx + 27 - lean * 0.6, ry - 4); c.lineTo(sx + 20, ry + 4 + Math.sin(t * 1.8 + tx) * 1.8); c.stroke(); c.lineWidth = 0.7; c.beginPath(); for (i = 0; i < 3; i++) { c.moveTo(sx + 11 + i, ry + 1); c.lineTo(sx + 12 + i * 1.4, ry + 3.5); } c.stroke(); } // frayed ends
      else { c.quadraticCurveTo(sx + 14, ry - 4 + 2 + dl * 3, sx + 27, ry - 4); c.stroke(); }
    }
  }

  /* trees: blossoming, then black, twisted and watching (the eyes themselves are painted after the lighting, so they glow in the dark) */
  HP.tree = function (c, sx, sy, hv, t, tx, ty) {
    var pd = pond(); if (!pd || !pd.treeSet[ty * pd.W + tx]) return false;
    var h = pd.h, bx = sx + T / 2, by = sy + T - 2, hgt = 70 + hv * 26, i;
    var trunk = css(mix([98, 68, 44], [22, 14, 18], clamp(h * 1.3, 0, 1))), wob = h * 5 * Math.sin(t * 0.8 + hv * 9);
    c.fillStyle = 'rgba(0,0,0,' + (0.3 + h * 0.15) + ')'; c.beginPath(); c.ellipse(bx + 6, by + 2, 20, 5, 0, 0, TAU); c.fill();
    c.fillStyle = trunk; c.beginPath(); c.moveTo(bx - 7, by); c.quadraticCurveTo(bx - 5 + wob, by - hgt * 0.5, bx - 3 + wob * 1.6, by - hgt); c.lineTo(bx + 3 + wob * 1.6, by - hgt); c.quadraticCurveTo(bx + 5 + wob, by - hgt * 0.5, bx + 8, by); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(bx - 1, by - 3); c.quadraticCurveTo(bx + wob, by - hgt * 0.5, bx + wob * 1.5, by - hgt + 4); c.stroke();
    var bc = css(mix([88, 60, 38], [14, 10, 14], clamp(h * 1.3, 0, 1))); c.strokeStyle = bc; c.lineCap = 'round';
    for (i = 0; i < 4; i++) { // boughs; in the horror they twist, reach out and end in clawed fingers
      var dir = i % 2 ? 1 : -1, hy = by - hgt * (0.45 + i * 0.13), len = 16 + i * 4 + h * 14, tw = Math.sin(t * 1.1 + i * 2 + hv * 7) * (1 + h * 5);
      c.lineWidth = 3.4 - i * 0.5; c.beginPath(); c.moveTo(bx + wob * (0.4 + i * 0.2), hy); c.quadraticCurveTo(bx + dir * len * 0.6, hy - 8 + tw, bx + dir * len, hy - 4 - h * 8 + tw * 1.5); c.stroke();
      if (h > 0.45) { c.lineWidth = 1.2; for (var f = -1; f <= 1; f++) { c.beginPath(); c.moveTo(bx + dir * len, hy - 4 - h * 8 + tw * 1.5); c.lineTo(bx + dir * (len + 5 + h * 3), hy - 4 - h * 8 + tw * 1.5 + f * 4 + 2); c.stroke(); } }
    }
    var blobs = Math.max(2, Math.round(9 * (1 - 0.72 * h))); // the crown thins as the leaves die and fall
    for (i = 0; i < blobs; i++) {
      var cx = bx + wob * 1.6 - 14 + i * 3.6 + Math.sin(t * 1.2 + i) * (1.5 + h), cy = by - hgt + 2 + (i % 3) * 6 - (i > 5 ? 7 : 0), r = 13 - i * 0.6;
      var base = mix([52, 118, 58], [74, 56, 30], clamp(h * 1.4, 0, 1)), hi = mix([120, 190, 96], [92, 70, 40], clamp(h * 1.4, 0, 1));
      c.fillStyle = css(mix(base, [10, 8, 12], 0.35)); c.beginPath(); c.ellipse(cx, cy + 3, r * 1.2, r * 0.8, 0, 0, TAU); c.fill();
      c.fillStyle = css(base); c.beginPath(); c.ellipse(cx - 1, cy, r, r * 0.7, 0, 0, TAU); c.fill();
      c.fillStyle = css(hi); c.beginPath(); c.ellipse(cx - 3, cy - 3, r * 0.5, r * 0.32, 0, 0, TAU); c.fill();
      if (h < 0.7 && i % 2 === 0) { c.fillStyle = 'rgba(255,200,222,' + (1 - h) * 0.9 + ')'; for (var b = 0; b < 3; b++) c.fillRect(cx - 5 + b * 4, cy - 2 + (b % 2) * 3, 2.2, 2.2); } // blossoms
    }
    if (h > 0.15) { c.fillStyle = css(mix([160, 120, 60], [70, 40, 24], h)); for (i = 0; i < 3; i++) { var ph = (t * 0.4 + i / 3 + hv) % 1; c.globalAlpha = 1 - ph; c.fillRect(bx - 16 + i * 14 + Math.sin(t + i * 2) * 4, by - hgt + ph * hgt * 0.8, 2, 2); } c.globalAlpha = 1; } // dead leaves falling
    return true;
  };

  /* ---------- the light pass: darkness, fog and the glowing red eyes ---------- */
  function eye(c, x, y, s, look, open, col) {
    if (open <= 0.05) return;
    c.save(); c.shadowColor = col; c.shadowBlur = 6 + s * 2; c.fillStyle = col;
    c.beginPath(); c.moveTo(x - s * 1.5, y); c.quadraticCurveTo(x, y - s * open * 1.1, x + s * 1.5, y); c.quadraticCurveTo(x, y + s * open * 0.9, x - s * 1.5, y); c.fill();
    c.shadowBlur = 0; c.fillStyle = '#18020a'; c.fillRect(x + look * s * 0.5 - 0.5, y - s * 0.6 * open, 1.1, s * 1.2 * open); c.restore();
  }
  function flame(c, x, y, w, hgt, ph, t) { // one tongue of fire, wavering
    var sw = Math.sin(t * 9 + ph) * w * 0.25;
    c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.9, y - hgt * 0.55, x + sw, y - hgt); c.quadraticCurveTo(x + w * 0.9, y - hgt * 0.5, x + w, y); c.closePath(); c.fill();
  }
  function ghostFig(c, gh, p, t, cam) {
    var u = gh.age / gh.life, a = Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 1.3) * 0.62, x = gh.x - cam.x, y = gh.y - cam.y + Math.sin(t * 1.4 + gh.seed) * 3 - 6, face = p && p.x < gh.x ? -1 : 1, i;
    if (x < -50 || x > cam.w + 50 || y < -70 || y > cam.h + 50) return;
    c.save(); c.translate(x, y); c.scale(face * gh.sc, gh.sc); c.globalAlpha = a;
    var bodyG = c.createLinearGradient(0, -34, 0, 12); bodyG.addColorStop(0, 'rgba(176,206,236,.85)'); bodyG.addColorStop(1, 'rgba(120,150,190,0)');
    c.fillStyle = bodyG; c.beginPath(); c.moveTo(-5, -26); c.quadraticCurveTo(-11, -8, -12 + Math.sin(t * 2 + gh.seed) * 2, 12); // a tattered shroud trailing into mist
    for (i = 0; i < 5; i++) c.lineTo(-12 + i * 6, 12 + (i % 2 ? 6 : -1) + Math.sin(t * 2.2 + i + gh.seed) * 3);
    c.quadraticCurveTo(11, -8, 5, -26); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(176,206,236,.55)'; c.lineWidth = 2.2; c.lineCap = 'round'; // long, thin arms hanging
    c.beginPath(); c.moveTo(-5, -22); c.quadraticCurveTo(-13, -10, -10 + Math.sin(t * 1.7 + gh.seed) * 3, 2); c.moveTo(5, -22); c.quadraticCurveTo(13, -10, 10 + Math.sin(t * 1.9 + gh.seed) * 3, 2); c.stroke();
    c.fillStyle = 'rgba(190,214,238,.7)'; c.beginPath(); c.ellipse(0, -30, 5, 6.4, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(4,10,24,.85)'; c.beginPath(); c.ellipse(-2.2, -30.5, 1.8, 2.4, 0, 0, TAU); c.ellipse(2.2, -30.5, 1.8, 2.4, 0, 0, TAU); c.ellipse(0, -26.2, 1.1, 2, 0, 0, TAU); c.fill();
    c.globalAlpha = Math.min(1, a * 1.8); c.shadowColor = '#5ac8ff'; c.shadowBlur = 14; c.fillStyle = '#b8f0ff'; c.fillRect(-3.6, -31.6, 2.8, 2.3); c.fillRect(0.8, -31.6, 2.8, 2.3); // the blue glowing eyes
    c.restore();
  }
  HP.after = function (c, cam) {
    var pd = pond(); if (!pd) return;
    var h = pd.h, fire = pd.fire, t = Date.now() / 1000, p = hero(), i, tx0 = Math.floor(cam.x / T), ty0 = Math.floor(cam.y / T), tx1 = Math.ceil((cam.x + cam.w) / T), ty1 = Math.ceil((cam.y + cam.h) / T);
    var lady = pd.lady && !pd.lady.hidden ? pd.lady : null;
    if (h <= 0.005 && pd.stage !== 'turn') { if (lady) HP.drawWoman(c, lady.x - cam.x, lady.y - cam.y, t, lady); return; }
    c.save();
    var dk = 0.74 * Math.pow(h, 1.1); // it gets a little darker with every step, and is properly dark by the island
    c.fillStyle = 'rgba(3,3,8,' + dk + ')'; c.fillRect(0, 0, cam.w, cam.h);
    if (p) { var hx = p.x - cam.x, hy = p.y - cam.y, g = c.createRadialGradient(hx, hy, 90, hx, hy, 90 + 300 * (1 - 0.4 * h)); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (0.62 * h) + ')'); c.fillStyle = g; c.fillRect(0, 0, cam.w, cam.h); }
    // fog: low, dark banks drifting across the whole pond (a pale grey haze at first, a black-green murk at the end)
    var fc = mix([138, 150, 152], [14, 22, 20], clamp(Math.pow(h, 0.65), 0, 1)), fcs = (fc[0] | 0) + ',' + (fc[1] | 0) + ',' + (fc[2] | 0), fa = clamp(h * 1.2, 0, 1) * (0.1 + 0.3 * h), cell = 150;
    for (var gy = Math.floor(cam.y / cell) - 1; gy <= Math.ceil((cam.y + cam.h) / cell); gy++) for (var gx = Math.floor(cam.x / cell) - 1; gx <= Math.ceil((cam.x + cam.w) / cell); gx++) {
      var hs = hash(gx * 7 + 3, gy * 5 + 9); if (hs > 0.6) continue;
      var fx = gx * cell + hs * cell + Math.sin(t * 0.12 + hs * 30) * 46, fy = gy * cell + hash(gx, gy) * cell * 0.9 + Math.cos(t * 0.1 + hs * 20) * 30, fr = 100 + hs * 110;
      var ddx = fx / T - pd.cx, ddy = (fy / T - pd.cy) * (pd.R / pd.ry); if (Math.hypot(ddx, ddy) > pd.R + 10) continue;
      var sx = fx - cam.x, sy = fy - cam.y, gr = c.createRadialGradient(sx, sy, 0, sx, sy, fr); gr.addColorStop(0, 'rgba(' + fcs + ',' + fa + ')'); gr.addColorStop(1, 'rgba(' + fcs + ',0)'); c.fillStyle = gr; c.fillRect(sx - fr, sy - fr, fr * 2, fr * 2);
    }
    if (p) for (i = 0; i < 6; i++) { // wisps coiling around the hero
      var a3 = t * (0.4 + i * 0.1) + i * 1.9, r3 = 60 + (i % 3) * 36 + Math.sin(t + i) * 14, wx = p.x - cam.x + Math.cos(a3) * r3, wy = p.y - cam.y + Math.sin(a3) * r3 * 0.6, wr = 60 + (i % 3) * 18;
      var gw = c.createRadialGradient(wx, wy, 0, wx, wy, wr); gw.addColorStop(0, 'rgba(' + fcs + ',' + fa * 0.9 + ')'); gw.addColorStop(1, 'rgba(' + fcs + ',0)'); c.fillStyle = gw; c.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
    }
    // red eyes in the dark blades of grass (just a few), and in the trees (lots)
    var look = p ? 1 : 0, dens = clamp((h - 0.4) / 0.6, 0, 1) * 0.016;
    if (dens > 0) {
      for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
        var dd = Math.hypot(tx + 0.5 - pd.cx, (ty + 0.5 - pd.cy) * (pd.R / pd.ry)); if (dd > pd.R + 14) continue;
        var k = ty * pd.W + tx, kd = CC.Dungeon && CC.Dungeon.kind ? CC.Dungeon.kind[k] : 0;
        if (kd === 3 || kd === 6 || kd === 5) continue;
        var hs2 = hash(tx * 11 + 5, ty * 13 + 7); if (hs2 > dens) continue;
        var ex = tx * T - cam.x + 6 + hs2 * 4000 % 20, ey = ty * T - cam.y + 12 + hs2 * 7000 % 14, blink = Math.sin(t * (1.4 + hs2 * 400) + hs2 * 90), sz = 1.4 + h * 1.6;
        c.strokeStyle = 'rgba(12,8,6,.9)'; c.lineWidth = 1.2; c.beginPath(); for (i = -2; i <= 2; i++) { c.moveTo(ex + i * 2.4, ey + 7); c.lineTo(ex + i * 3.2, ey - 5 - (i % 2) * 2); } c.stroke();
        eye(c, ex - 2.6, ey, sz, look, blink > -0.5 ? 1 : 0.15, '#ff2a2a'); eye(c, ex + 2.6, ey, sz, look, blink > -0.5 ? 1 : 0.15, '#ff2a2a');
      }
    }
    for (i = 0; i < pd.trees.length; i++) { // the trees' eyes and mouths
      var tr = pd.trees[i], bx = tr.tx * T - cam.x + T / 2, by = tr.ty * T - cam.y + T - 2;
      if (bx < -40 || bx > cam.w + 40 || by < -20 || by > cam.h + 130) continue;
      var nE = h < 0.2 ? 0 : 1 + Math.floor(h * 5), hgt = 70 + hash(tr.tx, tr.ty) * 26, th = hash(tr.tx * 3, tr.ty * 7);
      for (var e2 = 0; e2 < nE; e2++) {
        var eh = hash(tr.tx * 7 + e2, tr.ty * 5 + e2), ex2 = bx + (eh - 0.5) * 9 + (e2 > 2 ? (e2 - 3.5) * 10 : 0), ey2 = by - hgt * (0.12 + (e2 % 4) * 0.2 + eh * 0.06), bl = Math.sin(t * (0.8 + eh * 3) + eh * 50);
        eye(c, ex2, ey2, 2 + h * 3.4 + (e2 === 0 ? 1.2 : 0), p ? Math.sign(p.x - (tr.tx * T)) : 0, bl > -0.8 ? 1 : 0.1, h > 0.65 ? '#ff2a2a' : '#ffd23a');
      }
      if (h > 0.8) { c.save(); c.strokeStyle = '#1a0408'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx - 6, by - hgt * 0.28); for (var q = 0; q < 7; q++) c.lineTo(bx - 6 + q * 2, by - hgt * 0.28 + (q % 2 ? 4 : 0) + Math.sin(t * 3 + th * 9) * 1.2); c.stroke(); c.restore(); }
    }
    // the island's trees catch fire (from three quarters of the way across) and burn harder with each step
    if (fire > 0.01) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (i = 0; i < pd.islandTrees.length; i++) {
        var it = pd.islandTrees[i], fbx = it.tx * T - cam.x + T / 2, fby = it.ty * T - cam.y + T - 2, fh2 = 70 + hash(it.tx, it.ty) * 26;
        if (fbx < -120 || fbx > cam.w + 120 || fby < -60 || fby > cam.h + 180) continue;
        var cy2 = fby - fh2 + 6, glow = 60 + fire * 120, gl = c.createRadialGradient(fbx, cy2, 0, fbx, cy2, glow); gl.addColorStop(0, 'rgba(255,130,40,' + 0.42 * fire + ')'); gl.addColorStop(1, 'rgba(255,90,20,0)'); c.fillStyle = gl; c.fillRect(fbx - glow, cy2 - glow, glow * 2, glow * 2);
        var tongues = 2 + Math.floor(fire * 9);
        for (var f2 = 0; f2 < tongues; f2++) {
          var fh = hash(it.tx * 5 + f2, it.ty * 3 + f2), fx2 = fbx + (fh - 0.5) * 30 + Math.sin(t * 2 + f2) * 2, fy2 = cy2 + 6 + (fh * 40 % 14) - (f2 % 3) * 2, fhgt = (10 + fire * 30) * (0.6 + fh * 0.7) * (0.85 + 0.15 * Math.sin(t * 11 + f2 * 3)), fw = 3 + fire * 4;
          c.fillStyle = 'rgba(255,70,12,' + (0.5 + 0.35 * fire) + ')'; flame(c, fx2, fy2, fw, fhgt, f2, t);
          c.fillStyle = 'rgba(255,160,40,' + (0.5 + 0.3 * fire) + ')'; flame(c, fx2, fy2, fw * 0.62, fhgt * 0.72, f2 + 1, t);
          c.fillStyle = 'rgba(255,235,150,' + (0.45 + 0.3 * fire) + ')'; flame(c, fx2, fy2, fw * 0.3, fhgt * 0.44, f2 + 2, t);
        }
        if (fire > 0.35) { // the trunk burns at its foot
          for (f2 = 0; f2 < 3; f2++) { var bh = hash(it.tx + f2, it.ty * 9); c.fillStyle = 'rgba(255,100,20,' + 0.5 * fire + ')'; flame(c, fbx + (f2 - 1) * 5, fby - 2, 3 + fire * 2, (6 + fire * 16) * (0.7 + bh * 0.6), f2 * 2, t); }
        }
        c.fillStyle = 'rgba(255,190,90,' + 0.8 * fire + ')'; // embers rising
        for (f2 = 0; f2 < 3 + Math.floor(fire * 7); f2++) { var ph = (t * (0.4 + (f2 % 3) * 0.15) + f2 * 0.37 + it.tx * 0.11) % 1; c.globalAlpha = 1 - ph; c.fillRect(fbx + Math.sin(f2 * 3 + t) * (8 + ph * 16), cy2 - ph * (50 + fire * 50), 1.6, 1.6); }
        c.globalAlpha = 1;
      }
      c.globalCompositeOperation = 'source-over'; c.fillStyle = 'rgba(30,28,28,' + 0.12 * fire + ')'; // smoke
      for (i = 0; i < pd.islandTrees.length; i++) { var sit = pd.islandTrees[i], sbx = sit.tx * T - cam.x + T / 2, sby = sit.ty * T - cam.y - 60; if (sbx < -40 || sbx > cam.w + 40 || sby < -120 || sby > cam.h + 40) continue; for (var sm2 = 0; sm2 < 3; sm2++) { var sph = (t * 0.25 + sm2 / 3 + i * 0.13) % 1; c.beginPath(); c.arc(sbx + Math.sin(t + sm2 + i) * 8, sby - sph * 60, 6 + sph * 12, 0, TAU); c.fill(); } }
      c.restore();
    }
    // apparitions: pale figures with glowing blue eyes that fade in, hang in the dark, and fade away
    for (i = 0; i < pd.ghosts.length; i++) ghostFig(c, pd.ghosts[i], p, t, cam);
    if (lady) HP.drawWoman(c, lady.x - cam.x, lady.y - cam.y, t, lady);
    if (pd.stage === 'turn') { var u = clamp(pd.turnT / 3.2, 0, 1), pulse = 0.12 + 0.25 * Math.abs(Math.sin(t * 6)) * u; c.fillStyle = 'rgba(140,0,12,' + pulse + ')'; c.fillRect(0, 0, cam.w, cam.h); }
    c.restore();
  };

  /* ---------- the woman ---------- */
  HP.drawWoman = function (c, sx, sy, t, pr) {
    var pd = pond(); if (!pd || pr.hidden) return;
    var u = pd.stage === 'turn' ? clamp(pd.turnT / 3.2, 0, 1) : 0, sc = 1.25 + 0.7 * u, sway = Math.sin(t * 1.3) * 1.4, i;
    c.save(); c.translate(sx, sy);
    var aura = c.createRadialGradient(0, -22, 2, 0, -22, 46 + u * 20); aura.addColorStop(0, u > 0.3 ? 'rgba(255,60,70,' + 0.4 * u + ')' : 'rgba(255,236,246,0.5)'); aura.addColorStop(1, 'rgba(255,236,246,0)'); c.fillStyle = aura; c.fillRect(-60, -80, 120, 120);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(0, 3, 12 * sc, 4, 0, 0, TAU); c.fill();
    c.scale(sc, sc * (1 + 0.1 * u));
    var shake = u > 0 ? (Math.random() - 0.5) * 2 * u * 2 : 0; c.translate(shake, 0);
    // hair: long and dark, drifting; in the turn it rises and writhes
    c.strokeStyle = u > 0.15 ? '#0a0408' : '#1c1620'; c.lineCap = 'round';
    for (i = 0; i < 9; i++) { var hx = -5 + i * 1.3, lift = u * (18 + i * 2); c.lineWidth = 2.6 - i * 0.12; c.beginPath(); c.moveTo(hx * 0.5, -31); c.bezierCurveTo(hx - 5 + sway, -26 - lift * 0.5, hx - 8 + Math.sin(t * 2 + i) * (2 + u * 6), -12 - lift, hx - 5 + Math.sin(t * 2.3 + i) * (3 + u * 8), 4 - lift * 1.4); c.stroke(); }
    // gown: pale, flowing, a hem that stirs
    var gr = c.createLinearGradient(0, -26, 0, 4); gr.addColorStop(0, u > 0.2 ? '#7a1a26' : '#f6f8ff'); gr.addColorStop(1, u > 0.2 ? '#1a0408' : '#b8cfee'); c.fillStyle = gr;
    c.beginPath(); c.moveTo(-4, -26); c.lineTo(4, -26); c.lineTo(8 + sway * 0.3, -8); c.lineTo(13, 3);
    for (i = 0; i < 6; i++) c.lineTo(13 - i * 5.2, 3 + (i % 2 ? 2 : -1) + Math.sin(t * 2 + i) * (0.8 + u * 3)); c.lineTo(-13, 3); c.lineTo(-8 - sway * 0.3, -8); c.closePath(); c.fill();
    c.fillStyle = u > 0.2 ? '#3a0a10' : '#6ac0c0'; c.fillRect(-5, -14, 10, 2); // a sash
    c.fillStyle = u > 0.2 ? '#cfc8c8' : '#f4dccb'; c.beginPath(); c.moveTo(-4, -24); c.lineTo(-9, -12); c.lineTo(-7, -11); c.lineTo(-3, -20); c.fill(); c.beginPath(); c.moveTo(4, -24); c.lineTo(9, -12); c.lineTo(7, -11); c.lineTo(3, -20); c.fill(); // arms
    // face
    c.fillStyle = u > 0.2 ? '#cfc8c8' : '#f6e0d0'; c.beginPath(); c.ellipse(0, -30, 4.2, 5 + u * 2, 0, 0, TAU); c.fill();
    if (u < 0.15) { c.strokeStyle = '#7a4a4a'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-2.6, -30.5); c.quadraticCurveTo(-1.6, -29.5, -0.6, -30.5); c.moveTo(0.6, -30.5); c.quadraticCurveTo(1.6, -29.5, 2.6, -30.5); c.stroke(); c.strokeStyle = '#c05a6a'; c.beginPath(); c.moveTo(-1.8, -27.6); c.quadraticCurveTo(0, -26.6, 1.8, -27.6); c.stroke(); } // serene closed eyes, a gentle smile
    else { c.fillStyle = '#ff2a2a'; c.shadowColor = '#ff2a2a'; c.shadowBlur = 6; c.fillRect(-3.2, -31, 2, 1.6); c.fillRect(1.2, -31, 2, 1.6); c.shadowBlur = 0; c.strokeStyle = '#2a0408'; c.lineWidth = 1; c.beginPath(); c.moveTo(-3.6 - u * 3, -27.6); c.quadraticCurveTo(0, -25.5 + u * 4, 3.6 + u * 3, -27.6); c.stroke(); } // the smile widens
    // a crown of flowers
    var cols = ['#f27aa6', '#fff2f6', '#ffd75a', '#b98af2']; for (i = 0; i < 7; i++) { c.fillStyle = u > 0.2 ? '#2a1218' : cols[i % 4]; c.beginPath(); c.arc(-5 + i * 1.7, -34.5 + Math.abs(i - 3) * 0.5, 1.5, 0, TAU); c.fill(); }
    c.restore();
    // drifting petals
    if (u < 0.2) { for (i = 0; i < 5; i++) { var ph = (t * 0.25 + i / 5) % 1; c.globalAlpha = Math.sin(ph * Math.PI); c.fillStyle = i % 2 ? '#ffd0e0' : '#fff'; c.beginPath(); c.ellipse(sx + Math.sin(ph * 6 + i * 2) * 20, sy - 6 - ph * 44, 1.8, 1, ph * 5, 0, TAU); c.fill(); } c.globalAlpha = 1; }
    var p = hero(); if (p && pd.stage === 'calm' && Math.hypot(p.x - pr.x, p.y - pr.y) < 80) { c.font = 'bold 9px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#ffe9f4'; c.fillText(pr.name + '  [F] talk', sx, sy - 58 * 1.0); c.textAlign = 'left'; }
  };
  HP.talk = function (pr) {
    var pd = pond(); if (!pd || pd.stage !== 'calm') return '...';
    pd.stage = 'turn'; pd.turnT = 0; pd.said = 0;
    return 'Oh... a visitor. So few come this far. Stay with me a while. The water is so warm.';
  };

  /* ---------- the fight ---------- */
  var DRAWB = {};
  if (E && E.TYPES && !E.TYPES.merehorror) {
    E.TYPES.merehorror = { name: 'The Mere Horror', hp: 330, spd: 50, dmg: 17, r: 21, xp: 320, color: '#c9ced0', w: 0, telRad: 76, blood: '#220812' };
    var oThink = E._think;
    E._think = function (e, dt, p, d, ang, f) {
      if (e.type !== 'merehorror') return oThink.apply(this, arguments);
      e.cd -= dt; e.dangerous = false; brain.call(this, e, dt, p, d, ang, f);
    };
    var oKill = E._kill;
    E._kill = function (e) {
      var was = e && e.type === 'merehorror' && !e.dead, res = oKill.apply(this, arguments);
      if (was) {
        fxText(e.x, e.y - 40, 'THE MERE RETURNS TO THE WATER', '#cfe8e0', 12); if (CC.fx && CC.fx.shake) CC.fx.shake(10);
        if (CC.Loot && CC.Loot.roll) { CC.Loot.roll(e, e.floor, 0); CC.Loot.roll(e, e.floor, 0); CC.Loot.roll(e, e.floor, 0); }
      }
      return res;
    };
    var oSpawn = E.spawnForFloor; E.spawnForFloor = function () { return oSpawn.apply(this, arguments); };
  }
  function mvB(e, dx, dy) { var D = CC.Dungeon, r = D && D.moveWithCollision ? D.moveWithCollision(e, dx, dy) : (e.x += dx, e.y += dy, null); return !!(r && (r.hitX || r.hitY)); }
  function hurtB(p, e, amt) {
    if (!p || p.hp <= 0 || p.invuln > 0) return 0;
    var dmg = Math.max(1, Math.round(amt * 100 / (100 + (p.armor || 0)))); p.hp -= dmg; p.invuln = 0.45; p.hurtFlash = 0.2;
    if (CC.fx) { if (CC.fx.shake) CC.fx.shake(4); fxText(p.x, p.y - 14, '-' + dmg, '#ff5a5a', 12); }
    return dmg;
  }
  function shootB(e, ang, spd, dmg, col, life, r) { E._shoot(e, ang, spd, dmg, col, 'orb', life); var q = E.projectiles[E.projectiles.length - 1]; if (q && r) q.r = r; }
  function brain(e, dt, p, d, ang, f) {
    var low = e.hp < e.maxHp * 0.5, rage = e.hp < e.maxHp * 0.3, sp = e.spd * f * dt * (rage ? 1.45 : low ? 1.2 : 1), k;
    e.anim = e.anim || 0;
    if (e.state === 'rise') { e.invuln = Math.max(e.invuln || 0, 0.1); if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 1.1; } return; }
    if (e.state === 'idle') {
      if (d > 62) mvB(e, Math.cos(ang) * sp, Math.sin(ang) * sp);
      if (!e.s1 && e.hp < e.maxHp * 0.66) { e.s1 = 1; this._tele(e, 'summon', 1.0, ang); e.tele = { kind: 'circle', rad: 120, max: 1.0 }; return; }
      if (!e.s2 && e.hp < e.maxHp * 0.33) { e.s2 = 1; this._tele(e, 'summon', 1.0, ang); e.tele = { kind: 'circle', rad: 120, max: 1.0 }; return; }
      if (e.cd <= 0) {
        e.n = (e.n || 0) + 1; var pick = e.n % 5;
        if (d < 100 && pick !== 3) this._tele(e, 'rake', rage ? 0.55 : 0.75, ang);
        else if (pick === 1) { this._tele(e, 'tendrils', 0.7, ang); e.tele = { kind: 'line', ang: ang, len: 320, max: 0.7 }; }
        else if (pick === 2) { e.atk = 'hands'; e.state = 'telegraph'; e.t = 0.5; e.tele = null; fxText(p.x, p.y - 22, 'THE WATER REACHES', '#9ad0c0', 10); }
        else if (pick === 3 && !(p.blindT > 0) && d < 340 && e.los !== false) { this._tele(e, 'gaze', 0.95, ang); e.tele = { kind: 'line', ang: ang, len: 340, max: 0.95 }; fxText(e.x, e.y - e.r * 2.4, 'DO NOT LOOK', '#ff6a6a', 11); }
        else this._tele(e, d < 130 ? 'rake' : 'tendrils', 0.7, ang);
        if (e.atk === 'tendrils' && e.tele && e.tele.kind !== 'line') e.tele = { kind: 'line', ang: ang, len: 320, max: 0.7 };
      }
    } else if (e.state === 'telegraph') {
      if ((e.t -= dt) <= 0) {
        e.tele = null;
        if (e.atk === 'rake') {
          e.state = 'act'; e.t = 0.4; if (CC.fx && CC.fx.shake) CC.fx.shake(7);
          if (CC.fx && CC.fx.burst) { CC.fx.burst(e.x + Math.cos(ang) * 24, e.y, '#9ad0c0', 14, 130); }
          E.projectiles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 0, life: 0.35, ring: e.telRad, color: '#5aa090', fx: true });
          if (d < e.telRad + (p.r || 8) && hurtB(p, e, e.dmg * 1.15)) { mvB(p, Math.cos(ang) * 24, Math.sin(ang) * 24); if (CC.Wounds && R() < 0.4) CC.Wounds.apply(p, { dur: 2.5, dps: Math.max(2, e.dmg * 0.3), src: 'claw' }); }
        } else if (e.atk === 'tendrils') {
          e.state = 'recover'; e.t = 0.6; var n = rage ? 9 : low ? 7 : 5;
          for (k = 0; k < n; k++) shootB(e, ang + (k - (n - 1) / 2) * 0.17, 175, e.dmg * 0.55, '#3a2a58', 2.2, 5);
          if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y - 8, '#3a2a58', 10, 90);
        } else if (e.atk === 'hands') {
          e.state = 'recover'; e.t = 0.9; var nh = rage ? 6 : low ? 5 : 4;
          for (k = 0; k < nh; k++) { var a2 = R() * TAU, r2 = k === 0 ? 0 : 24 + R() * 60; this._zone(p.x + Math.cos(a2) * r2, p.y + Math.sin(a2) * r2, 48, 0.8 + k * 0.12, e.dmg * 1.0, e, 'burrow'); }
        } else if (e.atk === 'gaze') {
          e.state = 'recover'; e.t = 0.9;
          E.projectiles.push({ x: e.x, y: e.y - 14, vx: 0, vy: 0, r: 0, life: 0.5, ring: 150, color: '#ff2a2a', fx: true });
          if (CC.fx) { if (CC.fx.shake) CC.fx.shake(5); }
          if (d < 360 && e.los !== false && CC.Wounds && CC.Wounds.blind) CC.Wounds.blind(p, 1.5);
        } else { // summon: the drowned dead claw out of the soil
          e.state = 'recover'; e.t = 1.0; fxText(e.x, e.y - e.r * 2.6, 'THE WATER GIVES UP ITS DEAD', '#bfe8dc', 11); if (CC.fx && CC.fx.shake) CC.fx.shake(6);
          for (k = 0; k < 2; k++) { var w = E.spawn('mawworm', p.x + (k ? 60 : -60), p.y + (R() - 0.5) * 50, 1); if (w) { w.asleep = false; w.cd = 0.5; } }
        }
      }
    } else if (e.state === 'act') { e.dangerous = d < e.r + 40; if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.7; } }
    else if (e.state === 'recover') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = (rage ? 0.5 : low ? 0.9 : 1.3) + R() * 0.6; } }
    else e.state = 'idle';
    if (e.hp < e.maxHp * 0.9 && R() < dt * 3) { if (CC.fx && CC.fx.burst) CC.fx.burst(e.x + (R() - 0.5) * e.r, e.y - R() * e.r * 1.4, '#2a0812', 1, 30); }
  }

  // update: progress along the bridge, the transformation, the boss bar and victory
  var oUpdate = E.update, lastT = 0;
  E.update = function (dt) {
    var res = oUpdate.apply(this, arguments), pd = pond();
    if (!pd) return res;
    var p = hero(), h = pd.h, target = 0, ftarget = 0, m = CC.Plains.map;
    if (pd.stage === 'calm' && p) {
      var tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), kd = m.kind[ty * m.w + tx], dIsl = Math.hypot(p.x - pd.x, p.y - pd.y);
      if (dIsl < pd.ri * T + 6) { target = 0.97; ftarget = 1; }
      else if (kd === 6) { var u = clamp(((p.x - pd.startX) * -pd.dirx) / Math.max(1, Math.abs(pd.startX - pd.edgeX)), 0, 1); target = 0.02 + 0.93 * Math.pow(u, 1.55); ftarget = clamp((u - 0.75) / 0.25, 0, 1); } // slow at first: you will hardly notice it begin
    } else if (pd.stage === 'turn' || pd.stage === 'fight') { target = 1; ftarget = 1; }
    h += (target - h) * Math.min(1, dt * (target > h ? 1.6 : 0.5)); pd.h = h;
    pd.fire += (ftarget - pd.fire) * Math.min(1, dt * (ftarget > pd.fire ? 1.2 : 0.4));
    // apparitions: they begin to appear once the dark has set in, and gather as it deepens
    var gl = pd.ghosts, gi;
    for (gi = gl.length - 1; gi >= 0; gi--) { gl[gi].age += dt; gl[gi].x += gl[gi].vx * dt; gl[gi].y += gl[gi].vy * dt; if (gl[gi].age >= gl[gi].life) gl.splice(gi, 1); }
    if (p && h > 0.2 && pd.stage !== 'won' && gl.length < 1 + Math.floor(h * 4) && R() < dt * (0.25 + h * 1.1)) {
      var ga = R() * TAU, gd = (pd.stage === 'turn' || h > 0.9 ? 80 : 120) + R() * 200, gx = p.x + Math.cos(ga) * gd, gy = p.y + Math.sin(ga) * gd * 0.7;
      var gdd = Math.hypot((gx / T - pd.cx), (gy / T - pd.cy) * (pd.R / pd.ry));
      if (gdd < pd.R + 8) gl.push({ x: gx, y: gy, age: 0, life: 3 + R() * 3, vx: (R() - 0.5) * 8 + (p.x - gx) * 0.02, vy: (R() - 0.5) * 6 + (p.y - gy) * 0.02, seed: R() * 50, sc: 0.95 + R() * 0.5 });
    }
    if (pd.stage === 'turn') {
      pd.turnT += dt; var P = CC.Plains, tt = pd.turnT;
      if (CC.fx && CC.fx.shake && R() < dt * 6) CC.fx.shake(1 + tt);
      if (tt > 1.3 && pd.said < 1) { pd.said = 1; P.speech = { name: 'The Lady of the Pond', text: 'Why do you look at me like that? Come closer...', t0: Date.now() }; }
      if (tt > 2.4 && pd.said < 2) { pd.said = 2; P.speech = { name: 'The Lady of the Pond', text: 'Stay. Forever.', t0: Date.now() }; }
      if (tt >= 3.2) { // she is gone; something else stands where she stood
        pd.stage = 'fight'; if (pd.lady) { pd.lady.hidden = true; }
        if (CC.Audio) { CC.Audio.event('laugh'); CC.Audio.play('pondspawn', { vol: 1, gap: 0, vary: 0 }); } // the lady is gone and the Mere Horror rises
        var b = E.spawn('merehorror', pd.x, pd.y, 2); if (b) { b.state = 'rise'; b.t = 1.4; b.miniBoss = true; b.asleep = false; b.cd = 1.5; pd.boss = b; }
        if (CC.Vfx && CC.Vfx.skyFlash) CC.Vfx.skyFlash('#ff3a3a', 0.3, 0.4);
        if (CC.fx) { if (CC.fx.shake) CC.fx.shake(14); if (CC.fx.burst) { CC.fx.burst(pd.x, pd.y, '#3a2a58', 40, 180); CC.fx.burst(pd.x, pd.y, '#9ad0c0', 24, 140); } fxText(pd.x, pd.y - 60, 'THE MERE HORROR RISES', '#ff6a6a', 15); }
        if (p && p.hp > 0) { var a = Math.atan2(p.y - pd.y, p.x - pd.x); if (CC.Dungeon && CC.Dungeon.moveWithCollision) CC.Dungeon.moveWithCollision(p, Math.cos(a) * 30, Math.sin(a) * 30); }
      }
    } else if (pd.stage === 'fight' && pd.boss) {
      var bs = pd.boss;
      if (bs.dead || bs.hp <= 0) {
        pd.stage = 'won'; HP.done = true; if (CC.SaveGame && CC.SaveGame.save) CC.SaveGame.save();
        m.chests.push({ x: pd.x, y: pd.y, tx: pd.cx, ty: pd.cy, opened: false, tier: 2 });
        fxText(pd.x, pd.y - 50, 'THE POND IS STILL', '#cfeee0', 13);
      } else if (!bs.asleep) this.bossBar = { name: 'The Mere Horror', pct: clamp(bs.hp / bs.maxHp, 0, 1), phase: bs.hp < bs.maxHp * 0.5 ? 2 : 1, kind: 'pond', color: '#6aa8a0', intro: 0 };
    }
    return res;
  };

  /* ---------- boss art ---------- */
  DRAWB.merehorror = function (c, e, r, col, dark, t) {
    var an = e.anim || 0, frac = clamp(e.hp / e.maxHp, 0, 1), dam = 1 - frac, tele = e.state === 'telegraph', rake = tele && e.atk === 'rake' || e.state === 'act', gaze = tele && e.atk === 'gaze', mis = e.missing || {}, k;
    var rise = e.state === 'rise' ? sm(1 - e.t / 1.4) : 1, ty = (1 - rise) * r * 2.2;
    c.save(); c.beginPath(); c.rect(-r * 4, -r * 5, r * 8, r * 5 + r * 1.5 * 1 + (1 - rise) * 0 + r * 1.2); c.clip(); c.beginPath(); c.rect(-r * 4, -r * 5, r * 8, r * 6.4); c.clip();
    // the pool it stands in: black water, ripples, tentacles
    c.fillStyle = 'rgba(6,14,18,.85)'; c.beginPath(); c.ellipse(0, r * 0.75, r * 1.9, r * 0.75, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(120,190,180,.35)'; c.lineWidth = 1; for (k = 0; k < 3; k++) { c.beginPath(); c.ellipse(0, r * 0.75, r * (1.2 + ((an * 0.5 + k / 3) % 1) * 0.9), r * (0.45 + ((an * 0.5 + k / 3) % 1) * 0.35), 0, 0, TAU); c.stroke(); }
    c.restore();
    c.save(); c.translate(0, ty);
    for (k = 0; k < 7; k++) { // tentacles writhing out of the water
      var a = k / 7 * TAU + 0.3, len = r * (1.3 + (k % 3) * 0.3), x0 = Math.cos(a) * r * 0.5, y0 = r * 0.7 + Math.sin(a) * r * 0.2, x1 = Math.cos(a) * len, y1 = r * 0.75 + Math.sin(a) * len * 0.45 - Math.sin(an * 3 + k) * 4 - (rake ? 4 : 0);
      c.strokeStyle = '#1b2a30'; c.lineWidth = 5 - (k % 3); c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2 + Math.sin(an * 4 + k) * 5, (y0 + y1) / 2 - 8, x1, y1); c.stroke();
      c.strokeStyle = 'rgba(120,200,190,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y0 - 1); c.quadraticCurveTo((x0 + x1) / 2 + Math.sin(an * 4 + k) * 5, (y0 + y1) / 2 - 9, x1, y1 - 1); c.stroke();
    }
    // torn gown rags hanging from the waist
    var sway = Math.sin(an * 3) * 2;
    for (k = 0; k < 6; k++) { var gx = -r * 0.7 + k * r * 0.28; c.fillStyle = k % 2 ? '#8c8f96' : '#b9bcc4'; c.beginPath(); c.moveTo(gx, -r * 0.2); c.lineTo(gx + r * 0.3, -r * 0.2); c.lineTo(gx + r * 0.18 + sway * (k % 2 ? 1 : -1), r * 0.85 + (k % 3) * 3); c.lineTo(gx + r * 0.04, r * 0.7); c.closePath(); c.fill(); }
    // elongated torso: pale, ribs showing
    var body = e.flash > 0 ? '#ffffff' : col;
    c.fillStyle = body; c.beginPath(); c.moveTo(-r * 0.5, -r * 0.3); c.quadraticCurveTo(-r * 0.62, -r * 1.2, -r * 0.3, -r * 2.0); c.lineTo(r * 0.3, -r * 2.0); c.quadraticCurveTo(r * 0.62, -r * 1.2, r * 0.5, -r * 0.3); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(40,50,56,.55)'; c.lineWidth = 1.2; for (k = 0; k < 5; k++) { c.beginPath(); c.moveTo(-r * 0.46, -r * (0.55 + k * 0.28)); c.quadraticCurveTo(0, -r * (0.45 + k * 0.28), r * 0.46, -r * (0.55 + k * 0.28)); c.stroke(); }
    c.strokeStyle = 'rgba(40,50,56,.5)'; c.beginPath(); c.moveTo(0, -r * 0.3); c.lineTo(0, -r * 1.9); c.stroke();
    if (dam > 0.25) { c.fillStyle = '#4a0a16'; c.beginPath(); c.ellipse(-r * 0.15, -r * 0.9, r * 0.22, r * 0.34 + dam * 4, 0.2, 0, TAU); c.fill(); c.strokeStyle = '#e8e0d4'; c.lineWidth = 1; for (k = 0; k < 3; k++) { c.beginPath(); c.moveTo(-r * 0.3, -r * (1.05 - k * 0.15)); c.lineTo(0, -r * (1.0 - k * 0.15)); c.stroke(); } } // a torn chest
    // arms: two huge reaching ones with black claws, two thin ones folded at the ribs
    function arm(sgn, miss, big) {
      if (miss) { c.fillStyle = '#2a0a12'; c.beginPath(); c.arc(sgn * r * 0.5, -r * 1.55, r * 0.14, 0, TAU); c.fill(); return; }
      var sx = sgn * r * 0.5, sy = -r * (big ? 1.65 : 1.1), reach = rake ? 1 : tele ? 0.5 : 0, ex = sgn * r * ((big ? 1.6 : 0.95) + reach * (big ? 0.9 : 0.2)) + Math.sin(an * 3 + sgn) * 2, ey = -r * (big ? 0.5 : 0.45) - reach * r * (big ? 0.8 : 0.1) + Math.cos(an * 2.6 + sgn) * 2;
      c.strokeStyle = body; c.lineWidth = big ? 4.2 : 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx + sgn * r * 0.7, sy + r * 0.2, ex, ey); c.stroke();
      c.strokeStyle = '#0c0a10'; c.lineWidth = big ? 1.8 : 1.2; for (var f = -2; f <= 2; f++) { c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + sgn * r * 0.55, ey + f * r * 0.16 + (rake ? r * 0.15 : 0)); c.stroke(); }
    }
    arm(-1, mis.armLeft, true); arm(1, mis.armRight, true); arm(-1, false, false); arm(1, false, false);
    // hair: black tendrils writhing around the head
    var hy = -r * 2.35;
    c.strokeStyle = '#06030a'; c.lineCap = 'round';
    for (k = 0; k < 11; k++) { var ha = -2.6 + k * 0.52, hl = r * (1.0 + (k % 4) * 0.25); c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, hy); c.bezierCurveTo(Math.cos(ha) * hl * 0.5, hy + Math.sin(ha) * hl * 0.3 - 6, Math.cos(ha + Math.sin(an * 3 + k) * 0.4) * hl, hy + Math.sin(ha) * hl * 0.5 + Math.sin(an * 2.4 + k) * 5, Math.cos(ha) * hl * 1.05 + Math.sin(an * 3.5 + k * 2) * 4, hy + r * 0.8 + (k % 3) * 4); c.stroke(); }
    // the head: a long, hollow face with black horns, red eyes and an unhinged mouth full of needles
    if (mis.head) { c.fillStyle = '#4a0a16'; c.beginPath(); c.ellipse(0, hy + r * 0.4, r * 0.28, r * 0.22, 0, 0, TAU); c.fill(); }
    else {
      c.fillStyle = '#0c0a10'; c.beginPath(); c.moveTo(-r * 0.28, hy - r * 0.3); c.quadraticCurveTo(-r * 0.8, hy - r * 1.0, -r * 0.5, hy - r * 1.5); c.quadraticCurveTo(-r * 0.4, hy - r * 0.9, -r * 0.12, hy - r * 0.5); c.fill();
      c.beginPath(); c.moveTo(r * 0.28, hy - r * 0.3); c.quadraticCurveTo(r * 0.8, hy - r * 1.0, r * 0.5, hy - r * 1.5); c.quadraticCurveTo(r * 0.4, hy - r * 0.9, r * 0.12, hy - r * 0.5); c.fill(); // horns
      c.fillStyle = body; c.beginPath(); c.ellipse(0, hy, r * 0.42, r * 0.62, 0, 0, TAU); c.fill();
      c.fillStyle = '#12060c'; c.beginPath(); c.ellipse(-r * 0.17, hy - r * 0.14, r * 0.15, r * 0.19, 0.2, 0, TAU); c.ellipse(r * 0.17, hy - r * 0.14, r * 0.15, r * 0.19, -0.2, 0, TAU); c.fill();
      c.save(); c.shadowColor = '#ff2a2a'; c.shadowBlur = gaze ? 16 : 7; c.fillStyle = gaze ? '#fff0f0' : '#ff2a2a'; c.fillRect(-r * 0.2, hy - r * 0.18, 3, 2.4); c.fillRect(r * 0.12, hy - r * 0.18, 3, 2.4);
      if (frac < 0.5) { c.fillRect(-r * 0.04, hy - r * 0.42, 2.6, 2); c.fillRect(-r * 0.3, hy - r * 0.38, 2, 1.8); c.fillRect(r * 0.24, hy - r * 0.38, 2, 1.8); } c.restore(); // more eyes open as it weakens
      var open = (tele && (e.atk === 'gaze' || e.atk === 'summon') ? 0.9 : rake ? 0.7 : 0.25 + 0.1 * Math.sin(an * 5)) * r * 0.5;
      c.fillStyle = '#2a0408'; c.beginPath(); c.ellipse(0, hy + r * 0.3 + open * 0.35, r * 0.2, open * 0.5 + 1, 0, 0, TAU); c.fill();
      c.fillStyle = '#efe8d6'; for (k = 0; k < 6; k++) { var tx = -r * 0.17 + k * r * 0.068; c.beginPath(); c.moveTo(tx, hy + r * 0.3 - open * 0.1); c.lineTo(tx + r * 0.03, hy + r * 0.3 + open * 0.3); c.lineTo(tx + r * 0.06, hy + r * 0.3 - open * 0.1); c.fill(); }
    }
    // damage: cracks leaking dark water
    if (dam > 0.15) { c.strokeStyle = 'rgba(90,200,190,.6)'; c.lineWidth = 1.1; for (k = 0; k < Math.floor(dam * 7); k++) { var ca = k * 2.4 + 0.5; c.beginPath(); c.moveTo(Math.cos(ca) * r * 0.2, -r * 1.2); c.lineTo(Math.cos(ca) * r * 0.5, -r * (0.8 + (k % 3) * 0.3)); c.lineTo(Math.cos(ca + 0.3) * r * 0.45, -r * (0.5 + (k % 3) * 0.25)); c.stroke(); } if (R() < 0.1 && CC.fx && CC.fx.burst) CC.fx.burst(e.x + (R() - 0.5) * r, e.y - R() * r, '#2a4a4a', 1, 30); }
    c.restore();
  };
  if (F && !F._pondDraw) {
    F._pondDraw = true; var prevDraw = F.drawMonster;
    F.drawMonster = function (ctx, e, r, col, dark, t) { var fn = DRAWB[e.type]; if (fn) { fn(ctx, e, r, col, dark, t); return true; } return prevDraw ? prevDraw.apply(this, arguments) : false; };
  }
})(window);
