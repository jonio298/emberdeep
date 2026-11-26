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
    var s0 = st(), m0 = s0 && s0.area === 'rocky-pass' && s0.map && s0.map.puzzle ? s0.map : null;
    if (m0) { // the puzzle lives: the elder wakes, the seedling drinks the light, the thorns wither
      var pz = m0.puzzle, hol = pz.hollow, lit = traceBeam(hol).hit;
      if (lit && !hol.lit && Z.planted) say('THE SEEDLING STIRS', pz.bedPoint.x, pz.bedPoint.y - 30, '#bff29a', 11);
      hol.lit = lit;
      if (Z.elder > 0 && Z.elder < 1) { Z.elder = Math.min(1, Z.elder + dt / 4); if (Z.elder >= 1) say('THE ELDER WAKES', pz.elder.x, pz.elder.y - 60, '#8fe06a', 13); }
      if (Z.planted && !Z.petal && lit && Z.grow < 1) { Z.grow = Math.min(1, Z.grow + dt / 6); if (Z.grow >= 1) say('A SUNPETAL BLOOMS', pz.bedPoint.x, pz.bedPoint.y - 40, '#ffe27a', 13); }
      hol.mirrors.forEach(function (mi) { if (mi.glint > 0) mi.glint = Math.max(0, mi.glint - dt * 2.5); });
      if (Z.thorn > 0 && Z.thorn < 1) { Z.thorn = Math.min(1, Z.thorn + dt / 2.2); if (Z.thorn >= 1) { clearThorns(m0); if (CC.fx) CC.fx.burst(pz.thorn.x, pz.thorn.y, '#6aa04a', 24, 110); say('THE WAY IS OPEN', pz.thorn.x, pz.thorn.y - 30, '#bfe9ff', 13); } }
    }
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
      if (dlg && CC.DialogBox) { if (Date.now() - dlg.t0 > 9000) dlg = null; else CC.DialogBox.draw(c, W, H, function () {}, { name: dlg.name, text: dlg.text, low: true, onTap: function () { dlg = null; } }); }
      var carry = carrying();
      if (carry) { c.save(); c.font = 'bold 11px Georgia, serif'; var cw = c.measureText('Carrying ' + carry).width + 22; c.fillStyle = 'rgba(14,10,8,0.78)'; c.fillRect(W / 2 - cw / 2, 60, cw, 22); c.strokeStyle = '#8a6a3a'; c.strokeRect(W / 2 - cw / 2 + 0.5, 60.5, cw - 1, 21); c.fillStyle = '#ffe3a0'; c.textAlign = 'center'; c.fillText('Carrying ' + carry, W / 2, 75); c.restore(); }
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
  /* ---------- the nature puzzle: what you can do where ---------- */
  var dlg = null; // a line of speech: { name, text, t0 }
  function talk(name, text) { dlg = { name: name, text: text, t0: Date.now() }; }
  function carrying() { return Z.petal ? 'a Sunpetal' : Z.acorn ? 'an Elder acorn' : Z.water === 1 ? 'clear spring water' : Z.water === 2 ? 'stagnant water' : ''; }
  function puzzlePoints(m) {
    var pz = m && m.puzzle, out = [];
    if (!pz) return out;
    out.push({ id: 'tablet', x: pz.tablet.x, y: pz.tablet.y, r: 58 }, { id: 'spring', x: pz.spring.x, y: pz.spring.y, r: 58 }, { id: 'stagnant', x: pz.stagnant.x, y: pz.stagnant.y, r: 58 },
      { id: 'elder', x: pz.elder.x, y: pz.elder.y, r: 58 }, { id: 'bed', x: pz.hollow.bed.x, y: pz.hollow.bed.y, r: 50 });
    if (!Z.open) out.push({ id: 'thorn', x: pz.thorn.x, y: pz.thorn.y, r: 92 });
    pz.hollow.mirrors.forEach(function (mi, i) { out.push({ id: 'mirror', i: i, x: mi.x, y: mi.y, r: 50 }); });
    return out;
  }
  function nearestPoint(m, p) { var best = null, bd = 1e9; puzzlePoints(m).forEach(function (q) { var d = Math.hypot(p.x - q.x, p.y - q.y); if (d <= q.r && d < bd) { bd = d; best = q; } }); return best; }
  function puzzleInteract(p, m) {
    var q = nearestPoint(m, p), pz = m.puzzle; if (!q) return false;
    var beam = traceBeam(pz.hollow);
    if (q.id === 'tablet') { talk('A Carved Tablet', 'The mountain keeps a garden, and thorns keep the garden. Clear water wakes the Elder. The Elder\'s seed wants the sun, and the sun\'s own flower will part the thorns. (The sun steals in where the rock is open, and polished stone will turn it.)'); Z.riddle = 1; return true; }
    if (q.id === 'spring') {
      if (Z.water === 1) talk('The Spring', 'You already carry clear water.');
      else { Z.water = 1; if (Z.acorn || Z.petal) { talk('The Spring', 'Your hands are full of other things.'); Z.water = 0; } else { talk('The Spring', 'You cup the clear, cold water of the spring. Carry it carefully.'); say('CLEAR WATER', p.x, p.y - 26, '#bfe9ff', 12); } }
      return true;
    }
    if (q.id === 'stagnant') {
      if (Z.acorn || Z.petal || Z.water === 1) talk('The Pool', 'A green, still pool. It smells of rot. You leave it alone.');
      else { Z.water = 2; talk('The Pool', 'The water is thick and green, and smells of rot. You scoop some anyway...'); say('STAGNANT WATER', p.x, p.y - 26, '#9aba6a', 12); }
      return true;
    }
    if (q.id === 'elder') {
      if (Z.elder >= 1) {
        if (!Z.acornTaken) { Z.acornTaken = 1; Z.acorn = 1; talk('The Elder', 'The Elder\'s leaves whisper. A heavy golden acorn drops into your hand. Plant it where the sun can find it.'); say('ELDER ACORN', p.x, p.y - 26, '#ffd890', 12); }
        else talk('The Elder', 'The old oak rustles contentedly.');
      } else if (Z.elder > 0) talk('The Elder', 'The Elder is stirring...');
      else if (Z.water === 1) { Z.water = 0; Z.elder = 0.001; talk('The Elder', 'You pour the clear water over the roots. The grey bark darkens... buds swell... the withered oak wakes!'); if (CC.fx) CC.fx.burst(q.x, q.y - 30, '#8fe06a', 20, 90); }
      else if (Z.water === 2) { Z.water = 0; talk('The Elder', 'The stagnant water sinks into the roots, and the oak only sags. Rot will not wake it. You pour out the rest. (Fetch clear water.)'); }
      else talk('The Elder', 'A withered oak, grey and dry. Its roots are parched. It needs water.');
      return true;
    }
    if (q.id === 'bed') {
      if (Z.petal) talk('The Hollow', 'The soil is bare now, and warm.');
      else if (Z.planted && Z.grow >= 1) { Z.petal = 1; Z.planted = 0; talk('The Hollow', 'The sunpetal glows in your hand like a small gold flame. Offer it to the thornwall.'); say('SUNPETAL', p.x, p.y - 26, '#ffe27a', 13); }
      else if (Z.planted) talk('The Hollow', beam.hit ? 'The seedling drinks the sunlight. It is growing...' : 'The seed waits in the shade. Sunlight must reach this soil: turn the stone mirrors to steer the beam.');
      else if (Z.acorn) { Z.acorn = 0; Z.planted = 1; talk('The Hollow', 'You press the acorn into the bare soil. It needs sunlight to wake.'); }
      else talk('The Hollow', 'A bed of bare soil in a chamber the sun never reaches. A beam of light slips in from above... but it goes astray among the mirrors.');
      return true;
    }
    if (q.id === 'mirror') {
      var mi = pz.hollow.mirrors[q.i]; mi.o = mi.o === '/' ? '\\' : '/'; mi.glint = 1;
      if (CC.Audio && CC.Audio.fx) CC.Audio.fx('click', { vol: 0.5, gap: 60 });
      if (traceBeam(pz.hollow).hit && !pz.hollow.lit) say('THE LIGHT REACHES THE SOIL', p.x, p.y - 28, '#ffe27a', 12);
      return true;
    }
    if (q.id === 'thorn') {
      if (Z.petal) { Z.petal = 0; Z.open = 1; Z.thorn = 0.001; talk('The Thornwall', 'You hold up the sunpetal. The thorns shudder, draw back, and wither away...'); if (CC.fx) CC.fx.shake(5); }
      else talk('The Thornwall', 'A living wall of thorns blocks the way to the village. Bring it a flower of the sun. (Read the carved tablet by the entrance.)');
      return true;
    }
    return false;
  }
  RP.interact = function () { // inside the pass
    var s = st(), p = hero(), m = s && s.map;
    if (!s || s.area !== 'rocky-pass' || !p || !m) return false;
    if (m.puzzle && puzzleInteract(p, m)) return true;
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
    if (s && s.area === 'rocky-pass' && p && m && m.puzzle && nearestPoint(m, p)) return true;
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

  /* ---------- the pass itself: a mountain maze of chambers ----------
   * A perfect maze of 7x7 chambers joined by three-tile passages, on a plateau above the valley. You start in the south-east and the way to the village
   * lies at the end of the longest dead-end branch, shut by a living THORNWALL. Opening it is a puzzle of nature, spread over dead ends:
   *   a clear SPRING and a stagnant decoy pool -> water for the withered ELDER oak -> it drops an acorn -> plant it in the BARE HOLLOW, a shaded
   *   chamber where a shaft of sunlight must be steered onto the soil with turnable stone mirrors -> the seed blooms into a SUNPETAL ->
   *   offer the sunpetal to the thornwall and the thorns part. A carved tablet at the start tells the riddle. */
  var MW = 12, MH = 10, CELL = 7, WALL = 3, PITCH = CELL + WALL, OFF = 10, PW = MW * PITCH + WALL + OFF * 2, PH = MH * PITCH + WALL + OFF * 2, GRID = 5;
  function fresh() { return { water: 0, acorn: 0, acornTaken: 0, planted: 0, grow: 0, elder: 0, petal: 0, open: 0, thorn: 0, riddle: 0 }; }
  var Z = fresh();
  RP.puzzle = function () { return Z; };
  RP.serializeZ = function () { return JSON.parse(JSON.stringify(Z)); };
  RP.restoreZ = function (d) { Z = fresh(); if (d && typeof d === 'object') for (var k in Z) if (typeof d[k] === 'number' && isFinite(d[k])) Z[k] = d[k]; };
  function hash(x, y) { var n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function ground(k, hv, tx, ty) {
    if (k === 10) return 'rgba(0,0,0,0)'; // the drop: the valley shows through
    if (k === 2) return hv < 0.5 ? '#a08e72' : '#9a886c';
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

  /* ---- the mirror puzzle: a sunbeam enters through the skylight and must be bounced onto the bed ---- */
  // '/' sends (dx,dy) -> (-dy,-dx); '\' sends (dx,dy) -> (dy,dx)
  function reflect(o, dx, dy) { return o === '/' ? [-dy, -dx] : [dy, dx]; }
  function traceBeam(h) { // -> { pts: [[gx,gy]...] (grid cells the light visits; y = -1 is the skylight), hit }
    var pts = [[h.col, -1]], gx = h.col, gy = 0, dx = 0, dy = 1, hit = false, s, i, m, r;
    for (s = 0; s < 60; s++) {
      if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) { pts.push([gx - dx * 0.5, gy - dy * 0.5]); break; } // the light leaves the chamber
      pts.push([gx, gy]);
      if (gx === h.bed.gx && gy === h.bed.gy) { hit = true; break; }
      m = null; for (i = 0; i < h.mirrors.length; i++) if (h.mirrors[i].gx === gx && h.mirrors[i].gy === gy) m = h.mirrors[i];
      if (m) { r = reflect(m.o, dx, dy); dx = r[0]; dy = r[1]; }
      gx += dx; gy += dy;
    }
    return { pts: pts, hit: hit };
  }
  RP.traceBeam = traceBeam;
  function makeHollow(rng, x0, y0) { // tile origin of the chamber interior
    for (var tries = 0; tries < 200; tries++) {
      var a = Math.floor(rng() * GRID), b = 1 + Math.floor(rng() * 2), dir1 = rng() < 0.5 ? -1 : 1, k = 1 + Math.floor(rng() * 3), c = a + dir1 * k;
      var m = 1 + Math.floor(rng() * 2), d = b + m, dir2 = rng() < 0.5 ? -1 : 1, j = 1 + Math.floor(rng() * 3), e = c + dir2 * j;
      if (c < 0 || c >= GRID || d >= GRID || e < 0 || e >= GRID || e === c) continue;
      var h = { x0: x0, y0: y0, col: a, bed: { gx: e, gy: d }, mirrors: [] };
      var need = [[a, b, 0, 1, dir1, 0], [c, b, dir1, 0, 0, 1], [c, d, 0, 1, dir2, 0]]; // [gx, gy, in dx, in dy, out dx, out dy]
      need.forEach(function (n) { var o = reflect('/', n[2], n[3]); var o1 = o[0] === n[4] && o[1] === n[5] ? '/' : '\\'; h.mirrors.push({ gx: n[0], gy: n[1], o: o1, want: o1, decoy: false }); });
      var used = {}; h.mirrors.forEach(function (q) { used[q.gx + ',' + q.gy] = 1; }); used[e + ',' + d] = 1;
      if (Object.keys(used).length < 4) continue; // mirrors and bed on distinct cells
      var path = traceBeam(h); if (!path.hit) continue;
      var onPath = {}; path.pts.forEach(function (p) { onPath[Math.round(p[0]) + ',' + Math.round(p[1])] = 1; });
      for (var dcy = 0; dcy < 2; dcy++) for (var t3 = 0; t3 < 30; t3++) { var qx = Math.floor(rng() * GRID), qy = Math.floor(rng() * GRID), key = qx + ',' + qy; if (used[key] || onPath[key]) continue; used[key] = 1; var oo = rng() < 0.5 ? '/' : '\\'; h.mirrors.push({ gx: qx, gy: qy, o: oo, want: oo, decoy: true }); break; }
      h.mirrors.forEach(function (q) { if (!q.decoy && rng() < 0.85) q.o = q.o === '/' ? '\\' : '/'; }); // scrambled: turn them until the light reaches the soil
      if (traceBeam(h).hit) h.mirrors[0].o = h.mirrors[0].o === '/' ? '\\' : '/';
      if (traceBeam(h).hit) continue;
      return h;
    }
    return null;
  }

  /* ---- art for the puzzle pieces ---- */
  function leaf(c, x, y, s, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, s, s * 0.6, 0.5, 0, TAU); c.fill(); }
  function drawSpring(c, sx, sy, t, stagnant) {
    c.save(); c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(sx, sy + 8, 24, 9, 0, 0, TAU); c.fill();
    c.fillStyle = '#6a6862'; c.beginPath(); c.ellipse(sx, sy + 2, 22, 11, 0, 0, TAU); c.fill(); c.fillStyle = '#85827a'; c.beginPath(); c.ellipse(sx, sy, 22, 10, 0, 0, TAU); c.fill(); // the stone rim
    c.fillStyle = stagnant ? '#3d5a2e' : '#3e8ab4'; c.beginPath(); c.ellipse(sx, sy + 1, 17, 7.5, 0, 0, TAU); c.fill();
    c.strokeStyle = stagnant ? 'rgba(150,190,90,.5)' : 'rgba(220,245,255,.7)'; c.lineWidth = 1; for (var i = 0; i < 2; i++) { var u = ((t * 0.5 + i * 0.5) % 1); c.globalAlpha = 1 - u; c.beginPath(); c.ellipse(sx, sy + 1, 4 + u * 12, 1.6 + u * 5, 0, 0, TAU); c.stroke(); } c.globalAlpha = 1;
    if (stagnant) { c.fillStyle = 'rgba(40,60,20,.8)'; for (var j = 0; j < 5; j++) { c.beginPath(); c.arc(sx - 10 + j * 5, sy + 1 + Math.sin(j * 2) * 2, 2.2, 0, TAU); c.fill(); } c.fillStyle = 'rgba(20,20,10,.8)'; for (var f = 0; f < 3; f++) c.fillRect(sx + Math.sin(t * 3 + f * 2) * 14, sy - 12 - Math.abs(Math.sin(t * 2 + f)) * 6, 1.6, 1.6); }
    else { c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(sx - 12 + ((t * 8) % 24), sy - 1, 3, 1.4); leaf(c, sx - 24, sy + 4, 4, '#4f8a3a'); leaf(c, sx + 25, sy + 3, 4, '#5a9a42'); }
    c.restore();
  }
  function drawElder(c, sx, sy, t) {
    var g = clamp(Z.elder, 0, 1), sway = Math.sin(t * 1.2) * 1.5 * g;
    c.save(); c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(sx, sy + 6, 26, 9, 0, 0, TAU); c.fill();
    c.strokeStyle = g > 0.3 ? '#5a4030' : '#4a4642'; c.lineCap = 'round'; c.lineWidth = 9; c.beginPath(); c.moveTo(sx, sy + 4); c.quadraticCurveTo(sx - 3, sy - 20, sx + sway, sy - 42); c.stroke();
    c.lineWidth = 4; var br = [[-26, -52, -12, -32], [24, -56, 10, -36], [-14, -66, -4, -44], [16, -68, 5, -46]];
    br.forEach(function (b) { c.beginPath(); c.moveTo(sx + sway * 0.6 + b[2] * 0.2, sy - 36); c.quadraticCurveTo(sx + b[2], sy + b[3], sx + b[0] + sway, sy + b[1]); c.stroke(); });
    if (g > 0.02) { var n = Math.round(26 * g); for (var i = 0; i < n; i++) { var a = i * 2.4, rr = 12 + (i % 5) * 7; leaf(c, sx + Math.cos(a) * rr + sway, sy - 52 + Math.sin(a) * rr * 0.7, 3 + g * 3.5, i % 3 ? '#4f9a3c' : '#6fb446'); } }
    else { c.strokeStyle = '#3a3633'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(sx - 26, sy - 52); c.lineTo(sx - 31, sy - 56); c.moveTo(sx + 24, sy - 56); c.lineTo(sx + 30, sy - 58); c.stroke(); }
    if (g >= 1 && !Z.acorn && !Z.planted && !Z.petal && !Z.acornTaken) { c.fillStyle = '#b4843a'; c.beginPath(); c.ellipse(sx + 14, sy + 6, 3.4, 4.4, 0, 0, TAU); c.fill(); c.fillStyle = '#6a4a24'; c.fillRect(sx + 11.5, sy + 1.5, 5, 2.4); c.save(); c.globalAlpha = 0.35 + 0.25 * Math.sin(t * 3); c.fillStyle = '#ffe9a0'; c.beginPath(); c.arc(sx + 14, sy + 6, 8, 0, TAU); c.fill(); c.restore(); }
    c.restore();
  }
  function drawBed(c, sx, sy, t, lit) {
    c.save(); c.fillStyle = '#3a2c20'; c.beginPath(); c.ellipse(sx, sy + 2, 15, 8, 0, 0, TAU); c.fill(); c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1; c.beginPath(); c.moveTo(sx - 8, sy + 1); c.lineTo(sx - 2, sy + 4); c.lineTo(sx + 5, sy); c.moveTo(sx + 2, sy + 5); c.lineTo(sx + 9, sy + 3); c.stroke();
    if (lit) { c.globalCompositeOperation = 'lighter'; var gr = c.createRadialGradient(sx, sy, 1, sx, sy, 26); gr.addColorStop(0, 'rgba(255,240,170,' + (0.55 + 0.2 * Math.sin(t * 4)) + ')'); gr.addColorStop(1, 'rgba(255,200,80,0)'); c.fillStyle = gr; c.beginPath(); c.arc(sx, sy, 26, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over'; }
    var gro = clamp(Z.grow, 0, 1);
    if (Z.planted && !Z.petal) {
      c.strokeStyle = '#5ea83c'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(sx, sy + 2); c.quadraticCurveTo(sx + 2, sy - 4 - gro * 14, sx + Math.sin(t * 1.5) * 1.5, sy - 6 - gro * 26); c.stroke();
      leaf(c, sx - 5, sy - 3 - gro * 8, 3 + gro * 3, '#6fc447'); leaf(c, sx + 6, sy - 5 - gro * 10, 3 + gro * 3, '#5ab03a');
      if (gro >= 1) { var py = sy - 34; c.save(); c.globalCompositeOperation = 'lighter'; var g2 = c.createRadialGradient(sx, py, 1, sx, py, 20); g2.addColorStop(0, 'rgba(255,230,120,.9)'); g2.addColorStop(1, 'rgba(255,190,60,0)'); c.fillStyle = g2; c.beginPath(); c.arc(sx, py, 20, 0, TAU); c.fill(); c.restore(); for (var p2 = 0; p2 < 8; p2++) { var pa = p2 * TAU / 8 + t * 0.4; c.fillStyle = p2 % 2 ? '#ffd24a' : '#fff0a0'; c.beginPath(); c.ellipse(sx + Math.cos(pa) * 7, py + Math.sin(pa) * 5, 4, 2.2, pa, 0, TAU); c.fill(); } c.fillStyle = '#ff9a2a'; c.beginPath(); c.arc(sx, py, 3, 0, TAU); c.fill(); }
    }
    c.restore();
  }
  function drawMirror(c, sx, sy, t, m) {
    c.save(); c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(sx, sy + 9, 12, 5, 0, 0, TAU); c.fill();
    c.fillStyle = '#6c6962'; c.fillRect(sx - 8, sy - 4, 16, 14); c.fillStyle = '#8a867c'; c.fillRect(sx - 8, sy - 6, 16, 4); // the pedestal
    var s = m.o === '/' ? 1 : -1; c.strokeStyle = '#dff4ff'; c.lineWidth = 3.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(sx - 8 * s, sy + 8 - 2); c.lineTo(sx + 8 * s, sy - 18); c.stroke(); // the polished mirror face
    c.strokeStyle = 'rgba(120,180,220,.8)'; c.lineWidth = 1.2; c.stroke();
    if (m.glint) { c.globalAlpha = m.glint; c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.moveTo(sx - 8 * s, sy + 6); c.lineTo(sx + 8 * s, sy - 18); c.stroke(); }
    c.restore();
  }
  function drawBeam(c, cam, h, t) {
    var tr = traceBeam(h), pts = tr.pts, gx0 = (h.x0 + 1) * T + T / 2, gy0 = (h.y0 + 1) * T + T / 2, i;
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    function P(p) { return [gx0 + p[0] * T - cam.x, gy0 + p[1] * T - cam.y - 6]; }
    for (var pass = 0; pass < 3; pass++) {
      c.strokeStyle = pass === 0 ? 'rgba(255,230,140,0.16)' : pass === 1 ? 'rgba(255,240,170,0.35)' : 'rgba(255,255,230,0.85)'; c.lineWidth = pass === 0 ? 20 : pass === 1 ? 9 : 2.4;
      c.beginPath(); for (i = 0; i < pts.length; i++) { var q = P(pts[i]); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); } c.stroke();
    }
    for (i = 0; i < pts.length - 1; i++) { // motes riding the light
      var a = P(pts[i]), b = P(pts[i + 1]); for (var k = 0; k < 3; k++) { var u = (t * 0.6 + k / 3 + i * 0.17) % 1; c.fillStyle = 'rgba(255,250,210,' + 0.7 * Math.sin(u * Math.PI) + ')'; c.fillRect(a[0] + (b[0] - a[0]) * u - 1, a[1] + (b[1] - a[1]) * u - 1, 2, 2); }
    }
    var top = P([h.col, -1]); var g = c.createRadialGradient(top[0], top[1], 2, top[0], top[1], 40); g.addColorStop(0, 'rgba(255,245,200,.7)'); g.addColorStop(1, 'rgba(255,220,120,0)'); c.fillStyle = g; c.beginPath(); c.arc(top[0], top[1], 40, 0, TAU); c.fill(); // the skylight
    c.restore();
  }
  function drawThorns(c, sx, sy, t) {
    var wither = clamp(Z.thorn, 0, 1); if (wither >= 1) return;
    c.save(); c.globalAlpha = 1 - wither * 0.9; var w = 3 * T, h = 3 * T;
    c.fillStyle = 'rgba(20,34,16,.85)'; c.fillRect(sx - w / 2, sy - h / 2 - 6, w, h + 6);
    for (var i = 0; i < 16; i++) {
      var x0 = sx - w / 2 + (i % 8) * (w / 8) + 6, y0 = sy + h / 2 - 6, sw = Math.sin(t * 1.3 + i) * 1.5, len = h * (0.7 + (i % 3) * 0.12) * (1 - wither * 0.6);
      c.strokeStyle = i % 2 ? '#2f5a28' : '#3d7030'; c.lineWidth = 3.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.bezierCurveTo(x0 + 12 + sw, y0 - len * 0.35, x0 - 14, y0 - len * 0.6, x0 + 6 + sw, y0 - len); c.stroke();
      c.fillStyle = '#c8c0a0'; for (var s = 0; s < 4; s++) { var u = 0.2 + s * 0.2, tx = x0 + Math.sin(u * 5 + i) * 9, ty = y0 - len * u; c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + 5, ty - 4); c.lineTo(tx + 1, ty + 3); c.fill(); }
    }
    c.fillStyle = 'rgba(200,60,70,.8)'; for (var r = 0; r < 4; r++) { c.beginPath(); c.arc(sx - 30 + r * 20, sy - 6 + Math.sin(r) * 10, 2.4, 0, TAU); c.fill(); } // red thorn berries
    c.restore();
  }
  function drawTablet(c, sx, sy) {
    c.save(); c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(sx, sy + 8, 14, 5, 0, 0, TAU); c.fill();
    c.fillStyle = '#7a776e'; c.fillRect(sx - 11, sy - 26, 22, 32); c.beginPath(); c.arc(sx, sy - 26, 11, Math.PI, 0); c.fill(); c.fillStyle = '#9a978c'; c.fillRect(sx - 11, sy - 26, 4, 32);
    c.strokeStyle = '#4a483f'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(sx - 5, sy - 22); c.lineTo(sx + 6, sy - 22); c.moveTo(sx - 5, sy - 16); c.lineTo(sx + 5, sy - 16); c.moveTo(sx - 5, sy - 10); c.lineTo(sx + 6, sy - 10); c.moveTo(sx - 5, sy - 4); c.lineTo(sx + 4, sy - 4); c.stroke();
    c.restore();
  }

  function build(rng) {
    var N = PW * PH, tiles = new Uint8Array(N).fill(1), kind = new Uint8Array(N).fill(9), i, j, x, y, k;
    function at(tx, ty) { return ty * PW + tx; }
    function cx0(ci) { return OFF + WALL + (ci % MW) * PITCH; }
    function cy0(ci) { return OFF + WALL + Math.floor(ci / MW) * PITCH; }
    function ctrT(ci) { return { tx: cx0(ci) + (CELL >> 1), ty: cy0(ci) + (CELL >> 1) }; }
    function ctrP(ci) { var c0 = ctrT(ci); return { x: c0.tx * T + T / 2, y: c0.ty * T + T / 2 }; }
    // the maze: a depth-first carve from the south-east chamber
    var NC = MW * MH, open = []; for (i = 0; i < NC; i++) open.push([0, 0, 0, 0]); // E S W N
    var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], seen = new Uint8Array(NC), start = NC - 1, stack = [start]; seen[start] = 1;
    while (stack.length) {
      var cur = stack[stack.length - 1], ci2 = cur % MW, cj2 = Math.floor(cur / MW), opts = [];
      for (k = 0; k < 4; k++) { var ni2 = ci2 + DX[k], nj2 = cj2 + DY[k]; if (ni2 >= 0 && nj2 >= 0 && ni2 < MW && nj2 < MH && !seen[nj2 * MW + ni2]) opts.push(k); }
      if (!opts.length) { stack.pop(); continue; }
      var dk = opts[Math.floor(rng() * opts.length)], nxt = (cj2 + DY[dk]) * MW + ci2 + DX[dk];
      open[cur][dk] = 1; open[nxt][(dk + 2) % 4] = 1; seen[nxt] = 1; stack.push(nxt);
    }
    // carve the chambers and the three-tile passages
    function floor(x0, y0, w, h, kd) { for (var yy = y0; yy < y0 + h; yy++) for (var xx = x0; xx < x0 + w; xx++) { tiles[at(xx, yy)] = 0; kind[at(xx, yy)] = kd || 0; } }
    var mid = (CELL - 3) >> 1; // the passage is centred on the chamber's wall
    for (i = 0; i < NC; i++) {
      floor(cx0(i), cy0(i), CELL, CELL, 0);
      if (open[i][0]) floor(cx0(i) + CELL, cy0(i) + mid, WALL, 3, 0);
      if (open[i][1]) floor(cx0(i) + mid, cy0(i) + CELL, 3, WALL, 0);
    }
    // graph distances from a chamber
    function bfs(from) { var d = new Int16Array(NC).fill(-1), q = [from], qi = 0; d[from] = 0; while (qi < q.length) { var c0 = q[qi++]; for (var kk = 0; kk < 4; kk++) if (open[c0][kk]) { var n3 = (Math.floor(c0 / MW) + DY[kk]) * MW + (c0 % MW) + DX[kk]; if (d[n3] < 0) { d[n3] = d[c0] + 1; q.push(n3); } } } return d; }
    function degree(c0) { return open[c0][0] + open[c0][1] + open[c0][2] + open[c0][3]; }
    var fromStart = bfs(start), leaves = [];
    for (i = 0; i < NC; i++) if (i !== start && degree(i) === 1) leaves.push(i);
    if (leaves.length < 9) return null;
    leaves.sort(function (a, b) { return fromStart[b] - fromStart[a]; });
    var goal = leaves[0], taken = {}, chosen = [start, goal]; taken[goal] = 1;
    var dists = {}; dists[start] = fromStart; dists[goal] = bfs(goal);
    function pickLeaf() { // the leaf farthest (in chambers) from everything chosen so far
      var best = -1, bs = -1;
      leaves.forEach(function (l) { if (taken[l]) return; var m = 1e9; chosen.forEach(function (c0) { m = Math.min(m, dists[c0][l]); }); if (m > bs) { bs = m; best = l; } });
      if (best < 0) return -1; taken[best] = 1; chosen.push(best); dists[best] = bfs(best); return best;
    }
    var roles = {}; ['hollow', 'spring', 'elder', 'stagnant', 'cave', 'chest1', 'chest2', 'chest3'].forEach(function (r) { roles[r] = pickLeaf(); });
    for (var rk in roles) if (roles[rk] < 0) return null;
    // the thornwall plugs the single passage into the goal chamber
    var gi = goal % MW, gj = Math.floor(goal / MW), gdir = -1; for (k = 0; k < 4; k++) if (open[goal][k]) gdir = k;
    var thornTiles = [], tx0 = 0, ty0 = 0;
    if (gdir === 0) { tx0 = cx0(goal) + CELL; ty0 = cy0(goal) + mid; } else if (gdir === 2) { tx0 = cx0(goal) - WALL; ty0 = cy0(goal) + mid; } else if (gdir === 1) { tx0 = cx0(goal) + mid; ty0 = cy0(goal) + CELL; } else { tx0 = cx0(goal) + mid; ty0 = cy0(goal) - WALL; }
    for (y = ty0; y < ty0 + 3; y++) for (x = tx0; x < tx0 + 3; x++) { if (tiles[at(x, y)] === 0) { tiles[at(x, y)] = 1; kind[at(x, y)] = 9; thornTiles.push(at(x, y)); } }
    var thorn = { x: (tx0 + 1.5) * T, y: (ty0 + 1.5) * T, tiles: thornTiles, tx0: tx0, ty0: ty0 };
    // classify rock: the plateau edge drops into the valley, everything else is wall
    var dist = new Int16Array(N).fill(-1), qd = [];
    for (i = 0; i < N; i++) if (!tiles[i]) { dist[i] = 0; qd.push(i); }
    for (var qi = 0; qi < qd.length; qi++) { var c0 = qd[qi], px0 = c0 % PW, py0 = (c0 / PW) | 0; for (k = 0; k < 4; k++) { var xx = px0 + DX[k], yy = py0 + DY[k]; if (xx < 0 || yy < 0 || xx >= PW || yy >= PH) continue; var ni = at(xx, yy); if (dist[ni] >= 0) continue; dist[ni] = dist[c0] + 1; qd.push(ni); } }
    var rockDepth = new Uint8Array(N);
    for (i = 0; i < N; i++) if (tiles[i]) { rockDepth[i] = Math.min(9, Math.max(0, dist[i])); kind[i] = dist[i] > 2 ? 10 : 9; }
    for (k = 0; k < thornTiles.length; k++) { kind[thornTiles[k]] = 9; rockDepth[thornTiles[k]] = 1; }
    var props = [], chests = [], lights = [], spawns = [];
    // scatter boulders in ordinary chambers (never in the puzzle ones, never on the way in)
    var special = {}; for (var sr in roles) special[roles[sr]] = 1; special[start] = 1; special[goal] = 1;
    for (i = 0; i < NC; i++) {
      if (special[i]) continue;
      var nb = 1 + Math.floor(rng() * 3), ctT = ctrT(i);
      for (k = 0; k < nb; k++) { var bx = cx0(i) + 1 + Math.floor(rng() * (CELL - 2)), by = cy0(i) + 1 + Math.floor(rng() * (CELL - 2)); if (Math.abs(bx - ctT.tx) <= 1 && Math.abs(by - ctT.ty) <= 1) continue; if (bx < cx0(i) + 1 || by < cy0(i) + 1) continue; tiles[at(bx, by)] = 1; kind[at(bx, by)] = 9; rockDepth[at(bx, by)] = 1; }
    }
    // stations
    var puzzle = { thorn: thorn, goal: ctrP(goal), start: ctrP(start) };
    var sp = ctrP(roles.spring), sg = ctrP(roles.stagnant), el = ctrP(roles.elder), hc = ctrP(roles.hollow);
    puzzle.spring = { x: sp.x, y: sp.y }; puzzle.stagnant = { x: sg.x, y: sg.y }; puzzle.elder = { x: el.x, y: el.y };
    props.push({ x: sp.x, y: sp.y, sortY: 0, draw: function (c, sx, sy, t) { drawSpring(c, sx, sy, t, false); } });
    props.push({ x: sg.x, y: sg.y, sortY: 0, draw: function (c, sx, sy, t) { drawSpring(c, sx, sy, t, true); } });
    props.push({ x: el.x, y: el.y, sortY: 8, draw: function (c, sx, sy, t) { drawElder(c, sx, sy, t); } });
    lights.push({ x: sp.x, y: sp.y, r: 90, color: '120,200,255', inten: 0.4, flicker: 0.05 });
    var hollow = makeHollow(rng, cx0(roles.hollow), cy0(roles.hollow));
    if (!hollow) return null;
    puzzle.hollow = hollow;
    hollow.mirrors.forEach(function (m) { var tx = hollow.x0 + 1 + m.gx, ty = hollow.y0 + 1 + m.gy; tiles[at(tx, ty)] = 1; kind[at(tx, ty)] = 9; rockDepth[at(tx, ty)] = 1; m.x = tx * T + T / 2; m.y = ty * T + T / 2; });
    hollow.bed.x = (hollow.x0 + 1 + hollow.bed.gx) * T + T / 2; hollow.bed.y = (hollow.y0 + 1 + hollow.bed.gy) * T + T / 2;
    puzzle.bedPoint = { x: hollow.bed.x, y: hollow.bed.y };
    props.push({ x: hollow.bed.x, y: hollow.bed.y, sortY: 0, draw: function (c, sx, sy, t) { drawBed(c, sx, sy, t, traceBeam(hollow).hit); } });
    hollow.mirrors.forEach(function (m) { props.push({ x: m.x, y: m.y, sortY: 6, draw: function (c, sx, sy, t) { drawMirror(c, sx, sy, t, m); } }); });
    props.push({ x: hc.x, y: hc.y, sortY: 90, reveal: false, draw: function (c, sx, sy, t, cam) { drawBeam(c, cam, hollow, t); } });
    props.push({ x: thorn.x, y: thorn.y, sortY: 20, draw: function (c, sx, sy, t) { drawThorns(c, sx, sy, t); } });
    var tb = ctrP(start); puzzle.tablet = { x: tb.x - 3 * T, y: tb.y - 2 * T };
    props.push({ x: puzzle.tablet.x, y: puzzle.tablet.y, sortY: 4, draw: function (c, sx, sy) { drawTablet(c, sx, sy); } });
    // chests in the quiet dead ends
    ['chest1', 'chest2', 'chest3'].forEach(function (r, n) { var p = ctrP(roles[r]), tc = ctrT(roles[r]); chests.push({ tx: tc.tx, ty: tc.ty, x: p.x, y: p.y, opened: false, tier: n === 0 ? 2 : 1 }); });
    // the way into the mountain cave, in its own dead end
    var cc = ctrT(roles.cave), caveEntrance = { tx: cc.tx, ty: cc.ty, x: (cc.tx + 0.5) * T, y: (cc.ty + 0.5) * T };
    props.push({ x: caveEntrance.x, y: caveEntrance.y, sortY: 20, draw: function (c, sx, sy) {
      c.save(); c.fillStyle = '#595861'; c.beginPath(); c.moveTo(sx - 34, sy + 5); c.lineTo(sx - 22, sy - 31); c.lineTo(sx - 5, sy - 48); c.lineTo(sx + 18, sy - 42); c.lineTo(sx + 33, sy + 5); c.closePath(); c.fill();
      c.fillStyle = '#17141d'; c.beginPath(); c.moveTo(sx - 18, sy + 5); c.quadraticCurveTo(sx - 18, sy - 30, sx, sy - 33); c.quadraticCurveTo(sx + 18, sy - 30, sx + 18, sy + 5); c.fill();
      c.fillStyle = '#ffe0a2'; c.font = 'bold 10px Georgia'; c.textAlign = 'center'; c.fillText('MOUNTAIN CAVE', sx, sy - 54); c.restore();
    } });
    // reachability: with the thornwall open every special place must connect to the start
    var reach = new Uint8Array(N), q = [at(ctrT(start).tx, ctrT(start).ty)], qi2 = 0; reach[q[0]] = 1;
    while (qi2 < q.length) { var c1 = q[qi2++], x1 = c1 % PW, y1 = (c1 / PW) | 0; for (k = 0; k < 4; k++) { var xx2 = x1 + DX[k], yy2 = y1 + DY[k]; if (xx2 < 0 || yy2 < 0 || xx2 >= PW || yy2 >= PH) continue; var ni3 = at(xx2, yy2); if (reach[ni3] || (tiles[ni3] && thornTiles.indexOf(ni3) < 0)) continue; reach[ni3] = 1; q.push(ni3); } }
    var gt = ctrT(goal), ok = reach[at(gt.tx, gt.ty)] === 1 && reach[at(cc.tx, cc.ty)] === 1; chests.forEach(function (ch) { if (!reach[at(ch.tx, ch.ty)]) ok = false; });
    [sp, sg, el].forEach(function (pt) { if (!reach[at(Math.floor(pt.x / T), Math.floor(pt.y / T))]) ok = false; });
    if (!ok) return null;
    // monsters: groups in about half the chambers, ledges of golems where three ways meet
    function inChamber(ci3, spread) { for (var t2 = 0; t2 < 14; t2++) { var p = ctrT(ci3), px = Math.round(p.tx + (rng() - 0.5) * spread), py = Math.round(p.ty + (rng() - 0.5) * spread); if (px > 1 && py > 1 && px < PW - 2 && py < PH - 2 && !tiles[at(px, py)] && reach[at(px, py)]) return { x: px * T + 16, y: py * T + 16 }; } return null; }
    for (i = 0; i < NC; i++) {
      if (special[i] || fromStart[i] < 3 || i === goal) continue;
      var deg = degree(i), roll = rng();
      if (deg >= 3 && roll < 0.7) { var a1 = inChamber(i, 4), a2 = inChamber(i, 5), a3 = inChamber(i, 5); if (a1) spawns.push({ x: a1.x, y: a1.y, type: 'screegolem' }); if (a2) spawns.push({ x: a2.x, y: a2.y, type: 'cragharpy', pair: true }); if (a3) spawns.push({ x: a3.x, y: a3.y, type: 'direwolf' }); }
      else if (roll < 0.42) { var pt2 = inChamber(i, 5); if (!pt2) continue; var r2 = rng(), type = r2 < 0.3 ? 'cragharpy' : r2 < 0.55 ? 'direwolf' : r2 < 0.7 ? 'crow' : r2 < 0.85 ? 'bear' : 'screegolem'; spawns.push({ x: pt2.x, y: pt2.y, type: type }); }
    }
    var spawnP = ctrP(start), exitP = ctrP(goal);
    function marker(x, y, label, col) { return { x: x, y: y, sortY: -20, draw: function (c, sx, sy, t) { var gl = 0.5 + 0.5 * Math.sin(t * 2.4); c.save(); c.globalAlpha = 0.35 + 0.25 * gl; var g = c.createRadialGradient(sx, sy, 2, sx, sy, 34); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(sx - 36, sy - 36, 72, 72); c.restore(); c.fillStyle = '#4a4036'; c.fillRect(sx - 20, sy - 30, 5, 34); c.fillRect(sx + 15, sy - 30, 5, 34); c.fillRect(sx - 22, sy - 34, 44, 6); c.fillStyle = '#d8c8a0'; c.font = 'bold 8px Georgia'; c.textAlign = 'center'; c.fillText(label, sx, sy - 38); } }; }
    props.push(marker(spawnP.x + 2.5 * T, spawnP.y + 1.5 * T, 'THE PLAINS', 'rgba(255,224,150,.6)'));
    props.push(marker(exitP.x, exitP.y, 'ABANDONED VILLAGE', 'rgba(150,200,255,.6)'));
    var spawn = { x: spawnP.x + 2.5 * T, y: spawnP.y + 1.5 * T - 8 }, exit = { x: exitP.x, y: exitP.y };
    var map = CC.Realm.create({ name: 'Rocky Pass', w: PW, h: PH, kind: kind, tiles: tiles, spawn: spawn, stairs: { x: -999, y: -999, tx: -1, ty: -1 }, chests: chests, enemySpawns: spawns, props: props, lights: lights,
      ambient: '40,54,80,0.14', playerLight: 220, viewR: 300, fog: 0.04, fogColor: '190,205,225', ground: ground, detail: detail, drawSolid: solid, reveal: false, viewBoost: 1.2 });
    map.rockDepth = rockDepth; map.passBack = { x: spawn.x, y: spawn.y }; map.passExit = exit; map.caveEntrance = caveEntrance; map.floor = 1; map.puzzle = puzzle; map.mazeSize = { w: MW, h: MH };
    if (Z.open) clearThorns(map, true);
    return map;
  }
  function clearThorns(map, instant) {
    var th = map.puzzle && map.puzzle.thorn; if (!th) return;
    th.tiles.forEach(function (ti) { map.tiles[ti] = 0; map.kind[ti] = 0; });
    if (instant) Z.thorn = 1;
  }
  RP.debugSolve = function (map) { Z.open = 1; Z.thorn = 1; if (map) clearThorns(map, true); }; // tests and the testing tools
  RP.generate = function (fixedSeed) {
    var seed = Number.isFinite(fixedSeed) ? fixedSeed >>> 0 : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, map = null, tries = 0;
    while (!map && tries < 24) { map = build(seeded(seed + tries * 7919)); tries++; }
    if (!map) throw new Error('Rocky Pass generation failed');
    map.seed = seed; RP.map = map; RP.titleOn();
    return map;
  };
  RP.reset = function () { opened = false; scene = null; speech = null; Z = fresh(); dlg = null; eagleScript(false); if (CC.camFocus) CC.camFocus = null; };
  RP.serialize = function () { return opened ? 1 : 0; };
})(window);
