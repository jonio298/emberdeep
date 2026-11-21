/* CC.Forest - the Giant Forest: a large, dark, foggy sequoia wood between the town and the caves.
 *
 * API: generate() -> CC.Realm map (Dungeon-compatible; the shell puts it in CC.Dungeon), interact() -> true when a
 *   villager was talked to, drawOverlay(ctx,W,H) (fading "Giant Forest" title + speech), drawMonster(ctx,e,r,col,dark,t).
 * Monsters (registered into CC.Enemies.TYPES with weight 0, so only this zone spawns them): bear (demon black bear),
 *   raven (demon raven), vine (stationary tree vine), horror (teleporting horror); ghosts reuse the cave ghost.
 * Places: run-down cabins (a chest each), one lit cabin with smoke and people, and a hollow sequoia whose cave mouth is the
 *   exit (map.stairs: F / USE there drops into the caves).
 * Load order: after realm.js and enemies.js.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var T = CC.TILE = CC.TILE || 32;
  var PI2 = Math.PI * 2;
  var W = 96, H = 128;
  var F = CC.Forest = { map: null, titleStart: 0, speech: null, W: W, H: H };

  function seeded(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ctr(tx, ty) { return { tx: tx, ty: ty, x: tx * T + T / 2, y: ty * T + T / 2 }; }

  /* ---------- art ---------- */
  function ground(kind, hv) {
    if (kind === 1) return hv < 0.5 ? '#4a3220' : '#432c1c';
    if (kind === 2) return hv < 0.5 ? '#5b4a35' : '#54442f'; // main road: pale packed earth
    if (kind === 10) return hv < 0.5 ? '#3f2f1f' : '#382a1b'; // tunnel floor: dark packed earth
    if (kind === 6) return hv < 0.5 ? '#0e0d0b' : '#11100d'; // side trails: near-black, rotten soil
    var g = 18 + Math.floor(hv * 10);
    return 'rgb(' + (14 + Math.floor(hv * 6)) + ',' + (g + 14) + ',' + (g + 2) + ')';
  }
  function detail(ctx, kind, sx, sy, hv, t, tx, ty) {
    if (kind === 6) { // creepy trail: bones, grasping roots, pale glowing fungus
      if (hv > 0.9) {
        ctx.strokeStyle = 'rgba(205,198,178,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx + 6, sy + 20); ctx.lineTo(sx + 18, sy + 14); ctx.stroke();
        ctx.fillStyle = 'rgba(205,198,178,0.6)'; ctx.beginPath(); ctx.arc(sx + 20, sy + 13, 2.4, 0, PI2); ctx.fill();
      } else if (hv < 0.14) {
        ctx.strokeStyle = 'rgba(40,24,14,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy + 8 + hv * 40); ctx.quadraticCurveTo(sx + 14, sy + 2, sx + 30, sy + 10 + hv * 30); ctx.stroke();
      } else if (hv > 0.46 && hv < 0.5) {
        ctx.fillStyle = 'rgba(120,235,190,' + (0.35 + 0.15 * Math.sin(t * 2 + tx)) + ')'; ctx.beginPath(); ctx.arc(sx + 12, sy + 14, 2, 0, PI2); ctx.arc(sx + 17, sy + 16, 1.4, 0, PI2); ctx.fill();
      }
      return;
    }
    if (kind === 10) { // floor of the hollow-tree tunnel: tamped earth, creeping roots, pebbles, dappled light
      ctx.strokeStyle = 'rgba(20,10,5,0.55)'; ctx.lineWidth = 2.2;
      var ry = sy + 4 + hv * 22;
      ctx.beginPath(); ctx.moveTo(sx, ry); ctx.quadraticCurveTo(sx + 10, ry - 7 + hv * 14, sx + 20, ry + 2); ctx.quadraticCurveTo(sx + 26, ry + 5, sx + T, ry - 3 + hv * 6); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,70,40,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, ry - 1); ctx.quadraticCurveTo(sx + 10, ry - 8 + hv * 14, sx + 20, ry + 1); ctx.stroke();
      ctx.fillStyle = 'rgba(15,8,4,0.25)'; ctx.fillRect(sx + 3 + hv * 12, sy + 20, 14, 2); // tamped footprints
      if (hv > 0.6) { ctx.fillStyle = 'rgba(130,115,95,0.5)'; ctx.fillRect(sx + 9 + hv * 8, sy + 11, 4, 3); } // pebble
      var dap = 0.1 + 0.07 * Math.sin(t * 1.3 + tx * 1.7 + ty * 2.3); // light filtering through the canopy
      ctx.fillStyle = 'rgba(255,225,150,' + dap + ')'; ctx.beginPath(); ctx.ellipse(sx + 10 + hv * 12, sy + 16, 6 + hv * 4, 3.5, 0.3, 0, PI2); ctx.fill();
      return;
    }
    if (kind !== 0 && kind !== 2) return;
    if (kind === 2 && hv < 0.3) { ctx.fillStyle = 'rgba(30,20,10,0.22)'; ctx.fillRect(sx + 4, sy + 6 + hv * 40, 24, 2); } // cart ruts
    if (hv > 0.55) { // needles and tufts
      ctx.strokeStyle = kind === 2 ? 'rgba(90,80,60,0.5)' : 'rgba(60,110,70,0.45)'; ctx.lineWidth = 1;
      var x = sx + (hv * 977 % 1) * 26 + 3, y = sy + (hv * 313 % 1) * 24 + 5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y - 5); ctx.moveTo(x, y); ctx.lineTo(x + 1, y - 6); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 4); ctx.stroke();
    }
    if (hv < 0.06) { ctx.fillStyle = 'rgba(120,110,95,0.5)'; ctx.fillRect(sx + 10, sy + 12, 5, 3); } // pebble
    if (hv > 0.93) { ctx.fillStyle = 'rgba(150,90,60,0.55)'; ctx.fillRect(sx + 8, sy + 9, 3, 3); ctx.fillStyle = 'rgba(200,190,170,0.6)'; ctx.fillRect(sx + 9, sy + 12, 1, 3); } // toadstool
  }

  // drooping clump of sequoia foliage hanging from a branch
  function clump(ctx, x, y, r, rnd) {
    ctx.fillStyle = 'rgba(14,38,28,0.96)'; ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r * 0.7, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = 'rgba(32,72,48,0.9)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.25, r * 0.8, r * 0.4, 0, 0, PI2); ctx.fill();
    ctx.strokeStyle = 'rgba(18,52,36,0.95)'; ctx.lineWidth = 1.4;
    for (var j = 0; j < 6; j++) {
      var x2 = x + (j - 2.5) * r * 0.45, l = r * (0.9 + rnd() * 1.3);
      ctx.beginPath(); ctx.moveTo(x2, y + r * 0.2); ctx.quadraticCurveTo(x2 + (rnd() - 0.5) * 3, y + l * 0.5, x2 + (rnd() - 0.5) * 4, y + l); ctx.stroke();
    }
  }
  // a giant sequoia: buttress roots, tapering fluted trunk, deep bark furrows, side branches with drooping foliage.
  // (bx,by) = trunk base centre, w = trunk width, h = height, flare = root flare, m = scale, nb = branch count
  function paintTrunk(ctx, bx, by, w, h, flare, m, rnd, nb) {
    var N = 14, s, f, i, k, side, u, x, y;
    function half(f) { return w / 2 * (1 - 0.42 * f) + flare * Math.pow(1 - f, 5); }
    ctx.lineCap = 'round';
    for (side = -1; side <= 1; side += 2) { // buttress roots, plus one creeping along the ground
      ctx.fillStyle = '#1b0d08'; ctx.beginPath(); ctx.moveTo(bx + side * (w / 2 - 4), by - 38 * m);
      ctx.quadraticCurveTo(bx + side * (w / 2 + flare * 0.6), by - 10, bx + side * (w / 2 + flare + 16 * m), by + 1);
      ctx.lineTo(bx + side * (w / 2 - 2), by + 1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1b0d08'; ctx.lineWidth = 4 * m;
      ctx.beginPath(); ctx.moveTo(bx + side * (w / 2 + flare), by - 2); ctx.quadraticCurveTo(bx + side * (w / 2 + flare + 18 * m), by + 2, bx + side * (w / 2 + flare + 30 * m + rnd() * 10), by + 4 - rnd() * 3); ctx.stroke();
    }
    var g = ctx.createLinearGradient(bx - w / 2 - flare, 0, bx + w / 2 + flare, 0);
    g.addColorStop(0, '#1e0e09'); g.addColorStop(0.35, '#5a2e1a'); g.addColorStop(0.7, '#3a1c10'); g.addColorStop(1, '#170a06');
    ctx.fillStyle = g; ctx.beginPath();
    for (s = 0; s <= N; s++) { f = s / N; x = bx - half(f) + Math.sin(f * 37) * 0.9 * m; y = by - f * h; if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    for (s = N; s >= 0; s--) { f = s / N; ctx.lineTo(bx + half(f) + Math.sin(f * 37 + 2) * 0.9 * m, by - f * h); }
    ctx.closePath(); ctx.fill();
    for (i = 0; i < 7; i++) { // flutes: a dark groove with a lit ridge beside it
      u = -0.85 + i * 0.283 + (rnd() - 0.5) * 0.08;
      for (k = 0; k < 2; k++) {
        ctx.strokeStyle = k ? 'rgba(170,95,55,' + (0.28 - 0.1 * Math.abs(u)) + ')' : 'rgba(8,3,1,0.5)'; ctx.lineWidth = k ? 2 * m : 1.2;
        ctx.beginPath();
        for (s = 0; s <= N; s++) { f = s / N; x = bx + (u + k * 0.12) * half(f) + Math.sin(f * 23 + i * 1.7) * 1.4 * m; y = by - f * h; if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.stroke();
      }
    }
    for (i = 0; i < 22; i++) { // bark furrows and chunks
      f = 0.02 + rnd() * 0.8; u = (rnd() - 0.5) * 1.7; x = bx + u * half(f); y = by - f * h;
      ctx.strokeStyle = rnd() < 0.6 ? 'rgba(6,2,1,0.55)' : 'rgba(150,80,45,0.3)'; ctx.lineWidth = 1 + rnd() * 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 2, y - 5 - rnd() * 10); ctx.stroke();
    }
    var s0 = rnd() < 0.5 ? 1 : -1;
    for (i = 0; i < nb; i++) { // branches spring out of both sides at different heights
      f = 0.22 + (i + rnd() * 0.7) / nb * 0.62; side = i % 2 ? s0 : -s0;
      var x0 = bx + side * (half(f) - 1), y0 = by - f * h, len = (24 + rnd() * 26) * m * (1.15 - f * 0.55) + 10 * m;
      var cx = x0 + side * len * 0.5, cy = y0 - 6 - rnd() * 10 * m, x1 = x0 + side * len, y1 = y0 + 2 - rnd() * 8 * m;
      ctx.strokeStyle = '#26120a'; ctx.lineWidth = Math.max(2, 5 * m * (1 - f * 0.5));
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
      for (k = 0; k < 3; k++) {
        var tt = 0.45 + k * 0.27, a = (1 - tt) * (1 - tt), b = 2 * (1 - tt) * tt, c = tt * tt;
        clump(ctx, a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1, (7 + rnd() * 5) * m * (k === 2 ? 1.2 : 1), rnd);
      }
    }
    clump(ctx, bx, by - h + 6, 12 * m, rnd); // the crown
    ctx.lineCap = 'butt';
  }
  function drawTreeRaw(ctx, bx, by, hv, big, padX, erase) { // erase = painting into a transparent sprite, so the crown can be rubbed out softly
    var m = big ? 1.5 : 1, w = (24 + hv * 10) * m, h = (130 + hv * 110) * (big ? 1.25 : 1), topY = by - h, rnd = seeded(Math.floor(hv * 1e6) + (big ? 77 : 0));
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(bx + 4, by + 1, w * 0.9, 7, 0, 0, PI2); ctx.fill();
    paintTrunk(ctx, bx, by, w, h, 9 * m, m, rnd, big ? 6 : 5);
    if (!erase) return; // the old dark mist rectangle painted a black box around every tree; the crown now fades to transparent instead
    var fade = ctx.createLinearGradient(0, topY, 0, by - 40); // mist swallows the canopy
    fade.addColorStop(0, 'rgba(0,0,0,0.85)'); fade.addColorStop(0.6, 'rgba(0,0,0,0.25)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = fade; ctx.fillRect(bx - padX, topY - 10, padX * 2, h - 30); ctx.restore();
  }
  var treeCache = {};
  function treeSprite(hv, big) { // trees are painted once per height bucket and blitted
    var q = Math.min(11, Math.floor(hv * 12)), key = (big ? 'b' : 's') + q;
    if (treeCache[key] !== undefined) return treeCache[key];
    var d = root.document, cv = d && d.createElement ? d.createElement('canvas') : null, q2 = cv && cv.getContext ? cv.getContext('2d') : null;
    if (!q2) return (treeCache[key] = null);
    var m = big ? 1.5 : 1, hq = (q + 0.5) / 12, h = (130 + hq * 110) * (big ? 1.25 : 1), padX = Math.ceil(110 * m);
    cv.width = padX * 2; cv.height = Math.ceil(h) + 34;
    var sp = { cv: cv, padX: padX, by0: cv.height - 18 };
    drawTreeRaw(q2, padX, sp.by0, hq, big, padX, true);
    return (treeCache[key] = sp);
  }
  function drawTree(ctx, sx, sy, hv, big) { // big = town giants: thicker and taller
    var bx = sx + T / 2, by = sy + T - 2, sp = treeSprite(hv, big);
    if (sp) ctx.drawImage(sp.cv, bx - sp.padX, by - sp.by0);
    else drawTreeRaw(ctx, bx, by, hv, big, Math.ceil(110 * (big ? 1.5 : 1)));
  }
  F.drawTree = drawTree;
  F.art = { ground: ground, detail: detail, drawSolid: drawSolid, drawLamp: drawLamp }; // reused by the Town Defense arena
  function drawLog(ctx, sx, sy, hv, ruined) {
    if (ruined) {
      var hh = 18 + Math.floor(hv * 12);
      ctx.fillStyle = '#2e261d'; ctx.fillRect(sx, sy + T - hh, T, hh);
      ctx.fillStyle = '#463a2b'; ctx.fillRect(sx, sy + T - hh, T, 4);
      ctx.fillStyle = 'rgba(60,110,60,0.55)'; ctx.fillRect(sx + (hv * 20 % 1) * 12, sy + T - hh + 4, 10, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(sx, sy + T - 3, T, 3);
      return;
    }
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(sx, sy - 10, T, T + 10);
    ctx.fillStyle = '#7a5232'; ctx.fillRect(sx, sy - 10, T, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (var l = 0; l < 4; l++) ctx.fillRect(sx, sy - 2 + l * 8, T, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx, sy + T - 3, T, 3);
  }
  function drawSolid(ctx, kind, sx, sy, hv) {
    if (kind === 3) drawTree(ctx, sx, sy, hv);
    else if (kind === 4) drawLog(ctx, sx, sy, hv, false);
    else if (kind === 8) drawLog(ctx, sx, sy, hv, true);
  }

  function drawHollow(ctx, sx, sy, t) { // giant hollow sequoia; (sx,sy) = the cave mouth centre on the ground
    var w = 100, h = 330, top = sy - h;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(sx, sy - 4, 80, 12, 0, 0, PI2); ctx.fill();
    paintTrunk(ctx, sx, sy - 4, w, h, 22, 1.8, seeded(4242), 9); // same sequoia art, bigger, with the cave mouth cut into it
    // the hollow: a tunnel bored through the living trunk. Bark-lined walls recede in nested arches (each one a growth ring),
    // the floor is packed earth with roots, light dapples down from the canopy, and a faint violet-orange glow shows the way down.
    var gl = 0.5 + 0.2 * Math.sin(t * 2.2), rnd = seeded(9001), k, i, by = sy - 2;
    function arch(hw, hh, cy) {
      ctx.beginPath(); ctx.moveTo(sx - hw, cy); ctx.lineTo(sx - hw, cy - hh * 0.55);
      ctx.quadraticCurveTo(sx, cy - hh * 1.25, sx + hw, cy - hh * 0.55); ctx.lineTo(sx + hw, cy); ctx.closePath();
    }
    var cols = ['#4a2514', '#3a1d10', '#2b150b', '#1c0e07', '#100804'];
    for (k = 0; k < 5; k++) { // nested arches: each step in is another ring of bark, darker the deeper it goes
      var s = 1 - k * 0.17;
      arch(31 * s, 56 * s, by - k * 3);
      ctx.fillStyle = cols[k]; ctx.fill();
      ctx.strokeStyle = k ? 'rgba(150,85,48,0.38)' : 'rgba(190,120,70,0.5)'; ctx.lineWidth = 1.4; ctx.stroke(); // ring edge
    }
    ctx.lineCap = 'round';
    for (k = 0; k < 4; k++) { // bark furrows running up both walls, with a lit ridge beside each groove
      var wx = 31 * (1 - k * 0.17), wy = by - k * 3;
      for (var side = -1; side <= 1; side += 2) for (i = 0; i < 3; i++) {
        var fx = sx + side * (wx - 1.5 - i * 3.2 * (1 - k * 0.2)), fh = 12 + rnd() * 18;
        ctx.strokeStyle = 'rgba(6,2,1,0.55)'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(fx, wy - 2); ctx.lineTo(fx + (rnd() - 0.5) * 2, wy - fh); ctx.stroke();
        ctx.strokeStyle = 'rgba(170,100,55,0.22)'; ctx.beginPath(); ctx.moveTo(fx + 1.4, wy - 2); ctx.lineTo(fx + 1.4 + (rnd() - 0.5) * 2, wy - fh * 0.8); ctx.stroke();
      }
    }
    var knots = [[-23, 20, 4.5], [24, 32, 3.6], [-19, 38, 3]]; // knots with their own growth rings
    for (i = 0; i < knots.length; i++) {
      var kx = sx + knots[i][0], ky = by - knots[i][1], kr = knots[i][2];
      for (k = 3; k >= 1; k--) { ctx.fillStyle = k % 2 ? '#1a0b06' : '#5a3320'; ctx.beginPath(); ctx.ellipse(kx, ky, kr * k / 3, kr * 1.3 * k / 3, 0, 0, PI2); ctx.fill(); }
    }
    var gr = ctx.createRadialGradient(sx, by - 22, 1, sx, by - 22, 22); // glow from the caves at the far end
    gr.addColorStop(0, 'rgba(255,150,70,' + (0.55 * gl) + ')'); gr.addColorStop(1, 'rgba(120,60,200,0)');
    ctx.fillStyle = gr; ctx.fillRect(sx - 24, by - 48, 48, 50);
    // dappled light: shafts through knotholes and the canopy fall across the walls and floor
    ctx.fillStyle = 'rgba(255,230,150,' + (0.06 + 0.04 * Math.sin(t * 1.1)) + ')';
    ctx.beginPath(); ctx.moveTo(sx - 12, by - 52); ctx.lineTo(sx - 4, by - 52); ctx.lineTo(sx + 12, by - 2); ctx.lineTo(sx - 2, by - 2); ctx.closePath(); ctx.fill();
    for (i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(255,228,150,' + (0.16 + 0.1 * Math.sin(t * 1.4 + i * 2)) + ')';
      ctx.beginPath(); ctx.ellipse(sx + (i - 1.5) * 9 + Math.sin(i * 5) * 3, by - 3 - i * 3.5, 5 - i * 0.7, 2.2 - i * 0.3, 0, 0, PI2); ctx.fill();
    }
    // packed-earth floor receding into the trunk, crossed by roots
    var fg = ctx.createLinearGradient(0, by - 20, 0, by + 2);
    fg.addColorStop(0, '#1a1009'); fg.addColorStop(1, '#4a3a28');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(sx - 31, by + 2); ctx.lineTo(sx - 14, by - 20); ctx.lineTo(sx + 14, by - 20); ctx.lineTo(sx + 31, by + 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(14,7,3,0.7)'; ctx.lineWidth = 2;
    for (i = 0; i < 3; i++) {
      var ry = by - 3 - i * 6, rw = 29 - i * 5;
      ctx.beginPath(); ctx.moveTo(sx - rw, ry + 1); ctx.quadraticCurveTo(sx + (rnd() - 0.5) * 10, ry - 4, sx + rw, ry + 1); ctx.stroke();
    }
    ctx.lineWidth = 3.4; ctx.strokeStyle = '#1b0d08'; // thick roots crawling over the lip and around the mouth
    ctx.beginPath(); ctx.moveTo(sx - 36, by + 1); ctx.quadraticCurveTo(sx - 30, by - 22, sx - 26, by - 44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 36, by + 1); ctx.quadraticCurveTo(sx + 31, by - 20, sx + 27, by - 40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 36, by + 1); ctx.quadraticCurveTo(sx - 18, by + 5, sx - 6, by + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 36, by + 1); ctx.quadraticCurveTo(sx + 20, by + 6, sx + 8, by + 2); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#2a1209'; ctx.fillRect(sx - 32, sy - 3, 64, 3); // root lip
    var p = CC.state && CC.state.player;
    if (p && Math.hypot(p.x - (F.map ? F.map.stairs.x : 0), p.y - (F.map ? F.map.stairs.y : 0)) < 60) {
      ctx.font = 'bold 10px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe08a'; ctx.fillText(CC.EggQuest&&CC.EggQuest.tunnelUnlocked()?
        '[F] Tunnel to the Plains':'[F] Hollow sealed — rescue eggs',sx,sy+22); ctx.textAlign = 'left';
    }
  }

  // The eagle-egg quest belongs to a different tree off a genuine side trail.
  // The original giant hollow sequoia remains the tunnel towards the Plains.
  function drawEagleTree(ctx,sx,sy,t){
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.ellipse(sx,sy+3,52,15,0,0,PI2);ctx.fill();
    paintTrunk(ctx,sx,sy-8,66,175,18,1,seeded(6204),6);
    // Carved staircase beneath an ancient spread of branches, not a hollow tunnel.
    ctx.fillStyle='#251b18';ctx.beginPath();ctx.ellipse(sx,sy-24,29,44,0,0,PI2);ctx.fill();
    ctx.strokeStyle='#967252';ctx.lineWidth=2.3;
    for(var k=0;k<7;k++){
      var h=sy-8-k*8,width=25-k*2.2;
      ctx.beginPath();ctx.moveTo(sx-width,h);ctx.quadraticCurveTo(sx,h-2,sx+width,h-4);ctx.stroke();
    }
    ctx.strokeStyle='#638d64';ctx.lineWidth=3.2;
    for(k=0;k<3;k++){
      ctx.beginPath();ctx.moveTo(sx-34-k*5,sy+4);
      ctx.quadraticCurveTo(sx-43-k*3,sy-42,sx-31+k*7,sy-102);ctx.stroke();
    }
    // Sanctuary icon: little eggs in a crescent nest. Readable on mobile.
    ctx.fillStyle='#e3c788';ctx.beginPath();ctx.ellipse(sx,sy-49,10,3.6,0,0,Math.PI*2);ctx.fill();
    for(k=-1;k<=1;k++){
      ctx.fillStyle=k===0?'#fff1d0':'#e6d4b2';
      ctx.beginPath();ctx.ellipse(sx+k*5,sy-53,2.7,4.2,0,0,Math.PI*2);ctx.fill();
    }
    var g=ctx.createRadialGradient(sx,sy-42,0,sx,sy-42,49);
    g.addColorStop(0,'rgba(139,241,174,.38)');g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.fillRect(sx-49,sy-91,98,100);
    var p=CC.state&&CC.state.player;
    if(p&&F.map&&F.map.ascentEntrance&&
       Math.hypot(p.x-F.map.ascentEntrance.x,p.y-F.map.ascentEntrance.y)<90){
      ctx.fillStyle='#f2e2b4';ctx.font='bold 10px Georgia,serif';
      ctx.textAlign='center';ctx.fillText('[F] Climb to the eagle nest',sx,sy+25);
      ctx.textAlign='left';
    }
    ctx.restore();
  }
  function drawEagleSign(ctx,sx,sy){
    ctx.fillStyle='#523922';ctx.fillRect(sx-2,sy-26,4,30);
    ctx.fillStyle='#ba9362';ctx.beginPath();
    ctx.moveTo(sx-20,sy-37);ctx.lineTo(sx+10,sy-37);ctx.lineTo(sx+21,sy-31);
    ctx.lineTo(sx+10,sy-25);ctx.lineTo(sx-20,sy-25);ctx.closePath();ctx.fill();
    ctx.fillStyle='#281a11';ctx.textAlign='center';ctx.font='bold 7px Georgia,serif';
    ctx.fillText('EAGLE NEST',sx-1,sy-28.5);ctx.textAlign='left';
  }
  function drawPerson(ctx, sx, sy, t, c, pr) {
    var bob = Math.sin(t * 2 + pr.seed) * 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 8, 3.5, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = pr.cloak; ctx.beginPath(); ctx.moveTo(sx - 7, sy + 8); ctx.lineTo(sx - 5, sy - 6 + bob); ctx.lineTo(sx + 5, sy - 6 + bob); ctx.lineTo(sx + 7, sy + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d8b08a'; ctx.beginPath(); ctx.arc(sx, sy - 10 + bob, 4.5, 0, PI2); ctx.fill();
    ctx.fillStyle = pr.hair; ctx.beginPath(); ctx.arc(sx, sy - 12 + bob, 4.8, Math.PI, 0); ctx.fill();
    var p = CC.state && CC.state.player;
    if (p && Math.hypot(p.x - pr.x, p.y - pr.y) < 70) {
      ctx.font = 'bold 9px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9b0'; ctx.fillText(pr.name + '  [F] talk', sx, sy - 24); ctx.textAlign = 'left';
    }
  }
  function drawSmoke(ctx, sx, sy, t) {
    for (var i = 0; i < 8; i++) {
      var a = (t * 0.3 + i / 8) % 1, x = sx + Math.sin(a * 5 + i) * 9 * a + a * 10, y = sy - a * 90, r = 3 + a * 12;
      ctx.fillStyle = 'rgba(150,155,160,' + (0.34 * (1 - a)) + ')'; ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
    }
    ctx.fillStyle = '#3a2a20'; ctx.fillRect(sx - 5, sy - 4, 10, 12); // chimney
  }
  function drawLamp(ctx, sx, sy, t) {
    ctx.fillStyle = '#2a1c12'; ctx.fillRect(sx - 1.5, sy - 30, 3, 32);
    var gl = 0.7 + 0.3 * Math.sin(t * 3 + sx);
    ctx.fillStyle = 'rgba(170,235,190,' + gl + ')'; ctx.beginPath(); ctx.arc(sx, sy - 33, 4, 0, PI2); ctx.fill();
  }
  function drawDebris(ctx, sx, sy, t, c, pr) {
    ctx.fillStyle = pr.col; ctx.fillRect(sx - pr.w / 2, sy - 3, pr.w, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(sx - pr.w / 2, sy + 2, pr.w, 2);
  }
  function drawWeb(ctx, sx, sy) {
    ctx.strokeStyle = 'rgba(210,215,220,0.35)'; ctx.lineWidth = 1;
    for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 14, sy + i * 5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + i * 5, sy + 14); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI / 2); ctx.stroke(); ctx.beginPath(); ctx.arc(sx, sy, 13, 0, Math.PI / 2); ctx.stroke();
  }
  function twig(ctx, sx, sy, dx, h) { // short dead branch the prop hangs from, sticking out of the trunk
    ctx.strokeStyle = '#1b0d08'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx - Math.sign(dx) * 12, sy - h + 3); ctx.quadraticCurveTo(sx, sy - h - 4, sx + dx, sy - h); ctx.stroke(); ctx.lineCap = 'butt';
  }
  function batShape(ctx, x, y, span, flap) { // wings spread, seen from the front
    ctx.fillStyle = '#0a0709';
    ctx.beginPath(); ctx.ellipse(x, y, 2.6, 4, 0, 0, PI2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 1, y - 1); ctx.quadraticCurveTo(x - span * 0.6, y - flap - 3, x - span, y - flap + 2); ctx.lineTo(x - span * 0.6, y + 1); ctx.lineTo(x - span * 0.3, y + 3); ctx.lineTo(x - 1, y + 3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 1, y - 1); ctx.quadraticCurveTo(x + span * 0.6, y - flap - 3, x + span, y - flap + 2); ctx.lineTo(x + span * 0.6, y + 1); ctx.lineTo(x + span * 0.3, y + 3); ctx.lineTo(x + 1, y + 3); ctx.fill();
  }
  // a bat hanging upside down from a twig; startles when the player comes near, flutters off, and drifts back after a while
  function drawBat(ctx, sx, sy, t, cam, pr) {
    var p = CC.state && CC.state.player;
    if (!pr.flee && p && Math.hypot(p.x - pr.x, p.y - pr.y) < 95) pr.flee = t;
    var hx = sx + pr.dx, el = pr.flee ? t - pr.flee : -1;
    if (el > 16) { pr.flee = 0; el = -1; }
    if (el < 0) {
      twig(ctx, sx, sy, pr.dx, pr.h);
      var y = sy - pr.h + 8, tw = Math.sin(t * 0.9 + pr.seed) > 0.96 ? 3 : 0;
      ctx.fillStyle = '#0a0709'; ctx.beginPath(); ctx.ellipse(hx, y + 2, 3, 5, 0, 0, PI2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx - 2, y); ctx.lineTo(hx - 5 - tw, y + 8); ctx.lineTo(hx, y + 9); ctx.lineTo(hx + 5 + tw, y + 8); ctx.lineTo(hx + 2, y); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx - 3, y + 8); ctx.lineTo(hx - 4, y + 12); ctx.lineTo(hx - 1, y + 9); ctx.moveTo(hx + 3, y + 8); ctx.lineTo(hx + 4, y + 12); ctx.lineTo(hx + 1, y + 9); ctx.fill();
      ctx.fillStyle = 'rgba(255,60,60,0.85)'; ctx.fillRect(hx - 2, y + 5, 1.5, 1.5); ctx.fillRect(hx + 1, y + 5, 1.5, 1.5);
      return;
    }
    twig(ctx, sx, sy, pr.dx, pr.h);
    if (el < 3.2) {
      ctx.save(); ctx.globalAlpha = 1 - el / 3.2;
      batShape(ctx, hx + Math.cos(pr.ang) * el * 70 + Math.sin(el * 9) * 4, sy - pr.h + 8 - el * 38 + Math.sin(el * 7) * 6, 9, Math.sin(el * 34) * 6);
      ctx.restore();
    }
  }
  // a spider web hanging from a branch, a spider bobbing on its thread
  function drawHangWeb(ctx, sx, sy, t, cam, pr) {
    twig(ctx, sx, sy, pr.dx, pr.h);
    var ax = sx + pr.dx, ay = sy - pr.h, d = Math.sign(pr.dx) || 1, i;
    ctx.strokeStyle = 'rgba(215,220,225,0.5)'; ctx.lineWidth = 1;
    for (i = 0; i < 5; i++) { // threads fanning down from the branch, swaying a little
      var len = 22 + (i % 3) * 12 + pr.seed % 5, ex = ax + (i - 2) * 7 * d + Math.sin(t * 1.3 + i + pr.seed) * 1.5;
      ctx.beginPath(); ctx.moveTo(ax + (i - 2) * 2 * d, ay); ctx.lineTo(ex, ay + len); ctx.stroke();
    }
    for (i = 1; i < 4; i++) { // cross strands make a sagging net
      ctx.beginPath(); ctx.moveTo(ax - 14 * d, ay + i * 10); ctx.quadraticCurveTo(ax, ay + i * 10 + 7, ax + 14 * d, ay + i * 10 + 1); ctx.stroke();
    }
    var sp = ay + 30 + Math.sin(t * 0.8 + pr.seed) * 6;
    ctx.beginPath(); ctx.moveTo(ax + 6 * d, ay + 3); ctx.lineTo(ax + 6 * d, sp); ctx.stroke();
    ctx.fillStyle = '#120a0c'; ctx.beginPath(); ctx.arc(ax + 6 * d, sp + 3, 2.6, 0, PI2); ctx.arc(ax + 6 * d, sp, 1.6, 0, PI2); ctx.fill();
    ctx.strokeStyle = '#120a0c'; ctx.beginPath();
    for (i = -1; i <= 1; i += 2) { ctx.moveTo(ax + 6 * d, sp + 2); ctx.lineTo(ax + 6 * d + i * 5, sp - 1); ctx.moveTo(ax + 6 * d, sp + 3); ctx.lineTo(ax + 6 * d + i * 5, sp + 6); }
    ctx.stroke();
  }
  function drawSign(ctx, sx, sy) {
    ctx.fillStyle = '#2a1c12'; ctx.fillRect(sx - 1.5, sy - 22, 3, 24);
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(sx - 12, sy - 26, 24, 11);
    ctx.fillStyle = '#2a1c12'; ctx.font = 'bold 7px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('TURN BACK', sx, sy - 18); ctx.textAlign = 'left';
  }
  function drawHearth(ctx, sx, sy, t) {
    ctx.fillStyle = '#2a2420'; ctx.fillRect(sx - 12, sy - 6, 24, 12);
    for (var i = 0; i < 3; i++) {
      var f = Math.sin(t * 10 + i * 2) * 2;
      ctx.fillStyle = i === 1 ? '#ffd36b' : '#ff7a2a'; ctx.beginPath(); ctx.moveTo(sx - 6 + i * 6, sy - 2); ctx.lineTo(sx - 8 + i * 6 + f, sy - 14 - i % 2 * 3); ctx.lineTo(sx - 3 + i * 6, sy - 2); ctx.closePath(); ctx.fill();
    }
  }
  function drawTable(ctx, sx, sy) {
    ctx.fillStyle = '#6a4626'; ctx.fillRect(sx - 14, sy - 6, 28, 12); ctx.fillStyle = '#8a6236'; ctx.fillRect(sx - 14, sy - 6, 28, 3);
    ctx.fillStyle = '#d8d0b8'; ctx.fillRect(sx - 8, sy - 8, 4, 3); ctx.fillRect(sx + 4, sy - 8, 4, 3);
  }

  /* ---------- generation ---------- */
  function build(rng) {
    var N = W * H, kind = new Uint8Array(N), tiles = new Uint8Array(N), res = new Uint8Array(N), i, x, y;
    function at(tx, ty) { return ty * W + tx; }
    function inb(tx, ty) { return tx >= 2 && ty >= 2 && tx < W - 2 && ty < H - 2; }
    function reserve(tx0, ty0, tx1, ty1) { for (var yy = ty0; yy <= ty1; yy++) for (var xx = tx0; xx <= tx1; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) res[at(xx, yy)] = 1; }
    function disc(cx, cy, r, fn) { for (var yy = Math.floor(cy - r); yy <= cy + r; yy++) for (var xx = Math.floor(cx - r); xx <= cx + r; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H && (xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r) fn(xx, yy); }

    var spawn = ctr(W >> 1, 5), stx = 22 + Math.floor(rng() * (W - 44)), sty = H - 9;
    // winding old trail from the gate to the hollow tree; trees stay off it and lamps mark it
    var pts = [{ x: spawn.tx, y: spawn.ty }], n = 10, k, lamps = [], samples = [];
    for (k = 1; k < n; k++) pts.push({ x: clamp(pts[0].x + (stx - pts[0].x) * k / n + (rng() - 0.5) * 34, 12, W - 12), y: 5 + (sty - 5) * k / n });
    pts.push({ x: stx, y: sty });
    for (k = 0; k < pts.length - 1; k++) {
      var a = pts[k], b = pts[k + 1], steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
      for (i = 0; i <= steps; i++) {
        var px = a.x + (b.x - a.x) * i / steps, py = a.y + (b.y - a.y) * i / steps;
        disc(px, py, 3.4, function (xx, yy) { res[at(xx, yy)] = 1; });
        disc(px, py, 2.5, function (xx, yy) { kind[at(xx, yy)] = 2; }); // wide dirt road, ragged at the edges
        disc(px, py, 3.2, function (xx, yy) { if (hashHalf(xx, yy)) kind[at(xx, yy)] = 2; });
        var sl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        samples.push({ x: px, y: py, nx: -(b.y - a.y) / sl, ny: (b.x - a.x) / sl });
      }
      if (k > 0 && k % 2 === 0) lamps.push({ x: Math.round(a.x) + 2, y: Math.round(a.y) });
    }
    function hashHalf(xx, yy) { return CC.Realm.hash(xx, yy) < 0.7; }
    reserve(spawn.tx - 5, spawn.ty - 3, spawn.tx + 5, spawn.ty + 5);
    reserve(stx - 6, sty - 7, stx + 6, sty + 4);

    // narrow, winding side trails (kind 6, near-black) branching off the road: dead ends lined with bat and web trees
    var trails = [], tr, sd, ang0;
    for (tr = 0; tr < 7 && trails.length < 5; tr++) {
      var sm = samples[Math.floor(samples.length * (0.12 + tr * 0.125))];
      if (!sm) continue;
      sd = tr % 2 ? -1 : 1; ang0 = Math.atan2(sm.ny * sd, sm.nx * sd); // leaves the road at a right angle
      var trail = [], wob = 0, hx = sm.x + sm.nx * sd * 2, hy = sm.y + sm.ny * sd * 2, steps = 24 + Math.floor(rng() * 14), st;
      for (st = 0; st < steps; st++) {
        wob = clamp(wob + (rng() - 0.5) * 0.7, -0.9, 0.9);
        var hd = ang0 + wob * (st > 4 ? 1 : 0.2);
        hx += Math.cos(hd); hy += Math.sin(hd);
        if (hx < 7 || hx > W - 8 || hy < 9 || hy > H - 13) break;
        if (st > 5 && res[at(Math.floor(hx), Math.floor(hy))]) break;
        trail.push({ x: hx, y: hy, nx: -Math.sin(hd), ny: Math.cos(hd) });
      }
      if (trail.length < 10) continue;
      trail.forEach(function (pt) {
        disc(pt.x, pt.y, 1.15, function (xx, yy) { if (kind[at(xx, yy)] !== 2) kind[at(xx, yy)] = 6; });
      });
      trail.forEach(function (pt) { disc(pt.x, pt.y, 2.0, function (xx, yy) { res[at(xx, yy)] = 1; }); });
      trails.push(trail);
    }

    if (trails.length < 3) return null; // need at least three side trails; generate() retries with another seed

    // cabins: one lit, three run-down; footprint + 2 tile margin must be clear and off the trail
    var cabins = [];
    function fits(x0, y0, w, h) {
      if (x0 < 6 || y0 < 10 || x0 + w > W - 6 || y0 + h > H - 14) return false;
      for (var yy = y0 - 3; yy <= y0 + h + 3; yy++) for (var xx = x0 - 3; xx <= x0 + w + 3; xx++) if (res[at(xx, yy)]) return false;
      return true;
    }
    function place(w, h, lit, ymin, ymax) {
      for (var t = 0; t < 400; t++) {
        var cx = 8 + Math.floor(rng() * (W - 16 - w)), cy = Math.floor(ymin + rng() * (ymax - ymin));
        if (!fits(cx, cy, w, h)) continue;
        var c = { x0: cx, y0: cy, w: w, h: h, lit: lit, door: cx + 1 + Math.floor(rng() * (w - 2)) };
        reserve(cx - 3, cy - 3, cx + w + 3, cy + h + 3); cabins.push(c); return c;
      }
      return null;
    }
    place(8, 6, true, H * 0.28, H * 0.65);
    for (i = 0; i < 3; i++) place(6, 5, false, 16, H - 24);
    var chests = [], props = [], lights = [], npcs = [];
    cabins.forEach(function (c) {
      var xx, yy;
      for (yy = c.y0; yy < c.y0 + c.h; yy++) for (xx = c.x0; xx < c.x0 + c.w; xx++) {
        var edge = xx === c.x0 || yy === c.y0 || xx === c.x0 + c.w - 1 || yy === c.y0 + c.h - 1;
        kind[at(xx, yy)] = edge ? (c.lit ? 4 : 8) : 1; tiles[at(xx, yy)] = edge ? 1 : 0;
      }
      kind[at(c.door, c.y0 + c.h - 1)] = 1; tiles[at(c.door, c.y0 + c.h - 1)] = 0; // doorway on the south wall
      var mx = (c.x0 + c.w / 2) * T, my = (c.y0 + c.h / 2) * T;
      if (c.lit) {
        lights.push({ x: mx, y: my + 10, r: 190, color: '255,160,60', inten: 0.95, flicker: 0.08 });
        lights.push({ x: c.door * T + T / 2, y: (c.y0 + c.h) * T + 6, r: 90, color: '255,170,80', inten: 0.7, flicker: 0.05 });
        props.push({ x: (c.x0 + c.w - 2) * T + 16, y: c.y0 * T + 8, sortY: 400, draw: drawSmoke });
        props.push({ x: mx, y: c.y0 * T + T * 1.9, draw: drawHearth });
        props.push({ x: mx - 40, y: my + 18, draw: drawTable });
        var people = [
          { name: 'Marta the Trapper', cloak: '#6a3a2a', hair: '#cfc8c0', lines: ['Sit, sit. Warm yourself. Nothing out there is kind to the living.', 'Bears with burning eyes, ravens that talk in dead voices. Keep your light close.', 'Find the hollow sequoia in the south. The caves breathe from it.'] },
          { name: 'Old Fenn', cloak: '#3a4a5a', hair: '#e8e8e8', lines: ['The vines remember where you stood. Do not stand still near the big roots.', 'Horrors blink behind you. Turn, strike, and do not follow them into the dark.'] },
          { name: 'Little Wren', cloak: '#5a2a4a', hair: '#3a2a1a', lines: ['Mama says the smoke keeps the ghosts away. Mostly.', 'You are very brave. Or very lost.'] }
        ];
        people.forEach(function (pp, j) {
          var px = mx + (j - 1) * 46 + 8, py = my + (j === 1 ? -8 : 14);
          var o = { x: px, y: py, name: pp.name, cloak: pp.cloak, hair: pp.hair, lines: pp.lines, line: 0, seed: j * 1.7, draw: drawPerson, npc: true };
          props.push(o); npcs.push(o);
        });
      } else {
        for (i = 0; i < 4; i++) props.push({ x: c.x0 * T + T * (1 + rng() * (c.w - 2)), y: c.y0 * T + T * (1.4 + rng() * (c.h - 2.4)), w: 8 + rng() * 14, col: '#3a2c1e', draw: drawDebris });
        props.push({ x: (c.x0 + 1) * T + 8, y: (c.y0 + 1) * T + 6, draw: function (ctx, sx, sy) { drawWeb(ctx, sx - 14, sy - 12); } });
        var ch = ctr(c.x0 + Math.floor(c.w / 2), c.y0 + Math.floor(c.h / 2)); ch.opened = false; ch.tier = Math.min(1, rng() < 0.35 ? 1 : 0); chests.push(ch);
        for (i = 0; i < 2; i++) { // the roof and walls have given way
          var gx = c.x0 + (rng() < 0.5 ? 0 : c.w - 1), gy = c.y0 + 1 + Math.floor(rng() * (c.h - 2));
          kind[at(gx, gy)] = 0; tiles[at(gx, gy)] = 0;
        }
      }
    });

    // a line of giants on both sides of the road, and gnarled trees walling each side trail (never on a path)
    function isolated(tx, ty) {
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var nx = tx + dx, ny = ty + dy, ni = at(nx, ny), kk = kind[ni], bd = nx < 2 || ny < 2 || nx >= W - 2 || ny >= H - 2;
        if ((tiles[ni] && !bd) || kk === 4 || kk === 7 || kk === 8 || kk === 9) return false;
      }
      return true;
    }
    function plantTree(tx, ty) {
      if (!inb(tx, ty) || tx < 3 || ty < 3 || tx >= W - 3 || ty >= H - 3 || res[at(tx, ty)] || kind[at(tx, ty)] !== 0 || !isolated(tx, ty)) return false;
      kind[at(tx, ty)] = 3; tiles[at(tx, ty)] = 1; return true;
    }
    var si, sj;
    for (si = 4; si < samples.length; si += 6) for (sj = -1; sj <= 1; sj += 2) {
      var off = 4.5 + rng() * 0.9, sp0 = samples[si];
      plantTree(Math.round(sp0.x + sp0.nx * sj * off + (rng() - 0.5)), Math.round(sp0.y + sp0.ny * sj * off + (rng() - 0.5)));
    }
    var nbats = 0, nwebs = 0;
    trails.forEach(function (trail, ti) {
      var made = 0;
      for (si = 2; si < trail.length; si += 2) for (sj = -1; sj <= 1; sj += 2) {
        var pt = trail[si], tx = Math.round(pt.x + pt.nx * sj * 2.9), ty = Math.round(pt.y + pt.ny * sj * 2.9);
        if (!plantTree(tx, ty)) continue;
        var dir = -sj * pt.nx >= 0 ? 1 : -1; // hang out over the trail
        var seed = (ti * 31 + made * 7) % 11, px = tx * T + T / 2, py = (ty + 1) * T;
        if (made % 3 === 0) { props.push({ x: px, y: py, sortY: 4, front: true, dx: dir * (14 + seed), h: 60 + seed * 6, seed: seed, ang: -0.6 - rng() * 1.8, flee: 0, draw: drawBat }); nbats++; }
        else if (made % 3 === 1) { props.push({ x: px, y: py, sortY: 4, front: true, dx: dir * (16 + seed), h: 70 + seed * 5, seed: seed, draw: drawHangWeb }); nwebs++; }
        made++;
      }
    });

    // trees: sparse giants, never touching each other (8-neighbourhood) so the wood always stays walkable
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var i2 = at(x, y), border = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
      if (border) { kind[i2] = 3; tiles[i2] = 1; continue; }
      if (res[i2] || kind[i2] !== 0 && kind[i2] !== 2) continue;
      var d = 0.05 + 0.06 * Math.abs(Math.sin(x * 0.11) * Math.cos(y * 0.09)); // denser groves and thinner glades
      if (rng() > d) continue;
      var near = false, dx2, dy2;
      for (dy2 = -1; dy2 <= 1 && !near; dy2++) for (dx2 = -1; dx2 <= 1; dx2++) if (tiles[at(x + dx2, y + dy2)] && !(x + dx2 < 2 || y + dy2 < 2 || x + dx2 >= W - 2 || y + dy2 >= H - 2) || (kind[at(x + dx2, y + dy2)] >= 4 && kind[at(x + dx2, y + dy2)] !== 5 && kind[at(x + dx2, y + dy2)] !== 6)) { near = true; break; }
      if (!near) { kind[i2] = 3; tiles[i2] = 1; }
    }

    // the hollow sequoia: a 3x2 trunk whose art is drawn by one prop; the cave mouth is the stairs just below it
    for (y = sty - 3; y <= sty - 2; y++) for (x = stx - 1; x <= stx + 1; x++) { kind[at(x, y)] = 9; tiles[at(x, y)] = 1; }
    for (y = sty - 1; y <= sty + 1; y++) for (x = stx - 2; x <= stx + 2; x++) { if (kind[at(x, y)] === 3 || kind[at(x, y)] === 9) { kind[at(x, y)] = 0; tiles[at(x, y)] = 0; } }
    for (y = sty - 1; y <= sty + 1; y++) for (x = stx - 2; x <= stx + 2; x++) { if (!tiles[at(x, y)] && kind[at(x, y)] !== 5) kind[at(x, y)] = 10; } // art only: packed-earth tunnel floor, collision untouched
    var stairs = ctr(stx, sty - 1);
    props.push({ x: stairs.x, y: (sty - 2) * T + T, sortY: 0, front: true, draw: function (ctx, sx, sy, t) { drawHollow(ctx, sx, sy, t); } });
    lights.push({ x: stairs.x, y: stairs.y - 10, r: 130, color: '255,130,70', inten: 0.55, flicker: 0.1 });
    // A separately signposted side path leads to the Ancient Tree ascent.
    // Nothing moves the main hollow or changes its tunnel destination.
    var side = trails.filter(function(a){return a.length >= 10;})
      .sort(function(a,b){
        // Place the quest spur partway through the forest, rather than right
        // beside the spawn or the main tunnel at the far end.
        var aa=a[a.length-1],bb=b[b.length-1],targetY=H*.42;
        return Math.abs(aa.y-targetY)-Math.abs(bb.y-targetY);
      })[0];
    if(!side)return null;
    var tip=side[side.length-1],sx0=Math.round(tip.x),sy0=Math.round(tip.y);
    // Small walkable platform at the end of the spur, protected from tree walls.
    disc(sx0,sy0,1.7,function(xx,yy){
      if(xx>=3&&yy>=3&&xx<W-3&&yy<H-3){
        tiles[at(xx,yy)]=0;kind[at(xx,yy)]=6;res[at(xx,yy)]=1;
      }
    });
    var ascentEntrance=ctr(sx0,sy0);
    props.push({x:ascentEntrance.x,y:ascentEntrance.y-4,sortY:1,
      draw:function(ctx,sx,sy,tm){drawEagleTree(ctx,sx,sy,tm);}});
    var first=side[0];
    props.push({x:first.x*T+16,y:first.y*T+16,draw:drawEagleSign});
    lights.push({x:ascentEntrance.x,y:ascentEntrance.y-36,r:130,
      color:'137,221,157',inten:.65,flicker:.08});

    props.push({ x: spawn.x + 40, y: spawn.y + 30, draw: drawSign });
    lights.push({ x: spawn.x, y: spawn.y, r: 150, color: '255,190,110', inten: 0.6, flicker: 0.06 });
    lamps.forEach(function (l) {
      props.push({ x: l.x * T + 16, y: l.y * T + 16, draw: drawLamp });
      lights.push({ x: l.x * T + 16, y: l.y * T - 14, r: 120, color: '150,230,180', inten: 0.6, flicker: 0.04 });
    });

    // reachability: the start must reach the hollow, every chest and the lit cabin's door
    var seen = new Uint8Array(N), q = [at(spawn.tx, spawn.ty)], qi = 0;
    seen[q[0]] = 1;
    while (qi < q.length) {
      var c0 = q[qi++], cx0 = c0 % W, cy0 = (c0 / W) | 0, nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var m = 0; m < 4; m++) { var nx = cx0 + nb[m][0], ny = cy0 + nb[m][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; var ni = at(nx, ny); if (seen[ni] || tiles[ni]) continue; seen[ni] = 1; q.push(ni); }
    }
    var ok = seen[at(stairs.tx, stairs.ty)] === 1 &&
      seen[at(ascentEntrance.tx,ascentEntrance.ty)] === 1, ci;
    for (ci = 0; ci < chests.length; ci++) if (!seen[at(chests[ci].tx, chests[ci].ty)]) ok = false;
    cabins.forEach(function (c) { if (c.lit && !seen[at(c.door, c.y0 + c.h)]) ok = false; });
    if (!ok) return null;

    // monster spawn points on a loose grid (never near the gate); vines root beside trees
    var spawns = [], gx2, gy2;
    function freeSpot(cx, cy, r) { for (var t = 0; t < 12; t++) { var tx = clamp(cx + Math.floor((rng() - 0.5) * r), 3, W - 4), ty = clamp(cy + Math.floor((rng() - 0.5) * r), 3, H - 4); if (!tiles[at(tx, ty)] && seen[at(tx, ty)] && kind[at(tx, ty)] !== 1) return ctr(tx, ty); } return null; }
    for (gy2 = 12; gy2 < H - 4; gy2 += 10) for (gx2 = 6; gx2 < W - 4; gx2 += 10) {
      var cnt = rng() < 0.55 ? 1 : rng() < 0.4 ? 2 : 0, j;
      for (j = 0; j < cnt; j++) {
        var sp = freeSpot(gx2 + 5, gy2 + 5, 10);
        if (!sp || Math.hypot(sp.x - spawn.x, sp.y - spawn.y) < 360) continue;
        var rr = rng(), type = rr < 0.26 ? 'bear' : rr < 0.52 ? 'raven' : rr < 0.7 ? 'ghost' : rr < 0.86 ? 'horror' : 'vine';
        if (type === 'vine') { // root beside a trunk
          var found = null, tt;
          for (tt = 0; tt < 30 && !found; tt++) { var vx = clamp(Math.floor(sp.tx + (rng() - 0.5) * 8), 3, W - 4), vy = clamp(Math.floor(sp.ty + (rng() - 0.5) * 8), 3, H - 4); if (!tiles[at(vx, vy)] && seen[at(vx, vy)] && kind[at(vx, vy)] === 0 && tiles[at(vx, vy - 1)]) found = ctr(vx, vy); }
          if (!found) continue; sp = found;
        }
        spawns.push({ x: sp.x, y: sp.y, type: type });
      }
    }
    var map = CC.Realm.create({
      name: 'Giant Forest', w: W, h: H, kind: kind, tiles: tiles, spawn: spawn, stairs: stairs, chests: chests, enemySpawns: spawns, props: props, lights: lights,
      ambient: '5,9,14,0.6', playerLight: 190, viewR: 230, fog: 0.15, ground: ground, detail: detail, drawSolid: drawSolid
    });
    map.npcs=npcs;map.cabins=cabins;map.floor=1;map.trails=trails;
    map.ascentEntrance=ascentEntrance;map.mainPath=samples;map.bats=nbats;map.webs=nwebs;
    return map;
  }

  F.generate = function (fixedSeed) {
    var seed = Number.isFinite(fixedSeed) ? (fixedSeed >>> 0) :
      (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, map = null, tries = 0;
    while (!map && tries < 12) { map = build(seeded(seed + tries * 7919)); tries++; }
    if (!map) throw new Error('Forest generation failed');
    map.seed = seed;
    F.map = map; F.titleStart = Date.now(); F.speech = null;
    return map;
  };

  F.interact = function () {
    var s = CC.state, p = s && s.player, m = F.map;
    if (!p || !m || CC.Dungeon !== m) return false;
    var best = null, bd = 56, i;
    for (i = 0; i < m.npcs.length; i++) { var n = m.npcs[i], d = Math.hypot(p.x - n.x, p.y - n.y); if (d < bd) { bd = d; best = n; } }
    if (!best) return false;
    var text = best.lines[best.line % best.lines.length]; best.line++;
    F.speech = { name: best.name, text: text, t0: Date.now() };
    if (!best.healed) {
      best.healed = true; p.hp = p.maxHp; p.mana = p.maxMana;
      if (CC.fx && CC.fx.text) CC.fx.text(p.x, p.y - 16, 'Warmed by the fire', '#ffb060', 11);
    }
    return true;
  };

  function wrapLines(ctx, text, maxW) {
    var words = String(text).split(' '), lines = [], line = '';
    for (var i = 0; i < words.length; i++) { var t = line ? line + ' ' + words[i] : words[i]; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = words[i]; } else line = t; }
    if (line) lines.push(line);
    return lines;
  }
  F.drawOverlay = function (ctx, Wd, Hd) {
    var now = Date.now(), el = (now - F.titleStart) / 1000;
    if (el >= 0 && el < 7) { // ghostly title: fades in slowly, drifts, fades out
      var a = el < 2.5 ? el / 2.5 : el < 4.5 ? 1 : Math.max(0, 1 - (el - 4.5) / 2.5);
      ctx.save();
      ctx.globalAlpha = a * (0.85 + 0.15 * Math.sin(now / 260));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var sz = Math.min(44, Wd / 8.2), yy = Hd * 0.3 - el * 3;
      ctx.font = 'italic ' + sz + 'px Georgia, "Palatino Linotype", serif';
      ctx.shadowColor = 'rgba(150,220,230,0.9)'; ctx.shadowBlur = 18 + 8 * Math.sin(now / 400);
      ctx.fillStyle = 'rgba(205,235,240,0.95)';
      ctx.fillText('G i a n t   F o r e s t', Wd / 2 + Math.sin(now / 900) * 3, yy);
      ctx.shadowBlur = 0; ctx.globalAlpha *= 0.35; ctx.fillText('G i a n t   F o r e s t', Wd / 2 + 3 + Math.sin(now / 700) * 4, yy + 3);
      ctx.restore();
    }
    var sp = F.speech;
    if (sp) {
      var age = (now - sp.t0) / 1000, p = CC.state && CC.state.player;
      if (age > 6 || (p && F.map && F.map.npcs.every(function (n) { return Math.hypot(p.x - n.x, p.y - n.y) > 110; }))) { F.speech = null; return; }
      ctx.save();
      ctx.font = '12px Georgia, serif';
      var lines = wrapLines(ctx, sp.text, Wd - 70), bh = 30 + lines.length * 16, by = Hd - 190 - bh;
      ctx.fillStyle = 'rgba(14,10,8,0.88)'; ctx.fillRect(20, by, Wd - 40, bh);
      ctx.strokeStyle = '#a06a30'; ctx.lineWidth = 1.5; ctx.strokeRect(20.5, by + 0.5, Wd - 41, bh - 1);
      ctx.fillStyle = '#ffd890'; ctx.font = 'bold 12px Georgia, serif'; ctx.textAlign = 'left'; ctx.fillText(sp.name, 32, by + 16);
      ctx.fillStyle = '#f0e6d0'; ctx.font = '12px Georgia, serif';
      for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], 32, by + 34 + i * 16);
      ctx.restore();
    }
  };

  /* ---------- monsters ---------- */
  var E = CC.Enemies;
  function R() { return Math.random(); }
  function mv(e, dx, dy) { var D = CC.Dungeon, r = D && D.moveWithCollision ? D.moveWithCollision(e, dx, dy) : (e.x += dx, e.y += dy, null); return r && (r.hitX || r.hitY); }
  function hurt(p, e, amt) { // same rules as the cave's hurtPlayer: armour, brief i-frames, floating number
    if (!p || p.hp <= 0 || p.invuln > 0) return 0;
    var defense=(p.armor || (p.stats&&p.stats.armor) || 0) * (p.bearRoarT>0?.7:1);
    var dmg = Math.max(1, Math.round(amt * 100 / (100 + defense)));
    p.hp -= dmg; p.invuln = 0.45; p.hurtFlash = 0.2;
    if (CC.fx) { if (CC.fx.shake) CC.fx.shake(3); if (CC.fx.text) CC.fx.text(p.x, p.y - 14, '-' + dmg, '#ff5a5a', 12); }
    return dmg;
  }

  var BRAIN = {
    bear: function (e, dt, p, d, ang, f, sp) {
      // Distinct attacks: frightening roar, short-range tooth snap, full-bodied lunge.
      // All attacks telegraph first; defense debuff is 30% for exactly 10 gameplay seconds.
      e.roarCd=Math.max(0,(e.roarCd||0)-dt);
      e.roarFx=Math.max(0,(e.roarFx||0)-dt);
      e.biteFx=Math.max(0,(e.biteFx||0)-dt);
      e.lungeFx=Math.max(0,(e.lungeFx||0)-dt);
      var rage=e.hp<e.maxHp*.4?1.25:1,cx=Math.cos(ang),cy=Math.sin(ang);
      function begin(kind,t) {
        e.state='telegraph';e.t=t;e.ang=ang;e.atk=kind;e.biteHit=false;
        e.tele=kind==='roar'?{kind:'circle',rad:145,max:t}:
          {kind:'line',ang:ang,len:kind==='lunge'?132:44,max:t};
      }
      if(e.state==='idle'){
        if(d>e.r+(p.r||9)+5)mv(e,cx*sp*rage,cy*sp*rage);
        if(e.cd<=0){
          if((!e.roaredOnce||e.roarCd<=0&&R()<.35)&&d<165){
            e.roaredOnce=true;e.roarCd=15;
            begin('roar',.7);
          }else if(d<53)begin('bite',.27);
          else if(d<192)begin('lunge',.57/rage);
        }
      }else if(e.state==='telegraph'){
        if((e.t-=dt)<=0){
          e.tele=null;e.state='act';
          if(e.atk==='roar'){
            e.t=.58;e.roarFx=.85;
            if(d<148){
              p.bearRoarT=10;
              if(CC.fx&&CC.fx.text)CC.fx.text(p.x,p.y-24,'ARMOR -30% (10s)','#ec8290',12);
            }
            if(CC.fx){if(CC.fx.shake)CC.fx.shake(5);if(CC.fx.burst)CC.fx.burst(e.x,e.y,'#b7a28b',18,115);}
          }else if(e.atk==='bite'){e.t=.26;e.biteFx=.34;}
          else{e.t=.48;e.lungeFx=.51;if(CC.fx&&CC.fx.shake)CC.fx.shake(2);}
        }
      }else if(e.state==='act'){
        if(e.atk==='roar'){
          e.dangerous=false;
        }else if(e.atk==='bite'){
          // Both snapping jaws and the bite itself have their own animation window.
          mv(e,Math.cos(e.ang)*115*f*dt,Math.sin(e.ang)*115*f*dt);
          var bd=Math.hypot(p.x-e.x,p.y-e.y);
          if(!e.biteHit&&bd<e.r+(p.r||9)+13){
            e.biteHit=true;e.contact=.75;
            if(hurt(p,e,e.dmg*1.12)){
              if(CC.fx&&CC.fx.burst)CC.fx.burst(p.x,p.y,'#b41c30',9,70);
            }
          }
          e.dangerous=false;
        }else{
          e.dangerous=true;
          var wall=mv(e,Math.cos(e.ang)*295*f*dt,Math.sin(e.ang)*295*f*dt);
          if(wall){e.t=0;if(CC.fx&&CC.fx.shake)CC.fx.shake(3);}
        }
        if((e.t-=dt)<=0){
          e.state='recover';e.t=e.atk==='roar'?.88:e.atk==='bite'?.54:.73;
          e.dangerous=false;
        }
      }else if(e.state==='recover'){
        if((e.t-=dt)<=0){e.state='idle';e.cd=e.atk==='roar'?2.3:1.0+R()*.5;}
      }else e.state='idle';
    },
    raven: function (e, dt, p, d, ang, f, sp) {
      if (e.state === 'idle') {
        var wob = Math.sin(e.anim * 5) * 1.1;
        mv(e, Math.cos(ang + wob) * sp, Math.sin(ang + wob) * sp);
        if (e.cd <= 0 && d < 190) this._tele(e, 'dash', 0.3, ang);
      } else if (e.state === 'telegraph') { if ((e.t -= dt) <= 0) { e.state = 'act'; e.t = 0.36; e.tele = null; } }
      else if (e.state === 'act') { e.dangerous = true; mv(e, Math.cos(e.ang) * 300 * f * dt, Math.sin(e.ang) * 300 * f * dt); if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.7; } }
      else if (e.state === 'recover') { mv(e, -Math.cos(ang) * sp * 1.1, -Math.sin(ang) * sp * 1.1); if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 1.0 + R() * 1.2; } }
      else e.state = 'idle';
    },
    vine: function (e, dt, p, d, ang) { // rooted: lashes anything that steps inside its reach, and drags the target in
      if (e.state === 'idle') { if (e.cd <= 0 && d < 112) this._tele(e, 'strike', 0.5, ang); }
      else if (e.state === 'telegraph') {
        if ((e.t -= dt) <= 0) {
          e.state = 'act'; e.t = 0.3; e.tele = null; e.lash = 0.3;
          var da = Math.atan2(Math.sin(e.ang - Math.atan2(p.y - e.y, p.x - e.x)), Math.cos(e.ang - Math.atan2(p.y - e.y, p.x - e.x)));
          if (d < 116 && Math.abs(da) < 0.7 && hurt(p, e, e.dmg)) { // hit: yank toward the root
            mv(p, (e.x - p.x) / (d || 1) * 18, (e.y - p.y) / (d || 1) * 18);
          }
        }
      } else if (e.state === 'act') { if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.8; } }
      else if (e.state === 'recover') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 1.0 + R() * 0.8; } }
      else e.state = 'idle';
      if (e.lash > 0) e.lash -= dt;
    },
    horror: function (e, dt, p, d, ang, f, sp) { // creeps closer, blinks next to you, claws
      if (e.state === 'idle') {
        mv(e, Math.cos(ang) * sp * 0.7, Math.sin(ang) * sp * 0.7);
        if (e.cd <= 0 && d <= 52) { e.state = 'act'; e.t = 0.5; } // already in reach: claw without blinking
        else if (e.cd <= 0 && d < 320) { e.state = 'telegraph'; e.t = 0.6; e.atk = 'blink'; e.ang = ang; }
      } else if (e.state === 'telegraph') {
        if ((e.t -= dt) <= 0) {
          var D = CC.Dungeon, tries = 0, ok = false, bx = 0, by = 0;
          while (tries++ < 16 && !ok) {
            var a = R() * PI2, dist = 40 + R() * 26; bx = p.x + Math.cos(a) * dist; by = p.y + Math.sin(a) * dist;
            ok = !D.isSolid(bx, by) && !D.isSolid(bx + e.r, by) && !D.isSolid(bx - e.r, by) && !D.isSolid(bx, by + e.r) && !D.isSolid(bx, by - e.r);
          }
          if (ok) {
            if (CC.fx && CC.fx.burst) { CC.fx.burst(e.x, e.y, '#8a8aa5', 10, 70); CC.fx.burst(bx, by, '#c8c8e8', 10, 70); }
            e.x = bx; e.y = by; e.state = 'act'; e.t = 0.55;
          } else { e.state = 'idle'; e.cd = 1.2; }
        }
      } else if (e.state === 'act') {
        var tx = p.x - e.x, ty = p.y - e.y, td = Math.hypot(tx, ty) || 1;
        if (e.t < 0.3) { e.dangerous = true; mv(e, tx / td * 170 * f * dt, ty / td * 170 * f * dt); }
        if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.9; }
      } else if (e.state === 'recover') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 2.2 + R() * 1.6; } }
      else e.state = 'idle';
    }
  };

  if (E && E.TYPES) {
    E.TYPES.bear = { name: 'Demon Black Bear', hp: 78, spd: 54, dmg: 14, r: 13, xp: 26, color: '#1d1713', w: 0, blood: '#3a0a0c' };
    E.TYPES.raven = { name: 'Demon Raven', hp: 11, spd: 108, dmg: 6, r: 6, xp: 9, color: '#1a1822', w: 0, blood: '#3a0a30' };
    E.TYPES.vine = { name: 'Strangling Vine', hp: 46, spd: 0, dmg: 10, r: 9, xp: 14, color: '#2f6a35', w: 0, blood: '#3a5a1a' };
    E.TYPES.horror = { name: 'Teleporting Horror', hp: 50, spd: 44, dmg: 13, r: 11, xp: 30, color: '#8a8aa5', w: 0, blood: '#202040' };

    var origThink = E._think;
    E._think = function (e, dt, p, d, ang, f) {
      var fn = BRAIN[e.type];
      if (!fn) return origThink.apply(this, arguments);
      e.cd -= dt; e.dangerous = false;
      fn.call(this, e, dt, p, d, ang, f, e.spd * f * dt);
    };

    var origSpawn = E.spawnForFloor;
    E.spawnForFloor = function (floor, points) {
      if (!(CC.state && CC.state.area === 'forest' && F.map && CC.Dungeon === F.map)) return origSpawn.apply(this, arguments);
      this.list.length = 0; this.projectiles.length = 0; this.boss = null; this.zones = []; this.remains = [];
      if (CC.Loot && CC.Loot.clear) CC.Loot.clear();
      var grp = 5000, i, k, e, n;
      for (i = 0; i < points.length; i++) {
        var pt = points[i];
        if (R() < 0.3) continue; // 30% fewer monsters in the forest
        if (pt.type === 'raven') { n = 2 + Math.floor(R() * 2); grp++; for (k = 0; k < n; k++) { e = this.spawn('raven', pt.x + (R() - 0.5) * 36, pt.y + (R() - 0.5) * 36, 1); e.group = grp; } }
        else this.spawn(pt.type, pt.x, pt.y, 1);
      }
      return this.list;
    };
  }

  /* ---------- monster art (called from the cave enemy renderer's fallback; ctx is at the enemy, x already mirrored) ---------- */
  F.drawMonster = function (ctx, e, r, col, dark, t) {
    var an = e.anim, tele = e.state === 'telegraph', k;
    switch (e.type) {
      case 'bear': {
        var lunge=e.atk==='lunge'&&(e.state==='act'||e.state==='telegraph'),
            bite=e.atk==='bite'&&(e.state==='act'||e.biteFx>0),
            roaring=e.atk==='roar'&&(e.state==='act'||e.roarFx>0),
            pace=Math.sin(an*8.4),headPush=lunge?(e.state==='act'?r*.5:r*.13):0,
            jaw=bite?(e.biteHit?0.15:.6+.35*Math.abs(Math.sin(an*26))):roaring?.85:.11,
            front=roaring?-.65:r*.15;
        ctx.save();
        // Contoured massive shoulders, powerful haunches, weight-shifting limbs.
        ctx.fillStyle='rgba(5,3,2,.48)';
        ctx.beginPath();ctx.ellipse(-1,r*.85,r*1.65,r*.55,0,0,PI2);ctx.fill();
        ctx.fillStyle='#120f0e';
        ctx.beginPath();ctx.ellipse(-r*.82,r*.34,r*.48,r*.62,.12,0,PI2);ctx.fill();
        ctx.beginPath();ctx.ellipse(-r*.65,-r*.22,r*.5,r*.51,-.18,0,PI2);ctx.fill();
        // Hind legs, front paws and big curved claws animate independently.
        for(var leg=0;leg<4;leg++){
          var rear=leg<2,xx=rear?-r*.78:r*.59,
              yy=leg%2?r*.63:-r*.42,phase=pace*(leg%2?1:-1);
          ctx.fillStyle=rear?'#1c1511':'#241a15';
          ctx.beginPath();ctx.ellipse(xx+phase*(rear?1.3:2.4),yy+2,r*(rear?.43:.34),r*.42,
            rear?-.25:.2,0,PI2);ctx.fill();
          ctx.fillStyle='#493228';
          ctx.beginPath();ctx.ellipse(xx+r*.15+phase*2,yy+r*.37,r*.34,r*.23,0,0,PI2);ctx.fill();
          ctx.fillStyle='#ece2c4';
          for(var claw=0;claw<3;claw++){
            var cx=xx+r*.25+phase*2+(claw-1)*r*.19,cy=yy+r*.46;
            ctx.beginPath();ctx.moveTo(cx-1,cy-1);ctx.lineTo(cx+3.5,cy+2);
            ctx.lineTo(cx-1,cy+3);ctx.fill();
          }
        }
        // Dense tufted back/shoulder fur and highlights.
        ctx.fillStyle='#271a15';
        ctx.beginPath();ctx.ellipse(-r*.25,-r*.04,r*1.29,r*.94,-.08,0,PI2);ctx.fill();
        ctx.fillStyle='#38261d';
        ctx.beginPath();ctx.ellipse(-r*.68,-r*.30,r*.86,r*.81,-.24,0,PI2);ctx.fill();
        ctx.fillStyle='#503426';
        ctx.beginPath();ctx.ellipse(-r*.79,-r*.45,r*.64,r*.45,-.27,0,PI2);ctx.fill();
        ctx.strokeStyle='#67503c';ctx.lineWidth=1;
        for(k=0;k<16;k++){
          var fx=-r*1.19+(k%8)*r*.23,fy=-r*.58+Math.floor(k/8)*r*.47;
          ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx-2.5,fy-3-(k%3));ctx.stroke();
        }
        // Muscular upper neck with shaggy mane, recognizable rounded bear ears.
        ctx.fillStyle='#2e211b';ctx.beginPath();ctx.ellipse(r*.52,-r*.28,r*.65,r*.72,-.12,0,PI2);ctx.fill();
        ctx.fillStyle='#3c2920';
        ctx.beginPath();ctx.arc(r*.95+headPush,-r*.56,r*.19,0,PI2);
        ctx.arc(r*.35+headPush,-r*.55,r*.19,0,PI2);ctx.fill();
        ctx.fillStyle='#a18a75';
        ctx.beginPath();ctx.arc(r*.95+headPush,-r*.56,r*.10,0,PI2);
        ctx.arc(r*.35+headPush,-r*.55,r*.10,0,PI2);ctx.fill();
        // Head pitches forward as it lunges and jaw separates visibly during bite.
        ctx.fillStyle='#3b2b24';ctx.beginPath();
        ctx.ellipse(r*.75+headPush,-r*.17,r*.68,r*.57,roaring?-.13:.08,0,PI2);ctx.fill();
        ctx.fillStyle='#806251';ctx.beginPath();
        ctx.ellipse(r*1.16+headPush,r*.08,r*.49,r*.31,0,0,PI2);ctx.fill();
        ctx.fillStyle='#0c0809';ctx.beginPath();
        ctx.ellipse(r*1.43+headPush,-r*.02,r*.16,r*.14,0,0,PI2);ctx.fill();
        // Biting teeth: opening dark maw with two rows that actually snap shut.
        var mx=r*1.14+headPush,my=r*.23,open=jaw*r*.74;
        if(CC.Wounds&&CC.Wounds.drawJaws)CC.Wounds.drawJaws(ctx,mx-r*.38,my-r*.08,r*1.1,jaw*1.2,{fur:'#806251',dark:'#2a1d18',lower:'#2a1d18',tooth:'#f4e6c9',teeth:4});
        // Angry red eye, brow ridge, scar, directional growl flecks.
        ctx.fillStyle='#120b0b';ctx.fillRect(r*.62+headPush,-r*.35,8,4);
        // Wicked red eyes with a breathing ember glow, brighter when roaring or lunging.
        ctx.save();
        ctx.shadowColor='#ff171f';ctx.shadowBlur=9+3*Math.sin(an*4)+(roaring?8:0);
        ctx.fillStyle='#ff1725';
        ctx.beginPath();ctx.ellipse(r*.80+headPush,-r*.30,2.8,2.2,0,0,PI2);ctx.fill();
        ctx.shadowBlur=0;ctx.fillStyle='#fff2c4';
        ctx.fillRect(r*.81+headPush,-r*.31,1.0,1.0);ctx.restore();
        ctx.strokeStyle='#b39374';ctx.lineWidth=1.5;ctx.beginPath();
        ctx.moveTo(r*.48+headPush,-r*.5);ctx.lineTo(r*.82+headPush,-r*.45);ctx.stroke();
        ctx.strokeStyle='#7b3130';ctx.lineWidth=1.7;
        ctx.beginPath();ctx.moveTo(r*.15,-r*.25);ctx.lineTo(r*.32,-r*.08);ctx.stroke();
        if(roaring){
          // Layered outward sound rings while the armor-breaking roar lands.
          var energy=e.roarFx>0?1-e.roarFx/.85:0;
          ctx.strokeStyle='rgba(235,194,121,'+(.6*(1-energy)).toFixed(2)+')';
          for(k=0;k<3;k++){ctx.lineWidth=1.6;
            ctx.beginPath();ctx.arc(0,0,r*(1.1+energy*2.3)+k*6,0,PI2);ctx.stroke();}
          for(k=0;k<5;k++){
            var alpha=.23+.35*Math.abs(Math.sin(an*17+k));
            ctx.globalAlpha=alpha;ctx.fillStyle='#ead2b0';
            ctx.fillRect(r*1.5+headPush+k*3,front+k*2,3,2);
          }
          ctx.globalAlpha=1;
        }
        if(lunge&&e.state==='act'){
          ctx.strokeStyle='rgba(221,180,137,.65)';ctx.lineWidth=2;
          for(k=0;k<4;k++){
            ctx.beginPath();ctx.moveTo(-r*1.65-k*6,-r*.5+k*r*.3);
            ctx.lineTo(-r*2.1-k*9,-r*.5+k*r*.3);ctx.stroke();
          }
        }
        if(bite&&e.state==='act'){
          ctx.strokeStyle='rgba(255,233,204,.75)';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(mx,my+open*.45,r*.8,-.8,.8);ctx.stroke();
        }
        ctx.restore();
        return true;
      }
      case 'raven': {
        var fl = Math.sin(an * 24) * 6;
        ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(-r - 8, -fl - 4); ctx.lineTo(-r - 2, 5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(r + 8, -fl - 4); ctx.lineTo(r + 2, 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 1, r * 0.9, r * 0.7, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = '#8a7a5a'; ctx.beginPath(); ctx.moveTo(r * 0.8, -1); ctx.lineTo(r * 1.7, 1); ctx.lineTo(r * 0.8, 3); ctx.fill();
        ctx.fillStyle = '#ff3a3a'; ctx.fillRect(r * 0.3, -2.5, 2.5, 2.5);
        ctx.fillStyle = '#6a6a7a'; ctx.fillRect(-r * 0.2, -r * 0.8, 1.5, 3); ctx.fillRect(r * 0.2, -r * 0.8, 1.5, 3);
        return true;
      }
      case 'vine': {
        ctx.fillStyle = '#1a2a14'; ctx.beginPath(); ctx.ellipse(0, r * 0.7, r * 1.3, r * 0.5, 0, 0, PI2); ctx.fill();
        ctx.lineCap = 'round';
        for (k = 0; k < 4; k++) {
          var sw = Math.sin(an * 2.2 + k * 1.7) * (e.state === 'telegraph' ? 7 : 4), ex = (k - 1.5) * 8 + sw, ey = -r * 1.6 - (k % 2) * 6;
          ctx.strokeStyle = k % 2 ? '#2f6a35' : '#244f2a'; ctx.lineWidth = 3 - (k % 2) * 0.7;
          ctx.beginPath(); ctx.moveTo((k - 1.5) * 3, r * 0.6); ctx.quadraticCurveTo((k - 1.5) * 12 - sw, -r * 0.4, ex, ey); ctx.stroke();
          ctx.fillStyle = '#c8d870'; ctx.fillRect(ex - 1, ey - 1, 2, 2);
        }
        if (e.lash > 0 || e.state === 'act') { // the lash: a long thorned whip toward the target
          var la = e.ang * (e.face || 1) + (e.face < 0 ? Math.PI : 0), len = 108 * Math.min(1, (e.lash || 0.3) / 0.15);
          ctx.strokeStyle = '#4a9a45'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(0, -r * 0.5); ctx.quadraticCurveTo(Math.cos(la) * len * 0.5, Math.sin(la) * len * 0.5 - 14, Math.cos(la) * len, Math.sin(la) * len); ctx.stroke();
        }
        ctx.lineCap = 'butt';
        return true;
      }
      case 'horror': {
        var j = tele ? (Math.random() - 0.5) * 3 : 0;
        ctx.globalAlpha *= tele ? 0.55 + Math.random() * 0.4 : 0.92;
        ctx.fillStyle = '#0c0c16'; ctx.beginPath(); ctx.moveTo(-r * 0.8 + j, r); ctx.lineTo(-r * 0.4, -r * 0.9); ctx.lineTo(r * 0.4, -r * 0.9); ctx.lineTo(r * 0.8 + j, r);
        for (k = 0; k < 4; k++) ctx.lineTo(r * 0.8 - k * r * 0.5, r + 3 + Math.sin(an * 6 + k) * 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(j, -r * 1.05, r * 0.45, r * 0.7, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = '#10101c'; ctx.fillRect(-4 + j, -r * 1.3, 3, 4); ctx.fillRect(1 + j, -r * 1.3, 3, 4); ctx.fillRect(-1 + j, -r * 0.85, 2, 6);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; var cl = e.dangerous ? 10 : 4;
        ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.3); ctx.lineTo(-r * 0.9 - cl, r * 0.5); ctx.moveTo(r * 0.4, -r * 0.3); ctx.lineTo(r * 0.9 + cl, r * 0.5); ctx.stroke();
        return true;
      }
    }
    return false;
  };
})(window);
