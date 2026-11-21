/* CC.QuestNav - a faint arrow that points the way to the next step of the quest.
 *   target()          where the next objective is in the area you are in ({x, y, label}) or null
 *   draw(ctx, cam)    in the world: a pale chevron floating a little way from the hero toward the objective, fading out when you are close
 *   minimap(ctx, cx, cy, inner, sc, p, pulse)   a small gold marker on the minimap (on the rim when the objective is off the map)
 * Follows the Unhatched (eagle egg) quest: Sister Alder in town -> the Eagle Nest tree in the forest -> up the ladders to the crown -> back down to Alder.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, QN = CC.QuestNav = {}, TAU = Math.PI * 2;
  function npc(map, name) { var l = map && map.npcs || [], i; for (i = 0; i < l.length; i++) if (l[i].name === name) return l[i]; return null; }
  QN.target = function () {
    var s = CC.state, p = s && s.player; if (!p || p.stub) return null; var EQ = CC.EggQuest, st = EQ && EQ.stage ? EQ.stage() : null; if (!st) return null;
    var a = s.area, m = s.map, t;
    if (s.mode === 'town') {
      var tm = CC.Town && CC.Town.map; if (!tm) return null;
      if (st === 'unstarted' || st === 'gathered' || st === 'nest') { t = npc(tm, 'Sister Alder'); return t ? { x: t.x, y: t.y, label: 'Sister Alder' } : null; }
      if (st === 'climbing') return tm.guard ? { x: tm.guard.x, y: tm.guard.y, label: 'South gate' } : null;
      return null;
    }
    if (s.mode !== 'dungeon' || !m) return null;
    if (a === 'forest') {
      if (st === 'climbing' && m.ascentEntrance) return { x: m.ascentEntrance.x, y: m.ascentEntrance.y, label: 'Eagle Nest' };
      if ((st === 'gathered' || st === 'nest') && m.spawn) return { x: m.spawn.x, y: m.spawn.y, label: 'Back to town' };
    }
    if (a === 'tree-ascent') {
      if (st === 'climbing' && m.stairs) return { x: m.stairs.x, y: m.stairs.y, label: m.ascentFloor === 5 ? 'The nest' : 'Ladder up' };
      if ((st === 'gathered' || st === 'nest') && m.spawn) return { x: m.spawn.x, y: m.spawn.y, label: 'Way down' };
    }
    return null;
  };
  QN.draw = function (c, cam) {
    var tg = QN.target(), p = CC.state && CC.state.player; if (!tg || !p) return;
    var dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy); if (d < 80) return; // close enough: no arrow needed
    var a = Math.atan2(dy, dx), t = Date.now() / 1000, vis = Math.min(1, (d - 80) / 120), pulse = 0.5 + 0.5 * Math.sin(t * 2.4), r = 40 + 3 * Math.sin(t * 2.4);
    var x = p.x - cam.x + Math.cos(a) * r, y = p.y - cam.y - 6 + Math.sin(a) * r * 0.8;
    c.save(); c.translate(x, y); c.rotate(a); c.lineCap = 'round'; c.lineJoin = 'round';
    c.globalAlpha = (0.16 + 0.14 * pulse) * vis; c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill(); // a soft glow
    c.globalAlpha = (0.38 + 0.2 * pulse) * vis; c.strokeStyle = '#fff2c4'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(-3, -5.5); c.lineTo(3.5, 0); c.lineTo(-3, 5.5); c.stroke();
    c.globalAlpha = (0.22 + 0.12 * pulse) * vis; c.beginPath(); c.moveTo(-8, -4); c.lineTo(-3.5, 0); c.lineTo(-8, 4); c.stroke();
    c.restore();
    c.save(); c.globalAlpha = 0.3 * vis; c.font = '8px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#fff2c4'; c.fillText(tg.label, x, y + 15); c.restore();
  };
  QN.minimap = function (c, cx, cy, inner, sc, p, pulse) {
    var tg = QN.target(); if (!tg || !p) return; var dx = (tg.x - p.x) / 32 * sc, dy = (tg.y - p.y) / 32 * sc, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d <= inner - 5) { c.fillStyle = 'rgba(255,233,168,' + (0.25 + 0.2 * pulse) + ')'; c.beginPath(); c.arc(cx + dx, cy + dy, 6, 0, TAU); c.fill(); c.fillStyle = '#ffe9a8'; c.strokeStyle = '#3a2a0c'; c.lineWidth = 1; c.beginPath(); c.moveTo(cx + dx, cy + dy - 4); c.lineTo(cx + dx + 3.4, cy + dy); c.lineTo(cx + dx, cy + dy + 4); c.lineTo(cx + dx - 3.4, cy + dy); c.closePath(); c.fill(); c.stroke(); return; }
    c.save(); c.translate(cx + Math.cos(a) * (inner - 5), cy + Math.sin(a) * (inner - 5)); c.rotate(a); c.globalAlpha = 0.7 + 0.3 * pulse; c.fillStyle = '#ffe9a8'; c.strokeStyle = '#3a2a0c'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(4.5, 0); c.lineTo(-3, 4); c.lineTo(-1, 0); c.lineTo(-3, -4); c.closePath(); c.fill(); c.stroke(); c.restore();
  };
})(window);
