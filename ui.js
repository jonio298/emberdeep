/* Emberdeep overlays: skill tree (K), inventory / equipment / charms (I), full map (M), plus the boss health bar.
 * Everything draws on the shell's canvas in screen pixels, so it works with touch and keyboard alike.
 *
 * API (CC.UI), every call is safe when other modules are missing:
 *   toggle(name) / open(name) / close()   name: 'skills' | 'inv' | 'map'
 *   isOpen()    true while an overlay wants the game paused (turns false the moment it starts closing)
 *   update(dt)  animates fades and slides, call every frame (also while paused)
 *   key(code)   returns true when the key was used (K, I, M toggle; Escape closes)
 *   draw(ctx, W, H, addHit)    overlay + boss bar. addHit(x, y, w, h, cb) registers tap targets; later ones win.
 *   drawHud(ctx, W, H, addHit) the three small K / I / M buttons with a skill-point badge
 * Reads CC.state.player, CC.state.inventory, CC.SkillTree, CC.Classes.applyItemStats, CC.Loot (SLOTS, LABEL, charmLimit),
 * CC.Dungeon.drawFullMap and CC.Enemies.bossBar. Equipment slots: the Loot slots plus charm1..charmN.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var CC = root.CC = root.CC || {};

  // dark-fantasy theme: near-black plum panels, bronze frames, parchment text, ember accents
  var COL = { panel: 'rgba(16,10,20,0.97)', line: '#5a4630', accent: '#e0a84a', text: '#e8dcc4', dim: '#8f8070',
    good: '#8fd46a', bad: '#e0584a', gold: '#e8c04a' };
  var FONT = 'Georgia, "Palatino Linotype", "Book Antiqua", serif';
  var mouse = { cx: 0, cy: 0, on: false, x: -1, y: -1, bound: false }, hoverInfo = null, canvasEl = null;
  var TABS = [{ id: 'skills', key: 'KeyK', name: 'Skills' }, { id: 'inv', key: 'KeyI', name: 'Pack' }, { id: 'map', key: 'KeyM', name: 'Map' }];
  var BAG_MAX = 40, FRACT = { crit: 1, speed: 1, cdr: 1, lifesteal: 1 };

  var cur = null, target = false, t = 0, clock = 0, hovering = false;
  var sel = { skill: null, item: null };      // item: {src:'bag', i} | {src:'eq', key}
  var toast = { s: '', t: 0, c: COL.text };
  var flash = {};                             // skill id -> seconds of pulse left
  var bb = { pct: 1, chip: 1, alpha: 0, name: '', phase: 1, intro: 0, introMax: 2.2, color: '#c03a3a' };

  /* ---------- helpers ---------- */
  function ease(v) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, v)), 3); }
  function hero() { return CC.state && CC.state.player || null; }
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  // shared dark-fantasy frame: dark body, bronze double border, corner studs (used by panels, tooltip, detail boxes, HUD)
  function frame(c, x, y, w, h, inset) {
    rr(c, x, y, w, h, inset ? 6 : 10);
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, inset ? '#1c1424' : '#20172a'); g.addColorStop(1, inset ? '#100a16' : '#120c18');
    c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = COL.line; c.stroke();
    rr(c, x + 3, y + 3, w - 6, h - 6, inset ? 4 : 8); c.lineWidth = 1; c.strokeStyle = 'rgba(224,168,74,0.22)'; c.stroke();
    c.fillStyle = COL.accent;
    c.fillRect(x + 1, y + 1, 3, 3); c.fillRect(x + w - 4, y + 1, 3, 3); c.fillRect(x + 1, y + h - 4, 3, 3); c.fillRect(x + w - 4, y + h - 4, 3, 3);
  }
  function wrapLines(c, s, maxW, px) {
    c.font = 'normal ' + px + 'px ' + FONT;
    var words = String(s).split(' '), line = '', out = [];
    for (var i = 0; i < words.length; i++) {
      var t2 = line ? line + ' ' + words[i] : words[i];
      if (c.measureText(t2).width > maxW && line) { out.push(line); line = words[i]; } else line = t2;
    }
    out.push(line);
    return out;
  }
  function trackMouse(W, H) {
    if (!mouse.bound && typeof document !== 'undefined') {
      canvasEl = document.getElementById('game');
      if (canvasEl) {
        mouse.bound = true;
        canvasEl.addEventListener('mousemove', function (e) { mouse.cx = e.clientX; mouse.cy = e.clientY; mouse.on = true; });
        canvasEl.addEventListener('mouseleave', function () { mouse.on = false; });
      }
    }
    if (!canvasEl || !mouse.on) { mouse.x = -1; mouse.y = -1; return; }
    var r = canvasEl.getBoundingClientRect();
    mouse.x = (mouse.cx - r.left) * W / (r.width || W); mouse.y = (mouse.cy - r.top) * H / (r.height || H);
  }
  function tx(c, s, x, y, px, col, align, weight) {
    c.font = (weight || 'bold') + ' ' + px + 'px ' + FONT;
    c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(s, x, y);
  }
  function wrapText(c, s, x, y, maxW, lh, px, col) {
    c.font = 'normal ' + px + 'px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = col;
    var words = String(s).split(' '), line = '', n = 0;
    for (var i = 0; i < words.length; i++) {
      var tt = line ? line + ' ' + words[i] : words[i];
      if (c.measureText(tt).width > maxW && line) { c.fillText(line, x, y + n * lh); n++; line = words[i]; } else line = tt;
    }
    c.fillText(line, x, y + n * lh);
    return n + 1;
  }
  function button(c, addHit, x, y, w, h, text, enabled, cb, color) {
    var hov = enabled && mouse.x >= x && mouse.x < x + w && mouse.y >= y && mouse.y < y + h;
    rr(c, x, y, w, h, 6);
    c.fillStyle = enabled ? (color || '#3a5a2a') : 'rgba(255,255,255,0.05)'; c.fill();
    if (enabled) { var bg = c.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, hov ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.14)'); bg.addColorStop(1, 'rgba(0,0,0,0.35)'); rr(c, x, y, w, h, 6); c.fillStyle = bg; c.fill(); }
    c.lineWidth = hov ? 2 : 1.5; c.strokeStyle = enabled ? (hov ? COL.accent : COL.line) : 'rgba(255,255,255,0.12)'; rr(c, x, y, w, h, 6); c.stroke();
    tx(c, text, x + w / 2, y + h / 2 + 0.5, 12, enabled ? '#fff' : COL.dim, 'center');
    if (enabled) addHit(x, y, w, h, cb);
  }
  function say(s, c) { toast.s = s; toast.t = 1.6; toast.c = c || COL.text; }
  function recalc(p) {
    var C = CC.Classes;
    if (C && typeof C.applyItemStats === 'function') { try { C.applyItemStats(p); } catch (e) { /* best effort */ } }
  }
  function lootSlots() { return CC.Loot && Array.isArray(CC.Loot.SLOTS) && CC.Loot.SLOTS.length ? CC.Loot.SLOTS : ['weapon', 'armor', 'ring', 'amulet', 'trinket']; }
  function charmCount() {
    var L = CC.Loot;
    if (!L) return 0;
    try { if (typeof L.charmLimit === 'function') return Math.max(0, L.charmLimit() | 0); } catch (e) { /* fall through */ }
    return Math.max(0, L.CHARM_LIMIT | 0);
  }
  function slotKeys() {
    var k = lootSlots().slice(), n = charmCount();
    for (var i = 1; i <= n; i++) k.push('charm' + i);
    return k;
  }
  function inv() { var s = CC.state; if (!s.inventory) s.inventory = []; return s.inventory; }
  function statLabel(k) { var L = CC.Loot && CC.Loot.LABEL && CC.Loot.LABEL[k]; return String(L || k).replace(/\s*%$/, ''); }
  function statVal(k, v) {
    var n = Math.round(v * 10) / 10; // item data already holds whole percents for crit/speed/cdr/lifesteal
    return (n > 0 ? '+' : '') + n + (FRACT[k] ? '%' : '');
  }
  function glyph(slot) { return { weapon: 'W', armor: 'A', ring: 'R', amulet: 'N', trinket: 'T', charm: 'C' }[slot] || '?'; }
  function equippedFor(p, it) {
    if (!it || !p || !p.equipment) return null;
    return it.slot === 'charm' ? null : (p.equipment[it.slot] || null);
  }

  /* ---------- inventory actions ---------- */
  function equip(p, idx) {
    var bag = inv(), it = bag[idx];
    if (!it) return;
    if (it.classReq && it.classReq !== p.classId) { say('Only for ' + (it.className || it.classReq), COL.bad); return; }
    var key = it.slot;
    p.equipment = p.equipment || {};
    if (it.slot === 'charm') {
      key = null;
      for (var i = 1; i <= charmCount(); i++) if (!p.equipment['charm' + i]) { key = 'charm' + i; break; }
      if (!key) { say('Charm slots full - unequip one first', COL.bad); return; }
    } else if (lootSlots().indexOf(key) < 0) { say('Cannot equip this', COL.bad); return; }
    var old = p.equipment[key];
    p.equipment[key] = it;
    bag.splice(idx, 1);
    if (old) bag.push(old);
    sel.item = { src: 'eq', key: key };
    recalc(p);
    say('Equipped ' + it.name, it.color || COL.good);
  }
  function unequip(p, key) {
    var it = p.equipment && p.equipment[key], bag = inv();
    if (!it) return;
    if (bag.length >= BAG_MAX) { say('Pack is full', COL.bad); return; }
    p.equipment[key] = null;
    bag.push(it);
    sel.item = { src: 'bag', i: bag.length - 1 };
    recalc(p);
    say('Unequipped ' + it.name, COL.text);
  }
  function sell(idx) {
    var bag = inv(), it = bag[idx];
    if (!it) return;
    bag.splice(idx, 1);
    CC.state.gold = (CC.state.gold || 0) + (it.value || 0);
    sel.item = null;
    say('Sold for ' + (it.value || 0) + ' G', COL.gold);
  }
  // pack ordered by gold value, most valuable first (rarer first on ties); the selection follows its item
  function sortBag() {
    var bag = inv(), chosen = sel.item && sel.item.src === 'bag' ? bag[sel.item.i] : null;
    bag.sort(function (a, b) { return (b.value || 0) - (a.value || 0) || (b.rarity || 0) - (a.rarity || 0); });
    if (chosen) sel.item = { src: 'bag', i: bag.indexOf(chosen) };
    say('Pack sorted by value', COL.gold);
  }
  function selectedItem(p) {
    if (!sel.item) return null;
    if (sel.item.src === 'bag') return inv()[sel.item.i] || null;
    return p && p.equipment ? p.equipment[sel.item.key] || null : null;
  }

  /* ---------- state machine ---------- */
  function open(name) {
    var p = hero();
    if (!p || p.perkOpen) return;
    if (cur !== name) { sel.item = null; t = target ? Math.min(t, 0.4) : t; }
    cur = name; target = true;
  }
  function close() { target = false; }
  function toggle(name) { if (target && cur === name) close(); else open(name); }

  /* ---------- panels ---------- */
  function drawSkills(c, addHit, x, y, w, h, p) {
    var ST = CC.SkillTree;
    if (!ST || !p) { tx(c, ST ? 'No hero yet' : 'Skill tree unavailable', x + w / 2, y + h / 2, 14, COL.dim, 'center'); return; }
    var pts = ST.points(p), list = ST.nodes(p.classId), detailH = 96;
    tx(c, 'Skill points: ' + pts, x + 6, y + 8, 14, pts > 0 ? COL.good : COL.dim);
    tx(c, p.name + '  LV ' + (p.level || 1), x + w - 6, y + 8, 12, p.color || COL.text, 'right');
    var colW = w / 4, top = y + 50, rowH = Math.max(46, Math.min(86, (h - detailH - 64) / 3)), R = Math.max(13, Math.min(21, colW * 0.34, rowH * 0.34)), i, n, cx, cy;
    for (i = 0; i < 4; i++) tx(c, ST.colTitle(p.classId, i), x + colW * (i + 0.5), y + 30, 11, i === 3 ? (p.color || COL.accent) : COL.dim, 'center');
    function pos(nd) { return { x: x + colW * (nd.col + 0.5), y: top + nd.tier * rowH + R }; }
    var byId = {};
    list.forEach(function (nd) { byId[nd.id] = nd; });
    c.lineWidth = 3;
    list.forEach(function (nd) { // links first so nodes sit on top
      if (!nd.parent) return;
      var a = pos(byId[nd.parent]), b = pos(nd);
      c.strokeStyle = ST.rank(p, nd.parent) > 0 ? (ST.rank(p, nd.id) > 0 ? (p.color || COL.accent) : 'rgba(255,255,255,0.45)') : 'rgba(255,255,255,0.12)';
      c.beginPath(); c.moveTo(a.x, a.y + R); c.lineTo(b.x, b.y - R); c.stroke();
    });
    list.forEach(function (nd) {
      var ps = pos(nd); cx = ps.x; cy = ps.y;
      var rk = ST.rank(p, nd.id), can = ST.canBuy(p, nd.id).ok, chosen = sel.skill === nd.id, f = flash[nd.id] || 0;
      if (can) { c.globalAlpha = 0.35 + 0.35 * Math.sin(clock * 4); c.strokeStyle = COL.good; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R + 4, 0, 6.2832); c.stroke(); c.globalAlpha = 1; }
      if (f > 0) { c.globalAlpha = f * 1.6; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R + 4 + (0.6 - f) * 40, 0, 6.2832); c.stroke(); c.globalAlpha = 1; }
      c.beginPath(); c.arc(cx, cy, R, 0, 6.2832);
      c.fillStyle = rk > 0 ? (nd.mastery ? (p.color || COL.accent) : '#5a4a9a') : 'rgba(255,255,255,0.07)'; c.fill();
      c.lineWidth = chosen ? 3 : 1.5; c.strokeStyle = chosen ? '#fff' : (rk > 0 || can ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)'); c.stroke();
      tx(c, nd.name.charAt(0), cx, cy + 0.5, Math.round(R * 0.95), rk > 0 ? '#fff' : (can ? COL.text : COL.dim), 'center');
      tx(c, rk + '/' + nd.max, cx, cy + R + 9, 10, rk >= nd.max ? COL.good : COL.dim, 'center');
      addHit(cx - R - 6, cy - R - 6, (R + 6) * 2, (R + 6) * 2 + 14, function () { sel.skill = nd.id; });
    });
    // detail box
    var dy = y + h - detailH, nd = sel.skill && ST.node(p.classId, sel.skill);
    frame(c, x, dy, w, detailH, true);
    if (!nd) { tx(c, 'Tap a skill to read it. Glowing skills can be learned.', x + w / 2, dy + detailH / 2, 12, COL.dim, 'center'); return; }
    var chk = ST.canBuy(p, nd.id), rk2 = ST.rank(p, nd.id);
    tx(c, nd.name + '  ' + rk2 + '/' + nd.max, x + 12, dy + 16, 15, nd.mastery ? (p.color || COL.accent) : COL.text);
    n = wrapText(c, nd.desc, x + 12, dy + 38, w - 24 - 96, 15, 12, COL.text);
    tx(c, chk.ok ? 'Cost: 1 point' : chk.reason, x + 12, dy + detailH - 14, 11, chk.ok ? COL.good : COL.dim);
    button(c, addHit, x + w - 100, dy + detailH - 40, 88, 30, rk2 >= nd.max ? 'Maxed' : 'Learn', chk.ok, function () {
      if (ST.buy(p, nd.id)) flash[nd.id] = 0.6;
    });
  }

  // one inventory / equipment cell: rarity-coloured border (+ glow for Rare and up), hover highlight, registers itself for the tooltip
  function drawItemCell(c, x, y, cs, it, slotName, chosen, info) {
    var hov = !!info && mouse.x >= x && mouse.x < x + cs && mouse.y >= y && mouse.y < y + cs, rc = it ? (it.color || COL.line) : null;
    if (hov) { hoverInfo = it ? { it: it, info: info, x: x, y: y, cs: cs } : hoverInfo; hovering = true; }
    var g = c.createLinearGradient(0, y, 0, y + cs);
    g.addColorStop(0, hov ? '#3a2c44' : '#271d30'); g.addColorStop(1, hov ? '#241a2c' : '#120d18');
    rr(c, x, y, cs, cs, 5); c.fillStyle = g; c.fill();
    if (it) { c.globalAlpha = hov ? 0.34 : 0.2; c.fillStyle = rc; rr(c, x, y, cs, cs, 5); c.fill(); c.globalAlpha = 1; }
    c.save();
    if (it && it.rarity >= 2) { c.shadowColor = rc; c.shadowBlur = 6 + 3 * Math.sin(clock * 3); }
    c.lineWidth = chosen ? 3 : hov ? 2.5 : 2; c.strokeStyle = chosen ? '#fff' : (it ? rc : (hov ? COL.accent : '#3a2e24')); rr(c, x, y, cs, cs, 5); c.stroke();
    c.restore();
    rr(c, x + 3, y + 3, cs - 6, cs - 6, 3); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,0.06)'; c.stroke();
    tx(c, glyph(it ? it.slot : slotName), x + cs / 2, y + cs / 2 + 0.5, Math.round(cs * 0.42), it ? (it.color || '#fff') : 'rgba(143,128,112,0.55)', 'center');
  }
  // hover tooltip: stats, then +/- against the item equipped in the same slot
  function drawTip(c, W, H, p) {
    var h = hoverInfo;
    if (!h || !h.it) return;
    var it = h.it, other = h.info.src === 'bag' ? equippedFor(p, it) : null, L = [], seen = {}, k, q, TW = 210;
    L.push({ t: it.name, col: it.color || COL.text, px: 14, h: 18 });
    L.push({ t: (it.rarityName || '') + ' ' + (it.slot || ''), col: COL.dim, px: 11, h: 14 });
    if (it.classReq) L.push({ t: (it.className || it.classReq) + ' only', col: it.classReq !== p.classId ? COL.bad : COL.dim, px: 11, h: 14 });
    var keysS = Object.keys(it.stats || {}).concat(other ? Object.keys(other.stats || {}) : []);
    for (q = 0; q < keysS.length; q++) {
      k = keysS[q]; if (seen[k]) continue; seen[k] = 1;
      var v = +(it.stats && it.stats[k]) || 0, d = other ? v - (+(other.stats && other.stats[k]) || 0) : 0;
      if (!v && !d) continue;
      L.push({ t: statVal(k, v) + ' ' + statLabel(k), col: v < 0 ? COL.bad : COL.text, px: 12, h: 15, d: other && d ? '(' + statVal(k, d) + ')' : '', dcol: d > 0 ? COL.good : COL.bad });
    }
    if (it.effect && it.effect.desc && it.effect.id !== 'charm') wrapLines(c, it.effect.desc, TW - 20, 10).forEach(function (s) { L.push({ t: s, col: COL.dim, px: 10, h: 13, w: 'normal' }); });
    if (other) L.push({ t: 'Compared with: ' + other.name, col: other.color || COL.dim, px: 10, h: 16 });
    else if (h.info.src === 'bag' && it.slot !== 'charm') L.push({ t: 'Nothing equipped in this slot', col: COL.good, px: 10, h: 16 });
    L.push({ t: (h.info.src === 'bag' ? 'Tap to inspect - sells for ' : 'Worth ') + (it.value || 0) + ' G', col: COL.gold, px: 10, h: 16, w: 'normal' });
    var th = 14, i; for (i = 0; i < L.length; i++) th += L[i].h;
    var tx0 = h.x + h.cs + 8; if (tx0 + TW > W - 4) tx0 = h.x - TW - 8; if (tx0 < 4) tx0 = 4;
    var ty0 = Math.max(4, Math.min(H - th - 4, h.y)), yy = ty0 + 7;
    c.save(); c.globalAlpha = 0.98; frame(c, tx0, ty0, TW, th, true);
    c.strokeStyle = it.color || COL.line; c.lineWidth = 2; rr(c, tx0, ty0, TW, th, 6); c.stroke();
    for (i = 0; i < L.length; i++) {
      tx(c, L[i].t, tx0 + 10, yy + L[i].h / 2, L[i].px, L[i].col, 'left', L[i].w);
      if (L[i].d) tx(c, L[i].d, tx0 + TW - 10, yy + L[i].h / 2, L[i].px, L[i].dcol, 'right');
      yy += L[i].h;
    }
    c.restore();
  }

  function drawInv(c, addHit, x, y, w, h, p) {
    if (!p) { tx(c, 'No hero yet', x + w / 2, y + h / 2, 14, COL.dim, 'center'); return; }
    var bag = inv(), keys = slotKeys(), COLS = 8, gap = 4, detailH = 112, nCharm = keys.filter(function (k) { return k.indexOf('charm') === 0; }).length;
    var cs = Math.max(18, Math.min(42, Math.floor((w - gap * (COLS - 1)) / COLS), Math.floor((h - detailH - 76) / (nCharm ? 9 : 8)) - gap));
    var gx = x + Math.max(0, (w - (cs * COLS + gap * (COLS - 1))) / 2), yy = y;
    tx(c, 'Equipment', x + 6, yy + 7, 12, COL.accent);
    var st = p.stats || {};
    tx(c, 'DMG ' + Math.round(st.dmg || 0) + '  CRIT ' + Math.round((st.crit || 0) * 100) + '%  ARM ' + Math.round(st.armor || 0) + '  HP ' + Math.round(p.maxHp || 0),
      x + w - 6, yy + 7, 11, COL.text, 'right');
    yy += 18;
    // paper doll: hero silhouette with slots around it (amulet head, weapon / armor / ring across the body, trinket at the feet), charms in a row below
    var step = cs + 12, mid = x + w / 2 - cs / 2, POS = { amulet: [0, 0], weapon: [-1, 1], armor: [0, 1], ring: [1, 1], trinket: [0, 2] }, extra = 0, ci = 0, i;
    c.save(); c.fillStyle = 'rgba(224,168,74,0.08)';
    c.beginPath(); c.arc(x + w / 2, yy + cs * 0.55, cs * 0.4, 0, 6.2832); c.fill();
    rr(c, x + w / 2 - cs * 0.65, yy + cs * 1.05, cs * 1.3, cs * 1.6, cs * 0.28); c.fill(); c.restore();
    for (i = 0; i < keys.length; i++) {
      (function (k) {
        var isCharm = k.indexOf('charm') === 0, pp = POS[k], cx, cy, it = p.equipment && p.equipment[k];
        if (isCharm) { cx = mid + (ci++ - (nCharm - 1) / 2) * step; cy = yy + 3 * (cs + gap) + 2; }
        else { if (!pp) pp = [extra++ % 2 ? 1 : -1, 2]; cx = mid + pp[0] * step; cy = yy + pp[1] * (cs + gap); }
        drawItemCell(c, cx, cy, cs, it, isCharm ? 'charm' : k, sel.item && sel.item.src === 'eq' && sel.item.key === k, { src: 'eq', key: k });
        addHit(cx, cy, cs, cs, function () { sel.item = it ? { src: 'eq', key: k } : null; });
      })(keys[i]);
    }
    yy += 3 * (cs + gap) + (nCharm ? cs + gap + 2 : 0) + 6;
    tx(c, 'Pack ' + bag.length + '/' + BAG_MAX, x + 6, yy + 7, 12, bag.length >= BAG_MAX ? COL.bad : COL.dim);
    button(c, addHit, x + w - 104, yy - 1, 100, 17, 'Sort by value', bag.length > 1, sortBag, '#4a3a22');
    yy += 18;
    for (i = 0; i < BAG_MAX; i++) {
      (function (idx) {
        var cx = gx + (idx % COLS) * (cs + gap), cy = yy + Math.floor(idx / COLS) * (cs + gap), it = bag[idx];
        drawItemCell(c, cx, cy, cs, it, null, sel.item && sel.item.src === 'bag' && sel.item.i === idx, it ? { src: 'bag', i: idx } : null);
        if (it) addHit(cx, cy, cs, cs, function () { sel.item = { src: 'bag', i: idx }; });
      })(i);
    }
    // detail
    var dy = y + h - detailH, it = selectedItem(p);
    frame(c, x, dy, w, detailH, true);
    if (!it) {
      tx(c, toast.t > 0 ? toast.s : 'Tap an item to inspect it.', x + w / 2, dy + detailH / 2, 12, toast.t > 0 ? toast.c : COL.dim, 'center');
      return;
    }
    tx(c, it.name, x + 10, dy + 14, 14, it.color || COL.text);
    var sub = (it.rarityName || '') + ' ' + (it.slot || '') + (it.classReq ? '  -  ' + (it.className || it.classReq) + ' only' : '');
    tx(c, sub, x + 10, dy + 31, 11, it.classReq && it.classReq !== p.classId ? COL.bad : COL.dim);
    var other = sel.item.src === 'bag' ? equippedFor(p, it) : null, ly = dy + 48, shown = 0, k, seen = {};
    var keysS = Object.keys(it.stats || {}).concat(other ? Object.keys(other.stats || {}) : []);
    for (var q = 0; q < keysS.length && shown < 4; q++) {
      k = keysS[q]; if (seen[k]) continue; seen[k] = 1;
      var v = +(it.stats && it.stats[k]) || 0, d = other ? v - (+(other.stats && other.stats[k]) || 0) : 0;
      if (!v && !d) continue;
      tx(c, statVal(k, v) + ' ' + statLabel(k), x + 10, ly, 11, v < 0 ? COL.bad : COL.text);
      if (other && d) tx(c, '(' + statVal(k, d) + ')', x + 10 + 130, ly, 11, d > 0 ? COL.good : COL.bad);
      ly += 13; shown++;
    }
    if (it.effect && it.effect.desc && it.effect.id !== 'charm' && ly < dy + detailH - 10) wrapText(c, it.effect.desc, x + 10, ly + 2, w - 130, 12, 10, COL.dim);
    var bx = x + w - 100;
    if (sel.item.src === 'bag') {
      var blocked = !!(it.classReq && it.classReq !== p.classId);
      button(c, addHit, bx, dy + 10, 90, 28, 'Equip', !blocked, function () { equip(p, sel.item.i); });
      button(c, addHit, bx, dy + 44, 90, 28, 'Sell ' + (it.value || 0) + 'G', true, function () { sell(sel.item.i); }, '#6a4a2a');
    } else {
      button(c, addHit, bx, dy + 10, 90, 28, 'Unequip', bag.length < BAG_MAX, function () { unequip(p, sel.item.key); }, '#4a3a6a');
    }
    if (toast.t > 0) tx(c, toast.s, x + w - 10, dy + detailH - 12, 11, toast.c, 'right');
  }

  function drawMap(c, x, y, w, h) {
    var D = CC.Dungeon, s = CC.state;
    if (s.mode !== 'dungeon') { tx(c, 'No map in town', x + w / 2, y + h / 2, 14, COL.dim, 'center'); return; }
    if (D && typeof D.drawFullMap === 'function') {
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.translate(x, y);
      try { D.drawFullMap(c, w, h); } catch (e) {
        c.restore(); c.save();
        tx(c, 'Map failed to draw', x + w / 2, y + h / 2, 14, COL.bad, 'center');
      }
      c.restore();
    } else tx(c, 'Map not available yet', x + w / 2, y + h / 2, 14, COL.dim, 'center');
    tx(c, 'Floor ' + s.floor, x + 8, y + 10, 12, COL.accent);
  }

  /* ---------- main draw ---------- */
  function draw(c, W, H, addHit) {
    var e = ease(t);
    hoverInfo = null; hovering = false; trackMouse(W, H);
    if (cur && e > 0.001) {
      var p = hero();
      c.save();
      c.globalAlpha = e;
      c.fillStyle = 'rgba(8,4,16,0.78)'; c.fillRect(0, 0, W, H);
      var pw = Math.min(W - 16, 460), ph = Math.min(H - 16, 640), px = (W - pw) / 2, py = (H - ph) / 2 + (1 - e) * 28;
      if (target) {
        addHit(0, 0, W, H, function () { close(); });
        addHit(px, py, pw, ph, function () { /* absorb taps inside the panel */ });
      }
      frame(c, px, py, pw, ph);
      var tw = (pw - 20 - 36) / 3;
      TABS.forEach(function (tb, i) {
        var bx = px + 10 + i * (tw + 4), by = py + 10, on = tb.id === cur;
        rr(c, bx, by, tw, 28, 6); c.fillStyle = on ? 'rgba(224,168,74,0.2)' : (target && mouse.x >= bx && mouse.x < bx + tw && mouse.y >= by && mouse.y < by + 28 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'); c.fill();
        c.lineWidth = on ? 2 : 1; c.strokeStyle = on ? COL.accent : COL.line; c.stroke();
        tx(c, tb.name + ' [' + tb.key.slice(3) + ']', bx + tw / 2, by + 14.5, 12, on ? COL.accent : COL.dim, 'center');
        if (target) addHit(bx, by, tw, 28, function () { open(tb.id); });
      });
      var cx0 = px + pw - 34;
      rr(c, cx0, py + 10, 24, 28, 8); c.fillStyle = 'rgba(255,90,90,0.25)'; c.fill();
      tx(c, 'X', cx0 + 12, py + 24.5, 13, '#ff8a8a', 'center');
      if (target) addHit(cx0, py + 10, 24, 28, function () { close(); });
      var ax = px + 10, ay = py + 48, aw = pw - 20, ah = ph - 58, noop = function () {};
      var hit = target ? addHit : noop;
      if (cur === 'skills') drawSkills(c, hit, ax, ay, aw, ah, p);
      else if (cur === 'inv') drawInv(c, hit, ax, ay, aw, ah, p);
      else if (cur === 'map') drawMap(c, ax, ay, aw, ah);
      c.restore();
      if (target && e > 0.9 && cur === 'inv') drawTip(c, W, H, p);
    }
    if (canvasEl) canvasEl.style.cursor = target && hovering ? 'pointer' : '';
    drawBoss(c, W, H);
  }

  function drawBoss(c, W, H) {
    if (bb.alpha < 0.01) return;
    var w = Math.min(W - 102, 320), x = 12, y = (CC.Minimap && CC.Minimap.height ? CC.Minimap.height + 8 : 62), h = 14; // under the minimap when there is one
    c.save(); c.globalAlpha = bb.alpha;
    rr(c, x, y, w, h, 7); c.fillStyle = 'rgba(10,6,14,0.9)'; c.fill();
    if (bb.chip > bb.pct) { rr(c, x + 1, y + 1, Math.max(h - 2, (w - 2) * bb.chip), h - 2, 6); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill(); }
    if (bb.pct > 0) {
      var g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, bb.phase === 2 ? '#ff6a4a' : '#e05a5a'); g.addColorStop(1, bb.phase === 2 ? '#a01a1a' : '#8a2a3a');
      rr(c, x + 1, y + 1, Math.max(h - 2, (w - 2) * bb.pct), h - 2, 6); c.fillStyle = g; c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(Math.round(x + w / 2), y + 1, 1, h - 2); // phase 2 marker
    c.lineWidth = 1.5; c.strokeStyle = bb.phase === 2 ? '#ff8a5a' : COL.line; rr(c, x, y, w, h, 7); c.stroke();
    tx(c, bb.name + (bb.phase === 2 ? '  ENRAGED' : ''), x + w / 2, y + h / 2 + 0.5, 10, '#fff', 'center');
    if (bb.intro > 0) { // name banner: slides in, holds, fades
      var a = Math.min(1, bb.intro / 0.4, (bb.introMax - bb.intro) / 0.35), slide = (1 - ease((bb.introMax - bb.intro) / 0.35)) * 40;
      c.globalAlpha = bb.alpha * Math.max(0, a);
      c.fillStyle = 'rgba(8,4,16,0.55)'; c.fillRect(0, H * 0.26 - 26, W, 52);
      tx(c, bb.name.toUpperCase(), W / 2 - slide, H * 0.26, Math.min(28, W / 12), bb.color, 'center');
    }
    c.restore();
  }

  function drawHud(c, W, H, addHit) {
    var p = hero();
    if (!p || p.perkOpen) return;
    var sz = 28, gap = 4, x0 = W - 12 - (sz * 3 + gap * 2), y0 = 146, pts = CC.SkillTree ? CC.SkillTree.points(p) : 0;
    TABS.forEach(function (tb, i) {
      var x = x0 + i * (sz + gap), on = target && cur === tb.id;
      rr(c, x, y0, sz, sz, 6); c.fillStyle = on ? 'rgba(224,168,74,0.35)' : 'rgba(16,10,20,0.85)'; c.fill();
      c.lineWidth = 2; c.strokeStyle = on ? COL.accent : COL.line; c.stroke();
      rr(c, x + 3, y0 + 3, sz - 6, sz - 6, 4); c.lineWidth = 1; c.strokeStyle = 'rgba(224,168,74,0.2)'; c.stroke();
      tx(c, tb.key.slice(3), x + sz / 2, y0 + sz / 2 + 0.5, 13, on ? COL.accent : '#fff', 'center');
      addHit(x, y0, sz, sz, function () { toggle(tb.id); });
      if (tb.id === 'skills' && pts > 0) { // unspent-points badge
        var pulse = 1 + Math.sin(clock * 5) * 0.12;
        c.beginPath(); c.arc(x + sz - 3, y0 + 3, 7 * pulse, 0, 6.2832); c.fillStyle = COL.good; c.fill();
        tx(c, String(pts), x + sz - 3, y0 + 3.5, 9, '#0b0812', 'center');
      }
    });
  }

  function update(dt) {
    clock += dt;
    var speed = 6; // about 0.17s per fade
    if (target) t = Math.min(1, t + dt * speed); else t = Math.max(0, t - dt * speed);
    if (!target && t <= 0) cur = null;
    if (toast.t > 0) toast.t -= dt;
    for (var k in flash) { flash[k] -= dt; if (flash[k] <= 0) delete flash[k]; }
    var B = CC.Enemies && CC.Enemies.bossBar;
    if (B) {
      bb.name = B.name || 'Boss'; bb.phase = B.phase || 1; bb.intro = B.intro || 0; bb.color = B.color || bb.color;
      bb.pct += (Math.max(0, Math.min(1, B.pct)) - bb.pct) * Math.min(1, dt * 14);
      bb.chip = Math.max(bb.pct, bb.chip - dt * 0.35);
      bb.alpha = Math.min(1, bb.alpha + dt * 4);
    } else {
      bb.alpha = Math.max(0, bb.alpha - dt * 2.5); bb.intro = 0;
      if (bb.alpha <= 0) { bb.pct = 1; bb.chip = 1; }
    }
  }

  function key(code) {
    var p = hero();
    if (code === 'Escape' && target) { close(); return true; }
    for (var i = 0; i < TABS.length; i++) if (TABS[i].key === code) { if (!p || p.perkOpen) return false; toggle(TABS[i].id); return true; }
    return false;
  }

  CC.UI = { open: open, close: close, toggle: toggle, isOpen: function () { return target; }, visible: function () { return cur !== null; },
    update: update, key: key, draw: draw, drawHud: drawHud, ownsBossBar: true,
    _state: function () { return { cur: cur, target: target, t: t, sel: sel }; } };
})();
