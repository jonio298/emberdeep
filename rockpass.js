/* CC.RockPass - the rockslide quest and the Rocky Pass.
 *
 * On the Rolling Plains' west path a rockslide blocks the way and three people argue about how to shift it. Once your eagle has
 * hatched and you are level 10 you can send it to scout: it flies over the slide, circles, finds a goat trail in the ridge north
 * of it and the way opens. The trail climbs into the Rocky Pass: a mountain ledge above a far-off valley (lakes, forests, farms
 * and villages drawn far below), fought through with two new monsters (Scree Golem, Crag Harpy, see passmonsters.js) and some
 * familiar ones. The pass ends at a gate to the abandoned village.
 *
 *   isOpen() / setOpen(v)    canScout()    startScout(plainsMap)    update(dt)    drawOverlay(c,W,H)
 *   generate(seed) -> map    drawBackdrop(c,cam)    interact()    enter() (from the plains gate)
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, RP = CC.RockPass = {}, T = CC.TILE || 32, TAU = Math.PI * 2;
  var opened = false, scene = null, title = 0, speech = null;
  function st() { return CC.state; }
  function hero() { var s = st(); return s && s.player; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function seeded(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function say(txt, x, y, col, sz) { if (CC.fx && CC.fx.text) CC.fx.text(x, y, txt, col || '#ffe9a8', sz || 12); }

  /* ---------- the quest state ---------- */
  RP.isOpen = function () { return opened; };
  RP.setOpen = function (v) { opened = !!v; if (opened && CC.Plains && CC.Plains.map && CC.Plains.openGate) CC.Plains.openGate(CC.Plains.map); };
  RP.canScout = function () {
    var q = CC.EggQuest, p = hero(), s = q && q.status && q.status();
    return !!(s && s.hatched && p && (p.level || 1) >= 10);
  };
  RP.scouting = function () { return !!scene; };

  /* ---------- the eagle scouts (a short cutscene driven from here) ---------- */
  RP.startScout = function (map) {
    var p = hero(), Eg = CC.Eagle, S = Eg && Eg._state && Eg._state();
    if (scene || !p || !map || !map.slide || !map.passGate) return false;
    var name = (Eg && Eg.name && Eg.name()) || 'Your eagle';
    scene = { t: 0, map: map, name: name, p0: { x: p.x, y: p.y }, sx: map.slide.x, sy: map.slide.y, gx: map.passGate.x, gy: map.passGate.y, said: {}, opened: false };
    if (!S && Eg && Eg._state) S = Eg._state();
    return true;
  };
  function eagleScript(on, x, y, z, face) {
    var S = CC.Eagle && CC.Eagle._state && CC.Eagle._state();
    if (!S) return;
    if (!on) { S.script = null; return; }
    S.script = { x: x, y: y, z: z, face: face };
  }
  function line(sc, k, txt, col) { if (!sc.said[k]) { sc.said[k] = 1; speech = { txt: txt, col: col || '#f0e6d0', t0: scene ? scene.t : 0, who: sc.who || '' }; } }
  RP.update = function (dt) {
    if (title > 0) title = Math.max(0, title - dt);
    var sc = scene, p = hero(), S = CC.Eagle && CC.Eagle._state && CC.Eagle._state();
    if (!sc || !p) { if (CC.camFocus && !sc) { CC.camFocus.k = Math.max(0, CC.camFocus.k - dt * 2.5); if (CC.camFocus.k <= 0) CC.camFocus = null; } return; }
    sc.t += dt;
    var t = sc.t, p0 = sc.p0, sx = sc.sx, sy = sc.sy, gx = sc.gx, gy = sc.gy, pts = sc.map.passPts || [{ x: gx, y: gy }], ent = pts[0], i0;
    p.psyT = Math.max(p.psyT || 0, 0.3); p.psyPull = null; p.invuln = Math.max(p.invuln || 0, 0.3); // the hero watches
    var ex, ey, ez, fx, fy, fk;
    if (t < 1.2) { // take off from the hero's shoulder
      var u = ease(t); ex = p0.x; ey = p0.y - 10; ez = 18 + u * 52; fk = 0.15 * u; fx = p0.x; fy = p0.y;
      line(sc, 0, sc.name + ', scout the pass!', '#ffe9a8');
    } else if (t < 3.6) { // out over the slide, climbing
      var u2 = ease((t - 1.2) / 2.4); ex = p0.x + (sx - p0.x) * u2; ey = p0.y + (sy - p0.y) * u2 - 10; ez = 70 + u2 * 70; fk = 0.15 + 0.85 * u2; fx = ex; fy = ey;
    } else if (t < 5.6) { // circle high above the rocks, drifting north toward the massif
      var u3 = (t - 3.6) / 2, a = u3 * TAU * 1.1, r = 70 * (1 - u3 * 0.3), tx3 = (sx + ent.x) / 2, ty3 = (sy + ent.y) / 2;
      ex = sx + (tx3 - sx) * ease(u3) + Math.cos(a) * r; ey = sy + (ty3 - sy) * ease(u3) - 18 + Math.sin(a) * r * 0.6; ez = 145; fk = 1; fx = ex; fy = ey;
      line(sc, 1, 'The slide is huge... but look, a narrow way winds in among those rocks!', '#bfe9ff');
    } else if (t < 9.6) { // follow the hidden trail through the rocks: it is revealed ahead of the eagle, a dirt and stone path winding between the crags
      var u4 = ease((t - 5.6) / 4), idx = u4 * (pts.length - 1), i1 = Math.floor(idx), fr = idx - i1, a1 = pts[i1], b1 = pts[Math.min(pts.length - 1, i1 + 1)];
      ex = a1.x + (b1.x - a1.x) * fr; ey = a1.y + (b1.y - a1.y) * fr; ez = 140 - u4 * 24; fk = 1; fx = ex; fy = ey;
      var P2 = CC.Plains; if (P2 && P2.openPath) { var ahead = Math.min(1, u4 + 0.12), n0 = sc.map.pathOpened || 0, got = P2.openPath(sc.map, ahead); if (got && CC.fx) { var ai = sc.map.passPath[Math.min(sc.map.passPath.length - 1, (sc.map.pathOpened || 1) - 1)]; var ax = (ai % sc.map.w) * 32 + 16, ay = Math.floor(ai / sc.map.w) * 32 + 16; CC.fx.burst(ax, ay, '#c9b49a', 5, 70); CC.fx.burst(ax, ay, '#6f6a62', 3, 50); } }
      if (CC.fx && CC.fx.shake && Math.random() < 0.08) CC.fx.shake(2);
      if (!sc.opened && u4 > 0.98) { sc.opened = true; RP.setOpen(true); say('A HIDDEN TRAIL!', gx, gy - 28, '#ffe27a', 14); if (CC.fx) { CC.fx.shake(4); CC.fx.burst(gx, gy, '#c9b49a', 22, 90); } if (CC.Vfx) CC.Vfx.spawn('dust', gx, gy, 40, { local: true }); }
      line(sc, 2, 'A hidden pass! It climbs the mountain beside the slide.', '#ffe27a');
    } else if (t < 11.6) { // home again
      var u5 = ease((t - 9.6) / 2); ex = gx + (p.x - gx) * u5; ey = gy + (p.y - 10 - gy) * u5; ez = 116 - u5 * 98; fk = 1 - u5; fx = ex; fy = ey;
    } else { // done
      eagleScript(false); scene = null; speech = { txt: sc.name + ' found a way through! A narrow trail winds into the rocks north of the slide and climbs the mountain.', col: '#f0e6d0', t0: 0, who: 'Foreman Brask', free: 5 };
      if (CC.camFocus) CC.camFocus.k = 0;
      return;
    }
    eagleScript(true, ex, ey, ez, (ex >= (S ? S.x : ex)) ? 1 : -1);
    if (S) S.face = Math.cos(Math.atan2((fy || ey) - ey, (fx || ex) - ex)) >= 0 ? 1 : -1;
    CC.camFocus = { x: fx, y: fy, k: fk };
  };
  RP.drawOverlay = function (c, W, H) {
    var now = Date.now() / 1000, sc = scene;
    if (sc) { // cinematic bars and the story caption
      var e = ease(Math.min(1, sc.t / 0.6)) * (1 - ease((sc.t - 11 ) / 0.6)), h = 46 * e;
      c.save(); c.fillStyle = 'rgba(4,3,8,0.9)'; c.fillRect(0, 0, W, h); c.fillRect(0, H - h, W, h);
      if (speech && sc.t - speech.t0 < 3.2) {
        c.globalAlpha = Math.min(1, (3.2 - (sc.t - speech.t0)) * 2, (sc.t - speech.t0) * 3);
        c.textAlign = 'center'; c.font = 'italic 15px Georgia, serif'; c.fillStyle = speech.col;
        c.shadowColor = '#000'; c.shadowBlur = 6; c.fillText(speech.txt, W / 2, H - h / 2 + 5, W - 30);
      }
      c.restore();
    } else if (speech && speech.free) { // the people react once the cutscene is over
      speech.free -= 1 / 60; if (speech.free <= 0) { speech = null; return; }
      c.save(); c.globalAlpha = Math.min(1, speech.free);
      c.fillStyle = 'rgba(14,10,8,0.88)'; c.fillRect(20, H - 230, W - 40, 56); c.strokeStyle = '#a06a30'; c.lineWidth = 1.5; c.strokeRect(20.5, H - 229.5, W - 41, 55);
      c.fillStyle = '#ffd890'; c.font = 'bold 12px Georgia, serif'; c.textAlign = 'left'; c.fillText(speech.who, 32, H - 212);
      c.fillStyle = '#f0e6d0'; c.font = '12px Georgia, serif'; c.fillText(speech.txt, 32, H - 192, W - 66);
      c.restore();
    }
    var s = st(), p = hero(), m = s && s.map;
    if (s && s.area === 'rocky-pass' && m) {
      if (title > 0) { // the golden title
        var a = title > 5 ? (7 - title) / 2 : Math.min(1, title / 2);
        c.save(); c.globalAlpha = a; c.textAlign = 'center'; c.font = 'italic ' + Math.min(44, W / 8.2) + 'px Georgia, serif'; c.shadowColor = 'rgba(190,220,255,0.9)'; c.shadowBlur = 16; c.fillStyle = 'rgba(236,244,255,0.96)';
        c.fillText('R o c k y   P a s s', W / 2, H * 0.3); c.restore();
      }
      if (p && m.passBack && Math.hypot(p.x - m.passBack.x, p.y - m.passBack.y) < 70) prompt(c, W, H, '[F] Back down to the plains');
      else if (p && m.passExit && Math.hypot(p.x - m.passExit.x, p.y - m.passExit.y) < 80) prompt(c, W, H, '[F] On to the abandoned village');
    }
  };
  function prompt(c, W, H, txt) { c.save(); c.font = 'bold 12px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(14,10,8,0.8)'; var w = c.measureText(txt).width + 24; c.fillRect(W / 2 - w / 2, H * 0.62, w, 24); c.fillStyle = '#ffe08a'; c.fillText(txt, W / 2, H * 0.62 + 16); c.restore(); }
  RP.speechShown = function () { return !!scene; };

  /* ---------- gates ---------- */
  RP.enter = function () { // from the plains goat trail
    if (!opened || !CC.enterRockyPass) return false;
    CC.enterRockyPass(); return true;
  };
  RP.interact = function () { // inside the pass
    var s = st(), p = hero(), m = s && s.map;
    if (!s || s.area !== 'rocky-pass' || !p || !m) return false;
    if (m.passBack && Math.hypot(p.x - m.passBack.x, p.y - m.passBack.y) < 70) { if (CC.leaveRockyPass) CC.leaveRockyPass(); return true; }
    if (m.passExit && Math.hypot(p.x - m.passExit.x, p.y - m.passExit.y) < 80) {
      say('The gate of the abandoned village is just ahead...', p.x, p.y - 26, '#bfe9ff', 12);
      if (CC.AbandonedVillage && CC.AbandonedVillage.enter) CC.AbandonedVillage.enter(); else say('(the village road is still being cleared)', p.x, p.y - 12, '#9aa8b8', 10);
      return true;
    }
    return false;
  };
  RP.nearAction = function () {
    var s = st(), p = hero(), m = s && s.map;
    return !!(s && s.area === 'rocky-pass' && p && m && ((m.passBack && Math.hypot(p.x - m.passBack.x, p.y - m.passBack.y) < 70) || (m.passExit && Math.hypot(p.x - m.passExit.x, p.y - m.passExit.y) < 80)));
  };
  RP.titleOn = function () { title = 7; };

  /* ---------- the far valley (drawn behind the mountain ledge) ---------- */
  var valley = null, villages = [], VN = 640;
  function buildValley() {
    var cv = document.createElement('canvas'); cv.width = VN; cv.height = VN; var c = cv.getContext('2d'), G = 128, cell = VN / G, x, y, i, rng = seeded(90210);
    var ph = [rng() * 6, rng() * 6, rng() * 6, rng() * 6];
    function elev(u, v) { return 0.5 + 0.2 * Math.sin(TAU * (u * 1 + v * 2) + ph[0]) + 0.16 * Math.sin(TAU * (u * 2 - v * 1) + ph[1]) + 0.1 * Math.sin(TAU * (u * 3 + v * 3) + ph[2]) + 0.06 * Math.sin(TAU * (u * 5 - v * 4) + ph[3]); }
    var e = new Float32Array(G * G);
    for (y = 0; y < G; y++) for (x = 0; x < G; x++) {
      var ev = elev(x / G, y / G); e[y * G + x] = ev;
      var n = (Math.sin(x * 12.9 + y * 78.2) * 43758.5) % 1, sh = Math.abs(n) * 10, col;
      if (ev < 0.33) col = 'rgb(' + (38 + sh) + ',' + (92 + sh) + ',' + (128 + sh) + ')';                 // lake
      else if (ev < 0.38) col = 'rgb(' + (176 + sh) + ',' + (166 + sh) + ',' + (120 + sh) + ')';             // shore
      else if (ev < 0.62) col = 'rgb(' + (78 + sh) + ',' + (126 + sh) + ',' + (62 + sh) + ')';               // meadow
      else if (ev < 0.76) col = 'rgb(' + (46 + sh) + ',' + (92 + sh) + ',' + (50 + sh) + ')';                // forest floor
      else col = 'rgb(' + (112 + sh) + ',' + (106 + sh) + ',' + (98 + sh) + ')';                             // rocky hills
      c.fillStyle = col; c.fillRect(Math.floor(x * cell), Math.floor(y * cell), Math.ceil(cell) + 1, Math.ceil(cell) + 1);
    }
    // forests: dark tree crowns
    for (i = 0; i < 2600; i++) {
      x = Math.floor(rng() * G); y = Math.floor(rng() * G); var ev2 = e[y * G + x];
      if (ev2 > 0.6 && ev2 < 0.8) { var tx = x * cell + rng() * cell, ty = y * cell + rng() * cell, tr = 2.2 + rng() * 2.2; c.fillStyle = rng() < 0.5 ? 'rgba(26,66,34,.9)' : 'rgba(40,86,44,.9)'; c.beginPath(); c.arc(tx, ty, tr, 0, TAU); c.fill(); }
    }
    // farms and villages on the meadows
    villages = [];
    for (i = 0; i < 400 && villages.length < 7; i++) {
      x = 6 + Math.floor(rng() * (G - 12)); y = 6 + Math.floor(rng() * (G - 12));
      if (e[y * G + x] < 0.42 || e[y * G + x] > 0.58) continue;
      var vx = x * cell, vy = y * cell, far = true; villages.forEach(function (q) { if (Math.hypot(q.x - vx, q.y - vy) < 90) far = false; });
      if (!far) continue;
      villages.push({ x: vx, y: vy });
      for (var f = 0; f < 9; f++) { c.fillStyle = f % 2 ? 'rgba(190,170,80,.75)' : 'rgba(110,150,70,.75)'; c.fillRect(vx - 34 + (f % 3) * 24 + rng() * 4, vy - 28 + Math.floor(f / 3) * 22, 21, 18); } // patchwork fields
      c.strokeStyle = 'rgba(200,186,150,.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(vx - 40, vy + 22); c.lineTo(vx + 38, vy - 24); c.stroke(); // the road
      for (var h = 0; h < 6; h++) { var hx = vx - 14 + (h % 3) * 12 + rng() * 3, hy = vy - 8 + Math.floor(h / 3) * 12; c.fillStyle = '#8a6a52'; c.fillRect(hx, hy, 7, 6); c.fillStyle = h % 2 ? '#a44a3a' : '#7a4a3a'; c.beginPath(); c.moveTo(hx - 1, hy); c.lineTo(hx + 3.5, hy - 5); c.lineTo(hx + 8, hy); c.closePath(); c.fill(); }
    }
    // a river from the hills into the lake
    c.strokeStyle = 'rgba(70,130,170,.9)'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(60, 20);
    for (i = 1; i < 12; i++) c.lineTo(60 + i * 38 + Math.sin(i * 1.3) * 22, 20 + i * 44 + Math.cos(i * 1.7) * 14); c.stroke();
    valley = cv;
  }
  RP.drawBackdrop = function (c, cam) {
    if (!valley) buildValley();
    var t = Date.now() / 1000, sc = 1.6, size = VN * sc, ox = -((cam.x * 0.3) % size), oy = -((cam.y * 0.3) % size), x, y;
    if (ox > 0) ox -= size; if (oy > 0) oy -= size;
    for (x = ox; x < cam.w; x += size) for (y = oy; y < cam.h; y += size) c.drawImage(valley, x, y, size, size);
    // chimney smoke from the villages, tiny and far off
    c.save(); c.globalAlpha = 0.5; c.fillStyle = '#e8eef2';
    villages.forEach(function (v, i) {
      var vx = ox + v.x * sc, vy = oy + v.y * sc;
      for (var rep = -1; rep <= 1; rep++) for (var rep2 = -1; rep2 <= 1; rep2++) {
        var px = vx + rep * size, py = vy + rep2 * size;
        if (px < -20 || py < -60 || px > cam.w + 20 || py > cam.h + 20) continue;
        for (var k = 0; k < 4; k++) { var u = ((t * 0.18 + k / 4 + i * 0.13) % 1); c.globalAlpha = 0.45 * (1 - u); c.beginPath(); c.arc(px + Math.sin(t + k + i) * 3 + u * 10, py - 6 - u * 26, 1.8 + u * 3, 0, TAU); c.fill(); }
      }
    });
    c.restore();
    // blue atmospheric haze and drifting cloud shadows: the valley is far below
    var hz = c.createLinearGradient(0, 0, 0, cam.h); hz.addColorStop(0, 'rgba(176,200,226,0.38)'); hz.addColorStop(1, 'rgba(150,176,204,0.26)'); c.fillStyle = hz; c.fillRect(0, 0, cam.w, cam.h);
    for (var cl = 0; cl < 6; cl++) {
      var cx = ((cl * 217 + t * (7 + cl)) - cam.x * 0.55) % (cam.w + 400); if (cx < 0) cx += cam.w + 400; cx -= 200;
      var cy = ((cl * 173 + 30) - cam.y * 0.55) % (cam.h + 300); if (cy < 0) cy += cam.h + 300; cy -= 150;
      var gr = c.createRadialGradient(cx, cy, 0, cx, cy, 110 + (cl % 3) * 40); gr.addColorStop(0, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(cx - 160, cy - 160, 320, 320);
    }
  };

  /* ---------- the pass itself ---------- */
  var PW = 76, PH = 66;
  function hash(x, y) { var n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function ground(k, hv, tx, ty) {
    if (k === 10) return 'rgba(0,0,0,0)'; // the drop: the valley shows through
    if (k === 2) return hv < 0.5 ? '#a08e72' : '#9a886c'; // the worn goat trail down the middle
    var v = Math.floor(hv * 12);
    return 'rgb(' + (134 + v) + ',' + (118 + v) + ',' + (96 + v) + ')'; // warm dusty ledge
  }
  function detail(c, k, sx, sy, hv, t, tx, ty) {
    if (k === 10) return;
    var h2 = hash(tx * 7 + 3, ty * 11 + 5);
    if (h2 < 0.3) { c.fillStyle = 'rgba(60,54,48,.35)'; c.fillRect(sx + h2 * 70, sy + hv * 24, 3, 2); }
    if (h2 > 0.9) { c.strokeStyle = 'rgba(50,44,40,.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx + 6, sy + 10); c.lineTo(sx + 14, sy + 16); c.lineTo(sx + 12, sy + 26); c.stroke(); }
    if (h2 > 0.45 && h2 < 0.5) { c.fillStyle = 'rgba(88,110,64,.5)'; c.beginPath(); c.ellipse(sx + 16, sy + 20, 7, 3.5, 0, 0, TAU); c.fill(); }
  }
  function solid(c, k, sx, sy, hv, t, tx, ty, D) {
    var dep = D.rockDepth ? D.rockDepth[ty * PW + tx] : 1, belowVoid = ty + 1 < PH && D.kind[(ty + 1) * PW + tx] === 10, shade = Math.max(0, 14 - dep * 3);
    var topc = 'rgb(' + (118 - dep * 5) + ',' + (124 - dep * 5) + ',' + (134 - dep * 4) + ')', sidec = 'rgb(' + (70 - dep * 3) + ',' + (74 - dep * 3) + ',' + (84 - dep * 3) + ')';
    c.fillStyle = sidec; c.fillRect(sx, sy - 6, T, T + 6);
    c.fillStyle = topc; c.fillRect(sx, sy - 6, T, 11);
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(sx, sy - 6, T, 2);
    c.strokeStyle = 'rgba(30,26,22,.4)'; c.lineWidth = 1; c.beginPath();
    c.moveTo(sx, sy + 10 + hv * 6); c.lineTo(sx + T, sy + 12 + hv * 5); c.moveTo(sx + hv * 20, sy + 5); c.lineTo(sx + hv * 20 + 5, sy + T); c.stroke();
    if (hv > 0.82 && dep <= 2) { c.fillStyle = 'rgba(84,112,60,.5)'; c.fillRect(sx + 4, sy - 6, 12, 3); } // moss
    if (belowVoid) { // the cliff face drops away into the valley
      var g = c.createLinearGradient(0, sy + T, 0, sy + T + 34); g.addColorStop(0, 'rgb(74,68,62)'); g.addColorStop(1, 'rgba(40,36,34,0)');
      c.fillStyle = g; c.fillRect(sx, sy + T, T, 34);
      c.strokeStyle = 'rgba(30,26,24,.35)'; for (var i = 0; i < 3; i++) { c.beginPath(); c.moveTo(sx + 4 + i * 11, sy + T); c.lineTo(sx + 2 + i * 11 + hv * 6, sy + T + 22 + i * 4); c.stroke(); }
    }
  }
  function build(rng) {
    var N = PW * PH, tiles = new Uint8Array(N).fill(1), kind = new Uint8Array(N).fill(9), i, x, y, k;
    function at(tx, ty) { return ty * PW + tx; }
    var S = { x: PW - 9, y: PH - 8 }, G = { x: 9, y: 9 }, ph = rng() * 6, samples = [], n = 260;
    var dxn = G.x - S.x, dyn = G.y - S.y, len = Math.hypot(dxn, dyn), nx = -dyn / len, ny = dxn / len;
    for (k = 0; k <= n; k++) {
      var u = k / n, off = Math.sin(u * Math.PI) * 9 * Math.sin(u * 4 + ph) + Math.sin(u * 17 + ph) * 2.2, w = 3.4 + 1.6 * (0.5 + 0.5 * Math.sin(u * 9 + ph));
      samples.push({ x: S.x + dxn * u + nx * off, y: S.y + dyn * u + ny * off, w: w, u: u, ang: Math.atan2(dyn, dxn) });
    }
    function carve(cx, cy, r, kd) { for (var yy = Math.floor(cy - r); yy <= cy + r; yy++) for (var xx = Math.floor(cx - r); xx <= cx + r; xx++) if (xx > 1 && yy > 1 && xx < PW - 2 && yy < PH - 2 && (xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r) { tiles[at(xx, yy)] = 0; kind[at(xx, yy)] = kd; } }
    samples.forEach(function (s) { carve(s.x, s.y, s.w, 0); });
    samples.forEach(function (s) { carve(s.x, s.y, 1.6, 2); });
    // two wide ledges for the big fights, and three alcoves for chests
    var arenas = [samples[Math.floor(n * 0.36)], samples[Math.floor(n * 0.68)]], alcoves = [];
    arenas.forEach(function (s) { carve(s.x, s.y, 7.5, 0); });
    [0.2, 0.52, 0.84].forEach(function (uu, j) {
      var s = samples[Math.floor(n * uu)], side = j % 2 ? 1 : -1, ax = s.x + nx * side * 9, ay = s.y + ny * side * 9;
      carve(ax, ay, 2.6, 0); for (var q = 0; q <= 1; q += 0.1) carve(s.x + (ax - s.x) * q, s.y + (ay - s.y) * q, 1.3, 0);
      alcoves.push({ x: ax, y: ay });
    });
    // classify everything that is not walkable: cliff wall near the path, then valley (a drop) on the south-west, mountain on the north-east
    var dist = new Int16Array(N).fill(-1), qd = [];
    for (i = 0; i < N; i++) if (!tiles[i]) { dist[i] = 0; qd.push(i); }
    for (var qi = 0; qi < qd.length; qi++) { var c0 = qd[qi], cx = c0 % PW, cy = (c0 / PW) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var xx = cx + d[0], yy = cy + d[1]; if (xx < 0 || yy < 0 || xx >= PW || yy >= PH) return; var ni = at(xx, yy); if (dist[ni] >= 0) return; dist[ni] = dist[c0] + 1; qd.push(ni); }); }
    var rockDepth = new Uint8Array(N);
    for (y = 0; y < PH; y++) for (x = 0; x < PW; x++) {
      i = at(x, y); if (!tiles[i]) continue;
      rockDepth[i] = Math.min(9, dist[i]);
      var bd = 1e9, bs = null; for (k = 0; k < samples.length; k += 3) { var dd = (samples[k].x - x) * (samples[k].x - x) + (samples[k].y - y) * (samples[k].y - y); if (dd < bd) { bd = dd; bs = samples[k]; } }
      var cross = (x - bs.x) * Math.sin(bs.ang) - (y - bs.y) * Math.cos(bs.ang); // > 0 on the south-west side of the path: the valley
      kind[i] = dist[i] > 2 && cross > 0 ? 10 : 9; // beyond the cliff lip nothing is drawn, the far valley shows through
    }
    // boulders scattered on the ledge (kept off the centreline so the way stays open)
    var props = [], chests = [], lights = [];
    for (k = 0; k < 90; k++) {
      var s2 = samples[Math.floor(rng() * samples.length)], ox = (rng() - 0.5) * 2 * s2.w * 0.9, oy = (rng() - 0.5) * 2 * s2.w * 0.9, bx = Math.round(s2.x + ox), by = Math.round(s2.y + oy);
      if (Math.hypot(bx - s2.x, by - s2.y) < 2.2 || bx < 3 || by < 3 || tiles[at(bx, by)] || Math.hypot(bx - S.x, by - S.y) < 6 || Math.hypot(bx - G.x, by - G.y) < 6) continue;
      tiles[at(bx, by)] = 1; kind[at(bx, by)] = 9; rockDepth[at(bx, by)] = 1;
    }
    alcoves.forEach(function (a) { var ch = { tx: Math.round(a.x), ty: Math.round(a.y), x: Math.round(a.x) * T + 16, y: Math.round(a.y) * T + 16, opened: false, tier: 1 }; if (!tiles[at(ch.tx, ch.ty)]) chests.push(ch); });
    // reachability: start must reach the exit and every chest, else rebuild with another seed
    var seen = new Uint8Array(N), q = [at(Math.round(S.x), Math.round(S.y))], qi2 = 0; seen[q[0]] = 1;
    while (qi2 < q.length) { var c1 = q[qi2++], x1 = c1 % PW, y1 = (c1 / PW) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var xx = x1 + d[0], yy = y1 + d[1]; if (xx < 0 || yy < 0 || xx >= PW || yy >= PH) return; var ni = at(xx, yy); if (seen[ni] || tiles[ni]) return; seen[ni] = 1; q.push(ni); }); }
    var ok = seen[at(Math.round(G.x), Math.round(G.y))] === 1; chests.forEach(function (ch) { if (!seen[at(ch.tx, ch.ty)]) ok = false; });
    if (!ok || chests.length < 2) return null;
    var spawn = { x: Math.round(S.x) * T + 16, y: Math.round(S.y) * T + 16 }, exit = { x: Math.round(G.x) * T + 16, y: Math.round(G.y) * T + 16 };
    // monsters: harpies on the open stretches, golems and wolves on the two ledges, a few bears and crows between
    var spawns = [];
    function spot(s, spread) { for (var t2 = 0; t2 < 14; t2++) { var px = Math.round(s.x + (rng() - 0.5) * spread), py = Math.round(s.y + (rng() - 0.5) * spread); if (px > 2 && py > 2 && px < PW - 2 && py < PH - 2 && !tiles[at(px, py)] && seen[at(px, py)]) return { x: px * T + 16, y: py * T + 16 }; } return null; }
    for (k = 14; k < samples.length - 8; k += 22) {
      var s3 = samples[k], pt = spot(s3, s3.w * 1.6); if (!pt || Math.hypot(pt.x - spawn.x, pt.y - spawn.y) < 360 || Math.hypot(pt.x - exit.x, pt.y - exit.y) < 200) continue;
      var r = rng(), type = r < 0.34 ? 'cragharpy' : r < 0.58 ? 'direwolf' : r < 0.7 ? 'crow' : r < 0.82 ? 'bear' : 'screegolem';
      spawns.push({ x: pt.x, y: pt.y, type: type });
    }
    arenas.forEach(function (a, j) { // each ledge holds a golem and company
      var p1 = spot(a, 10), p2 = spot(a, 12), p3 = spot(a, 12);
      if (p1) spawns.push({ x: p1.x, y: p1.y, type: 'screegolem' }); if (p2) spawns.push({ x: p2.x, y: p2.y, type: j ? 'screegolem' : 'cragharpy', pair: !j }); if (p3) spawns.push({ x: p3.x, y: p3.y, type: 'direwolf' });
    });
    function marker(x, y, label, col) { return { x: x, y: y, sortY: -20, draw: function (c, sx, sy, t) { var gl = 0.5 + 0.5 * Math.sin(t * 2.4); c.save(); c.globalAlpha = 0.35 + 0.25 * gl; var g = c.createRadialGradient(sx, sy, 2, sx, sy, 34); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(sx - 36, sy - 36, 72, 72); c.restore(); c.fillStyle = '#4a4036'; c.fillRect(sx - 20, sy - 30, 5, 34); c.fillRect(sx + 15, sy - 30, 5, 34); c.fillRect(sx - 22, sy - 34, 44, 6); c.fillStyle = '#d8c8a0'; c.font = 'bold 8px Georgia'; c.textAlign = 'center'; c.fillText(label, sx, sy - 38); } }; }
    props.push(marker(spawn.x, spawn.y - 40, 'THE PLAINS', 'rgba(255,224,150,.6)'));
    props.push(marker(exit.x, exit.y, 'ABANDONED VILLAGE', 'rgba(150,200,255,.6)'));
    var map = CC.Realm.create({ name: 'Rocky Pass', w: PW, h: PH, kind: kind, tiles: tiles, spawn: { x: spawn.x, y: spawn.y - 8 }, stairs: { x: -999, y: -999, tx: -1, ty: -1 }, chests: chests, enemySpawns: spawns, props: props, lights: lights,
      ambient: '40,54,80,0.14', playerLight: 220, viewR: 300, fog: 0.04, fogColor: '190,205,225', ground: ground, detail: detail, drawSolid: solid, reveal: false, viewBoost: 1.2 });
    map.rockDepth = rockDepth; map.passBack = { x: spawn.x, y: spawn.y - 8 }; map.passExit = exit; map.floor = 1;
    return map;
  }
  RP.generate = function (fixedSeed) {
    var seed = Number.isFinite(fixedSeed) ? fixedSeed >>> 0 : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, map = null, tries = 0;
    while (!map && tries < 24) { map = build(seeded(seed + tries * 7919)); tries++; }
    if (!map) throw new Error('Rocky Pass generation failed');
    map.seed = seed; RP.map = map; RP.titleOn();
    return map;
  };
  RP.reset = function () { opened = false; scene = null; speech = null; eagleScript(false); if (CC.camFocus) CC.camFocus = null; };
  RP.serialize = function () { return opened ? 1 : 0; };
})(window);
