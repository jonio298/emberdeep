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
  var TABS = [{ id: 'inv', key: 'KeyI', name: 'Inventory' }, { id: 'skills', key: 'KeyK', name: 'Skills' }, { id: 'quests', key: 'KeyJ', name: 'Quests' }, { id: 'map', key: 'KeyM', name: 'Map' }, { id: 'stats', key: 'KeyC', name: 'Stats' }];
  var PARTY_TAB = { id: 'party', name: 'Party' }; // only while in a co-op session
  var SETTINGS_TAB = { id: 'settings', name: 'Settings' };
  function tabs() { var t = TABS.concat([SETTINGS_TAB]); return CC.Multiplayer && CC.Multiplayer.active ? t.concat([PARTY_TAB]) : t; }
  var BAG_MAX = 40, FRACT = { crit: 1, speed: 1, cdr: 1, lifesteal: 1 };

  var cur = null, target = false, t = 0, clock = 0, hovering = false;
  var sel = { skill: null, item: null, charge: null };      // item: {src:'bag', i} | {src:'eq', key}
  var toast = { s: '', t: 0, c: COL.text };
  var flash = {};                             // skill id -> seconds of pulse left
  var bb = { pct: 1, chip: 1, alpha: 0, name: '', phase: 1, kind: '', intro: 0, introMax: 2.2, color: '#c03a3a' };

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
  function lootSlots() { return CC.Loot && Array.isArray(CC.Loot.SLOTS) && CC.Loot.SLOTS.length ? CC.Loot.SLOTS : ['weapon', 'armor', 'helm', 'gloves', 'boots', 'ring', 'amulet', 'trinket']; }
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
  function glyph(slot) { return { weapon: 'W', armor: 'A', helm: 'H', gloves: 'G', boots: 'B', ring: 'R', amulet: 'N', trinket: 'T', charm: 'C' }[slot] || '?'; }
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
  // Drop an item on the ground in front of you (a co-op guest asks the host to place it). Nobody can scoop it up for a moment.
  function dropItem(src, ref) {
    var p = hero(), bag = inv(), it = src === 'bag' ? bag[ref] : p && p.equipment && p.equipment[ref];
    if (!it || !p) return;
    if (src === 'bag') bag.splice(ref, 1); else { p.equipment[ref] = null; recalc(p); }
    var MP = CC.Multiplayer;
    if (MP && MP.isGuest && MP.isGuest() && MP.requestDrop) MP.requestDrop(it);
    else if (CC.Loot && CC.Loot._spawn && CC.Loot.drops) {
      var d = CC.Loot._spawn('item', p.x + (p.face || 1) * 14, p.y + 4, { item: it, rarity: it.rarity, color: it.color });
      d.age = -2.5; d.vx = (p.face || 1) * 40; d.vy = 10; CC.Loot.drops.push(d);
    }
    sel.item = null;
    say('Dropped ' + it.name, COL.dim);
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
  // Character hub always opens with Inventory. Its five tabs remain available
  // within the same shared window (K/I/J/M/C hotkeys are unchanged).
  function openCharacter() { if (target && cur === 'inv') close(); else open('inv'); }

  /* ---------- panels ---------- */
  function drawSkills(c, addHit, x, y, w, h, p) {
    var ST = CC.SkillTree;
    if (!ST || !p) { tx(c, ST ? 'No hero yet' : 'Skill tree unavailable', x + w / 2, y + h / 2, 14, COL.dim, 'center'); return; }
    var pts = ST.points(p), list = ST.nodes(p.classId), detailH = 90, stripH = 64, lvl = p.level || 1;
    tx(c,pts>0?'POINTS TO SPEND: '+pts:'Skill points: 0',x+6,y+8,13,pts>0?COL.good:COL.dim);
    tx(c,'LV '+lvl+'/'+ST.MAX_LEVEL,x+w*.63,y+8,10,p.color||COL.text,'center');
    button(c,addHit,x+w-90,y+4,84,23,'Continue',true,close,'#39644a');
    var colW = w / 4, top = y + 44, avail = h - detailH - stripH - 60, rowH = Math.max(32, Math.min(64, avail / 6)), R = Math.max(10, Math.min(17, colW * 0.3, rowH * 0.36)), i, n, cx, cy;
    for (i = 0; i < 4; i++) tx(c, ST.colTitle(p.classId, i), x + colW * (i + 0.5), y + 28, 11, i === 3 ? (p.color || COL.accent) : COL.dim, 'center');
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
      var rk = ST.rank(p, nd.id), can = ST.canBuy(p, nd.id).ok, chosen = sel.skill === nd.id, f = flash[nd.id] || 0, locked = lvl < nd.lvl;
      if (can) { c.globalAlpha = 0.35 + 0.35 * Math.sin(clock * 4); c.strokeStyle = COL.good; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R + 4, 0, 6.2832); c.stroke(); c.globalAlpha = 1; }
      if (f > 0) { c.globalAlpha = f * 1.6; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R + 4 + (0.6 - f) * 40, 0, 6.2832); c.stroke(); c.globalAlpha = 1; }
      c.beginPath();
      if (nd.capstone) { c.moveTo(cx, cy - R - 3); c.lineTo(cx + R + 3, cy); c.lineTo(cx, cy + R + 3); c.lineTo(cx - R - 3, cy); c.closePath(); } else c.arc(cx, cy, R, 0, 6.2832);
      c.fillStyle = rk > 0 ? (nd.mastery || nd.capstone ? (p.color || COL.accent) : '#5a4a9a') : locked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)'; c.fill();
      c.lineWidth = chosen ? 3 : 1.5; c.strokeStyle = chosen ? '#fff' : (nd.capstone ? COL.gold : (rk > 0 || can ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)')); c.stroke();
      tx(c, nd.name.charAt(0), cx, cy + 0.5, Math.round(R * 0.95), rk > 0 ? '#fff' : (can ? COL.text : COL.dim), 'center');
      if (rk === 0 && locked) tx(c, 'L' + nd.lvl, cx, cy + R + 9, 9, COL.bad, 'center');
      else tx(c, rk + '/' + nd.max, cx, cy + R + 9, 10, rk >= nd.max ? COL.good : COL.dim, 'center');
      addHit(cx - R - 6, cy - R - 6, (R + 6) * 2, (R + 6) * 2 + 14, function () { sel.skill = nd.id; sel.charge = null; });
    });
    // charge attacks: the starting one and the three that unlock at levels 10, 20 and 30
    var sy = y + h - detailH - stripH + 4, cl = ST.chargeSkills(p.classId), cw = (w - 3 * 5) / 4, curCharge = ST.chargeSelected(p);
    tx(c, 'Charge attack (hold ATK)', x + 6, sy + 4, 11, COL.accent);
    cl.forEach(function (cs, k) {
      var bx = x + k * (cw + 5), by = sy + 14, bh = stripH - 22, open = ST.chargeUnlocked(p, k), on = curCharge === k;
      rr(c, bx, by, cw, bh, 6); c.fillStyle = on ? 'rgba(224,168,74,0.28)' : open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'; c.fill();
      c.lineWidth = on ? 2.5 : 1.5; c.strokeStyle = on ? COL.accent : open ? COL.line : 'rgba(255,255,255,0.12)'; c.stroke();
      var nm = cs.name.length > 11 ? cs.name.replace(/ .*/, '') : cs.name;
      tx(c, nm, bx + cw / 2, by + bh * 0.38, 10, open ? (on ? COL.accent : COL.text) : COL.dim, 'center');
      tx(c, open ? (on ? 'ACTIVE' : 'Tap to use') : 'Level ' + cs.lvl, bx + cw / 2, by + bh * 0.72, 9, open ? (on ? COL.good : COL.dim) : COL.bad, 'center', 'normal');
      addHit(bx, by, cw, bh, function () { sel.charge = k; sel.skill = null; if (open) ST.selectCharge(p, k); });
    });
    // detail box
    var dy = y + h - detailH, nd = sel.skill && ST.node(p.classId, sel.skill);
    frame(c, x, dy, w, detailH, true);
    if (sel.charge !== null && cl[sel.charge]) {
      var csel = cl[sel.charge];
      tx(c, csel.name, x + 12, dy + 16, 15, COL.accent);
      wrapText(c, csel.desc, x + 12, dy + 38, w - 24, 15, 12, COL.text);
      tx(c, ST.chargeUnlocked(p, sel.charge) ? (curCharge === sel.charge ? 'Equipped' : 'Tap it to equip') : 'Unlocks at level ' + csel.lvl, x + 12, dy + detailH - 14, 11, ST.chargeUnlocked(p, sel.charge) ? COL.good : COL.dim);
      return;
    }
    if (!nd) { tx(c, 'Tap a skill to read it. Glowing skills can be learned.', x + w / 2, dy + detailH / 2, 12, COL.dim, 'center'); return; }
    var chk = ST.canBuy(p, nd.id), rk2 = ST.rank(p, nd.id);
    tx(c, nd.name + '  ' + rk2 + '/' + nd.max, x + 12, dy + 16, 15, nd.mastery ? (p.color || COL.accent) : COL.text);
    n = wrapText(c, nd.desc, x + 12, dy + 38, w - 24 - 96, 15, 12, COL.text);
    tx(c, chk.ok ? 'Cost: 1 point  (needs level ' + nd.lvl + ')' : chk.reason, x + 12, dy + detailH - 14, 11, chk.ok ? COL.good : COL.dim);
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
    if (CC.ItemArt) CC.ItemArt.draw(c, it, it ? it.slot : slotName, x, y, cs, { ghostAlpha: 0.32 });
    else tx(c, glyph(it ? it.slot : slotName), x + cs / 2, y + cs / 2 + 0.5, Math.round(cs * 0.42), it ? (it.color || '#fff') : 'rgba(143,128,112,0.55)', 'center');
  }

  // An ornate equipment socket: bronze double frame with rivets, rarity glow, a ghost of the slot when empty
  var SOCKET_NAME = { weapon: 'WEAPON', armor: 'ARMOR', helm: 'HELM', gloves: 'GLOVES', boots: 'BOOTS', ring: 'RING', amulet: 'AMULET', trinket: 'TRINKET', charm: 'CHARM' };
  function drawSocket(c, x, y, cs, it, slotName, chosen, info, accent) {
    var hov = !!info && mouse.x >= x && mouse.x < x + cs && mouse.y >= y && mouse.y < y + cs, rc = it ? (it.color || COL.line) : accent || '#5a4630';
    if (hov) { hoverInfo = it ? { it: it, info: info, x: x, y: y, cs: cs } : hoverInfo; hovering = true; }
    c.save();
    var g = c.createRadialGradient(x + cs / 2, y + cs / 2, 2, x + cs / 2, y + cs / 2, cs * 0.75);
    g.addColorStop(0, hov ? '#33263f' : '#241a2e'); g.addColorStop(1, '#0c0812');
    rr(c, x, y, cs, cs, 7); c.fillStyle = g; c.fill();
    if (it) { var a = c.createRadialGradient(x + cs / 2, y + cs / 2, 2, x + cs / 2, y + cs / 2, cs * 0.7); a.addColorStop(0, rc + '66'); a.addColorStop(1, rc + '00'); rr(c, x, y, cs, cs, 7); c.fillStyle = a; c.fill(); }
    if (it && it.rarity >= 2) { c.shadowColor = rc; c.shadowBlur = 8 + 4 * Math.sin(clock * 3); }
    c.lineWidth = chosen ? 3 : 2.4; c.strokeStyle = chosen ? '#fff6dc' : it ? rc : (hov ? COL.accent : '#7a5a34'); rr(c, x, y, cs, cs, 7); c.stroke();
    c.shadowBlur = 0; c.lineWidth = 1; c.strokeStyle = 'rgba(255,214,150,0.28)'; rr(c, x + 3, y + 3, cs - 6, cs - 6, 5); c.stroke();
    c.fillStyle = '#c89a4a'; [[x + 2, y + 2], [x + cs - 2, y + 2], [x + 2, y + cs - 2], [x + cs - 2, y + cs - 2]].forEach(function (q) { c.beginPath(); c.arc(q[0], q[1], 1.6, 0, 6.2832); c.fill(); });
    c.restore();
    if (CC.ItemArt) CC.ItemArt.draw(c, it, it ? it.slot : slotName, x + 2, y + 2, cs - 4, { ghostAlpha: 0.34 });
    if (!it && cs >= 34) tx(c, SOCKET_NAME[slotName] || '', x + cs / 2, y + cs - 5, 7, 'rgba(176,150,110,0.7)', 'center');
  }

  // The hero paper doll: a runed panel, a glowing sigil, and a detailed armoured figure for the sockets to sit on.
  function drawPaperDoll(c, px, py, pw, ph, p, cs) {
    var col = p.color || '#e0a84a', cx = px + pw / 2, cls = p.classId || 'swordsman', i, a;
    c.save();
    var bg = c.createLinearGradient(0, py, 0, py + ph); bg.addColorStop(0, '#2a1d38'); bg.addColorStop(0.55, '#150f20'); bg.addColorStop(1, '#0c0814');
    rr(c, px, py, pw, ph, 14); c.fillStyle = bg; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#7a5a34'; rr(c, px, py, pw, ph, 14); c.stroke();
    c.lineWidth = 1; c.strokeStyle = 'rgba(224,168,74,0.35)'; rr(c, px + 5, py + 5, pw - 10, ph - 10, 10); c.stroke();
    [[px + 9, py + 9], [px + pw - 9, py + 9], [px + 9, py + ph - 9], [px + pw - 9, py + ph - 9]].forEach(function (q) { // filigree corners
      c.fillStyle = '#c89a4a'; c.beginPath(); c.moveTo(q[0], q[1] - 4); c.lineTo(q[0] + 4, q[1]); c.lineTo(q[0], q[1] + 4); c.lineTo(q[0] - 4, q[1]); c.closePath(); c.fill();
      c.fillStyle = '#1a1020'; c.beginPath(); c.arc(q[0], q[1], 1.3, 0, 6.2832); c.fill();
    });
    // the sigil behind the figure: nested rune rings with tick marks, glowing in the hero's colour
    var sy = py + ph * 0.5, R = Math.min(pw * 0.34, ph * 0.46), pulse = 0.5 + 0.5 * Math.sin(clock * 1.6);
    var glow = c.createRadialGradient(cx, sy, 4, cx, sy, R * 1.25); glow.addColorStop(0, col + '40'); glow.addColorStop(1, col + '00');
    c.fillStyle = glow; c.fillRect(cx - R * 1.3, sy - R * 1.3, R * 2.6, R * 2.6);
    c.strokeStyle = col; c.globalAlpha = 0.35 + 0.15 * pulse; c.lineWidth = 1.4;
    c.beginPath(); c.arc(cx, sy, R, 0, 6.2832); c.stroke(); c.beginPath(); c.arc(cx, sy, R * 0.78, 0, 6.2832); c.stroke();
    for (i = 0; i < 24; i++) { a = i / 24 * 6.2832 + clock * 0.05; c.beginPath(); c.moveTo(cx + Math.cos(a) * R * 0.9, sy + Math.sin(a) * R * 0.9); c.lineTo(cx + Math.cos(a) * R * (i % 3 === 0 ? 1.07 : 1.0), sy + Math.sin(a) * R * (i % 3 === 0 ? 1.07 : 1.0)); c.stroke(); }
    c.beginPath(); for (i = 0; i < 6; i++) { a = i / 6 * 6.2832 - 1.5708 + clock * 0.03; var qx = cx + Math.cos(a) * R * 0.78, qy = sy + Math.sin(a) * R * 0.78; if (i) c.lineTo(qx, qy); else c.moveTo(qx, qy); } c.closePath(); c.stroke();
    c.globalAlpha = 1;
    // ---- the figure ----
    var u = cs / 42, fy = py + ph * 0.1, dark = '#1c1424', steel = '#7a7d96', steelHi = '#c4c8e0', cloth = col;
    c.translate(cx, fy); c.scale(u * 1.05, u * 1.05);
    c.lineJoin = 'round'; c.lineCap = 'round';
    // cape
    c.beginPath(); c.moveTo(-24, 22); c.quadraticCurveTo(-40, 70, -34, 126); c.lineTo(34, 126); c.quadraticCurveTo(40, 70, 24, 22); c.closePath();
    var cg = c.createLinearGradient(0, 22, 0, 126); cg.addColorStop(0, '#5a1624'); cg.addColorStop(1, '#1e0810'); c.fillStyle = cg; c.fill(); c.lineWidth = 1.6; c.strokeStyle = '#0c0408'; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1; for (i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 9, 30); c.quadraticCurveTo(i * 12, 80, i * 13, 124); c.stroke(); }
    // legs and greaves
    [-1, 1].forEach(function (s) {
      c.beginPath(); c.moveTo(s * 4, 82); c.lineTo(s * 16, 82); c.lineTo(s * 17, 118); c.lineTo(s * 5, 118); c.closePath();
      c.fillStyle = lin(c, s * 4, 0, s * 17, 0, '#4a3f66', '#241c36'); c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#0e0a16'; c.stroke();
      c.beginPath(); c.moveTo(s * 4.5, 100); c.lineTo(s * 16.5, 100); c.lineTo(s * 17, 120); c.lineTo(s * 5, 120); c.closePath(); c.fillStyle = lin(c, 0, 100, 0, 120, steel, '#3a3c50'); c.fill(); c.stroke();
      c.fillStyle = steelHi; c.beginPath(); c.arc(s * 10.5, 96, 4.2, 0, 6.2832); c.fill(); c.stroke(); // knee guard
    });
    // arms: pauldron, bicep, bracer, hand
    [-1, 1].forEach(function (s) {
      c.beginPath(); c.moveTo(s * 20, 28); c.lineTo(s * 33, 46); c.lineTo(s * 36, 74); c.lineTo(s * 28, 76); c.lineTo(s * 24, 50); c.closePath();
      c.fillStyle = lin(c, 0, 28, s * 36, 74, '#4a3f66', '#251d38'); c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#0e0a16'; c.stroke();
      c.fillStyle = lin(c, 0, 52, 0, 76, steel, '#3a3c50'); c.fillRect(s > 0 ? 25 : -37, 56, 12, 20); c.strokeRect(s > 0 ? 25 : -37, 56, 12, 20);
      c.beginPath(); c.ellipse(s * 32, 82, 6, 7, 0, 0, 6.2832); c.fillStyle = steelHi; c.fill(); c.stroke();
      c.beginPath(); c.ellipse(s * 26, 28, 12, 8, s * 0.5, 0, 6.2832); c.fillStyle = lin(c, s * 14, 20, s * 38, 36, steelHi, '#4a4c64'); c.fill(); c.stroke(); // pauldron
      c.fillStyle = cloth; c.beginPath(); c.arc(s * 28, 28, 2.4, 0, 6.2832); c.fill();
    });
    // torso: breastplate with a tabard in the hero's colour, belt and buckle
    c.beginPath(); c.moveTo(-22, 26); c.lineTo(22, 26); c.lineTo(20, 60); c.lineTo(12, 84); c.lineTo(-12, 84); c.lineTo(-20, 60); c.closePath();
    c.fillStyle = lin(c, -22, 0, 22, 0, '#3e3858', '#6a6490'); c.fill(); c.lineWidth = 1.6; c.strokeStyle = '#0e0a16'; c.stroke();
    c.beginPath(); c.moveTo(-7, 28); c.lineTo(7, 28); c.lineTo(9, 82); c.lineTo(0, 90); c.lineTo(-9, 82); c.closePath(); c.fillStyle = cloth; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-20, 38); c.quadraticCurveTo(0, 46, 20, 38); c.moveTo(-18, 50); c.quadraticCurveTo(0, 58, 18, 50); c.stroke();
    c.fillStyle = '#3a2412'; c.fillRect(-20, 70, 40, 6); c.fillStyle = '#d6b46a'; c.fillRect(-4, 69, 8, 8); c.strokeRect(-4, 69, 8, 8);
    // class emblem on the tabard
    c.strokeStyle = '#fff3d0'; c.fillStyle = '#fff3d0'; c.lineWidth = 1.6;
    if (cls === 'wizard') { c.beginPath(); for (i = 0; i < 5; i++) { a = i / 5 * 6.2832 - 1.5708; var sx2 = Math.cos(a) * 6, sy2 = 46 + Math.sin(a) * 6, b2 = a + 6.2832 / 10, ix = Math.cos(b2) * 2.6, iy = 46 + Math.sin(b2) * 2.6; if (i) c.lineTo(sx2, sy2); else c.moveTo(sx2, sy2); c.lineTo(ix, iy); } c.closePath(); c.fill(); }
    else if (cls === 'necromancer') { c.beginPath(); c.arc(0, 44, 5, 0, 6.2832); c.fill(); c.fillRect(-3, 48, 6, 4); c.fillStyle = col; c.beginPath(); c.arc(-2, 44, 1.2, 0, 6.2832); c.arc(2, 44, 1.2, 0, 6.2832); c.fill(); }
    else if (cls === 'thief') { c.beginPath(); c.moveTo(-5, 40); c.lineTo(5, 52); c.moveTo(5, 40); c.lineTo(-5, 52); c.stroke(); }
    else { c.beginPath(); c.moveTo(0, 38); c.lineTo(6, 41); c.lineTo(5, 50); c.lineTo(0, 54); c.lineTo(-5, 50); c.lineTo(-6, 41); c.closePath(); c.stroke(); c.beginPath(); c.moveTo(0, 41); c.lineTo(0, 51); c.moveTo(-3, 45); c.lineTo(3, 45); c.stroke(); }
    // gorget, neck and head with a hood
    c.fillStyle = lin(c, 0, 14, 0, 28, steel, '#3a3c50'); c.beginPath(); c.moveTo(-9, 20); c.lineTo(9, 20); c.lineTo(11, 30); c.lineTo(-11, 30); c.closePath(); c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#0e0a16'; c.stroke();
    c.beginPath(); c.ellipse(0, 6, 12, 14, 0, 0, 6.2832); c.fillStyle = lin(c, -10, -6, 10, 20, '#e8c8a0', '#a8805c'); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-16, 12); c.quadraticCurveTo(-18, -14, 0, -16); c.quadraticCurveTo(18, -14, 16, 12); c.quadraticCurveTo(10, -2, 0, -4); c.quadraticCurveTo(-10, -2, -16, 12); c.closePath(); c.fillStyle = lin(c, 0, -16, 0, 12, '#3e2c5c', '#1c1230'); c.fill(); c.stroke();
    c.fillStyle = col; c.beginPath(); c.arc(-4.5, 6, 1.7, 0, 6.2832); c.arc(4.5, 6, 1.7, 0, 6.2832); c.fill(); // glowing eyes
    c.restore();
  }
  function lin(c, x0, y0, x1, y1, a, b) { var g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
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

  // the pack as a stitched leather satchel: a leather body, a buckled flap along the top and a pip for every slot in use
  function satchel(c, x, y, w, h, used) {
    rr(c, x, y, w, h, 12);
    var g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#3a2616'); g.addColorStop(1, '#22150c');
    c.fillStyle = g; c.fill(); c.lineWidth = 2; c.strokeStyle = '#6b4a2a'; c.stroke();
    c.save(); c.setLineDash([4, 3]); c.lineWidth = 1; c.strokeStyle = 'rgba(224,168,74,0.45)'; rr(c, x + 3, y + 3, w - 6, h - 6, 9); c.stroke(); c.restore();
    rr(c, x + w / 2 - 9, y - 5, 18, 10, 3); c.fillStyle = COL.gold; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#5a4630'; c.stroke(); // buckle
    c.fillStyle = '#2a1a0c'; c.fillRect(x + w / 2 - 1.5, y - 2, 3, 4);
    for (var i = 0; i < BAG_MAX; i += 5) { c.fillStyle = used > i ? COL.accent : 'rgba(255,255,255,0.1)'; c.fillRect(x + 10 + (i / 5) * 6, y + h + 2, 4, 3); }
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
    var step = cs + 12, mid = x + w / 2 - cs / 2, POS = { amulet: [-1, 0], helm: [0, 0], trinket: [1, 0], weapon: [-1, 1], armor: [0, 1], ring: [1, 1], gloves: [-1, 2], boots: [1, 2] }, extra = 0, ci = 0, i;
    drawPaperDoll(c, x + 2, yy - 6, w - 4, 3 * (cs + gap) + (nCharm ? cs + gap + 2 : 0) + 8, p, cs);
    for (i = 0; i < keys.length; i++) {
      (function (k) {
        var isCharm = k.indexOf('charm') === 0, pp = POS[k], cx, cy, it = p.equipment && p.equipment[k];
        if (isCharm) { cx = mid + (ci++ - (nCharm - 1) / 2) * step; cy = yy + 3 * (cs + gap) + 2; }
        else { if (!pp) pp = [extra++ % 2 ? 1 : -1, 2]; cx = mid + pp[0] * step; cy = yy + pp[1] * (cs + gap); }
        drawSocket(c, cx, cy, cs, it, isCharm ? 'charm' : k, sel.item && sel.item.src === 'eq' && sel.item.key === k, { src: 'eq', key: k }, isCharm ? '#6a4a8a' : '#7a5a34');
        addHit(cx, cy, cs, cs, function () { sel.item = it ? { src: 'eq', key: k } : null; });
      })(keys[i]);
    }
    yy += 3 * (cs + gap) + (nCharm ? cs + gap + 2 : 0) + 6;
    tx(c, 'Pack ' + bag.length + '/' + BAG_MAX, x + 6, yy + 7, 12, bag.length >= BAG_MAX ? COL.bad : COL.dim);
    if(CC.EggQuest){
      var egg=CC.EggQuest.status(),labelEgg='';
      if(egg.stage==='gathered')labelEgg='3 RESCUED EGGS';
      else if(egg.stage==='nest')labelEgg='WARM EAGLE EGG';
      else if(egg.stage==='complete')labelEgg=egg.hatched?('EAGLE'+(egg.name?' · '+egg.name.toUpperCase():'')):
        'WARM EGG · HATCHES AT LV '+egg.hatchLevel;
      if(labelEgg)tx(c,labelEgg,x+w*.51,yy+7,10,'#eed39c','center');
    }
    button(c, addHit, x + w - 104, yy - 1, 100, 17, 'Sort by value', bag.length > 1, sortBag, '#4a3a22');
    yy += 18;
    satchel(c, gx - 5, yy - 4, cs * COLS + gap * (COLS - 1) + 10, Math.ceil(BAG_MAX / COLS) * (cs + gap) + 4, bag.length);
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
      button(c, addHit, bx, dy + 5, 90, 25, 'Equip', !blocked, function () { equip(p, sel.item.i); });
      button(c, addHit, bx, dy + 34, 90, 25, 'Drop', true, function () { dropItem('bag', sel.item.i); }, '#5a3a3a');
      button(c, addHit, bx, dy + 63, 90, 25, 'Sell ' + (it.value || 0) + 'G', true, function () { sell(sel.item.i); }, '#6a4a2a');
    } else {
      button(c, addHit, bx, dy + 5, 90, 25, 'Unequip', bag.length < BAG_MAX, function () { unequip(p, sel.item.key); }, '#4a3a6a');
      button(c, addHit, bx, dy + 34, 90, 25, 'Drop', true, function () { dropItem('eq', sel.item.key); }, '#5a3a3a');
    }
    if (toast.t > 0) tx(c, toast.s, x + w - 10, dy + detailH - 12, 11, toast.c, 'right');
  }

  // Final computed numbers (class base + level scaling + all gear and skill modifiers).
  var tmTaps = 0, tmAt = 0;
  function drawStats(c, x, y, w, h, p, hit) {
    if (!p) return;
    var stats = p.stats || {}, equip = p.equipment || {}, mods = p.mods || {};
    tx(c, p.name + '  -  Level ' + p.level, x + 8, y + 13, 17, COL.accent);
    tx(c, 'Final values include all equipment and learned skills', x + 8, y + 35, 11, COL.dim);
    var data = [
      ['Health', Math.ceil(p.hp) + ' / ' + p.maxHp], ['Mana', Math.ceil(p.mana) + ' / ' + p.maxMana],
      ['Damage', (stats.dmg || 0).toFixed(1)], ['Armor', (stats.armor || 0).toFixed(1)],
      ['Move speed', (stats.speed || 0).toFixed(1)], ['Critical chance', ((stats.crit || 0) * 100).toFixed(1) + '%'],
      ['Critical damage', ((stats.critDmg || 0) * 100).toFixed(0) + '%'],
      ['Cooldown reduction', ((stats.cdr || 0) * 100).toFixed(1) + '%'],
      ['Life steal', ((stats.lifesteal || 0) * 100).toFixed(1) + '%'],
      ['Luck', (stats.luck || 0).toFixed(1)], ['Health regen / s', (stats.regen || 0).toFixed(2)],
      ['Mana regen / s', (stats.manaRegen || 0).toFixed(2)],
      ['Experience bonus', '+' + ((mods.xpPct || 0) * 100).toFixed(0) + '%'],
      ['Area bonus', '+' + ((mods.aoePct || 0) * 100).toFixed(0) + '%']
    ];
    var row = Math.max(19, Math.min(29, (h - 118) / data.length));
    for (var i = 0; i < data.length; i++) {
      var yy = y + 56 + i * row;
      if (i % 2 === 0) { c.fillStyle = 'rgba(224,168,74,0.055)'; rr(c, x + 4, yy - 9, w - 8, row - 1, 3); c.fill(); }
      tx(c, data[i][0], x + 10, yy, 12, COL.text);
      tx(c, data[i][1], x + w - 10, yy, 12, COL.good, 'right');
    }
    // Secret: tap the Area bonus row three times to reveal TEST MODE.
    var lastY = y + 56 + (data.length - 1) * row, TM = CC.TestMode;
    if (hit) hit(x + 4, lastY - 9, w - 8, row + 14, function () {
      var now = Date.now(); tmTaps = now - tmAt < 1400 ? tmTaps + 1 : 1; tmAt = now;
      if (tmTaps >= 3 && TM && TM.unlock) { tmTaps = 0; TM.unlock(); toast.s = 'Test mode unlocked'; toast.c = COL.good; toast.t = 1.6; }
    });
    if (TM && TM.isUnlocked && TM.isUnlocked()) {
      var tby = Math.min(y + h - 44, lastY + row * 0.5 + 6);
      if (hit) button(c, hit, x + w / 2 - 70, tby, 140, 26, 'TEST MODE', true, function () { close(); TM.open(); }, '#6a2a7a');
    }
    var bonus = Object.keys(equip).filter(function (slot) { return equip[slot]; }).length;
    tx(c, bonus + ' equipped items  |  ' + (p.perks || []).length + ' perks  |  ' +
      (CC.SkillTree ? CC.SkillTree.spent(p) : 0) + ' skill points invested', x + w / 2, y + h - 12, 11, COL.accent, 'center');
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

  // SETTINGS tab: options remembered in this browser (see settings.js)
  function drawSettings(c, hit, x, y, w, h) {
    var S = CC.Settings; if (!S) { tx(c, 'Settings unavailable', x + w / 2, y + h / 2, 14, COL.dim, 'center'); return; }
    var yy = y + 14;
    tx(c, 'SETTINGS', x + w / 2, yy, 16, COL.accent, 'center'); yy += 30;
    function row(title, desc, label, on, cb, color) {
      rr(c, x + 6, yy, w - 12, 84, 8); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = COL.line; c.stroke();
      tx(c, title, x + 18, yy + 20, 14, '#fff', 'left');
      tx(c, desc, x + 18, yy + 40, 11, COL.dim, 'left');
      button(c, hit, x + 18, yy + 50, w - 36, 28, label, true, cb, on ? (color || '#2a6a4a') : '#5a3a3a');
      yy += 94;
    }
    row('Auto equip', 'Wear loot automatically when it is better than your gear.', S.get('autoEquip') ? 'ON  -  tap to turn off' : 'OFF  -  tap to turn on', S.get('autoEquip'), function () { S.toggle('autoEquip'); });
    row('Auto level', 'Spend skill points and pick level-up perks for you.', S.get('autoLevel') ? 'ON  -  tap to turn off' : 'OFF  -  tap to turn on', S.get('autoLevel'), function () { S.toggle('autoLevel'); });
    // zoom slider (drag, or tap the bar): 28% .. 220%, on a log scale so the middle feels even
    (function () {
      var rg = CC.zoomRange || [0.28, 2.2], z = CC.getZoomTarget ? CC.getZoomTarget() : 1, tk = x + 28, tw = w - 56, ty = yy + 54, k = Math.log(z / rg[0]) / Math.log(rg[1] / rg[0]);
      rr(c, x + 6, yy, w - 12, 84, 8); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = COL.line; c.stroke();
      tx(c, 'Zoom', x + 18, yy + 20, 14, '#fff', 'left'); tx(c, Math.round(z * 100) + '%', x + w - 18, yy + 20, 14, COL.accent, 'right');
      tx(c, 'Drag the bar, or pinch the screen. 100% is the normal view.', x + 18, yy + 40, 11, COL.dim, 'left');
      rr(c, tk, ty - 3, tw, 6, 3); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fill();
      rr(c, tk, ty - 3, Math.max(4, tw * k), 6, 3); c.fillStyle = COL.accent; c.fill();
      var kx = tk + tw * k; c.beginPath(); c.arc(kx, ty, 11, 0, 6.2832); c.fillStyle = '#f2e3b8'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#7a5a28'; c.stroke();
      hit(tk - 14, ty - 18, tw + 28, 36, function (px) { if (CC.setZoom) CC.setZoom(rg[0] * Math.pow(rg[1] / rg[0], Math.max(0, Math.min(1, (px - tk) / tw)))); }, true);
      yy += 94;
    })();
    row('Movement stick', 'Floating appears under your thumb. Fixed stays in the corner.', S.get('stick') === 'fixed' ? 'FIXED  -  tap for floating' : 'FLOATING  -  tap for fixed', true, function () { S.set('stick', S.get('stick') === 'fixed' ? 'floating' : 'fixed'); }, '#3a5a8a');
  }

  // PARTY tab: session options. The host decides whether the guest can be hurt.
  function drawParty(c, hit, x, y, w, h) {
    var MP = CC.Multiplayer, host = MP && MP.isHost && MP.isHost(), on = !!(MP && MP.options && MP.options.guestInvuln), yy = y + 14;
    tx(c, 'PARTY OPTIONS', x + w / 2, yy, 16, COL.accent, 'center'); yy += 34;
    var room = MP && MP.room, partner = room && (host ? room.guest : room.host);
    tx(c, partner ? (host ? 'Guest: ' : 'Host: ') + partner.name + '  -  ' + partner.hero : 'Waiting for your partner...', x + w / 2, yy, 12, COL.text, 'center'); yy += 34;
    rr(c, x + 6, yy, w - 12, 92, 8); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = COL.line; c.stroke();
    tx(c, 'Guest invulnerability', x + 18, yy + 20, 14, '#fff', 'left');
    if (host) {
      tx(c, 'When ON, your guest cannot take damage.', x + 18, yy + 42, 11, COL.dim, 'left');
      button(c, hit, x + 18, yy + 54, w - 36, 28, on ? 'ON  -  tap to turn off' : 'OFF  -  tap to turn on', true,
        function () { MP.setGuestInvuln(!on); }, on ? '#2a6a8a' : '#6a2a2a');
    } else {
      tx(c, 'Only the host can change this.', x + 18, yy + 42, 11, COL.dim, 'left');
      tx(c, on ? 'The host has made you INVULNERABLE' : 'You can take damage', x + 18, yy + 66, 13, on ? '#9fe3ff' : COL.text, 'left');
    }
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
      var TT = tabs(), tw = (pw - 20 - 36 - (TT.length - 1) * 4) / TT.length;
      if (cur === 'party' && TT.length === TABS.length + 1) cur = 'inv'; // left the session while the tab was open
      TT.forEach(function (tb, i) {
        var bx = px + 10 + i * (tw + 4), by = py + 10, on = tb.id === cur;
        rr(c, bx, by, tw, 28, 6); c.fillStyle = on ? 'rgba(224,168,74,0.2)' : (target && mouse.x >= bx && mouse.x < bx + tw && mouse.y >= by && mouse.y < by + 28 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'); c.fill();
        c.lineWidth = on ? 2 : 1; c.strokeStyle = on ? COL.accent : COL.line; c.stroke();
        tx(c,pw<425||!tb.key?tb.name:tb.name+' ['+tb.key.slice(3)+']',bx+tw/2,by+14.5,
           pw<350||TT.length>5&&pw<460?10:12,on?COL.accent:COL.dim,'center');
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
      else if (cur === 'quests' && CC.EggQuest) CC.EggQuest.drawJournal(c,ax,ay,aw,ah);
      else if (cur === 'stats') drawStats(c, ax, ay, aw, ah, p, hit);
      else if (cur === 'party') drawParty(c, hit, ax, ay, aw, ah);
      else if (cur === 'settings') drawSettings(c, hit, ax, ay, aw, ah);
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
      g.addColorStop(0,bb.kind==='patchwork'?'#d99aff':bb.phase===2?'#ff6a4a':'#e05a5a');
      g.addColorStop(1,bb.kind==='patchwork'?'#6f288f':bb.phase===2?'#a01a1a':'#8a2a3a');
      rr(c, x + 1, y + 1, Math.max(h - 2, (w - 2) * bb.pct), h - 2, 6); c.fillStyle = g; c.fill();
    }
    if(bb.kind!=='patchwork'){c.fillStyle='rgba(255,255,255,0.7)';c.fillRect(Math.round(x+w/2),y+1,1,h-2);}
    c.lineWidth=1.5;c.strokeStyle=bb.kind==='patchwork'?'#b76be2':bb.phase===2?'#ff8a5a':COL.line;
    rr(c,x,y,w,h,7);c.stroke();
    tx(c, bb.name + (bb.phase === 2 ? '  ENRAGED' : ''), x + w / 2, y + h / 2 + 0.5, 10, '#fff', 'center');
    if (bb.intro > 0) { // name banner: slides in, holds, fades
      var a = Math.min(1, bb.intro / 0.4, (bb.introMax - bb.intro) / 0.35), slide = (1 - ease((bb.introMax - bb.intro) / 0.35)) * 40;
      c.globalAlpha = bb.alpha * Math.max(0, a);
      c.fillStyle = 'rgba(8,4,16,0.55)'; c.fillRect(0, H * 0.26 - 26, W, 52);
      tx(c, bb.name.toUpperCase(), W / 2 - slide, H * 0.26, Math.min(28, W / 12), bb.color, 'center');
    }
    c.restore();
  }

  // one themed bar: dark well, bronze frame, glossy fill, optional centred label
  function hudBar(c, x, y, w, h, frac, c1, c2, label) {
    frac = Math.max(0, Math.min(1, frac || 0));
    rr(c, x, y, w, h, 3); c.fillStyle = 'rgba(10,6,14,0.9)'; c.fill();
    if (frac > 0) {
      var g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c1); g.addColorStop(1, c2);
      rr(c, x + 1.5, y + 1.5, Math.max(3, (w - 3) * frac), h - 3, 2); c.fillStyle = g; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x + 2, y + 2, Math.max(2, (w - 4) * frac), Math.max(1, (h - 4) * 0.35));
    }
    c.lineWidth = 1.5; c.strokeStyle = COL.line; rr(c, x, y, w, h, 3); c.stroke();
    if (label) { c.save(); c.shadowColor = '#000'; c.shadowBlur = 3; tx(c, label, x + w / 2, y + h / 2 + 0.5, Math.max(8, h - 5), '#fff', 'center'); c.restore(); }
  }

  // the unified top-right panel: health, mana and experience bars, level, gold, where you are, the K / I / M buttons and Retreat, all in one dark-fantasy frame
  function drawHud(c, W, H, addHit) {
    var p = hero();
    if (!p || p.perkOpen) return;
    var s = CC.state, mm = CC.Minimap, left = mm ? mm.margin + mm.size + 8 : 12;
    var pw = Math.min(214, Math.max(150, W - 8 - left)), px = W - 8 - pw, py = 8 + (CC.Multiplayer && CC.Multiplayer.active ? 22 : 0), ph = 104, bw = pw - 20, pts = CC.SkillTree ? CC.SkillTree.points(p) : 0, i;
    frame(c, px, py, pw, ph, false);
    hudBar(c, px + 10, py + 9, bw, 15, p.hp / (p.maxHp || 1), '#ff6b6b', '#b01e3a', Math.ceil(p.hp) + ' / ' + Math.ceil(p.maxHp));
    hudBar(c, px + 10, py + 27, bw, 11, p.mana / (p.maxMana || 1), '#6bb8ff', '#2a56c8', null);
    hudBar(c, px + 10, py + 41, bw, 8, p.xp / (p.xpNext || 1), '#9be36b', '#4a9a2a', null);
    var where = s.mode === 'dungeon' ? (s.area === 'forest' ? 'Giant Forest' : s.area === 'plains' ? 'Rolling Plains' : s.area === 'defense' ? 'Defense' : s.area === 'tree-ascent' ? 'Tree Bough '+(s.treeFloor||1) : 'Floor ' + s.floor) : 'Town';
    tx(c, 'LV ' + (p.level || 1), px + 12, py + 61, 13, COL.accent);
    tx(c, where, px + pw / 2, py + 61, 11, COL.text, 'center');
    tx(c, Math.floor(s.gold || 0) + ' G', px + pw - 12, py + 61, 13, COL.gold, 'right');
    c.fillStyle = 'rgba(224,168,74,0.25)'; c.fillRect(px + 12, py + 70, pw - 24, 1);
    // Three aligned actions in the HUD, not another floating menu.
    var by=py+74,sz=24,inner=pw-24,gap=5;
    var charW=Math.max(38,Math.floor(inner*.27)),questW=Math.max(43,Math.floor(inner*.30)),
        retreatW=Math.max(27,inner-charW-questW-gap*2);
    var hx=px+12,activeChar=target&&cur==='inv',
        activeQuest=target&&cur==='quests';
    rr(c,hx,by,charW,sz,6);
    c.fillStyle=activeChar?'rgba(224,168,74,.35)':'rgba(16,10,20,.87)';
    c.fill();c.lineWidth=1.5;c.strokeStyle=activeChar?COL.accent:COL.line;c.stroke();
    tx(c,'CHAR',hx+charW/2,by+sz/2+.5,11,
       activeChar?COL.accent:'#f2eadb','center');
    addHit(hx,by,charW,sz,openCharacter);
    var qx=hx+charW+gap;
    rr(c,qx,by,questW,sz,6);
    c.fillStyle=activeQuest?'rgba(224,168,74,.32)':'rgba(16,10,20,.87)';
    c.fill();c.lineWidth=1.5;c.strokeStyle=activeQuest?COL.accent:COL.line;c.stroke();
    tx(c,questW<49?'QUEST':'QUEST',qx+questW/2,by+sz/2+.5,
       questW<48?9:10,activeQuest?COL.accent:'#e8d2ac','center');
    addHit(qx,by,questW,sz,function(){toggle('quests');});
    if(pts>0){
      var pulse=1+Math.sin(clock*5)*.12;
      c.beginPath();c.arc(hx+charW-2,by+3,7*pulse,0,6.2832);
      c.fillStyle=COL.good;c.fill();
      tx(c,String(pts),hx+charW-2,by+3.5,9,'#0b0812','center');
    }
    if(s.mode==='dungeon'){
      var bx=qx+questW+gap, small=retreatW<57, inTent=!!(CC.Camp&&CC.Camp.isInside&&CC.Camp.isInside());
      if(s.area==='defense')button(c,addHit,bx,by,retreatW,sz,small?'EXIT':'Retreat',
        true,function(){if(CC.returnToTown)CC.returnToTown();},'#5a2a22');
      else if(!inTent)button(c,addHit,bx,by,retreatW,sz,small?'TP':'TP-Town',
        true,function(){if(CC.Portal)CC.Portal.place();},'#4b2a78'); // opens a purple portal to the town centre right here
    }
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
      bb.name=B.name||'Boss';bb.phase=B.phase||1;bb.kind=B.kind||'';
      bb.intro=B.intro||0;bb.color=B.color||bb.color;
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
    update: update, key: key, draw: draw, drawHud: drawHud, openCharacter: openCharacter, ownsBossBar: true,
    _state: function () { return { cur: cur, target: target, t: t, sel: sel }; } };
})();
