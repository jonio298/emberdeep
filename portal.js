/* Emberdeep TP-Town: a small purple portal you open wherever you stand.
 * Walk into it to reach the town; the town has a matching portal at its centre that leads back.
 * Portals stay open, and in co-op your partner sees yours and can use it too, so you can come and go at will.
 *   place() opens (or moves) your portal     update(dt) walks you through     drawWorld / drawTown paint them
 *   share() is what your partner is told      mine() your open portal
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, P = CC.Portal = {}, T = 32, TAU = Math.PI * 2;
  var AREAS = ['cave', 'forest', 'plains', 'tree-tunnel', 'tree-ascent', 'town', 'defense'];
  var TOWN = { x: 24 * T, y: 22.3 * T };
  var mine = null, clock = 0, cool = 0;

  function st() { return CC.state; }
  function inWorld() {
    var s = st();
    return !!(s && s.player && s.mode === 'dungeon' && s.map && s.area !== 'defense' && s.area !== 'camp' && s.area !== 'camp-tent' &&
      !(CC.Camp && CC.Camp.isInside && CC.Camp.isInside()));
  }
  function same(o, s) { return o && o.area === s.area && (o.floor || 1) === (s.floor || 1) && (o.area !== 'tree-ascent' || (o.treeFloor || 1) === (s.treeFloor || 1)); }
  function theirs() {
    var MP = CC.Multiplayer, r = MP && MP.active && MP.remote;
    if (!r || !(r.pta > 0) || !Number.isFinite(r.ptx)) return null;
    return { x: r.ptx, y: r.pty, area: AREAS[r.ptr] || 'cave', floor: r.ptf || 1, treeFloor: r.ptt || 1, theirs: true };
  }
  function townOpen() { var s = st(); return !!(s && (s.coop ? true : mine)); }

  P.reset = function () { mine = null; cool = 0; };
  P.mine = function () { return mine; };
  P.townPos = function () { return TOWN; };
  P.arrived = function () { cool = 1.5; };
  P.canPlace = function () { var s = st(); return inWorld() && s.player.hp > 0; };
  P.share = function () {
    return mine ? { a: 1, x: Math.round(mine.x), y: Math.round(mine.y), r: Math.max(0, AREAS.indexOf(mine.area)), f: mine.floor || 1, t: mine.treeFloor || 1 } : { a: 0 };
  };
  P.place = function () {
    var s = st(), p = s && s.player, D = CC.Dungeon;
    if (!P.canPlace()) return false;
    var face = p.face >= 0 ? 1 : -1, spots = [[face * 30, 4], [face * 20, 22], [-face * 24, 4], [0, 24], [0, 0]], x = p.x, y = p.y, i;
    for (i = 0; i < spots.length; i++) {
      var tx = p.x + spots[i][0], ty = p.y + spots[i][1];
      if (!(D && D.isSolid && D.isSolid(tx, ty))) { x = tx; y = ty; break; }
    }
    mine = { area: s.area, floor: s.floor || 1, treeFloor: s.treeFloor || 1, x: x, y: y, born: clock };
    cool = 1.2;
    if (CC.fx) { CC.fx.burst(x, y - 6, '#c58bff', 20, 90); CC.fx.text(p.x, p.y - 26, 'PORTAL OPENED', '#d6a6ff', 12); }
    return true;
  };

  P.update = function (dt) {
    clock += dt; if (cool > 0) cool -= dt;
    var s = st(), p = s && s.player;
    if (!p || cool > 0) return;
    if (inWorld()) {
      var list = [mine, theirs()], i, o;
      for (i = 0; i < list.length; i++) {
        o = list[i];
        if (o && same(o, s) && Math.hypot(p.x - o.x, p.y - o.y) < 16) { if (CC.portalToTown) CC.portalToTown(); return; }
      }
    } else if (s.mode === 'town' && townOpen() && !(CC.Camp && CC.Camp.isInside && CC.Camp.isInside())) {
      if (Math.hypot(p.x - TOWN.x, p.y - TOWN.y) < 16 && CC.portalFromTown) CC.portalFromTown();
    }
  };

  /* ---- drawing: a small violet gate with a swirling core ---- */
  function drawGate(c, x, y, scale, t, born) {
    var grow = born === undefined ? 1 : Math.min(1, (clock - born) * 2.4 + 0.15), pulse = 1 + Math.sin(t * 3.2) * 0.05, k = scale * grow, i;
    c.save(); c.translate(x, y); c.scale(k, k);
    var g = c.createRadialGradient(0, -4, 3, 0, -4, 40);
    g.addColorStop(0, 'rgba(190,110,255,0.42)'); g.addColorStop(0.55, 'rgba(120,50,210,0.16)'); g.addColorStop(1, 'rgba(90,20,170,0)');
    c.fillStyle = g; c.fillRect(-42, -46, 84, 92);
    c.fillStyle = 'rgba(8,2,18,0.45)'; c.beginPath(); c.ellipse(0, 12, 13, 4.5, 0, 0, TAU); c.fill(); // ground shadow
    c.shadowColor = '#b36bff'; c.shadowBlur = 12;
    c.fillStyle = '#1c0b33'; c.beginPath(); c.ellipse(0, -9, 10.5 * pulse, 17 * pulse, 0, 0, TAU); c.fill(); // dark rim
    c.shadowBlur = 0;
    var ig = c.createRadialGradient(0, -9, 1, 0, -9, 15);
    ig.addColorStop(0, '#f4dcff'); ig.addColorStop(0.35, '#b46cff'); ig.addColorStop(1, '#4a1f8f');
    c.fillStyle = ig; c.beginPath(); c.ellipse(0, -9, 8 * pulse, 14.2 * pulse, 0, 0, TAU); c.fill(); // glowing core
    c.lineCap = 'round';
    for (i = 0; i < 3; i++) { // swirling arms
      var a = t * (1.6 + i * 0.35) + i * 2.1;
      c.strokeStyle = 'rgba(255,240,255,' + (0.55 - i * 0.12) + ')'; c.lineWidth = 1.4;
      c.beginPath(); c.ellipse(0, -9, 6.2 - i * 1.6, 11 - i * 3, 0, a, a + 2.1); c.stroke();
    }
    c.strokeStyle = 'rgba(214,166,255,0.95)'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(0, -9, 9.6 * pulse, 16 * pulse, 0, 0, TAU); c.stroke(); // bright edge
    for (i = 0; i < 5; i++) { // rising sparks
      var u = (t * 0.7 + i / 5) % 1, sx = Math.sin(t * 2 + i * 2.4) * 9, sy = 6 - u * 36;
      c.globalAlpha = (1 - u) * 0.9; c.fillStyle = i % 2 ? '#e8c8ff' : '#b97bff'; c.fillRect(sx - 1, sy - 1, 2, 2);
    }
    c.globalAlpha = 1; c.restore();
  }
  function tag(c, x, y, text) {
    c.save(); c.textAlign = 'center'; c.font = 'bold 8px Georgia, serif'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.strokeText(text, x, y); c.fillStyle = '#e6c8ff'; c.fillText(text, x, y); c.restore();
  }
  P.drawWorld = function (c, cam) {
    var s = st(), MP = CC.Multiplayer;
    if (!s || !inWorld()) return;
    var list = [mine, theirs()], i, o;
    for (i = 0; i < list.length; i++) {
      o = list[i];
      if (!o || !same(o, s)) continue;
      var x = o.x - cam.x, y = o.y - cam.y;
      if (x < -50 || y < -60 || x > cam.w + 50 || y > cam.h + 50) continue;
      drawGate(c, x, y, 1, clock + i, o.born);
      if (o.theirs) tag(c, x, y - 40, ((MP && MP.partnerName && MP.partnerName()) || 'PARTNER').toUpperCase().slice(0, 12) + ' PORTAL');
    }
  };
  P.drawTown = function (c, cam) {
    var s = st();
    if (!s || s.mode !== 'town' || !townOpen() || (CC.Camp && CC.Camp.isInside && CC.Camp.isInside())) return;
    var x = TOWN.x - cam.x, y = TOWN.y - cam.y;
    if (x < -60 || y < -70 || x > cam.w + 60 || y > cam.h + 60) return;
    drawGate(c, x, y, 1.15, clock);
    tag(c, x, y - 46, s.coop ? 'PORTAL BACK TO THE PARTY' : 'PORTAL BACK');
  };
})(window);
