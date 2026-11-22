/* CC.Plains - the Rolling Plains: open, wind-swept grassland between the Giant Forest and the caves. Lighter and far less foggy
 * than the forest, with low hills, tall grass, lone bent trees, boulders, ponds, a ring of standing stones and a drovers' camp.
 *
 * API: generate() -> CC.Realm map (Dungeon-compatible; the shell puts it in CC.Dungeon), interact() -> true when a camp
 *   person was talked to, drawOverlay(ctx,W,H) (fading "Rolling Plains" title + speech).
 * Hills are drawn as shaded ground (a height field lit from the north-west); tall grass sways in the wind; clouds drift over.
 * Places: a winding drovers' road from the forest's hollow (the spawn, north) to a barrow in a rock outcrop (map.stairs, south:
 *   F / USE there drops into cave floor 1), a lit camp with two people, hay and a fire, a ring of standing stones around a chest.
 * Monsters (registered into CC.Enemies.TYPES with weight 0, so only this zone spawns them): direwolf (pack hunter that circles,
 *   then lunges), crow (carrion flock that orbits and dives), scarecrow (dormant on its post until you come close or hurt it,
 *   then a stuttering stalker that summons crows when half dead), mawworm (burrows toward you as a dirt mound, bursts up under
 *   you, then lies exposed). All have blood and/or bone flags, so the death gore in enemies.js applies to them.
 * Hooks (nothing in forest.js or enemies.js is edited): wraps CC.Enemies._think and CC.Enemies.spawnForFloor (the forest wraps
 *   them the same way) and CC.Forest.drawMonster, which the cave renderer's default case calls for unknown types.
 * Load order: after realm.js, enemies.js and forest.js (index.html puts it before town.js).
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var T = CC.TILE = CC.TILE || 32;
  var PI2 = Math.PI * 2;
  var W = 200, H = 112;
  var P = CC.Plains = { map: null, titleStart: 0, speech: null, W: W, H: H };

  function seeded(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ctr(tx, ty) { return { tx: tx, ty: ty, x: tx * T + T / 2, y: ty * T + T / 2 }; }

  /* ---------- terrain art ---------- */
  var shade = null, tall = null;                     // per-tile hill shading (0..80) and tall-grass mask, built with each map
  function hgt(x, y) { return 0.5 + 0.28 * Math.sin(x * 0.075 + Math.sin(y * 0.05) * 1.6) + 0.2 * Math.sin(y * 0.062 - x * 0.03 + 1.3) + 0.12 * Math.sin((x + y) * 0.16); }
  function ground(kind, hv, tx, ty) { var c0 = groundBase(kind, hv, tx, ty), HP = CC.HauntedPond; return HP && HP.ground ? HP.ground(c0, kind, hv, tx, ty) : c0; }
  function groundBase(kind, hv, tx, ty) {
    if (kind === 5) return hv < 0.5 ? '#1c3a4a' : '#1e3e50';
    if (kind === 2) return hv < 0.5 ? '#6b5a3c' : '#625236';
    var v = shade && tx >= 0 && ty >= 0 && tx < W && ty < H ? shade[ty * W + tx] : 30;
    return 'rgb(' + Math.floor(40 + v * 0.62 + hv * 6) + ',' + Math.floor(70 + v * 1.05 + hv * 8) + ',' + Math.floor(34 + v * 0.3) + ')';
  }
  function detail(ctx, kind, sx, sy, hv, t, tx, ty) { var HP = CC.HauntedPond; if (HP && HP.detail && HP.detail(ctx, kind, sx, sy, hv, t, tx, ty)) return; detailBase(ctx, kind, sx, sy, hv, t, tx, ty); }
  function detailBase(ctx, kind, sx, sy, hv, t, tx, ty) {
    var i, x, y, sw;
    if (kind === 5) { // pond ripples and a glint
      var o = Math.sin(t * 1.4 + hv * 20) * 3;
      ctx.strokeStyle = 'rgba(170,210,230,0.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx + 5 + o, sy + 9 + hv * 12); ctx.lineTo(sx + 21 + o, sy + 9 + hv * 12); ctx.stroke();
      if (hv > 0.85) { ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.2 * Math.sin(t * 3 + hv * 30)) + ')'; ctx.fillRect(sx + 12, sy + 14, 3, 1.5); }
      return;
    }
    if (kind === 2) { // wheel ruts, pebbles and hoof marks
      if (hv < 0.3) { ctx.fillStyle = 'rgba(30,20,10,0.22)'; ctx.fillRect(sx + 4, sy + 6 + hv * 40, 24, 2); }
      if (hv > 0.8) { ctx.fillStyle = 'rgba(130,115,90,0.55)'; ctx.fillRect(sx + (hv * 733 % 1) * 24 + 2, sy + (hv * 197 % 1) * 22 + 4, 3, 2); }
      if (hv > 0.45 && hv < 0.5) { ctx.fillStyle = 'rgba(30,20,10,0.25)'; ctx.fillRect(sx + 9, sy + 11, 4, 3); ctx.fillRect(sx + 17, sy + 12, 4, 3); }
      return;
    }
    if (kind !== 0) return;
    var isTall = tall && tall[ty * W + tx], n = isTall ? 5 : hv > 0.45 ? 2 : 0;
    if (n) { // grass blades lean downwind (east) and ripple with the gusts
      ctx.lineWidth = 1.1; ctx.beginPath();
      for (i = 0; i < n; i++) {
        x = sx + ((hv * (i + 3) * 977) % 1) * 28 + 2; y = sy + ((hv * (i + 5) * 313) % 1) * 22 + 9;
        sw = Math.sin(t * 1.7 + tx * 0.32 + ty * 0.11 + i) * 2.2 + (isTall ? 3 : 1.5);
        ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw * 0.4, y - (isTall ? 8 : 4), x + sw, y - (isTall ? 15 : 7));
      }
      ctx.strokeStyle = isTall ? 'rgba(104,150,62,0.85)' : 'rgba(86,128,56,0.6)'; ctx.stroke();
      if (isTall) { ctx.fillStyle = 'rgba(214,200,120,0.7)'; ctx.fillRect(sx + ((hv * 91) % 1) * 24 + 4 + Math.sin(t * 1.7 + tx * 0.32 + ty * 0.11) * 2.5, sy + 1 + ((hv * 53) % 1) * 8, 1.6, 2); }
    }
    if (hv > 0.94) { ctx.fillStyle = hv > 0.97 ? '#e8e4d0' : hv > 0.955 ? '#e8c84a' : '#a87ad8'; ctx.fillRect(sx + 10 + (hv * 71 % 1) * 8, sy + 10, 2.2, 2.2); } // wildflowers
  }
  function afterLight(ctx, cam) { // clouds' shadows drift over the hills and seed-streaks race downwind (cheap)
    var t = Date.now() / 1000, i, w = cam.w, h = cam.h;
    if (CC.HauntedPond && CC.HauntedPond.after) CC.HauntedPond.after(ctx, cam); // the haunted pond's darkness, fog and eyes
    ctx.save();
    ctx.fillStyle = 'rgba(8,16,26,0.1)';
    for (i = 0; i < 3; i++) {
      var sx = (t * 16 + i * 760) % (W * T) - cam.x, sy = (i * 950 + 300 + Math.sin(t * 0.1 + i) * 60) % (H * T) - cam.y;
      if (sx < -220 || sx > w + 220 || sy < -120 || sy > h + 120) continue;
      ctx.beginPath(); ctx.ellipse(sx, sy, 170, 70, 0.1, 0, PI2); ctx.ellipse(sx + 90, sy + 24, 120, 52, 0, 0, PI2); ctx.ellipse(sx - 80, sy + 20, 100, 44, 0, 0, PI2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(225,238,205,0.2)'; ctx.lineWidth = 1; ctx.beginPath();
    for (i = 0; i < 9; i++) {
      var x = (t * (95 + i * 11) + i * 61) % (w + 80) - 40, y = (i * 47 + 20 + Math.sin(t * 0.7 + i) * 9) % h;
      ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10, y - 2, x + 22 + (i % 3) * 6, y + 1);
    }
    ctx.stroke(); ctx.restore();
  }

  function drawTree(ctx, sx, sy, hv, t) { // a lone wind-bent hawthorn: the trunk leans east and the crown streams downwind
    var bx = sx + T / 2, by = sy + T - 2, h = 58 + hv * 42, sway = Math.sin(t * 1.3 + hv * 20) * 1.8, lean = 12 + hv * 8, k;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(bx + 10, by + 2, 22, 5, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.moveTo(bx - 6, by); ctx.quadraticCurveTo(bx - 4, by - h * 0.5, bx + lean + sway * 0.3 - 3, by - h); ctx.lineTo(bx + lean + sway * 0.3 + 3, by - h); ctx.quadraticCurveTo(bx + 5, by - h * 0.5, bx + 7, by); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,100,60,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx - 1, by - 2); ctx.quadraticCurveTo(bx, by - h * 0.5, bx + lean * 0.9 + sway * 0.3 - 1, by - h + 4); ctx.stroke();
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx + lean * 0.4, by - h * 0.55); ctx.lineTo(bx + lean + 14 + sway * 0.5, by - h * 0.78); ctx.moveTo(bx + lean * 0.7, by - h * 0.75); ctx.lineTo(bx + lean + 22 + sway * 0.6, by - h * 0.95); ctx.stroke();
    for (k = 0; k < 7; k++) {
      var cx = bx + lean - 8 + k * 5.5 + sway * (0.4 + k * 0.15), cy = by - h + 2 + (k % 3) * 6 - (k > 4 ? 6 : 0), r = 13 - k * 0.7;
      ctx.fillStyle = '#25421f'; ctx.beginPath(); ctx.ellipse(cx, cy + 3, r * 1.2, r * 0.8, 0, 0, PI2); ctx.fill();
      ctx.fillStyle = '#36602a'; ctx.beginPath(); ctx.ellipse(cx - 1, cy, r, r * 0.7, 0, 0, PI2); ctx.fill();
      ctx.fillStyle = '#4e7e38'; ctx.beginPath(); ctx.ellipse(cx - 3, cy - 3, r * 0.55, r * 0.35, 0, 0, PI2); ctx.fill();
    }
  }
  function drawRock(ctx, sx, sy, hv, big) { // a boulder (or a jagged crag on the ridge around the map)
    var cx = sx + T / 2, by = sy + T - 3, w = big ? 17 : 11 + hv * 5, h = big ? 30 + hv * 22 : 13 + hv * 9, j = hv * 4;
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(cx + 3, by + 1, w * 1.1, 4.5, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#5d5c57'; ctx.beginPath(); ctx.moveTo(cx - w, by); ctx.lineTo(cx - w * 0.9 - j * 0.3, by - h * 0.55); ctx.lineTo(cx - w * 0.4, by - h); ctx.lineTo(cx + w * 0.3 + j * 0.4, by - h * 0.92); ctx.lineTo(cx + w * 0.95, by - h * 0.5); ctx.lineTo(cx + w, by); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#85847a'; ctx.beginPath(); ctx.moveTo(cx - w * 0.9 - j * 0.3, by - h * 0.55); ctx.lineTo(cx - w * 0.4, by - h); ctx.lineTo(cx + w * 0.3 + j * 0.4, by - h * 0.92); ctx.lineTo(cx - w * 0.1, by - h * 0.45); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(20,20,24,0.35)'; ctx.beginPath(); ctx.moveTo(cx + w * 0.3 + j * 0.4, by - h * 0.92); ctx.lineTo(cx + w * 0.95, by - h * 0.5); ctx.lineTo(cx + w, by); ctx.lineTo(cx + w * 0.2, by); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(15,15,18,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - w * 0.1, by - h * 0.45); ctx.lineTo(cx - w * 0.3, by - h * 0.1); ctx.moveTo(cx + w * 0.2, by - h * 0.7); ctx.lineTo(cx + w * 0.35, by - h * 0.3); ctx.stroke();
    ctx.fillStyle = 'rgba(80,120,50,0.7)'; ctx.beginPath(); ctx.ellipse(cx - w * 0.3, by - h * 0.92, w * 0.45, 2.6, -0.1, 0, PI2); ctx.fill();
  }
  function drawStone(ctx, sx, sy, hv, t) { // a standing stone of the ring, runes faintly alive
    var cx = sx + T / 2, by = sy + T - 3, h = 44 + hv * 14, tilt = (hv - 0.5) * 5;
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(cx + 3, by + 1, 11, 4, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#5e5f66'; ctx.beginPath(); ctx.moveTo(cx - 7, by); ctx.lineTo(cx - 6 + tilt, by - h + 5); ctx.lineTo(cx - 2 + tilt, by - h - 2); ctx.lineTo(cx + 4 + tilt, by - h + 3); ctx.lineTo(cx + 7, by); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a7b84'; ctx.beginPath(); ctx.moveTo(cx - 7, by); ctx.lineTo(cx - 6 + tilt, by - h + 5); ctx.lineTo(cx - 2 + tilt, by - h - 2); ctx.lineTo(cx - 2, by); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(122,224,200,' + (0.3 + 0.25 * Math.sin(t * 2 + hv * 9)) + ')'; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(cx - 1 + tilt * 0.6, by - h * 0.75); ctx.lineTo(cx + 3 + tilt * 0.6, by - h * 0.65); ctx.lineTo(cx + tilt * 0.5, by - h * 0.55); ctx.moveTo(cx + tilt * 0.4, by - h * 0.4); ctx.lineTo(cx + 3 + tilt * 0.4, by - h * 0.3); ctx.stroke();
    ctx.fillStyle = 'rgba(80,120,50,0.7)'; ctx.fillRect(cx - 7, by - 5, 14, 5);
  }
  function drawSolid(ctx, kind, sx, sy, hv, t, tx, ty, D) {
    if (kind === 3) { var HPt = CC.HauntedPond; if (!(HPt && HPt.tree && HPt.tree(ctx, sx, sy, hv, t, tx, ty))) drawTree(ctx, sx, sy, hv, t); }
    else if (kind === 8) drawStone(ctx, sx, sy, hv, t);
    else if (kind === 9) { var a = D && D.art ? D.art[ty * W + tx] : 0; if (a) drawRock(ctx, sx, sy, hv, a === 2); } // the barrow's block has no art here: its prop draws the mound
  }

  function drawFire(ctx, sx, sy, t) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 5, 24, 9, 0, 0, PI2); ctx.fill();
    for (var i = 0; i < 8; i++) { var a = i / 8 * PI2; ctx.fillStyle = i % 2 ? '#5a564e' : '#6a665e'; ctx.beginPath(); ctx.ellipse(sx + Math.cos(a) * 17, sy + 2 + Math.sin(a) * 7, 5, 3.6, 0, 0, PI2); ctx.fill(); }
    ctx.fillStyle = '#3a2214'; ctx.save(); ctx.translate(sx, sy); for (i = 0; i < 3; i++) { ctx.rotate(1.05); ctx.fillRect(-13, -2, 26, 4); } ctx.restore();
    for (i = 0; i < 5; i++) {
      var f = Math.sin(t * 11 + i * 1.9), hg = 16 + (i % 3) * 6 + f * 4, ox = (i - 2) * 4 + Math.sin(t * 7 + i) * 1.5;
      ctx.fillStyle = i % 3 === 0 ? '#ff4a1a' : i % 3 === 1 ? '#ff8a2a' : '#ffd36b';
      ctx.beginPath(); ctx.moveTo(sx + ox - 5, sy); ctx.quadraticCurveTo(sx + ox - 3, sy - hg * 0.6, sx + ox + f, sy - hg); ctx.quadraticCurveTo(sx + ox + 3, sy - hg * 0.6, sx + ox + 5, sy); ctx.fill();
    }
    for (i = 0; i < 5; i++) { var a2 = (t * 0.7 + i / 5) % 1; ctx.fillStyle = 'rgba(255,' + Math.floor(150 + 80 * (1 - a2)) + ',60,' + (1 - a2) + ')'; ctx.fillRect(sx + Math.sin(i * 5 + t * 2) * 10 * a2 - 1, sy - 14 - a2 * 52, 2, 2); }
  }
  function drawBale(ctx, sx, sy) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 14, 4, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#b8963a'; ctx.fillRect(sx - 12, sy - 8, 24, 16); ctx.fillStyle = '#d8b84a'; ctx.fillRect(sx - 12, sy - 8, 24, 5);
    ctx.fillStyle = '#6a4a22'; ctx.fillRect(sx - 6, sy - 8, 2, 16); ctx.fillRect(sx + 5, sy - 8, 2, 16);
    ctx.strokeStyle = '#e8cc62'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - 12, sy - 8); ctx.lineTo(sx - 16, sy - 12); ctx.moveTo(sx + 12, sy - 6); ctx.lineTo(sx + 16, sy - 10); ctx.stroke();
  }
  function drawPerson(ctx, sx, sy, t, c, pr) {
    var bob = Math.sin(t * 2 + pr.seed) * 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 8, 3.5, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = pr.cloak; ctx.beginPath(); ctx.moveTo(sx - 7, sy + 8); ctx.lineTo(sx - 5, sy - 6 + bob); ctx.lineTo(sx + 5, sy - 6 + bob); ctx.lineTo(sx + 7, sy + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d8b08a'; ctx.beginPath(); ctx.arc(sx, sy - 10 + bob, 4.5, 0, PI2); ctx.fill();
    ctx.fillStyle = pr.hair; ctx.beginPath(); ctx.arc(sx, sy - 12 + bob, 4.8, Math.PI, 0); ctx.fill();
    var p = CC.state && CC.state.player;
    if (pr.chat && p && Math.hypot(p.x - pr.x, p.y - pr.y) < 330 && !(CC.RockPass && CC.RockPass.scouting())) { // the three argue in turn about the slide
      var cyc = t / 4.2, ci = Math.floor(cyc), turn = ci % 3, ph = cyc - ci;
      if (turn === pr.slot && ph < 0.92) {
        var tx = pr.chat[Math.floor(ci / 3) % pr.chat.length]; ctx.font = '9px Georgia, serif'; var bw = Math.min(190, ctx.measureText(tx).width + 14);
        ctx.save(); ctx.globalAlpha = Math.min(1, ph * 8, (0.92 - ph) * 8); ctx.fillStyle = 'rgba(244,238,222,0.95)'; ctx.fillRect(sx - bw / 2, sy - 46, bw, 17); ctx.beginPath(); ctx.moveTo(sx - 4, sy - 29); ctx.lineTo(sx + 2, sy - 29); ctx.lineTo(sx, sy - 24); ctx.fill();
        ctx.fillStyle = '#2a2018'; ctx.textAlign = 'center'; ctx.fillText(tx, sx, sy - 34, bw - 8); ctx.restore();
      }
    }
    if (p && Math.hypot(p.x - pr.x, p.y - pr.y) < 70) { ctx.font = 'bold 9px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9b0'; ctx.fillText(pr.name + '  [F] talk', sx, sy - (pr.chat ? 60 : 24)); ctx.textAlign = 'left'; }
  }
  function drawBarrow(ctx, sx, sy, t) { // (sx,sy) = bottom-centre of the 5x2 rock block; the barrow mouth is cut into a grassy mound
    var w = 150, h = 74, gl = 0.5 + 0.2 * Math.sin(t * 2.2), i;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy - 2, w * 0.55, 10, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#56564f'; ctx.beginPath(); ctx.moveTo(sx - w / 2, sy); ctx.quadraticCurveTo(sx - w * 0.42, sy - h * 1.05, sx, sy - h); ctx.quadraticCurveTo(sx + w * 0.42, sy - h * 1.05, sx + w / 2, sy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3e5a2c'; ctx.beginPath(); ctx.moveTo(sx - w * 0.46, sy - h * 0.34); ctx.quadraticCurveTo(sx - w * 0.38, sy - h * 1.04, sx, sy - h); ctx.quadraticCurveTo(sx + w * 0.38, sy - h * 1.04, sx + w * 0.46, sy - h * 0.34); ctx.quadraticCurveTo(sx, sy - h * 0.62, sx - w * 0.46, sy - h * 0.34); ctx.fill();
    ctx.fillStyle = '#6e6d64'; for (i = -2; i <= 2; i++) ctx.fillRect(sx + i * 24 - 5, sy - 26 + Math.abs(i) * 3, 10, 26 - Math.abs(i) * 3); // fallen cap stones
    ctx.fillStyle = '#050304'; ctx.beginPath(); ctx.moveTo(sx - 20, sy); ctx.lineTo(sx - 20, sy - 36); ctx.quadraticCurveTo(sx, sy - 60, sx + 20, sy - 36); ctx.lineTo(sx + 20, sy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a7b84'; ctx.fillRect(sx - 27, sy - 40, 7, 40); ctx.fillRect(sx + 20, sy - 40, 7, 40); ctx.fillRect(sx - 27, sy - 46, 54, 7); // standing lintel
    ctx.fillStyle = 'rgba(255,130,70,' + (0.35 * gl) + ')'; ctx.beginPath(); ctx.moveTo(sx - 18, sy); ctx.lineTo(sx - 18, sy - 34); ctx.quadraticCurveTo(sx, sy - 54, sx + 18, sy - 34); ctx.lineTo(sx + 18, sy); ctx.fill();
    ctx.strokeStyle = 'rgba(122,224,200,' + (0.3 + 0.3 * gl) + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); for (i = 0; i < 3; i++) { ctx.moveTo(sx - 22 + i * 22, sy - 43); ctx.lineTo(sx - 18 + i * 22, sy - 43); } ctx.stroke();
    var p = CC.state && CC.state.player, m = P.map;
    if (p && m && Math.hypot(p.x - m.stairs.x, p.y - m.stairs.y) < 60) { ctx.font = 'bold 10px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe08a'; ctx.fillText('[F] Descend into the barrow', sx, sy + 24); ctx.textAlign = 'left'; }
  }


  /* ---------- the rockslide (west path) and the hidden goat trail ---------- */
  function drawSlide(ctx, sx, sy, t) { // (sx,sy) = centre of the blocked gap; a heap of fallen boulders with dust still sifting down
    var i, rs = 1234;
    function rnd() { rs = (Math.imul(rs, 1103515245) + 12345) >>> 0; return rs / 4294967296; }
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(sx + 10, sy + 40, 98, 20, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#4a4740'; ctx.beginPath(); ctx.moveTo(sx - 70, sy + 40); ctx.quadraticCurveTo(sx - 60, sy - 40, sx - 10, sy - 60); ctx.quadraticCurveTo(sx + 50, sy - 66, sx + 84, sy + 40); ctx.closePath(); ctx.fill(); // the heap's mass
    for (i = 0; i < 26; i++) {
      var bx = sx - 74 + rnd() * 150, by = sy + 36 - Math.pow(rnd(), 0.8) * 92, w = 9 + rnd() * 17, h = w * (0.6 + rnd() * 0.5), sh = 74 + Math.floor(rnd() * 40), tilt = (rnd() - 0.5) * 0.8;
      var edge = Math.abs(bx - sx) / 78; by = Math.max(by, sy + 38 - (1 - edge * edge) * 98); // rocks follow the heap's silhouette
      ctx.save(); ctx.translate(bx, by); ctx.rotate(tilt);
      ctx.fillStyle = 'rgb(' + (sh - 24) + ',' + (sh - 26) + ',' + (sh - 30) + ')'; ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(-w * 0.8, -h * 0.7); ctx.lineTo(-w * 0.1, -h); ctx.lineTo(w * 0.8, -h * 0.6); ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgb(' + sh + ',' + (sh - 2) + ',' + (sh - 8) + ')'; ctx.beginPath(); ctx.moveTo(-w * 0.8, -h * 0.7); ctx.lineTo(-w * 0.1, -h); ctx.lineTo(w * 0.8, -h * 0.6); ctx.lineTo(0, -h * 0.35); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#6a5a3c'; for (i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(sx - 40 + i * 22, sy + 36 + (i % 2) * 3, 12, 4, 0, 0, PI2); ctx.fill(); } // spilled earth at the foot
    ctx.fillStyle = '#8a7a5a'; ctx.fillRect(sx - 96, sy + 6, 14, 3); ctx.fillRect(sx - 90, sy + 12, 10, 3); // a snapped wagon plank
    ctx.fillStyle = '#c8b898'; for (i = 0; i < 7; i++) { var a = (t * 0.35 + i / 7) % 1; ctx.globalAlpha = 0.5 * (1 - a); ctx.beginPath(); ctx.arc(sx - 50 + i * 18 + Math.sin(t + i) * 5, sy - 30 - a * 38, 3 + a * 5, 0, PI2); ctx.fill(); } ctx.globalAlpha = 1; // dust drifting off
  }
  function drawGate(ctx, sx, sy, t, pr) { // the goat trail, once the eagle has found it: a cairn marking the way up
    var RP = CC.RockPass; if (!RP || !RP.isOpen()) return;
    var gl = 0.5 + 0.5 * Math.sin(t * 2.2);
    ctx.fillStyle = 'rgba(255,230,150,' + (0.12 + 0.1 * gl) + ')'; ctx.beginPath(); ctx.ellipse(sx + 8, sy + 4, 40, 18, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 14, 4, 0, 0, PI2); ctx.fill();
    [[0, 3, 12], [1, -4, 9], [0, -10, 6]].forEach(function (c) { ctx.fillStyle = '#7a776e'; ctx.beginPath(); ctx.ellipse(sx + c[0], sy + c[1], c[2], c[2] * 0.55, 0, 0, PI2); ctx.fill(); ctx.fillStyle = '#9a978c'; ctx.beginPath(); ctx.ellipse(sx + c[0] - 2, sy + c[1] - 2, c[2] * 0.6, c[2] * 0.3, 0, 0, PI2); ctx.fill(); });
    var p = CC.state && CC.state.player;
    if (p && Math.hypot(p.x - pr.x, p.y - pr.y) < 100) { ctx.font = 'bold 10px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe08a'; ctx.fillText('[F] Climb the goat trail', sx, sy + 28); ctx.textAlign = 'left'; }
  }

  /* ---------- generation ---------- */
  function build(rng) {
    var N = W * H, kind = new Uint8Array(N), tiles = new Uint8Array(N), art = new Uint8Array(N), res = new Uint8Array(N), i, x, y, k;
    function at(tx, ty) { return ty * W + tx; }
    function reserve(cx, cy, r) { for (var yy = Math.floor(cy - r); yy <= cy + r; yy++) for (var xx = Math.floor(cx - r); xx <= cx + r; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H && (xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r) res[at(xx, yy)] = 1; }
    function disc(cx, cy, r, fn) { for (var yy = Math.floor(cy - r); yy <= cy + r; yy++) for (var xx = Math.floor(cx - r); xx <= cx + r; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H && (xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r) fn(xx, yy); }
    shade = new Uint8Array(N); tall = new Uint8Array(N);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { // hills lit from the north-west, plus the tall-grass patches
      i = at(x, y);
      shade[i] = clamp(Math.round(hgt(x, y) * 36 + (hgt(x - 1, y - 1) - hgt(x + 1, y + 1)) * 2.2 * 60 + 14), 0, 80);
      tall[i] = Math.sin(x * 0.21 + 1.3) * Math.sin(y * 0.17 + 0.7) + 0.5 * Math.sin((x - y) * 0.11) > 0.38 ? 1 : 0;
    }

    var spawn = ctr(W >> 1, 4), stx = 20 + Math.floor(rng() * (W - 40)), sty = H - 8, ph = rng() * 6;
    // the drovers' road: a meandering track from the forest's hollow to the barrow
    var samples = [], len = 220, u;
    for (k = 0; k <= len; k++) {
      u = k / len;
      var sm = u * u * (3 - 2 * u), rx = spawn.tx + (stx - spawn.tx) * sm + Math.sin(u * 9 + ph) * 11 * Math.sin(u * Math.PI) + Math.sin(u * 23 + ph * 2) * 2.5, ry = 4 + (sty - 4) * u;
      rx = clamp(rx, 8, W - 9);
      samples.push({ x: rx, y: ry });
      disc(rx, ry, 1.7, function (xx, yy) { kind[at(xx, yy)] = 2; });
      reserve(rx, ry, 2.8);
    }
    reserve(spawn.tx, spawn.ty, 5); reserve(stx, sty - 2, 7);
    // the west path: a track off the road to a gap in the (thickened) west ridge, blocked by a rockslide; the goat trail's pocket lies north of it
    var sy0 = Math.round(H * 0.46), gtY = sy0 - 11, rsm = samples[Math.round(len * (sy0 - 4) / (sty - 4))], tkx;
    for (tkx = 5; tkx <= Math.round(rsm.x); tkx++) { disc(tkx, sy0, 1.6, function (xx, yy) { kind[at(xx, yy)] = 2; }); reserve(tkx, sy0, 3); }
    reserve(9, sy0, 6); reserve(11, gtY, 9);

    var chests = [], props = [], lights = [], npcs = [];
    // the drovers' camp, off the road a little way along it
    var cs = samples[Math.floor(len * 0.36)], cside = rng() < 0.5 ? -1 : 1, cx = clamp(Math.round(cs.x + cside * 7), 10, W - 11), cy = Math.round(cs.y);
    reserve(cx, cy, 6);
    props.push({ x: cx * T + 16, y: cy * T + 16, draw: drawFire });
    lights.push({ x: cx * T + 16, y: cy * T + 6, r: 230, color: '255,160,60', inten: 0.95, flicker: 0.1 });
    [[-1.7, 0.9], [1.9, -0.6], [0.3, -2.0]].forEach(function (b) { props.push({ x: cx * T + 16 + b[0] * T, y: cy * T + 16 + b[1] * T, draw: drawBale }); });
    [
      { name: 'Drover Hale', cloak: '#6a4a2a', hair: '#cfc8c0', dx: -34, dy: 20, lines: ['Cattle gone, wagons gone. Only the wind keeps driving.', 'The wolves here hunt in threes and they do not tire. Keep your back to a boulder.', 'Scarecrows used to guard these fields. Now the fields guard against them.'] },
      { name: 'Tamsin the Shepherd', cloak: '#3a5a4a', hair: '#8a5a2a', dx: 36, dy: 14, lines: ['Do not stand on soft ground. Something big is turning the soil under it.', 'There is a barrow at the end of the road. My sheep walked in, you know. They did not walk out.', 'Warm yourself. The fire is the only honest thing for miles.'] }
    ].forEach(function (pp, j) {
      var o = { x: cx * T + 16 + pp.dx, y: cy * T + 16 + pp.dy, name: pp.name, cloak: pp.cloak, hair: pp.hair, lines: pp.lines, line: 0, seed: j * 1.9, draw: drawPerson, npc: true };
      props.push(o); npcs.push(o);
    });
    var campC = ctr(cx, cy + 2);
    var slideC = ctr(4, sy0), gateC = ctr(3, gtY);
    props.push({ x: slideC.x, y: slideC.y, sortY: 40, draw: drawSlide });
    props.push({ x: gateC.x, y: gateC.y, sortY: 0, reveal: false, draw: function (c, sx, sy, t, cam, pr) { drawGate(c, sx, sy, t, pr); } });
    props.push({ x: 18 * T, y: (gtY + 4) * T + 24, sortY: 0, reveal: false, draw: function (c, sx, sy, t) { var RP2 = CC.RockPass; if (!RP2 || !RP2.isOpen()) return; c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(sx, sy + 4, 12, 4, 0, 0, PI2); c.fill(); [[0, 0, 9], [1, -7, 7], [0, -13, 5]].forEach(function (q) { c.fillStyle = '#7a776e'; c.beginPath(); c.ellipse(sx + q[0], sy + q[1], q[2], q[2] * 0.55, 0, 0, PI2); c.fill(); c.fillStyle = '#9a978c'; c.beginPath(); c.ellipse(sx + q[0] - 2, sy + q[1] - 2, q[2] * 0.6, q[2] * 0.3, 0, 0, PI2); c.fill(); }); } });
    var slideTalk = function (n) {
      var RPq = CC.RockPass, p0 = CC.state && CC.state.player, q = CC.EggQuest, hatched = !!(q && q.status && q.status().hatched);
      if (RPq && RPq.isOpen()) return n.done;
      if (RPq && RPq.canScout() && P.map && !RPq.scouting()) { P.speech = null; setTimeout(function () { RPq.startScout(P.map); }, 700); return n.ask; }
      if (hatched && p0 && (p0.level || 1) < 10 && n.young) return n.young;
      return n.lines[n.line % n.lines.length];
    };
    [
      { name: 'Foreman Brask', cloak: '#7a5a2a', hair: '#5a4a3a', dx: 0, dy: -26, chat: ['Forty tons if it is an ounce. Picks would take a season.', 'The whole hillside let go in the night.'], lines: ['I have a crew of eleven and not one idea. Forty tons of rock, and the next village sits on the far side.', 'We tried levers. We tried prayer. The levers did better.'], done: 'An eagle! Fine bird. My crew is hauling gear up that goat trail already.', ask: 'Wend says your eagle might scout it? Go on then. Show us.', young: 'Your bird is barely out of the egg. Come back when you are both stronger, level ten at least.' },
      { name: 'Mara the Tinker', cloak: '#4a5a7a', hair: '#b06a3a', dx: 4, dy: 8, chat: ['Black powder would shift it, if anyone sold black powder.', 'Or we wait for the spring thaw.'], lines: ['Blast it, I say. Dynamite. But the nearest powder is a month away.', 'My cart is on the other side. So is my whole stock. Typical.'], done: 'The goat trail! I will have my cart up there by sundown.', ask: 'Your eagle can scout above the slide? Then let it fly!', young: 'A hatchling will not fly this high yet. Level ten, then it can try.' },
      { name: 'Wend the Mapmaker', cloak: '#5a6a4a', hair: '#d8d4c8', dx: -4, dy: 38, chat: ['If I were an eagle, I could see over this thing.', 'There must be a way around. Mountains always leave one.'], lines: ['If I were an eagle, I could see over this thing. Every mountain leaves a gap somewhere, you only have to see it from above.', 'I have mapped this ridge for thirty years, and never from higher than my own two feet.'], done: 'Thirty years of mapping and an eagle finds the trail in a minute. I will chart it tonight.', ask: 'That bird... you have an eagle? Oh, would it? Please!', young: 'A hatched eagle! But it is too young to climb that high, level ten at least. Come back then.' }
    ].forEach(function (pp, j) {
      var o = { x: 9 * T + 16 + pp.dx, y: sy0 * T + 16 + pp.dy, name: pp.name, cloak: pp.cloak, hair: pp.hair, lines: pp.lines, chat: pp.chat, done: pp.done, ask: pp.ask, young: pp.young, line: 0, seed: j * 2.3 + 5, slot: j, draw: drawPerson, npc: true, healed: true, talk: slideTalk };
      props.push(o); npcs.push(o);
    });

    // ring of standing stones around a chest, on the other side of the road
    var rs = samples[Math.floor(len * 0.62)], rsd = -cside, rcx = clamp(Math.round(rs.x + rsd * 13), 12, W - 13), rcy = Math.round(rs.y);
    reserve(rcx, rcy, 6);
    for (k = 0; k < 7; k++) { var sa = k / 7 * PI2 + 0.4, stx2 = Math.round(rcx + Math.cos(sa) * 4), sty2 = Math.round(rcy + Math.sin(sa) * 4); kind[at(stx2, sty2)] = 8; tiles[at(stx2, sty2)] = 1; }
    var ch0 = ctr(rcx, rcy); ch0.opened = false; ch0.tier = 1; chests.push(ch0);

    // the haunted pond: a lovely island pond with a bridge and a woman (hauntedpond.js)
    var pond = CC.HauntedPond && CC.HauntedPond.carve ? CC.HauntedPond.carve({ W: W, H: H, at: at, rng: rng, samples: samples, res: res, disc: disc, reserve: reserve, kind: kind, tiles: tiles, art: art, props: props, npcs: npcs, lights: lights }) : null;
    if (!pond && CC.HauntedPond && CC.HauntedPond.carve) return null; // no room for the great pond on this layout: try another seed
    // ponds
    var np = 0, tries = 0;
    while (np < 3 && tries++ < 60) {
      var px = 10 + Math.floor(rng() * (W - 20)), py = 14 + Math.floor(rng() * (H - 30)), pr = 2 + rng() * 1.8, bad = false;
      disc(px, py, pr + 2, function (xx, yy) { if (res[at(xx, yy)]) bad = true; });
      if (bad) continue;
      disc(px, py, pr, function (xx, yy) { kind[at(xx, yy)] = 5; tiles[at(xx, yy)] = 1; });
      reserve(px, py, pr + 2); np++;
    }

    // the barrow: a 5x2 rock block drawn as a mound by one prop; the stairs are the mouth just below it
    for (y = sty - 3; y <= sty - 2; y++) for (x = stx - 2; x <= stx + 2; x++) { kind[at(x, y)] = 9; tiles[at(x, y)] = 1; art[at(x, y)] = 0; }
    for (y = sty - 1; y <= sty + 1; y++) for (x = stx - 3; x <= stx + 3; x++) { kind[at(x, y)] = 2; tiles[at(x, y)] = 0; }
    var stairs = ctr(stx, sty - 1);
    props.push({ x: stairs.x, y: (sty - 1) * T, sortY: 0, front: true, frontBox: { w: 100, h: 110 }, draw: drawBarrow });
    lights.push({ x: stairs.x, y: stairs.y - 10, r: 160, color: '255,130,70', inten: 0.55, flicker: 0.1 });
    lights.push({ x: spawn.x, y: spawn.y, r: 150, color: '255,200,120', inten: 0.5, flicker: 0.05 });

    function isolated(tx, ty) {
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var ni = at(tx + dx, ty + dy); if (tiles[ni] && !(tx + dx < 2 || ty + dy < 2 || tx + dx >= W - 2 || ty + dy >= H - 2) || kind[ni] === 5) return false; }
      return true;
    }
    function plant(tx, ty, kd, ar) {
      if (tx < 3 || ty < 3 || tx >= W - 3 || ty >= H - 3 || res[at(tx, ty)] || kind[at(tx, ty)] !== 0 || !isolated(tx, ty)) return false;
      kind[at(tx, ty)] = kd; tiles[at(tx, ty)] = 1; art[at(tx, ty)] = ar; return true;
    }
    // two chests tucked among boulders (open to the south), then lone trees and scattered boulders
    var cn = 0; tries = 0;
    while (cn < 2 && tries++ < 80) {
      var qx = 8 + Math.floor(rng() * (W - 16)), qy = 14 + Math.floor(rng() * (H - 34));
      if (!isolated(qx, qy) || res[at(qx, qy)] || !isolated(qx, qy - 1) || !isolated(qx - 1, qy) || !isolated(qx + 1, qy)) continue;
      var okq = true; disc(qx, qy, 4, function (xx, yy) { if (res[at(xx, yy)]) okq = false; });
      if (!okq) continue;
      kind[at(qx, qy - 1)] = 9; tiles[at(qx, qy - 1)] = 1; art[at(qx, qy - 1)] = 1; kind[at(qx - 1, qy)] = 9; tiles[at(qx - 1, qy)] = 1; art[at(qx - 1, qy)] = 1; kind[at(qx + 1, qy)] = 9; tiles[at(qx + 1, qy)] = 1; art[at(qx + 1, qy)] = 1;
      var chq = ctr(qx, qy); chq.opened = false; chq.tier = 0; chests.push(chq); reserve(qx, qy, 3); cn++;
    }
    for (k = 0, tries = 0; k < 34 && tries++ < 400;) if (plant(4 + Math.floor(rng() * (W - 8)), 4 + Math.floor(rng() * (H - 8)), 3, 0)) k++;
    for (k = 0, tries = 0; k < 120 && tries++ < 900;) if (plant(4 + Math.floor(rng() * (W - 8)), 4 + Math.floor(rng() * (H - 8)), 9, 1)) k++;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) { kind[at(x, y)] = 9; tiles[at(x, y)] = 1; art[at(x, y)] = 2; } // the ridge ringing the plains
    for (y = 2; y < H - 2; y++) for (x = 2; x <= 5; x++) { kind[at(x, y)] = 9; tiles[at(x, y)] = 1; art[at(x, y)] = Math.abs(y - sy0) <= 1 ? 0 : 2; } // the west ridge is four tiles thick, with the slide filling its gap (no art: its prop draws the heap)
    for (y = gtY - 1; y <= gtY + 1; y++) for (x = 2; x <= 3; x++) { kind[at(x, y)] = 2; tiles[at(x, y)] = 0; art[at(x, y)] = 0; } // the goat trail's pocket, sealed by boulders until the eagle finds it
    for (y = gtY - 1; y <= gtY + 1; y++) for (x = 4; x <= 5; x++) { kind[at(x, y)] = 9; tiles[at(x, y)] = 1; art[at(x, y)] = 1; }
    for (y = gtY - 6; y <= gtY + 6; y++) for (x = 6; x <= 16; x++) { var ex2 = (x - 11) / 6.2, ey2 = (y - gtY) / 6.6; if (ex2 * ex2 + ey2 * ey2 <= 1) { kind[at(x, y)] = 9; tiles[at(x, y)] = 1; art[at(x, y)] = 2; } } // a rocky massif beside the slide
    var wp = [[17, gtY + 4], [14, gtY + 4], [12, gtY + 2], [9, gtY + 3], [7, gtY + 1], [9, gtY - 1], [11, gtY - 3], [8, gtY - 4], [6, gtY - 2], [5, gtY - 1], [4, gtY], [3, gtY]], passPath = [], pathSeen = {}, passPts = [];
    for (k = 0; k < wp.length - 1; k++) { var pa = wp[k], pb = wp[k + 1], stp = Math.ceil(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) * 3); for (var q2 = 0; q2 <= stp; q2++) { var pxx = pa[0] + (pb[0] - pa[0]) * q2 / stp + Math.sin(q2 * 1.7 + k) * 0.25, pyy = pa[1] + (pb[1] - pa[1]) * q2 / stp; passPts.push({ x: pxx * T + 16, y: pyy * T + 16 }); disc(pxx, pyy, 0.95, function (xx, yy) { var ii = at(xx, yy); if (!pathSeen[ii] && xx >= 4 && tiles[ii]) { pathSeen[ii] = 1; passPath.push(ii); } }); } }

    // reachability: start must reach the barrow mouth, every chest and the camp
    var seen = new Uint8Array(N), q = [at(spawn.tx, spawn.ty)], qi = 0;
    seen[q[0]] = 1;
    while (qi < q.length) {
      var c0 = q[qi++], cx0 = c0 % W, cy0 = (c0 / W) | 0, nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var m = 0; m < 4; m++) { var nx = cx0 + nb[m][0], ny = cy0 + nb[m][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; var ni2 = at(nx, ny); if (seen[ni2] || tiles[ni2]) continue; seen[ni2] = 1; q.push(ni2); }
    }
    var ok = seen[at(stairs.tx, stairs.ty)] === 1 && seen[at(campC.tx, campC.ty)] === 1 && seen[at(8, sy0)] === 1 && seen[at(18, gtY + 4)] === 1 && (!pond || seen[at(pond.ix, pond.iy)] === 1), ci;
    for (ci = 0; ci < chests.length; ci++) if (!seen[at(chests[ci].tx, chests[ci].ty)]) ok = false;
    if (!ok || chests.length < 3) return null;

    // monster spawn points on a loose grid (never near the start or the camp)
    var spawns = [], gx, gy;
    function freeSpot(ccx, ccy, r) { for (var t = 0; t < 12; t++) { var tx = clamp(ccx + Math.floor((rng() - 0.5) * r), 4, W - 5), ty = clamp(ccy + Math.floor((rng() - 0.5) * r), 4, H - 5); if (!tiles[at(tx, ty)] && seen[at(tx, ty)] && kind[at(tx, ty)] !== 5) return ctr(tx, ty); } return null; }
    for (gy = 12; gy < H - 6; gy += 9) for (gx = 6; gx < W - 6; gx += 9) {
      if (rng() > 0.62) continue;
      var sp = freeSpot(gx + 4, gy + 4, 9);
      if (!sp || Math.hypot(sp.x - spawn.x, sp.y - spawn.y) < 360 || Math.hypot(sp.x - (cx * T + 16), sp.y - (cy * T + 16)) < 200) continue;
      var rr = rng();
      spawns.push({ x: sp.x, y: sp.y, type: rr < 0.34 ? 'direwolf' : rr < 0.6 ? 'crow' : rr < 0.78 ? 'scarecrow' : 'mawworm' });
    }
    if (pond) spawns = spawns.filter(function (s) { return CC.HauntedPond.keepClear(s.x, s.y); });
    var map = CC.Realm.create({
      name: 'Rolling Plains', w: W, h: H, kind: kind, tiles: tiles, spawn: spawn, stairs: stairs, chests: chests, enemySpawns: spawns, props: props, lights: lights,
      ambient: '34,44,66,0.4', playerLight: 190, viewR: 230, fog: 0.08, fogColor: '170,185,175', ground: ground, detail: detail, drawSolid: drawSolid, afterLight: afterLight
    });
    map.art = art; map.npcs = npcs; map.camp = { x: cx * T + 16, y: cy * T + 16 }; map.floor = 1; map.mainPath = samples;
    map.pond = pond;
    map.slide = { x: slideC.x, y: slideC.y }; map.passGate = { x: gateC.x, y: gateC.y, gy: gtY }; map.passPath = passPath; map.passPts = passPts; map.pathOpened = 0;
    return map;
  }

  P.generate = function (fixedSeed) {
    var seed = Number.isFinite(fixedSeed) ? (fixedSeed >>> 0) :
      (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, map = null, tries = 0;
    while (!map && tries < 16) { map = build(seeded(seed + tries * 7919)); tries++; }
    if (!map) throw new Error('Plains generation failed');
    map.seed = seed;
    P.map = map; P.titleStart = Date.now(); P.speech = null;
    if (CC.RockPass && CC.RockPass.isOpen()) P.openGate(map);
    return map;
  };
  P.openPath = function (map, f) { // the eagle reveals the trail: open the path tiles up to fraction f (0..1), in order from the plain's edge into the rocks
    if (!map || !map.passPath) return 0;
    var n = Math.min(map.passPath.length, Math.ceil(map.passPath.length * f)), i, opened = 0;
    for (i = map.pathOpened || 0; i < n; i++) { var ii = map.passPath[i]; map.tiles[ii] = 0; map.kind[ii] = 2; if (map.art) map.art[ii] = 0; opened++; }
    map.pathOpened = Math.max(map.pathOpened || 0, n); if (map.pathOpened >= map.passPath.length) map.gateOpen = true;
    return opened;
  };
  P.openGate = function (map) { P.openPath(map, 1); }; // the whole trail is open

  P.interact = function () {
    var s = CC.state, p = s && s.player, m = P.map;
    if (!p || !m || CC.Dungeon !== m) return false;
    var best = null, bd = 56, i;
    if (CC.HauntedPond && CC.HauntedPond.interact && CC.HauntedPond.interact()) return true;
    if (CC.RockPass && CC.RockPass.scouting()) return true;
    if (m.passGate && CC.RockPass && CC.RockPass.isOpen() && Math.hypot(p.x - m.passGate.x, p.y - m.passGate.y) < 100) return CC.RockPass.enter();
    for (i = 0; i < m.npcs.length; i++) { var n = m.npcs[i], d = Math.hypot(p.x - n.x, p.y - n.y); if (!n.hidden && d < bd) { bd = d; best = n; } }
    if (!best) return false;
    var text = best.talk ? best.talk(best) : best.lines[best.line % best.lines.length]; best.line++;
    P.speech = { name: best.name, text: text, t0: Date.now() };
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
  P.drawOverlay = function (ctx, Wd, Hd) {
    var now = Date.now(), el = (now - P.titleStart) / 1000;
    if (el >= 0 && el < 7) { // golden title: fades in on the wind, drifts, fades out
      var a = el < 2.5 ? el / 2.5 : el < 4.5 ? 1 : Math.max(0, 1 - (el - 4.5) / 2.5);
      ctx.save();
      ctx.globalAlpha = a * (0.88 + 0.12 * Math.sin(now / 300));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var sz = Math.min(44, Wd / 8.2), yy = Hd * 0.3 - el * 3;
      ctx.font = 'italic ' + sz + 'px Georgia, "Palatino Linotype", serif';
      ctx.shadowColor = 'rgba(255,214,120,0.9)'; ctx.shadowBlur = 16 + 6 * Math.sin(now / 420);
      ctx.fillStyle = 'rgba(250,236,186,0.96)';
      ctx.fillText('R o l l i n g   P l a i n s', Wd / 2 + el * 6, yy);
      ctx.shadowBlur = 0; ctx.globalAlpha *= 0.3; ctx.fillText('R o l l i n g   P l a i n s', Wd / 2 + el * 6 + 4, yy + 3);
      ctx.restore();
    }
    var sp = P.speech;
    if (sp) {
      var age = (now - sp.t0) / 1000, p = CC.state && CC.state.player;
      if (!sp.modal && (age > 6 || (p && P.map && P.map.npcs.every(function (n) { return Math.hypot(p.x - n.x, p.y - n.y) > 110; })))) { P.speech = null; return; }
      if (CC.DialogBox) CC.DialogBox.draw(ctx, Wd, Hd, function () {}, { name: sp.name,
        text: sp.text + (sp.modal ? '  TAP / ACTION TO CONTINUE' : ''), low: true });
    }
  };

  /* ---------- monsters ---------- */
  var E = CC.Enemies, F = CC.Forest;
  function R() { return Math.random(); }
  function mv(e, dx, dy) { var D = CC.Dungeon, r = D && D.moveWithCollision ? D.moveWithCollision(e, dx, dy) : (e.x += dx, e.y += dy, null); return r && (r.hitX || r.hitY); }
  function hurt(p, e, amt) { // same rules as the cave's hurtPlayer: armour, brief i-frames, floating number
    if (!p || p.hp <= 0 || p.invuln > 0) return 0;
    var dmg = Math.max(1, Math.round(amt * 100 / (100 + (p.armor || 0))));
    p.hp -= dmg; p.invuln = 0.45; p.hurtFlash = 0.2;
    if (CC.fx) { if (CC.fx.shake) CC.fx.shake(3); if (CC.fx.text) CC.fx.text(p.x, p.y - 14, '-' + dmg, '#ff5a5a', 12); }
    return dmg;
  }

  var BRAIN = {
    direwolf: function (e, dt, p, d, ang, f, sp) { // closes in, circles to flank, then lunges; the pack wakes together
      if (e.state === 'idle') {
        var orb = d > 115 ? 0.2 * e.strafe : d > 62 ? 1.45 * e.strafe : 2.5 * e.strafe; // close in, then circle at about 80px, backing off if it gets crowded
        mv(e, Math.cos(ang + orb) * sp * 1.05, Math.sin(ang + orb) * sp * 1.05);
        if (e.cd <= 0 && d < 150 && d > 16) this._tele(e, 'lunge', 0.35, ang);
      } else if (e.state === 'telegraph') { if ((e.t -= dt) <= 0) { e.state = 'act'; e.t = 0.34; e.tele = null; } }
      else if (e.state === 'act') {
        e.dangerous = true;
        var hit = mv(e, Math.cos(e.ang) * 340 * f * dt, Math.sin(e.ang) * 340 * f * dt);
        if (hit || (e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.55; }
      } else if (e.state === 'recover') { mv(e, -Math.cos(ang) * sp * 0.5, -Math.sin(ang) * sp * 0.5); if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 0.9 + R() * 0.9; e.strafe = R() < 0.5 ? 1 : -1; } }
      else e.state = 'idle';
    },
    crow: function (e, dt, p, d, ang, f, sp) { // orbits overhead like a carrion wheel, then dives
      if (e.state === 'idle') {
        e.orb = (e.orb === undefined ? R() * PI2 : e.orb) + dt * 2.2 * e.strafe;
        var ta = Math.atan2(p.y + Math.sin(e.orb) * 78 - e.y, p.x + Math.cos(e.orb) * 78 - e.x);
        mv(e, Math.cos(ta) * sp * 1.15, Math.sin(ta) * sp * 1.15);
        if (e.cd <= 0 && d < 170) this._tele(e, 'dash', 0.28, ang);
      } else if (e.state === 'telegraph') { if ((e.t -= dt) <= 0) { e.state = 'act'; e.t = 0.34; e.tele = null; } }
      else if (e.state === 'act') { e.dangerous = true; mv(e, Math.cos(e.ang) * 310 * f * dt, Math.sin(e.ang) * 310 * f * dt); if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.7; } }
      else if (e.state === 'recover') { mv(e, -Math.cos(ang) * sp * 1.2, -Math.sin(ang) * sp * 1.2); if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 0.8 + R() * 1.4; } }
      else e.state = 'idle';
    },
    scarecrow: function (e, dt, p, d, ang, f, sp) { // slumped on its post until you come close or hurt it, then a stuttering stalker
      if (e.dormant) {
        if (d < 105 || e.hp < e.maxHp) {
          e.dormant = false; e.state = 'idle'; e.cd = 0.5;
          if (CC.fx) { if (CC.fx.burst) CC.fx.burst(e.x, e.y, '#d8b84a', 12, 80); if (CC.fx.text) CC.fx.text(e.x, e.y - 30, 'RUSTLE...', '#e8d28a', 11); }
        }
        return;
      }
      if (e.state === 'idle') {
        var jerk = 0.3 + 1.5 * Math.max(0, Math.sin(e.anim * 5));
        mv(e, Math.cos(ang) * sp * jerk, Math.sin(ang) * sp * jerk); // jerky, puppet-like
        if (!e.summoned && e.hp < e.maxHp * 0.5) {
          e.summoned=true;
          e.crowHatch={age:0,side:-1,phase:'peek',birds:[]};
          if(CC.fx&&CC.fx.text)CC.fx.text(e.x,e.y-30,'CROWS IN THE STRAW...','#cfc8d8',10);
        }
        if (e.cd <= 0 && d < 78) this._tele(e, 'strike', 0.5, ang);
      } else if (e.state === 'telegraph') { if ((e.t -= dt) <= 0) { e.state = 'act'; e.t = 0.3; e.tele = null; } }
      else if (e.state === 'act') { e.dangerous = true; mv(e, Math.cos(e.ang) * 230 * f * dt, Math.sin(e.ang) * 230 * f * dt); if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.9; } }
      else if (e.state === 'recover') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 1.2 + R() * 0.8; } }
      else e.state = 'idle';
    },
    mawworm: function (e, dt, p, d, ang, f, sp) { // underground as a dirt mound that tracks you, bursts up beneath you, then lies exposed
      e.collapsed = e.state === 'idle' || e.state === 'telegraph' || e.state === 'recover'; // untargetable while below ground (enemies.js damage() ignores collapsed)
      if (e.state === 'idle') {
        mv(e, Math.cos(ang) * sp * 1.5, Math.sin(ang) * sp * 1.5);
        e.dust = (e.dust || 0) - dt;
        if (e.dust <= 0 && CC.fx && CC.fx.burst) { e.dust = 0.22; CC.fx.burst(e.x, e.y + 4, '#6b5a3c', 2, 30); }
        if (e.cd <= 0 && d < 92) this._tele(e, 'burst', 0.7, ang);
      } else if (e.state === 'telegraph') { // the mound sits and swells under you
        mv(e, Math.cos(ang) * sp * 0.5, Math.sin(ang) * sp * 0.5);
        if ((e.t -= dt) <= 0) {
          e.state = 'act'; e.t = 2.4; e.tele = null; e.collapsed = false;
          if (CC.fx) { if (CC.fx.shake) CC.fx.shake(5); if (CC.fx.burst) { CC.fx.burst(e.x, e.y, '#6b5a3c', 18, 120); CC.fx.burst(e.x, e.y, '#9a7a4a', 10, 80); } }
          if (d < (e.telRad || 52) + (p.r || 8) && hurt(p, e, e.dmg)) mv(p, Math.cos(ang) * 22, Math.sin(ang) * 22);
        }
      } else if (e.state === 'act') { // exposed and thrashing: hurt it now
        e.collapsed = false; e.dangerous = d < e.r + 22;
        if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.5; if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y, '#6b5a3c', 8, 70); }
      } else if (e.state === 'recover') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 2.4 + R() * 1.2; } }
      else e.state = 'idle';
    }
  };

  if (E && E.TYPES && !E.TYPES.direwolf) {
    E.TYPES.direwolf = { name: 'Dire Wolf', hp: 44, spd: 80, dmg: 11, r: 11, xp: 22, color: '#55535a', w: 0, bone: true, blood: '#5a0a0e' };
    E.TYPES.crow = { name: 'Carrion Crow', hp: 9, spd: 112, dmg: 5, r: 6, xp: 7, color: '#17151c', w: 0, blood: '#4a0a12' };
    E.TYPES.scarecrow = { name: 'Scarecrow Horror', hp: 70, spd: 40, dmg: 15, r: 11, xp: 32, color: '#6a5a3a', w: 0, bone: true, blood: '#3a1a0a' };
    E.TYPES.mawworm = { name: 'Maw Worm', hp: 64, spd: 62, dmg: 16, r: 12, xp: 30, color: '#a85a7a', w: 0, telRad: 52, blood: '#6a2a5a' };

    var prevThink = E._think;
    E._think = function (e, dt, p, d, ang, f) {
      var fn = BRAIN[e.type];
      if (!fn) return prevThink.apply(this, arguments);
      e.cd -= dt; e.dangerous = false;
      fn.call(this, e, dt, p, d, ang, f, e.spd * f * dt);
    };

    var prevSpawn = E.spawnForFloor;
    E.spawnForFloor = function (floor, points) {
      if (!(CC.state && CC.state.area === 'plains' && P.map && CC.Dungeon === P.map)) return prevSpawn.apply(this, arguments);
      this.list.length = 0; this.projectiles.length = 0; this.boss = null; this.zones = []; this.remains = []; if (this.gore) this.gore = [];
      if (CC.Loot && CC.Loot.clear) CC.Loot.clear();
      var grp = 7000, i, k, e, n;
      for (i = 0; i < points.length; i++) {
        var pt = points[i];
        if (pt.type === 'direwolf' || pt.type === 'crow') { // packs and flocks wake together
          n = pt.type === 'direwolf' ? 3 : 4 + Math.floor(R() * 2); grp++;
          for (k = 0; k < n; k++) { e = this.spawn(pt.type, pt.x + (R() - 0.5) * 44, pt.y + (R() - 0.5) * 44, 1); e.group = grp; }
        } else {
          e = this.spawn(pt.type, pt.x, pt.y, 1);
          if (pt.type === 'scarecrow') e.dormant = true;
        }
      }
      return this.list;
    };
  }

  /* ---------- monster art (reached through the forest's drawMonster hook; ctx is at the enemy, x already mirrored) ---------- */
  var DRAW = {
    direwolf: function (ctx, e, r, col, dark, t) {
      var an = e.anim, run = Math.sin(an * 14) * 3, st = e.state === 'act' ? 1.25 : 1, open = e.state === 'telegraph' || e.state === 'act', k;
      ctx.fillStyle = dark;
      for (k = 0; k < 4; k++) { var lx = [-0.9, -0.5, 0.5, 0.9][k] * r * st, ph = (k % 2 ? 1 : -1) * (e.state === 'act' ? 4 : run); ctx.fillRect(lx - 1.6, r * 0.2, 3.2, r * 0.75 + ph); ctx.fillRect(lx - 2, r * 0.9 + ph, 4.4, 1.8); }
      ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r * 1.15 * st, -r * 0.2); ctx.quadraticCurveTo(-r * 1.7 * st, -r * 0.5 + run * 0.3, -r * 1.95 * st, -r * 0.05); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(-1, 0, r * 1.25 * st, r * 0.62, 0, 0, PI2); ctx.fill();
      ctx.fillStyle = dark; for (k = 0; k < 7; k++) { var fx = -r * 1.1 * st + k * r * 0.36 * st; ctx.beginPath(); ctx.moveTo(fx, -r * 0.5); ctx.lineTo(fx + 2, -r * 0.5 - 4 - (k % 2) * 3); ctx.lineTo(fx + 4, -r * 0.5); ctx.fill(); }
      ctx.fillStyle = '#6a0f14'; ctx.beginPath(); ctx.ellipse(-r * 0.2, r * 0.05, r * 0.5, r * 0.28, 0, 0, PI2); ctx.fill(); // torn flank, ribs showing
      ctx.strokeStyle = '#d8d4c0'; ctx.lineWidth = 1.2; ctx.beginPath(); for (k = 0; k < 3; k++) { ctx.moveTo(-r * 0.55 + k * r * 0.35, -r * 0.15); ctx.lineTo(-r * 0.5 + k * r * 0.35, r * 0.25); } ctx.stroke();
      ctx.strokeStyle = 'rgba(90,10,14,0.8)'; ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.5); ctx.lineTo(r * 0.55, r * 0.1); ctx.stroke();
      var hx = r * 1.2 * st; // head
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(hx, -r * 0.2, r * 0.5, r * 0.4, 0, 0, PI2); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(hx - r * 0.1, -r * 0.5); ctx.lineTo(hx - r * 0.05, -r * 0.95); ctx.lineTo(hx + r * 0.25, -r * 0.5); ctx.fill();
      // the jaws: a long snout over a lower jaw that hangs open when it telegraphs and snaps shut again and again while it lunges
      var jawOpen = e.state === 'telegraph' ? 0.95 : e.state === 'act' ? Math.max(0.04, 0.5 + 0.55 * Math.cos(an * 24)) : e.state === 'recover' ? 0.3 : 0.13 + 0.04 * Math.sin(an * 3);
      if (CC.Wounds && CC.Wounds.drawJaws) CC.Wounds.drawJaws(ctx, hx + r * 0.12, -r * 0.12, r * 1.2, jawOpen, { fur: col, dark: dark, lower: dark });
      ctx.fillStyle = '#ffd23a'; ctx.shadowColor = '#ffb020'; ctx.shadowBlur = 6; ctx.fillRect(hx + r * 0.12, -r * 0.4, 3, 2.4); ctx.shadowBlur = 0;
    },
    crow: function (ctx, e, r, col, dark, t) {
      var fl = Math.sin(e.anim * 26) * 7, k;
      ctx.fillStyle = dark;
      for (k = -1; k <= 1; k += 2) { // ragged wings with gaps where the feathers are gone
        ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k * (r + 9), -fl - 5); ctx.lineTo(k * (r + 5), -fl + 1); ctx.lineTo(k * (r + 9), -fl + 4); ctx.lineTo(k * (r + 3), 3); ctx.lineTo(k * (r + 6), 7); ctx.lineTo(k * 2, 5); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 1, r * 0.9, r * 0.7, 0, 0, PI2); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * 0.7, 3); ctx.lineTo(-r * 1.5, 6); ctx.moveTo(-r * 0.6, 4); ctx.lineTo(-r * 1.3, 9); ctx.stroke();
      ctx.fillStyle = '#b8968a'; ctx.beginPath(); ctx.arc(r * 0.7, -1.5, r * 0.5, 0, PI2); ctx.fill(); // bald, scabbed head
      ctx.fillStyle = '#d8d4c0'; ctx.beginPath(); ctx.moveTo(r * 1.0, -3); ctx.lineTo(r * 1.9, -0.5); ctx.lineTo(r * 1.5, 0.8); ctx.lineTo(r * 1.0, 0.5); ctx.fill();
      if (e.state === 'act' || e.state === 'telegraph') { ctx.fillStyle = '#8a1218'; ctx.beginPath(); ctx.arc(r * 1.55, 2.4, 1.8, 0, PI2); ctx.fill(); } // gobbet of meat in the beak
      ctx.fillStyle = '#ff5a3a'; ctx.fillRect(r * 0.75, -3, 2, 2);
    },
    scarecrow: function (ctx, e, r, col, dark, t) {
      ctx.save();
      if(e.crowLift)ctx.translate(0,-(e.carryHeight||18));
      var dorm = e.dormant, an = e.anim, step = Math.sin(an * 5) * 2, tele = e.state === 'telegraph' || e.state === 'act', k, lean = dorm ? 0 : Math.sin(an * 5) * 1.5;
      if (dorm) { ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-1.8, -r * 3.1, 3.6, r * 3.9); ctx.fillRect(-r * 1.7, -r * 1.75, r * 3.4, 3); } // its post and crossbar
      else { ctx.fillStyle = dark; ctx.fillRect(-4, r * 0.1, 3, r * 0.8 + step); ctx.fillRect(2, r * 0.1, 3, r * 0.8 - step); } // ragged legs
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-r * 0.85 + lean, -r * 1.25); ctx.lineTo(r * 0.85 + lean, -r * 1.25); ctx.lineTo(r * 0.95, r * 0.3);
      for (k = 0; k < 5; k++) ctx.lineTo(r * 0.95 - k * r * 0.38, r * 0.3 + (k % 2 ? 4 : -1)); // torn hem
      ctx.lineTo(-r * 0.95, r * 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a2a1a'; ctx.fillRect(-r * 0.25 + lean * 0.5, -r * 1.2, r * 0.5, r * 1.4);
      ctx.strokeStyle = '#d8b84a'; ctx.lineWidth = 1.2; ctx.beginPath(); // straw bursting from sleeves and collar
      for (k = 0; k < 4; k++) { ctx.moveTo(-r * 1.0, -r * 1.0 + k * 2); ctx.lineTo(-r * 1.5 - k, -r * 1.2 + k * 3); ctx.moveTo(r * 1.0, -r * 1.0 + k * 2); ctx.lineTo(r * 1.5 + k, -r * 1.2 + k * 3); }
      ctx.stroke();
      ctx.strokeStyle = '#d8d4c0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(r * 1.0, -r * 0.9); ctx.lineTo(r * 1.5, -r * 0.6); ctx.moveTo(r * 1.5, -r * 0.6); ctx.lineTo(r * 1.7, -r * 0.8); ctx.moveTo(r * 1.5, -r * 0.6); ctx.lineTo(r * 1.75, -r * 0.5); ctx.stroke(); // bone fingers through the glove
      if (!dorm) { // pitchfork, raised when it strikes
        var up = tele ? -0.9 : -0.2;
        ctx.save(); ctx.translate(r * 1.5, -r * 0.6); ctx.rotate(up); ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(r * 1.9, 0); ctx.stroke();
        ctx.strokeStyle = '#a8a8b0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(r * 1.9, -4); ctx.lineTo(r * 1.9, 4); ctx.moveTo(r * 1.9, -4); ctx.lineTo(r * 2.6, -4); ctx.moveTo(r * 1.9, 0); ctx.lineTo(r * 2.7, 0); ctx.moveTo(r * 1.9, 4); ctx.lineTo(r * 2.6, 4); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = '#b89a62'; ctx.beginPath(); ctx.arc(lean, -r * 1.65, r * 0.62, 0, PI2); ctx.fill(); // sack head
      ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.moveTo(lean - r * 0.35, -r * 2.2); ctx.lineTo(lean, -r * 2.55); ctx.lineTo(lean + r * 0.35, -r * 2.2); ctx.fill(); // tied top
      if (!dorm) { ctx.shadowColor = '#ff3a2a'; ctx.shadowBlur = 6; }
      ctx.fillStyle = dorm ? '#3a1a10' : '#ff3a2a'; ctx.fillRect(lean - r * 0.4, -r * 1.85, 3, 3); ctx.fillRect(lean + r * 0.1, -r * 1.85, 3, 3); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 1.3; ctx.beginPath(); // stitched mouth, torn open on a strike
      if (tele) { ctx.fillStyle = '#1a0608'; ctx.fillRect(lean - r * 0.4, -r * 1.45, r * 0.8, r * 0.4); ctx.fillStyle = '#e8e4d0'; for (k = 0; k < 4; k++) ctx.fillRect(lean - r * 0.35 + k * r * 0.2, -r * 1.45, 2, 3); }
      else { ctx.moveTo(lean - r * 0.4, -r * 1.3); ctx.lineTo(lean + r * 0.4, -r * 1.3); for (k = 0; k < 5; k++) { ctx.moveTo(lean - r * 0.35 + k * r * 0.18, -r * 1.4); ctx.lineTo(lean - r * 0.3 + k * r * 0.18, -r * 1.2); } ctx.stroke(); }
      // The sleeve is an occupied nest: two blinking eyes, straw rustling,
      // and tiny beaks poking out before the actual crow sprites launch.
      if(e.crowHatch&&e.crowHatch.phase==='peek'){
        var age=e.crowHatch.age,side=e.crowHatch.side||-1,base=side*r*1.08,
            eyeOpen=(Math.sin(age*16)>-.15&&Math.sin(age*10+1)>.2)?1:0.18,
            peek=Math.min(1,Math.max(0,(age-.40)/.65));
        ctx.fillStyle='#1b1315';ctx.beginPath();
        ctx.ellipse(base,-r*.91,r*.52,r*.26,.12,0,PI2);ctx.fill();
        ctx.save();ctx.shadowColor='#ee392f';ctx.shadowBlur=eyeOpen*6;
        ctx.fillStyle='#f44838';
        for(var bi=0;bi<2;bi++)ctx.fillRect(base+(bi?3:-5),-r*.95,2.0,2*eyeOpen);
        ctx.restore();
        for(var pj=0;pj<2;pj++){
          var bx=base+(pj?5:-4);
          // Pointed yellow beaks poke out one after the other.
          var hop=Math.max(0,Math.min(1,(age-.58-pj*.19)/.25))*peek;
          ctx.fillStyle='#d7ac50';ctx.beginPath();
          ctx.moveTo(bx,-r*.83);ctx.lineTo(bx+side*(3+hop*7),-r*.79);
          ctx.lineTo(bx+side*hop*2,-r*.72);ctx.fill();
        }
        ctx.strokeStyle='#d5b769';ctx.lineWidth=1.1;ctx.beginPath();
        for(pj=0;pj<5;pj++){
          var sw=base+Math.sin(age*23+pj*3)*3;
          ctx.moveTo(sw,-r*.86+pj*1.5);
          ctx.lineTo(sw+side*(4+pj),-r*.95+pj*2);
        }
        ctx.stroke();
      }
      // Carry makes the stuffed body swing beneath two struggling birds.
      if(e.crowLift){
        ctx.strokeStyle='#dbbd71';ctx.lineWidth=1.5;ctx.beginPath();
        ctx.moveTo(-r*1.05,-r*1.12);ctx.lineTo(-r*.78,-r*.72);
        ctx.moveTo(r*1.05,-r*1.12);ctx.lineTo(r*.78,-r*.72);
        ctx.stroke();
        ctx.fillStyle='#dfc46b';
        for(var ci=0;ci<5;ci++)ctx.fillRect(-r*1.0+ci*r*.50,r*.18+Math.sin(an*18+ci)*2,2,2);
      }
      ctx.restore();
    },
    mawworm: function (ctx, e, r, col, dark, t) {
      var an = e.anim, under = e.state === 'idle' || e.state === 'telegraph' || e.state === 'recover', k;
      if (under) { // a dirt mound ploughing along; it heaves and cracks under you when it is about to burst
        var tele = e.state === 'telegraph', sh = tele ? (Math.random() - 0.5) * 2 : 0, rise = tele ? 5 + Math.sin(an * 20) * 2 : 2.5;
        ctx.fillStyle = '#5a4a2e'; ctx.beginPath(); ctx.ellipse(sh, r * 0.5, r * 1.4, r * 0.55, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = '#7a6440'; ctx.beginPath(); ctx.ellipse(sh - 1, r * 0.3 - rise * 0.4, r * 1.1, r * 0.45 + rise * 0.15, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = '#8a7650'; ctx.beginPath(); ctx.ellipse(sh - 3, r * 0.1 - rise * 0.5, r * 0.5, r * 0.22, 0, 0, PI2); ctx.fill();
        ctx.strokeStyle = 'rgba(30,20,10,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath();
        for (k = 0; k < 5; k++) { var ca = k / 5 * PI2 + an * 0.4; ctx.moveTo(Math.cos(ca) * r * 0.5, r * 0.4 + Math.sin(ca) * r * 0.2); ctx.lineTo(Math.cos(ca) * r * (1.3 + (tele ? 0.5 : 0)), r * 0.5 + Math.sin(ca) * r * 0.5); }
        ctx.stroke();
        return;
      }
      ctx.fillStyle = '#2a1a0e'; ctx.beginPath(); ctx.ellipse(0, r * 0.6, r * 1.4, r * 0.5, 0, 0, PI2); ctx.fill(); // the hole it came out of
      var segs = 6, sway = Math.sin(an * 3) * 3 + (e.dangerous ? Math.sin(an * 18) * 3 : 0); // exposed: a segmented body rears up and thrashes
      for (k = 0; k < segs; k++) {
        var f = k / segs, sx = sway * f * f * 2.2, sy = r * 0.5 - f * r * 2.6, rad = r * (0.95 - f * 0.28);
        ctx.fillStyle = k % 2 ? dark : col; ctx.beginPath(); ctx.ellipse(sx, sy, rad, rad * 0.62, 0, 0, PI2); ctx.fill();
        ctx.strokeStyle = 'rgba(60,10,40,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, sy, rad, rad * 0.62, 0, 0.2, Math.PI - 0.2); ctx.stroke();
      }
      var hx = sway * 2.2 * 0.7, hy = -r * 2.35; // the maw: rings of teeth around a wet dark throat
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(hx, hy, r * 0.8, r * 0.7, 0, 0, PI2); ctx.fill();
      ctx.fillStyle = '#1a060e'; ctx.beginPath(); ctx.ellipse(hx, hy + 1, r * 0.55, r * 0.5, 0, 0, PI2); ctx.fill();
      ctx.fillStyle = '#e8e4d0'; for (k = 0; k < 9; k++) { var ta = k / 9 * PI2 + an * 0.5; ctx.beginPath(); ctx.moveTo(hx + Math.cos(ta) * r * 0.52, hy + 1 + Math.sin(ta) * r * 0.46); ctx.lineTo(hx + Math.cos(ta + 0.12) * r * 0.2, hy + 1 + Math.sin(ta + 0.12) * r * 0.18); ctx.lineTo(hx + Math.cos(ta + 0.24) * r * 0.52, hy + 1 + Math.sin(ta + 0.24) * r * 0.46); ctx.fill(); }
      ctx.strokeStyle = 'rgba(150,230,120,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx - 3, hy + r * 0.6); ctx.lineTo(hx - 3, hy + r * 1.1 + Math.sin(an * 5) * 2); ctx.stroke(); // slime
    }
  };
  if (F && !F._plainsDraw) {
    F._plainsDraw = true;
    var prevDraw = F.drawMonster;
    F.drawMonster = function (ctx, e, r, col, dark, t) {
      var fn = DRAW[e.type];
      if (fn) { fn(ctx, e, r, col, dark, t); return true; }
      return prevDraw ? prevDraw.apply(this, arguments) : false;
    };
  }

})(window);
