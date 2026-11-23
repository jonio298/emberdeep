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

  // The Lady must be spoken to before the nightmare can begin.
  var LADY_LINES = [
    'Oh... a visitor. The reeds have not whispered of one in years.',
    'Come closer. Can you hear them singing beneath the water?',
    'They were so lonely down there. I promised I would bring them someone.',
    'Do not be afraid. You will never have to leave us.',
    'Stay. Forever.'
  ];
  var TURN_LENGTH = 5.4;
  HP.isTalking = function () { var pd = pond(); return !!(pd && pd.stage === 'talk'); };
  HP.isCinematic = function () { var pd = pond(); return !!(pd && pd.stage === 'turn'); };
  HP.nearAction = function () {
    var pd = pond(), p = hero();
    return !!(pd && p && (pd.stage === 'talk' || (pd.stage === 'calm' && pd.lady && !pd.lady.hidden &&
      Math.hypot(p.x - pd.lady.x, p.y - pd.lady.y) <= 112)));
  };
  HP.advanceDialogue = function () {
    var pd = pond();
    if (!pd || pd.stage !== 'talk') return false;
    pd.dialogueIndex++;
    if (pd.dialogueIndex === LADY_LINES.length) {
      if (CC.Plains) CC.Plains.speech = null;
      pd.stage = 'turn'; pd.turnT = 0; pd.turnCue = 0;
      if (CC.Audio && CC.Audio.play) CC.Audio.play('ghost_call_2', { vol: 0.6, gap: 0, vary: 0 });
    } else if (CC.Plains) {
      CC.Plains.speech = { name: 'The Lady of the Pond',
        text: LADY_LINES[pd.dialogueIndex], modal: true, t0: Date.now() };
    }
    return true;
  };
  HP.interact = function () {
    var pd = pond(), p = hero();
    if (!pd || !p) return false;
    if (pd.stage === 'talk') return HP.advanceDialogue();
    if (pd.stage !== 'calm' || !pd.lady || pd.lady.hidden ||
        Math.hypot(p.x - pd.lady.x, p.y - pd.lady.y) > 112) return false;
    pd.stage = 'talk'; pd.dialogueIndex = 0;
    if (CC.Plains) CC.Plains.speech = { name: 'The Lady of the Pond',
      text: LADY_LINES[0], modal: true, t0: Date.now() };
    return true;
  };
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
      if (h > 0.18 && hash(tx * 3 + 8, ty * 5 + 1) < 0.12 + 0.30 * h) { // the water begins to bubble, harder as you near the island
        for (i = 0; i < 1 + Math.floor(h * 2); i++) { var bph = (t * (0.5 + h) + hv * 9 + i * 0.37) % 1, bxx = sx + 5 + ((hv * (i + 3) * 811) % 1) * 22, byy = sy + 24 - bph * 20;
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

  function drawTransformation(c, cam, foreground) {
    var pd = pond(); if (!pd || pd.stage !== 'turn') return;
    var x = pd.x - cam.x, y = pd.y - cam.y;
    if (x < -260 || x > cam.w + 260 || y < -260 || y > cam.h + 260) return;
    var t = pd.turnT, u = clamp(t / TURN_LENGTH, 0, 1);
    var vortex = sm((u - 0.15) / 0.62), rise = sm((u - 0.48) / 0.46), i, a;
    c.save(); c.translate(x, y);
    if (!foreground) {
      c.fillStyle = 'rgba(8,3,18,' + (0.15 + vortex * 0.78) + ')';
      c.beginPath(); c.ellipse(0, 8, 20 + vortex * 116, 7 + vortex * 39, 0, 0, TAU); c.fill();
      for (i = 0; i < 5; i++) {
        var phase = (t * (0.3 + vortex * 0.75) + i / 5) % 1;
        var radius = 20 + phase * (96 + vortex * 48);
        c.strokeStyle = 'rgba(' + (i % 2 ? '199,38,76' : '177,223,216') + ',' +
          ((0.18 + 0.45 * vortex) * (1 - phase)) + ')';
        c.lineWidth = 1.4 + vortex * 2.4; c.beginPath();
        c.ellipse(0, 8, radius, radius * 0.32, 0, 0, TAU); c.stroke();
      }
      for (i = 0; i < 18; i++) {
        a = i * TAU / 18 - t * (0.5 + vortex * 1.5);
        var r = 32 + vortex * (34 + (i % 4) * 13);
        c.fillStyle = u < 0.28 ? '#ffe5ee' : i % 3 ? '#a0183f' : '#d68da2';
        c.globalAlpha = 0.75;
        c.fillRect(Math.cos(a) * r, Math.sin(a) * r * 0.4 - vortex * 17, 3 + vortex * 3, 2 + vortex * 2);
      }
      c.globalAlpha = 1;
      var glow = c.createRadialGradient(0, -20, 2, 0, -20, 138);
      glow.addColorStop(0, 'rgba(225,32,77,' + (0.08 + vortex * 0.50) + ')');
      glow.addColorStop(1, 'rgba(225,32,77,0)');
      c.fillStyle = glow; c.fillRect(-140, -160, 280, 280);
    } else {
      for (i = 0; i < 8; i++) {
        a = i * TAU / 8 + t * 0.31;
        var len = rise * (50 + (i % 3) * 24);
        c.strokeStyle = 'rgba(' + (i % 2 ? '24,7,28' : '122,15,50') + ',' + rise + ')';
        c.lineWidth = 3 + rise * 6; c.lineCap = 'round'; c.beginPath();
        c.moveTo(0, -30); c.bezierCurveTo(Math.cos(a) * len * 0.5, -90,
          Math.cos(a + t * 0.3) * len, -60 + Math.sin(a) * 40,
          Math.cos(a) * (len + 20), -26 + Math.sin(a) * len);
        c.stroke();
      }
      // Crooked crown and skull slowly rising from the Lady's dissolving body.
      var sy = -36 - rise * 57, rs = 0.5 + rise * 1.65;
      c.fillStyle = 'rgba(10,3,16,' + rise + ')';
      c.beginPath(); c.ellipse(0, sy, rs * 14, rs * 19, 0, 0, TAU); c.fill();
      for (i = 0; i < 5; i++) {
        var hx = (i - 2) * rs * 6;
        c.beginPath(); c.moveTo(hx, sy - rs * 12);
        c.lineTo(hx + (i - 2) * rs * 2, sy - rs * (26 + (i % 2) * 8));
        c.lineTo(hx + 4, sy - rs * 9); c.closePath(); c.fill();
      }
      c.fillStyle = 'rgba(255,44,70,' + rise + ')';
      c.fillRect(-rs * 10, sy - rs * 4, rs * 6, rs * 3);
      c.fillRect(rs * 4, sy - rs * 4, rs * 6, rs * 3);
      c.strokeStyle = 'rgba(248,62,94,' + (0.1 + rise * 0.8) + ')'; c.lineWidth = 1.4;
      for (i = 0; i < 4; i++) {
        a = i * TAU / 4 + t * 0.22; c.beginPath(); c.moveTo(0, -25);
        c.lineTo(Math.cos(a) * 28, -53); c.lineTo(Math.cos(a + 0.4) * 56, -40);
        c.lineTo(Math.cos(a) * 94, 10 + Math.sin(a) * 22); c.stroke();
      }
    }
    c.restore();
  }
  HP.after = function (c, cam) {
    var pd = pond(); if (!pd) return;
    var h = pd.h, fire = pd.fire, t = Date.now() / 1000, p = hero(), i, tx0 = Math.floor(cam.x / T), ty0 = Math.floor(cam.y / T), tx1 = Math.ceil((cam.x + cam.w) / T), ty1 = Math.ceil((cam.y + cam.h) / T);
    var lady = pd.lady && !pd.lady.hidden ? pd.lady : null;
    if (h <= 0.005 && pd.stage !== 'turn') { if (lady) HP.drawWoman(c, lady.x - cam.x, lady.y - cam.y, t, lady); return; }
    c.save();
    var dk = 0.57 * Math.pow(h, 1.1); // it gets a little darker with every step, and is properly dark by the island
    c.fillStyle = 'rgba(3,3,8,' + dk + ')'; c.fillRect(0, 0, cam.w, cam.h);
    if (p) { var hx = p.x - cam.x, hy = p.y - cam.y, g = c.createRadialGradient(hx, hy, 90, hx, hy, 90 + 300 * (1 - 0.4 * h)); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (0.42 * h) + ')'); c.fillStyle = g; c.fillRect(0, 0, cam.w, cam.h); }
    // Broad opaque banks rather than dozens of per-tile gradients. The slow wind and
    // shallow animated cloud ripples keep it alive without costly alpha/shadow layers.
    // The hero is restored above this pass in drawHeroFocus, not swallowed by it.
    var fc = mix([154, 165, 169], [65, 85, 83], clamp(Math.pow(h, 0.75), 0, 1));
    var fcs = (fc[0] | 0) + ',' + (fc[1] | 0) + ',' + (fc[2] | 0);
    var fa = clamp(h * 1.4, 0, 1) * (0.24 + 0.42 * h), cell = 260;
    for (var gy = Math.floor((cam.y - 240) / cell); gy <= Math.ceil((cam.y + cam.h + 240) / cell); gy++) {
      for (var gx = Math.floor((cam.x - 240) / cell); gx <= Math.ceil((cam.x + cam.w + 240) / cell); gx++) {
        var hs = hash(gx * 7 + 3, gy * 5 + 9);
        if (hs > 0.82) continue;
        var fx = gx * cell + hs * cell + Math.sin(t * 0.19 + hs * 30) * 65;
        var fy = gy * cell + hash(gx, gy) * cell * 0.85 + Math.cos(t * 0.13 + hs * 20) * 38;
        var ddx = fx / T - pd.cx, ddy = (fy / T - pd.cy) * (pd.R / pd.ry);
        if (ddx * ddx + ddy * ddy > (pd.R + 13) * (pd.R + 13)) continue;
        var sx = fx - cam.x, sy = fy - cam.y, fr = 155 + hs * 100;
        if (sx + fr < 0 || sx - fr > cam.w || sy + fr < 0 || sy - fr > cam.h) continue;
        var sway = 0.85 + 0.15 * Math.sin(t * 0.6 + hs * 16);
        var gr = c.createRadialGradient(sx, sy, 0, sx, sy, fr);
        gr.addColorStop(0, 'rgba(' + fcs + ',' + (fa * sway) + ')');
        gr.addColorStop(0.56, 'rgba(' + fcs + ',' + (fa * 0.78) + ')');
        gr.addColorStop(1, 'rgba(' + fcs + ',0)');
        c.fillStyle = gr; c.fillRect(sx - fr, sy - fr, fr * 2, fr * 2);
        if (h > 0.25) {
          c.strokeStyle = 'rgba(184,215,205,' + (0.10 * h) + ')';
          c.lineWidth = 1.25; c.beginPath();
          for (var ri = 0; ri < 2; ri++) {
            var rw = 44 + ri * 27 + Math.sin(t * 0.8 + hs * 23 + ri) * 8;
            c.ellipse(sx + Math.sin(t * 0.36 + hs * 12) * 18, sy + 15 + ri * 13, rw, 9 + ri * 3, -0.07, Math.PI * 0.12, Math.PI * 0.88);
          }
          c.stroke();
        }
      }
    }
    if (p) for (i = 0; i < 2; i++) { // just two wisps, not six extra gradients every frame
      var a3 = t * (0.38 + i * 0.1) + i * 2.7, r3 = 90 + i * 37, wx = p.x - cam.x + Math.cos(a3) * r3, wy = p.y - cam.y + Math.sin(a3) * r3 * 0.6, wr = 54 + i * 18;
      var gw = c.createRadialGradient(wx, wy, 0, wx, wy, wr);
      gw.addColorStop(0, 'rgba(' + fcs + ',' + (fa * 0.70) + ')'); gw.addColorStop(1, 'rgba(' + fcs + ',0)');
      c.fillStyle = gw; c.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
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
        var tongues = 2 + Math.floor(fire * 5);
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
    if (pd.stage === 'turn') drawTransformation(c, cam, false);
    if (lady) HP.drawWoman(c, lady.x - cam.x, lady.y - cam.y, t, lady);
    if (pd.stage === 'turn') {
      drawTransformation(c, cam, true);
      var u = clamp(pd.turnT / TURN_LENGTH, 0, 1);
      c.fillStyle = 'rgba(140,0,20,' + (u * (0.07 + 0.13 * Math.abs(Math.sin(t * 7)))) + ')';
      c.fillRect(0, 0, cam.w, cam.h);
    }
    c.restore();
  };

  // The pond's light pass is after world characters: repaint the hero on top of
  // the denser fog so attacks, feet and class colours stay readable on phones.
  HP.drawHeroFocus = function (c, cam) {
    var pd = pond(), p = hero();
    if (!pd || !p || pd.h < 0.15 || !CC.Classes || !CC.Classes.drawPlayer) return;
    var dx = p.x / T - pd.cx, dy = (p.y / T - pd.cy) * (pd.R / pd.ry);
    if (dx * dx + dy * dy > (pd.R + 12) * (pd.R + 12)) return;
    var sx = p.x - cam.x, sy = p.y - cam.y;
    c.save();
    c.strokeStyle = 'rgba(185,245,226,' + (0.35 + 0.28 * pd.h) + ')';
    c.lineWidth = 1.6; c.beginPath(); c.ellipse(sx, sy + 10, 13, 4.5, 0, 0, TAU); c.stroke();
    c.restore();
    CC.Classes.drawPlayer(c, cam);
  };

  /* ---------- the woman ---------- */
  HP.drawWoman = function (c, sx, sy, t, pr) {
    var pd = pond(); if (!pd || pr.hidden) return;
    var u = pd.stage === 'turn' ? clamp(pd.turnT / TURN_LENGTH, 0, 1) : 0, sc = 1.25 + 1.45 * sm(u), sway = Math.sin(t * (1.3 + 12 * u)) * (1.4 + 6 * u), i;
    c.save(); c.translate(sx, sy);
    var aura = c.createRadialGradient(0, -22, 2, 0, -22, 46 + u * 20); aura.addColorStop(0, u > 0.3 ? 'rgba(255,60,70,' + 0.4 * u + ')' : 'rgba(255,236,246,0.5)'); aura.addColorStop(1, 'rgba(255,236,246,0)'); c.fillStyle = aura; c.fillRect(-60, -80, 120, 120);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(0, 3, 12 * sc, 4, 0, 0, TAU); c.fill();
    c.scale(sc, sc * (1 + 0.1 * u));
    var shake = u > 0 ? Math.sin(t * (13 + u * 19)) * 4 * u : 0; c.translate(shake, -u * 17);
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
    var p = hero(); if (p && pd.stage === 'calm' && Math.hypot(p.x - pr.x, p.y - pr.y) < 112) { c.font = 'bold 9px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#ffe9f4'; c.fillText(pr.name + '  [F] talk', sx, sy - 58 * 1.0); c.textAlign = 'left'; }
  };
  HP.talk = function () {
    var pd = pond(); if (!pd) return '...';
    if (pd.stage === 'calm') HP.interact();
    else if (pd.stage === 'talk') HP.advanceDialogue();
    return CC.Plains && CC.Plains.speech ? CC.Plains.speech.text : '';
  };

  /* ---------- the fight ---------- */
  var DRAWB = {};
  if (E && E.TYPES && !E.TYPES.merehorror) {
    E.TYPES.merehorror = { name: 'The Mere Horror', hp: 330, spd: 50, dmg: 17, r: 24, xp: 320, color: '#281126', w: 0, telRad: 76, blood: '#330518' };
    E.TYPES.pondterror = { name: 'Teleporting Terror', hp: 38, spd: 64, dmg: 9, r: 10, xp: 20, color: '#9e8bbd', w: 0, ghost: true, blood: '#49345b' };
    var oThink = E._think;
    E._think = function (e, dt, p, d, ang, f) {
      if (e.type === 'pondterror') { e.cd -= dt; e.dangerous = false; terrorBrain.call(this, e, dt, p, d, ang, f); return; }
      if (e.type !== 'merehorror') return oThink.apply(this, arguments);
      e.cd -= dt; e.dangerous = false; brain.call(this, e, dt, p, d, ang, f);
    };
    // The demon cannot be hit at its old location once it dissolves into mist.
    var originalDamage = E.damage;
    E.damage = function (target, amount, type) {
      if (target && target.type === 'merehorror' && target.state === 'mistHidden') return 0;
      return originalDamage.apply(this, arguments);
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
  function shootB(e, ang, spd, dmg, col, life, r) {
    if(E.projectiles.length>=100)return;
    E._shoot(e, ang, spd, dmg, col, 'orb', life);
    var q=E.projectiles[E.projectiles.length-1];
    if(q){if(r)q.r=r;q.pondShot=true;}
  }
  // Summon onto the playable island only. Never put enemies in the water,
  // inside trees, or on top of a hero. Bound the total wave size for mobile.
  var POND_MINION_CAP = 8;
  function islandPoint(pd, p, minDist) {
    var D = CC.Dungeon, maxR = Math.max(90, (pd.ri - 2) * T);
    for (var attempt = 0; attempt < 24; attempt++) {
      var a = R() * TAU, r = 66 + R() * (maxR - 66);
      var x = pd.x + Math.cos(a) * r, y = pd.y + Math.sin(a) * r;
      if (p && Math.hypot(x - p.x, y - p.y) < minDist) continue;
      if (D && D.isSolid && (D.isSolid(x, y) || D.isSolid(x - 14, y) || D.isSolid(x + 14, y) || D.isSolid(x, y - 14) || D.isSolid(x, y + 14))) continue;
      return { x: x, y: y };
    }
    return null;
  }
  function activePondMinions() {
    var n = 0;
    for (var i = 0; i < E.list.length; i++) if (E.list[i].pondSummon && !E.list[i].dead) n++;
    return n;
  }
  function summonPond(e, p) {
    var pd = pond(); if (!pd || pd.stage !== 'fight') return;
    var roster = ['bat', 'pondterror', 'ghost', 'skeleton'], available = Math.max(0, POND_MINION_CAP - activePondMinions());
    var wave = e.summonWave || 0, count = Math.min(4, available), spawned = 0;
    for (var k = 0; k < count; k++) {
      var where = islandPoint(pd, p, 64);
      if (!where) break;
      var mob = E.spawn(roster[(wave + k) % roster.length], where.x, where.y, 2, { awake: true });
      if (!mob) continue;
      mob.pondSummon = true; mob.asleep = false; mob.cd = 0.7;
      mob.dmg = Math.max(1, Math.round(mob.dmg * 0.8));
      spawned++;
      if (CC.fx && CC.fx.burst) CC.fx.burst(mob.x, mob.y, '#9ab0a8', 4, 45);
    }
    e.summonWave = (wave + 1) % roster.length;
    e.summonCd = spawned ? 13 : 5;
  }
  function terrorBrain(e, dt, p, d, ang, f) {
    e.blinkCd = (e.blinkCd === undefined ? 1.4 : e.blinkCd - dt);
    if (e.state === 'telegraph') {
      if ((e.t -= dt) <= 0) {
        e.tele = null;
        var pd = pond(), pos = pd && islandPoint(pd, p, 62);
        if (pos) {
          if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y, '#72558d', 5, 45);
          e.x = pos.x; e.y = pos.y;
          if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y, '#c1a5e6', 7, 60);
        }
        e.state = 'recover'; e.t = 0.5;
      }
      return;
    }
    if (e.state === 'recover') {
      if ((e.t -= dt) <= 0) e.state = 'idle';
      return;
    }
    if (e.blinkCd <= 0 && d < 350) {
      e.state = 'telegraph'; e.t = 0.60; e.blinkCd = 4.1;
      e.tele = { kind: 'circle', rad: 32, max: 0.60 };
      return;
    }
    if (d > 25) mvB(e, Math.cos(ang) * e.spd * f * dt, Math.sin(ang) * e.spd * f * dt);
    e.dangerous = d < e.r + (p.r || 10) + 3;
  }

  // Mist attacks use world-locked warning geometry. They cannot retarget at
  // the last moment: a player who dodges out of the warning is safe.
  function lineDistance(px, py, x0, y0, x1, y1) {
    var vx = x1 - x0, vy = y1 - y0, n = vx * vx + vy * vy;
    var u = n ? clamp(((px - x0) * vx + (py - y0) * vy) / n, 0, 1) : 0;
    return Math.hypot(px - x0 - u * vx, py - y0 - u * vy);
  }
  function clearIsland(pd, x, y) {
    var D = CC.Dungeon, xx = (x - pd.x) / T, yy = (y - pd.y) / T;
    if (xx * xx + yy * yy > (pd.ri - 1.1) * (pd.ri - 1.1)) return false;
    return !D || !D.isSolid || (!D.isSolid(x, y) && !D.isSolid(x + 15, y) &&
      !D.isSolid(x - 15, y) && !D.isSolid(x, y + 15) && !D.isSolid(x, y - 15));
  }
  function mistStrike(e, p, ang) {
    var pd = pond(); if (!pd) return false;
    var distance = Math.min(208, Math.max(100, Math.hypot(p.x - e.x, p.y - e.y) + 20));
    var x = e.x, y = e.y, endX = x, endY = y;
    for (var step = 16; step <= distance; step += 16) {
      var tx = x + Math.cos(ang) * step, ty = y + Math.sin(ang) * step;
      if (!clearIsland(pd, tx, ty)) break;
      endX = tx; endY = ty;
    }
    if (Math.hypot(endX - x, endY - y) < 48) return false;
    e.mistLine = { x0: x, y0: y, x1: endX, y1: endY, width: 32 };
    E._tele(e, 'mistLunge', 0.92, ang);
    e.tele = null; // the detailed lane is rendered above the heavy fog
    return true;
  }
  function mistGrasp(e, p) {
    e.mistCircle = { x: p.x, y: p.y, rad: 57 };
    E._tele(e, 'mistGrasp', 1.10, Math.atan2(p.y - e.y, p.x - e.x));
    e.tele = null;
  }
  function eyeVolley(e, p) {
    var pd = pond(), eyes = [];
    if (!pd) return;
    var count = e.hp < e.maxHp * 0.5 ? 5 : 4;
    for (var i = 0; i < count; i++) {
      var a = (i / count) * TAU + (e.mistCycle || 0) * 0.37;
      var x = p.x + Math.cos(a) * 105, y = p.y + Math.sin(a) * 90;
      if (!clearIsland(pd, x, y)) {
        var spot = islandPoint(pd, p, 65);
        if (!spot) continue;
        x = spot.x; y = spot.y;
      }
      eyes.push({ x: x, y: y });
    }
    if (!eyes.length) return;
    e.mistEyes = eyes;
    e.mistAim = { x: p.x, y: p.y };
    E._tele(e, 'mistVolley', 1.15, Math.atan2(p.y - e.y, p.x - e.x));
    e.tele = null;
  }
  function vanish(e, p) {
    var pd = pond(); if (!pd) return false;
    var spot = islandPoint(pd, p, 95);
    if (!spot) return false;
    e.mistDest = spot;
    e.mistDecoys = [];
    // Three false eye-pairs and one true, more strongly swirling arrival.
    for (var i = 0; i < 3; i++) {
      var fake = islandPoint(pd, p, 70);
      if (fake) e.mistDecoys.push(fake);
    }
    e.state = 'mistFade'; e.t = 0.46; e.mistFadeMax = e.t;
    e.mistCd = e.hp < e.maxHp * 0.5 ? 6.4 : 8.6;
    e.tele = null;
    e.mistCycle = (e.mistCycle || 0) + 1;
    e.dangerous = false;
    return true;
  }
  function fireMistVolley(e) {
    var aim = e.mistAim, eyes = e.mistEyes || [];
    if (!aim) return;
    for (var i = 0; i < eyes.length; i++) {
      var o = eyes[i], a = Math.atan2(aim.y - o.y, aim.x - o.x);
      E.projectiles.push({
        x: o.x, y: o.y, vx: Math.cos(a) * 155, vy: Math.sin(a) * 155,
        r: 5, dmg: e.dmg * 0.55, color: '#e775a2', kind: 'orb',
        hostile: true, life: 1.6, pondShot: true
      });
    }
    e.mistEyes = null; e.mistAim = null;
  }
  // Locked aim before firing: the player can dodge instead of being tracked by
  // the shot after its 900ms warning.
  function aimBloodOrbs(e,p,ang){
    e.projectileAim={x:p.x,y:p.y};
    E._tele(e,'bloodOrbs',0.90,ang);e.tele=null;
  }
  function fireBloodOrbs(e){
    var target=e.projectileAim;
    if(!target)return;
    var aim=Math.atan2(target.y-e.y,target.x-e.x);
    var low=e.hp<e.maxHp*.5,n=low?5:3;
    for(var i=0;i<n;i++)shootB(e,aim+(i-(n-1)/2)*(low?.18:.23),
      low?205:180,e.dmg*.62,'#ff78c7',2.1,6);
    if(CC.fx&&CC.fx.burst)CC.fx.burst(e.x,e.y-15,'#fa6fbc',12,75);
    e.projectileAim=null;
  }
  function brain(e, dt, p, d, ang, f) {
    var low = e.hp < e.maxHp * 0.5, rage = e.hp < e.maxHp * 0.3, sp = e.spd * f * dt * (rage ? 1.45 : low ? 1.2 : 1), k;
    e.anim = e.anim || 0;
    if (e.state !== 'rise') {
      e.summonCd = (e.summonCd === undefined ? 13 : e.summonCd - dt);
      e.mistCd = (e.mistCd === undefined ? 6.0 : e.mistCd - dt);
    }
    if (e.state === 'mistFade') {
      if ((e.t -= dt) <= 0) {
        e.hidden = true; e.state = 'mistHidden'; e.t = 1.05;
      }
      return;
    }
    if (e.state === 'mistHidden') {
      if ((e.t -= dt) <= 0) {
        e.x = e.mistDest.x; e.y = e.mistDest.y; e.hidden = false;
        e.state = 'mistAppear'; e.t = 0.65; e.mistDecoys = [];
        if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y, '#b12857', 12, 70);
      }
      return;
    }
    if (e.state === 'mistAppear') {
      if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.45; }
      return;
    }
    if (e.state === 'rise') { e.invuln = Math.max(e.invuln || 0, 0.1); if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 1.1; } return; }
    if (e.state === 'idle') {
      if (d > 62) mvB(e, Math.cos(ang) * sp, Math.sin(ang) * sp);
      if (!e.s1 && e.hp < e.maxHp * 0.66) { e.s1 = 1; this._tele(e, 'summon', 1.0, ang); e.tele = { kind: 'circle', rad: 120, max: 1.0 }; return; }
      if (!e.s2 && e.hp < e.maxHp * 0.33) { e.s2 = 1; this._tele(e, 'summon', 1.0, ang); e.tele = { kind: 'circle', rad: 120, max: 1.0 }; return; }
      if (e.summonCd <= 0 && activePondMinions() < 5) { this._tele(e, 'summon', 1.0, ang); e.tele = { kind: 'circle', rad: 120, max: 1.0 }; e.summonCd = 13; return; }
      if (e.mistCd <= 0 && d < 350 && vanish(e, p)) return;
      if (e.cd <= 0) {
        e.n = (e.n || 0) + 1; var pick = e.n % 8;
        if (pick === 1 && mistStrike(e, p, ang)) {
          fxText(e.x, e.y - 65, 'MIST LUNGE', '#ffa5bd', 10);
        } else if (pick === 2) {
          mistGrasp(e, p); fxText(p.x, p.y - 36, 'THE MIST GRASPS', '#ff9ab4', 10);
        } else if (pick === 3) {
          eyeVolley(e, p); fxText(e.x, e.y - 65, 'EYES IN THE MIST', '#ffc4cf', 11);
        } else if (pick === 6) {
          aimBloodOrbs(e,p,ang);fxText(e.x,e.y-65,'BLOOD ORBS','#ffb5df',11);
        } else if (pick === 4 && !(p.blindT > 0) && d < 340 && e.los !== false) {
          this._tele(e, 'gaze', 0.95, ang); e.tele = { kind: 'line', ang: ang, len: 340, max: 0.95 };
          fxText(e.x, e.y - 65, 'DO NOT LOOK', '#ff6a6a', 11);
        } else if (pick === 5) {
          this._tele(e, 'tendrils', 0.7, ang);
          e.tele = { kind: 'line', ang: ang, len: 320, max: 0.7 };
        } else this._tele(e, d < 125 ? 'rake' : 'tendrils', 0.75, ang);
        if (e.atk === 'tendrils' && e.tele && e.tele.kind !== 'line') e.tele = { kind: 'line', ang: ang, len: 320, max: 0.7 };
      }
    } else if (e.state === 'telegraph') {
      if ((e.t -= dt) <= 0) {
        e.tele = null;
        if (e.atk === 'mistLunge') {
          var line = e.mistLine;
          e.state = 'recover'; e.t = 0.70;
          if (line) {
            e.x = line.x1; e.y = line.y1;
            if (lineDistance(p.x, p.y, line.x0, line.y0, line.x1, line.y1) <
                line.width + (p.r || 10)) hurtB(p, e, e.dmg * 1.10);
            if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y, '#b5325d', 9, 75);
            e.mistLine = null;
          }
        } else if (e.atk === 'mistGrasp') {
          var circle = e.mistCircle;
          e.state = 'recover'; e.t = 0.75;
          if (circle && Math.hypot(p.x - circle.x, p.y - circle.y) <= circle.rad + (p.r || 10)) {
            if (hurtB(p, e, e.dmg * 0.85)) p.slowT = Math.max(p.slowT || 0, 1.1);
          }
          if (circle) E.projectiles.push({ x: circle.x, y: circle.y, vx: 0, vy: 0,
            r: 0, life: 0.35, ring: circle.rad, color: '#aa426b', fx: true });
          e.mistCircle = null;
        } else if (e.atk === 'mistVolley') {
          e.state = 'recover'; e.t = 0.85; fireMistVolley(e);
        } else if (e.atk === 'bloodOrbs') {
          e.state='recover';e.t=0.8;fireBloodOrbs(e);
        } else if (e.atk === 'rake') {
          e.state = 'act'; e.t = 0.4; if (CC.fx && CC.fx.shake) CC.fx.shake(7);
          if (CC.fx && CC.fx.burst) { CC.fx.burst(e.x + Math.cos(ang) * 24, e.y, '#9ad0c0', 14, 130); }
          E.projectiles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 0, life: 0.35, ring: e.telRad, color: '#5aa090', fx: true });
          if (d < e.telRad + (p.r || 8) && hurtB(p, e, e.dmg * 1.15)) { mvB(p, Math.cos(ang) * 24, Math.sin(ang) * 24); if (CC.Wounds && R() < 0.4) CC.Wounds.apply(p, { dur: 2.5, dps: Math.max(2, e.dmg * 0.3), src: 'claw' }); }
        } else if (e.atk === 'tendrils') {
          e.state = 'recover'; e.t = 0.6; var n = rage ? 9 : low ? 7 : 5;
          for (k = 0; k < n; k++) shootB(e, ang + (k - (n - 1) / 2) * 0.17, 175, e.dmg * 0.55, '#b77ee7', 2.2, 5);
          if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y - 8, '#3a2a58', 10, 90);
        } else if (e.atk === 'hands') {
          e.state = 'recover'; e.t = 0.9; var nh = rage ? 6 : low ? 5 : 4;
          for (k = 0; k < nh; k++) { var a2 = R() * TAU, r2 = k === 0 ? 0 : 24 + R() * 60; this._zone(p.x + Math.cos(a2) * r2, p.y + Math.sin(a2) * r2, 48, 0.8 + k * 0.12, e.dmg * 1.0, e, 'burrow'); }
        } else if (e.atk === 'gaze') {
          e.state = 'recover'; e.t = 0.9;
          E.projectiles.push({ x: e.x, y: e.y - 14, vx: 0, vy: 0, r: 0, life: 0.5, ring: 150, color: '#ff2a2a', fx: true });
          if (CC.fx) { if (CC.fx.shake) CC.fx.shake(5); }
          if (d < 360 && e.los !== false && CC.Wounds && CC.Wounds.blind) CC.Wounds.blind(p, 1.5);
        } else { // bats, teleporting terrors, ghosts and bone warriors rise from the mist
          e.state = 'recover'; e.t = 1.0; fxText(e.x, e.y - e.r * 2.6, 'THE WATER GIVES UP ITS DEAD', '#bfe8dc', 11); if (CC.fx && CC.fx.shake) CC.fx.shake(6);
          summonPond(e, p);
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
    if ((pd.stage === 'calm' || pd.stage === 'talk') && p) {
      var tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), kd = m.kind[ty * m.w + tx], dIsl = Math.hypot(p.x - pd.x, p.y - pd.y);
      if (dIsl < pd.ri * T + 6) { target = 0.97; ftarget = 1; }
      else if (kd === 6) { var u = clamp(((p.x - pd.startX) * -pd.dirx) / Math.max(1, Math.abs(pd.startX - pd.edgeX)), 0, 1); target = 0.02 + 0.93 * Math.pow(u, 1.55); ftarget = clamp((u - 0.75) / 0.25, 0, 1); } // slow at first: you will hardly notice it begin
    } else if (pd.stage === 'turn' || pd.stage === 'fight') { target = 1; ftarget = 1; }
    if (pd.stage === 'talk') ftarget = 0;
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
      pd.turnT += dt; var tt = pd.turnT;
      if (CC.fx && CC.fx.shake && R() < dt * (2 + tt * 0.7)) CC.fx.shake(1 + tt * 0.65);
      if (tt > 1.1 && pd.turnCue < 1) {
        pd.turnCue = 1;
        if (CC.Audio && CC.Audio.play) CC.Audio.play('waterdrop1', { vol: 0.8, gap: 0, vary: 0 });
        fxText(pd.x, pd.y - 84, 'SOMETHING MOVES BELOW', '#a3d2c9', 11);
      }
      if (tt > 2.75 && pd.turnCue < 2) {
        pd.turnCue = 2;
        if (CC.Audio) CC.Audio.event('laugh');
        if (CC.Vfx && CC.Vfx.skyFlash) CC.Vfx.skyFlash('#a31036', 0.2, 0.28);
        if (CC.fx && CC.fx.burst) CC.fx.burst(pd.x, pd.y - 48, '#a41545', 16, 80);
        fxText(pd.x, pd.y - 112, 'THE MERE AWAKENS', '#e36e90', 14);
      }
      if (tt >= TURN_LENGTH) { // she is gone; something else stands where she stood
        pd.stage = 'fight'; if (pd.lady) { pd.lady.hidden = true; }
        if (CC.Audio) { CC.Audio.event('laugh'); CC.Audio.play('pondspawn', { vol: 1, gap: 0, vary: 0 }); } // the lady is gone and the Mere Horror rises
        var b = E.spawn('merehorror', pd.x, pd.y, 2); if (b) { b.maxHp = b.hp = Math.round(b.maxHp * 2); b.dmg = Math.max(1, Math.round(b.dmg * 0.7)); b.mistCd = 6.0; b.mistCycle = 0; b.state = 'rise'; b.t = 1.4; b.miniBoss = true; b.asleep = false; b.cd = 1.5; pd.boss = b; }
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
  DRAWB.pondterror = function (c, e, r, col, dark, t) {
    var sway = Math.sin(t * 6 + (e.anim || 0)) * 2;
    c.save(); c.globalAlpha *= e.state === 'telegraph' ? 0.6 + 0.3 * Math.sin(t * 17) : 0.9;
    c.fillStyle = '#21152f'; c.beginPath(); c.moveTo(-r * 0.9, -r * 0.7);
    c.lineTo(r * 0.9, -r * 0.7); c.lineTo(r * 1.25 + sway, r);
    c.lineTo(0, r * 0.6); c.lineTo(-r * 1.25 + sway, r); c.closePath(); c.fill();
    c.fillStyle = col; c.fillRect(-r * 0.65, -r * 1.25, r * 1.3, r * 0.9);
    c.fillStyle = '#e8c4ff'; c.fillRect(-r * 0.48, -r * 0.98, 3, 3);
    c.fillRect(r * 0.22, -r * 0.98, 3, 3);
    c.strokeStyle = '#9073b5'; c.lineWidth = 1.5; c.beginPath();
    c.moveTo(-r, -r * 0.25); c.lineTo(-r - 5 - sway, r * 0.6);
    c.moveTo(r, -r * 0.25); c.lineTo(r + 5 + sway, r * 0.6); c.stroke();
    c.restore();
  };
  /* ---------- The Drowned Queen (the Mere Horror's body): detailed pixel art, redrawn every frame on a tiny 80x100 canvas and scaled up without smoothing ---------- */
  var QW = 80, QH = 100, QC = null;
  function qHash(a, b) { var s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
  function qCanvas() {
    if (QC || typeof document === 'undefined') return QC;
    function mk() { var cv = document.createElement('canvas'); cv.width = QW; cv.height = QH; return { cv: cv, g: cv.getContext('2d') }; }
    QC = { main: mk(), edge: mk(), hair: mk() }; return QC;
  }
  function drawQueen(g, an, o) {
    var i, k, x, y, s, rage = o.rage, breathe = Math.sin(an * 1.7), pulse = 0.5 + 0.5 * Math.sin(an * 4.2), reach = o.reach;
    var hp = false; // hair and drips are painted on their own layer (no pink rim), so the strands read as hair and not as scribbles
    function R(px, py, w, h, col) { if (hp !== !!o.hairOnly) return; g.fillStyle = col; g.fillRect(Math.round(px), Math.round(py), w, h); }
    function line(x0, y0, x1, y1, col, th) { var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0, q; for (q = 0; q <= n; q++) { var f = n ? q / n : 0; R(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, th || 1, th || 1, col); } }
    g.clearRect(0, 0, QW, QH);
    // ---- the pool: black water with slow ripples ----
    for (y = 86; y < 97; y++) { var hw = 30 * Math.sqrt(1 - Math.pow((y - 91) / 6, 2)); if (isNaN(hw)) continue; R(40 - hw, y, hw * 2, 1, y % 2 ? '#05030a' : '#0a0612'); }
    for (k = 0; k < 3; k++) { var rp = ((an * 0.5 + k / 3) % 1), rw = 6 + rp * 24; g.globalAlpha = 1 - rp; R(40 - rw, 91 + Math.sin(k * 3) * 2, 1, 1, '#4a2a5a'); R(40 + rw, 91 + Math.sin(k * 3) * 2, 1, 1, '#4a2a5a'); g.globalAlpha = 1; }
    // ---- hair behind the head and shoulders: long wet black strands that writhe on their own ----
    function strand(i, front) {
      var side = i % 2 ? 1 : -1, x0 = 40 + side * (12 + (i % 5) * 1.4), y0 = 10 + (i % 4) * 3, L = 32 + (i * 7 % 9) + rage * 4, ph = i * 1.37, amp = 2.4 + rage * 1.8; hp = true;
      for (var q = 0; q < L; q++) { var f = q / L, sx = x0 + side * (f * 5 + Math.pow(f, 2) * 4) + Math.sin(an * 2.1 + ph + f * 6) * amp * (0.4 + f) + Math.cos(an * 1.3 + ph * 2) * f * 2, sy = y0 + q * 1.05 + Math.sin(an * 1.7 + ph) * f * 1.5;
        R(sx, sy, f < 0.3 ? 3 : f < 0.7 ? 2 : 1, 1, (q + i) % 9 === 0 ? '#4a4478' : (q + i) % 4 === 0 ? '#241f3c' : '#0e0b18'); }
      hp = false;
    }
    for (i = 0; i < 6; i++) strand(i, false); // (drawn on the hair layer)
    // ---- the lower body: a tangled mass of submerged roots and tentacles, each moving alone ----
    for (i = 0; i < 9; i++) {
      var dir = (i % 2 ? 1 : -1) * (0.4 + (i % 5) * 0.28), ph2 = i * 2.1, len = 30 + (i % 4) * 3, th = i % 3 === 0 ? 3 : 2;
      for (s = 0; s < len; s++) { var f2 = s / len, tx = 40 + dir * (f2 * 22) + Math.sin(an * 1.6 + ph2 + f2 * 5) * (2 + f2 * 5) + (i - 4) * 1.2 * (1 - f2), ty = 62 + f2 * 28 + Math.abs(Math.sin(an * 1.1 + ph2)) * 2 * f2;
        var w2 = f2 < 0.4 ? th + 1 : f2 < 0.75 ? th : th - 1; R(tx - w2 / 2, ty, w2, 2, i % 2 ? '#1a1024' : '#120a1c'); if (s % 4 === 0) R(tx - w2 / 2, ty, 1, 1, '#3c2650'); if (s % 7 === 3) R(tx, ty, 1, 1, '#241632'); // knots and a wet highlight
        if (f2 > 0.92 && i % 3 === 1) R(tx + dir * 1.5, ty - 1, 1, 2, '#1a1024'); } // a curled tip
    }
    // ---- the torn ceremonial gown: dark violet with tarnished gold trim, ragged strips swaying ----
    for (y = 48; y < 72; y++) {
      var f3 = (y - 48) / 24, hw2 = 9 + f3 * 14 + Math.sin(an * 1.2 + y * 0.4) * 0.6, gl = 40 - hw2, gr = 40 + hw2;
      for (x = Math.floor(gl); x <= gr; x++) { var n3 = qHash(x, y), col = n3 < 0.12 ? '#0d0614' : n3 < 0.4 ? '#321646' : '#27103a'; R(x, y, 1, 1, col); }
      R(gl, y, 1, 1, '#9a7a30'); R(gr, y, 1, 1, '#9a7a30'); if (y % 6 === 2) { R(gl + 1, y, 3, 1, '#6a5020'); R(gr - 3, y, 3, 1, '#6a5020'); }
    }
    for (i = 0; i < 9; i++) { var sx2 = 17 + i * 5.7, sl = 5 + qHash(i, 4) * 7, sway = Math.sin(an * 1.8 + i * 1.4) * 1.5; for (k = 0; k < sl; k++) R(sx2 + sway * (k / sl), 70 + k, i % 2 ? 2 : 3, 1, k === sl - 1 ? '#9a7a30' : k % 3 === 0 ? '#1c0a28' : '#2c1240'); } // torn hem strips
    for (i = 0; i < 6; i++) R(24 + i * 6 + qHash(i, 9) * 3, 54 + qHash(i, 2) * 12, 3, 2, '#08030c'); // rotted holes
    // ---- the torso: emaciated, ribs showing, breathing ----
    for (y = 34; y < 50; y++) { var f4 = (y - 34) / 16, hw3 = 11 - f4 * 4.5 + (y < 40 ? 1 : 0) + breathe * 0.5 * (1 - f4); for (x = Math.floor(40 - hw3); x <= 40 + hw3; x++) { var n4 = qHash(x, y + 20); R(x, y, 1, 1, n4 < 0.18 ? '#26352c' : n4 < 0.3 ? '#241218' : '#4a3038'); } }
    line(29, 36, 40, 35, '#d6c9a6', 1); line(40, 35, 51, 36, '#d6c9a6', 1); // collarbones
    R(40, 35, 1, 15, '#e4d8b6', 1); for (y = 37; y < 49; y += 2) R(40, y, 1, 1, '#9a8f70'); // the spine, knuckled
    for (k = 0; k < 6; k++) { var ry = 38 + k * 2.4, rw = 7.5 - k * 0.55 + breathe * 0.7 * (1 - k * 0.12); for (s = 1; s <= rw; s++) { var yy = ry + Math.pow(s / rw, 2) * 2.2; R(40 - s, yy, 1, 1, k % 2 ? '#c4b794' : '#d6c9a6'); R(40 + s, yy, 1, 1, k % 2 ? '#c4b794' : '#d6c9a6'); } R(40 - rw - 1, ry + 2.2, 1, 1, '#8a7e62'); R(40 + rw + 1, ry + 2.2, 1, 1, '#8a7e62'); }
    // ---- the arms: uneven, skeletal, ending in oversized hooked claws ----
    function arm(sx, sy, ex, ey, hx, hy, ext) {
      var bx = hx + (hx - ex) * ext, by = hy + (hy - ey) * ext; line(sx, sy, ex, ey, '#cfc3a0', 2); line(ex, ey, bx, by, '#c4b794', 2);
      R(sx - 1, sy - 1, 3, 3, '#e4d8b6'); R(ex - 1, ey - 1, 3, 3, '#e4d8b6'); for (var m = 1; m < 6; m++) { var f = m / 6; if (m % 2) R(sx + (ex - sx) * f, sy + (ey - sy) * f + 1, 1, 1, '#4a3038'); } // rot clinging to the bone
      for (var cl = 0; cl < 4; cl++) { var a0 = Math.atan2(by - ey, bx - ex) + (cl - 1.5) * 0.42 + Math.sin(an * 3 + cl) * 0.12, cx0 = bx, cy0 = by, len2 = 8 + (cl % 2) * 2.5 + rage * 1.5; // each claw curls in on itself
        for (var u = 0; u < len2; u++) { var ang = a0 + Math.pow(u / len2, 1.4) * 1.5, px = cx0 + Math.cos(ang) * u * 0.9, py2 = cy0 + Math.sin(ang) * u * 0.9; R(px, py2, u < len2 * 0.7 ? 2 : 1, u < len2 * 0.7 ? 2 : 1, u > len2 - 3 ? '#3a2a2a' : '#eee4c8'); } }
    }
    arm(29, 38, 21 - reach * 4, 52 + reach * 2, 13 - reach * 6, 68 - reach * 3, 0.25); // the long left arm, dragging low
    arm(51, 38, 62, 46, 64 + reach * 5, 34 - reach * 6, 0.2); // the shorter right arm, raised
    for (i = 0; i < 4; i++) { R(30 - i * 2 - Math.sin(an + i) * 0.5, 38 + i * 2, 2, 3, i % 2 ? '#1c0a28' : '#321646'); R(50 + i * 2 + Math.sin(an + i) * 0.5, 38 + i * 2, 2, 3, i % 2 ? '#1c0a28' : '#321646'); } // sleeve rags
    // ---- the head: a rotting, half-exposed skull with a torn, impossibly wide grin ----
    var hcx = 40, hcy = 22, jawOpen = 1.5 + Math.max(0, Math.sin(an * 5.3)) * (2 + rage * 2) + (Math.sin(an * 23) > 0.93 ? 2 : 0); // the jaw twitches
    for (y = -12; y <= 12; y++) { var hw4 = 11 * Math.sqrt(1 - Math.pow(y / 12.5, 2)); for (x = -Math.floor(hw4); x <= hw4; x++) { var n5 = qHash(x + 7, y + 3), edge = x > hw4 - 1.6 ? 1 : 0; var col2 = n5 < 0.16 ? '#5a4038' : n5 < 0.26 ? '#3c5040' : (y < -2 && x > 2 && n5 < 0.5) ? '#6a5446' : '#cfc6aa'; if (edge) col2 = '#8a806a'; R(hcx + x, hcy + y, 1, 1, col2); } }
    R(hcx - 1, hcy + 3, 3, 3, '#14060c'); R(hcx, hcy + 2, 1, 1, '#14060c'); // the nose hole
    for (i = -1; i <= 1; i += 2) { line(hcx + i * 11, hcy + 6, hcx + i * 15, hcy + 1, '#14060c', 1); line(hcx + i * 11, hcy + 7, hcx + i * 14, hcy + 4, '#8a2a3a', 1); R(hcx + i * 15, hcy, 1, 1, '#14060c'); } // torn cheeks, split back toward the ears
    for (i = -1; i <= 1; i += 2) { R(hcx + i * 5 - 2, hcy - 5, 5, 5, '#06020a'); var gl2 = Math.floor(2 + pulse * 1 + rage); g.globalAlpha = 0.35 + 0.3 * pulse; R(hcx + i * 5 - 3, hcy - 6, 7, 7, '#7a0c1a'); g.globalAlpha = 1; R(hcx + i * 5 - 1, hcy - 4, 3, 3, o.flash ? '#ffffff' : pulse > 0.5 ? '#ff3a4a' : '#d4182c'); R(hcx + i * 5, hcy - 3, 1, 1, '#ffd0d0'); } // the red eyes, pulsing
    var my = hcy + 8, mw = 13; // the mouth
    R(hcx - mw, my, mw * 2 + 1, jawOpen + 3, '#0a0208'); // the black opening, wider than any face should allow
    for (x = -mw; x <= mw; x++) { if (x % 2) continue; var th2 = 2 + (qHash(x, 1) * 3 | 0); R(hcx + x, my - 1, 2, th2, qHash(x, 5) < 0.3 ? '#b8ae88' : '#ece3c0'); R(hcx + x, my - 2, 2, 1, '#8a806a'); } // crooked upper teeth
    var jy = my + 3 + jawOpen; for (x = -9; x <= 9; x++) R(hcx + x, jy, 1, 3, x % 4 === 0 ? '#8a806a' : '#cfc6aa'); // the lower jaw
    for (x = -8; x <= 8; x += 2) R(hcx + x, jy - (1 + (qHash(x, 8) * 3 | 0)), 1, 2 + (qHash(x, 8) * 3 | 0), '#ece3c0'); // lower teeth, uneven
    if (jawOpen > 3) R(hcx - 1, my + 2, 3, 2, '#5a1626'); // a glimpse of tongue
    // ---- the crown: crooked and tarnished, one spike broken, a red stone in the tallest ----
    for (x = -10; x <= 10; x++) { var cy = hcy - 12 + Math.floor(x * 0.18) + 1; R(hcx + x, cy, 1, 3, Math.abs(x) % 4 === 0 ? '#6a5018' : '#c8a040'); R(hcx + x, cy, 1, 1, '#f0d070'); }
    var spk = [-9, -5, 0, 5, 9], sh = [6, 8, 11, 5, 7];
    for (i = 0; i < 5; i++) { var bx2 = hcx + spk[i], by2 = hcy - 13 + Math.floor(spk[i] * 0.18); for (k = 0; k < sh[i] - (i === 3 ? 0 : 0); k++) { var wv = Math.max(1, 3 - (k * 3 / sh[i] | 0)); R(bx2 - (wv >> 1), by2 - k, wv, 1, k > sh[i] - 3 ? '#f0d070' : '#c8a040'); } if (i === 3) R(bx2 - 1, by2 - 5, 3, 1, '#0a0615'); } // spike 4 is snapped off
    R(hcx - 1, hcy - 22, 3, 3, '#d02030'); R(hcx, hcy - 21, 1, 1, '#ff8a9a'); for (i = 0; i < 6; i++) R(hcx - 9 + i * 3.5, hcy - 11, 1, 1, '#4a6a40'); // the stone, and green tarnish
    // ---- the hair in front, over the shoulders ----
    for (i = 6; i < 10; i++) strand(i, true);
    // ---- dripping black water ----
    hp = true;
    for (i = 0; i < 12; i++) { var pd = (an * 0.9 + i * 0.173) % 1, dx = i < 4 ? 14 + i * 3 : i < 8 ? 24 + (i - 4) * 9 : 56 + (i - 8) * 3, dy0 = i < 4 ? 70 : i < 8 ? 74 : 40 + (i - 8) * 6, dyy = dy0 + pd * pd * (88 - dy0); g.globalAlpha = 1 - pd * 0.5; R(dx, dyy, 1, 2, '#2a1c3c'); R(dx, dyy, 1, 1, '#7a64a0'); g.globalAlpha = 1; }
    hp = false;
  }
  function drawQueenSprite(c, e, r, an, frac, rage, strike) {
    var Q = qCanvas(); if (!Q) return false;
    drawQueen(Q.main.g, an, { rage: rage, reach: strike, flash: e.flash > 0 }); drawQueen(Q.hair.g, an, { rage: rage, reach: strike, flash: e.flash > 0, hairOnly: true });
    if (e.flash > 0) { var hg = Q.hair.g; hg.globalCompositeOperation = 'source-atop'; hg.globalAlpha = 0.75; hg.fillStyle = '#fff'; hg.fillRect(0, 0, QW, QH); hg.globalAlpha = 1; hg.globalCompositeOperation = 'source-over'; }
    if (e.flash > 0) { var g = Q.main.g; g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.75; g.fillStyle = '#fff'; g.fillRect(0, 0, QW, QH); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    // a 1-pixel pink rim so she stays readable in the pond's fog
    var eg = Q.edge.g, off = [[1, 0], [-1, 0], [0, 1], [0, -1]], i; eg.clearRect(0, 0, QW, QH); eg.globalCompositeOperation = 'source-over';
    for (i = 0; i < 4; i++) eg.drawImage(Q.main.cv, off[i][0], off[i][1]);
    eg.globalCompositeOperation = 'source-in'; eg.fillStyle = '#f0a8c4'; eg.fillRect(0, 0, QW, QH); eg.globalCompositeOperation = 'source-over';
    var S = (r / 24) * 1.25; c.save(); c.imageSmoothingEnabled = false;
    c.drawImage(Q.edge.cv, -QW / 2 * S, r * 0.84 - 92 * S, QW * S, QH * S); c.drawImage(Q.main.cv, -QW / 2 * S, r * 0.84 - 92 * S, QW * S, QH * S); c.drawImage(Q.hair.cv, -QW / 2 * S, r * 0.84 - 92 * S, QW * S, QH * S);
    c.restore(); return true;
  }

  // Persistent demon is the same horned, red-eyed shadow/skull that forms
  // during the transformation. Stylized canvas sprite; no large texture upload.
  DRAWB.merehorror = function (c, e, r, col, dark, t) {
    var an = e.anim || t, frac = clamp(e.hp / Math.max(1, e.maxHp), 0, 1);
    var alpha = e.state === 'mistFade' ? clamp(e.t / 0.46, 0, 1) :
      e.state === 'mistAppear' ? 1 - clamp(e.t / 0.65, 0, 1) : 1;
    if (e.hidden || e.state === 'mistHidden' || alpha <= 0.015) return;
    var rage = 1 - frac, pulse = 0.5 + 0.5 * Math.sin(an * 4), sw = Math.sin(an * 3) * 4;
    var rising = e.state === 'rise' ? sm(1 - e.t / 1.4) : 1;
    c.save(); c.globalAlpha *= alpha;
    c.translate(0, (1 - rising) * r * 2.7);
    var strk = (e.atk === 'mistLunge' || e.atk === 'rake') ? (e.state === 'telegraph' ? 1 : 0.4) : 0;
    if (drawQueenSprite(c, e, r, an, frac, rage, strk)) { c.restore(); return; } // the Drowned Queen (pixel art); the older vector body below is only a fallback
    // Murky pool at its feet.
    c.fillStyle = 'rgba(12,8,22,0.85)'; c.beginPath();
    c.ellipse(0, r * 0.79, r * 1.8, r * 0.44, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(230,97,127,0.38)'; c.lineWidth = 1.4;
    c.beginPath(); c.ellipse(0, r * 0.79, r * (1.0 + pulse * 0.5), r * (0.25 + pulse * 0.10), 0, 0, TAU); c.stroke();
    // Eight unmistakable shadow tentacles and the jagged gown.
    c.lineCap = 'round';
    for (var i = 0; i < 8; i++) {
      var a = i * TAU / 8 + 0.22, dx = Math.cos(a) * (r * 2 + (i % 3) * 5);
      var dy = r * 0.30 + Math.sin(a) * r * 0.72;
      c.strokeStyle = i % 2 ? '#43132f' : '#130c20'; c.lineWidth = i % 2 ? 5 : 7;
      c.beginPath(); c.moveTo(Math.cos(a) * 7, -r * 0.1);
      c.bezierCurveTo(dx * 0.35, -r * 1.5 + sw, dx * 0.9 + Math.sin(an * 2 + i) * 7,
        dy - 35, dx, dy + Math.cos(an * 2 + i) * 5); c.stroke();
    }
    c.fillStyle = e.flash > 0 ? '#fff0f5' : '#200e24';
    c.beginPath(); c.moveTo(-r * 0.58, -r * 1.40);
    c.lineTo(r * 0.58, -r * 1.40);
    c.lineTo(r * 0.83, r * 0.68); c.lineTo(r * 0.28, r * 0.38);
    c.lineTo(0, r * 0.92); c.lineTo(-r * 0.3, r * 0.41);
    c.lineTo(-r * 0.9, r * 0.71); c.closePath(); c.fill();
    // Rib fragments betray the human shape buried inside the shadow.
    c.strokeStyle = '#8c6278'; c.lineWidth = 2;
    for (i = 0; i < 4; i++) {
      c.beginPath(); c.moveTo(-r * 0.36, -r * (0.76 - i * 0.22));
      c.quadraticCurveTo(0, -r * (0.59 - i * 0.22), r * 0.36, -r * (0.76 - i * 0.22)); c.stroke();
    }
    // From the transformation: crooked crown, black skull, red eyes.
    var hy = -r * 1.95 + Math.sin(an * 1.6) * 2;
    c.fillStyle = '#0a0615'; c.beginPath(); c.ellipse(0, hy, r * 0.78, r * 0.90, 0, 0, TAU); c.fill();
    c.strokeStyle = '#a35f89'; c.lineWidth = 1.8;
    c.beginPath(); c.ellipse(0, hy, r * 0.78, r * 0.90, 0, Math.PI * 0.12, Math.PI * 0.88); c.stroke();
    c.fillStyle = '#16091a';
    for (i = 0; i < 5; i++) {
      var hx = (i - 2) * r * 0.32;
      c.beginPath(); c.moveTo(hx - 4, hy - r * 0.55);
      c.lineTo(hx + (i - 2) * 4, hy - r * (1.45 + (i % 2) * 0.35));
      c.lineTo(hx + 5, hy - r * 0.45); c.closePath(); c.fill();
    }
    // Long claws emerging from sleeves, moving to preview attacks.
    var strike = e.atk === 'mistLunge' || e.atk === 'rake', reach = strike && e.state === 'telegraph' ? 0.5 : 0;
    c.strokeStyle = '#aa708e'; c.lineWidth = 6;
    for (i = -1; i <= 1; i += 2) {
      var ex = i * r * (1.65 + reach), ey = -r * (0.20 + reach * 0.7) + sw * i;
      c.beginPath(); c.moveTo(i * r * 0.52, -r * 1.28);
      c.quadraticCurveTo(i * r * 1.25, -r * 0.96, ex, ey); c.stroke();
      c.strokeStyle = '#f0afc4'; c.lineWidth = 1.7;
      for (var claw = -1; claw <= 1; claw++) {
        c.beginPath(); c.moveTo(ex, ey);
        c.lineTo(ex + i * (9 + rage * 4), ey + claw * 7 + 7); c.stroke();
      }
      c.strokeStyle = '#aa708e'; c.lineWidth = 6;
    }
    c.fillStyle = e.flash > 0 ? '#ffffff' : '#ff365c';
    c.fillRect(-r * 0.50, hy - r * 0.14, r * 0.29, r * 0.15);
    c.fillRect(r * 0.21, hy - r * 0.14, r * 0.29, r * 0.15);
    c.fillStyle = '#07020a'; c.beginPath(); c.ellipse(0, hy + r * 0.47, r * 0.32, r * 0.20 + pulse * r * 0.06, 0, 0, TAU); c.fill();
    c.strokeStyle = '#ed87a5'; c.lineWidth = 1.4; c.beginPath();
    c.moveTo(-r * 0.33, hy + r * 0.45); c.quadraticCurveTo(0, hy + r * 0.82, r * 0.33, hy + r * 0.45); c.stroke();
    c.restore();
  };

  // This pass happens AFTER darkness/fog; it is the readable demon/telegraph
  // layer, rather than a second drawing under the same opaque mist.
  function mistEye(c, x, y, a, t, scale) {
    c.save(); c.globalAlpha *= a;
    c.fillStyle = '#130718'; c.beginPath(); c.ellipse(x, y, 13 * scale, 7 * scale, 0, 0, TAU); c.fill();
    c.fillStyle = '#ff3b61';
    c.fillRect(x - 8 * scale, y - 2 * scale, 5 * scale, 3 * scale);
    c.fillRect(x + 3 * scale, y - 2 * scale, 5 * scale, 3 * scale);
    c.restore();
  }
  function mistTelegraph(c, e, cam, t) {
    if (e.state === 'telegraph' && e.atk === 'mistLunge' && e.mistLine) {
      var ln = e.mistLine, dx = ln.x1 - ln.x0, dy = ln.y1 - ln.y0;
      var angle = Math.atan2(dy, dx), len = Math.hypot(dx, dy);
      var progress = 1 - clamp(e.t / 0.92, 0, 1);
      c.save(); c.translate(ln.x0 - cam.x, ln.y0 - cam.y); c.rotate(angle);
      c.fillStyle = 'rgba(163,30,69,' + (0.18 + progress * 0.20) + ')';
      c.fillRect(0, -ln.width, len, ln.width * 2);
      c.strokeStyle = '#ff9eae'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -ln.width); c.lineTo(len, -ln.width);
      c.moveTo(0, ln.width); c.lineTo(len, ln.width); c.stroke();
      c.fillStyle = '#ff456e'; c.fillRect(len * progress - 4, -ln.width, 8, ln.width * 2);
      mistEye(c, len, -11, 0.8, t, 0.8);
      c.restore();
    }
    if (e.state === 'telegraph' && e.atk === 'mistGrasp' && e.mistCircle) {
      var mk = e.mistCircle, pr = 1 - clamp(e.t / 1.10, 0, 1);
      c.save(); c.strokeStyle = '#ff83a3'; c.lineWidth = 2;
      c.fillStyle = 'rgba(144,26,66,' + (0.14 + 0.25 * pr) + ')';
      c.beginPath(); c.arc(mk.x - cam.x, mk.y - cam.y, mk.rad, 0, TAU); c.fill(); c.stroke();
      c.beginPath(); c.arc(mk.x - cam.x, mk.y - cam.y, mk.rad * (1 - pr), 0, TAU); c.stroke();
      for (var k = 0; k < 5; k++) {
        var a = k * TAU / 5 + t * 0.22;
        mistEye(c, mk.x - cam.x + Math.cos(a) * mk.rad * 0.76,
          mk.y - cam.y + Math.sin(a) * mk.rad * 0.76, pr * 0.8, t, 0.60);
      }
      c.restore();
    }
    if(e.state==='telegraph'&&e.atk==='bloodOrbs'&&e.projectileAim){
      var aim=e.projectileAim,pr=1-clamp(e.t/.90,0,1);
      var sx=e.x-cam.x,sy=e.y-cam.y-22;
      c.save();c.strokeStyle='rgba(255,140,206,'+(0.36+0.55*pr)+')';
      c.lineWidth=2;c.setLineDash([5,5]);c.beginPath();c.moveTo(sx,sy);
      c.lineTo(aim.x-cam.x,aim.y-cam.y);c.stroke();c.setLineDash([]);
      c.strokeStyle='#ffc9eb';c.lineWidth=2.3;c.beginPath();
      c.arc(sx,sy,9+15*pr,0,TAU);c.stroke();
      c.fillStyle='#ff99cd';
      for(var bi=0;bi<3;bi++){var ba=t*3+bi*TAU/3;
        c.beginPath();c.arc(sx+Math.cos(ba)*17,sy+Math.sin(ba)*17,3+2*pr,0,TAU);c.fill();}
      c.restore();
    }
    if (e.state === 'telegraph' && e.atk === 'mistVolley' && e.mistEyes) {
      var q = 1 - clamp(e.t / 1.15, 0, 1);
      for (var j = 0; j < e.mistEyes.length; j++) {
        var eyePos = e.mistEyes[j], ex = eyePos.x - cam.x, ey = eyePos.y - cam.y;
        if (ex < -35 || ey < -35 || ex > cam.w + 35 || ey > cam.h + 35) continue;
        mistEye(c, ex, ey, 0.30 + 0.65 * q, t, 1.0 + 0.2 * Math.sin(t * 8 + j));
        if (e.mistAim) {
          c.strokeStyle = 'rgba(255,132,168,' + (0.12 + 0.38 * q) + ')';
          c.lineWidth = 1.2; c.beginPath(); c.moveTo(ex, ey);
          c.lineTo(e.mistAim.x - cam.x, e.mistAim.y - cam.y); c.stroke();
        }
      }
    }
  }
  // Redraw shots and the hero's slash/projectile layer after the dense fog.
  // All draw calls here are visual only; combat and collision run exactly once.
  HP.drawCombatFocus=function(c,cam){
    var pd=pond(),p=hero();
    if(!pd||!p||pd.h<.15||pd.stage!=='fight')return;
    var px=p.x/T-pd.cx,py=(p.y/T-pd.cy)*(pd.R/pd.ry);
    if(px*px+py*py>(pd.R+12)*(pd.R+12))return;
    if(CC.Classes&&CC.Classes.drawPondCombat)CC.Classes.drawPondCombat(c,cam);
    if(!E||!E.projectiles)return;
    for(var i=0;i<E.projectiles.length&&i<120;i++){
      var q=E.projectiles[i];if(!q.hostile||q.fx)continue;
      var dx=q.x/T-pd.cx,dy=(q.y/T-pd.cy)*(pd.R/pd.ry);
      if(dx*dx+dy*dy>(pd.R+12)*(pd.R+12))continue;
      var x=q.x-cam.x,y=q.y-cam.y;
      if(x<-20||y<-20||x>cam.w+20||y>cam.h+20)continue;
      var r=Math.max(3,q.r||4),a=Math.atan2(q.vy||0,q.vx||1);
      c.save();
      c.fillStyle='rgba(4,0,12,.86)';c.beginPath();c.arc(x,y,r+5,0,TAU);c.fill();
      c.fillStyle=q.pondShot?'rgba(255,93,173,.55)':'rgba(255,214,154,.40)';
      c.beginPath();c.arc(x,y,r+3,0,TAU);c.fill();
      c.strokeStyle=q.pondShot?'#ffd4f2':'#fff1c8';c.lineWidth=1.7;
      c.beginPath();c.arc(x,y,r+2,0,TAU);c.stroke();
      c.fillStyle=q.color||'#ff78c7';c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
      c.fillStyle='#ffffff';c.beginPath();c.arc(x,y,Math.max(1,r*.45),0,TAU);c.fill();
      c.strokeStyle=q.pondShot?'#ff7fc5':'#ffcf91';c.lineWidth=2.2;
      c.beginPath();c.moveTo(x-Math.cos(a)*(r+5),y-Math.sin(a)*(r+5));
      c.lineTo(x-Math.cos(a)*(r+13),y-Math.sin(a)*(r+13));c.stroke();
      c.restore();
    }
  };
  HP.drawBossFocus = function (c, cam) {
    var pd = pond(), boss = pd && pd.boss;
    if (!pd || pd.stage !== 'fight' || !boss || boss.dead || boss.hp <= 0) return;
    var t = Date.now() / 1000, x = boss.x - cam.x, y = boss.y - cam.y;
    c.save();
    mistTelegraph(c, boss, cam, t);
    // A few persistent eyes peering from the fog; the boss can use them to
    // telegraph a vanishing act without masking the player's sprite.
    var count = boss.state === 'mistHidden' ? 0 : 4;
    for (var i = 0; i < count; i++) {
      var a = i * TAU / count + t * 0.13, rr = 94 + i * 26;
      var ex = boss.x + Math.cos(a) * rr - cam.x, ey = boss.y + Math.sin(a) * rr * 0.65 - cam.y;
      if (ex > -24 && ex < cam.w + 24 && ey > -24 && ey < cam.h + 24)
        mistEye(c, ex, ey, 0.23 + 0.30 * Math.sin(t * 1.6 + i) ** 2, t, 0.6);
    }
    if (boss.state === 'mistFade' || boss.state === 'mistHidden' || boss.state === 'mistAppear') {
      var decoys = boss.mistDecoys || [], dest = boss.mistDest;
      for (i = 0; i < decoys.length; i++) {
        var d = decoys[i];
        mistEye(c, d.x - cam.x, d.y - cam.y, 0.38 + 0.20 * Math.sin(t * 5 + i) ** 2, t, 1);
      }
      if (dest) {
        var bx = dest.x - cam.x, by = dest.y - cam.y;
        // True arrival is marked by an obvious bright ring, not a surprise hit.
        c.strokeStyle = 'rgba(255,144,182,0.92)'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(bx, by + 8, 25, 11, 0, 0, TAU); c.stroke();
        mistEye(c, bx, by - 56, 0.8 + 0.20 * Math.sin(t * 9) ** 2, t, 1.4);
      }
    }
    if (boss.hidden || x < -100 || x > cam.w + 100 || y < -140 || y > cam.h + 100) {
      c.restore(); return;
    }
    // Sharp contrasting rim, dark local aura, and a full-opacity horned body.
    var halo = c.createRadialGradient(x, y - 42, 8, x, y - 42, 77);
    halo.addColorStop(0, 'rgba(10,5,21,0.57)');
    halo.addColorStop(1, 'rgba(10,5,21,0)');
    c.fillStyle = halo; c.fillRect(x - 85, y - 130, 170, 170);
    c.strokeStyle = '#f3b1c5'; c.lineWidth = 1.3;
    c.beginPath(); c.ellipse(x, y + 17, 34, 14, 0, 0, TAU); c.stroke();
    c.translate(x, y);
    c.scale(boss.face || 1, 1);
    DRAWB.merehorror(c, boss, boss.r || 24, boss.color || '#281126', '#14071b', t);
    c.restore();
  };
  if (F && !F._pondDraw) {
    F._pondDraw = true; var prevDraw = F.drawMonster;
    F.drawMonster = function (ctx, e, r, col, dark, t) { var fn = DRAWB[e.type]; if (fn) { fn(ctx, e, r, col, dark, t); return true; } return prevDraw ? prevDraw.apply(this, arguments) : false; };
  }
})(window);
