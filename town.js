/* CC.Town - the starting town: a dark mountain clearing of giant sequoias in fog, ringed by a wooden palisade with archer towers.
 *
 * Shell contract (see main.js): load(), enter(), update(dt), draw(ctx,cam), interact(), drawPanel(ctx,W,H,addHit).
 * Layout: a fire (with villagers) lights the centre, three shops (Ironroot Smithy sells junk, Moss & Mortar sells potions,
 * the Lantern Trader sells mystery gear) and a guard at the south gate. The drawbridge stays up until the guard is talked to
 * (CC.state.bridgeDown); walking over it starts the Giant Forest (CC.startRun(1, 'forest')). Archers on the towers keep
 * shooting the shades and wolves that prowl outside the palisade. The town is a CC.Realm map, so CC.Dungeon points at it here.
 * Load order: after realm.js and forest.js.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var T = CC.TILE = CC.TILE || 32;
  var PI2 = Math.PI * 2;
  var W = 48, H = 42;
  var FX0 = 6, FX1 = 41, FY0 = 5, FY1 = 32;          // palisade rectangle (tiles)
  var GATE_X = 23, MOAT_Y = 33, EXIT_Y = 36.4;       // gate tiles are x 23..24 on row 32; the moat is rows 33..34
  var Town = CC.Town = { map: null, dialog: null, bridgeAnim: 0, creeps: [], arrows: [], towers: [], hintT: 8, note: null, built: false };

  function seeded(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function st() { return CC.state; }

  /* ---------- art ---------- */
  function ground(kind, hv) {
    if (kind === 5) return hv < 0.5 ? '#0f2536' : '#102a3c';
    if (kind === 6) return hv < 0.5 ? '#5a3c22' : '#533720';
    if (kind === 2) return hv < 0.5 ? '#3a3226' : '#362e23';
    if (kind === 1) return '#4a3220';
    var g = 20 + Math.floor(hv * 9);
    return 'rgb(' + (16 + Math.floor(hv * 5)) + ',' + (g + 12) + ',' + (g + 2) + ')';
  }
  function detail(ctx, kind, sx, sy, hv, t) {
    if (kind === 5) { // moat ripples
      ctx.strokeStyle = 'rgba(120,170,200,0.25)'; ctx.lineWidth = 1;
      var o = Math.sin(t * 1.5 + hv * 20) * 3;
      ctx.beginPath(); ctx.moveTo(sx + 6 + o, sy + 10 + hv * 10); ctx.lineTo(sx + 20 + o, sy + 10 + hv * 10); ctx.stroke();
    } else if (kind === 6) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (var i = 0; i < 4; i++) ctx.fillRect(sx, sy + i * 8, T, 1);
    } else if (kind === 2 && hv > 0.7) { // road: pebbles and a cart rut
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(sx + 4, sy + 9 + hv * 8, 18, 2);
      ctx.fillStyle = 'rgba(120,105,85,0.5)'; ctx.fillRect(sx + (hv * 733 % 1) * 24 + 2, sy + (hv * 197 % 1) * 22 + 4, 3, 2);
    } else if (kind === 0 && hv > 0.62) {
      ctx.strokeStyle = 'rgba(70,120,80,0.4)'; ctx.lineWidth = 1;
      var x = sx + (hv * 911 % 1) * 24 + 4, y = sy + (hv * 277 % 1) * 22 + 6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y - 5); ctx.moveTo(x, y); ctx.lineTo(x + 2, y - 5); ctx.stroke();
    }
  }
  function drawSolid(ctx, kind, sx, sy, hv, t, tx, ty) {
    if (kind === 3) {
      if (CC.Forest && CC.Forest.drawTree) CC.Forest.drawTree(ctx, sx, sy, hv, true);
      else { ctx.fillStyle = '#3a1e10'; ctx.fillRect(sx + 4, sy - 120, 24, 120 + T); } // plain trunk if forest.js is missing
      return;
    }
    if (kind === 7) { // palisade: pointed stakes
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(sx, sy + T - 4, T, 4);
      for (var i = 0; i < 4; i++) {
        var h = 42 + ((hv * (i + 3) * 17) % 1) * 10, x = sx + i * 8;
        ctx.fillStyle = i % 2 ? '#4a3220' : '#563a26'; ctx.fillRect(x, sy + T - h, 8, h);
        ctx.fillStyle = '#6a4a30'; ctx.beginPath(); ctx.moveTo(x, sy + T - h); ctx.lineTo(x + 4, sy + T - h - 7); ctx.lineTo(x + 8, sy + T - h); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 7, sy + T - h, 1, h);
      }
      return;
    }
    if (kind === 4) { // building body: sequoia bark and timber, hewn into the great trunk that drawShop raises behind it
      ctx.fillStyle = '#4e2c18'; ctx.fillRect(sx, sy - 10, T, T + 10);
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; for (var l = 0; l < 4; l++) ctx.fillRect(sx + 3 + l * 8 + ((hv * (l + 2) * 13) % 1) * 3, sy - 10, 2, T + 10); // bark furrows
      ctx.fillStyle = 'rgba(190,110,60,0.18)'; for (l = 0; l < 4; l++) ctx.fillRect(sx + 5 + l * 8 + ((hv * (l + 2) * 13) % 1) * 3, sy - 10, 1, T + 10);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; for (l = 0; l < 4; l++) ctx.fillRect(sx, sy - 2 + l * 8, T, 1); // timber courses
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx, sy + T - 3, T, 3);
    }
  }

  function drawPerson(ctx, sx, sy, t, c, pr) {
    var bob = Math.sin(t * 2 + pr.seed) * 0.8, lit = pr.guard ? '#8a8aa0' : pr.cloak;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 8, 3.5, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = lit; ctx.beginPath(); ctx.moveTo(sx - 7, sy + 8); ctx.lineTo(sx - 5, sy - 6 + bob); ctx.lineTo(sx + 5, sy - 6 + bob); ctx.lineTo(sx + 7, sy + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d8b08a'; ctx.beginPath(); ctx.arc(sx, sy - 10 + bob, 4.5, 0, PI2); ctx.fill();
    ctx.fillStyle = pr.guard ? '#9a9ab0' : pr.hair; ctx.beginPath(); ctx.arc(sx, sy - 12 + bob, 4.8, Math.PI, 0); ctx.fill();
    if (pr.guard) { ctx.fillStyle = '#c8c8d8'; ctx.fillRect(sx + 8, sy - 22, 1.5, 28); ctx.fillStyle = '#d8b24a'; ctx.beginPath(); ctx.moveTo(sx + 5, sy - 22); ctx.lineTo(sx + 9, sy - 28); ctx.lineTo(sx + 13, sy - 22); ctx.fill(); }
    var p = st() && st().player;
    if (p && Math.hypot(p.x - pr.x, p.y - pr.y) < 70) {
      ctx.font = 'bold 9px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9b0'; ctx.fillText(pr.name + '  [F] talk', sx, sy - 26); ctx.textAlign = 'left';
    }
  }
  function drawFire(ctx, sx, sy, t) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(sx, sy + 6, 30, 12, 0, 0, PI2); ctx.fill();
    for (var i = 0; i < 9; i++) { var a = i / 9 * PI2; ctx.fillStyle = i % 2 ? '#4a4640' : '#5a564e'; ctx.beginPath(); ctx.ellipse(sx + Math.cos(a) * 26, sy + 2 + Math.sin(a) * 10, 6, 4.5, 0, 0, PI2); ctx.fill(); }
    ctx.fillStyle = '#3a2214'; ctx.save(); ctx.translate(sx, sy); for (i = 0; i < 4; i++) { ctx.rotate(0.8); ctx.fillRect(-18, -2, 36, 5); } ctx.restore();
    for (i = 0; i < 6; i++) { // flames
      var f = Math.sin(t * 11 + i * 1.9), hgt = 22 + (i % 3) * 8 + f * 5, ox = (i - 2.5) * 5 + Math.sin(t * 7 + i) * 2;
      ctx.fillStyle = i % 3 === 0 ? '#ff4a1a' : i % 3 === 1 ? '#ff8a2a' : '#ffd36b';
      ctx.beginPath(); ctx.moveTo(sx + ox - 6, sy); ctx.quadraticCurveTo(sx + ox - 4, sy - hgt * 0.6, sx + ox + f * 2, sy - hgt); ctx.quadraticCurveTo(sx + ox + 4, sy - hgt * 0.6, sx + ox + 6, sy); ctx.fill();
    }
    for (i = 0; i < 7; i++) { // sparks
      var a2 = (t * 0.7 + i / 7) % 1; ctx.fillStyle = 'rgba(255,' + Math.floor(150 + 80 * (1 - a2)) + ',60,' + (1 - a2) + ')';
      ctx.fillRect(sx + Math.sin(i * 5 + t * 2) * 14 * a2 - 1, sy - 20 - a2 * 70, 2, 2);
    }
  }
  function drawTower(ctx, sx, sy, t, c, pr) { // base centre at (sx,sy); archer on the platform
    var top = sy - 96;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(sx, sy, 36, 10, 0, 0, PI2); ctx.fill();
    ctx.strokeStyle = '#3a2616'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(sx - 26, sy - 2); ctx.lineTo(sx - 22, top + 6); ctx.moveTo(sx + 26, sy - 2); ctx.lineTo(sx + 22, top + 6); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - 24, sy - 8); ctx.lineTo(sx + 24, top + 20); ctx.moveTo(sx + 24, sy - 8); ctx.lineTo(sx - 24, top + 20); ctx.stroke();
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(sx - 30, top, 60, 9); ctx.fillStyle = '#7a5232'; ctx.fillRect(sx - 30, top, 60, 3);
    ctx.fillStyle = '#4a2e1a'; ctx.fillRect(sx - 30, top - 14, 4, 14); ctx.fillRect(sx + 26, top - 14, 4, 14); ctx.fillRect(sx - 30, top - 14, 60, 3);
    ctx.fillStyle = '#4a4a5a'; ctx.beginPath(); ctx.moveTo(sx - 5, top - 2); ctx.lineTo(sx - 4, top - 18); ctx.lineTo(sx + 4, top - 18); ctx.lineTo(sx + 5, top - 2); ctx.fill(); // archer
    ctx.fillStyle = '#d8b08a'; ctx.beginPath(); ctx.arc(sx, top - 22, 4, 0, PI2); ctx.fill();
    var a = pr.aim || 0; ctx.strokeStyle = '#9a7a4a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * 6, top - 12 + Math.sin(a) * 4, 8, a - 1.2, a + 1.2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,190,100,0.95)'; ctx.beginPath(); ctx.arc(sx + 24, top - 18, 3, 0, PI2); ctx.fill(); // lantern
  }
  /* A shop is a house built into a giant sequoia: the trunk rises behind the roof into the mist, limbs spring out of its sides and
     droop foliage over the eaves, the door is a pointed arch cut into the bark, and a rope ladder, rope bridge, root steps and
     lanterns finish it. The static art is painted once into a cached 2x sprite (gradients and all); only the glows run live. */
  function barkGrad(c, x0, x1) {
    var g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, '#1e0f08'); g.addColorStop(0.18, '#4a2514'); g.addColorStop(0.45, '#7a4226'); g.addColorStop(0.62, '#8a4c2a'); g.addColorStop(0.85, '#3e1f10'); g.addColorStop(1, '#180b06');
    return g;
  }
  function archPath(c, x, base, hw, h) { // pointed arch standing on (x, base)
    c.beginPath(); c.moveTo(x - hw, base); c.lineTo(x - hw, base - h + hw); c.quadraticCurveTo(x - hw, base - h, x, base - h - 4); c.quadraticCurveTo(x + hw, base - h, x + hw, base - h + hw); c.lineTo(x + hw, base); c.closePath();
  }
  function foliage(c, x, y, r, rng) { // a drooping needle clump
    var i;
    for (i = 0; i < 7; i++) { var a = rng() * PI2, d = rng() * r * 0.8; c.fillStyle = i % 3 === 0 ? '#16301f' : i % 3 === 1 ? '#0f2217' : '#1f4128'; c.beginPath(); c.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.55, r * (0.45 + rng() * 0.3), r * 0.32, 0, 0, PI2); c.fill(); }
    c.strokeStyle = 'rgba(30,70,40,0.8)'; c.lineWidth = 1;
    for (i = 0; i < 6; i++) { var tx = x - r * 0.8 + i * r * 0.32 + rng() * 3, ty = y + r * 0.2; c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + (rng() - 0.5) * 3, ty + 7 + rng() * 9); c.stroke(); }
    c.fillStyle = 'rgba(90,150,80,0.35)'; for (i = 0; i < 5; i++) c.fillRect(x + (rng() - 0.5) * r * 1.2, y - r * 0.3 + rng() * r * 0.3, 2, 1.5);
  }
  function limb(c, x, y, dir, len, th, rng) { // a limb off the trunk: rises, then droops; returns the tip
    var ex = x + dir * len, ey = y - 6 - rng() * 12 + len * 0.1, mx = x + dir * len * 0.5, my = y - 14 - rng() * 8;
    c.fillStyle = '#3a1e10';
    c.beginPath(); c.moveTo(x, y - th); c.quadraticCurveTo(mx, my - th * 0.5, ex, ey - 1); c.lineTo(ex, ey + 2); c.quadraticCurveTo(mx, my + th * 0.6, x, y + th); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(190,110,60,0.35)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y - th * 0.6); c.quadraticCurveTo(mx, my - th * 0.3, ex, ey - 1); c.stroke();
    foliage(c, mx, my + 2, 17 + rng() * 6, rng); foliage(c, ex, ey, 20 + rng() * 8, rng);
    return { x: ex, y: ey };
  }
  function sprDims(pr) { var Wd = pr.w * T, Hh = pr.h * T, SW = Wd + 320, SH = Hh + 306; return { Wd: Wd, Hh: Hh, SW: SW, SH: SH, ox: SW / 2, oy: SH - 16 }; }
  function paintShop(c, d, pr, mask) { // (d.ox, d.oy) = bottom-centre of the footprint, the same anchor drawShop is given
    var ox = d.ox, oy = d.oy, Wd = d.Wd, Hh = d.Hh, y0 = oy - Hh, i, k, tip, rng = seeded(pr.title.length * 977 + pr.title.charCodeAt(0) * 31 + pr.title.charCodeAt(3));
    pr._lamps = [];
    // the trunk behind the building, fluted and furrowed, rising into the mist
    c.fillStyle = barkGrad(c, ox - 60, ox + 60);
    c.beginPath(); c.moveTo(ox - 60, y0 + 6); c.lineTo(ox - 46, 4); c.lineTo(ox + 46, 4); c.lineTo(ox + 60, y0 + 6); c.closePath(); c.fill();
    c.lineWidth = 1.6;
    for (i = 0; i < 10; i++) {
      var fx = -54 + i * 12 + rng() * 4;
      c.strokeStyle = 'rgba(0,0,0,0.38)'; c.beginPath(); c.moveTo(ox + fx * 0.78, 4); c.lineTo(ox + fx + rng() * 3, y0 + 4); c.stroke();
      c.strokeStyle = 'rgba(210,130,80,0.16)'; c.beginPath(); c.moveTo(ox + fx * 0.78 + 3, 4); c.lineTo(ox + fx + 3, y0 + 4); c.stroke();
    }
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1.2;
    for (i = 0; i < 6; i++) { var sy2 = 24 + rng() * (y0 - 30), sx2 = ox - 40 + rng() * 80; c.beginPath(); c.arc(sx2, sy2, 7 + rng() * 6, 0.2, 2.6); c.stroke(); } // bark scars
    // limbs springing out of the sides; the lowest pair reach over the eaves
    for (k = 0; k < 4; k++) {
      var by = y0 - 40 - k * 56, hw = 46 + 14 * (by - 4) / (y0 + 2), dir = (k + (rng() < 0.5 ? 0 : 1)) % 2 ? 1 : -1, len = 118 - k * 16 + rng() * 14;
      tip = limb(c, ox + dir * hw * 0.8, by, dir, len, 6 - k, rng);
      if (k === 0) { limb(c, ox - dir * hw * 0.8, by - 6, -dir, len - 20, 5, rng); pr._lamps.push({ x: tip.x - ox, y: tip.y + 26 - oy }); }
    }
    if (mask) { // the crown dissolves into the mist
      c.save(); c.globalCompositeOperation = 'destination-in';
      var mg = c.createLinearGradient(0, 0, 0, d.SH * 0.42); mg.addColorStop(0, 'rgba(0,0,0,0)'); mg.addColorStop(1, 'rgba(0,0,0,1)');
      c.fillStyle = mg; c.fillRect(0, 0, d.SW, d.SH); c.restore();
    }
    // woven bark-shingle roof, mossy, with the trunk passing up through it
    var rl = ox - Wd / 2 - 8, rr2 = ox + Wd / 2 + 8;
    c.save();
    c.beginPath(); c.moveTo(rl, y0 + 2); c.lineTo(rl + 30, y0 - 30); c.lineTo(rr2 - 30, y0 - 30); c.lineTo(rr2, y0 + 2); c.closePath(); c.clip();
    c.fillStyle = '#2e1c12'; c.fillRect(rl, y0 - 32, rr2 - rl, 36);
    for (i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#3e281a' : '#4a2e1c'; for (var sx3 = rl - 5 + (i % 2) * 5; sx3 < rr2; sx3 += 10) { c.beginPath(); c.arc(sx3, y0 - 26 + i * 7, 6, 0, Math.PI); c.fill(); } }
    c.fillStyle = 'rgba(70,120,55,0.55)'; for (i = 0; i < 6; i++) { c.beginPath(); c.ellipse(rl + 20 + rng() * (rr2 - rl - 40), y0 - 22 + rng() * 22, 9 + rng() * 8, 3.5, 0, 0, PI2); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(rl, y0 - 1, rr2 - rl, 4);
    c.restore();
    c.fillStyle = '#24140c'; c.beginPath(); c.ellipse(ox, y0 - 30, 62, 8, 0, 0, PI2); c.fill(); // where the trunk comes through
    c.fillStyle = 'rgba(70,120,55,0.6)'; c.beginPath(); c.ellipse(ox - 20, y0 - 33, 22, 3.5, 0, 0, PI2); c.fill();
    foliage(c, ox - Wd / 2 + 6, y0 - 22, 24, rng); foliage(c, ox + Wd / 2 - 6, y0 - 22, 24, rng); // low boughs droop over the eaves
    // sign
    c.fillStyle = '#6a4626'; c.fillRect(ox - 34, y0 - 12, 68, 14); c.strokeStyle = '#2a1a0c'; c.lineWidth = 1; c.strokeRect(ox - 34.5, y0 - 12.5, 69, 15);
    c.fillStyle = '#f0dcb0'; c.font = 'bold 8px Georgia, serif'; c.textAlign = 'center'; c.fillText(pr.title, ox, y0 - 2); c.textAlign = 'left';
    // door cut into the bark, root steps, lantern portholes
    c.fillStyle = '#8a5a30'; archPath(c, ox, oy, 15, 36); c.fill();
    c.fillStyle = '#1c1008'; archPath(c, ox, oy, 11.5, 33); c.fill();
    c.fillStyle = '#3a2010'; // roots flaring either side of the door
    c.beginPath(); c.moveTo(ox - 15, oy - 6); c.quadraticCurveTo(ox - 24, oy, ox - 46, oy + 9); c.quadraticCurveTo(ox - 26, oy + 12, ox - 12, oy + 2); c.fill();
    c.beginPath(); c.moveTo(ox + 15, oy - 6); c.quadraticCurveTo(ox + 24, oy, ox + 46, oy + 9); c.quadraticCurveTo(ox + 26, oy + 12, ox + 12, oy + 2); c.fill();
    for (i = 0; i < 3; i++) { c.fillStyle = i % 2 ? '#4a3a2c' : '#5a4a3a'; c.fillRect(ox - 14 - i * 3, oy + i * 4, 28 + i * 6, 4); } // steps
    for (i = -1; i <= 1; i += 2) { c.fillStyle = '#6a4626'; c.beginPath(); c.arc(ox + i * 19, oy - 22, 7, 0, PI2); c.fill(); c.fillStyle = '#1a0e06'; c.beginPath(); c.arc(ox + i * 19, oy - 22, 5.2, 0, PI2); c.fill(); }
    // rope ladder down the left side, rope bridge from the roof out to the limb on the right
    var lx = ox - Wd / 2 + 12;
    c.strokeStyle = '#8a7248'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(lx, y0 - 4); c.lineTo(lx, y0 + Hh * 0.62); c.moveTo(lx + 9, y0 - 4); c.lineTo(lx + 9, y0 + Hh * 0.62); c.stroke();
    c.lineWidth = 2; for (i = 0; i < 11; i++) { c.beginPath(); c.moveTo(lx, y0 + i * 8); c.lineTo(lx + 9, y0 + i * 8); c.stroke(); }
    var ax = ox + Wd / 2 - 18, ay = y0 - 26, bx = ox + Wd / 2 + 56, bY = y0 - 56;
    c.strokeStyle = '#8a7248'; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(ax, ay - 9); c.quadraticCurveTo((ax + bx) / 2, (ay + bY) / 2 + 6, bx, bY - 9); c.stroke();
    c.fillStyle = '#6a4626'; for (i = 0; i <= 10; i++) { var u = i / 10, px = ax + (bx - ax) * u, py = ay + (bY - ay) * u + 9 * Math.sin(Math.PI * u); c.fillRect(px - 3, py, 6, 2.5); }
    c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo((ax + bx) / 2, (ay + bY) / 2 + 14, bx, bY); c.stroke();
    // hanging lanterns (their flames are drawn live)
    c.strokeStyle = '#2a1a0c'; c.lineWidth = 1;
    pr._lamps.forEach(function (L) { c.beginPath(); c.moveTo(ox + L.x, oy + L.y - 14); c.lineTo(ox + L.x, oy + L.y - 4); c.stroke(); c.fillStyle = '#2a1a0c'; c.fillRect(ox + L.x - 3.5, oy + L.y - 5, 7, 9); });
  }
  function shopSprite(pr) {
    if (pr._spr !== undefined) return pr._spr;
    var d = sprDims(pr), cv = root.document && root.document.createElement ? root.document.createElement('canvas') : null, c;
    if (!cv) return (pr._spr = null);
    cv.width = d.SW * 2; cv.height = d.SH * 2; c = cv.getContext('2d');
    if (!c) return (pr._spr = null);
    c.scale(2, 2); paintShop(c, d, pr, true);
    return (pr._spr = { cv: cv, d: d });
  }
  function drawShop(ctx, sx, sy, t, c, pr) { // sx,sy = bottom-centre of the footprint
    var s = shopSprite(pr), d = s ? s.d : sprDims(pr), f = 0.8 + 0.2 * Math.sin(t * 5 + pr.x), i;
    if (s) ctx.drawImage(s.cv, sx - d.ox, sy - d.oy, d.SW, d.SH);
    else { ctx.save(); ctx.translate(sx - d.ox, sy - d.oy); paintShop(ctx, d, pr, false); ctx.restore(); }
    ctx.fillStyle = 'rgba(255,190,100,' + (0.85 * f) + ')'; // lit portholes, lit doorway
    for (i = -1; i <= 1; i += 2) { ctx.beginPath(); ctx.arc(sx + i * 19, sy - 22, 4.6, 0, PI2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,170,80,' + (0.3 * f) + ')'; archPath(ctx, sx, sy, 10, 30); ctx.fill();
    for (i = 0; pr._lamps && i < pr._lamps.length; i++) {
      var L = pr._lamps[i];
      ctx.fillStyle = 'rgba(255,190,100,0.16)'; ctx.beginPath(); ctx.arc(sx + L.x, sy + L.y - 1, 9, 0, PI2); ctx.fill();
      ctx.fillStyle = 'rgba(255,214,130,' + (0.9 * f) + ')'; ctx.fillRect(sx + L.x - 2, sy + L.y - 3, 4, 6);
    }
  }
  function drawBridge(ctx, sx, sy, t) { // (sx,sy) = top-centre of the moat (hinge); slab swings from standing at the gate to lying over the moat
    var a = Town.bridgeAnim, len = 32 + 32 * a, y0 = sy - 32 * (1 - a);
    ctx.fillStyle = '#4a2e1a'; ctx.fillRect(sx - 32, y0, 64, len);
    ctx.fillStyle = '#6a4626'; for (var i = 0; i < 6; i++) ctx.fillRect(sx - 31, y0 + 2 + i * (len / 6), 62, len / 6 - 3);
    ctx.fillStyle = '#2a1a0c'; ctx.fillRect(sx - 32, y0, 4, len); ctx.fillRect(sx + 28, y0, 4, len);
    ctx.strokeStyle = '#6a6a74'; ctx.lineWidth = 2; // chains
    if (a < 1) { ctx.beginPath(); ctx.moveTo(sx - 28, y0 + 2); ctx.lineTo(sx - 28, sy - 40); ctx.moveTo(sx + 28, y0 + 2); ctx.lineTo(sx + 28, sy - 40); ctx.stroke(); }
  }
  function drawRoadSign(ctx, sx, sy) { // post at the start of the forest path
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy, 8, 3, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#3a2214'; ctx.fillRect(sx - 2, sy - 34, 4, 34);
    ctx.fillStyle = '#6a4626'; ctx.beginPath(); ctx.moveTo(sx - 24, sy - 30); ctx.lineTo(sx + 18, sy - 30); ctx.lineTo(sx + 26, sy - 24); ctx.lineTo(sx + 18, sy - 18); ctx.lineTo(sx - 24, sy - 18); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#f0dcb0'; ctx.font = 'bold 6px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('GIANT FOREST', sx - 2, sy - 21.5); ctx.textAlign = 'left';
  }
  function drawTorch(ctx, sx, sy, t) {
    ctx.fillStyle = '#2a1c12'; ctx.fillRect(sx - 1.5, sy - 26, 3, 28);
    var f = Math.sin(t * 12 + sx);
    ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.moveTo(sx - 4, sy - 26); ctx.quadraticCurveTo(sx - 3, sy - 34 - f * 2, sx, sy - 40 + f); ctx.quadraticCurveTo(sx + 3, sy - 34, sx + 4, sy - 26); ctx.fill();
  }

  /* ---------- build ---------- */
  function build() {
    var rng = seeded(20260311), N = W * H, kind = new Uint8Array(N), tiles = new Uint8Array(N), res = new Uint8Array(N), x, y, i;
    function at(a, b) { return b * W + a; }
    function set(a, b, k, solid) { kind[at(a, b)] = k; tiles[at(a, b)] = solid ? 1 : 0; }
    function reserve(x0, y0, x1, y1) { for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) res[at(xx, yy)] = 1; }
    var props = [], lights = [], npcs = [];

    // palisade, moat and the closed gate
    for (x = FX0; x <= FX1; x++) { set(x, FY0, 7, true); set(x, FY1, 7, true); }
    for (y = FY0; y <= FY1; y++) { set(FX0, y, 7, true); set(FX1, y, 7, true); }
    set(GATE_X, FY1, 9, true); set(GATE_X + 1, FY1, 9, true);
    for (y = MOAT_Y; y <= MOAT_Y + 1; y++) for (x = 0; x < W; x++) set(x, y, 5, true);
    // dirt: plaza around the fire, the road to the gate, and spurs to the shop doors
    function dirt(cx, cy, r) { for (var yy = Math.floor(cy - r); yy <= cy + r; yy++) for (var xx = Math.floor(cx - r); xx <= cx + r; xx++) if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r && !tiles[at(xx, yy)]) kind[at(xx, yy)] = 2; }
    dirt(24, 18, 7.5);
    for (y = 18; y < FY1; y++) { kind[at(23, y)] = 2; kind[at(24, y)] = 2; }
    // outer ring and the far bank: dense sequoias (unreachable, so no spacing rule)
    var rr = rng;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var edge = x < 1 || y < 1 || x >= W - 1 || y >= H - 1;
      var outside = x < FX0 || x > FX1 || y < FY0 || (y > MOAT_Y + 1);
      if (edge) { set(x, y, 3, true); continue; }
      if (outside && !tiles[at(x, y)] && !(y > MOAT_Y + 1 && x >= 19 && x <= 28 && y < H - 1)) { // keep the bridgehead clearing open
        if (rr() < 0.42) set(x, y, 3, true);
      }
    }
    // beyond the bridge the road is the first stretch of the forest's main path: a six-wide dirt track with a giant sequoia line down each side
    for (y = MOAT_Y + 2; y < H - 1; y++) for (x = 19; x <= 28; x++) {
      if (x >= 21 && x <= 26) set(x, y, 2, false);
      else if (((x === 20 || x === 27) && y % 2 === 0) || ((x === 19 || x === 28) && y % 2 === 1)) set(x, y, 3, true);
      else set(x, y, 0, false);
    }
    props.push({ x: 21 * T + 16, y: 36 * T + 16, draw: drawTorch }, { x: 26 * T + 16, y: 36 * T + 16, draw: drawTorch }, { x: 25 * T + 10, y: 38 * T + 24, draw: drawRoadSign });
    lights.push({ x: 21 * T + 16, y: 36 * T - 6, r: 110, color: '255,160,70', inten: 0.7, flicker: 0.1 }, { x: 26 * T + 16, y: 36 * T - 6, r: 110, color: '255,160,70', inten: 0.7, flicker: 0.1 });

    // fire pit (solid ring) at the centre
    for (y = 17; y <= 18; y++) for (x = 23; x <= 24; x++) set(x, y, 9, true);
    props.push({ x: 24 * T, y: 18 * T + 10, draw: drawFire });
    lights.push({ x: 24 * T, y: 18 * T - 6, r: 360, color: '255,140,50', inten: 1, flicker: 0.12 });
    reserve(15, 10, 33, 26); reserve(22, 24, 25, 31);

    // shops: solid log buildings with a door spur, a roof strip and a keeper out front
    var shops = [
      { x0: 8, y0: 8, w: 6, h: 4, id: 'smith', title: 'IRONROOT SMITHY', keeper: { name: 'Brenna the Smith', cloak: '#5a3a2a', hair: '#2a1a10' } },
      { x0: 34, y0: 8, w: 6, h: 4, id: 'herb', title: 'MOSS & MORTAR', keeper: { name: 'Old Wick', cloak: '#2a5a3a', hair: '#d8d8d0' } },
      { x0: 8, y0: 22, w: 6, h: 4, id: 'trader', title: 'LANTERN TRADER', keeper: { name: 'Sable the Trader', cloak: '#5a2a5a', hair: '#1a1a22' } }
    ];
    shops.forEach(function (s) {
      var xx, yy;
      for (yy = s.y0; yy < s.y0 + s.h; yy++) for (xx = s.x0; xx < s.x0 + s.w; xx++) set(xx, yy, 4, true);
      reserve(s.x0 - 2, s.y0 - 3, s.x0 + s.w + 1, s.y0 + s.h + 3);
      var dx = s.x0 + 3; // spur from the door toward the plaza
      for (yy = s.y0 + s.h; yy <= s.y0 + s.h + 2; yy++) { kind[at(dx, yy)] = 2; kind[at(dx - 1, yy)] = 2; }
      var tx = dx, ty = s.y0 + s.h + 2;
      while (tx !== 24) { tx += tx < 24 ? 1 : -1; kind[at(tx, ty)] = 2; if (tx === 23 || tx === 25) break; }
      props.push({ x: (s.x0 + s.w / 2) * T, y: (s.y0 + s.h) * T + 2, w: s.w, h: s.h, title: s.title, front: true, frontBox: { w: 150, h: 400 }, draw: drawShop });
      lights.push({ x: (s.x0 + s.w / 2) * T, y: (s.y0 + s.h) * T + 18, r: 120, color: '255,180,90', inten: 0.75, flicker: 0.05 });
      var k = { x: (s.x0 + s.w / 2) * T + 38, y: (s.y0 + s.h) * T + 22, name: s.keeper.name, cloak: s.keeper.cloak, hair: s.keeper.hair, shop: s.id, seed: s.x0 + s.y0, draw: drawPerson };
      npcs.push(k); props.push(k);
    });

    // fire folk
    var folk = [
      { name: 'Hobb the Storyteller', dx: -72, dy: 4, cloak: '#4a3a6a', hair: '#cfcfc8', id: 'story' },
      { name: 'Sister Alder', dx: 74, dy: 2, cloak: '#d8d0c0', hair: '#6a4a2a', id: 'healer' },
      { name: 'Dag', dx: -52, dy: 62, cloak: '#5a4a2a', hair: '#2a1a10', id: 'dag' },
      { name: 'Pip', dx: 56, dy: 58, cloak: '#3a5a6a', hair: '#8a5a2a', id: 'pip' },
      { name: 'Captain Roe', dx: 4, dy: -74, cloak: '#6a2a2a', hair: '#1a1a1a', id: 'captain' }
    ];
    folk.forEach(function (f, j) {
      var n = { x: 24 * T + f.dx, y: 18 * T + f.dy, name: f.name, cloak: f.cloak, hair: f.hair, folk: f.id, seed: j * 1.3, draw: drawPerson };
      npcs.push(n); props.push(n);
    });

    // the guard, his torches, and the drawbridge
    var guard = { x: 24 * T, y: 30 * T + 6, name: 'Gate Guard', cloak: '#6a6a7a', hair: '#8a8a9a', guard: true, seed: 0.4, draw: drawPerson };
    npcs.push(guard); props.push(guard);
    props.push({ x: 22 * T + 8, y: 31 * T + 8, draw: drawTorch }, { x: 26 * T - 8, y: 31 * T + 8, draw: drawTorch });
    lights.push({ x: 22 * T + 8, y: 31 * T - 8, r: 130, color: '255,150,60', inten: 0.9, flicker: 0.1 }, { x: 26 * T - 8, y: 31 * T - 8, r: 130, color: '255,150,60', inten: 0.9, flicker: 0.1 });
    props.push({ x: 24 * T, y: MOAT_Y * T, sortY: 40, draw: drawBridge });
    lights.push({ x: 24 * T, y: (MOAT_Y + 2) * T, r: 90, color: '255,170,80', inten: 0.6, flicker: 0.05 });

    // corner towers with archers
    var towers = [];
    [[FX0, FY0], [FX1 - 1, FY0], [FX0, FY1 - 1], [FX1 - 1, FY1 - 1]].forEach(function (c, j) {
      var tw = { x: (c[0] + 1) * T, y: (c[1] + 2) * T, cd: 0.6 + j * 0.5, aim: 0, seed: j };
      for (var yy = c[1]; yy <= c[1] + 1; yy++) for (var xx = c[0]; xx <= c[0] + 1; xx++) set(xx, yy, 9, true);
      tw.draw = drawTower; towers.push(tw); props.push(tw);
      lights.push({ x: tw.x, y: tw.y - 10, r: 230, color: '255,190,100', inten: 0.85, flicker: 0.05 });
      reserve(c[0] - 1, c[1] - 1, c[0] + 3, c[1] + 4);
    });
    // lamps along the road and plaza edge
    [[22, 26], [26, 26], [19, 14], [29, 14], [19, 22], [29, 22]].forEach(function (p) { props.push({ x: p[0] * T + 16, y: p[1] * T + 16, draw: drawTorch }); lights.push({ x: p[0] * T + 16, y: p[1] * T - 6, r: 110, color: '255,160,70', inten: 0.7, flicker: 0.1 }); });

    // sequoias inside the walls (giants, spaced apart; reserved ground stays clear)
    var placed = 0, tries = 0;
    while (placed < 20 && tries++ < 600) {
      var tx2 = FX0 + 2 + Math.floor(rng() * (FX1 - FX0 - 3)), ty2 = FY0 + 2 + Math.floor(rng() * (FY1 - FY0 - 3)), ok = !res[at(tx2, ty2)] && !tiles[at(tx2, ty2)] && kind[at(tx2, ty2)] !== 2, dx2, dy2;
      for (dy2 = -2; dy2 <= 2 && ok; dy2++) for (dx2 = -2; dx2 <= 2; dx2++) if (tiles[at(tx2 + dx2, ty2 + dy2)]) { ok = false; break; }
      if (ok) { set(tx2, ty2, 3, true); placed++; }
    }
    var map = CC.Realm.create({
      name: 'Hollowpine Hold', w: W, h: H, kind: kind, tiles: tiles, spawn: { x: 24 * T, y: 24 * T, tx: 24, ty: 24 }, props: props, lights: lights,
      ambient: '14,20,36,0.4', playerLight: 120, viewR: 220, fog: 0, reveal: false, ground: ground, // no fog or distance fade inside the town: it reads as a clear, lamp-lit dusk; fog is for the wilds outside
      detail: detail, drawSolid: drawSolid, afterLight: afterLight
    });
    map.npcs = npcs; map.guard = guard; map.towers = towers;
    Town.towers = towers;
    return map;
  }

  /* ---------- creeps outside the wall, arrows from the towers ---------- */
  function outsidePoint(rng) {
    for (var t = 0; t < 40; t++) {
      var x = (1 + rng() * (W - 2)) * T, y = (1 + rng() * (H - 2)) * T;
      var inside = x > (FX0 - 0.6) * T && x < (FX1 + 1.6) * T && y > (FY0 - 0.6) * T && y < (MOAT_Y + 2.2) * T;
      if (!inside && (x < (FX0 - 0.6) * T || x > (FX1 + 1.6) * T || y < (FY0 - 0.6) * T) && Math.hypot(x - 24 * T, y - 38 * T) > 160) return { x: x, y: y };
    }
    return { x: 3 * T, y: 3 * T };
  }
  function spawnCreeps() {
    Town.creeps = []; Town.arrows = [];
    for (var i = 0; i < 9; i++) {
      var p = outsidePoint(Math.random);
      Town.creeps.push({ x: p.x, y: p.y, type: ['wolf', 'shade', 'brute'][i % 3], tx: p.x, ty: p.y, dead: false, respawn: 0, t: Math.random() * 3 });
    }
  }
  function updateOutside(dt) {
    var i, c, tw, k;
    for (i = 0; i < Town.creeps.length; i++) {
      c = Town.creeps[i];
      if (c.dead) { if ((c.respawn -= dt) <= 0) { var p = outsidePoint(Math.random); c.x = p.x; c.y = p.y; c.tx = p.x; c.ty = p.y; c.dead = false; } continue; }
      c.t -= dt;
      if (c.t <= 0) { // drift toward the palisade: this is "getting too close"
        var gx = Math.max(FX0 * T - 20, Math.min((FX1 + 1) * T + 20, c.x)), gy = Math.max(FY0 * T - 20, Math.min((MOAT_Y + 1) * T, c.y));
        c.tx = c.x + (gx - c.x) * (0.4 + Math.random() * 0.5) + (Math.random() - 0.5) * 60; c.ty = c.y + (gy - c.y) * (0.4 + Math.random() * 0.5) + (Math.random() - 0.5) * 60; c.t = 2 + Math.random() * 3;
      }
      var dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy) || 1, sp = (c.type === 'shade' ? 26 : c.type === 'brute' ? 22 : 38) * dt;
      if (d > 2) { c.x += dx / d * sp; c.y += dy / d * sp; }
    }
    for (k = 0; k < Town.towers.length; k++) {
      tw = Town.towers[k];
      tw.cd -= dt;
      var best = null, bd = 1e9;
      for (i = 0; i < Town.creeps.length; i++) { c = Town.creeps[i]; if (c.dead) continue; var dd = Math.hypot(c.x - tw.x, c.y - tw.y); if (dd < 330 && (Math.random() < 0.3 || dd < bd)) { if (!best || Math.random() < 0.5) { best = c; bd = dd; } } }
      if (best) tw.aim = Math.atan2(best.y - (tw.y - 100), best.x - tw.x);
      if (tw.cd <= 0 && best) {
        tw.cd = 1.1 + Math.random() * 1.6;
        Town.arrows.push({ x0: tw.x, y0: tw.y - 100, x1: best.x, y1: best.y, t: 0, dur: Math.max(0.2, Math.hypot(best.x - tw.x, best.y - tw.y) / 420), target: best });
      }
    }
    for (i = Town.arrows.length - 1; i >= 0; i--) {
      var a = Town.arrows[i]; a.t += dt;
      if (a.t >= a.dur) {
        if (!a.target.dead) { a.target.dead = true; a.target.respawn = 3 + Math.random() * 4; if (CC.fx && CC.fx.burst) CC.fx.burst(a.target.x, a.target.y, a.target.type === 'shade' ? '#a8d8e8' : '#7a0f14', 8, 70); }
        Town.arrows.splice(i, 1);
      }
    }
  }
  function drawCreeps(ctx, cam) {
    var t = Date.now() / 1000;
    for (var i = 0; i < Town.creeps.length; i++) {
      var c = Town.creeps[i];
      if (c.dead || c.x < cam.x - 40 || c.x > cam.x + cam.w + 40 || c.y < cam.y - 40 || c.y > cam.y + cam.h + 40) continue;
      var sx = c.x - cam.x, sy = c.y - cam.y;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 7, 9, 3.5, 0, 0, PI2); ctx.fill();
      if (c.type === 'shade') { ctx.fillStyle = 'rgba(170,200,230,0.55)'; ctx.beginPath(); ctx.arc(sx, sy - 3 + Math.sin(t * 3 + i) * 2, 8, Math.PI, 0); ctx.lineTo(sx + 8, sy + 6); ctx.lineTo(sx - 8, sy + 6); ctx.fill(); }
      else if (c.type === 'brute') { ctx.fillStyle = '#17120f'; ctx.beginPath(); ctx.ellipse(sx, sy, 14, 10, 0, 0, PI2); ctx.fill(); ctx.beginPath(); ctx.arc(sx + 11, sy - 4, 6, 0, PI2); ctx.fill(); }
      else { ctx.fillStyle = '#1c1c22'; ctx.beginPath(); ctx.ellipse(sx, sy, 10, 6, 0, 0, PI2); ctx.fill(); ctx.beginPath(); ctx.arc(sx + 9, sy - 3, 4, 0, PI2); ctx.fill(); }
    }
  }
  function afterLight(ctx, cam) { // eyes and arrows glow through the darkness
    var t = Date.now() / 1000, i;
    for (i = 0; i < Town.creeps.length; i++) {
      var c = Town.creeps[i];
      if (c.dead) continue;
      var sx = c.x - cam.x, sy = c.y - cam.y;
      if (sx < -20 || sx > cam.w + 20 || sy < -20 || sy > cam.h + 20) continue;
      ctx.fillStyle = c.type === 'shade' ? 'rgba(150,230,255,0.9)' : 'rgba(255,50,40,' + (0.6 + 0.3 * Math.sin(t * 4 + i)) + ')';
      ctx.fillRect(sx + (c.type === 'shade' ? -3 : 6), sy - 6, 2, 2); ctx.fillRect(sx + (c.type === 'shade' ? 2 : 10), sy - 6, 2, 2);
    }
    ctx.strokeStyle = 'rgba(255,235,170,0.95)'; ctx.lineWidth = 1.5;
    for (i = 0; i < Town.arrows.length; i++) {
      var a = Town.arrows[i], f = a.t / a.dur, ax = a.x0 + (a.x1 - a.x0) * f - cam.x, ay = a.y0 + (a.y1 - a.y0) * f - cam.y + Math.sin(f * Math.PI) * -14;
      var bx = a.x0 + (a.x1 - a.x0) * Math.max(0, f - 0.12) - cam.x, by = a.y0 + (a.y1 - a.y0) * Math.max(0, f - 0.12) - cam.y - Math.sin(Math.max(0, f - 0.12) * Math.PI) * 14;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke();
    }
  }

  /* ---------- dialogue and shops ---------- */
  function say(text) { Town.note = { text: text, t: 2.6 }; }
  function junkSale() {
    var s = st(), inv = s.inventory || [], keep = [], gold = 0, n = 0;
    inv.forEach(function (it) { if ((it.rarity | 0) <= 1) { gold += it.value || 0; n++; } else keep.push(it); });
    s.inventory = keep; s.gold = (s.gold || 0) + gold;
    return n ? 'Sold ' + n + ' item' + (n > 1 ? 's' : '') + ' for ' + gold + ' G.' : 'Nothing common in your pack.';
  }
  function dialogFor(n) {
    var s = st(), p = s.player, d = { name: n.name, npc: n, text: '', actions: [] };
    if (n.guard) {
      if (!s.bridgeDown) {
        d.text = 'Halt. Beyond this bridge is the Giant Forest, and nothing in it is friendly. The archers will not follow you out there. Still going?';
        d.actions.push({ label: 'Lower the drawbridge', run: function () { s.bridgeDown = true; Town.bridgeAnim = Math.max(Town.bridgeAnim, 0.001); say('The drawbridge groans down...'); Town.dialog = null; } });
      } else d.text = 'The bridge is down. Follow the lamps south, keep your light close, and find the hollow tree. Good luck, traveler.';
    } else if (n.shop === 'smith') {
      d.text = 'Gear is only worth what it fetches. Hand me your common junk and I will pay fair coin. The good pieces you keep.';
      d.actions.push({ label: 'Sell common & uncommon pack items', run: function () { d.text = junkSale(); } });
    } else if (n.shop === 'herb') {
      d.text = 'Potions, fresh this morning. Thirty gold. You have ' + (s.potions | 0) + '.';
      d.actions.push({ label: 'Buy potion (30 G)', enabled: function () { return (s.gold | 0) >= 30; }, run: function () { s.gold -= 30; s.potions = (s.potions | 0) + 1; d.text = 'One potion, wrapped. You now have ' + s.potions + '.'; } });
    } else if (n.shop === 'trader') {
      d.text = 'Odd pieces from the forest folk. Ninety gold buys you a mystery item, scaled to the deepest floor you have reached.';
      d.actions.push({ label: 'Buy mystery item (90 G)', enabled: function () { return (s.gold | 0) >= 90 && (s.inventory || []).length < 40; }, run: function () {
        var L = CC.Loot; if (!L || !L.rollItem) { d.text = 'Sold out.'; return; }
        var it = L.rollItem(Math.max(1, s.bestFloor | 0), 0, 1, s.classId); s.gold -= 90;
        if (L.autoEquip && L.autoEquip(p, it)) d.text = it.name + ' - better than what you wore, so you put it on.';
        else { (s.inventory = s.inventory || []).push(it); d.text = 'You got ' + it.name + ' (in your pack).'; }
      } });
    } else if (n.folk === 'healer') {
      d.text = 'The fire keeps the cold away, and I keep the rest away. Sit and breathe.';
      d.actions.push({ label: 'Rest by the fire', run: function () { p.hp = p.maxHp; p.mana = p.maxMana; d.text = 'Warmth floods back. You feel whole.'; } });
    } else if (n.folk === 'story') d.text = 'They say the sequoias here are older than the mountain. The forest below is their shadow, and the shadow is hungry.';
    else if (n.folk === 'dag') d.text = 'Do not go out at night. Ha! It is always night. Take a torch, and a spare friend.';
    else if (n.folk === 'pip') d.text = 'I counted nineteen arrows tonight. The archers never miss. Do you think they get tired?';
    else if (n.folk === 'captain') d.text = 'My archers hold the wall. Beyond it you are on your own. The guard will lower the bridge when you are ready.';
    else d.text = '...';
    return d;
  }

  /* ---------- shell contract ---------- */
  function applyBridge() {
    var s = st(), m = Town.map, open = !!(s && s.bridgeDown) && Town.bridgeAnim >= 1;
    if (!m || !open) return;
    for (var x = GATE_X; x <= GATE_X + 1; x++) {
      m.kind[FY1 * W + x] = 2; m.tiles[FY1 * W + x] = 0;
      for (var y = MOAT_Y; y <= MOAT_Y + 1; y++) { m.kind[y * W + x] = 6; m.tiles[y * W + x] = 0; }
    }
  }
  Town.load = function () { if (!Town.built) { Town.map = build(); Town.built = true; spawnCreeps(); } return Town.map; };
  Town.enter = function () {
    Town.load();
    var s = st(), p = s.player;
    CC.Dungeon = Town.map; s.area = 'town'; s.map = null;
    Town.dialog = null; Town.hintT = 8; Town.bridgeAnim = s.bridgeDown ? 1 : 0; applyBridge();
    if (p) { var arrive = s.fromForest; p.x = 24 * T; p.y = (arrive ? 30.6 : 24) * T; }
    s.fromForest = false;
    if (CC.Enemies) { CC.Enemies.list.length = 0; CC.Enemies.projectiles.length = 0; }
    if (CC.Loot && CC.Loot.clear) CC.Loot.clear();
    spawnCreeps();
  };
  Town.update = function (dt) {
    var s = st(), p = s.player;
    if (CC.Dungeon !== Town.map) CC.Dungeon = Town.map;
    if (CC.Classes && p && !p.stub) CC.Classes.update(dt, { noCombat: true });
    updateOutside(dt);
    if (Town.hintT > 0) Town.hintT -= dt;
    if (Town.note && (Town.note.t -= dt) <= 0) Town.note = null;
    if (s.bridgeDown && Town.bridgeAnim > 0 && Town.bridgeAnim < 1) { Town.bridgeAnim = Math.min(1, Town.bridgeAnim + dt / 1.6); if (Town.bridgeAnim >= 1) applyBridge(); }
    if (p && Town.dialog && Math.hypot(p.x - Town.dialog.npc.x, p.y - Town.dialog.npc.y) > 96) Town.dialog = null;
    if (p && s.bridgeDown && Town.bridgeAnim >= 1 && p.y > EXIT_Y * T) { s.fromForest = false; CC.startRun(1, 'forest'); }
  };
  Town.draw = function (ctx, cam) {
    var m = Town.load();
    if (CC.Dungeon !== m) CC.Dungeon = m;
    m.draw(ctx, cam);
    drawCreeps(ctx, cam);
    if (CC.Classes && CC.Classes.drawPlayer) CC.Classes.drawPlayer(ctx, cam);
    if (m.drawFront) m.drawFront(ctx, cam); // trees and buildings the hero is standing behind redraw over them
    m.drawLighting(ctx, cam);
  };
  Town.interact = function () {
    var s = st(), p = s.player, m = Town.map;
    if (!p || !m) return;
    if (Town.dialog) { Town.dialog = null; return; }
    var best = null, bd = 60, i;
    for (i = 0; i < m.npcs.length; i++) { var n = m.npcs[i], d = Math.hypot(p.x - n.x, p.y - n.y); if (d < bd) { bd = d; best = n; } }
    if (best) Town.dialog = dialogFor(best);
    else say('Nobody close enough. Speak to the guard at the south gate to leave.');
  };
  Town.drawPanel = function (ctx, Wd, Hd, addHit) {
    var d = Town.dialog, i;
    ctx.save();
    if (Town.hintT > 0 && !d) {
      ctx.globalAlpha = Math.min(1, Town.hintT / 2); ctx.fillStyle = 'rgba(14,10,8,0.7)'; ctx.fillRect(Wd / 2 - 150, Hd * 0.17, 300, 26);
      ctx.fillStyle = '#ffe0a0'; ctx.font = 'bold 12px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('Speak to the guard at the south gate [F]', Wd / 2, Hd * 0.17 + 17); ctx.globalAlpha = 1;
    }
    if (Town.note) { ctx.fillStyle = 'rgba(14,10,8,0.8)'; ctx.fillRect(Wd / 2 - 150, Hd * 0.25, 300, 24); ctx.fillStyle = '#f0e6d0'; ctx.font = '11px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText(Town.note.text, Wd / 2, Hd * 0.25 + 16); }
    if (d) {
      ctx.font = '12px Georgia, serif';
      var words = d.text.split(' '), lines = [], line = '';
      for (i = 0; i < words.length; i++) { var t = line ? line + ' ' + words[i] : words[i]; if (ctx.measureText(t).width > Wd - 70 && line) { lines.push(line); line = words[i]; } else line = t; }
      if (line) lines.push(line);
      var bh = 44 + lines.length * 16 + d.actions.length * 34, bx = 16, bw = Wd - 32, by = Math.max(120, Hd * 0.2);
      ctx.fillStyle = 'rgba(14,10,8,0.92)'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#a06a30'; ctx.lineWidth = 1.5; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      ctx.textAlign = 'left'; ctx.fillStyle = '#ffd890'; ctx.font = 'bold 13px Georgia, serif'; ctx.fillText(d.name, bx + 12, by + 20);
      ctx.fillStyle = '#f0e6d0'; ctx.font = '12px Georgia, serif';
      for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx + 12, by + 40 + i * 16);
      var yy = by + 44 + lines.length * 16;
      addHit(bx, by, bw, bh, function () {}); // registered first (last registered wins a tap): the box swallows taps, buttons sit on top
      d.actions.forEach(function (a) {
        var on = !a.enabled || a.enabled();
        ctx.fillStyle = on ? '#3a5a2a' : 'rgba(255,255,255,0.06)'; ctx.fillRect(bx + 12, yy, bw - 24, 28);
        ctx.strokeStyle = on ? '#e0c070' : 'rgba(255,255,255,0.15)'; ctx.strokeRect(bx + 12.5, yy + 0.5, bw - 25, 27);
        ctx.fillStyle = on ? '#fff' : '#888'; ctx.textAlign = 'center'; ctx.font = 'bold 12px Georgia, serif'; ctx.fillText(a.label, bx + bw / 2, yy + 18);
        if (on) addHit(bx + 12, yy, bw - 24, 28, function () { a.run(); });
        yy += 34;
      });
    }
    ctx.restore();
  };
})(window);
