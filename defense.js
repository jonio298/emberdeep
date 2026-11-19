/* CC.Defense - TOWN DEFENSE, the two-player wave-survival mode.
 *
 * A big forest town ringed by a spiked palisade with four gates (N, E, S, W). A supply box sits in the
 * middle. Waves of monsters pour out of the forest through the gates; if they reach the box and break it,
 * the run is lost. Waves escalate: mixed packs, swarms of weak monsters, and a boss every fifth wave.
 *
 * The HOST simulates everything (spawns, AI, the box's health, wave timer). The guest receives the usual
 * enemy snapshots plus a small 'df' state packet (wave, phase, timer, enemies left, box health) and shows
 * the same banners and HUD. The arena itself is generated from a shared seed, so both phones build the
 * identical map.
 *
 * Hooks used elsewhere: main.js (loadFloor, update, draw), enemies.js (pickFocus / damageBox / projHitsBox),
 * multiplayer.js (state packets, lobby mode).
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var T = CC.TILE = CC.TILE || 32, PI2 = Math.PI * 2;
  var W = 80, H = 80, CX = 40, CY = 40, FX0 = 18, FX1 = 61, FY0 = 18, FY1 = 61, GH = 2; // fence rect, gate half-width
  var D = CC.Defense = { W: W, H: H, map: null };
  var S = D.S = { on: false, phase: 'idle', wave: 0, timer: 0, left: 0, pending: [], best: 0, kills: 0, spawnAcc: 0,
    clearedHealed: false, boss: false, banner: null, respawnT: 0, stamp: 0, theme: 'normal',
    tb: { phase: 'reload', t: 14, op: 0, ang: -Math.PI / 2, tgt: -Math.PI / 2, cd: 0, swing: 0, announced: false, mcd: 0, cc: 0, charge: 0 }, bolts: [], booms: [], toast: null };
  S.pickups = []; S.meteor = null;
  var FIRE_LEN = 30, RELOAD_LEN = 90, SHOT_GAP = 0.5, CHARGE_CD = 10, TAP_MAX = 0.4; // the charged bolt needs 10 s between shots // the crossbow comes online every 120 s for 30 s
  var GATES = [ // N, E, S, W
    { name: 'NORTH', x: CX * T, y: FY0 * T + T / 2, dx: 0, dy: -1 },
    { name: 'EAST', x: FX1 * T + T / 2, y: CY * T, dx: 1, dy: 0 },
    { name: 'SOUTH', x: CX * T, y: FY1 * T + T / 2, dx: 0, dy: 1 },
    { name: 'WEST', x: FX0 * T + T / 2, y: CY * T, dx: -1, dy: 0 }
  ];

  function seeded(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hash(a, b) { var n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function isHost() { return !(CC.Multiplayer && CC.Multiplayer.isGuest && CC.Multiplayer.isGuest()); }
  function art() { return CC.Forest && CC.Forest.art; }

  /* ---------------------------------------------------------------- art */
  function ground(kind, hv, tx, ty) {
    var A = art();
    if (kind === 2) { // town earth and the roads: pale packed dirt
      var g = 66 + Math.floor(hv * 12);
      return 'rgb(' + g + ',' + (g - 12) + ',' + (g - 28) + ')';
    }
    if (kind === 6) return hv < 0.5 ? '#5d4630' : '#553f2b'; // plaza planks
    if (kind === 1) return hv < 0.5 ? '#4a3220' : '#432c1c';
    return A ? A.ground(0, hv) : '#13241b';
  }
  function detail(ctx, kind, sx, sy, hv, t, tx, ty) {
    var A = art();
    if (kind === 2) {
      if (hv < 0.3) { ctx.fillStyle = 'rgba(30,20,10,0.2)'; ctx.fillRect(sx + 4, sy + 6 + hv * 40, 24, 2); }
      else if (hv > 0.86) { ctx.fillStyle = 'rgba(120,105,85,0.5)'; ctx.fillRect(sx + 9 + hv * 8, sy + 11, 4, 3); }
      return;
    }
    if (kind === 6) { // plank seams
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(sx, sy + 10, T, 1); ctx.fillRect(sx, sy + 21, T, 1);
      ctx.fillRect(sx + ((tx * 7 + ty * 3) % 3) * 9 + 6, sy, 1, T);
      return;
    }
    if (A && (kind === 0)) A.detail(ctx, 0, sx, sy, hv, t, tx, ty);
  }
  function drawSolid(ctx, kind, sx, sy, hv, t, tx, ty) {
    var A = art();
    if (kind === 7) { drawFence(ctx, sx, sy, hv, tx, ty); return; }
    if (kind === 9) return; // towers are drawn by a prop
    if (A) A.drawSolid(ctx, kind, sx, sy, hv);
  }
  // The spiked palisade: sharpened logs, two rails, and iron spikes bristling outward.
  function drawFence(ctx, sx, sy, hv, tx, ty) {
    var out = ty === FY0 ? 'u' : ty === FY1 ? 'd' : tx === FX0 ? 'l' : 'r', base = sy + T, i, x, h;
    ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.fillRect(sx - 1, base - 4, T + 2, 6);
    for (i = 0; i < 4; i++) {
      h = 50 + Math.floor(hash(tx * 5 + i, ty * 3 + 1) * 12); x = sx + i * 8;
      ctx.fillStyle = i % 2 ? '#43301f' : '#4f3724'; ctx.fillRect(x, base - h, 8, h);
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(x + 7, base - h, 1, h);
      ctx.fillStyle = 'rgba(160,110,70,0.16)'; ctx.fillRect(x + 1, base - h, 1, h);
      ctx.fillStyle = '#6a4a30'; ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x + 4, base - h - 11); ctx.lineTo(x + 8, base - h); ctx.fill(); // sharpened tip
      if ((tx + i) % 2 === 0) { ctx.fillStyle = '#aab0bc'; ctx.beginPath(); ctx.moveTo(x + 1.5, base - h - 3); ctx.lineTo(x + 4, base - h - 14); ctx.lineTo(x + 6.5, base - h - 3); ctx.fill(); } // iron-capped
    }
    ctx.fillStyle = '#2c1d12'; ctx.fillRect(sx, base - 38, T, 4); ctx.fillRect(sx, base - 20, T, 4); // rails
    ctx.fillStyle = '#9096a4'; // iron spikes angled out from the rails
    for (i = 0; i < 4; i++) {
      var yy = base - 36 + (i % 2) * 18;
      ctx.beginPath();
      if (out === 'u') { ctx.moveTo(sx + 2 + i * 8, yy); ctx.lineTo(sx + 6 + i * 8, yy - 9); ctx.lineTo(sx + 10 + i * 8, yy); }
      else if (out === 'd') { ctx.moveTo(sx + 2 + i * 8, yy + 3); ctx.lineTo(sx + 6 + i * 8, yy + 12); ctx.lineTo(sx + 10 + i * 8, yy + 3); }
      else if (out === 'l') { ctx.moveTo(sx + 2, yy - 2 + i * 3); ctx.lineTo(sx - 9, yy + 2 + i * 3); ctx.lineTo(sx + 2, yy + 5 + i * 3); }
      else { ctx.moveTo(sx + T - 2, yy - 2 + i * 3); ctx.lineTo(sx + T + 9, yy + 2 + i * 3); ctx.lineTo(sx + T - 2, yy + 5 + i * 3); }
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(210,216,230,0.55)'; ctx.fillRect(sx + 1, base - 37, T - 2, 1);
  }
  function tower(ctx, sx, sy, t) { // watchtower on a fence corner; (sx, sy) = foot centre
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(sx, sy + 4, 24, 8, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#3a2819'; ctx.fillRect(sx - 18, sy - 70, 5, 72); ctx.fillRect(sx + 13, sy - 70, 5, 72);
    ctx.fillStyle = '#2c1d12'; ctx.fillRect(sx - 18, sy - 40, 36, 4); ctx.fillRect(sx - 18, sy - 18, 36, 4);
    ctx.fillStyle = '#5a3f27'; ctx.fillRect(sx - 22, sy - 86, 44, 18); // platform + parapet
    ctx.fillStyle = '#3d2a1a'; for (var i = 0; i < 5; i++) ctx.fillRect(sx - 22 + i * 9, sy - 86, 4, 18);
    ctx.fillStyle = '#4a2e1c'; ctx.beginPath(); ctx.moveTo(sx - 28, sy - 86); ctx.lineTo(sx, sy - 112); ctx.lineTo(sx + 28, sy - 86); ctx.closePath(); ctx.fill(); // roof
    var f = 0.7 + 0.3 * Math.sin(t * 9 + sx);
    ctx.fillStyle = 'rgba(255,170,70,' + f + ')'; ctx.beginPath(); ctx.arc(sx + 20, sy - 92, 3.2, 0, PI2); ctx.fill();
    ctx.fillStyle = '#d8dce8'; ctx.fillRect(sx - 3, sy - 98, 2, 12); // a sentry's spear
  }
  function gatePost(ctx, sx, sy, t, c, pr) { // tall torch post beside a gate
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(sx, sy + 3, 12, 4, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#3d2a1a'; ctx.fillRect(sx - 4, sy - 78, 8, 80);
    ctx.fillStyle = '#9096a4'; ctx.beginPath(); ctx.moveTo(sx - 4, sy - 78); ctx.lineTo(sx, sy - 92); ctx.lineTo(sx + 4, sy - 78); ctx.fill();
    ctx.fillStyle = '#7a1b22'; ctx.fillRect(sx + (pr.flip ? -17 : 4), sy - 74, 13, 24); // banner
    ctx.fillStyle = '#e2b14a'; ctx.fillRect(sx + (pr.flip ? -13 : 8), sy - 68, 5, 5);
    var f = 0.75 + 0.25 * Math.sin(t * 10 + pr.seed);
    ctx.fillStyle = 'rgba(255,150,50,' + f + ')'; ctx.beginPath(); ctx.arc(sx, sy - 82, 4.6, 0, PI2); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,150,' + f + ')'; ctx.beginPath(); ctx.arc(sx, sy - 83, 2.2, 0, PI2); ctx.fill();
  }
  function crate(ctx, x, y, w, h, shade) {
    ctx.fillStyle = shade ? '#6a4a2c' : '#7a5632'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#3a2615'; ctx.lineWidth = 1.5; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
  }
  function barrel(ctx, sx, sy) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 3, 8, 3, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#5a3b22'; ctx.fillRect(sx - 6, sy - 14, 12, 16);
    ctx.fillStyle = '#7a5532'; ctx.fillRect(sx - 6, sy - 14, 3, 16);
    ctx.fillStyle = '#2a2a30'; ctx.fillRect(sx - 6, sy - 10, 12, 2); ctx.fillRect(sx - 6, sy - 2, 12, 2);
  }
  function propCrates(ctx, sx, sy, t, c, pr) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 4, 18, 6, 0, 0, PI2); ctx.fill();
    crate(ctx, sx - 14, sy - 12, 14, 14, false); crate(ctx, sx + 1, sy - 11, 13, 13, true); crate(ctx, sx - 7, sy - 25, 14, 14, false);
  }
  function propBarrel(ctx, sx, sy) { barrel(ctx, sx, sy); }
  function propFire(ctx, sx, sy, t, c, pr) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 4, 14, 5, 0, 0, PI2); ctx.fill();
    for (var i = 0; i < 6; i++) { var a = i / 6 * PI2; ctx.fillStyle = '#4a4640'; ctx.beginPath(); ctx.ellipse(sx + Math.cos(a) * 11, sy + 2 + Math.sin(a) * 4, 3.5, 2.6, 0, 0, PI2); ctx.fill(); }
    ctx.fillStyle = '#3a2214'; ctx.fillRect(sx - 8, sy - 2, 16, 3);
    var f = 0.7 + 0.3 * Math.sin(t * 11 + pr.seed);
    ctx.fillStyle = 'rgba(255,120,30,' + f + ')'; ctx.beginPath(); ctx.moveTo(sx - 6, sy); ctx.quadraticCurveTo(sx - 4, sy - 14 * f, sx, sy - 18 * f); ctx.quadraticCurveTo(sx + 4, sy - 12 * f, sx + 6, sy); ctx.fill();
    ctx.fillStyle = 'rgba(255,225,120,' + f + ')'; ctx.beginPath(); ctx.moveTo(sx - 3, sy); ctx.quadraticCurveTo(sx, sy - 11 * f, sx + 3, sy); ctx.fill();
  }

  // The supply box: stacked crates, sacks, a banner and a ring that shows how healthy it is.
  function drawBox(ctx, sx, sy, t, cam, pr) {
    var b = D.map && D.map.box; if (!b) return;
    var k = clamp(b.hp / b.maxHp, 0, 1), flash = b.flash > 0 ? Math.min(1, b.flash * 5) : 0, pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    var col = k > 0.6 ? '110,220,160' : k > 0.3 ? '255,200,90' : '255,90,80';
    ctx.save();
    var g = ctx.createRadialGradient(sx, sy + 4, 6, sx, sy + 4, 46 + pulse * 6);
    g.addColorStop(0, 'rgba(' + col + ',' + (0.34 + pulse * 0.12) + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy + 4, 50, 28, 0, 0, PI2); ctx.fill();
    ctx.strokeStyle = 'rgba(' + col + ',0.5)'; ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 8;
    ctx.beginPath(); ctx.ellipse(sx, sy + 6, 34, 16, 0, 0, PI2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 28, 9, 0, 0, PI2); ctx.fill();
    if (b.hp <= 0) { // smashed
      ctx.fillStyle = '#3a2819'; for (var i = 0; i < 6; i++) ctx.fillRect(sx - 20 + i * 7, sy - 4 + (i % 2) * 5, 8, 5);
      ctx.restore(); return;
    }
    crate(ctx, sx - 26, sy - 8, 20, 20, false); crate(ctx, sx - 4, sy - 8, 22, 20, true); crate(ctx, sx + 14, sy - 4, 16, 16, false);
    crate(ctx, sx - 17, sy - 26, 20, 19, true); crate(ctx, sx + 3, sy - 24, 18, 17, false);
    ctx.fillStyle = '#b79a62'; ctx.beginPath(); ctx.ellipse(sx - 31, sy + 6, 7, 6, 0, 0, PI2); ctx.fill(); ctx.fillStyle = '#8a7244'; ctx.fillRect(sx - 33, sy - 1, 4, 2); // sack
    ctx.fillStyle = '#3d2a1a'; ctx.fillRect(sx - 1, sy - 62, 3, 40); // banner pole
    var w = Math.sin(t * 3) * 2;
    ctx.fillStyle = '#7a1b22'; ctx.beginPath(); ctx.moveTo(sx + 2, sy - 62); ctx.lineTo(sx + 24 + w, sy - 58); ctx.lineTo(sx + 2, sy - 44); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e2b14a'; ctx.beginPath(); ctx.arc(sx + 9, sy - 55, 3, 0, PI2); ctx.fill();
    if (flash > 0) { ctx.fillStyle = 'rgba(255,60,60,' + (flash * 0.45) + ')'; ctx.fillRect(sx - 32, sy - 28, 64, 42); }
    // health bar floating above
    var bw = 64, bx = sx - bw / 2, by = sy - 74;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
    ctx.fillStyle = k > 0.6 ? '#5fd98a' : k > 0.3 ? '#f0c050' : '#f0504a'; ctx.fillRect(bx, by, bw * k, 6);
    ctx.fillStyle = '#fff1cd'; ctx.font = 'bold 7px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('SUPPLIES', sx, by - 3); ctx.textAlign = 'left';
    ctx.restore();
  }

  /* ---------------------------------------------------------------- map */
  D.generate = function (fixedSeed) {
    var seed = Number.isFinite(fixedSeed) ? (fixedSeed >>> 0) : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    var rng = seeded(seed), N = W * H, kind = new Uint8Array(N), tiles = new Uint8Array(N), res = new Uint8Array(N);
    var props = [], lights = [], x, y, i, j;
    function at(tx, ty) { return ty * W + tx; }
    function inb(tx, ty) { return tx >= 0 && ty >= 0 && tx < W && ty < H; }
    function insideFence(tx, ty) { return tx > FX0 && tx < FX1 && ty > FY0 && ty < FY1; }
    function onRing(tx, ty) { return tx >= FX0 && tx <= FX1 && ty >= FY0 && ty <= FY1 && !insideFence(tx, ty); }
    function inGate(tx, ty) { return (Math.abs(tx - CX + 0.5) < GH && (ty === FY0 || ty === FY1)) || (Math.abs(ty - CY + 0.5) < GH && (tx === FX0 || tx === FX1)); }

    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var i0 = at(x, y);
      if (insideFence(x, y)) kind[i0] = 2;
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) { kind[i0] = 3; tiles[i0] = 1; }
    }
    // roads outward from each gate (4 lanes, 6 wide) so the approaches stay open for the horde
    function lane(tx, ty) {
      if (insideFence(tx, ty)) return false;
      if (Math.abs(tx - CX + 0.5) < 3.2 && (ty < FY0 || ty > FY1)) return true;
      if (Math.abs(ty - CY + 0.5) < 3.2 && (tx < FX0 || tx > FX1)) return true;
      return false;
    }
    for (y = 2; y < H - 2; y++) for (x = 2; x < W - 2; x++) if (lane(x, y) && !onRing(x, y)) { kind[at(x, y)] = 2; res[at(x, y)] = 1; }
    // plaza around the box
    for (y = CY - 6; y <= CY + 6; y++) for (x = CX - 6; x <= CX + 6; x++) if ((x - CX + 0.5) * (x - CX + 0.5) + (y - CY + 0.5) * (y - CY + 0.5) <= 30) { kind[at(x, y)] = 6; res[at(x, y)] = 1; }
    // the spiked fence, with a four-tile gap for each gate
    for (y = FY0; y <= FY1; y++) for (x = FX0; x <= FX1; x++) {
      if (!onRing(x, y)) continue;
      res[at(x, y)] = 1;
      if (inGate(x, y)) { kind[at(x, y)] = 2; continue; }
      kind[at(x, y)] = 7; tiles[at(x, y)] = 1;
    }
    // corner watchtowers (solid 2x2 blocks drawn by one prop)
    [[FX0 - 1, FY0 - 1], [FX1, FY0 - 1], [FX0 - 1, FY1], [FX1, FY1]].forEach(function (c) {
      for (y = c[1]; y < c[1] + 2; y++) for (x = c[0]; x < c[0] + 2; x++) { kind[at(x, y)] = 9; tiles[at(x, y)] = 1; res[at(x, y)] = 1; }
      props.push({ x: (c[0] + 1) * T, y: (c[1] + 2) * T, sortY: 0, front: true, draw: tower });
      lights.push({ x: (c[0] + 1) * T + 18, y: (c[1] + 1) * T - 60, r: 150, color: '255,170,80', inten: 0.55, flicker: 0.1 });
    });
    // gate posts with torches, and a light at every entrance
    GATES.forEach(function (g, gi) {
      var horiz = g.dy !== 0, a, b;
      if (horiz) { a = { x: (CX - GH) * T - 6, y: g.y + T / 2 }; b = { x: (CX + GH) * T + 6, y: g.y + T / 2 }; }
      else { a = { x: g.x + T / 2, y: (CY - GH) * T - 4 }; b = { x: g.x + T / 2, y: (CY + GH) * T + 12 }; }
      props.push({ x: a.x, y: a.y, sortY: 2, draw: gatePost, seed: gi, flip: false });
      props.push({ x: b.x, y: b.y, sortY: 2, draw: gatePost, seed: gi + 4, flip: true });
      lights.push({ x: g.x, y: g.y, r: 210, color: '255,160,70', inten: 0.85, flicker: 0.1 });
    });
    // four log cabins in the quarters, doors to the south
    var cabins = [[CX - 17, CY - 15], [CX + 10, CY - 15], [CX - 17, CY + 9], [CX + 10, CY + 9]];
    cabins.forEach(function (c, ci) {
      var cw = 7, ch = 5, door = c[0] + 1 + Math.floor(rng() * (cw - 2));
      for (y = c[1]; y < c[1] + ch; y++) for (x = c[0]; x < c[0] + cw; x++) {
        var edge = x === c[0] || y === c[1] || x === c[0] + cw - 1 || y === c[1] + ch - 1;
        kind[at(x, y)] = edge ? 4 : 1; tiles[at(x, y)] = edge ? 1 : 0; res[at(x, y)] = 1;
      }
      kind[at(door, c[1] + ch - 1)] = 1; tiles[at(door, c[1] + ch - 1)] = 0;
      lights.push({ x: (c[0] + cw / 2) * T, y: (c[1] + ch / 2) * T, r: 150, color: '255,160,60', inten: 0.8, flicker: 0.08 });
      props.push({ x: (c[0] + cw / 2) * T, y: (c[1] + ch / 2) * T + 10, draw: propCrates });
      props.push({ x: (c[0] + cw / 2) * T + 38, y: (c[1] + ch / 2) * T + 14, draw: propBarrel });
    });
    // lamps, fires, barrels and crates around the plaza and along the roads
    var fires = [[CX - 7, CY - 7], [CX + 7, CY - 7], [CX - 7, CY + 7], [CX + 7, CY + 7]];
    fires.forEach(function (f, fi) {
      props.push({ x: f[0] * T, y: f[1] * T, seed: fi, draw: propFire });
      lights.push({ x: f[0] * T, y: f[1] * T - 8, r: 170, color: '255,140,50', inten: 0.75, flicker: 0.12 });
    });
    for (i = 0; i < 18; i++) {
      var ang = rng() * PI2, rad = 9 + rng() * 8, px = CX * T + Math.cos(ang) * rad * T, py = CY * T + Math.sin(ang) * rad * T, tx = Math.floor(px / T), ty = Math.floor(py / T);
      if (!insideFence(tx, ty) || tiles[at(tx, ty)] || res[at(tx, ty)] && kind[at(tx, ty)] !== 2 && kind[at(tx, ty)] !== 6) continue;
      if (Math.abs(px - CX * T) < 4 * T || Math.abs(py - CY * T) < 4 * T) continue; // keep the roads open
      props.push({ x: px, y: py, draw: i % 3 ? propBarrel : propCrates });
    }

    // the forest outside: sparse giants, never touching, lanes and a margin around the fence left clear
    function farTree(tx, ty) {
      if (!inb(tx, ty) || tiles[at(tx, ty)] || kind[at(tx, ty)] !== 0 || res[at(tx, ty)]) return false;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var q = at(tx + dx, ty + dy); if (tiles[q] && !(tx + dx < 2 || ty + dy < 2 || tx + dx >= W - 2 || ty + dy >= H - 2)) return false; }
      return true;
    }
    for (y = 3; y < H - 3; y++) for (x = 3; x < W - 3; x++) {
      if (x > FX0 - 3 && x < FX1 + 3 && y > FY0 - 3 && y < FY1 + 3) continue; // clear ring outside the fence
      if (Math.abs(x - CX + 0.5) < 5 && (y < FY0 || y > FY1)) continue; // wider than the road
      if (Math.abs(y - CY + 0.5) < 5 && (x < FX0 || x > FX1)) continue;
      var dn = 0.1 + 0.07 * Math.abs(Math.sin(x * 0.17) * Math.cos(y * 0.13));
      if (rng() > dn || !farTree(x, y)) continue;
      kind[at(x, y)] = 3; tiles[at(x, y)] = 1;
    }

    var box = { x: CX * T, y: CY * T, r: 20, hp: 0, maxHp: 0, flash: 0, isDefenseBox: true, armor: 0, texts: 0 };
    Object.defineProperty(box, 'invuln', { get: function () { return 0; }, set: function () {} }); // many hits per second are the point
    box.maxHp = box.hp = 2000;
    props.push({ x: box.x, y: box.y + 4, sortY: 8, draw: drawBox, reveal: false });
    var treb = { x: CX * T, y: CY * T - 176 }; // the giant crossbow stands right above the supplies
    props.push({ x: treb.x, y: treb.y, sortY: 6, draw: function (ctx, sx, sy, t, cam, pr) { drawCrossbow(ctx, sx, sy, t, cam, pr); }, reveal: false });
    lights.push({ x: treb.x, y: treb.y - 24, r: 150, color: '255,150,60', inten: 0.6, flicker: 0.1 });
    lights.push({ x: box.x, y: box.y - 6, r: 230, color: '120,220,170', inten: 0.85, flicker: 0.05 });
    var spawn = { x: CX * T + 40, y: CY * T + 76, tx: CX, ty: CY + 2 };
    var zones = [
      { x0: (CX - 4) * T, x1: (CX + 4) * T, y0: 4 * T, y1: 9 * T },
      { x0: (W - 10) * T, x1: (W - 5) * T, y0: (CY - 4) * T, y1: (CY + 4) * T },
      { x0: (CX - 4) * T, x1: (CX + 4) * T, y0: (H - 10) * T, y1: (H - 5) * T },
      { x0: 5 * T, x1: 10 * T, y0: (CY - 4) * T, y1: (CY + 4) * T }
    ];
    var A = art();
    var map = CC.Realm.create({
      name: 'Town Defense', w: W, h: H, kind: kind, tiles: tiles, spawn: spawn, stairs: null, chests: [], enemySpawns: [],
      props: props, lights: lights, ambient: '7,12,20,0.5', playerLight: 220, viewR: 330, fog: 0.12, reveal: false, viewBoost: 1.5,
      ground: ground, detail: detail, drawSolid: drawSolid
    });
    map.box = box; map.treb = treb; map.zones = zones; map.gates = GATES; map.seed = seed; map.defense = true; map.floor = 1;
    D.map = map;
    return map;
  };

  /* ---------------------------------------------------------------- waves */
  var POOL = [ // [type, from wave, weight]
    ['rootling', 1, 10], ['sporeling', 1, 8], ['crow', 1, 8], ['bat', 1, 6], ['slime', 1, 5], ['spider', 2, 6], ['charger', 2, 6],
    ['skeleton', 3, 6], ['direwolf', 3, 8], ['snake', 3, 4], ['ghoul', 4, 6], ['archer', 4, 3], ['bear', 5, 5], ['mosslurker', 5, 5],
    ['scorpion', 6, 3], ['raven', 4, 5], ['ghost', 7, 4], ['scarecrow', 7, 4], ['mawworm', 8, 3], ['demon', 9, 4], ['horror', 10, 3]
  ];
  var WEAK = ['bat', 'crow', 'raven', 'spider', 'rootling', 'sporeling', 'slime', 'snake'];
  function typeOk(t) { var E = CC.Enemies; return !!(E && E.TYPES && E.TYPES[t]); }
  function pick(list, rng) { var tot = 0, i; for (i = 0; i < list.length; i++) tot += list[i][2]; var r = rng() * tot; for (i = 0; i < list.length; i++) { r -= list[i][2]; if (r < 0) return list[i][0]; } return list[0][0]; }
  function effFloor(n) { return 1 + Math.floor((n - 1) * 0.85); }
  function gatesFor(n) { var c = n < 3 ? 2 : n < 5 ? 3 : 4, g = [0, 1, 2, 3], out = []; while (out.length < c) out.push(g.splice(Math.floor(Math.random() * g.length), 1)[0]); return out; }
  D.waveSpec = function (n) {
    var rng = Math.random, boss = n % 5 === 0, horde = !boss && n >= 3 && n % 3 === 0;
    var undead = !boss && !horde && (n === 2 || (n > 2 && (n - 2) % 6 === 0)); // wave 2, then every sixth wave: the dead walk
    var base = Math.round(10 + n * 4.5 + n * n * 0.15), items = [], gs = gatesFor(n), i;
    var pool = POOL.filter(function (p) { return p[1] <= n && typeOk(p[0]); });
    if (undead) pool = [['skeleton', 0, 10], ['archer', 0, 7], ['ghoul', 0, 6], ['horror', 0, 3 + Math.floor(n / 4)]].filter(function (q) { return typeOk(q[0]); });
    if (horde) { // a flood of weak ones: mass destruction
      var cnt = Math.min(230, Math.round(base * 2.2)), weak = WEAK.filter(typeOk);
      for (i = 0; i < cnt; i++) items.push({ type: rng() < 0.08 ? pick(pool, rng) : weak[Math.floor(rng() * weak.length)], gate: gs[i % gs.length], hpMul: 0.55, size: 0 });
    } else {
      var cnt2 = Math.min(150, boss ? Math.round(base * 0.7) : undead ? Math.round(base * 1.15) : base), ech = Math.min(0.25, 0.02 * n);
      if (undead && n < 4) gs = gatesFor(5).slice(0, 3); // the dead come from three gates right away
      for (i = 0; i < cnt2; i++) items.push({ type: pick(pool, rng), gate: gs[Math.floor(rng() * gs.length)], elite: rng() < ech, hpMul: 1, size: rng() < 0.5 ? 1 : 2 });
    }
    if (boss) {
      var tier = Math.floor(n / 5), bosses = n % 10 === 0 ? 2 : 1;
      for (i = 0; i < bosses; i++) items.push({ type: 'boss', gate: gs[i % gs.length], bossIdx: (tier - 1 + i) % 4, hpMul: 3 + (tier - 1) * 1.2 });
      items.sort(function () { return rng() - 0.5; });
      // the bosses arrive first, the escorts stream in behind them
      items = items.filter(function (q) { return q.type === 'boss'; }).concat(items.filter(function (q) { return q.type !== 'boss'; }));
    } else items.sort(function () { return rng() - 0.5; });
    var time = boss ? 120 : horde ? 80 : 70 + Math.min(45, n * 2);
    return { items: items, time: time, boss: boss, horde: horde, undead: undead, floor: effFloor(n) };
  };

  function waveBanner(n, boss, theme) {
    setBanner(boss ? 'BOSS WAVE ' + n : 'WAVE ' + n + ' START', boss ? 'boss' : theme === 'horde' ? 'horde' : theme === 'undead' ? 'undead' : 'wave',
      boss ? 'DEFEND THE SUPPLIES' : theme === 'horde' ? 'A HORDE APPROACHES' : theme === 'undead' ? 'THE UNDEAD RISE' : '');
  }
  function setBanner(text, kind, sub) { S.banner = { text: text, kind: kind || 'wave', sub: sub || '', t0: Date.now() }; }
  function aliveCount() {
    var E = CC.Enemies, c = 0, i;
    if (!E) return 0;
    for (i = 0; i < E.list.length; i++) { var e = E.list[i]; if ((e._df || e.stitched) && !e.dead && e.hp > 0) c++; }
    return c;
  }
  function startWave(n) {
    var spec = D.waveSpec(n);
    S.wave = n; S.phase = 'wave'; S.timer = spec.time; S.boss = spec.boss; S.horde = spec.horde; S.theme = spec.undead ? 'undead' : spec.horde ? 'horde' : 'normal'; S.floorEff = spec.floor; S.clearedHealed = false;
    S.pending = S.pending.concat(spec.items);
    S.best = Math.max(S.best, n);
    waveBanner(n, spec.boss, S.theme);
    pushState(true);
  }
  function spawnOne(it) {
    var E = CC.Enemies, map = D.map; if (!E || !map) return;
    var z = map.zones[it.gate], x, y, tries = 0, solid;
    do { x = z.x0 + Math.random() * (z.x1 - z.x0); y = z.y0 + Math.random() * (z.y1 - z.y0); solid = map.isSolid(x, y); tries++; } while (solid && tries < 8);
    if (solid) return;
    var opts = { awake: true, elite: !!it.elite };
    if (it.type === 'slime') opts.size = it.size === 2 && !it.hpMul || it.size === 2 ? 1 : 0;
    if (it.type === 'boss') opts.bossIdx = it.bossIdx;
    var e = E.spawn(it.type, x, y, S.floorEff || 1, opts);
    if (!e) return;
    e._df = true; e.asleep = false;
    if (it.hpMul && it.hpMul !== 1) { e.maxHp = Math.max(1, Math.round(e.maxHp * it.hpMul)); e.hp = e.maxHp; }
    e.spd *= 1 + Math.min(0.35, S.wave * 0.012);
    if (e.boss) { e.introDone = true; e.bar.intro = 0; e.invuln = 0; }
    return e;
  }
  function lose() {
    S.phase = 'lost'; S.pending.length = 0;
    setBanner('THE SUPPLIES ARE LOST', 'lost', 'You held out until wave ' + S.wave);
    pushState(true);
  }
  D.restart = function () {
    if (!isHost()) return false;
    var E = CC.Enemies, map = D.map; if (!map) return false;
    if (E) { E.list.length = 0; E.projectiles.length = 0; E.zones = []; E.boss = null; E.remains = []; E.gore = []; E.piles = []; }
    if (CC.Loot && CC.Loot.clear) CC.Loot.clear();
    map.box.hp = map.box.maxHp = 2000;
    S.phase = 'prep'; S.wave = 0; S.timer = 10; S.pending = []; S.left = 0; S.kills = 0; S.best = 0; S.theme = 'normal';
    S.bolts.length = 0; S.booms.length = 0; S.tb.phase = 'reload'; S.tb.t = 10; S.tb.op = 0;
    S.pickups.length = 0; S.meteor = null; if (CC.state && CC.state.player) CC.state.player.pw = null;
    setBanner('GET READY', 'wave', 'Hold the four gates'); pushState(true);
    var p = CC.state && CC.state.player;
    if (p && p.hp <= 0) { p.hp = p.maxHp; CC.state.mode = 'dungeon'; }
    return true;
  };
  D.begin = function (map) {
    D.map = map;
    S.on = true; S.phase = 'prep'; S.wave = 0; S.timer = 14; S.pending = []; S.left = 0; S.best = 0; S.kills = 0; S.spawnAcc = 0; S.boss = false;
    S.banner = null; S.respawnT = 0; S.stamp = 0; S.theme = 'normal'; S.bolts.length = 0; S.booms.length = 0; S.toast = null;
    S.tb.phase = 'reload'; S.tb.t = 14; S.tb.op = 0; S.tb.ang = S.tb.tgt = -Math.PI / 2; S.tb.cd = 0; S.tb.swing = 0;
    S.pickups.length = 0; S.meteor = null; if (CC.state && CC.state.player) CC.state.player.pw = null;
    setBanner('DEFEND THE TOWN', 'wave', 'Wave 1 begins soon');
  };
  D.end = function () { S.on = false; S.phase = 'idle'; D.map = null; };
  D.active = function () { return !!(S.on && D.map && CC.state && CC.state.area === 'defense'); };

  /* ----- host-side director ----- */
  D.update = function (dt) {
    if (!D.active()) return;
    var map = D.map, b = map.box;
    if (b.flash > 0) b.flash -= dt;
    stepBolts(dt);
    updatePower(dt);
    stepMeteor(dt);
    if (S.toast && Date.now() - S.toast.t0 > 2600) S.toast = null;
    S.tb.swing = Math.max(0, S.tb.swing - dt * 3);
    if (!isHost()) {
      if (S.timer > 0) S.timer = Math.max(0, S.timer - dt);
      if (S.tb.t > 0) S.tb.t = Math.max(0, S.tb.t - dt);
      S.tb.cc = Math.max(0, S.tb.cc - dt);
      if (!operatingSelf() && Number.isFinite(S.tb.angT)) { // ease the arm toward the host's aim between the 5-per-second updates
        var da2 = Math.atan2(Math.sin(S.tb.angT - S.tb.ang), Math.cos(S.tb.angT - S.tb.ang)); S.tb.ang += da2 * Math.min(1, dt * 10);
      }
      guestAimSend(dt);
      for (var gp = 0; gp < S.pickups.length; gp++) S.pickups[gp].life -= dt;
      return;
    }
    var E = CC.Enemies, alive = aliveCount(), i;
    S.left = alive + S.pending.length;
    if (S.phase === 'lost' || S.phase === 'idle') { pushState(false); return; }
    if (b.hp <= 0) { lose(); return; }
    updateTreb(dt);
    updatePickups(dt);
    if (S.phase === 'prep') {
      S.timer -= dt; if (S.timer <= 0) startWave(1);
    } else {
      // spawn the queue: fast enough for floods, capped so phones keep up
      var CAP = 100, rate = S.horde ? 30 : 16;
      S.spawnAcc += dt * rate;
      while (S.spawnAcc >= 1 && S.pending.length && alive < CAP) { S.spawnAcc -= 1; spawnOne(S.pending.shift()); alive++; }
      if (S.spawnAcc > 3) S.spawnAcc = 3;
      S.timer -= dt;
      var bossAlive = false;
      for (i = 0; i < E.list.length; i++) if (E.list[i].boss && !E.list[i].dead && E.list[i]._df) { bossAlive = true; break; }
      if (S.phase === 'wave' && S.left === 0) {
        S.phase = 'cleared'; S.timer = Math.min(S.timer, 9);
        setBanner('WAVE ' + S.wave + ' CLEARED', 'clear', 'Supplies and heroes recover');
        if (!S.clearedHealed) {
          S.clearedHealed = true; b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.25);
          [CC.state.player, CC.Multiplayer && CC.Multiplayer.remote].forEach(function (h) { if (h && h.hp > 0) { h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.3); if (h.mana !== undefined) h.mana = Math.min(h.maxMana, h.mana + h.maxMana * 0.4); } });
          if (CC.Multiplayer && CC.Multiplayer.sendFx) CC.Multiplayer.sendFx('df', { heal: 1 });
        }
      }
      if (S.timer <= 0 && !bossAlive) { S.timer = 0; startWave(S.wave + 1); }
      else if (S.timer < 0) S.timer = 0;
    }
    pushState(false);
  };
  var sendClock = 0;
  function pushState(force) {
    var mp = CC.Multiplayer;
    if (!mp || !mp.sendFx || !isHost()) return;
    var now = Date.now();
    if (!force && now - sendClock < 200) return;
    sendClock = now;
    var b = D.map && D.map.box;
    mp.sendFx('df', { w: S.wave, ph: S.phase === 'prep' ? 0 : S.phase === 'wave' ? 1 : S.phase === 'cleared' ? 2 : 3, tm: Math.round(S.timer * 10) / 10,
      lf: S.left, bh: b ? Math.round(b.hp) : 0, bm: b ? b.maxHp : 1, bs: S.boss ? 1 : 0, hd: S.horde ? 1 : 0, th: S.theme === 'undead' ? 2 : S.theme === 'horde' ? 1 : 0, bt: S.best, sq: S.pending.length,
      tp: S.tb.phase === 'fire' ? 1 : 0, tt: Math.round(S.tb.t * 10) / 10, to: S.tb.op, ta: Math.round(S.tb.ang * 100) / 100, cc: Math.round(S.tb.cc * 10) / 10 });
  }
  // guest side: mirror what the host says
  D.applyState = function (d) {
    if (!d || !D.active()) return;
    if (d.heal) { // the host's wave-clear recovery, applied to this hero too
      var me = CC.state.player;
      if (me && me.hp > 0) { me.hp = Math.min(me.maxHp, me.hp + me.maxHp * 0.3); me.mana = Math.min(me.maxMana, me.mana + me.maxMana * 0.4); }
      return;
    }
    var phases = ['prep', 'wave', 'cleared', 'lost'], ph = phases[d.ph] || 'prep', b = D.map.box;
    var wChanged = d.w !== S.wave, pChanged = ph !== S.phase;
    S.horde = !!d.hd; S.theme = d.th === 2 ? 'undead' : d.th === 1 ? 'horde' : 'normal';
    var tb = S.tb, newPhase = d.tp ? 'fire' : 'reload';
    if (newPhase !== tb.phase && newPhase === 'fire') toast('CROSSBOW ONLINE', '#ffb060');
    if (newPhase !== tb.phase && newPhase === 'reload' && tb.phase === 'fire') toast('CROSSBOW RELOADING', '#aab4c8');
    if (d.to === 2 && tb.op !== 2 && CC.Multiplayer && CC.Multiplayer.isGuest()) mountSelf(); // the host confirmed: we are on the crossbow
    if (d.cc !== undefined) tb.cc = d.cc;
    tb.phase = newPhase; tb.t = d.tt; tb.op = d.to || 0; tb.angT = d.ta; 
    if (pChanged || wChanged) {
      if (ph === 'wave' && (wChanged || S.phase !== 'wave')) waveBanner(d.w, !!d.bs, S.theme);
      else if (ph === 'cleared') setBanner('WAVE ' + d.w + ' CLEARED', 'clear', 'Supplies and heroes recover');
      else if (ph === 'lost') setBanner('THE SUPPLIES ARE LOST', 'lost', 'You held out until wave ' + d.w);
      else if (ph === 'prep' && d.w === 0) setBanner('GET READY', 'wave', 'Hold the four gates');
    }
    S.wave = d.w; S.phase = ph; S.timer = d.tm; S.left = d.lf; S.boss = !!d.bs; S.best = d.bt || S.best; S.pending.length = 0;
    if (b) { if (d.bh < b.hp - 0.5) b.flash = 0.2; b.hp = d.bh; b.maxHp = d.bm || b.maxHp; }
  };

  /* ----- enemy hooks (called from enemies.js) ----- */
  D.pickFocus = function (e, focus, p, guest) {
    var b = D.map && D.map.box;
    if (!b || b.hp <= 0) return focus;
    var best = null, bd = 150, db = Math.hypot(b.x - e.x, b.y - e.y);
    [p, guest].forEach(function (h) {
      if (!h || h.hp <= 0) return;
      var d = Math.hypot(h.x - e.x, h.y - e.y);
      if (d < bd && d < db + 60) { bd = d; best = h; }
    });
    return best || b;
  };
  D.damageBox = function (amt, e, kind) {
    var b = D.map && D.map.box; if (!b || b.hp <= 0) return 0;
    var dmg = Math.max(1, Math.round(amt));
    b.hp -= dmg; b.flash = 0.2;
    if (CC.fx && CC.fx.text && Math.random() < 0.18) CC.fx.text(b.x + (Math.random() - 0.5) * 30, b.y - 30, '-' + dmg, '#ffb060', 10);
    return dmg;
  };
  D.projHitsBox = function (q) {
    var b = D.map && D.map.box; if (!b || b.hp <= 0 || !q.hostile) return false;
    if (Math.hypot(q.x - b.x, q.y - b.y) < q.r + b.r) { D.damageBox(q.dmg || 6, null, null); return true; }
    return false;
  };
  D.blast = function (x, y, rad, dmg) {
    var b = D.map && D.map.box; if (!b || dmg <= 0) return;
    if (Math.hypot(b.x - x, b.y - y) < rad + b.r) D.damageBox(dmg, null, null);
  };

  /* ----- a hero who falls respawns beside the box ----- */
  D.deadUpdate = function (dt) {
    var s = CC.state, E = CC.Enemies;
    if (isHost()) {
      if (E) E.update(dt);
      if (CC.Loot && CC.Loot.update) CC.Loot.update(dt);
    }
    D.update(dt);
    if (CC.Multiplayer && CC.Multiplayer.tick) CC.Multiplayer.tick(dt);
    S.respawnT -= dt;
    if (S.respawnT <= 0 && S.phase !== 'lost') { if (CC.respawnHere) CC.respawnHere(); S.respawnT = 0; }
    var p = s.player;
    if (p) { // keep the camera on the body
      var cam = CC.camera;
    }
  };
  D.onDown = function () { S.respawnT = 7; };


  /* ---------------------------------------------------------------- crossbow */
  var BOLT_SPEED = 430, BOLT_LIFE = 1.6;
  function toast(text, col) { S.toast = { text: text, col: col || '#ffb060', t0: Date.now() }; }
  function trebPos() { var t = D.map && D.map.treb; return t || { x: 0, y: 0 }; }
  function me() { return CC.state && CC.state.player; }
  function operatingSelf() { return S.tb.op === (isHost() ? 1 : 2); }
  D.operating = function () { return D.active() && operatingSelf(); };
  function mountSelf() {
    var p = me(), tp = trebPos();
    if (p) { p.x = tp.x; p.y = tp.y + 20; }
  }
  // damage (and the fire) a bolt deals, growing with the wave
  function boltDamage() { return Math.round(55 + 14 * (S.wave || 1)); }
  function boom(x, y, r, big) { // visual explosion, local only
    S.booms.push({ x: x, y: y, r: r, t: 0, max: big ? 0.55 : 0.32, big: !!big });
    if (S.booms.length > 40) S.booms.shift();
    if (CC.fx && CC.fx.burst) CC.fx.burst(x, y, big ? '#ff9a3a' : '#ffc860', big ? 14 : 6, big ? 130 : 80);
    if (big && CC.fx && CC.fx.shake) CC.fx.shake(2);
  }
  var boomSendT = 0;
  function sendBoom(x, y, r, big) {
    var now = Date.now();
    if (!big && now - boomSendT < 70) return; // small bursts are throttled; the finishing blast always goes out
    boomSendT = now;
    if (CC.Multiplayer && CC.Multiplayer.sendFx) CC.Multiplayer.sendFx('tb', { e: 'x', x: Math.round(x), y: Math.round(y), r: r, b: big ? 1 : 0 });
  }
  function newBolt(x, y, a, big, level) {
    var sp = big ? 520 : BOLT_SPEED;
    return { x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a: a, life: big ? 1.5 : BOLT_LIFE, hit: {}, age: 0, big: !!big, level: level || 0, sp: sp };
  }
  function fireBolt(a, big, level) {
    var tp = trebPos(), x = tp.x + Math.cos(a) * 62, y = tp.y - 28 + Math.sin(a) * 62;
    S.bolts.push(newBolt(x, y, a, big, level)); S.tb.swing = 1;
    if (CC.Multiplayer && CC.Multiplayer.sendFx) CC.Multiplayer.sendFx('tb', { e: 'f', x: Math.round(x), y: Math.round(y), a: Math.round(a * 1000) / 1000, c: big ? 1 : 0, l: Math.round((level || 0) * 100) / 100 });
    if (CC.fx && CC.fx.shake && operatingSelf()) CC.fx.shake(big ? 6 : 1);
  }
  D.applyBolt = function (d) { // guest: the host fired / something exploded
    if (!D.active() || isHost() || !d) return;
    if (d.e === 'f') { S.bolts.push(newBolt(d.x, d.y, d.a, !!d.c, d.l)); S.tb.swing = 1; if (d.c && CC.fx && CC.fx.shake) CC.fx.shake(3); }
    else if (d.e === 'x') boom(d.x, d.y, d.r || 40, !!d.b);
    else if (d.e === 'u') S.pickups = (d.l || []).map(function (q) { return { id: q.i, type: PW_CODE[q.t] || 'rapid', x: q.x, y: q.y, life: q.l, age: 0 }; });
    else if (d.e === 'p') applyPower(PW_CODE[d.t] || 'rapid');
    else if (d.e === 'm') startMeteor();
  };
  function blast(x, y, r, dmg, skip) { // host: damage everything alive in the circle
    var E = CC.Enemies, i;
    for (i = 0; i < E.list.length; i++) {
      var e = E.list[i];
      if (e.dead || e.hp <= 0 || e === skip || Math.hypot(e.x - x, e.y - y) > r + e.r) continue;
      E.damage(e, dmg, 'fire');
    }
  }
  function stepBolts(dt) {
    var host = isHost(), E = CC.Enemies, map = D.map, i;
    for (i = S.bolts.length - 1; i >= 0; i--) {
      var b = S.bolts[i], steps = Math.max(1, Math.ceil((b.sp || BOLT_SPEED) * dt / 6)), k, done = false;
      b.life -= dt; b.age += dt;
      for (k = 0; k < steps && !done; k++) {
        b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
        if (map.isSolid(b.x, b.y)) { done = true; break; }
        if (host && E) {
          for (var j = 0; j < E.list.length; j++) { // pierce: damage each monster once, burst where it was hit, keep flying
            var e = E.list[j];
            if (e.dead || e.hp <= 0 || b.hit[e.id] || Math.hypot(e.x - b.x, e.y - b.y) > e.r + (b.big ? 18 : 9)) continue;
            b.hit[e.id] = 1;
            var hd = b.big ? boltDamage() * (2 + 2.2 * b.level) : boltDamage(), hr = b.big ? 58 : 34;
            E.damage(e, hd, 'fire');
            blast(e.x, e.y, hr, hd * 0.45, e);
            boom(e.x, e.y, hr, false); sendBoom(e.x, e.y, hr, false);
          }
        }
      }
      if (done || b.life <= 0) {
        var er = b.big ? 150 * (0.6 + 0.4 * b.level) : 70, ed = b.big ? boltDamage() * (3 + 3 * b.level) : boltDamage() * 0.9;
        if (host) { blast(b.x, b.y, er, ed); sendBoom(b.x, b.y, er, true); }
        boom(b.x, b.y, er, true);
        if (b.big && CC.fx && CC.fx.shake) CC.fx.shake(8);
        S.bolts.splice(i, 1);
      }
    }
    for (i = S.booms.length - 1; i >= 0; i--) { S.booms[i].t += dt; if (S.booms[i].t >= S.booms[i].max) S.booms.splice(i, 1); }
  }
  function autoAim() { // the densest knot of monsters in range, otherwise nothing
    var E = CC.Enemies, tp = trebPos(), best = null, bs = 0, i, j;
    if (!E) return null;
    var cand = [];
    for (i = 0; i < E.list.length && cand.length < 60; i++) {
      var e = E.list[i];
      if (!e.dead && e.hp > 0 && Math.hypot(e.x - tp.x, e.y - tp.y) < 640 && Math.hypot(e.x - tp.x, e.y - tp.y) > 50) cand.push(e);
    }
    var box = D.map && D.map.box;
    for (i = 0; i < cand.length; i++) {
      var sc = 0;
      for (j = 0; j < cand.length; j++) if (Math.hypot(cand[i].x - cand[j].x, cand[i].y - cand[j].y) < 80) sc++;
      // clumps count, but anything close to the supply box counts more: that is what loses the game
      if (box) sc = sc * 2 + Math.max(0, 900 - Math.hypot(cand[i].x - box.x, cand[i].y - box.y)) / 60;
      if (sc > bs) { bs = sc; best = cand[i]; }
    }
    return best ? Math.atan2(best.y - tp.y, best.x - tp.x) : null;
  }
  function updateTreb(dt) { // host only
    var tb = S.tb, tp = trebPos(), op = tb.op, p = me(), g = CC.Multiplayer && CC.Multiplayer.remote;
    tb.mcd = Math.max(0, tb.mcd - dt); tb.cc = Math.max(0, tb.cc - dt);
    // an operator who wandered off, fell, or left the world frees the controls
    if (op === 1 && (!p || p.hp <= 0 || Math.hypot(p.x - tp.x, p.y - tp.y) > 90)) tb.op = 0;
    if (op === 2 && (!g || g.hp <= 0 || Math.hypot(g.x - tp.x, g.y - tp.y) > 140)) tb.op = 0;
    tb.t -= dt;
    if (tb.phase === 'reload') {
      if (tb.t <= 0) { tb.phase = 'fire'; tb.t = FIRE_LEN; tb.cd = 0.3; toast('CROSSBOW ONLINE', '#ffb060'); }
    } else {
      if (tb.t <= 0) { tb.phase = 'reload'; tb.t = RELOAD_LEN; tb.op = 0; toast('CROSSBOW RELOADING', '#aab4c8'); }
      else {
        tb.cd -= dt;
        var aim = tb.op ? tb.tgt : autoAim();
        if (aim !== null) { var da = Math.atan2(Math.sin(aim - tb.ang), Math.cos(aim - tb.ang)); tb.ang += da * Math.min(1, dt * 9); }
        if (tb.cd <= 0 && (tb.op || aim !== null)) { fireBolt(tb.ang); tb.cd = SHOT_GAP; }
      }
    }
  }
  // the local operator steers with the movement stick / keys (called from main.js while manning)
  var aimSendT = 0;
  // The ACTION button while manning: a tap fires, holding charges a huge piercing bolt (with a cooldown)
  var fireSt = { held: false, t0: 0 };
  function hostManualShot(kind, level) {
    var tb = S.tb;
    if (kind === 1) { if (tb.mcd > 0) return; tb.mcd = 0.28; fireBolt(tb.ang, false, 0); }
    else { if (tb.cc > 0) return; tb.cc = CHARGE_CD; tb.mcd = 0.6; fireBolt(tb.ang, true, level); }
  }
  function requestShot(kind, level) {
    if (isHost()) hostManualShot(kind, level);
    else if (mp()) { mp().sendFx('tc', { s: kind, l: Math.round(level * 100) / 100 }); if (kind === 2) S.tb.cc = CHARGE_CD; S.tb.swing = 1; }
  }
  D.feedFire = function (held) {
    var tb = S.tb;
    if (!operatingSelf()) { fireSt.held = false; tb.charge = 0; return; }
    var now = Date.now();
    if (held && !fireSt.held) { fireSt.held = true; fireSt.t0 = now; }
    if (held) { var dur = (now - fireSt.t0) / 1000; tb.charge = dur > TAP_MAX && tb.cc <= 0 ? Math.min(1, (dur - TAP_MAX) / 0.9) : 0; }
    else if (fireSt.held) {
      fireSt.held = false;
      var d2 = (now - fireSt.t0) / 1000, lvl = tb.charge; tb.charge = 0;
      if (d2 >= TAP_MAX && tb.cc <= 0) requestShot(2, Math.max(0.15, lvl));
      else requestShot(1, 0);
    }
  };
  D.feedAim = function (inp) {
    var mx = +inp.moveX || 0, my = +inp.moveY || 0;
    if (Math.hypot(mx, my) > 0.25) {
      var a = Math.atan2(my, mx);
      S.tb.tgt = a;
      if (!isHost()) S.tb.ang = a; // guest sees its own arm turn at once
    }
  };
  function guestAimSend(dt) {
    if (!operatingSelf() || !CC.Multiplayer || !CC.Multiplayer.sendFx) return;
    aimSendT += dt;
    if (aimSendT > 0.1) { aimSendT = 0; CC.Multiplayer.sendFx('tc', { a: Math.round(S.tb.tgt * 100) / 100 }); }
  }
  D.onCommand = function (d) { // host: a request from the guest
    if (!isHost() || !d || !D.active()) return;
    var tb = S.tb, tp = trebPos(), g = CC.Multiplayer && CC.Multiplayer.remote;
    if (d.r === 'man' && tb.op === 0 && g && g.hp > 0 && Math.hypot(g.x - tp.x, g.y - tp.y) < 110) { tb.op = 2; tb.tgt = tb.ang; }
    else if (d.r === 'leave' && tb.op === 2) tb.op = 0;
    else if (Number.isFinite(d.a) && tb.op === 2) tb.tgt = d.a;
    else if ((d.s === 1 || d.s === 2) && tb.op === 2) hostManualShot(d.s, Math.max(0, Math.min(1, +d.l || 0)));
  };
  D.nearAction = function () { // close enough to climb in (the ENTER button shows)
    if (!D.active() || operatingSelf()) return false;
    var p = me(), tp = trebPos();
    return !!(p && p.hp > 0 && S.tb.op === 0 && Math.hypot(p.x - tp.x, p.y - tp.y) < 90);
  };
  D.operatingNow = function () { return D.active() && operatingSelf(); };
  D.interact = function () {
    if (!D.active() || (!operatingSelf() && !D.nearAction())) return false;
    var tb = S.tb, mine = operatingSelf();
    if (isHost()) {
      if (mine) tb.op = 0;
      else { tb.op = 1; tb.tgt = tb.ang; mountSelf(); }
    } else if (mp()) {
      mp().sendFx('tc', { r: mine ? 'leave' : 'man' });
    }
    return true;
  };
  function mp() { return CC.Multiplayer && CC.Multiplayer.sendFx ? CC.Multiplayer : null; }

  function drawCrossbow(ctx, sx, sy, t, cam, pr) {
    var tb = S.tb, firing = tb.phase === 'fire', manned = tb.op > 0, a = tb.ang, sw = tb.swing;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 34, 11, 0, 0, PI2); ctx.fill();
    ctx.strokeStyle = firing ? 'rgba(255,170,70,' + (0.45 + 0.25 * Math.sin(t * 6)) + ')' : 'rgba(150,165,190,0.35)'; // status ring
    ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -t * 10; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 42, 14, 0, 0, PI2); ctx.stroke(); ctx.setLineDash([]);
    // turret: a round timber platform, iron-bound, with a thick post
    ctx.fillStyle = '#3a2615'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 28, 10, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#5a3d25'; ctx.beginPath(); ctx.ellipse(sx, sy + 4, 28, 10, 0, 0, PI2); ctx.fill();
    ctx.strokeStyle = '#8a90a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy + 4, 28, 10, 0, 0, PI2); ctx.stroke();
    ctx.fillStyle = '#3d2a1a'; ctx.fillRect(sx - 6, sy - 24, 12, 30);
    ctx.fillStyle = '#8a90a0'; ctx.fillRect(sx - 7, sy - 12, 14, 3);
    // the crossbow itself turns about its pivot toward the aim
    ctx.translate(sx, sy - 28); ctx.rotate(a); ctx.translate(-5 * sw, 0); // the stock kicks back on every shot
    var chg = operatingSelf() ? tb.charge : 0;
    var limbX = 28, tipX = limbX - 12, tipY = 46, nockX = tipX - 32 * (1 - sw) - 12 * chg;
    ctx.fillStyle = '#6a4628'; ctx.fillRect(-36, -4.5, 80, 9);             // stock
    ctx.fillStyle = '#8a5f38'; ctx.fillRect(-36, -4.5, 80, 2);
    ctx.fillStyle = '#241810'; ctx.fillRect(-18, -1.2, 62, 2.4);           // bolt groove
    ctx.fillStyle = '#8a90a0'; ctx.fillRect(-12, -5.5, 3, 11); ctx.fillRect(10, -5.5, 3, 11); ctx.fillRect(36, -5.5, 3, 11); // iron bands
    ctx.lineCap = 'round';
    [-1, 1].forEach(function (sg) { // two huge bow limbs, curved back
      ctx.strokeStyle = '#2f2014'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(limbX, 0); ctx.quadraticCurveTo(limbX + 12, sg * 24, tipX, sg * tipY); ctx.stroke();
      ctx.strokeStyle = '#7a5532'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(limbX, 0); ctx.quadraticCurveTo(limbX + 12, sg * 24, tipX, sg * tipY); ctx.stroke();
      ctx.fillStyle = '#9096a4'; ctx.beginPath(); ctx.arc(tipX, sg * tipY, 2.6, 0, PI2); ctx.fill();
    });
    ctx.strokeStyle = '#efe6c8'; ctx.lineWidth = 1.5; // bowstring, drawn back while loaded
    ctx.beginPath(); ctx.moveTo(tipX, -tipY); ctx.lineTo(nockX, 0); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.fillStyle = '#6a6e7c'; ctx.beginPath(); ctx.arc(-30, 0, 6.5, 0, PI2); ctx.fill(); // winch drum
    ctx.strokeStyle = '#2a2a32'; ctx.lineWidth = 1.5; for (var sp = 0; sp < 4; sp++) { var wa = sp * Math.PI / 2 + t * (sw > 0.2 ? 6 : 0.4); ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-30 + Math.cos(wa) * 6, Math.sin(wa) * 6); ctx.stroke(); }
    if ((firing || manned) && sw < 0.75) { // a giant fire-bolt nocked and ready
      var tipEnd = limbX + 30, f = 0.75 + 0.25 * Math.sin(t * 14);
      ctx.strokeStyle = '#d6b27a'; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(nockX, 0); ctx.lineTo(tipEnd, 0); ctx.stroke();
      ctx.fillStyle = '#c4382a'; ctx.beginPath(); ctx.moveTo(nockX, 0); ctx.lineTo(nockX - 6, -4.5); ctx.lineTo(nockX + 3, 0); ctx.lineTo(nockX - 6, 4.5); ctx.fill(); // fletching
      var g = ctx.createRadialGradient(tipEnd, 0, 1, tipEnd, 0, 17);
      g.addColorStop(0, 'rgba(255,220,120,' + f + ')'); g.addColorStop(0.5, 'rgba(255,110,30,' + (0.6 * f) + ')'); g.addColorStop(1, 'rgba(255,60,10,0)');
      ctx.fillStyle = g; ctx.fillRect(tipEnd - 17, -17, 34, 34);
      ctx.fillStyle = '#ff7a1e'; ctx.beginPath(); ctx.moveTo(tipEnd + 9, 0); ctx.lineTo(tipEnd - 2, -5.5); ctx.lineTo(tipEnd - 2, 5.5); ctx.closePath(); ctx.fill(); // flaming head
      if (chg > 0) { // a swelling ball of charged fire at the head
        var cr = 8 + 26 * chg, cg = ctx.createRadialGradient(tipEnd, 0, 1, tipEnd, 0, cr);
        cg.addColorStop(0, 'rgba(255,255,230,0.95)'); cg.addColorStop(0.4, 'rgba(255,150,50,0.8)'); cg.addColorStop(1, 'rgba(190,90,255,0)');
        ctx.fillStyle = cg; ctx.fillRect(tipEnd - cr, -cr, cr * 2, cr * 2);
      }
    }
    if (sw > 0.82) { // muzzle flash
      var mf = (sw - 0.82) / 0.18, mg = ctx.createRadialGradient(limbX + 34, 0, 1, limbX + 34, 0, 26);
      mg.addColorStop(0, 'rgba(255,240,170,' + (0.9 * mf) + ')'); mg.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = mg; ctx.fillRect(limbX + 8, -26, 52, 52);
    }
    ctx.restore();
    ctx.save();
    if (manned) { // aim line while somebody steers
      ctx.strokeStyle = 'rgba(255,200,120,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * 40, sy - 28 + Math.sin(a) * 40); ctx.lineTo(sx + Math.cos(a) * 190, sy - 28 + Math.sin(a) * 190); ctx.stroke(); ctx.setLineDash([]);
    }
    var pl = me();
    ctx.font = 'bold 9px Georgia, serif'; ctx.textAlign = 'center';
    if (pl && D.nearAction() && !operatingSelf()) { ctx.fillStyle = '#ffe9b0'; ctx.fillText('PRESS ENTER TO MAN THE CROSSBOW', sx, sy - 82); }
    else if (operatingSelf()) { ctx.fillStyle = '#ffd890'; ctx.fillText('STICK: AIM   ATK: FIRE   HOLD: CHARGED BOLT', sx, sy - 82); }
    ctx.restore();
  }
  // fire bolts and explosions, drawn with the world
  D.drawWorld = function (ctx, cam) {
    if (!D.active()) return;
    var i, t = Date.now() / 1000;
    drawPickups(ctx, cam, t);
    drawAuras(ctx, cam, t);
    drawMeteor(ctx, cam, t);
    for (i = 0; i < S.bolts.length; i++) {
      var b = S.bolts[i], x = b.x - cam.x, y = b.y - cam.y;
      if (x < -60 || y < -60 || x > cam.w + 60 || y > cam.h + 60) continue;
      var f = 0.75 + 0.25 * Math.sin(t * 30 + i), bs = b.big ? 2.1 : 1;
      ctx.save();
      if (b.big) { var hg = ctx.createRadialGradient(x, y, 2, x, y, 46); hg.addColorStop(0, 'rgba(255,240,200,0.8)'); hg.addColorStop(0.45, 'rgba(190,100,255,0.45)'); hg.addColorStop(1, 'rgba(120,40,200,0)'); ctx.fillStyle = hg; ctx.fillRect(x - 46, y - 46, 92, 92); }
      for (var k = 7; k >= 1; k--) { // streaming fire tail
        var tx = x - Math.cos(b.a) * k * 6 * bs + Math.sin(t * 40 + k) * 1.5, ty = y - Math.sin(b.a) * k * 6 * bs + Math.cos(t * 35 + k) * 1.5;
        ctx.globalAlpha = (1 - k / 8) * 0.8; ctx.fillStyle = k > 4 ? 'rgba(200,50,20,1)' : 'rgba(255,130,40,1)';
        ctx.beginPath(); ctx.arc(tx, ty, (8 - k * 0.7) * bs, 0, PI2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      var g = ctx.createRadialGradient(x, y, 1, x, y, 20); g.addColorStop(0, 'rgba(255,200,90,' + (0.7 * f) + ')'); g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 20, y - 20, 40, 40);
      ctx.lineCap = 'round'; ctx.strokeStyle = '#d6b27a'; ctx.lineWidth = 3.4; // the long shaft of a giant bolt
      ctx.lineWidth = 3.4 * bs; ctx.beginPath(); ctx.moveTo(x - Math.cos(b.a) * 30 * bs, y - Math.sin(b.a) * 30 * bs); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = '#c4382a'; ctx.beginPath(); ctx.arc(x - Math.cos(b.a) * 30 * bs, y - Math.sin(b.a) * 30 * bs, 2.6 * bs, 0, PI2); ctx.fill();
      ctx.fillStyle = b.big ? '#ffb040' : '#ff7a1e'; ctx.beginPath(); ctx.arc(x, y, 6.5 * bs, 0, PI2); ctx.fill();
      ctx.fillStyle = '#fff0b0'; ctx.beginPath(); ctx.arc(x, y, 3.2 * bs, 0, PI2); ctx.fill();
      ctx.restore();
    }
    for (i = 0; i < S.booms.length; i++) {
      var q = S.booms[i], k2 = q.t / q.max, bx = q.x - cam.x, by = q.y - cam.y;
      ctx.save();
      var rr = q.r * (0.35 + 0.75 * Math.min(1, k2 * 1.4));
      var g2 = ctx.createRadialGradient(bx, by, 1, bx, by, rr);
      g2.addColorStop(0, 'rgba(255,240,170,' + (0.9 * (1 - k2)) + ')'); g2.addColorStop(0.45, 'rgba(255,140,40,' + (0.7 * (1 - k2)) + ')'); g2.addColorStop(1, 'rgba(180,30,10,0)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(bx, by, rr, 0, PI2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,190,90,' + (0.8 * (1 - k2)) + ')'; ctx.lineWidth = 2 * (1 - k2) + 0.5;
      ctx.beginPath(); ctx.arc(bx, by, q.r * (0.5 + k2 * 0.8), 0, PI2); ctx.stroke();
      ctx.restore();
    }
  };


  /* ---------------------------------------------------------------- power-ups */
  var PW_CODE = ['rapid', 'explode', 'shield', 'meteor'];
  var PW = {
    rapid: { name: 'RAPID FIRE + PIERCING', col: '#ffd84a', dur: 12 },
    explode: { name: 'EXPLODING SHOTS', col: '#ff8a3a', dur: 15 },
    shield: { name: 'SHIELD', col: '#7fd0ff', dur: 10 },
    meteor: { name: 'METEOR RAIN', col: '#ff5a3a', dur: 0 }
  };
  var nextPick = 1;
  function spawnPickup(type, x, y) {
    if (S.pickups.length >= 10) return;
    S.pickups.push({ id: nextPick++, type: type, x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, life: 22, age: 0 });
    pickSend = 0;
  }
  // every monster has a small chance to drop one; elites more, bosses always; the meteor is by far the rarest
  D.onKill = function (e) {
    if (!D.active() || !isHost() || !e || S.phase === 'lost') return;
    if (e.boss) {
      var kinds = ['rapid', 'explode', 'shield'];
      spawnPickup(kinds[Math.floor(Math.random() * 3)], e.x - 14, e.y);
      spawnPickup(kinds[Math.floor(Math.random() * 3)], e.x + 14, e.y);
      if (Math.random() < 0.12) spawnPickup('meteor', e.x, e.y - 10);
      return;
    }
    var mult = e.elite ? 3 : 1, r = Math.random() / mult;
    if (r < 0.0008) spawnPickup('meteor', e.x, e.y);
    else if (r < 0.0008 + 0.012) spawnPickup('rapid', e.x, e.y);
    else if (r < 0.0008 + 0.024) spawnPickup('explode', e.x, e.y);
    else if (r < 0.0008 + 0.036) spawnPickup('shield', e.x, e.y);
  };
  var pickSend = 0;
  function sendPickups(force) {
    var m = mp(); if (!m) return;
    var now = Date.now();
    if (!force && now - pickSend < 250) return;
    pickSend = now;
    m.sendFx('tb', { e: 'u', l: S.pickups.slice(0, 10).map(function (q) { return { i: q.id, t: PW_CODE.indexOf(q.type), x: Math.round(q.x), y: Math.round(q.y), l: Math.round(q.life * 10) / 10 }; }) });
  }
  function updatePickups(dt) { // host: age, expire, and hand out to whoever touches them
    var p = me(), g = CC.Multiplayer && CC.Multiplayer.remote, i, changed = false;
    for (i = S.pickups.length - 1; i >= 0; i--) {
      var pk = S.pickups[i]; pk.age += dt; pk.life -= dt;
      if (pk.life <= 0) { S.pickups.splice(i, 1); changed = true; continue; }
      if (pk.age < 0.4) continue;
      if (p && p.hp > 0 && Math.hypot(p.x - pk.x, p.y - pk.y) < 26) { collect(pk, 'host'); S.pickups.splice(i, 1); changed = true; }
      else if (g && g.hp > 0 && Math.hypot(g.x - pk.x, g.y - pk.y) < 30) { collect(pk, 'guest'); S.pickups.splice(i, 1); changed = true; }
    }
    sendPickups(changed);
  }
  function collect(pk, who) {
    if (pk.type === 'meteor') { // meteor rain is for everybody
      startMeteor(); if (mp()) mp().sendFx('tb', { e: 'm' });
      return;
    }
    if (who === 'host') applyPower(pk.type);
    else if (mp()) mp().sendFx('tb', { e: 'p', t: PW_CODE.indexOf(pk.type) });
  }
  function applyPower(type) { // on the local hero
    var p = me(), def = PW[type]; if (!p || !def) return;
    p.pw = p.pw || { rapid: 0, explode: 0, shield: 0, shieldBase: 0 };
    if (type === 'shield') { p.pw.shield = def.dur; p.pw.shieldBase = p.hp; }
    else p.pw[type] = def.dur;
    toast(def.name + '!', def.col);
    if (CC.fx && CC.fx.burst) CC.fx.burst(p.x, p.y, def.col, 16, 110);
  }
  function updatePower(dt) { // the local hero's timers and the shield's guard
    var p = me(); if (!p || !p.pw) return;
    var w = p.pw;
    if (w.rapid > 0) { w.rapid -= dt; if (p.cd && p.cd.attack > 0) p.cd.attack = Math.max(0, p.cd.attack - dt * 1.6); }
    if (w.explode > 0) w.explode -= dt;
    if (w.shield > 0) {
      w.shield -= dt; w.shieldBase = Math.max(w.shieldBase, p.hp);
      if (p.hp < w.shieldBase) p.hp = w.shieldBase; // nothing gets through, whichever monster tried
      if (w.shield <= 0) { w.shield = 0; if (CC.fx && CC.fx.text) CC.fx.text(p.x, p.y - 20, 'SHIELD DOWN', '#aab4c8', 10); }
    }
  }
  D.rapidActive = function () { var p = me(); return !!(D.active() && p && p.pw && p.pw.rapid > 0 && p.hp > 0); };

  /* ----- meteor rain: a giant meteor finishes the wave ----- */
  var T_IMPACT = 1.7;
  function startMeteor() {
    S.meteor = { t: 0, x: CX * T, y: CY * T + 110, flashed: false };
    toast('METEOR RAIN!', '#ff6a4a');
  }
  function stepMeteor(dt) {
    var m = S.meteor; if (!m) return;
    m.t += dt;
    if (m.t >= T_IMPACT && !m.flashed) {
      m.flashed = true;
      if (CC.fx) { if (CC.fx.shake) CC.fx.shake(12); if (CC.fx.burst) CC.fx.burst(m.x, m.y, '#ff9a3a', 40, 220); }
      if (isHost()) S.pending.length = 0; // nothing more arrives this wave
    }
    if (isHost() && m.t >= T_IMPACT) { // the shockwave sweeps outward and obliterates everything it touches
      var radius = (m.t - T_IMPACT) * 1800, E = CC.Enemies, i;
      for (i = 0; i < E.list.length; i++) {
        var e = E.list[i];
        if (e.dead || e.hp <= 0 || Math.hypot(e.x - m.x, e.y - m.y) > radius) continue;
        e.invuln = 0; if (e.type === 'skeleton') e.rose = true;
        E.damage(e, 1e7, 'fire');
      }
    }
    if (m.t > T_IMPACT + 1.8) S.meteor = null;
  }
  function drawPickups(ctx, cam, t) {
    for (var i = 0; i < S.pickups.length; i++) {
      var q = S.pickups[i], def = PW[q.type] || PW.rapid, x = q.x - cam.x, y = q.y - cam.y;
      if (x < -40 || y < -80 || x > cam.w + 40 || y > cam.h + 40) continue;
      if (q.life < 4 && Math.sin(t * 18) < 0) continue; // blinking out
      var bob = Math.sin(t * 4 + q.id) * 2.5, big = q.type === 'meteor', r = big ? 11 : 8;
      ctx.save();
      var beam = ctx.createLinearGradient(0, y - 60, 0, y);
      beam.addColorStop(0, 'rgba(255,255,255,0)'); beam.addColorStop(1, def.col + '88'); // a beam of light so it can be seen from afar
      ctx.fillStyle = beam; ctx.fillRect(x - 3, y - 60, 6, 60);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 4, r * 0.9, r * 0.4, 0, 0, PI2); ctx.fill();
      var g = ctx.createRadialGradient(x, y - 8 + bob, 1, x, y - 8 + bob, r * 2.6);
      g.addColorStop(0, def.col + 'cc'); g.addColorStop(1, def.col + '00');
      ctx.fillStyle = g; ctx.fillRect(x - r * 2.6, y - 8 + bob - r * 2.6, r * 5.2, r * 5.2);
      ctx.translate(x, y - 8 + bob);
      ctx.fillStyle = big ? '#3a1812' : '#14101e'; ctx.beginPath(); ctx.arc(0, 0, r, 0, PI2); ctx.fill();
      ctx.strokeStyle = def.col; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = def.col; ctx.strokeStyle = def.col; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (q.type === 'rapid') { for (var k = -1; k <= 1; k += 2) { ctx.beginPath(); ctx.moveTo(-1 + k * 2.2, -4); ctx.lineTo(3 + k * 2.2, 0); ctx.lineTo(-1 + k * 2.2, 4); ctx.stroke(); } }
      else if (q.type === 'explode') { for (var n = 0; n < 8; n++) { var a = n * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 2); ctx.lineTo(Math.cos(a) * (n % 2 ? 4.5 : 6.2), Math.sin(a) * (n % 2 ? 4.5 : 6.2)); ctx.stroke(); } }
      else if (q.type === 'shield') { ctx.beginPath(); ctx.moveTo(0, -5.5); ctx.lineTo(4.6, -3.5); ctx.lineTo(4, 2); ctx.lineTo(0, 5.8); ctx.lineTo(-4, 2); ctx.lineTo(-4.6, -3.5); ctx.closePath(); ctx.fill(); }
      else { ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.arc(1.5, 1, 5.5, 0, PI2); ctx.fill(); ctx.fillStyle = '#ffd890'; ctx.beginPath(); ctx.arc(2.6, 0, 2.4, 0, PI2); ctx.fill(); ctx.strokeStyle = '#ff9a3a'; ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(-9, -9); ctx.stroke(); }
      ctx.restore();
    }
  }
  function drawMeteor(ctx, cam, t) {
    var m = S.meteor; if (!m) return;
    var k = Math.min(1, m.t / T_IMPACT), x = m.x - cam.x, y = m.y - cam.y;
    ctx.save();
    if (m.t < T_IMPACT) {
      // the doom shadow grows on the ground, then the rock arrives out of the sky
      ctx.globalAlpha = 0.25 + 0.5 * k; var sr = 30 + k * 110;
      var sg = ctx.createRadialGradient(x, y, 4, x, y, sr); sg.addColorStop(0, 'rgba(255,60,20,0.65)'); sg.addColorStop(1, 'rgba(120,10,5,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x, y, sr, sr * 0.55, 0, 0, PI2); ctx.fill();
      ctx.globalAlpha = 1;
      var h = Math.pow(1 - k, 1.5), mx = x - 240 * h, my = y - 560 * h;
      for (var i = 16; i >= 1; i--) { // long fire tail trailing back up and away
        var tt = i / 16, tx = mx - 240 * 0.38 * tt * 0.9, ty = my - 560 * 0.38 * tt * 0.9;
        ctx.globalAlpha = (1 - tt) * 0.55; ctx.fillStyle = i > 8 ? '#b0301a' : '#ff8a30';
        ctx.beginPath(); ctx.arc(tx, ty, 36 * (1 - tt * 0.6), 0, PI2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      var rg = ctx.createRadialGradient(mx, my, 6, mx, my, 62); rg.addColorStop(0, 'rgba(255,230,160,0.95)'); rg.addColorStop(0.4, 'rgba(255,120,30,0.7)'); rg.addColorStop(1, 'rgba(200,40,10,0)');
      ctx.fillStyle = rg; ctx.fillRect(mx - 62, my - 62, 124, 124);
      ctx.fillStyle = '#4a2418'; ctx.beginPath(); ctx.arc(mx, my, 34, 0, PI2); ctx.fill();
      ctx.fillStyle = '#6a3a22'; ctx.beginPath(); ctx.arc(mx - 9, my - 8, 16, 0, PI2); ctx.fill();
      ctx.fillStyle = '#2a120c'; ctx.beginPath(); ctx.arc(mx + 12, my + 9, 11, 0, PI2); ctx.fill();
      ctx.strokeStyle = '#ff9a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mx, my, 34, 0, PI2); ctx.stroke();
    } else {
      var a = m.t - T_IMPACT;
      var fb = Math.min(1, a / 0.35), fa = Math.max(0, 1 - a / 1.3);
      var eg = ctx.createRadialGradient(x, y, 4, x, y, 40 + fb * 220); // the fireball
      eg.addColorStop(0, 'rgba(255,250,200,' + fa + ')'); eg.addColorStop(0.35, 'rgba(255,140,40,' + (0.8 * fa) + ')'); eg.addColorStop(1, 'rgba(160,30,10,0)');
      ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(x, y, 40 + fb * 220, 0, PI2); ctx.fill();
      ctx.globalAlpha = Math.max(0, 1 - a / 1.6); ctx.strokeStyle = '#ffc070'; ctx.lineWidth = 8 * (1 - a / 1.8) + 1; // the shockwave
      ctx.beginPath(); ctx.arc(x, y, a * 1800, 0, PI2); ctx.stroke();
      ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, a * 1700, 0, PI2); ctx.stroke();
      ctx.globalAlpha = Math.max(0, 0.7 - a / 2.5); ctx.fillStyle = '#1a0a06'; ctx.beginPath(); ctx.ellipse(x, y, 70, 38, 0, 0, PI2); ctx.fill(); // scorched crater
    }
    ctx.restore();
  }
  // glowing auras on the local hero for each active power-up
  function drawAuras(ctx, cam, t) {
    var p = me(); if (!p || !p.pw || p.hp <= 0) return;
    var x = p.x - cam.x, y = p.y - cam.y, w = p.pw;
    ctx.save();
    if (w.shield > 0) {
      var blink = w.shield < 2 && Math.sin(t * 20) < 0;
      if (!blink) { ctx.globalAlpha = 0.35 + 0.12 * Math.sin(t * 6); ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(x, y - 2, 16, 20, 0, 0, PI2); ctx.stroke(); ctx.globalAlpha = 0.1; ctx.fillStyle = '#8fd8ff'; ctx.fill(); }
    }
    if (w.rapid > 0) { ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(x, y + 9, 17 + Math.sin(t * 12) * 2, 6.5, 0, 0, PI2); ctx.stroke(); }
    if (w.explode > 0) { ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ff8a3a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(x, y + 9, 12, 4.8, 0, 0, PI2); ctx.stroke(); }
    ctx.restore();
  }

  /* ----- the view: 20% wider than the normal game always, the whole town while on the crossbow ----- */
  var BASE_MUL = 1 / 1.2, zoomCur = BASE_MUL, zoomAt = 0;
  D.zoomMul = function (base, Wd, Hd) {
    var m = D.map;
    if (!D.active() || !m) { zoomCur = BASE_MUL; return 1; }
    var now = Date.now(), dt = Math.min(0.1, (now - zoomAt) / 1000 || 0); zoomAt = now;
    var target = BASE_MUL;
    if (operatingSelf()) target = Math.min(BASE_MUL, (Wd / 735) / base); // crossbow view: 735 px of world across the screen (tightened 30% twice from the whole-palisade 1500)
    zoomCur += (target - zoomCur) * Math.min(1, dt * 3.2);
    // zoomed out, light the whole town so the crossbow gunner can see what is coming
    if (!m._base) m._base = { view: m.viewR, light: m.playerLight, amb: m.ambient };
    var uz = CC.getUserZoom ? CC.getUserZoom() : 1;
    var k = Math.max(1, BASE_MUL / (zoomCur * Math.min(1, uz)));
    m.viewR = m._base.view * k; m.playerLight = m._base.light * Math.sqrt(k);
    var parts = m._base.amb.split(','); parts[3] = String(Math.max(0.16, (+parts[3]) * (1 - 0.55 * Math.min(1, (k - 1) / 2)))); m.ambient = parts.join(',');
    return zoomCur;
  };

  /* ---------------------------------------------------------------- screen overlay */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + pad(sec % 60); }
  D.drawScreen = function (ctx, Wd, Hd, addButton) {
    if (!D.active()) return;
    var now = Date.now(), b = D.map.box;
    // ----- HUD plate under the minimap
    var mm = CC.Minimap, py = mm ? Math.max(126, (mm.height || 120) + 8) : 126, px = 8, pw = Math.min(124, Wd * 0.34), ph = 82;
    ctx.save();
    ctx.fillStyle = 'rgba(14,9,20,0.82)'; ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = S.boss && S.phase === 'wave' ? '#c04a3a' : '#6e5436'; ctx.lineWidth = 1.5; ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px Georgia, serif'; ctx.textAlign = 'left'; ctx.fillStyle = S.boss ? '#ff8a6a' : '#f0c870';
    ctx.fillText(S.phase === 'prep' ? 'GET READY' : 'WAVE ' + S.wave, px + 8, py + 12);
    ctx.font = '11px Georgia, serif';
    var timerLabel = S.phase === 'lost' ? 'DEFEAT' : S.phase === 'cleared' ? 'NEXT ' + fmt(S.timer) : S.phase === 'prep' ? 'START ' + fmt(S.timer) : (S.timer <= 0 && S.boss ? 'BOSS ALIVE' : 'NEXT ' + fmt(S.timer));
    ctx.fillStyle = S.phase === 'wave' && S.timer < 10 && S.timer > 0 ? '#ff9a7a' : '#cfe8ff'; ctx.fillText(timerLabel, px + 8, py + 28);
    ctx.fillStyle = '#ff8c8c'; ctx.fillText('ENEMIES ' + S.left, px + 8, py + 42);
    var k = clamp(b.hp / b.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(px + 8, py + 52, pw - 16, 8);
    ctx.fillStyle = k > 0.6 ? '#5fd98a' : k > 0.3 ? '#f0c050' : '#f0504a'; ctx.fillRect(px + 8, py + 52, (pw - 16) * k, 8);
    ctx.fillStyle = '#fff1cd'; ctx.font = 'bold 7px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('SUPPLIES', px + pw / 2, py + 56.5);
    var tb = S.tb; ctx.textAlign = 'left'; ctx.font = 'bold 10px Georgia, serif';
    ctx.fillStyle = tb.phase === 'fire' ? '#ffb060' : '#9aa6bc';
    ctx.fillText(tb.phase === 'fire' ? 'CROSSBOW ' + fmt(tb.t) + (tb.op ? ' *' : '') : 'RELOAD ' + fmt(tb.t), px + 8, py + 73);
    var hp = me(), ly = py + ph + 12;
    if (hp && hp.pw) ['rapid', 'explode', 'shield'].forEach(function (kd) {
      var left = hp.pw[kd]; if (!(left > 0)) return;
      ctx.fillStyle = 'rgba(14,9,20,0.82)'; ctx.fillRect(px, ly - 9, pw, 16);
      ctx.fillStyle = PW[kd].col; ctx.fillRect(px, ly - 9, 3, 16);
      ctx.font = 'bold 9px Georgia, serif'; ctx.textAlign = 'left'; ctx.fillText(kd === 'rapid' ? 'RAPID + PIERCE' : kd === 'explode' ? 'EXPLODING' : 'SHIELD', px + 7, ly);
      ctx.textAlign = 'right'; ctx.fillText(Math.ceil(left) + 's', px + pw - 5, ly); ly += 19;
    });
    ctx.restore();
    if (S.meteor && S.meteor.t >= T_IMPACT - 0.05) { // blinding white-orange flash at the moment of impact
      var fl = Math.exp(-Math.pow((S.meteor.t - T_IMPACT) / 0.14, 2));
      if (fl > 0.02) { ctx.save(); ctx.globalAlpha = Math.min(0.9, fl); ctx.fillStyle = '#fff1d0'; ctx.fillRect(0, 0, Wd, Hd); ctx.restore(); }
    }
    // ----- gate warnings: pulsing arrows toward gates with enemies massing at them
    var p = CC.state.player, cam = CC.camera;
    if (p && D.map.gates && CC.Enemies && S.phase !== 'lost') {
      var counts = [0, 0, 0, 0], E = CC.Enemies.list, gi, i;
      for (i = 0; i < E.length; i++) { var e = E[i]; if (e.dead) continue; for (gi = 0; gi < 4; gi++) { var g = GATES[gi]; if (Math.abs(e.x - g.x) < 300 && Math.abs(e.y - g.y) < 300) { counts[gi]++; break; } } }
      for (gi = 0; gi < 4; gi++) {
        if (counts[gi] < 3) continue;
        var g2 = GATES[gi], dx = g2.x - p.x, dy = g2.y - p.y, dist = Math.hypot(dx, dy);
        if (dist < Math.min(Wd, Hd) * 0.42) continue; // the gate is already on screen
        var a = Math.atan2(dy, dx), rr = Math.min(Wd, Hd) * 0.34, ax = Wd / 2 + Math.cos(a) * rr * 1.1, ay = Hd * 0.42 + Math.sin(a) * rr * 1.25;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 160);
        ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -8); ctx.lineTo(-2, 0); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
        ctx.rotate(-a); ctx.fillStyle = '#ffd0c8'; ctx.font = 'bold 9px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText(g2.name + ' ' + counts[gi], 0, 16);
        ctx.restore();
      }
    }
    // ----- ghostly banner
    var bn = S.banner;
    if (bn) {
      var el = (now - bn.t0) / 1000, dur = bn.kind === 'lost' ? 99 : 3.6;
      if (el >= dur) S.banner = null;
      else {
        var al = el < 0.7 ? el / 0.7 : el < dur - 1 ? 1 : Math.max(0, (dur - el)), boss = bn.kind === 'boss', lost = bn.kind === 'lost';
        var main = lost ? '#ff7a6a' : boss ? '#ff6a58' : bn.kind === 'clear' ? '#9ff0b8' : bn.kind === 'horde' ? '#ffc680' : bn.kind === 'undead' ? '#d6c4ff' : '#cdebf0',
            glow = lost ? 'rgba(255,80,60,0.95)' : boss ? 'rgba(255,70,50,0.95)' : bn.kind === 'clear' ? 'rgba(120,240,170,0.9)' : bn.kind === 'horde' ? 'rgba(255,170,70,0.9)' : bn.kind === 'undead' ? 'rgba(160,110,255,0.95)' : 'rgba(150,220,230,0.9)';
        var sz = boss || lost ? 40 : 44, yy = Hd * 0.37 - Math.min(el, 3) * 4 + (lost ? 20 : 0);
        ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var spaced = bn.text.split('').join(' ').replace(/ {3,}/g, '   ');
        ctx.font = 'italic bold ' + sz + 'px Georgia, "Palatino Linotype", serif';
        var fitW = ctx.measureText(spaced).width;
        if (fitW > Wd * 0.94) sz = Math.max(14, Math.floor(sz * Wd * 0.94 / fitW)); // always fits the screen
        ctx.font = 'italic bold ' + sz + 'px Georgia, "Palatino Linotype", serif';
        // faint ghost trails drifting behind the text
        ctx.globalAlpha = al * 0.25; ctx.fillStyle = main;
        ctx.fillText(spaced, Wd / 2 + 4 + Math.sin(now / 700) * 5, yy + 4 + Math.sin(now / 520) * 2);
        ctx.fillText(spaced, Wd / 2 - 5 + Math.sin(now / 810) * 5, yy - 3);
        ctx.globalAlpha = al * (0.88 + 0.12 * Math.sin(now / 250));
        ctx.shadowColor = glow; ctx.shadowBlur = 20 + 9 * Math.sin(now / 380); ctx.fillStyle = main;
        ctx.fillText(spaced, Wd / 2 + Math.sin(now / 900) * 3, yy);
        ctx.shadowBlur = 0;
        if (bn.sub) { ctx.font = 'italic 14px Georgia, serif'; ctx.globalAlpha = al * 0.8; ctx.fillStyle = main; ctx.fillText(bn.sub, Wd / 2, yy + sz * 0.8 + 6); }
        ctx.restore();
      }
    }
    if (S.toast) {
      var tel = (now - S.toast.t0) / 1000, ta = tel < 0.3 ? tel / 0.3 : Math.max(0, 1 - (tel - 1.8) / 0.8);
      ctx.save(); ctx.globalAlpha = ta; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'italic bold 18px Georgia, serif';
      ctx.shadowColor = S.toast.col; ctx.shadowBlur = 12; ctx.fillStyle = S.toast.col; ctx.fillText(S.toast.text, Wd / 2, Hd * 0.5); ctx.restore();
    }
    // ----- crossbow: ENTER when close, EXIT (and the charge meter) while inside
    var meP = me();
    if (addButton && S.phase !== 'lost' && meP && meP.hp > 0) {
      var bxx = Wd / 2 - 44, byy = Hd - 108;
      if (operatingSelf()) {
        addButton(bxx, byy, 88, 34, 'EXIT', '#7a2a2a', function () { D.interact(); });
        var cdLeft = S.tb.cc, chg = S.tb.charge, mw = 120, mx = Wd / 2 - mw / 2, my = byy - 14;
        ctx.save(); ctx.fillStyle = 'rgba(10,6,14,0.85)'; ctx.fillRect(mx, my, mw, 9);
        var fillFrac = cdLeft > 0 ? 1 - cdLeft / CHARGE_CD : Math.max(chg, 0), fillCol = cdLeft > 0 ? '#6a7a96' : chg > 0 ? '#ffb040' : '#5fd98a';
        ctx.fillStyle = cdLeft > 0 || chg > 0 ? fillCol : '#5fd98a'; ctx.fillRect(mx + 1, my + 1, (mw - 2) * (cdLeft > 0 || chg > 0 ? fillFrac : 1), 7);
        ctx.strokeStyle = '#6e5436'; ctx.lineWidth = 1; ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, 8);
        ctx.fillStyle = '#fff1cd'; ctx.font = 'bold 9px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(cdLeft > 0 ? 'CHARGED BOLT ' + Math.ceil(cdLeft) + 's' : chg > 0 ? 'CHARGING ' + Math.round(chg * 100) + '%' : 'HOLD ATK: CHARGED BOLT READY', Wd / 2, my - 7);
        ctx.restore();
      } else if (D.nearAction()) addButton(bxx, byy, 88, 34, 'ENTER', '#3a6a3a', function () { D.interact(); });
    }
    // ----- defeat
    if (S.phase === 'lost') {
      ctx.save(); ctx.fillStyle = 'rgba(30,0,4,0.45)'; ctx.fillRect(0, 0, Wd, Hd); ctx.restore();
      ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#ffe2d4'; ctx.font = 'bold 18px Georgia, serif';
      ctx.fillText('Survived ' + S.wave + ' wave' + (S.wave === 1 ? '' : 's'), Wd / 2, Hd * 0.5);
      ctx.restore();
      if (isHost() && addButton) addButton(Wd / 2 - 90, Hd * 0.55, 180, 42, 'Defend again', '#657446', function () { D.restart(); });
      else { ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = '#d8c8c0'; ctx.font = '12px Georgia, serif'; ctx.fillText('Waiting for the host to start again...', Wd / 2, Hd * 0.57); ctx.restore(); }
    }
  };
  D.drawDead = function (ctx, Wd, Hd, addButton) {
    if (S.phase === 'lost') return;
    ctx.save(); ctx.fillStyle = 'rgba(20,0,0,0.38)'; ctx.fillRect(0, 0, Wd, Hd);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffd0c8'; ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText('YOU HAVE FALLEN', Wd / 2, Hd * 0.42);
    ctx.font = '14px Georgia, serif'; ctx.fillStyle = '#f0e0d0';
    ctx.fillText('Rising again in ' + Math.max(1, Math.ceil(S.respawnT)) + '...', Wd / 2, Hd * 0.48);
    ctx.font = '11px Georgia, serif'; ctx.fillStyle = '#b8c8d8'; ctx.fillText('Your partner is still holding the gates', Wd / 2, Hd * 0.53);
    ctx.restore();
  };
})(window);
