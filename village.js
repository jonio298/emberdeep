/* CC.AbandonedVillage - the abandoned village beyond the Rocky Pass, and the cellar under one of its houses.
 *
 * You arrive by day on a road through a wood. The nearer you get, the darker it grows: the sky goes yellow-grey, rain sets in, thunder rolls and
 * yellow lightning flashes, the trees blacken and open eyes, apparitions fade in and out between the trunks. The village itself is crumbling:
 * houses with fallen walls and roofs, shuttered windows hanging by a hinge, rubble, overgrown ivy; a walled graveyard in the north-east where the
 * ghosts of the village linger (they are not hostile: they fade in and out, and you can speak to them); a ruined chapel; loot in the houses.
 * One house hides a trapdoor to a cellar full of monsters, with two loot rooms and a hidden vault.
 *
 *   generate(seed) -> map           generateCellar(seed) -> map           enter() / leave()    (the shell swaps the area)
 *   interact()  ghosts, the trapdoor, the stairs, the road back       drawOverlay(c,W,H)   title + speech
 *   ground/detail/solid/after       the Realm callbacks (weather, lightning, rain, eyes and apparitions live in `after`)
 * Quest hook: talking to the ghosts sets V.heard; the last ghost mentions the "one beneath the chapel" (a later quest). Progress is saved with the
 * quest blob (`vil`).
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, T = CC.TILE || 32, TAU = Math.PI * 2, V = CC.AbandonedVillage = { heard: {}, hook: 0, map: null, cellar: null, speech: null, title: 0 };
  var W = 112, H = 78, CW = 64, CH = 50;
  function R() { return Math.random(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sm(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function hash(x, y) { var n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function seeded(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function mix(a, b, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; }
  function css(a) { return 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')'; }
  function parse(c) { if (c.charAt(0) === '#') { var n = parseInt(c.substr(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; } var m = c.match(/\d+/g); return m ? [+m[0], +m[1], +m[2]] : [90, 110, 70]; }
  function hero() { var s = CC.state; return s && s.player && !s.player.stub ? s.player : null; }
  function fxText(x, y, s, c, z) { if (CC.fx && CC.fx.text) CC.fx.text(x, y, s, c, z); }
  function oval(c, x, y, rx, ry, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.max(0.2, rx), Math.max(0.2, ry), 0, 0, TAU); c.fill(); }
  function line(c, x, y, x2, y2, col, w) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); }
  function village() { var s = CC.state; return s && s.area === 'village' && V.map && CC.Dungeon === V.map ? V.map : null; }

  /* =================== the village map =================== */
  function build(rng) {
    var N = W * H, tiles = new Uint8Array(N).fill(1), kind = new Uint8Array(N).fill(3), art = new Uint8Array(N), props = [], lights = [], chests = [], i, x, y, k;
    V.trap = null;
    function at(tx, ty) { return ty * W + tx; }
    function open(x, y, kd) { if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return; tiles[at(x, y)] = 0; kind[at(x, y)] = kd; }
    function disc(cx, cy, r, kd) { for (var yy = Math.floor(cy - r); yy <= cy + r; yy++) for (var xx = Math.floor(cx - r); xx <= cx + r; xx++) if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r) open(xx, yy, kd); }
    var sy0 = 39, plazaX = 82, plazaY = 39;
    function mean(x) { return sy0 + Math.round(3 * Math.sin(x * 0.13)); }
    for (x = 2; x < 64; x++) { var hw = 7 + Math.round(3 * Math.sin(x * 0.2 + 1)); for (y = mean(x) - hw; y <= mean(x) + hw; y++) open(x, y, 0); } // the wood: a wide, open way
    for (y = 10; y < H - 10; y++) for (x = 56; x < W - 4; x++) { var ex = (x - 84) / 28, ey = (y - 39) / 29; if (ex * ex + ey * ey <= 1) open(x, y, 0); } // the village clearing
    for (x = 2; x <= plazaX; x++) disc(x, x < 60 ? mean(x) : plazaY - Math.round((plazaY - mean(60)) * Math.max(0, (66 - x) / 6)), 1.6, 2); // the road
    disc(plazaX, plazaY, 5.5, 2);
    var res = new Uint8Array(N);
    function reserveRect(x0, y0, w, h, m) { for (var yy = y0 - m; yy < y0 + h + m; yy++) for (var xx = x0 - m; xx < x0 + w + m; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) res[at(xx, yy)] = 1; }
    for (x = 2; x <= plazaX; x++) { var ry = x < 60 ? mean(x) : plazaY; for (y = ry - 3; y <= ry + 3; y++) res[at(x, y)] = 1; }
    for (y = plazaY - 7; y <= plazaY + 7; y++) for (x = plazaX - 7; x <= plazaX + 7; x++) res[at(x, y)] = 1;
    // houses: x, y, w, h, door {side, pos}; interior floor kind 1; walls kind 8 (art 1 stone, 2 timber, 3 chapel stone)
    var HOUSES = [
      { x: 62, y: 27, w: 9, h: 7, door: ['s', 4], art: 2, name: 'cottage' }, { x: 62, y: 45, w: 9, h: 7, door: ['n', 4], art: 1, name: 'cottage' },
      { x: 71, y: 18, w: 8, h: 7, door: ['s', 3], art: 2, name: 'cottage' }, { x: 71, y: 54, w: 9, h: 8, door: ['n', 4], art: 1, name: 'cellar' },
      { x: 92, y: 28, w: 9, h: 8, door: ['w', 4], art: 2, name: 'cottage' }, { x: 90, y: 43, w: 13, h: 11, door: ['w', 5], art: 3, name: 'chapel' }
    ];
    var interiors = [];
    HOUSES.forEach(function (hs, hi) {
      reserveRect(hs.x, hs.y, hs.w, hs.h, 2);
      for (y = hs.y; y < hs.y + hs.h; y++) for (x = hs.x; x < hs.x + hs.w; x++) {
        var edge = x === hs.x || y === hs.y || x === hs.x + hs.w - 1 || y === hs.y + hs.h - 1;
        if (edge) { tiles[at(x, y)] = 1; kind[at(x, y)] = 8; art[at(x, y)] = hs.art; } else { tiles[at(x, y)] = 0; kind[at(x, y)] = 1; }
      }
      var dx = hs.door[0] === 'w' ? hs.x : hs.door[0] === 'e' ? hs.x + hs.w - 1 : hs.x + hs.door[1], dy = hs.door[0] === 'n' ? hs.y : hs.door[0] === 's' ? hs.y + hs.h - 1 : hs.y + hs.door[1];
      for (k = 0; k < (hs.name === 'chapel' ? 2 : 1); k++) { var ddx = hs.door[0] === 'w' || hs.door[0] === 'e' ? dx : dx + k, ddy = hs.door[0] === 'w' || hs.door[0] === 'e' ? dy + k : dy; tiles[at(ddx, ddy)] = 0; kind[at(ddx, ddy)] = 2; art[at(ddx, ddy)] = 0; }
      // the walls have fallen in places: breaches (rubble you can walk through)
      var br = hs.name === 'chapel' ? 4 : 2;
      for (k = 0; k < br; k++) { var bx, by; if (rng() < 0.5) { bx = hs.x + 1 + Math.floor(rng() * (hs.w - 2)); by = rng() < 0.5 ? hs.y : hs.y + hs.h - 1; } else { bx = rng() < 0.5 ? hs.x : hs.x + hs.w - 1; by = hs.y + 1 + Math.floor(rng() * (hs.h - 2)); } if (tiles[at(bx, by)] && kind[at(bx, by)] === 8) { tiles[at(bx, by)] = 0; kind[at(bx, by)] = 2; art[at(bx, by)] = 9; } }
      interiors.push(hs);
    });
    function placeProp(draw, px, py, sortY) { var o = { x: px, y: py, sortY: sortY || 0, draw: draw, reveal: false }; props.push(o); return o; }
    // furnishing (all rotten and overturned) and a chest in most houses
    HOUSES.forEach(function (hs, hi) {
      var cx = hs.x + hs.w / 2, cy = hs.y + hs.h / 2, n = hs.name === 'chapel' ? 14 : 6;
      for (k = 0; k < n; k++) {
        var fx = hs.x + 1.4 + rng() * (hs.w - 2.8), fy = hs.y + 1.4 + rng() * (hs.h - 2.8), kd = Math.floor(rng() * 7), seed = rng();
        placeProp(function (c, sx, sy, t, cam, pr) { furniture(c, sx, sy, pr.kd, pr.seed); }, fx * T, fy * T).kd = kd; props[props.length - 1].seed = seed;
      }
      // beams of the fallen roof across the room
      for (k = 0; k < (hs.name === 'chapel' ? 6 : 3); k++) placeProp((function (s2) { return function (c, sx, sy) { fallenBeam(c, sx, sy, s2); }; })(rng()), (hs.x + 1.5 + rng() * (hs.w - 3)) * T, (hs.y + 1.5 + rng() * (hs.h - 3)) * T, 2);
      if (hs.name !== 'cellar') { var cxk = hs.x + 2 + Math.floor(rng() * (hs.w - 4)), cyk = hs.y + 2 + Math.floor(rng() * (hs.h - 4)); chests.push({ tx: cxk, ty: cyk, x: cxk * T + 16, y: cyk * T + 16, opened: false, tier: hs.name === 'chapel' ? 2 : 1 }); }
      else { var tdx = hs.x + 4, tdy = hs.y + 4; V.trap = { x: tdx * T + 16, y: tdy * T + 16 }; placeProp(function (c, sx, sy, t) { trapdoor(c, sx, sy, t); }, V.trap.x, V.trap.y, -4); }
    });
    // the well, a cart, a toppled signpost and the dead tree on the square
    placeProp(function (c, sx, sy) { well(c, sx, sy); }, (plazaX + 3) * T, (plazaY - 3) * T, 6); tiles[at(plazaX + 3, plazaY - 3)] = 1; kind[at(plazaX + 3, plazaY - 3)] = 9; art[at(plazaX + 3, plazaY - 3)] = 20;
    placeProp(function (c, sx, sy) { cart(c, sx, sy); }, (plazaX - 4) * T, (plazaY + 3) * T, 6);
    chests.push({ tx: plazaX - 4, ty: plazaY + 3, x: (plazaX - 4) * T + 16, y: (plazaY + 3) * T + 32, opened: false, tier: 1 });
    // graveyard: fenced, with tombstones, a mausoleum and the ghosts
    var GX0 = 84, GY0 = 8, GX1 = 106, GY1 = 22;
    reserveRect(GX0, GY0, GX1 - GX0 + 1, GY1 - GY0 + 1, 1);
    for (y = GY0; y <= GY1; y++) for (x = GX0; x <= GX1; x++) {
      var fence = x === GX0 || x === GX1 || y === GY0 || y === GY1;
      if (fence) { tiles[at(x, y)] = 1; kind[at(x, y)] = 7; } else { tiles[at(x, y)] = 0; kind[at(x, y)] = 4; }
    }
    for (x = 94; x <= 96; x++) { tiles[at(x, GY1)] = 0; kind[at(x, GY1)] = 2; } // the gate
    for (y = GY1; y < 28; y++) for (x = 94; x <= 96; x++) open(x, y, 2); // the lane from the gate down to the square
    for (y = 28; y <= plazaY; y++) disc(95 - Math.round((95 - plazaX) * (y - 28) / (plazaY - 28)), y, 1.4, 2);
    var tombs = [], ghostSpots = [];
    for (i = 0; i < 90 && tombs.length < 34; i++) {
      var tx = GX0 + 2 + Math.floor(rng() * (GX1 - GX0 - 3)), ty = GY0 + 2 + Math.floor(rng() * (GY1 - GY0 - 7));
      if (tiles[at(tx, ty)] || kind[at(tx, ty)] !== 4) continue; var near = false; tombs.forEach(function (q) { if (Math.abs(q[0] - tx) < 2 && Math.abs(q[1] - ty) < 2) near = true; }); if (near) continue;
      if (tx > 91 && tx < 99 && ty < GY0 + 6) continue; // leave room for the mausoleum
      tombs.push([tx, ty]); tiles[at(tx, ty)] = 1; kind[at(tx, ty)] = 9; art[at(tx, ty)] = 1 + Math.floor(rng() * 5);
    }
    // the mausoleum (decor walls with a dark doorway), against the north fence
    for (y = GY0 + 1; y <= GY0 + 4; y++) for (x = 92; x <= 98; x++) { tiles[at(x, y)] = 1; kind[at(x, y)] = 8; art[at(x, y)] = 3; }
    tiles[at(95, GY0 + 4)] = 0; kind[at(95, GY0 + 4)] = 2; for (y = GY0 + 1; y <= GY0 + 3; y++) { /* a tiny crypt behind the door */ } tiles[at(95, GY0 + 3)] = 0; kind[at(95, GY0 + 3)] = 1; tiles[at(95, GY0 + 2)] = 0; kind[at(95, GY0 + 2)] = 1;
    chests.push({ tx: 95, ty: GY0 + 2, x: 95 * T + 16, y: (GY0 + 2) * T + 16, opened: false, tier: 2 });
    var gh = [[88, 14], [101, 14], [90, 19], [100, 19], [95, 17]];
    gh.forEach(function (g) { for (var tries = 0; tries < 12 && (tiles[at(g[0], g[1])] || kind[at(g[0], g[1])] !== 4); tries++) { g = [g[0] + (rng() < 0.5 ? -1 : 1), g[1] + (rng() < 0.5 ? -1 : 1)]; } ghostSpots.push({ x: g[0] * T + 16, y: g[1] * T + 16 }); });
    // trees: scattered through the wood and the clearing (they will watch you); a dense, dead edge
    var trees = [];
    for (i = 0; i < 900 && trees.length < 230; i++) {
      var tx2 = 4 + Math.floor(rng() * (W - 8)), ty2 = 4 + Math.floor(rng() * (H - 8)); if (tiles[at(tx2, ty2)] || kind[at(tx2, ty2)] !== 0 || res[at(tx2, ty2)]) continue;
      kind[at(tx2, ty2)] = 3; tiles[at(tx2, ty2)] = 1; trees.push([tx2, ty2]);
    }
    // rubble and tall dead grass scattered about; a few more chests among the ruins
    var spawn = { x: 5 * T + 16, y: mean(5) * T + 16 };
    props.push({ x: spawn.x - 26, y: spawn.y - 6, sortY: 4, reveal: false, draw: function (c, sx, sy) { c.fillStyle = '#3a2a1c'; c.fillRect(sx - 2, sy - 22, 4, 28); c.fillStyle = '#5a4430'; c.fillRect(sx - 18, sy - 28, 34, 12); c.strokeStyle = '#2a1c10'; c.lineWidth = 1; c.strokeRect(sx - 18, sy - 28, 34, 12); c.fillStyle = '#e8dcc4'; c.font = '7px Georgia'; c.textAlign = 'center'; c.fillText('ROCKY PASS', sx - 1, sy - 19); c.textAlign = 'left'; } });
    var CH2 = [[60, 31], [78, 30]]; // chests off in the ruins
    CH2.forEach(function (q, qi) { var ctx2 = q[0], cty = q[1]; if (!tiles[at(ctx2, cty)] && kind[at(ctx2, cty)] === 0) chests.push({ tx: ctx2, ty: cty, x: ctx2 * T + 16, y: cty * T + 16, opened: false, tier: 1 }); });
    // lights: a dim glow in the chapel and at the mausoleum (candles that should not be lit), a lantern on the square
    lights.push({ x: 96 * T, y: 44 * T, r: 150, color: '255,200,120', inten: 0.35, flicker: 0.18 }, { x: 95 * T + 16, y: (GY0 + 3) * T, r: 110, color: '140,200,255', inten: 0.4, flicker: 0.1 }, { x: plazaX * T, y: plazaY * T, r: 130, color: '255,170,70', inten: 0.3, flicker: 0.2 });
    // spawns: the dead walk the wood and the ruins (cellar monsters are separate)
    var spawns = [], types = ['skeleton', 'ghoul', 'ghost', 'bat', 'spider'];
    for (i = 0; i < 40; i++) { var sxp = 22 + Math.floor(rng() * (W - 36)), syp = 12 + Math.floor(rng() * (H - 24)); if (tiles[at(sxp, syp)] || kind[at(sxp, syp)] === 4 || res[at(sxp, syp)] && kind[at(sxp, syp)] === 1 || Math.hypot(sxp - 5, syp - mean(5)) < 18) continue; if (sxp > 80 && syp < 24) continue; spawns.push({ x: sxp * T + 16, y: syp * T + 16, type: types[Math.floor(rng() * types.length)] }); }
    // reachability: spawn must reach every chest, the trapdoor, the ghosts and the plaza
    var seen = new Uint8Array(N), q = [at(Math.round(spawn.x / T), Math.round(spawn.y / T))], qi = 0; seen[q[0]] = 1;
    while (qi < q.length) { var c0 = q[qi++], x0 = c0 % W, y0 = (c0 / W) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var xx = x0 + d[0], yy = y0 + d[1]; if (xx < 0 || yy < 0 || xx >= W || yy >= H) return; var ni = at(xx, yy); if (seen[ni] || tiles[ni]) return; seen[ni] = 1; q.push(ni); }); }
    var ok = seen[at(plazaX, plazaY)] === 1 && V.trap && seen[at(Math.round(V.trap.x / T), Math.round(V.trap.y / T))] === 1;
    chests.forEach(function (ch) { if (!seen[at(ch.tx, ch.ty)]) ok = false; });
    ghostSpots.forEach(function (g) { if (!seen[at(Math.floor(g.x / T), Math.floor(g.y / T))]) ok = false; });
    if (!ok) return null;
    var map = CC.Realm.create({ name: 'The Abandoned Village', w: W, h: H, kind: kind, tiles: tiles, spawn: spawn, stairs: { x: -999, y: -999, tx: -1, ty: -1 }, chests: chests, enemySpawns: spawns, props: props, lights: lights,
      ambient: '70,84,110,0.10', playerLight: 230, viewR: 330, fog: 0.04, fogColor: '150,160,160', ground: ground, detail: detail, drawSolid: solid, afterLight: after, reveal: false, viewBoost: 1.2 });
    map.art = art; map.vil = { sy0: sy0, plazaX: plazaX, plazaY: plazaY, trees: trees, ghosts: ghostSpots.map(function (g, gi) { return { x: g.x, y: g.y, seed: gi * 2.7 + 1, a: 0 }; }), tombs: tombs, houses: HOUSES, u: 0, flash: 0, bolt: null, nextFlash: 6, thunder: 0, wisps: [], spawn: spawn };
    map.backPos = { x: spawn.x - 24, y: spawn.y };
    return map;
  }
  V.generate = function (fixedSeed) {
    var seed = Number.isFinite(fixedSeed) ? fixedSeed >>> 0 : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, map = null, tries = 0;
    while (!map && tries < 24) { map = build(seeded(seed + tries * 7919)); tries++; }
    if (!map) throw new Error('Village generation failed');
    map.seed = seed; V.map = map; V.title = 7; V.speech = null; map.ghostsList = map.vil.ghosts;
    return map;
  };

  /* =================== art =================== */
  function dayMix(u) { return clamp(u, 0, 1); }
  function ground(kind, hv, tx, ty) {
    var m = V.map, u = m && m.vil ? m.vil.u : 0;
    if (kind === 1) { var wc = mix([112, 84, 56], [52, 42, 34], u); return css([wc[0] + hv * 14, wc[1] + hv * 10, wc[2] + hv * 8]); } // plank floors
    if (kind === 2) { var rc = mix([142, 122, 90], [64, 58, 52], u); return css([rc[0] + hv * 10, rc[1] + hv * 8, rc[2] + hv * 6]); }       // road and rubble
    if (kind === 4) { var gc = mix([84, 112, 62], [38, 42, 36], u); return css([gc[0] + hv * 8, gc[1] + hv * 8, gc[2] + hv * 6]); }          // graveyard soil
    var g = mix([86, 138, 60], [32, 40, 32], sm(u * 1.15)); return css([g[0] + hv * 12 - 6, g[1] + hv * 14 - 6, g[2] + hv * 8 - 4]);       // grass, going dead
  }
  function detail(c, kind, sx, sy, hv, t, tx, ty) {
    var m = V.map, u = m && m.vil ? m.vil.u : 0, i;
    if (kind === 1) { // floorboards: gaps, nails, stains, a few missing planks
      c.strokeStyle = 'rgba(20,14,10,.5)'; c.lineWidth = 1; c.beginPath(); for (i = 0; i < 4; i++) { c.moveTo(sx, sy + i * 8); c.lineTo(sx + 32, sy + i * 8); } c.stroke();
      c.strokeStyle = 'rgba(20,14,10,.4)'; c.beginPath(); c.moveTo(sx + hv * 28, sy); c.lineTo(sx + hv * 28 + 1, sy + 8); c.moveTo(sx + (1 - hv) * 28, sy + 16); c.lineTo(sx + (1 - hv) * 28 + 1, sy + 24); c.stroke();
      if (hv > 0.82) { c.fillStyle = 'rgba(8,6,6,.7)'; c.fillRect(sx + 3, sy + 8 * Math.floor(hv * 40 % 4), 26, 7); } // a plank gone
      if (hv < 0.12) { c.fillStyle = 'rgba(40,20,14,.35)'; c.beginPath(); c.ellipse(sx + 16, sy + 16, 9, 6, hv * 9, 0, TAU); c.fill(); }
      return;
    }
    if (kind === 2) { // cobbles and rubble
      for (i = 0; i < 3; i++) { var cx = sx + ((hv * (i + 3) * 977) % 1) * 24 + 4, cy = sy + ((hv * (i + 5) * 313) % 1) * 22 + 5; c.fillStyle = 'rgba(' + (60 - u * 20) + ',56,52,.45)'; c.beginPath(); c.ellipse(cx, cy, 4, 2.6, hv, 0, TAU); c.fill(); }
      if (hv > 0.9) { c.fillStyle = 'rgba(70,64,58,.7)'; c.fillRect(sx + 10, sy + 12, 6, 4); }
      if (u > 0.4 && hv < 0.25) { c.fillStyle = 'rgba(70,90,110,' + 0.35 * u + ')'; c.beginPath(); c.ellipse(sx + 16, sy + 16, 11, 5, 0, 0, TAU); c.fill(); var rp = (t * 1.2 + hv * 20) % 1; c.strokeStyle = 'rgba(200,215,230,' + (1 - rp) * 0.4 * u + ')'; c.lineWidth = 1; c.beginPath(); c.ellipse(sx + 16, sy + 16, 2 + rp * 8, 1 + rp * 3.5, 0, 0, TAU); c.stroke(); } // rain puddles
      return;
    }
    if (kind === 4) { c.fillStyle = 'rgba(30,22,16,.35)'; c.fillRect(sx + 4 + hv * 10, sy + 6 + hv * 14, 8, 3); if (hv > 0.7) { c.strokeStyle = 'rgba(70,80,60,.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx + 8, sy + 22); c.lineTo(sx + 10, sy + 14); c.moveTo(sx + 12, sy + 22); c.lineTo(sx + 11, sy + 15); c.stroke(); } return; }
    // grass blades: green, then yellow, then dead brown and sparse
    var n = hv > 0.4 ? 2 + Math.floor(hv * 3) : 0; if (!n) { if (hv > 0.2 && hv < 0.24) { c.fillStyle = 'rgba(120,120,110,.5)'; c.fillRect(sx + 14, sy + 14, 4, 3); } return; }
    var gc2 = mix([96, 150, 62], [74, 62, 36], sm(u * 1.3)); c.strokeStyle = css(gc2); c.lineWidth = 1.1; c.beginPath();
    for (i = 0; i < n; i++) { var x = sx + ((hv * (i + 3) * 977) % 1) * 28 + 2, y = sy + ((hv * (i + 5) * 313) % 1) * 22 + 9, sw = Math.sin(t * (1.6 + u * 2.5) + tx * 0.3 + i) * (2 + u * 3); c.moveTo(x, y); c.quadraticCurveTo(x + sw * 0.4, y - 4, x + sw, y - 8 + u * 2); }
    c.stroke();
  }
  // walls, trees, fence, tombstones
  function solid(c, kind, sx, sy, hv, t, tx, ty, D) {
    var m = V.map, u = m && m.vil ? m.vil.u : 0, art = D && D.art ? D.art[ty * D.w + tx] : 0;
    if (kind === 3) return tree(c, sx, sy, hv, t, u, tx, ty);
    if (kind === 8) return wall(c, sx, sy, hv, t, u, art, tx, ty, D);
    if (kind === 7) { // a rusty iron fence
      c.strokeStyle = '#2a2420'; c.lineWidth = 2; c.beginPath(); c.moveTo(sx, sy + 14); c.lineTo(sx + 32, sy + 14); c.moveTo(sx, sy + 24); c.lineTo(sx + 32, sy + 24); c.stroke();
      for (var i = 0; i < 4; i++) { var bx = sx + 3 + i * 9, top = sy - 2 + ((hv * (i + 2) * 7) % 1) * 5; line(c, bx, sy + 28, bx, top, '#3a302a', 2.2); c.fillStyle = '#5a3a28'; c.beginPath(); c.moveTo(bx - 2.5, top + 1); c.lineTo(bx, top - 5); c.lineTo(bx + 2.5, top + 1); c.fill(); }
      if (hv > 0.6) { c.fillStyle = 'rgba(120,60,30,.5)'; c.fillRect(sx + 6, sy + 12, 10, 3); }
      return;
    }
    if (kind === 9) return tomb(c, sx, sy, hv, t, u, art);
  }
  function tree(c, sx, sy, hv, t, u, tx, ty) { // a gnarled tree: leafy by day, black, bare and clawed by night (the eyes are painted after the lighting)
    var bx = sx + 16, by = sy + 30, h = 60 + hv * 34, lean = (hv - 0.5) * 16 + Math.sin(t * 0.9 + hv * 9) * (1 + u * 2), dead = clamp(u * 1.2, 0, 1), i;
    c.fillStyle = 'rgba(0,0,0,' + (0.25 + u * 0.15) + ')'; c.beginPath(); c.ellipse(bx + 8, by + 1, 20, 5, 0, 0, TAU); c.fill();
    var tc = css(mix([88, 62, 40], [20, 14, 16], dead));
    c.fillStyle = tc; c.beginPath(); c.moveTo(bx - 7, by); c.quadraticCurveTo(bx - 5, by - h * 0.5, bx + lean - 3, by - h); c.lineTo(bx + lean + 3, by - h); c.quadraticCurveTo(bx + 5, by - h * 0.5, bx + 8, by); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(bx - 1, by - 4); c.quadraticCurveTo(bx, by - h * 0.5, bx + lean * 0.9, by - h + 4); c.stroke();
    c.strokeStyle = tc; c.lineCap = 'round';
    for (i = 0; i < 5; i++) { var dir = i % 2 ? 1 : -1, hy = by - h * (0.35 + i * 0.12), len = 14 + i * 4 + dead * 10, tw = Math.sin(t * 1.2 + i * 2 + hv * 7) * (0.8 + dead * 3); c.lineWidth = 3.4 - i * 0.5; c.beginPath(); c.moveTo(bx + lean * (0.3 + i * 0.15), hy); c.quadraticCurveTo(bx + dir * len * 0.6, hy - 8 + tw, bx + dir * len, hy - 6 - dead * 8 + tw); c.stroke();
      if (dead > 0.35) { c.lineWidth = 1.1; for (var f = -1; f <= 1; f++) { c.beginPath(); c.moveTo(bx + dir * len, hy - 6 - dead * 8 + tw); c.lineTo(bx + dir * (len + 5), hy - 6 - dead * 8 + tw + f * 4); c.stroke(); } } }
    var blobs = Math.max(0, Math.round(8 * (1 - dead * 1.05)));
    for (i = 0; i < blobs; i++) { var lx = bx + lean - 12 + i * 3.5 + Math.sin(t + i) * 1.5, ly = by - h + (i % 3) * 6 - (i > 4 ? 6 : 0), r = 12 - i * 0.6; var lc = mix([62, 112, 50], [74, 58, 30], dead * 1.5); oval(c, lx, ly + 3, r * 1.2, r * 0.8, 'rgba(10,20,10,.4)'); oval(c, lx - 1, ly, r, r * 0.7, css(lc)); oval(c, lx - 3, ly - 3, r * 0.5, r * 0.3, css(mix(lc, [200, 220, 150], 0.25))); }
    if (u > 0.25) { c.fillStyle = css(mix([150, 110, 56], [60, 36, 24], u)); for (i = 0; i < 3; i++) { var ph = (t * 0.45 + i / 3 + hv) % 1; c.globalAlpha = 1 - ph; c.fillRect(bx - 14 + i * 14 + Math.sin(t + i * 2) * 5, by - h + ph * h * 0.85, 2, 2); } c.globalAlpha = 1; }
  }
  function wall(c, sx, sy, hv, t, u, art, tx, ty, D) { // crumbling masonry and timber: missing chunks, cracks, bare laths, ivy, hanging shutters
    var stone = art === 3 ? [118, 112, 104] : art === 2 ? [118, 98, 76] : [108, 100, 90], dk = mix(stone, [0, 0, 0], 0.4), i, top = sy - 10 - hv * 6 + (art === 9 ? 14 : 0);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(sx, sy + 28, 32, 5);
    c.fillStyle = css(dk); c.fillRect(sx, top, 32, sy + 32 - top);
    c.fillStyle = css(stone); c.fillRect(sx, top, 32, sy + 30 - top);
    if (art === 2) { // timber frame: dark beams with plaster between them
      c.fillStyle = css(mix([196, 184, 150], [96, 90, 74], u * 0.6)); c.fillRect(sx + 3, top + 2, 26, sy + 26 - top);
      c.fillStyle = '#3a2a1c'; c.fillRect(sx, top, 4, sy + 30 - top); c.fillRect(sx + 28, top, 4, sy + 30 - top); c.fillRect(sx, top + 12, 32, 4); c.fillRect(sx, sy + 24, 32, 5);
      c.strokeStyle = '#3a2a1c'; c.lineWidth = 3; c.beginPath(); c.moveTo(sx + 3, top + 14); c.lineTo(sx + 29, sy + 24); c.stroke();
    } else { // stone courses
      c.strokeStyle = 'rgba(30,26,22,.55)'; c.lineWidth = 1; for (i = 0; i < 4; i++) { var ry = top + 5 + i * 9; c.beginPath(); c.moveTo(sx, ry); c.lineTo(sx + 32, ry); c.stroke(); for (var j = 0; j < 3; j++) { var bx2 = sx + ((j * 11 + i * 7 + tx * 5) % 32); c.beginPath(); c.moveTo(bx2, ry); c.lineTo(bx2, ry + 9); c.stroke(); } }
      c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(sx, top, 32, 2);
    }
    // ruin: bites out of the top edge, plaster flaked off, bare laths showing
    var gone = 0.35 + 0.5 * hv; c.fillStyle = 'rgba(10,8,8,.85)'; c.beginPath(); c.moveTo(sx, top); c.lineTo(sx + 5 + hv * 6, top); c.lineTo(sx + 8 + hv * 6, top + 6 + gone * 6); c.lineTo(sx + 12 + hv * 6, top + 2); c.lineTo(sx + 17 + hv * 5, top + 9 + gone * 4); c.lineTo(sx + 22 + hv * 5, top); c.lineTo(sx, top); c.fill();
    if (hv > 0.5) { c.fillStyle = css(dk); c.fillRect(sx + 5, top + 10 + hv * 8, 9, 7); c.strokeStyle = '#4a3828'; c.lineWidth = 1; c.beginPath(); for (i = 0; i < 4; i++) { c.moveTo(sx + 5, top + 11 + hv * 8 + i * 2); c.lineTo(sx + 14, top + 11 + hv * 8 + i * 2); } c.stroke(); } // laths
    c.strokeStyle = 'rgba(14,10,8,.85)'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(sx + 10 + hv * 12, top); c.lineTo(sx + 8 + hv * 12, top + 10); c.lineTo(sx + 13 + hv * 12, top + 16); c.lineTo(sx + 9 + hv * 12, top + 24); c.stroke();
    if (hv < 0.3) { // a window with a shutter hanging off one hinge
      c.fillStyle = '#080608'; c.fillRect(sx + 9, top + 10, 14, 13); c.strokeStyle = '#3a2a1c'; c.lineWidth = 2; c.strokeRect(sx + 9, top + 10, 14, 13);
      c.fillStyle = '#4a3622'; c.save(); c.translate(sx + 9, top + 10); c.rotate(-0.5 + Math.sin(t * 1.3 + tx) * 0.05 * (1 + u * 3)); c.fillRect(-1, 0, 7, 13); c.restore();
      if (u > 0.5 && hv < 0.12) { c.fillStyle = 'rgba(255,200,90,' + (0.35 + 0.2 * Math.sin(t * 7 + tx)) + ')'; c.fillRect(sx + 12, top + 13, 8, 8); } // a light in a window where no one lives
    }
    if (hash(tx, ty + 3) > 0.55) { c.strokeStyle = css(mix([70, 120, 56], [48, 62, 38], u)); c.lineWidth = 1.6; for (i = 0; i < 3; i++) { var vx = sx + 4 + i * 11 + hv * 4; c.beginPath(); c.moveTo(vx, top + 2); c.bezierCurveTo(vx + 4, top + 12, vx - 4, top + 20, vx + 2, sy + 28 - hv * 4); c.stroke(); c.fillStyle = css(mix([84, 140, 62], [56, 72, 40], u)); c.beginPath(); c.arc(vx + 1, top + 12 + hv * 8, 2.2, 0, TAU); c.arc(vx, top + 20, 2, 0, TAU); c.fill(); } } // ivy
    if (u > 0.4) { c.fillStyle = 'rgba(70,90,110,' + 0.25 * u + ')'; c.fillRect(sx + 6, top + 4, 2, sy + 22 - top); c.fillRect(sx + 21, top + 8, 2, sy + 18 - top); } // rain streaks down the plaster
    if (hv > 0.85) { c.fillStyle = 'rgba(90,86,80,.9)'; c.beginPath(); c.moveTo(sx + 2, sy + 30); c.lineTo(sx + 6, sy + 22); c.lineTo(sx + 12, sy + 30); c.fill(); c.beginPath(); c.moveTo(sx + 20, sy + 31); c.lineTo(sx + 25, sy + 25); c.lineTo(sx + 30, sy + 31); c.fill(); } // fallen stones at its foot
  }
  function tomb(c, sx, sy, hv, t, u, art) {
    var bx = sx + 16, by = sy + 30, a = art % 6;
    if (art === 20) return; // the well draws itself as a prop
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(bx + 3, by + 1, 13, 4, 0, 0, TAU); c.fill();
    var st = css(mix([150, 148, 140], [84, 86, 90], u)), sh = css(mix([112, 110, 104], [54, 56, 62], u)), tilt = (hv - 0.5) * 0.3;
    c.save(); c.translate(bx, by); c.rotate(tilt);
    if (a === 1) { c.fillStyle = sh; c.fillRect(-3, -26, 6, 28); c.fillRect(-10, -20, 20, 5); c.fillStyle = st; c.fillRect(-3, -26, 3, 28); c.fillRect(-10, -20, 10, 5); } // a cross
    else if (a === 2) { c.fillStyle = sh; c.beginPath(); c.moveTo(-10, 2); c.lineTo(-10, -20); c.quadraticCurveTo(0, -32, 10, -20); c.lineTo(10, 2); c.closePath(); c.fill(); c.fillStyle = st; c.beginPath(); c.moveTo(-10, 2); c.lineTo(-10, -20); c.quadraticCurveTo(-4, -28, 0, -29); c.lineTo(0, 2); c.fill(); c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1; for (var i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-5, -16 + i * 4); c.lineTo(5, -16 + i * 4); c.stroke(); } }
    else if (a === 3) { c.fillStyle = sh; c.fillRect(-12, -10, 24, 12); c.fillStyle = st; c.fillRect(-12, -10, 24, 4); c.fillStyle = sh; c.fillRect(-4, -26, 8, 16); c.fillStyle = st; c.fillRect(-4, -26, 4, 16); } // a slab and obelisk
    else if (a === 4) { c.fillStyle = sh; c.beginPath(); c.moveTo(-6, 2); c.lineTo(-6, -16); c.lineTo(0, -34); c.lineTo(6, -16); c.lineTo(6, 2); c.fill(); c.fillStyle = st; c.beginPath(); c.moveTo(-6, 2); c.lineTo(-6, -16); c.lineTo(0, -34); c.lineTo(0, 2); c.fill(); } // an obelisk
    else { c.fillStyle = sh; c.fillRect(-9, -22, 18, 24); c.fillStyle = st; c.fillRect(-9, -22, 9, 24); c.fillStyle = sh; c.beginPath(); c.arc(0, -26, 6, 0, TAU); c.fill(); c.fillStyle = st; c.beginPath(); c.arc(-2, -27, 4, 0, TAU); c.fill(); c.fillStyle = 'rgba(10,10,12,.6)'; c.beginPath(); c.arc(-2, -26, 1.5, 0, TAU); c.arc(2, -26, 1.5, 0, TAU); c.fill(); } // a weeping angel's head and shoulders
    c.fillStyle = 'rgba(70,110,54,.7)'; c.fillRect(-9, -2, 18, 4); if (hv > 0.5) c.fillRect(-8, -18, 5, 3); // moss
    c.restore();
    if (hv > 0.4) { c.fillStyle = 'rgba(120,90,110,' + (0.7 - 0.4 * u) + ')'; c.beginPath(); c.arc(bx - 12 + hv * 6, by + 2, 2.4, 0, TAU); c.fill(); c.fillStyle = 'rgba(60,40,50,.8)'; c.fillRect(bx - 13 + hv * 6, by + 2, 1.4, 4); } // a withered posy
  }
  // props
  function furniture(c, sx, sy, kd, sd) {
    c.save(); c.translate(sx, sy); c.rotate((sd - 0.5) * 1.4); c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, 8, 14, 4, 0, 0, TAU); c.fill();
    if (kd === 0) { c.fillStyle = '#4a3624'; c.fillRect(-14, -3, 28, 12); c.fillStyle = '#5e452e'; c.fillRect(-14, -8, 28, 6); c.fillStyle = '#2a1c12'; c.fillRect(-12, 9, 3, 6); c.fillRect(8, 9, 3, 6); c.strokeStyle = '#1a100a'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-4, -8); c.lineTo(2, -2); c.lineTo(-1, 6); c.stroke(); } // a table, split down the middle
    else if (kd === 1) { c.fillStyle = '#5a5048'; c.fillRect(-16, -6, 32, 14); c.fillStyle = '#7a6a58'; c.fillRect(-16, -10, 10, 7); c.fillStyle = '#8a7a64'; c.fillRect(-4, -4, 18, 10); c.fillStyle = 'rgba(60,70,40,.5)'; c.fillRect(-10, -4, 14, 8); } // a bed, mouldering
    else if (kd === 2) { c.fillStyle = '#3e2c1c'; c.fillRect(-9, -18, 18, 26); c.fillStyle = '#2a1c12'; c.fillRect(-7, -16, 6, 22); c.fillRect(1, -16, 6, 22); c.fillStyle = '#6a5a2a'; c.fillRect(-1, -4, 2, 3); } // a cabinet, doors hanging
    else if (kd === 3) { c.fillStyle = '#5a4026'; c.fillRect(-8, -8, 16, 16); c.strokeStyle = '#2a1c10'; c.lineWidth = 1.4; c.strokeRect(-8, -8, 16, 16); c.beginPath(); c.moveTo(-8, -3); c.lineTo(8, -3); c.moveTo(-8, 3); c.lineTo(8, 3); c.stroke(); } // a barrel
    else if (kd === 4) { c.fillStyle = '#5e452e'; c.fillRect(-7, -5, 14, 10); c.fillStyle = '#4a3624'; c.fillRect(-9, -12, 4, 8); c.fillRect(-1, 3, 12, 3); } // a broken chair
    else if (kd === 5) { c.fillStyle = '#5a5248'; c.fillRect(-14, -10, 28, 18); c.fillStyle = '#080606'; c.fillRect(-10, -6, 20, 12); c.fillStyle = 'rgba(255,120,40,.12)'; c.fillRect(-10, -6, 20, 12); c.fillStyle = '#7a7268'; c.fillRect(-14, -14, 28, 5); } // a cold hearth
    else { c.fillStyle = '#6a604c'; for (var i = 0; i < 6; i++) { c.beginPath(); c.arc(-14 + i * 6 + sd * 4, 2 + (i % 2) * 4, 3 + (i % 3), 0, TAU); c.fill(); } c.fillStyle = 'rgba(210,205,190,.7)'; c.fillRect(-10, -2, 14, 1); } // rubble and old cobwebs
    c.restore();
  }
  function fallenBeam(c, sx, sy, sd) { c.save(); c.translate(sx, sy); c.rotate(sd * 3.14); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(-28, 4, 56, 5); c.fillStyle = '#3a2a1c'; c.fillRect(-28, -3, 56, 8); c.fillStyle = '#5a4430'; c.fillRect(-28, -3, 56, 3); c.strokeStyle = '#1a100a'; c.lineWidth = 1; c.beginPath(); c.moveTo(-6, -3); c.lineTo(-3, 5); c.stroke(); c.fillStyle = '#2a1c12'; c.beginPath(); c.moveTo(28, -3); c.lineTo(34, 0); c.lineTo(28, 5); c.fill(); c.restore(); }
  function trapdoor(c, sx, sy, t) { c.fillStyle = '#2e2218'; c.fillRect(sx - 17, sy - 15, 34, 30); c.strokeStyle = '#18100a'; c.lineWidth = 2; c.strokeRect(sx - 17, sy - 15, 34, 30); c.beginPath(); c.moveTo(sx, sy - 15); c.lineTo(sx, sy + 15); c.stroke(); c.fillStyle = '#8a8a90'; c.fillRect(sx - 3, sy - 2, 6, 4); c.fillStyle = 'rgba(40,200,150,' + (0.12 + 0.08 * Math.sin(t * 2)) + ')'; c.fillRect(sx - 17, sy - 15, 34, 30);
    var p = hero(); if (p && Math.hypot(p.x - (V.trap ? V.trap.x : 0), p.y - (V.trap ? V.trap.y : 0)) < 54) { c.font = 'bold 10px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#ffe08a'; c.fillText('[F] Open the cellar trapdoor', sx, sy - 24); c.textAlign = 'left'; } }
  function well(c, sx, sy) { c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(sx, sy + 8, 24, 8, 0, 0, TAU); c.fill(); c.fillStyle = '#6a645a'; c.beginPath(); c.ellipse(sx, sy, 20, 10, 0, 0, TAU); c.fill(); c.fillStyle = '#080a0c'; c.beginPath(); c.ellipse(sx, sy - 1, 14, 6, 0, 0, TAU); c.fill(); c.fillStyle = '#8a847a'; c.fillRect(sx - 22, sy - 4, 4, 12); c.fillRect(sx + 18, sy - 4, 4, 12); c.fillStyle = '#3a2a1c'; c.fillRect(sx - 20, sy - 22, 40, 4); c.fillRect(sx - 20, sy - 22, 3, 20); c.fillRect(sx + 17, sy - 22, 3, 20); c.strokeStyle = '#5a4a36'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx, sy - 18); c.lineTo(sx + 2, sy - 6); c.stroke(); }
  function cart(c, sx, sy) { c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(sx, sy + 14, 26, 6, 0, 0, TAU); c.fill(); c.save(); c.translate(sx, sy); c.rotate(0.12); c.fillStyle = '#4a3624'; c.fillRect(-22, -8, 40, 14); c.fillStyle = '#5e452e'; c.fillRect(-22, -12, 40, 5); c.fillStyle = '#2a1c12'; c.fillRect(-22, -12, 3, 18); c.fillRect(15, -12, 3, 18); c.beginPath(); c.arc(-12, 8, 9, 0, TAU); c.strokeStyle = '#2a1c12'; c.lineWidth = 3; c.stroke(); c.beginPath(); c.moveTo(-12, -1); c.lineTo(-12, 17); c.moveTo(-21, 8); c.lineTo(-3, 8); c.stroke(); c.fillStyle = '#4a3624'; c.fillRect(18, 2, 16, 3); c.restore(); }

  /* =================== weather, lightning, rain, eyes, apparitions (the light pass) =================== */
  function eye(c, x, y, s, look, open, col) { if (open <= 0.05) return; c.save(); c.shadowColor = col; c.shadowBlur = 6 + s * 2; c.fillStyle = col; c.beginPath(); c.moveTo(x - s * 1.5, y); c.quadraticCurveTo(x, y - s * open * 1.1, x + s * 1.5, y); c.quadraticCurveTo(x, y + s * open * 0.9, x - s * 1.5, y); c.fill(); c.shadowBlur = 0; c.fillStyle = '#180204'; c.fillRect(x + look * s * 0.5 - 0.5, y - s * 0.6 * open, 1.1, s * 1.2 * open); c.restore(); }
  function ghostShape(c, x, y, a, face, sc, t, seed, eyeCol, rich) { // a pale figure: tattered shroud, long arms, hollow face, glowing eyes
    c.save(); c.translate(x, y); c.scale(face * sc, sc); c.globalAlpha = a;
    var g = c.createLinearGradient(0, -34, 0, 12); g.addColorStop(0, rich ? 'rgba(206,224,236,.9)' : 'rgba(176,206,236,.85)'); g.addColorStop(1, 'rgba(120,150,190,0)'); c.fillStyle = g;
    c.beginPath(); c.moveTo(-5, -26); c.quadraticCurveTo(-11, -8, -12 + Math.sin(t * 2 + seed) * 2, 12); for (var i = 0; i < 5; i++) c.lineTo(-12 + i * 6, 12 + (i % 2 ? 6 : -1) + Math.sin(t * 2.2 + i + seed) * 3); c.quadraticCurveTo(11, -8, 5, -26); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(176,206,236,.55)'; c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(-5, -22); c.quadraticCurveTo(-13, -10, -10 + Math.sin(t * 1.7 + seed) * 3, 2); c.moveTo(5, -22); c.quadraticCurveTo(13, -10, 10 + Math.sin(t * 1.9 + seed) * 3, 2); c.stroke();
    c.fillStyle = 'rgba(196,216,238,.75)'; c.beginPath(); c.ellipse(0, -30, 5, 6.4, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(4,10,24,.85)'; c.beginPath(); c.ellipse(-2.2, -30.5, 1.8, 2.4, 0, 0, TAU); c.ellipse(2.2, -30.5, 1.8, 2.4, 0, 0, TAU); c.ellipse(0, -26.2, 1.1, 2, 0, 0, TAU); c.fill();
    c.globalAlpha = Math.min(1, a * 1.8); c.shadowColor = eyeCol; c.shadowBlur = 12; c.fillStyle = eyeCol === '#5ac8ff' ? '#b8f0ff' : '#e8ffd8'; c.fillRect(-3.6, -31.6, 2.8, 2.3); c.fillRect(0.8, -31.6, 2.8, 2.3);
    c.restore();
  }
  function after(c, cam) {
    var m = village(); if (!m) return; var v = m.vil, u = v.u, t = Date.now() / 1000, p = hero(), i;
    if (u > 0.005) {
      c.save();
      // the sky goes from clear day to a bruised yellow-grey, then to near night
      var dk = 0.5 * Math.pow(u, 1.15); c.fillStyle = 'rgba(' + (14 + (1 - u) * 20 | 0) + ',14,22,' + dk + ')'; c.fillRect(0, 0, cam.w, cam.h);
      c.fillStyle = 'rgba(110,100,40,' + 0.12 * Math.sin(Math.min(1, u * 1.6) * Math.PI) + ')'; c.fillRect(0, 0, cam.w, cam.h); // a sickly yellow in between
      if (p) { var hx = p.x - cam.x, hy = p.y - cam.y, g = c.createRadialGradient(hx, hy, 100, hx, hy, 100 + 300 * (1 - 0.35 * u)); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + 0.4 * u + ')'); c.fillStyle = g; c.fillRect(0, 0, cam.w, cam.h); }
      // low fog banks, dark
      var fa = clamp(u * 1.1, 0, 1) * 0.28, fcol = Math.round(34 + (1 - u) * 90) + ',' + Math.round(40 + (1 - u) * 90) + ',' + Math.round(42 + (1 - u) * 90), cell = 160;
      for (var gy = Math.floor(cam.y / cell) - 1; gy <= Math.ceil((cam.y + cam.h) / cell); gy++) for (var gx = Math.floor(cam.x / cell) - 1; gx <= Math.ceil((cam.x + cam.w) / cell); gx++) {
        var hs = hash(gx * 7 + 3, gy * 5 + 9); if (hs > 0.5) continue; var fx = gx * cell + hs * cell + Math.sin(t * 0.12 + hs * 30) * 50 - cam.x, fy = gy * cell + hash(gx, gy) * cell * 0.9 + Math.cos(t * 0.1 + hs * 20) * 30 - cam.y, fr = 100 + hs * 110;
        var gr = c.createRadialGradient(fx, fy, 0, fx, fy, fr); gr.addColorStop(0, 'rgba(' + fcol + ',' + fa + ')'); gr.addColorStop(1, 'rgba(' + fcol + ',0)'); c.fillStyle = gr; c.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
      }
      // rain: slanted streaks, heavier as it darkens
      var nR = Math.floor(u * u * 330); c.strokeStyle = 'rgba(200,215,235,' + 0.5 * u + ')'; c.lineWidth = 1; c.beginPath();
      for (i = 0; i < nR; i++) { var rx = (hash(i, 3) * (cam.w + 80) - t * 90 * (0.7 + hash(i, 9) * 0.6) * 0.4 + 4000) % (cam.w + 80), ry = ((hash(i, 5) * cam.h + t * (420 + hash(i, 7) * 220)) % (cam.h + 30)) - 15; c.moveTo(rx, ry); c.lineTo(rx - 5, ry + 13); }
      c.stroke();
      // eyes in the trees (and the dead grass): they open as the dark comes
      var look = p ? 1 : 0, tx0 = Math.floor(cam.x / T), ty0 = Math.floor(cam.y / T), tx1 = Math.ceil((cam.x + cam.w) / T), ty1 = Math.ceil((cam.y + cam.h) / T);
      var pe = clamp((u - 0.12) / 0.88, 0, 1); // how many trees are watching: a few at first, a few more as it darkens, never more than two eyes on one tree
      if (u > 0.12) for (var ty = ty0; ty <= ty1 + 3; ty++) for (var tx = tx0 - 1; tx <= tx1 + 1; tx++) {
        if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.kind[ty * m.w + tx] !== 3) continue;
        var tx2 = tx * T - cam.x + 16, ty2 = ty * T - cam.y + 30, hgt = 60 + hash(tx, ty) * 34, nE = hash(tx + 7, ty + 3) < pe * 0.55 ? 2 : 1;
        if (hash(tx * 3, ty * 5) > 0.05 + pe * 0.4) continue;
        for (var e2 = 0; e2 < nE; e2++) { var eh = hash(tx * 7 + e2, ty * 5 + e2), ex = tx2 + (eh - 0.5) * 10 + (e2 > 2 ? (e2 - 3.5) * 9 : 0), ey = ty2 - hgt * (0.1 + (e2 % 4) * 0.2 + eh * 0.06), bl = Math.sin(t * (0.8 + eh * 3) + eh * 50);
          eye(c, ex, ey, 1.6 + u * 1.8, p ? Math.sign(p.x - tx * T) : 0, bl > -0.8 ? 1 : 0.1, u > 0.6 ? '#ff2a2a' : '#ffd23a'); }
      }
      // apparitions drifting in and out between the trees
      drawWisps(c, cam, v, t, p);
      c.restore();
    }
    // the village's ghosts (friendly): they fade in and out and can be spoken to
    for (i = 0; i < v.ghosts.length; i++) { var gh = v.ghosts[i]; if (gh.a < 0.02) continue; var gx2 = gh.x - cam.x, gy2 = gh.y - cam.y; if (gx2 < -40 || gx2 > cam.w + 40 || gy2 < -60 || gy2 > cam.h + 40) continue;
      c.save(); var gl = c.createRadialGradient(gx2, gy2 - 14, 2, gx2, gy2 - 14, 34); gl.addColorStop(0, 'rgba(190,230,255,' + 0.3 * gh.a + ')'); gl.addColorStop(1, 'rgba(190,230,255,0)'); c.fillStyle = gl; c.fillRect(gx2 - 36, gy2 - 52, 72, 72); c.restore();
      ghostShape(c, gx2, gy2 + Math.sin(t * 1.1 + gh.seed) * 3 - 4, gh.a * 0.82, gh.face || 1, 1.05, t, gh.seed, '#6ad8ff', true);
      if (p && gh.a > 0.3 && Math.hypot(p.x - gh.x, p.y - gh.y) < 60) { c.font = 'bold 10px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#d8f0ff'; c.fillText((GHOSTS[gh.idx] ? GHOSTS[gh.idx].name : 'A ghost') + '  [F] speak', gx2, gy2 - 52); c.textAlign = 'left'; } }
    // lightning: a flash of yellow-white over everything, a jagged bolt on the horizon
    if (v.flash > 0) {
      var fl = clamp(v.flash / 0.5, 0, 1), pat = v.flashPat > 0 ? Math.max(0, Math.sin(v.flashPat * 32) * 0.5 + 0.5) : 1; c.save();
      c.fillStyle = 'rgba(255,236,150,' + 0.55 * fl * (v.flashPat > 0 ? 0.5 + pat * 0.5 : 1) + ')'; c.fillRect(0, 0, cam.w, cam.h);
      if (v.bolt) { c.strokeStyle = 'rgba(255,248,200,' + fl + ')'; c.shadowColor = '#fff2a0'; c.shadowBlur = 14; c.lineWidth = 3; c.beginPath(); var bx = v.bolt.x * cam.w, by = 0; c.moveTo(bx, by); for (var s = 0; s < 9; s++) { bx += (hash(s, v.bolt.seed) - 0.5) * 50; by += cam.h * 0.1 + hash(s + 3, v.bolt.seed) * 10; c.lineTo(bx, by); } c.stroke(); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,' + fl + ')'; c.stroke(); }
      c.restore();
    }
  }

  /* =================== ghosts =================== */
  var GHOSTS = [
    { name: 'Old Gravekeeper Odo', lines: ['Mind the loose stones. I never did finish digging the last row.', 'They say I died of the damp. I say the damp had help.'] },
    { name: 'Mina, the Baker\'s Daughter', lines: ['Is it market day? The bread must be cold by now...', 'Everyone went to the chapel when the bell rang. No one came out again.'] },
    { name: 'Brother Aldous', lines: ['The chapel bell tolled by itself that night. Three times. Then no more.', 'We prayed. Something below the floor listened instead.'] },
    { name: 'A Drowned Boy', lines: ['I am not cold anymore. Isn\'t that funny?', 'The well is deeper than it looks. Do not lean over.'] },
    { name: 'The Widow Verrin', lines: ['You walk among us as if you were alive. That is a rare courtesy.', 'There is one who lies beneath the chapel, and he is not at rest. When you are stronger, come back to me. I will tell you what he did to this village.'] }
  ];
  V.ghostLines = GHOSTS;
  function interactVillage() {
    var s = CC.state, p = hero(), m = village(); if (!p || !m) return false;
    var best = null, bd = 60; m.vil.ghosts.forEach(function (g) { var d = Math.hypot(p.x - g.x, p.y - g.y); if (g.a > 0.3 && d < bd) { bd = d; best = g; } });
    if (best) {
      var G = GHOSTS[best.idx], line = G.lines[(best.n = (best.n || 0) + 1) - 1 < G.lines.length ? best.n - 1 : G.lines.length - 1];
      V.speech = { name: G.name, text: line, t0: Date.now() }; V.heard[best.idx] = 1; best.face = p.x < best.x ? -1 : 1;
      if (best.idx === 4 && best.n >= 2 && Object.keys(V.heard).length >= 3 && !V.hook) { V.hook = 1; fxText(p.x, p.y - 30, 'A NEW QUEST AWAITS...', '#bfe9ff', 12); if (CC.Audio) CC.Audio.event('newquest'); if (CC.SaveGame && CC.SaveGame.save) CC.SaveGame.save(); }
      return true;
    }
    if (V.trap && Math.hypot(p.x - V.trap.x, p.y - V.trap.y) < 54) { if (CC.enterCellar) CC.enterCellar(); return true; }
    var d2 = Math.hypot(p.x - m.backPos.x, p.y - m.backPos.y); if (d2 < 60) { if (CC.leaveVillage) CC.leaveVillage(); return true; }
    return false;
  }
  V.interact = function () { var s = CC.state; if (!s) return false; if (s.area === 'village') return interactVillage(); if (s.area === 'village-cellar') return interactCellar(); return false; };
  V.nearAction = function () { var s = CC.state, p = hero(); if (!p || !s) return false; if (s.area === 'village' && V.map) { return V.map.vil.ghosts.some(function (g) { return g.a > 0.3 && Math.hypot(p.x - g.x, p.y - g.y) < 60; }) || (V.trap && Math.hypot(p.x - V.trap.x, p.y - V.trap.y) < 54) || Math.hypot(p.x - V.map.backPos.x, p.y - V.map.backPos.y) < 60; } if (s.area === 'village-cellar' && V.cellar) return Math.hypot(p.x - V.cellar.exit.x, p.y - V.cellar.exit.y) < 60; return false; };
  V.reset = function () { V.heard = {}; V.hook = 0; };
  V.setHook = function (v) { V.hook = v ? 1 : 0; };
  V.enter = function () { if (CC.enterVillage) return CC.enterVillage(); return false; };

  /* =================== the cellar =================== */
  function buildCellar(rng) {
    var N = CW * CH, tiles = new Uint8Array(N).fill(1), kind = new Uint8Array(N).fill(9), art = new Uint8Array(N), props = [], lights = [], chests = [], spawns = [], x, y, i;
    function at(tx, ty) { return ty * CW + tx; }
    function room(x0, y0, w, h, kd) { for (var yy = y0; yy < y0 + h; yy++) for (var xx = x0; xx < x0 + w; xx++) { tiles[at(xx, yy)] = 0; kind[at(xx, yy)] = kd || 0; } }
    function rect(x0, y0, w, h) { return { x0: x0, y0: y0, w: w, h: h, cx: x0 + w / 2, cy: y0 + h / 2 }; }
    var R0 = rect(26, 3, 12, 7), HALL = rect(22, 17, 20, 10), WEST = rect(5, 18, 13, 11), EAST = rect(46, 18, 13, 11), CRYPT = rect(20, 36, 24, 11), VAULT = rect(4, 37, 10, 9);
    [R0, HALL, WEST, EAST, CRYPT, VAULT].forEach(function (r) { room(r.x0, r.y0, r.w, r.h, 0); });
    function corridor(x0, y0, x1, y1, wd) { var sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0); for (x = x0; x !== x1 + sx || sx === 0; x += sx || 1) { for (var k = 0; k < wd; k++) { tiles[at(x, y0 + k)] = 0; kind[at(x, y0 + k)] = 0; } if (sx === 0) break; } for (y = y0; y !== y1 + sy || sy === 0; y += sy || 1) { for (var k2 = 0; k2 < wd; k2++) { tiles[at(x1 + k2, y)] = 0; kind[at(x1 + k2, y)] = 0; } if (sy === 0) break; } }
    corridor(31, 10, 31, 17, 3); corridor(18, 22, 21, 22, 3); corridor(42, 22, 45, 22, 3); corridor(31, 27, 31, 35, 3); corridor(11, 29, 11, 36, 3);
    for (y = 0; y < CH; y++) for (x = 0; x < CW; x++) if (!tiles[at(x, y)]) art[at(x, y)] = 0; else art[at(x, y)] = 1;
    var spawn = { x: R0.cx * T, y: (R0.y0 + 4) * T }, exit = { x: R0.cx * T, y: (R0.y0 + 2) * T };
    // dressing: torches, coffins, barrels, bones, cobwebs
    function torch(tx, ty) { lights.push({ x: tx * T + 16, y: ty * T + 16, r: 150, color: '255,170,70', inten: 0.7, flicker: 0.2 }); props.push({ x: tx * T + 16, y: ty * T + 8, sortY: 4, reveal: false, draw: function (c, sx, sy, tt) { c.fillStyle = '#3a2a1c'; c.fillRect(sx - 2, sy - 6, 4, 14); for (var f = 0; f < 3; f++) { var fh = 8 + Math.sin(tt * 11 + f * 2 + tx) * 2 - f * 1.6; c.fillStyle = f === 0 ? '#ff5a1a' : f === 1 ? '#ffa030' : '#ffe080'; c.beginPath(); c.moveTo(sx - 3 + f, sy - 6); c.quadraticCurveTo(sx - 2 + f, sy - 6 - fh * 0.6, sx, sy - 6 - fh); c.quadraticCurveTo(sx + 2 - f, sy - 6 - fh * 0.5, sx + 3 - f, sy - 6); c.fill(); } } }); }
    [[R0.x0 + 2, R0.y0], [R0.x0 + R0.w - 3, R0.y0], [HALL.x0 + 2, HALL.y0], [HALL.x0 + HALL.w - 3, HALL.y0], [HALL.x0 + HALL.w / 2, HALL.y0], [WEST.x0 + 2, WEST.y0], [EAST.x0 + 8, EAST.y0], [CRYPT.x0 + 3, CRYPT.y0], [CRYPT.x0 + CRYPT.w - 4, CRYPT.y0], [CRYPT.x0 + 12, CRYPT.y0], [VAULT.x0 + 3, VAULT.y0]].forEach(function (q) { torch(Math.floor(q[0]), Math.floor(q[1])); });
    function dress(r, n) { for (var k = 0; k < n; k++) { var kd = Math.floor(rng() * 5), px = (r.x0 + 1 + rng() * (r.w - 2)) * T, py = (r.y0 + 1 + rng() * (r.h - 2)) * T; props.push({ x: px, y: py, sortY: 0, reveal: false, kd: kd, seed: rng(), draw: function (c, sx, sy, tt, cam, pr) { cellarProp(c, sx, sy, pr.kd, pr.seed); } }); } }
    [R0, HALL, WEST, EAST, CRYPT, VAULT].forEach(function (r, ri) { dress(r, ri === 4 ? 16 : 9); });
    props.push({ x: exit.x, y: exit.y, sortY: -4, reveal: false, draw: function (c, sx, sy, t) { stairsUp(c, sx, sy, t); } });
    function chest(r, dx, dy, tier) { var cx = Math.floor(r.x0 + dx), cy = Math.floor(r.y0 + dy); chests.push({ tx: cx, ty: cy, x: cx * T + 16, y: cy * T + 16, opened: false, tier: tier }); }
    chest(WEST, 2, 2, 1); chest(WEST, 10, 8, 1); chest(WEST, 6, 5, 2); // the west store room
    chest(EAST, 11, 9, 1); chest(CRYPT, 3, 8, 2); chest(CRYPT, 20, 8, 2); chest(VAULT, 4, 4, 3); chest(VAULT, 6, 2, 3); // the east den, the crypt and the hidden vault
    function pack(r, list, n) { for (var k = 0; k < n; k++) { var px = Math.floor(r.x0 + 2 + rng() * (r.w - 4)), py = Math.floor(r.y0 + 2 + rng() * (r.h - 4)); spawns.push({ x: px * T + 16, y: py * T + 16, type: list[Math.floor(rng() * list.length)] }); } }
    pack(HALL, ['skeleton', 'ghoul', 'skeleton', 'spider'], 5); pack(EAST, ['ghoul', 'ghoul', 'ghost', 'scorpion'], 5); pack(WEST, ['spider', 'bat', 'spider'], 3); pack(CRYPT, ['ghoul', 'skeleton', 'ghost', 'scorpion', 'ghoul'], 7);
    var map = CC.Realm.create({ name: 'The Cellar', w: CW, h: CH, kind: kind, tiles: tiles, spawn: spawn, stairs: { x: -999, y: -999, tx: -1, ty: -1 }, chests: chests, enemySpawns: spawns, props: props, lights: lights,
      ambient: '10,12,22,0.55', playerLight: 190, viewR: 250, fog: 0.1, fogColor: '40,46,60', ground: cellarGround, detail: cellarDetail, drawSolid: cellarSolid, reveal: false, viewBoost: 1.1 });
    map.cellar = true; map.exit = exit; map.art = art; map.vaultRoom = VAULT;
    // reachability
    var seen = new Uint8Array(N), q = [at(Math.floor(spawn.x / T), Math.floor(spawn.y / T))], qi = 0; seen[q[0]] = 1; while (qi < q.length) { var c0 = q[qi++], x0 = c0 % CW, y0 = (c0 / CW) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var xx = x0 + d[0], yy = y0 + d[1]; if (xx < 0 || yy < 0 || xx >= CW || yy >= CH) return; var ni = at(xx, yy); if (seen[ni] || tiles[ni]) return; seen[ni] = 1; q.push(ni); }); }
    var ok = true; chests.forEach(function (ch) { if (!seen[at(ch.tx, ch.ty)]) ok = false; }); return ok ? map : null;
  }
  function cellarGround(kind, hv) { var v = Math.floor(hv * 14); return 'rgb(' + (62 + v) + ',' + (60 + v) + ',' + (64 + v) + ')'; }
  function cellarDetail(c, kind, sx, sy, hv, t, tx, ty) {
    c.strokeStyle = 'rgba(14,12,16,.55)'; c.lineWidth = 1; c.strokeRect(sx + 0.5, sy + 0.5, 31, 31); c.beginPath(); c.moveTo(sx + 16, sy); c.lineTo(sx + 16, sy + 32); c.stroke();
    if (hv < 0.12) { c.fillStyle = 'rgba(30,60,50,.4)'; c.beginPath(); c.ellipse(sx + 16, sy + 16, 11, 6, hv * 8, 0, TAU); c.fill(); }
    if (hv > 0.9) { c.strokeStyle = 'rgba(8,6,10,.7)'; c.beginPath(); c.moveTo(sx + 6, sy + 10); c.lineTo(sx + 14, sy + 16); c.lineTo(sx + 12, sy + 26); c.stroke(); }
  }
  function cellarSolid(c, kind, sx, sy, hv, t, tx, ty) {
    c.fillStyle = '#26242c'; c.fillRect(sx, sy - 8, 32, 40); c.fillStyle = '#3a3840'; c.fillRect(sx, sy - 8, 32, 14); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(sx, sy - 8, 32, 2);
    c.strokeStyle = 'rgba(8,8,12,.7)'; c.lineWidth = 1; for (var i = 0; i < 4; i++) { c.beginPath(); c.moveTo(sx, sy - 2 + i * 8); c.lineTo(sx + 32, sy - 2 + i * 8); c.stroke(); c.beginPath(); c.moveTo(sx + ((i * 11 + tx * 7) % 32), sy - 2 + i * 8); c.lineTo(sx + ((i * 11 + tx * 7) % 32), sy + 6 + i * 8); c.stroke(); }
    if (hv > 0.7) { c.fillStyle = 'rgba(50,80,60,.5)'; c.fillRect(sx + 4, sy + 14, 12, 8); c.fillRect(sx + 10, sy + 20, 5, 8); }
    if (hv < 0.2) { c.strokeStyle = 'rgba(210,210,214,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx, sy - 2); c.lineTo(sx + 12, sy + 10); c.moveTo(sx + 6, sy - 2); c.lineTo(sx + 12, sy + 10); c.moveTo(sx + 12, sy + 10); c.lineTo(sx + 14, sy + 20); c.stroke(); } // cobwebs
  }
  function cellarProp(c, sx, sy, kd, sd) {
    c.save(); c.translate(sx, sy); c.rotate((sd - 0.5) * 1.2); c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, 8, 13, 4, 0, 0, TAU); c.fill();
    if (kd === 0) { c.fillStyle = '#3a2c20'; c.fillRect(-9, -16, 18, 30); c.fillStyle = '#4e3c2c'; c.fillRect(-7, -14, 14, 26); c.strokeStyle = '#8a7a50'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, -12); c.lineTo(0, 10); c.moveTo(-5, -4); c.lineTo(5, -4); c.stroke(); } // a coffin
    else if (kd === 1) { c.fillStyle = '#5a4026'; c.fillRect(-8, -8, 16, 16); c.strokeStyle = '#2a1c10'; c.lineWidth = 1.4; c.strokeRect(-8, -8, 16, 16); c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.stroke(); }
    else if (kd === 2) { c.fillStyle = '#d8d4c0'; for (var i = 0; i < 5; i++) { c.save(); c.rotate(i * 1.3 + sd * 3); c.fillRect(-9, i * 2 - 4, 14, 2.4); c.restore(); } c.beginPath(); c.arc(4, 2, 4, 0, TAU); c.fill(); c.fillStyle = '#10080a'; c.fillRect(2, 1, 1.6, 1.6); c.fillRect(5, 1, 1.6, 1.6); }
    else if (kd === 3) { c.fillStyle = '#4a4440'; c.fillRect(-10, -12, 20, 20); c.fillStyle = '#5e5852'; c.fillRect(-10, -12, 20, 5); c.strokeStyle = 'rgba(210,210,214,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-10, -12); c.lineTo(0, -4); c.lineTo(10, -12); c.stroke(); } // a sarcophagus lid
    else { c.fillStyle = '#6a604c'; for (var j = 0; j < 5; j++) { c.beginPath(); c.arc(-10 + j * 5, 2 + (j % 2) * 3, 3 + (j % 3), 0, TAU); c.fill(); } }
    c.restore();
  }
  function stairsUp(c, sx, sy, t) { c.fillStyle = '#18141a'; c.fillRect(sx - 18, sy - 14, 36, 30); for (var i = 0; i < 5; i++) { c.fillStyle = 'rgb(' + (70 + i * 14) + ',' + (66 + i * 13) + ',' + (60 + i * 12) + ')'; c.fillRect(sx - 18 + i * 2, sy + 12 - i * 6, 36 - i * 4, 5); } c.fillStyle = 'rgba(255,220,150,' + (0.1 + 0.06 * Math.sin(t * 2)) + ')'; c.fillRect(sx - 18, sy - 14, 36, 30);
    var p = hero(); if (p && V.cellar && Math.hypot(p.x - V.cellar.exit.x, p.y - V.cellar.exit.y) < 60) { c.font = 'bold 10px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#ffe08a'; c.fillText('[F] Climb back up', sx, sy - 22); c.textAlign = 'left'; } }
  V.generateCellar = function (fixedSeed) {
    var seed = Number.isFinite(fixedSeed) ? fixedSeed >>> 0 : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, map = null, tries = 0;
    while (!map && tries < 24) { map = buildCellar(seeded(seed + tries * 6151)); tries++; }
    if (!map) throw new Error('Cellar generation failed'); map.seed = seed; V.cellar = map; return map;
  };
  function interactCellar() { var p = hero(), m = V.cellar; if (p && m && Math.hypot(p.x - m.exit.x, p.y - m.exit.y) < 60) { if (CC.leaveCellar) CC.leaveCellar(); return true; } return false; }

  /* =================== per-frame: weather progress, lightning, apparitions, ghosts, spawns =================== */
  var E = CC.Enemies, oUpdate = E && E.update;
  if (E) E.update = function (dt) {
    var res = oUpdate.apply(this, arguments), m = village(); if (!m) return res;
    var v = m.vil, p = hero(), i;
    if (p) { var target = clamp((p.x - 6 * T) / ((v.plazaX - 14 - 6) * T), 0, 1); v.u += (target - v.u) * Math.min(1, dt * (target > v.u ? 0.9 : 0.4)); }
    // lightning and thunder
    if (v.flash > 0) { v.flash -= dt; if (v.flashPat > 0) v.flashPat = Math.max(0, v.flashPat - dt); if (v.flash <= 0) v.bolt = null; }
    if (v.u > 0.28) { v.nextFlash -= dt; if (v.nextFlash <= 0) { v.flash = 0.5; v.flashPat = 0.35; v.bolt = { x: 0.1 + R() * 0.8, seed: (R() * 99) | 0 }; v.nextFlash = (3 + R() * 8) * (1.4 - 0.7 * v.u); v.thunder = 0.5 + R() * 0.9; } }
    if (v.thunder > 0) { v.thunder -= dt; if (v.thunder <= 0) { if (CC.fx && CC.fx.shake) CC.fx.shake(3 + v.u * 5); if (CC.Audio) CC.Audio.event('thunder', { vol: 0.5 + 0.5 * v.u }); } }
    // apparitions
    for (i = v.wisps.length - 1; i >= 0; i--) { var w = v.wisps[i]; if (w.fx) { stepWisp(w, dt); continue; } w.age += dt; w.x += w.vx * dt; w.y += w.vy * dt; if (w.age >= w.life) v.wisps.splice(i, 1); }
    if (p && v.u > 0.25 && v.wisps.length < 1 + Math.floor(v.u * 4) && R() < dt * (0.2 + v.u * 0.9)) { var a = R() * TAU, d = 100 + R() * 220; v.wisps.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.7, age: 0, life: 3 + R() * 3, vx: (R() - 0.5) * 8, vy: (R() - 0.5) * 6, seed: R() * 50, sc: 0.95 + R() * 0.5, blue: R() < 0.6 }); }
    // the graveyard ghosts fade in and out on their own slow tides (but never while you are speaking to one)
    var t = Date.now() / 1000;
    v.ghosts.forEach(function (g, gi) { g.idx = gi; var tide = 0.5 + 0.5 * Math.sin(t * 0.35 + g.seed * 2.1), near = p && Math.hypot(p.x - g.x, p.y - g.y) < 120; var want = clamp((tide - 0.2) * 1.6, 0, 1) * (near ? 1 : 0.85); g.a += (want - g.a) * Math.min(1, dt * 1.2); if (p && near) g.face = p.x < g.x ? -1 : 1; });
    if (V.speech && Date.now() - V.speech.t0 > 6500) V.speech = null;
    return res;
  };

  /* =================== monsters in the village and the cellar =================== */
  var oSpawn = E && E.spawnForFloor;
  if (E) E.spawnForFloor = function (floor, points) {
    var s = CC.state; if (!(s && (s.area === 'village' || s.area === 'village-cellar') && CC.Dungeon && (CC.Dungeon === V.map || CC.Dungeon === V.cellar))) return oSpawn.apply(this, arguments);
    this.list.length = 0; this.projectiles.length = 0; this.boss = null; this.zones = []; this.remains = []; if (this.gore) this.gore = [];
    if (CC.Loot && CC.Loot.clear) CC.Loot.clear();
    var lvl = s.area === 'village-cellar' ? 4 : 3, grp = 12000;
    for (var i = 0; i < points.length; i++) { var pt = points[i], e = this.spawn(pt.type, pt.x, pt.y, lvl); if (e && (pt.type === 'ghoul' || pt.type === 'skeleton')) { e.group = grp + (i >> 2); } }
    return this.list;
  };

  /* =================== slashing the village: apparitions and the watching trees =================== */
  // The wandering apparitions (not the friendly graveyard ghosts) can be cut at: the blade passes through, the ghost reforms, blinks away a little and says "Hey!".
  // The trees with eyes can be slashed too (it sounds like it hurts them). Do it 10 swings in a row and the tree strikes back: see impale below.
  function angd(a, b) { var d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
  function wispAlpha(w) { return Math.pow(Math.sin(Math.PI * clamp(w.age / w.life, 0, 1)), 1.3) * 0.5; }
  function stepWisp(w, dt) {
    var f = w.fx; f.t += dt;
    if (f.t >= 0.9 && !f.moved) { // blink: sparks where it was, and it reappears a little way off
      f.moved = true; var m = village(), ox = w.x, oy = w.y, tries = 0, nx = ox, ny = oy;
      for (; tries < 10; tries++) { var a = R() * TAU, d = 75 + R() * 55; nx = ox + Math.cos(a) * d; ny = oy + Math.sin(a) * d * 0.8; if (!(CC.Dungeon && CC.Dungeon.isSolid && CC.Dungeon.isSolid(nx, ny))) break; }
      if (CC.fx && CC.fx.burst) { CC.fx.burst(ox, oy - 12, '#9fd8ff', 7, 60); CC.fx.burst(nx, ny - 12, '#9fd8ff', 7, 60); }
      w.x = nx; w.y = ny; w.vx = (R() - 0.5) * 6; w.vy = (R() - 0.5) * 4;
    }
    if (f.t >= 0.98 && !f.said) { f.said = true; if (CC.Audio) CC.Audio.fx('m_ghost_atk', { x: w.x, y: w.y, vol: 0.7, k: 1.5, gap: 0 }); }
    if (f.t >= 2.8) w.fx = null;
  }
  function drawWisps(c, cam, v, t, p) {
    for (var i = 0; i < v.wisps.length; i++) {
      var w = v.wisps[i], a = wispAlpha(w), x = w.x - cam.x, y = w.y - cam.y + Math.sin(t * 1.4 + w.seed) * 3, face = p && p.x < w.x ? -1 : 1, col = w.blue ? '#5ac8ff' : '#aaff9a', f = w.fx;
      if (!f) { ghostShape(c, x, y, a, face, w.sc, t, w.seed, col, false); continue; }
      var vis = Math.max(a, 0.55) * (f.t < 0.7 ? 1 : f.t < 0.9 ? 1 - (f.t - 0.7) / 0.2 : f.t < 1.15 ? (f.t - 0.9) / 0.25 : 1); // it stays visible while it is being cut
      var th = f.ang + 1.2, cy2 = y - 14 * w.sc, sep = f.t < 0.18 ? 11 * clamp(f.t / 0.18, 0, 1) : 11 * (1 - clamp((f.t - 0.18) / 0.37, 0, 1)), s2 = 0;
      if (sep > 0.2) for (s2 = -1; s2 <= 1; s2 += 2) { // the two halves, each clipped to its side of the cut and pushed apart
        c.save(); c.translate(x, cy2); c.rotate(th); c.beginPath(); c.rect(-120, s2 < 0 ? -120 : 0, 240, 120); c.clip(); c.translate(0, s2 * sep); c.rotate(-th); c.translate(-x, -cy2);
        ghostShape(c, x, y, vis, face, w.sc, t, w.seed, col, false); c.restore();
      } else ghostShape(c, x, y, vis, face, w.sc, t, w.seed, col, false);
      if (f.t < 0.3) { // the bright line where the blade went through
        var la = 1 - f.t / 0.3; c.save(); c.globalCompositeOperation = 'lighter'; c.translate(x, cy2); c.rotate(th); c.globalAlpha = la; c.strokeStyle = '#eaf8ff'; c.lineWidth = 2.2 * la + 0.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-26, 0); c.lineTo(26, 0); c.stroke(); c.restore();
      }
      if (f.t > 0.98 && f.t < 2.6) { // "Hey!"
        var sa = f.t - 0.98, al = sa < 0.15 ? sa / 0.15 : clamp((2.6 - f.t) / 0.5, 0, 1), pop = 1 + (sa < 0.15 ? (1 - sa / 0.15) * 0.4 : 0);
        c.save(); c.globalAlpha = al; c.textAlign = 'center'; c.font = 'bold ' + Math.round(13 * pop) + 'px Georgia, serif'; c.lineWidth = 3.2; c.strokeStyle = 'rgba(8,16,30,.9)'; c.fillStyle = '#e8f6ff'; c.strokeText('Hey!', x, y - 50 * w.sc - sa * 4); c.fillText('Hey!', x, y - 50 * w.sc - sa * 4); c.restore();
      }
    }
  }
  function treeEyed(m, tx, ty) { var u = m.vil.u, pe = clamp((u - 0.12) / 0.88, 0, 1); return u > 0.12 && m.kind[ty * m.w + tx] === 3 && hash(tx * 3, ty * 5) <= 0.05 + pe * 0.4; }
  V.treeHits = 0; var lastTreeHit = 0;
  V.onSwing = function (p, ang, reach) {
    var s = CC.state, m = village(); if (!m || !p || s.coop || V.impale) return; var v = m.vil, i, hit = false;
    for (i = 0; i < v.wisps.length; i++) { // the blade passes through an apparition
      var w = v.wisps[i]; if (w.fx || wispAlpha(w) < 0.06) continue; var dx = w.x - p.x, dy = w.y - 12 - p.y;
      if (Math.hypot(dx, dy) > reach + 24 || Math.abs(angd(Math.atan2(dy, dx), ang)) > 1.25) continue;
      w.age = w.life * 0.5; w.fx = { t: 0, ang: ang }; hit = true;
      if (CC.Audio) { CC.Audio.fx('m_ghost_cast', { x: w.x, y: w.y, vol: 0.6, k: 1.2, gap: 0 }); CC.Audio.fx('dash', { x: w.x, y: w.y, vol: 0.4, gap: 0 }); }
      if (CC.fx && CC.fx.burst) CC.fx.burst(w.x, w.y - 12, '#bfe9ff', 6, 70);
    }
    var best = null, bd = 1e9, tx0 = Math.floor((p.x - reach - 30) / T), tx1 = Math.floor((p.x + reach + 30) / T), ty0 = Math.floor((p.y - reach - 40) / T), ty1 = Math.floor((p.y + reach + 30) / T);
    for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) { // an eyed tree in front of the swing
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || !treeEyed(m, tx, ty)) continue;
      var cx = tx * T + 16, cy = ty * T + 18, ddx = cx - p.x, ddy = cy - p.y, d = Math.hypot(ddx, ddy);
      if (d > reach + 18 || Math.abs(angd(Math.atan2(ddy, ddx), ang)) > 1.35) continue; if (d < bd) { bd = d; best = { x: cx, y: cy, tx: tx, ty: ty }; }
    }
    var now = Date.now();
    if (best) {
      if (now - lastTreeHit > 5000) V.treeHits = 0; lastTreeHit = now; V.treeHits++; hit = true;
      if (CC.Audio) { CC.Audio.fx('hit', { x: best.x, y: best.y, vol: 0.85, gap: 0 }); CC.Audio.fx('m_plant_atk', { x: best.x, y: best.y, vol: 0.7, gap: 0 }); if (V.treeHits >= 4) CC.Audio.fx('m_plant_amb', { x: best.x, y: best.y, vol: 0.4 + V.treeHits * 0.05, k: 1 - V.treeHits * 0.04, gap: 0 }); }
      if (CC.fx) { if (CC.fx.burst) { CC.fx.burst(best.x, best.y - 14, '#3a2a1c', 9, 80); CC.fx.burst(best.x, best.y - 14, '#150e0c', 5, 60); } if (CC.fx.shake) CC.fx.shake(1 + V.treeHits * 0.15); }
      if (V.treeHits >= 10) { V.treeHits = 0; startImpale(p, best); }
    } else if (!hit) V.treeHits = 0; // anything but a tree swing breaks the streak
  };

  /* ---- the tree strikes back: the screen cuts to black on a freeze-frame of the hero and the tree; a branch drives through his chest and lifts him off the ground ---- */
  var IMP_DUR = 4.8;
  function startImpale(p, tr) {
    V.impale = { t0: Date.now(), dur: IMP_DUR, done: false, cls: p.classId, hit: false, s0: false, s1: false, s2: false };
    if (CC.Audio) CC.Audio.fx('m_plant_amb', { vol: 0.9, k: 0.7, gap: 0 });
  }
  V.frozen = function () { return !!(V.impale && !V.impale.done); };
  function sm01(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function limb(c, x0, y0, x1, y1, w0, w1, bloodFrom) { // a gnarled, tapering branch from (x0,y0) to (x1,y1); it turns red from `bloodFrom` (0..1 along its length)
    var n = 14, i, L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    for (i = 0; i < n; i++) {
      var f0 = i / n, f1 = (i + 1) / n, o0 = Math.sin(f0 * 9 + 1) * 1.6, o1 = Math.sin(f1 * 9 + 1) * 1.6, a0 = x0 + (x1 - x0) * f0 + nx * o0, b0 = y0 + (y1 - y0) * f0 + ny * o0, a1 = x0 + (x1 - x0) * f1 + nx * o1, b1 = y0 + (y1 - y0) * f1 + ny * o1;
      var wd = w0 + (w1 - w0) * f0, bl = bloodFrom !== undefined && f0 >= bloodFrom;
      c.lineCap = 'round'; c.strokeStyle = bl ? '#3a0a0e' : '#1c1412'; c.lineWidth = wd + 1.4; c.beginPath(); c.moveTo(a0, b0); c.lineTo(a1, b1); c.stroke();
      c.strokeStyle = bl ? '#7a0f18' : '#3a2c22'; c.lineWidth = wd * 0.55; c.beginPath(); c.moveTo(a0 - nx * wd * 0.15, b0 - ny * wd * 0.15); c.lineTo(a1 - nx * wd * 0.15, b1 - ny * wd * 0.15); c.stroke();
    }
    for (i = 1; i < 5; i++) { var f = i / 5.5, px = x0 + (x1 - x0) * f, py = y0 + (y1 - y0) * f, bl2 = bloodFrom !== undefined && f >= bloodFrom; c.strokeStyle = bl2 ? '#5a0c12' : '#241a14'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(px, py); c.lineTo(px + nx * (i % 2 ? 5 : -5) + (x1 - x0) / L * 2, py + ny * (i % 2 ? 5 : -5) + (y1 - y0) / L * 2); c.stroke(); }
  }
  V.drawCinema = function (c, W, H) {
    var im = V.impale; if (!im) return false; var s = CC.state, p = hero();
    if (im.done && s.mode !== 'dead') { V.impale = null; return false; }
    var T = (Date.now() - im.t0) / 1000, A = CC.Audio;
    if (!im.done && T >= im.dur) { im.done = true; if (p) { p.hp = 0; p.invuln = 0; } } // the hero dies; the game's own death screen takes over
    // sounds on the beats
    if (A) {
      if (!im.s0 && T > 0.5) { im.s0 = true; A.fx('m_plant_amb', { vol: 1, k: 0.55, gap: 0 }); }
      if (!im.s1 && T >= 1.05) { im.s1 = true; A.fx('crunch', { vol: 1, gap: 0 }); A.fx('wet', { vol: 0.9, gap: 0 }); A.fx('thump', { vol: 0.9, gap: 0 }); A.fx('hit', { vol: 1, gap: 0 }); if (CC.MonsterSound && p) CC.MonsterSound.ugh(p); if (CC.fx && CC.fx.shake) CC.fx.shake(10); }
      if (!im.s2 && T >= 1.5) { im.s2 = true; A.play('bloodsplatter3', { vol: 0.8, gap: 0 }); }
    }
    var fade = sm01(T / 0.18), S = Math.min(W / 175, H / 120), cx = W / 2, cy = H * 0.5, shake = T > 1.05 && T < 1.6 ? (1.6 - T) / 0.55 * 3 : 0;
    c.save(); c.globalAlpha = fade; c.fillStyle = '#020104'; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    if (fade < 0.02) { c.restore(); return true; }
    c.translate(cx + (R() - 0.5) * shake * 2, cy + (R() - 0.5) * shake * 2); c.scale(S, S);
    var pulse = 0.5 + 0.5 * Math.sin(T * 5), rg = c.createRadialGradient(0, 8, 8, 0, 8, 150); rg.addColorStop(0, 'rgba(120,10,16,' + (0.28 + 0.06 * pulse) + ')'); rg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = rg; c.fillRect(-170, -120, 340, 260);
    c.globalAlpha = fade;
    // the geometry: hero stands at (hx,hy) facing the tree on the right; the branch starts high on the trunk at B0
    var lift = sm01((T - 1.35) / 1.0) * 12, hx = -10, hy = 30 - lift, B0x = 44, B0y = 2, chx = hx + 3, chy = hy - 4, ex = chx - 30, ey = chy - 12 * 0 + 6;
    var Lt = Math.hypot(ex - B0x, ey - B0y), Lc = Math.hypot(chx - B0x, chy - B0y), rc = Lc / Lt;
    var reach = T < 1.0 ? 0.32 * sm01(T / 1.0) * (1 + 0.04 * Math.sin(T * 9)) : T < 1.14 ? 0.32 + 0.68 * sm01((T - 1.0) / 0.14) : 1;
    var tipx = B0x + (ex - B0x) * reach, tipy = B0y + (ey - B0y) * reach;
    // ground shadow and the blood pool that grows under him
    c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.ellipse(hx, 46, 14, 4, 0, 0, TAU); c.fill();
    if (T > 1.4) { var pa = clamp((T - 1.4) / 3, 0, 1); c.fillStyle = 'rgba(90,6,12,.9)'; c.beginPath(); c.ellipse(hx - 2, 47, 5 + pa * 15, 1.8 + pa * 3.2, 0, 0, TAU); c.fill(); }
    // the tree: black and bare, with two red eyes in the trunk that open as the branch comes
    tree(c, 30, 16, 0.55, T, 1, 3, 3);
    var eo = sm01((T - 0.1) / 0.5); eye(c, 45, -6, 3.2, -1, eo, '#ff2a2a'); eye(c, 53, -1, 2.6, -1, eo, '#ff2a2a');
    // the part of the branch that has already come out the far side of the hero (behind him)
    if (reach > rc) limb(c, chx, chy, tipx, tipy, 4.6, 2.2, 0);
    // the hero: a freeze-frame at first; after the strike he is slumped, lifted off his feet and swaying
    var slump = T < 1.1 ? 0 : -0.32 * sm01((T - 1.1) / 0.4) + Math.sin(T * 1.7) * 0.03 * sm01((T - 1.6) / 0.6), tremble = T < 1.0 ? Math.sin(T * 40) * 0.25 * sm01(T / 1.0) : 0;
    c.save(); c.translate(chx, chy); c.rotate(slump); c.translate(-chx + tremble, -chy);
    if (p && CC.Classes && CC.Classes.drawCriticalHero) CC.Classes.drawCriticalHero(c, { x: 0, y: 0 }, { heroClass: im.cls, sourceX: hx, sourceY: hy, angle: 0, distance: 0, kneel: 0, drive: 0, withdraw: 0, noBlade: true });
    c.restore();
    // the part still in front of him, and the wound it made
    if (reach > 0.02) limb(c, B0x, B0y, Math.min(tipx, chx + 2), reach > rc ? chy : tipy, 6.2, 4.6, reach > rc ? 0.8 : undefined);
    if (T > 1.0) { c.fillStyle = '#6a0a12'; c.beginPath(); c.ellipse(chx + 1, chy, 4.5, 6, 0, 0, TAU); c.fill(); c.fillStyle = '#b01824'; c.beginPath(); c.ellipse(chx + 1, chy, 2.4, 3.4, 0, 0, TAU); c.fill(); }
    // blood: a burst at the strike, then streaks down his body, down the branch and drips from his feet
    var k, bt = T - 1.08;
    if (bt > 0) for (k = 0; k < 22; k++) { var ba = (k * 2.399) % TAU, v = 30 + (k * 37 % 50), x = chx + Math.cos(ba) * v * bt, y = chy + Math.sin(ba) * v * bt * 0.8 + 110 * bt * bt, al = clamp(1 - bt / 0.9, 0, 1); if (al > 0) { c.globalAlpha = al * fade; c.fillStyle = k % 3 ? '#a8101a' : '#5a060c'; c.fillRect(x - 1, y - 1, 2.2, 2.2); } }
    c.globalAlpha = fade;
    if (T > 1.3) {
      var gr = clamp((T - 1.3) / 1.5, 0, 1); c.strokeStyle = '#7a0a12'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(chx + 1, chy + 3); c.lineTo(chx + 1.5, chy + 3 + 16 * gr); c.stroke(); c.beginPath(); c.moveTo(chx - 3, chy + 1); c.lineTo(chx - 3.5, chy + 1 + 11 * gr); c.stroke();
      for (k = 0; k < 4; k++) { var ph = (T * 1.4 + k * 0.27) % 1, dx = k < 2 ? chx + 1 + k * 0.5 : tipx - 1 + (k - 2) * 2, dy0 = k < 2 ? hy + 14 : tipy + 3; c.globalAlpha = (1 - ph * 0.5) * fade; c.fillStyle = '#9a0f18'; c.beginPath(); c.ellipse(dx, dy0 + ph * ph * (47 - dy0 + (k < 2 ? 0 : 20)), 1, 1.7, 0, 0, TAU); c.fill(); }
      c.globalAlpha = fade;
    }
    c.restore();
    if (T > 1.04 && T < 1.22) { c.save(); c.globalAlpha = (1 - (T - 1.04) / 0.18) * 0.85; c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.restore(); } // the white flash of the blow
    c.restore(); return true;
  };

  /* =================== screen: title and the ghosts' speech =================== */
  function wrapLines(c, text, maxW) { var words = String(text).split(' '), lines = [], ln = ''; for (var i = 0; i < words.length; i++) { var t2 = ln ? ln + ' ' + words[i] : words[i]; if (c.measureText(t2).width > maxW && ln) { lines.push(ln); ln = words[i]; } else ln = t2; } if (ln) lines.push(ln); return lines; }
  V.drawOverlay = function (c, Wd, Hd) {
    var s = CC.state; if (!s || (s.area !== 'village' && s.area !== 'village-cellar')) return;
    if (V.title > 0) { V.title -= 1 / 60; var a = V.title > 5 ? (7 - V.title) / 2 : Math.min(1, V.title / 2); c.save(); c.globalAlpha = a; c.textAlign = 'center'; c.font = 'italic ' + Math.min(44, Wd / 8.2) + 'px Georgia, serif'; c.shadowColor = 'rgba(200,215,230,0.9)'; c.shadowBlur = 16; c.fillStyle = 'rgba(236,240,246,0.96)'; var nm = s.area === 'village' ? 'A b a n d o n e d   V i l l a g e' : 'T h e   C e l l a r'; c.fillText(nm, Wd / 2, Hd * 0.3); c.restore(); }
    if (V.speech && Date.now() - V.speech.t0 > 6500) V.speech = null;
    var sp = V.speech; if (sp && CC.DialogBox) CC.DialogBox.draw(c, Wd, Hd, function () {}, { name: sp.name, text: sp.text, low: true });
    var p = hero(), m = V.map; if (p && s.area === 'village' && m && Math.hypot(p.x - m.backPos.x, p.y - m.backPos.y) < 60) { c.save(); c.font = 'bold 12px Georgia, serif'; c.textAlign = 'center'; var tt = '[F] Back to the Rocky Pass', w2 = c.measureText(tt).width + 24; c.fillStyle = 'rgba(14,10,8,0.8)'; c.fillRect(Wd / 2 - w2 / 2, Hd * 0.62, w2, 24); c.fillStyle = '#ffe08a'; c.fillText(tt, Wd / 2, Hd * 0.62 + 16); c.restore(); }
  };
  V.backMarker = null;
})(window);
