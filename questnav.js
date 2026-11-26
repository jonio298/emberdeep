/* CC.QuestNav - hints, quest markers, the quest log and your own waypoint.
 *
 *  ARROW HINTS (world): a faint arrow points to the next quest step only when you are close to a quest activity (walking up to Sister Alder, nearing the Eagle
 *    Nest tree), or when you try the hollow tunnel before its quest is done, in which case the hint stays on for a while. There is no always-on arrow.
 *  QUEST MARKERS (large map): every active quest shows on the map as a coloured diamond with its name above it; tapping the name opens that quest in the log.
 *  QUEST LOG (the Quests tab): one pill per quest, and the selected quest's journal under them.
 *  WAYPOINT: tap the large map to drop a waypoint (tap it again to remove it); a green arrow under your feet then points to it, and it shows on the minimap.
 *
 *  Public: target() hintTarget() draw(ctx,cam) minimap(...) markers() waypoint() setWaypoint(x,y) clearWaypoint() mapOverlay(c,x,y,w,h,hit) QuestLog
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, QN = CC.QuestNav = {}, TAU = Math.PI * 2, T = CC.TILE = CC.TILE || 32;
  var COLORS = { unhatched: '#ffd24a', rockslide: '#ff9a3a', chapel: '#b48aff', cinderwake: '#ff7a3a' };
  function npc(map, name) { var l = map && map.npcs || [], i; for (i = 0; i < l.length; i++) if (l[i].name === name) return l[i]; return null; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- the next step of the egg quest, wherever you are ---------- */
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
      if ((st === 'unstarted' || st === 'gathered' || st === 'nest') && m.spawn) return { x: m.spawn.x, y: m.spawn.y, label: 'Sister Alder (town)' };
    }
    if (a === 'tree-ascent') {
      if (st === 'climbing' && m.stairs) return { x: m.stairs.x, y: m.stairs.y, label: m.ascentFloor === 5 ? 'The nest' : 'Ladder up' };
      if ((st === 'gathered' || st === 'nest') && m.spawn) return { x: m.spawn.x, y: m.spawn.y, label: 'Way down' };
    }
    return null;
  };
  var sticky = null; // { until, area } set when you try the hollow tunnel before it is open
  QN.hintTarget = function () {
    var s = CC.state, p = s && s.player, tg = QN.target(); if (!p || !tg) return null;
    var d = Math.hypot(tg.x - p.x, tg.y - p.y), now = Date.now();
    if (s.mode === 'dungeon' && s.area === 'forest' && s.map && s.map.stairs && CC.EggQuest && !CC.EggQuest.tunnelUnlocked() && Math.hypot(s.map.stairs.x - p.x, s.map.stairs.y - p.y) < 130) sticky = { until: now + 30000, area: s.area }; // tried the sealed tunnel
    if (sticky && (sticky.area !== s.area || now > sticky.until)) sticky = null;
    if (sticky) return tg;
    return d < 300 ? tg : null; // near a quest activity
  };

  /* ---------- your waypoint ---------- */
  function wkey() { var s = CC.state; return s.area + ':' + (s.floor || 0); }
  QN.waypoint = function () { var s = CC.state, w = s && s.waypoint; return w && w.key === wkey() ? w : null; };
  QN.setWaypoint = function (x, y) { CC.state.waypoint = { key: wkey(), x: x, y: y }; if (CC.Audio) CC.Audio.fx('chest', { vol: 0.35, gap: 100 }); };
  QN.clearWaypoint = function () { CC.state.waypoint = null; };

  /* ---------- the world: hint arrow, waypoint arrow under the hero, waypoint flag ---------- */
  QN.draw = function (c, cam) {
    var p = CC.state && CC.state.player; if (!p) return; var t = Date.now() / 1000, pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    var tg = QN.hintTarget();
    if (tg) {
      var dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy);
      if (d >= 80) {
        var a = Math.atan2(dy, dx), vis = Math.min(1, (d - 80) / 120), r = 40 + 3 * Math.sin(t * 2.4), x = p.x - cam.x + Math.cos(a) * r, y = p.y - cam.y - 6 + Math.sin(a) * r * 0.8;
        c.save(); c.translate(x, y); c.rotate(a); c.lineCap = 'round'; c.lineJoin = 'round';
        c.globalAlpha = (0.16 + 0.14 * pulse) * vis; c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill();
        c.globalAlpha = (0.38 + 0.2 * pulse) * vis; c.strokeStyle = '#fff2c4'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-3, -5.5); c.lineTo(3.5, 0); c.lineTo(-3, 5.5); c.stroke();
        c.globalAlpha = (0.22 + 0.12 * pulse) * vis; c.beginPath(); c.moveTo(-8, -4); c.lineTo(-3.5, 0); c.lineTo(-8, 4); c.stroke(); c.restore();
        c.save(); c.globalAlpha = 0.3 * vis; c.font = '8px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#fff2c4'; c.fillText(tg.label, x, y + 15); c.restore();
      }
    }
    var wp = QN.waypoint();
    if (wp) {
      var wx = wp.x - p.x, wy = wp.y - p.y, wd = Math.hypot(wx, wy);
      if (wd < 40) { QN.clearWaypoint(); if (CC.fx && CC.fx.text) CC.fx.text(p.x, p.y - 26, 'WAYPOINT REACHED', '#7dff9a', 11); if (CC.Audio) CC.Audio.event('pickup'); return; }
      var fx = wp.x - cam.x, fy = wp.y - cam.y;
      if (fx > -20 && fx < cam.w + 20 && fy > -60 && fy < cam.h + 20) { // the flag where you set it, with a faint beam
        c.save(); var bg = c.createLinearGradient(0, fy - 46, 0, fy); bg.addColorStop(0, 'rgba(90,255,140,0)'); bg.addColorStop(1, 'rgba(90,255,140,' + (0.3 + 0.12 * pulse) + ')'); c.fillStyle = bg; c.fillRect(fx - 2, fy - 46, 4, 46);
        c.fillStyle = '#2a1a0c'; c.fillRect(fx - 0.7, fy - 18, 1.4, 18); c.fillStyle = '#5dff8a'; c.beginPath(); c.moveTo(fx + 0.7, fy - 18); c.lineTo(fx + 10, fy - 14.5); c.lineTo(fx + 0.7, fy - 11); c.closePath(); c.fill(); c.strokeStyle = '#06260f'; c.lineWidth = 0.8; c.stroke(); c.restore();
      }
      var ang = Math.atan2(wy, wx), ax = p.x - cam.x, ay = p.y - cam.y + 15; // the arrow lies on the ground under your feet, pointing the way
      c.save(); c.translate(ax, ay); c.scale(1, 0.55); c.rotate(ang);
      c.globalAlpha = 0.25 + 0.1 * pulse; c.fillStyle = '#5dff8a'; c.beginPath(); c.arc(0, 0, 17, 0, TAU); c.fill();
      c.globalAlpha = 0.9; c.fillStyle = '#5dff8a'; c.strokeStyle = '#06260f'; c.lineWidth = 1.4; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(16, 0); c.lineTo(5, -9); c.lineTo(5, -3.6); c.lineTo(-11, -3.6); c.lineTo(-11, 3.6); c.lineTo(5, 3.6); c.lineTo(5, 9); c.closePath(); c.fill(); c.stroke(); c.restore();
      c.save(); c.globalAlpha = 0.65; c.font = 'bold 8px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#c8ffd8'; c.strokeStyle = 'rgba(0,20,8,.8)'; c.lineWidth = 2.4; var lbl = Math.round(wd / T) + ' m'; c.strokeText(lbl, ax, ay + 15); c.fillText(lbl, ax, ay + 15); c.restore();
    }
  };

  /* ---------- the minimap: the hint target (only while a hint is on) and the waypoint ---------- */
  QN.minimap = function (c, cx, cy, inner, sc, p, pulse) {
    if (!p) return;
    function mark(tg, col, dark, shape) {
      var dx = (tg.x - p.x) / T * sc, dy = (tg.y - p.y) / T * sc, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (d <= inner - 5) { c.fillStyle = col.replace(')', ',' + (0.25 + 0.2 * pulse) + ')').replace('rgb', 'rgba'); c.beginPath(); c.arc(cx + dx, cy + dy, 6, 0, TAU); c.fill(); c.fillStyle = shape; c.strokeStyle = dark; c.lineWidth = 1; c.beginPath(); c.moveTo(cx + dx, cy + dy - 4); c.lineTo(cx + dx + 3.4, cy + dy); c.lineTo(cx + dx, cy + dy + 4); c.lineTo(cx + dx - 3.4, cy + dy); c.closePath(); c.fill(); c.stroke(); return; }
      c.save(); c.translate(cx + Math.cos(a) * (inner - 5), cy + Math.sin(a) * (inner - 5)); c.rotate(a); c.globalAlpha = 0.7 + 0.3 * pulse; c.fillStyle = shape; c.strokeStyle = dark; c.lineWidth = 1;
      c.beginPath(); c.moveTo(4.5, 0); c.lineTo(-3, 4); c.lineTo(-1, 0); c.lineTo(-3, -4); c.closePath(); c.fill(); c.stroke(); c.restore();
    }
    var tg = QN.hintTarget(); if (tg) mark(tg, 'rgb(255,233,168)', '#3a2a0c', '#ffe9a8');
    var wp = QN.waypoint(); if (wp) mark(wp, 'rgb(93,255,138)', '#06260f', '#5dff8a');
  };

  /* ---------- quest markers on the large map ---------- */
  QN.questList = function () {
    var EQ = CC.EggQuest, RP = CC.RockPass, V = CC.AbandonedVillage, list = [];
    list.push({ id: 'unhatched', name: 'The Unhatched', color: COLORS.unhatched, done: !!(EQ && EQ.stage && EQ.stage() === 'complete') });
    if ((EQ && EQ.tunnelUnlocked && EQ.tunnelUnlocked()) || (RP && RP.isOpen && RP.isOpen())) list.push({ id: 'rockslide', name: 'The Rockslide', color: COLORS.rockslide, done: !!(RP && RP.isOpen && RP.isOpen()) });
    if (V && V.hook) list.push({ id: 'chapel', name: 'Beneath the Chapel', color: COLORS.chapel, done: false });
    var CS0 = CC.CinderwakeStory; if (CS0 && CS0.isDone && CS0.isDone()) list.push({ id: 'emberdeep', name: 'The Source of the Curse', color: '#ff5a2a', done: !!(CS0.isCored && CS0.isCored()) });
    var CS = CC.CinderwakeStory; if (CS && (CS.isOpen() || (V && V.hook && CC.state && CC.state.area === 'village-cellar'))) list.push({ id: 'cinderwake', name: 'The Unpaid Debt', color: COLORS.cinderwake, done: CS.isDone() });
    return list;
  };
  QN.markers = function () {
    var s = CC.state, p = s && s.player, out = [], EQ = CC.EggQuest, st = EQ && EQ.stage ? EQ.stage() : null, a = s && s.area, m = s && s.map; if (!p || !m || s.mode !== 'dungeon') return out;
    var ids = {}; QN.questList().forEach(function (q) { ids[q.id] = q; });
    if (ids.unhatched && !ids.unhatched.done) {
      if (a === 'forest' && m.ascentEntrance && st !== 'complete') out.push({ quest: 'unhatched', x: m.ascentEntrance.x, y: m.ascentEntrance.y, label: 'The Unhatched: Eagle Nest' });
      if (a === 'tree-ascent' && m.stairs && st === 'climbing') out.push({ quest: 'unhatched', x: m.stairs.x, y: m.stairs.y, label: 'The Unhatched: ' + (m.ascentFloor === 5 ? 'the nest' : 'ladder up') });
    }
    if (ids.rockslide && !ids.rockslide.done && a === 'plains' && m.slide) out.push({ quest: 'rockslide', x: m.slide.x, y: m.slide.y, label: 'The Rockslide' });
    if (ids.chapel && a === 'village') { var V = CC.AbandonedVillage; if (V && V.trap) out.push({ quest: 'chapel', x: V.trap.x, y: V.trap.y, label: 'Beneath the Chapel' }); }
    if (ids.emberdeep && !ids.emberdeep.done) {
      if (a === 'cinderwake' && m.sealed) out.push({ quest: 'emberdeep', x: m.sealed.x, y: m.sealed.y, label: 'The Source of the Curse: the furnace door' });
      if (a === 'emberdeep') { var et = m.stairs && m.stairs.x > -900 ? m.stairs : m.bossPoint || null; if (et) out.push({ quest: 'emberdeep', x: et.x, y: et.y, label: m.floor === 2 ? 'The Emberheart' : 'The way down' }); }
    }
    if (ids.cinderwake && !ids.cinderwake.done) {
      var CS = CC.CinderwakeStory;
      if (a === 'village-cellar' && m.glass) out.push({ quest: 'cinderwake', x: m.glass.x, y: m.glass.y, label: CS && CS.isOpen() ? 'The Unpaid Debt: the glass stair' : 'The Unpaid Debt: loot the vault' });
      if (a === 'cinderwake') {
        var tgt = m.stairs && m.stairs.x > -900 ? m.stairs : m.reward || null;
        if (tgt) out.push({ quest: 'cinderwake', x: tgt.x, y: tgt.y, label: 'The Unpaid Debt' + (m.floor === 3 ? ': the Hearthkeeper' : '') });
      }
    }
    return out;
  };
  // the large map's drawing layout: fits a small map to the panel; a big map is centred on the hero at a wide zoom
  CC.mapLayout = function (W, H, w, h, zoomable) {
    var pad = 24, top = 52, bottom = 40, cell = Math.max(1, Math.min((w - pad * 2) / W, (h - top - bottom) / H)), ox = Math.round((w - cell * W) / 2), oy = Math.round(top + (h - top - bottom - cell * H) / 2);
    var p = CC.state && CC.state.player;
    if (zoomable && p && W > 110) { cell = Math.max(cell, w / 110); ox = w / 2 - (p.x / T) * cell; oy = top + (h - top - bottom) / 2 - (p.y / T) * cell; }
    return { cell: cell, ox: ox, oy: oy, top: top };
  };
  var showWp = false; // test mode: a toggle so taps place waypoints instead of teleporting
  QN.mapOverlay = function (c, x, y, w, h, hit) {
    var D = CC.Dungeon, s = CC.state, p = s && s.player; if (!D || !p) return; var W = D.w || D.W, H = D.h || D.H; if (!W) return;
    var L = CC.mapLayout(W, H, w, h, !!D.realm), cell = L.cell, now = Date.now() / 1000, i;
    function sx(wx) { return x + L.ox + wx / T * cell; } function sy(wy) { return y + L.oy + wy / T * cell; }
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    // the blip: every second a ring goes out from where you stand
    var ph = now % 1, px = sx(p.x), py = sy(p.y);
    c.strokeStyle = 'rgba(90,255,140,' + (0.85 * (1 - ph)) + ')'; c.lineWidth = 2.2 * (1 - ph) + 0.5; c.beginPath(); c.arc(px, py, 4 + ph * 20, 0, TAU); c.stroke();
    c.fillStyle = '#58ff8a'; c.strokeStyle = '#04210f'; c.lineWidth = 1.4; c.beginPath(); c.arc(px, py, Math.max(3.2, cell * 0.8), 0, TAU); c.fill(); c.stroke();
    // the waypoint flag
    var wp = QN.waypoint(); if (wp) { var wx = sx(wp.x), wy = sy(wp.y); c.fillStyle = '#2a1a0c'; c.fillRect(wx - 0.8, wy - 14, 1.6, 14); c.fillStyle = '#5dff8a'; c.beginPath(); c.moveTo(wx + 0.8, wy - 14); c.lineTo(wx + 10, wy - 10.5); c.lineTo(wx + 0.8, wy - 7); c.closePath(); c.fill(); c.strokeStyle = '#06260f'; c.lineWidth = 1; c.stroke(); }
    // quest markers: a coloured diamond with the quest's name above it (tap the name to open the quest)
    var mk = QN.markers(), labels = [];
    for (i = 0; i < mk.length; i++) {
      var q = mk[i], col = COLORS[q.quest] || '#fff', mx = sx(q.x), my = sy(q.y);
      c.fillStyle = col + '40'; c.beginPath(); c.arc(mx, my, 9 + 2 * Math.sin(now * 3 + i), 0, TAU); c.fill(); c.fillStyle = col; c.strokeStyle = '#1a1208'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(mx, my - 6); c.lineTo(mx + 5, my); c.lineTo(mx, my + 6); c.lineTo(mx - 5, my); c.closePath(); c.fill(); c.stroke();
      c.font = 'bold 11px Georgia, serif'; var tw = c.measureText(q.label).width + 12, lx = clamp(mx - tw / 2, x + 4, x + w - tw - 4), ly = clamp(my - 28, y + 54, y + h - 50);
      c.fillStyle = 'rgba(10,8,14,0.85)'; c.fillRect(lx, ly, tw, 17); c.strokeStyle = col; c.lineWidth = 1.2; c.strokeRect(lx + 0.5, ly + 0.5, tw - 1, 16); c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(q.label, lx + tw / 2, ly + 9);
      labels.push({ x: lx, y: ly, w: tw, h: 17, quest: q.quest });
    }
    c.restore();
    if (hit) {
      if (!(s.testMode && !showWp)) hit(x, y + 44, w, h - 44, function (tx, ty) { // tap the map: set the waypoint here (or remove it when tapping the flag)
        var wx2 = (tx - x - L.ox) / cell * T, wy2 = (ty - y - L.oy) / cell * T; if (wx2 < 0 || wy2 < 0 || wx2 > W * T || wy2 > H * T) return;
        var cur = QN.waypoint(); if (cur && Math.hypot(sx(cur.x) - tx, sy(cur.y) - ty) < 14) QN.clearWaypoint(); else QN.setWaypoint(wx2, wy2);
      });
      labels.forEach(function (lb) { hit(lb.x, lb.y, lb.w, lb.h, function () { QN.QuestLog.select(lb.quest); if (CC.UI && CC.UI.open) CC.UI.open('quests'); }); });
    }
    c.save(); c.font = '11px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = '#9bffb8';
    c.fillText(s.testMode && !showWp ? '' : (wp ? 'Tap the map to move your waypoint, tap the flag to remove it' : 'Tap the map to set a waypoint'), x + w / 2, y + h - 12);
    c.restore();
  };
  QN.toggleTestWaypoint = function () { showWp = !showWp; return showWp; };
  QN.testWaypointMode = function () { return showWp; };

  /* ---------- the quest log ---------- */
  var QL = QN.QuestLog = { sel: 'unhatched' };
  var TEXT = {
    emberdeep: { title: 'THE SOURCE OF THE CURSE', lines: ['The Hearthkeeper has fallen and the furnace door stands open.', 'Below it lies the Emberdeep: the earth\'s angry, boiling core,', 'and the Emberheart, the molten heart that is the source of the curse.', '', 'Go down, and put it out.'], open: 'The Emberheart is broken. The curse is lifted from the valley.', closed: 'Descend through the Cinderwake\'s furnace door to the Emberdeep.' },
    cinderwake: { title: 'THE UNPAID DEBT', lines: ['The cellar vault hides a stair of fused glass.', 'Below the chapel a furnace still burns, and its keeper', 'still counts the years the village owes.', '', 'Put the Hearthkeeper down and close the book.'], open: 'The Hearthkeeper is down. The furnace door stays shut.', closed: 'Loot the cellar vault to find the way down, then descend the glass stair.' },
    rockslide: { title: 'THE ROCKSLIDE', lines: ['A rockslide blocks the west path of the Rolling Plains.', 'Three travellers argue about how to move it.', '', 'Your eagle can scout above the rocks and find', 'a way round: a hidden goat trail through the pass.'], open: 'The trail is open. The Rocky Pass lies beyond.', closed: 'Find a way past the rockslide. Your eagle may help.' },
    chapel: { title: 'BENEATH THE CHAPEL', lines: ['The ghosts of the ruined village speak of', '"the one beneath the chapel".', '', 'A trapdoor in the village leads down to the cellar,', 'where monsters guard rooms of loot.'], open: '', closed: 'Find the trapdoor and go down into the cellar.' }
  };
  QL.select = function (id) { QL.sel = id; };
  QL.draw = function (c, x, y, w, h, hit) {
    var list = QN.questList(), i, cur = null, px = x + 6;
    for (i = 0; i < list.length; i++) if (list[i].id === QL.sel) cur = list[i]; if (!cur) { cur = list[0]; QL.sel = cur.id; }
    c.save(); c.font = 'bold 11px Georgia, serif'; c.textBaseline = 'middle';
    list.forEach(function (q) { var tw = c.measureText(q.name).width + 18, on = q.id === QL.sel;
      c.fillStyle = on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)'; c.fillRect(px, y + 4, tw, 22); c.strokeStyle = on ? q.color : 'rgba(255,255,255,0.18)'; c.lineWidth = on ? 1.6 : 1; c.strokeRect(px + 0.5, y + 4.5, tw - 1, 21);
      c.fillStyle = q.color; c.beginPath(); c.arc(px + 8, y + 15, 3, 0, TAU); c.fill(); c.fillStyle = on ? '#fff' : '#bbb'; c.textAlign = 'left'; c.fillText(q.name, px + 15, y + 15.5);
      if (hit) hit(px, y + 4, tw, 22, function () { QL.sel = q.id; }); px += tw + 6; });
    c.restore();
    if (cur.id === 'unhatched' && CC.EggQuest) { CC.EggQuest.drawJournal(c, x, y + 34, w, h - 34); return; }
    var tx = TEXT[cur.id]; if (!tx) return;
    c.save(); c.textAlign = 'left'; c.fillStyle = cur.color; c.font = 'bold 19px Georgia'; c.fillText(tx.title, x + 8, y + 66); c.strokeStyle = '#79603f'; c.beginPath(); c.moveTo(x + 8, y + 80); c.lineTo(x + w - 8, y + 80); c.stroke();
    c.fillStyle = '#d8cdb8'; c.font = '13px Georgia'; for (i = 0; i < tx.lines.length; i++) c.fillText(tx.lines[i], x + 9, y + 110 + i * 24);
    c.fillStyle = '#b8d8a8'; c.font = 'bold 12px Georgia'; c.fillText(cur.done ? tx.open : tx.closed, x + 9, y + h - 50); c.restore();
  };
})(window);
