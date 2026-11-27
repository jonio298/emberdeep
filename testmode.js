/* CC.TestMode - a secret developer panel: pick any hero, level, weapon, spell, charge attack, map and monsters in one place.
 * Reveal: open the character screen, Stats tab, and tap the "Area bonus" row three times; a TEST MODE button appears.
 * While test mode is on the game never saves (a test hero cannot overwrite your real character).
 *   CC.TestMode.open() / close() / unlock() / isUnlocked() / arena()   (arena() builds the empty test room map)
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, TM = CC.TestMode = {}, T = CC.TILE || 32;
  var KEY = 'emberdeep-testmode', panel = null, cheats = { god: false, mana: false, cd: false }, plist = [];
  var CLASSES = ['swordsman', 'wizard', 'necromancer', 'thief'], CNAME = { swordsman: 'Swordsman', wizard: 'Wizard', necromancer: 'Necromancer', thief: 'Thief' };
  function st() { return CC.state; }
  function hero() { return st() && st().player; }
  function say(s, col) { var p = hero(); if (CC.fx && CC.fx.text && p) CC.fx.text(p.x, p.y - 26, s, col || '#e6c8ff', 11); var n = panel && panel.querySelector('#tm-msg'); if (n) n.textContent = s; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  TM.isUnlocked = function () { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  TM.unlock = function () { try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode: stays unlocked for this session only */ } TM._on = true; };
  var oldUnlocked = TM.isUnlocked; TM.isUnlocked = function () { return !!TM._on || oldUnlocked(); };

  /* ---------- the empty test room ---------- */
  TM.arena = function () {
    var W = 44, H = 30, tiles = new Uint8Array(W * H), kind = new Uint8Array(W * H), x, y;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var edge = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
      tiles[y * W + x] = edge ? 1 : 0; kind[y * W + x] = edge ? 9 : 0;
    }
    [[14, 9], [14, 20], [30, 9], [30, 20]].forEach(function (q) { tiles[q[1] * W + q[0]] = 1; kind[q[1] * W + q[0]] = 9; }); // a few pillars to test line of sight
    function ground(k, hv, tx, ty) { var v = (tx + ty) % 2 ? 0 : 1; return ['#2e3a30', '#33403a'][v]; }
    function detail(c, k, sx, sy, hv, tt, tx, ty) { if ((tx * 7 + ty * 13) % 9 === 0) { c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(sx + 6, sy + 6, 20, 20); } }
    function solid(c, k, sx, sy, hv, tt, tx, ty) {
      c.fillStyle = '#3d3a48'; c.fillRect(sx, sy, T, T); c.fillStyle = '#4b4859'; c.fillRect(sx, sy, T, 5);
      c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.strokeRect(sx + .5, sy + .5, T - 1, T - 1); c.beginPath(); c.moveTo(sx, sy + 16); c.lineTo(sx + T, sy + 16); c.moveTo(sx + 10, sy + 16); c.lineTo(sx + 10, sy + T); c.stroke();
    }
    var map = CC.Realm.create({ name: 'Test Room', w: W, h: H, tiles: tiles, kind: kind, spawn: { x: 22 * T, y: 15 * T }, stairs: { x: -999, y: -999, tx: -1, ty: -1 }, chests: [], enemySpawns: [],
      props: [], lights: [], ground: ground, detail: detail, drawSolid: solid, ambient: '8,10,12,0.12', playerLight: 280, viewR: 520, fog: 0, viewBoost: 1.2, reveal: false });
    map.seed = 424242; map.npcs = [];
    return map;
  };

  /* ---------- actions ---------- */
  function setHero(cls, level) {
    var s = st(), old = hero(), C = CC.Classes; if (!s || !C) return;
    s.testMode = true;
    var p = C.create(cls);
    if (old) { p.x = old.x; p.y = old.y; p.face = old.face; }
    p.level = Math.max(1, Math.min(50, level | 0 || 1)); p.xp = 0; p.xpNext = C.xpToNext(p.level);
    C.applyItemStats(p); p.hp = p.maxHp; p.mana = p.maxMana;
    s.player = p; s.classId = cls;
    applySpellNames(p);
    say('Hero: ' + CNAME[cls] + ' level ' + p.level);
  }
  function setLevel(level) {
    var p = hero(), C = CC.Classes; if (!p) return; st().testMode = true;
    p.level = Math.max(1, Math.min(50, level | 0 || 1)); p.xp = 0; p.xpNext = C.xpToNext(p.level);
    C.applyItemStats(p); p.hp = p.maxHp; p.mana = p.maxMana; applySpellNames(p);
    if (p.level >= 10 && !p.chargeSel && !p.testChargeCls) p.chargeSel = Math.min(3, Math.floor(p.level / 10));
    say('Level ' + p.level);
  }
  // Spell I / II may belong to any class; the HUD names, costs and cooldowns follow
  function applySpellNames(p) {
    var D = CC.Classes.DEFS, c1 = p.testSpell1 || p.classId, c2 = p.testSpell2 || p.classId;
    p.spells = [D[c1].spells[0], D[c2].spells[1]];
    p.cost.spell1 = D[c1].cost.spell1; p.cost.spell2 = D[c2].cost.spell2;
    p.spellNames = [p.spells[0], p.level >= 4 ? p.spells[1] : 'Lv 4'];
    var cdr = Math.min(0.5, (p.stats && p.stats.cdr) || 0);
    p.cdMax.spell1 = D[c1].cdMax.spell1 * (1 - cdr); p.cdMax.spell2 = D[c2].cdMax.spell2 * (1 - cdr);
  }
  function setSpell(slot, cls) {
    var p = hero(); if (!p) return; st().testMode = true;
    if (slot === 1) p.testSpell1 = cls === p.classId ? null : cls; else p.testSpell2 = cls === p.classId ? null : cls;
    applySpellNames(p);
    if (slot === 2 && p.level < 4) setLevel(4);
    say('Spell ' + (slot === 1 ? 'I' : 'II') + ': ' + CC.Classes.DEFS[cls].spells[slot - 1]);
  }
  function setCharge(val) { // 'cls:index'
    var p = hero(); if (!p) return; st().testMode = true;
    var a = val.split(':'), cls = a[0], i = +a[1] | 0, sk = CC.SkillTree && CC.SkillTree.chargeSkills(cls);
    if (cls === p.classId && i === 0) { p.testChargeCls = null; p.chargeSel = 0; say('Charge attack: original'); return; }
    p.testChargeCls = cls === p.classId ? null : cls; p.chargeSel = i;
    say('Charge attack: ' + (sk && sk[i] ? sk[i].name : val) + ' (hold ATK)');
  }
  function equipWeapon(kindSel, rar) {
    var p = hero(), L = CC.Loot; if (!p || !L) return; st().testMode = true;
    var want = kindSel.split('|'), it = null, tries = 0, floor = Math.max(1, st().floor || 1);
    while (tries++ < 4000) {
      var cand = L.makeItem(floor, rar, 'weapon', null, p.level);
      if (want[0] === 'type' ? cand.weaponType === want[1] : cand.name === want[1]) { it = cand; break; }
    }
    if (!it) { // the generator has no such name: dress a roll up as the type asked for
      if (want[0] !== 'type') { say('Could not roll that weapon at that rarity - try Legendary', '#ff9a9a'); return; }
      it = L.makeItem(floor, rar, 'weapon', null, p.level); it.weaponType = want[1]; it.name = 'Test ' + want[1].charAt(0).toUpperCase() + want[1].slice(1);
    }
    p.equipment.weapon = it; CC.Classes.applyItemStats(p); applySpellNames(p);
    say('Equipped ' + it.name + ' (' + (it.weaponType || 'weapon') + ')', it.color);
  }
  function goMap(v, floor) {
    var s = st(); if (!s || !hero()) return; s.testMode = true;
    if (CC.clearWorldCache) CC.clearWorldCache();
    if (CC.Camp && CC.Camp.isInside && CC.Camp.isInside()) CC.Camp.clear();
    var f = Math.max(1, floor | 0 || 1);
    if (v === 'town') { s.fromForest = false; CC.setMode('town'); }
    else if (v === 'cave') CC.startRun(f, 'cave');
    else if (v === 'cinderwake') CC.startRun(f, 'cinderwake');
    else if (v === 'tree-ascent') { s.treeFloor = Math.max(1, Math.min(5, f)); CC.startRun(1, 'tree-ascent'); }
    else CC.startRun(1, v);
    say('Map: ' + v + (v === 'cave' || v === 'tree-ascent' ? ' ' + f : ''));
  }
  function monsterList() {
    var E = CC.Enemies, out = [], k;
    for (k in E.TYPES) out.push([k, E.TYPES[k].name || k]);
    (E.BOSSES || []).forEach(function (b, i) { out.push(['boss' + i, 'BOSS: ' + b.name]); });
    out.push(['patchwork', 'The Patchwork Horror']);
    return out;
  }
  function spawnOne(key, x, y, floor, elite, awake) {
    var E = CC.Enemies, e;
    if (key.indexOf('boss') === 0) e = E.spawn('boss', x, y, floor, { bossIdx: +key.slice(4), awake: awake });
    else if (key === 'patchwork') {
      e = E.spawn('ghoul', x, y, floor, { awake: true });
      e.stitched = true; e.name = 'The Patchwork Horror'; e.maxHp = e.hp = Math.round(e.hp * 9); e.dmg = Math.round(e.dmg * 3); e.spd *= 1.55; e.xp *= 5; e.r = 15;
      e.stitchTimer = 3; e.specialCd = 1.8; e.attackCycle = 0; e.stitchColors = ['#91333a', '#7d985a', '#955483']; e.miniBoss = true; e.boss = false; e.stitchBlood = 0;
    } else e = E.spawn(key, x, y, floor, { elite: elite, awake: awake });
    if (e && awake) e.asleep = false;
    return e;
  }
  function spawnMonsters(key, n, elite, awake, ring) {
    var p = hero(), s = st(), D = CC.Dungeon; if (!p) return 0; s.testMode = true;
    var floor = Math.max(1, s.floor || 1), made = 0, i, tries;
    for (i = 0; i < n; i++) {
      for (tries = 0; tries < 20; tries++) {
        var a = ring && tries < 8 ? i * 6.2832 / Math.max(1, n) + rnd(-.2, .2) : rnd(0, 6.2832), d = (ring && tries < 8 ? 150 : 90) + rnd(0, 60), x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (!(D && D.isSolid && (D.isSolid(x, y) || D.isSolid(x + 12, y) || D.isSolid(x - 12, y) || D.isSolid(x, y + 12) || D.isSolid(x, y - 12)))) { if (spawnOne(key, x, y, floor, elite, awake)) made++; break; }
      }
    }
    return made;
  }
  function clearMonsters() { var E = CC.Enemies; E.list.length = 0; E.projectiles.length = 0; E.zones = []; E.boss = null; E.bossBar = null; E.remains.length = 0; E.gore.length = 0; say('Monsters cleared'); }
  function createRoom() { // an empty arena with everything on the list in a ring around you
    var s = st(); if (!hero()) return; s.testMode = true;
    goMap('testroom');
    var list = plist.length ? plist : [{ key: 'skeleton', n: 3, elite: false, awake: true }];
    list.forEach(function (m) { spawnMonsters(m.key, m.n, m.elite, m.awake, true); });
    say('Test room ready: ' + list.reduce(function (t, m) { return t + m.n; }, 0) + ' monsters');
  }

  /* cheats are applied on a timer so they survive menus and level changes */
  setInterval(function () {
    var p = hero(); if (!p || !st().testMode) return;
    if (cheats.god) { p.hp = p.maxHp; p.invuln = Math.max(p.invuln || 0, 0.5); }
    if (cheats.mana) p.mana = p.maxMana;
    if (cheats.cd && p.cd) { p.cd.spell1 = 0; p.cd.spell2 = 0; p.cd.dash = 0; }
  }, 200);

  /* ---------- the panel ---------- */
  function css() {
    if (document.getElementById('tm-css')) return;
    var s = document.createElement('style'); s.id = 'tm-css';
    s.textContent = '#tm-panel{position:fixed;inset:0;z-index:100000;background:rgba(10,6,18,.97);color:#e8dcc4;font:13px Georgia,serif;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 12px 60px}' +
      '#tm-panel .tm-in{max-width:560px;margin:0 auto}#tm-panel h2{margin:4px 0 2px;color:#e0a84a;font-size:20px;letter-spacing:1px}' +
      '#tm-panel h3{margin:16px 0 6px;padding-bottom:3px;border-bottom:1px solid #5a4630;color:#ffd36b;font-size:14px;letter-spacing:1px}' +
      '#tm-panel .row{display:flex;gap:6px;margin:5px 0;align-items:center;flex-wrap:wrap}#tm-panel label{min-width:70px;color:#b9aacb}' +
      '#tm-panel select,#tm-panel input[type=number]{flex:1;min-width:110px;background:#1d1626;color:#f2e8d4;border:1px solid #6a5238;border-radius:6px;padding:8px;font:inherit}' +
      '#tm-panel button{background:linear-gradient(#4a3a62,#241a34);color:#f2e8d4;border:1px solid #7a5a38;border-radius:6px;padding:8px 12px;font:bold 13px Georgia,serif;cursor:pointer}' +
      '#tm-panel button.go{background:linear-gradient(#3f7a3a,#1c3a1a)}#tm-panel button.x{background:linear-gradient(#7a3a3a,#3a1818)}' +
      '#tm-panel .chk{display:flex;gap:5px;align-items:center;margin-right:10px}#tm-panel .chips{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}' +
      '#tm-panel .chip{background:#2a2036;border:1px solid #6a5238;border-radius:12px;padding:3px 9px}#tm-panel #tm-msg{position:sticky;top:0;background:#2a1a38;padding:6px 8px;border-radius:6px;margin:6px 0;min-height:18px;color:#cfa8ff}';
    document.head.appendChild(s);
  }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag), k;
    for (k in attrs || {}) { if (k === 'text') n.textContent = attrs[k]; else if (k === 'cls') n.className = attrs[k]; else n[k] = attrs[k]; }
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function select(id, opts, val) { var s = el('select', { id: id }); opts.forEach(function (o) { var op = el('option', { value: o[0], text: o[1] }); s.appendChild(op); }); if (val !== undefined) s.value = val; return s; }
  function row(label, nodes) { return el('div', { cls: 'row' }, [el('label', { text: label })].concat(nodes)); }
  function btn(text, fn, cls) { return el('button', { text: text, cls: cls || '', onclick: fn }); }
  function val(id) { return panel.querySelector('#' + id).value; }

  function build() {
    css();
    var p = hero(), E = CC.Enemies, L = CC.Loot, D = CC.Classes.DEFS, root = el('div', { id: 'tm-panel' }), inn = el('div', { cls: 'tm-in' });
    root.appendChild(inn);
    ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'wheel'].forEach(function (ev) { root.addEventListener(ev, function (e) { e.stopPropagation(); }); }); // the game never sees taps meant for the panel
    inn.appendChild(el('div', { cls: 'row' }, [el('h2', { text: 'TEST MODE' }), btn('CLOSE', function () { TM.close(); }, 'x')]));
    inn.appendChild(el('div', { id: 'tm-msg', text: 'Nothing is saved while test mode is on. Changes apply immediately.' }));

    // --- hero
    inn.appendChild(el('h3', { text: 'HERO' }));
    inn.appendChild(row('Class', [select('tm-class', CLASSES.map(function (c) { return [c, CNAME[c]]; }), p && p.classId), btn('New hero', function () { setHero(val('tm-class'), +val('tm-level')); }, 'go')]));
    inn.appendChild(row('Level', [el('input', { id: 'tm-level', type: 'number', min: 1, max: 50, value: p ? p.level : 1 }), btn('Set', function () { setLevel(+val('tm-level')); }, 'go')]));
    inn.appendChild(el('div', { cls: 'row' }, [1, 4, 10, 20, 30, 50].map(function (n) { return btn('L' + n, function () { panel.querySelector('#tm-level').value = n; setLevel(n); }); })));

    // --- weapon
    inn.appendChild(el('h3', { text: 'WEAPON' }));
    var types = ['sword', 'axe', 'dagger', 'staff', 'wand', 'bow', 'mace', 'spear'].map(function (t) { return ['type|' + t, 'Any ' + t]; });
    var legends = (L.LEGENDS || []).filter(function (g) { return g.slot === 'weapon'; }).map(function (g) { return ['name|' + g.name, 'Legendary: ' + g.name + (g.cls ? ' (' + g.cls + ')' : '')]; });
    var wsel = select('tm-weapon', types.concat(legends));
    inn.appendChild(row('Weapon', [wsel]));
    inn.appendChild(row('Rarity', [select('tm-rarity', (L.RARITIES || []).map(function (r, i) { return [i, r.name]; }), (L.RARITIES || []).length - 1), btn('Equip', function () { equipWeapon(val('tm-weapon'), +val('tm-rarity')); }, 'go')]));

    // --- spells
    inn.appendChild(el('h3', { text: 'SPELLS (any class)' }));
    function spellOpts(i) { var o = []; CLASSES.forEach(function (c) { o.push([c, CNAME[c] + ': ' + D[c].spells[i]]); }); return o; }
    inn.appendChild(row('Spell I', [select('tm-s1', spellOpts(0), p && (p.testSpell1 || p.classId)), btn('Set', function () { setSpell(1, val('tm-s1')); }, 'go')]));
    inn.appendChild(row('Spell II', [select('tm-s2', spellOpts(1), p && (p.testSpell2 || p.classId)), btn('Set', function () { setSpell(2, val('tm-s2')); }, 'go')]));
    var ch = []; CLASSES.forEach(function (c) { (CC.SkillTree.chargeSkills(c) || []).forEach(function (sk, i) { ch.push([c + ':' + i, CNAME[c] + ': ' + sk.name + (i ? ' (lvl ' + sk.lvl + ')' : '')]); }); });
    inn.appendChild(row('Charge', [select('tm-ch', ch), btn('Set', function () { setCharge(val('tm-ch')); }, 'go')]));
    inn.appendChild(el('div', { text: 'Hold ATK to charge. Hold I or II to aim the held version of a spell.', style: 'color:#9a8aa8;font-size:11px' }));

    // --- map
    inn.appendChild(el('h3', { text: 'MAP' }));
    inn.appendChild(row('Map', [select('tm-map', [['testroom', 'Test Room (empty arena)'], ['forest', 'Giant Forest'], ['tree-tunnel', 'Hollow Tree'], ['plains', 'Rolling Plains'], ['tree-ascent', 'Eagle Tree (floor 1-5)'], ['cave', 'Caves (floor)'], ['defense', 'Town Defense'], ['town', 'Town']])]));
    inn.appendChild(row('Floor', [el('input', { id: 'tm-floor', type: 'number', min: 1, max: 60, value: 1 }), btn('Go', function () { goMap(val('tm-map'), +val('tm-floor')); }, 'go')]));
    inn.appendChild(el('div', { cls: 'row' }, [btn('OPEN WORLD MAP (click a place to teleport)', function () { TM.openWorld(); }, 'go')]));
    inn.appendChild(el('div', { style: 'color:#9a8aa8;font-size:11px', text: 'Tip: open the map (M) and click any point on it to teleport there.' }));

    // --- monsters
    inn.appendChild(el('h3', { text: 'MONSTERS' }));
    inn.appendChild(row('Monster', [select('tm-mon', monsterList())]));
    inn.appendChild(el('div', { cls: 'row' }, [el('label', { text: 'Count' }), el('input', { id: 'tm-n', type: 'number', min: 1, max: 40, value: 3 }),
      el('span', { cls: 'chk' }, [el('input', { id: 'tm-elite', type: 'checkbox' }), el('span', { text: 'Elite' })]), el('span', { cls: 'chk' }, [el('input', { id: 'tm-awake', type: 'checkbox', checked: true }), el('span', { text: 'Awake' })])]));
    inn.appendChild(el('div', { cls: 'row' }, [btn('Spawn near me', function () {
      var n = spawnMonsters(val('tm-mon'), +val('tm-n') || 1, panel.querySelector('#tm-elite').checked, panel.querySelector('#tm-awake').checked, false); say('Spawned ' + n);
    }, 'go'), btn('Add to room list', function () { plist.push({ key: val('tm-mon'), n: +val('tm-n') || 1, elite: panel.querySelector('#tm-elite').checked, awake: panel.querySelector('#tm-awake').checked }); refreshList(); }),
      btn('Clear all monsters', clearMonsters, 'x')]));
    inn.appendChild(el('div', { id: 'tm-list', cls: 'chips' }));
    inn.appendChild(el('div', { cls: 'row' }, [btn('CREATE TEST ROOM with this list', createRoom, 'go'), btn('Clear list', function () { plist.length = 0; refreshList(); })]));

    // --- cheats
    inn.appendChild(el('div', { cls: 'row' }, [el('span', { cls: 'chk' }, [el('input', { id: 'tm-eagle', type: 'checkbox', checked: TM.eagleOn(), onchange: function () { TM.setEagle(this.checked); } }), el('span', { text: 'Eagle companion (hatched, follows you)' })])]));
    inn.appendChild(el('h3', { text: 'TIME OF DAY' }));
    inn.appendChild(el('div', { cls: 'row' }, [
      btn('Night', function () { if (CC.DayNight) { CC.DayNight.setNight(true); say('It is night'); } }, 'go'),
      btn('Day', function () { if (CC.DayNight) { CC.DayNight.setNight(false); say('It is day'); } }),
      el('span', { cls: 'chk' }, [el('input', { id: 'tm-freeze', type: 'checkbox', checked: !!(CC.DayNight && CC.DayNight.frozen), onchange: function () { if (CC.DayNight) CC.DayNight.frozen = this.checked; } }), el('span', { text: 'Freeze time' })])]));
    inn.appendChild(el('div', { cls: 'row' }, [
      select('tm-ns', (CC.NightStalkers ? CC.NightStalkers.ids : []).map(function (id) { return [id, CC.NightStalkers.DEFS[id].name]; })),
      btn('Spawn night stalker', function () { var NS = CC.NightStalkers, id = val('tm-ns'), e = NS && NS.spawn(id, true); if (e) { e.testSpawn = true; say('Spawned ' + NS.DEFS[id].name); } else say('Could not spawn it here'); }, 'go')]));
    inn.appendChild(el('h3', { text: 'REPLAY (stronger monsters)' }));
    inn.appendChild(el('div', { cls: 'row' }, [
      select('tm-cycle', [['0', 'First time through'], ['1', 'Replay 1'], ['2', 'Replay 2'], ['3', 'Replay 3']]),
      btn('Set (new monsters)', function () { if (CC.Balance) { CC.Balance.setCycle(+val('tm-cycle') || 0); say('Replay ' + CC.Balance.cycle() + ': monsters spawned from now on'); } }, 'go')]));
    inn.appendChild(el('h3', { text: 'LEGENDARY WEAPONS' }));
    inn.appendChild(el('div', { cls: 'row' }, [
      select('tm-leg', (CC.Loot && CC.Loot.LEGEND_WEAPONS ? CC.Loot.LEGEND_WEAPONS : []).map(function (l) { return [l.name, l.name + ' (' + (l.cls || 'any') + ', lv ' + l.qlvl + ')']; })),
      btn('Give + wear', function () {
        var l = (CC.Loot.LEGEND_WEAPONS || []).filter(function (q) { return q.name === val('tm-leg'); })[0], p = CC.state.player; if (!l || !p) return;
        var it = CC.Loot.makeItem(Math.max(l.qlvl, 10), 4, 'weapon', l.cls || p.classId, p.level, l); it.reqLevel = 1; // test mode ignores the level requirement
        p.equipment = p.equipment || {}; p.equipment.weapon = it; if (CC.Classes && CC.Classes.applyItemStats) CC.Classes.applyItemStats(p);
        if (CC.DropTables) CC.DropTables.found(it); say('Wielding ' + it.name);
      }, 'go')]));
    inn.appendChild(el('h3', { text: 'CHEATS' }));
    inn.appendChild(el('div', { cls: 'row' }, [
      el('span', { cls: 'chk' }, [el('input', { id: 'tm-god', type: 'checkbox', checked: cheats.god, onchange: function () { cheats.god = this.checked; } }), el('span', { text: 'God mode' })]),
      el('span', { cls: 'chk' }, [el('input', { id: 'tm-mana', type: 'checkbox', checked: cheats.mana, onchange: function () { cheats.mana = this.checked; } }), el('span', { text: 'Infinite mana' })]),
      el('span', { cls: 'chk' }, [el('input', { id: 'tm-cd', type: 'checkbox', checked: cheats.cd, onchange: function () { cheats.cd = this.checked; } }), el('span', { text: 'No cooldowns' })])]));
    inn.appendChild(el('div', { cls: 'row' }, [
      btn('Heal', function () { var h = hero(); if (h) { h.hp = h.maxHp; h.mana = h.maxMana; say('Healed'); } }),
      btn('+10000 gold', function () { st().gold = (st().gold || 0) + 10000; say('Gold: ' + st().gold); }),
      btn('+9 potions', function () { st().potions = (st().potions || 0) + 9; st().manaPotions = (st().manaPotions || 0) + 9; say('Potions added'); }),
      btn('Kill all', function () { CC.Enemies.list.slice().forEach(function (e) { if (!e.dead) CC.Enemies.damage(e, 1e7, 'physical'); }); say('Killed everything'); })]));
    return root;
  }
  function refreshList() {
    var box = panel && panel.querySelector('#tm-list'); if (!box) return;
    box.textContent = '';
    if (!plist.length) { box.appendChild(el('span', { text: 'Room list is empty (a default of 3 skeletons is used).', style: 'color:#9a8aa8' })); return; }
    plist.forEach(function (m, i) {
      var name = (CC.Enemies.TYPES[m.key] && CC.Enemies.TYPES[m.key].name) || m.key;
      box.appendChild(el('span', { cls: 'chip', text: m.n + ' x ' + (m.elite ? 'Elite ' : '') + name + '  ✕', onclick: function () { plist.splice(i, 1); refreshList(); }, style: 'cursor:pointer' }));
    });
  }

  /* ---------- teleporting (test mode): click the map, or pick a place on the world map ---------- */
  TM.teleport = function (x, y) {
    var p = hero(), D = CC.Dungeon; if (!p) return false;
    var best = null, k, ring, a;
    function free(px, py) { return D && D.isSolid ? !(D.isSolid(px, py) || D.isSolid(px + 9, py) || D.isSolid(px - 9, py) || D.isSolid(px, py + 9) || D.isSolid(px, py - 9)) : true; }
    if (free(x, y)) best = { x: x, y: y };
    for (ring = 1; ring <= 10 && !best; ring++) for (k = 0; k < 16 && !best; k++) { a = k / 16 * Math.PI * 2; var px = x + Math.cos(a) * ring * 12, py = y + Math.sin(a) * ring * 12; if (free(px, py)) best = { x: px, y: py }; }
    if (!best) { say('Nothing walkable there', '#ff9a9a'); return false; }
    p.x = best.x; p.y = best.y; if (st()) st().testMode = true;
    if (CC.Enemies) { CC.Enemies.projectiles.length = 0; }
    if (CC.snapCamera) CC.snapCamera();
    say('Teleported');
    return true;
  };
  TM.teleportFromMap = function (px, py, w, h) { // px, py relative to the full-map panel (same layout as dungeon.js / realm.js drawFullMap)
    var D = CC.Dungeon; if (!D || !(D.w || D.W)) return false;
    var W = D.w || D.W, H = D.h || D.H, Ly = CC.mapLayout(W, H, w, h, !!D.realm), cell = Ly.cell, ox = Ly.ox, oy = Ly.oy, tx = (px - ox) / cell, ty = (py - oy) / cell;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
    return TM.teleport(tx * T, ty * T);
  };

  /* ---------- the world map: a stylised continent with every area on it ---------- */
  var WW = 1000, WH = 700, wmap = null, WS = 1.6;
  var PLACES = [ // x, y on the 1000x700 map; go = how to get there
    { id: 'town', name: 'Forest Town', x: 560, y: 150, kind: 'town', go: function () { goMap('town'); } },
    { id: 'forest', name: 'The Giant Forest', x: 548, y: 300, kind: 'forest', go: function () { goMap('forest'); } },
    { id: 'tunnel', name: 'The Hollow Tree', x: 640, y: 335, kind: 'tree', go: function () { goMap('tree-tunnel'); } },
    { id: 'nest', name: 'The Ancient Tree (crown)', x: 462, y: 262, kind: 'tree', go: function () { goMap('tree-ascent', 5); } },
    { id: 'plains', name: 'The Rolling Plains', x: 520, y: 465, kind: 'plains', go: function () { goMap('plains'); } },
    { id: 'pond', name: 'The Haunted Pond', x: 585, y: 520, kind: 'pond', go: function () { goMap('plains'); var m = st().map, pd = m && m.pond; if (pd) TM.teleport(pd.startX + pd.dirx * 50, pd.y); } },
    { id: 'slide', name: 'The Rockslide', x: 440, y: 450, kind: 'rock', go: function () { goMap('plains'); var m = st().map; if (m && m.slide) TM.teleport(m.slide.x + 230, m.slide.y); } },
    { id: 'barrow', name: 'The Barrow (caves)', x: 480, y: 565, kind: 'cave', go: function () { goMap('cave', 1); } },
    { id: 'pass', name: 'The Rocky Pass', x: 335, y: 440, kind: 'mountain', go: function () { goMap('rocky-pass'); } },
    { id: 'village', name: 'The Abandoned Village', x: 150, y: 415, kind: 'village', go: function () { goMap('village'); } },
    { id: 'graveyard', name: 'The Graveyard', x: 185, y: 365, kind: 'grave', go: function () { goMap('village'); var m = st().map, g = m && m.vil && m.vil.ghosts[2]; if (g) TM.teleport(g.x, g.y + 30); } },
    { id: 'cellar', name: 'The Cellar', x: 120, y: 460, kind: 'cellar', go: function () { goMap('village-cellar'); } },
    { id: 'cinderwake', name: 'The Cinderwake (Ashfall Stair)', x: 95, y: 500, kind: 'cellar', go: function () { goMap('cinderwake', 1); } },
    { id: 'cinderwake2', name: 'The Cinderwake (Slag Warrens)', x: 130, y: 530, kind: 'cellar', go: function () { goMap('cinderwake', 2); } },
    { id: 'cinderwake3', name: 'The Cinderwake (The Hearth)', x: 165, y: 505, kind: 'cellar', go: function () { goMap('cinderwake', 3); } }
  ];
  var KNOWN = [[560, 150, 95], [540, 300, 150], [520, 480, 125], [335, 445, 115], [150, 415, 95]]; // the charted lands
  function vh(x, y) { var n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) { var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); var a = vh(xi, yi), b = vh(xi + 1, yi), c = vh(xi, yi + 1), d = vh(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
  function fbm(x, y) { return vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.25 + vnoise(x * 4.3, y * 4.3) * 0.15 + vnoise(x * 8.7, y * 8.7) * 0.1; }
  function blob(x, y, cx, cy, r) { var d = Math.hypot(x - cx, y - cy) / r; return d >= 1 ? 0 : (1 - d * d) * (1 - d * d); }
  var MOUNT = [[335, 440, 75], [250, 330, 80], [395, 520, 55], [170, 120, 100], [860, 140, 110], [720, 70, 60], [290, 560, 60], [250, 440, 55], [420, 405, 45], [930, 420, 60]];
  var FOREST = [[545, 295, 120], [470, 330, 70], [620, 245, 70], [120, 230, 90], [790, 215, 95], [840, 470, 80], [380, 180, 60]];
  var PLAIN = [[520, 480, 105], [640, 520, 70], [450, 540, 50], [610, 440, 45]];
  var DESERT = [[830, 590, 135], [700, 650, 95], [900, 520, 70]];
  var LAKE = [[650, 130, 42], [760, 385, 52], [215, 575, 40], [335, 210, 38], [895, 330, 30], [420, 110, 30]];
  function sample(x, y) { // -> [r,g,b], class
    var n = fbm(x * 0.011, y * 0.011), edge = ((x - 500) / 478) * ((x - 500) / 478) + ((y - 350) / 332) * ((y - 350) / 332), coast = edge + (0.5 - fbm(x * 0.007 + 9, y * 0.007 + 4)) * 0.9;
    if (coast > 1) { var dd = Math.min(1, (coast - 1) * 6); return [[30 + (1 - dd) * 22, 58 + (1 - dd) * 34, 88 + (1 - dd) * 34], 0]; }
    if (coast > 0.93) return [[198, 186, 142], 1]; // beach
    var m = 0, f = 0, pl = 0, d = 0, l = 0, i;
    for (i = 0; i < MOUNT.length; i++) m += blob(x, y, MOUNT[i][0], MOUNT[i][1], MOUNT[i][2]);
    for (i = 0; i < FOREST.length; i++) f += blob(x, y, FOREST[i][0], FOREST[i][1], FOREST[i][2]);
    for (i = 0; i < PLAIN.length; i++) pl += blob(x, y, PLAIN[i][0], PLAIN[i][1], PLAIN[i][2]);
    for (i = 0; i < DESERT.length; i++) d += blob(x, y, DESERT[i][0], DESERT[i][1], DESERT[i][2]);
    for (i = 0; i < LAKE.length; i++) l += blob(x, y, LAKE[i][0], LAKE[i][1], LAKE[i][2]);
    var rn = fbm(x * 0.02 + 40, y * 0.02);
    if (l + (rn - 0.5) * 0.25 > 0.28) return [[66 + n * 20, 118 + n * 20, 158 + n * 14], 2]; // lake
    var v = blob(x, y, 150, 415, 62); // the dry valley of the village
    m += (rn - 0.45) * 0.5; if (m > 0.5) { var sn = m > 1.05 ? 1 : 0; return [sn ? [226, 230, 236] : [112 + n * 30 + m * 14, 106 + n * 30 + m * 12, 98 + n * 28], 3]; } // mountains
    if (d + (rn - 0.5) * 0.3 > 0.3) return [[208 + rn * 22, 178 + rn * 18, 116 + rn * 12], 4]; // desert
    if (v > 0.3) return [[126 + rn * 14, 122 + rn * 12, 86], 5];
    if (f + (rn - 0.5) * 0.4 > 0.32) return [[52 + n * 24, 94 + n * 30, 58 + n * 16], 6]; // forest
    if (pl + (rn - 0.5) * 0.3 > 0.25) return [[148 + rn * 20, 168 + rn * 14, 92], 7]; // plains
    return [[112 + n * 26, 146 + n * 24, 84 + n * 16], 8]; // grassland
  }
  function buildWorld() {
    var cv = document.createElement('canvas'); cv.width = WW * WS; cv.height = WH * WS; var c = cv.getContext('2d'), CS = 3, gw = Math.ceil(WW / CS), gh = Math.ceil(WH / CS), cls = new Uint8Array(gw * gh), small = document.createElement('canvas'); small.width = gw; small.height = gh;
    var sc = small.getContext('2d'), img = sc.createImageData(gw, gh), x, y, i, hgt = new Float32Array(gw * gh);
    for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) { hgt[y * gw + x] = fbm(x * CS * 0.011, y * CS * 0.011); }
    for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) {
      var wx = x * CS, wy = y * CS, s = sample(wx, wy), col = s[0], k = s[1];
      var lit = ((hgt[y * gw + Math.max(0, x - 1)] - hgt[y * gw + Math.min(gw - 1, x + 1)]) + (hgt[Math.max(0, y - 1) * gw + x] - hgt[Math.min(gh - 1, y + 1) * gw + x])) * (k === 3 ? 6 : 2.4); // hill shading from the north-west
      var known = 0; for (i = 0; i < KNOWN.length; i++) known = Math.max(known, Math.hypot(wx - KNOWN[i][0], wy - KNOWN[i][1]) < KNOWN[i][2] ? 1 : 0);
      var r = col[0] * (1 + lit), g = col[1] * (1 + lit), b = col[2] * (1 + lit);
      if (!known && k !== 0) { var gray = (r + g + b) / 3; r = r * 0.3 + gray * 0.3 + 78; g = g * 0.3 + gray * 0.3 + 70; b = b * 0.3 + gray * 0.3 + 56; } // uncharted land: faded, parchment-grey
      var o = (y * gw + x) * 4; img.data[o] = Math.max(0, Math.min(255, r)); img.data[o + 1] = Math.max(0, Math.min(255, g)); img.data[o + 2] = Math.max(0, Math.min(255, b)); img.data[o + 3] = 255; cls[y * gw + x] = k;
    }
    sc.putImageData(img, 0, 0); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(small, 0, 0, WW * WS, WH * WS);
    // glyphs: peaks, trees, dunes, grass tufts, ripples
    c.save(); c.scale(WS, WS);
    for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) {
      var k2 = cls[y * gw + x], h2 = vh(x * 7 + 3, y * 13 + 5), wx2 = x * CS + h2 * CS, wy2 = y * CS + vh(x + 9, y + 1) * CS;
      if (k2 === 3 && h2 < 0.2) { var sz = 6 + h2 * 22, snow = hgt[y * gw + x] > 0.62; c.fillStyle = 'rgba(40,36,34,.35)'; c.beginPath(); c.moveTo(wx2 - sz * 0.5, wy2); c.lineTo(wx2 + sz * 0.9, wy2); c.lineTo(wx2 + sz * 0.1, wy2 - sz * 1.5); c.fill(); c.fillStyle = snow ? '#f4f6f8' : '#8a8478'; c.beginPath(); c.moveTo(wx2 - sz * 0.7, wy2); c.lineTo(wx2 + sz * 0.5, wy2); c.lineTo(wx2 - sz * 0.1, wy2 - sz * 1.5); c.closePath(); c.fill(); c.fillStyle = snow ? '#c8d0dc' : '#625c52'; c.beginPath(); c.moveTo(wx2 - sz * 0.1, wy2 - sz * 1.5); c.lineTo(wx2 + sz * 0.5, wy2); c.lineTo(wx2 + sz * 0.1, wy2); c.closePath(); c.fill(); }
      else if (k2 === 6 && h2 < 0.55) { var ts = 3.2 + h2 * 5; c.fillStyle = 'rgba(14,34,18,.45)'; c.beginPath(); c.ellipse(wx2 + 1, wy2 + 1, ts, ts * 0.5, 0, 0, 6.3); c.fill(); c.fillStyle = h2 < 0.2 ? '#22502c' : '#2e6638'; c.beginPath(); c.moveTo(wx2 - ts, wy2); c.lineTo(wx2, wy2 - ts * 2.2); c.lineTo(wx2 + ts, wy2); c.fill(); }
      else if (k2 === 4 && h2 < 0.14) { c.strokeStyle = 'rgba(150,110,60,.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(wx2 - 8, wy2); c.quadraticCurveTo(wx2, wy2 - 6, wx2 + 8, wy2); c.stroke(); }
      else if ((k2 === 7 || k2 === 8) && h2 < 0.05) { c.strokeStyle = 'rgba(60,90,40,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(wx2, wy2); c.lineTo(wx2 - 1, wy2 - 4); c.moveTo(wx2 + 2, wy2); c.lineTo(wx2 + 3, wy2 - 4); c.stroke(); }
      else if (k2 === 2 && h2 < 0.08) { c.strokeStyle = 'rgba(220,240,255,.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(wx2 - 6, wy2); c.lineTo(wx2 + 6, wy2); c.stroke(); }
      else if (k2 === 5 && h2 < 0.08) { c.strokeStyle = '#4a3a2a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(wx2, wy2); c.lineTo(wx2, wy2 - 7); c.moveTo(wx2, wy2 - 4); c.lineTo(wx2 + 3, wy2 - 7); c.moveTo(wx2, wy2 - 3); c.lineTo(wx2 - 3, wy2 - 6); c.stroke(); } // dead trees in the valley
      else if (k2 === 0 && h2 < 0.015) { c.strokeStyle = 'rgba(170,200,230,.25)'; c.lineWidth = 1; c.beginPath(); c.arc(wx2, wy2, 4, 3.5, 5.9); c.stroke(); }
    }
    // a river from the northern mountains to the lake, and a road joining the charted places
    c.strokeStyle = 'rgba(70,120,166,.95)'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(300, 190); c.bezierCurveTo(360, 200, 330, 240, 380, 260); c.stroke();
    c.strokeStyle = 'rgba(150,120,80,.8)'; c.setLineDash([6, 5]); c.lineWidth = 2; c.beginPath(); c.moveTo(560, 150); c.lineTo(545, 295); c.lineTo(520, 465); c.lineTo(440, 450); c.lineTo(335, 440); c.lineTo(150, 415); c.stroke(); c.setLineDash([]);
    c.restore();
    // old-map finish: a vignette and a thin border
    var vg = c.createRadialGradient(cv.width / 2, cv.height / 2, cv.width * 0.3, cv.width / 2, cv.height / 2, cv.width * 0.72); vg.addColorStop(0, 'rgba(30,20,10,0)'); vg.addColorStop(1, 'rgba(30,20,10,.5)'); c.fillStyle = vg; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = '#3a2a18'; c.lineWidth = 6; c.strokeRect(3, 3, cv.width - 6, cv.height - 6);
    return cv;
  }
  function drawIcon(c, p, s, hot) {
    c.save(); c.translate(p.x, p.y); c.scale(s, s);
    c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 4;
    c.fillStyle = hot ? '#ffe08a' : '#f4ead0'; c.strokeStyle = '#2a1a0c'; c.lineWidth = 1.6;
    if (p.kind === 'town') { c.beginPath(); c.rect(-7, -4, 14, 9); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-9, -4); c.lineTo(0, -12); c.lineTo(9, -4); c.closePath(); c.fillStyle = '#b24a3a'; c.fill(); c.stroke(); }
    else if (p.kind === 'village') { c.beginPath(); c.rect(-7, -3, 14, 8); c.fillStyle = '#9a9488'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(-9, -3); c.lineTo(-1, -9); c.lineTo(3, -3); c.closePath(); c.fillStyle = '#5a5248'; c.fill(); c.stroke(); }
    else if (p.kind === 'grave') { c.beginPath(); c.moveTo(-5, 5); c.lineTo(-5, -4); c.arc(0, -4, 5, Math.PI, 0); c.lineTo(5, 5); c.closePath(); c.fillStyle = '#d8dce4'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(0, -6); c.lineTo(0, 1); c.moveTo(-2.5, -3); c.lineTo(2.5, -3); c.stroke(); }
    else if (p.kind === 'cellar') { c.beginPath(); c.rect(-6, -4, 12, 9); c.fillStyle = '#3a3040'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(0, -4); c.lineTo(0, 5); c.stroke(); }
    else if (p.kind === 'pond') { c.beginPath(); c.ellipse(0, 0, 9, 6, 0, 0, 6.3); c.fillStyle = '#5aa0d0'; c.fill(); c.stroke(); c.beginPath(); c.arc(0, 0, 2.2, 0, 6.3); c.fillStyle = '#f6e8f0'; c.fill(); }
    else if (p.kind === 'tree' || p.kind === 'forest') { c.beginPath(); c.moveTo(-8, 5); c.lineTo(0, -10); c.lineTo(8, 5); c.closePath(); c.fillStyle = '#3a8a4a'; c.fill(); c.stroke(); c.fillStyle = '#5a3a1c'; c.fillRect(-1.5, 5, 3, 4); }
    else if (p.kind === 'mountain' || p.kind === 'rock') { c.beginPath(); c.moveTo(-9, 6); c.lineTo(-2, -8); c.lineTo(3, 0); c.lineTo(6, -4); c.lineTo(10, 6); c.closePath(); c.fillStyle = '#c8c0b0'; c.fill(); c.stroke(); }
    else if (p.kind === 'cave') { c.beginPath(); c.arc(0, 3, 8, Math.PI, 0); c.closePath(); c.fillStyle = '#6a6458'; c.fill(); c.stroke(); c.beginPath(); c.arc(0, 3, 4, Math.PI, 0); c.closePath(); c.fillStyle = '#10080c'; c.fill(); }
    else { c.beginPath(); c.arc(0, 0, 7, 0, 6.3); c.fill(); c.stroke(); }
    c.restore();
  }
  TM.openWorld = function () {
    if (!hero()) return; var old = document.getElementById('tm-world'); if (old) { old.remove(); return; }
    if (!wmap) wmap = buildWorld();
    var box = document.createElement('div'); box.id = 'tm-world'; box.style.cssText = 'position:fixed;inset:0;z-index:100001;background:#0b1118;display:flex;flex-direction:column;font:13px Georgia,serif;color:#f0e4c8';
    var bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 12px;background:#1a1410;border-bottom:2px solid #5a4630;flex-wrap:wrap';
    bar.innerHTML = '<b style="font-size:15px;color:#ffd36b">THE WORLD</b><span style="opacity:.7">drag to pan, wheel / + - to zoom, click a place to teleport there (test mode)</span>';
    function mkb(t, fn) { var b = document.createElement('button'); b.textContent = t; b.style.cssText = 'background:#3a2a18;color:#f0e4c8;border:1px solid #8a6a3a;border-radius:6px;padding:5px 12px;cursor:pointer;font:inherit'; b.onclick = fn; return b; }
    var cv = document.createElement('canvas'); cv.style.cssText = 'flex:1;width:100%;touch-action:none;cursor:grab'; var c = cv.getContext('2d');
    var view = { x: WW / 2, y: WH / 2, z: 1 }, hover = null, drag = null, pinch = null, moved = 0, tip = document.createElement('div');
    var spacer = document.createElement('span'); spacer.style.flex = '1'; bar.appendChild(spacer);
    bar.appendChild(mkb('+', function () { zoomBy(1.3); })); bar.appendChild(mkb('-', function () { zoomBy(1 / 1.3); })); bar.appendChild(mkb('Fit', function () { fit(); })); bar.appendChild(mkb('Close', function () { box.remove(); }));
    box.appendChild(bar); box.appendChild(cv); document.body.appendChild(box);
    function size() { cv.width = cv.clientWidth; cv.height = cv.clientHeight; } size();
    function fit() { view.x = WW / 2; view.y = WH / 2; view.z = Math.min(cv.width / WW, cv.height / WH) * 0.97; draw(); }
    function zoomBy(f, cx, cy) { var nz = Math.max(Math.min(cv.width / WW, cv.height / WH) * 0.6, Math.min(5, view.z * f)); if (cx !== undefined) { var wx = (cx - cv.width / 2) / view.z + view.x, wy = (cy - cv.height / 2) / view.z + view.y; view.z = nz; view.x = wx - (cx - cv.width / 2) / view.z; view.y = wy - (cy - cv.height / 2) / view.z; } else view.z = nz; draw(); }
    function toScreen(x, y) { return { x: (x - view.x) * view.z + cv.width / 2, y: (y - view.y) * view.z + cv.height / 2 }; }
    function pick(mx, my) { var best = null, bd = 22; PLACES.forEach(function (pl) { var s = toScreen(pl.x, pl.y), d = Math.hypot(s.x - mx, s.y - my); if (d < bd) { bd = d; best = pl; } }); return best; }
    function draw() {
      c.fillStyle = '#0b1118'; c.fillRect(0, 0, cv.width, cv.height); c.imageSmoothingEnabled = true;
      c.drawImage(wmap, (0 - view.x) * view.z + cv.width / 2, (0 - view.y) * view.z + cv.height / 2, WW * view.z, WH * view.z);
      var p = hero(), pl, i;
      c.textAlign = 'center'; c.font = 'italic ' + Math.max(11, 13 * Math.min(1.6, view.z)) + 'px Georgia,serif';
      [['Uncharted Peaks', 180, 130], ['Frozen Wilds', 870, 120], ['The Sunscar Desert', 820, 595], ['Greenwild', 120, 235], ['Mistwater', 760, 385], ['The Sunken Reach', 215, 590]].forEach(function (rg) { var s = toScreen(rg[1], rg[2]); c.fillStyle = 'rgba(30,20,10,.55)'; c.fillText(rg[0], s.x + 1, s.y + 1); c.fillStyle = 'rgba(240,226,190,.7)'; c.fillText(rg[0], s.x, s.y); });
      for (i = 0; i < PLACES.length; i++) {
        pl = PLACES[i]; var s2 = toScreen(pl.x, pl.y), hot = hover === pl, sc = Math.min(1.7, 0.8 + view.z * 0.5) * (hot ? 1.25 : 1);
        drawIcon(c, { x: s2.x, y: s2.y, kind: pl.kind }, sc, hot);
        c.font = 'bold ' + Math.max(11, 12 * Math.min(1.5, view.z)) + 'px Georgia,serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(20,12,6,.8)'; c.fillText(pl.name, s2.x + 1, s2.y + 21 * sc + 1); c.fillStyle = hot ? '#ffe08a' : '#fff6dc'; c.fillText(pl.name, s2.x, s2.y + 21 * sc);
      }
      // you are here
      var cur = st() && st().area, here = { town: 'town', forest: 'forest', 'tree-tunnel': 'tunnel', 'tree-ascent': 'nest', plains: 'plains', cave: 'barrow', 'rocky-pass': 'pass', village: 'village', 'village-cellar': 'cellar' }[cur || 'town'];
      PLACES.forEach(function (q) { if (q.id === here) { var s3 = toScreen(q.x, q.y); c.strokeStyle = '#ff5a5a'; c.lineWidth = 2; c.beginPath(); c.arc(s3.x, s3.y, 16 + 3 * Math.sin(Date.now() / 300), 0, 6.3); c.stroke(); c.fillStyle = '#ff9a9a'; c.font = 'bold 10px Georgia,serif'; c.fillText('YOU ARE HERE', s3.x, s3.y - 22); } });
      // compass
      c.save(); c.translate(cv.width - 56, cv.height - 56); c.strokeStyle = '#e8dcc4'; c.fillStyle = '#e8dcc4'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 22, 0, 6.3); c.stroke(); c.beginPath(); c.moveTo(0, -30); c.lineTo(5, 0); c.lineTo(0, 30); c.lineTo(-5, 0); c.closePath(); c.globalAlpha = .6; c.fill(); c.globalAlpha = 1; c.beginPath(); c.moveTo(-30, 0); c.lineTo(30, 0); c.stroke(); c.font = 'bold 12px Georgia,serif'; c.textAlign = 'center'; c.fillText('N', 0, -36); c.restore();
      if (hover) { c.font = '12px Georgia,serif'; var t = 'Click to teleport: ' + hover.name; var w = c.measureText(t).width + 18; c.fillStyle = 'rgba(14,10,6,.9)'; c.fillRect(cv.width / 2 - w / 2, cv.height - 34, w, 24); c.fillStyle = '#ffe08a'; c.textAlign = 'center'; c.fillText(t, cv.width / 2, cv.height - 17); }
    }
    cv.addEventListener('wheel', function (e) { e.preventDefault(); var r = cv.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = 0; cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect();
      if (drag) { var dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved = Math.max(moved, Math.hypot(dx, dy)); view.x = drag.vx - dx / view.z; view.y = drag.vy - dy / view.z; draw(); }
      else { var h2 = pick(e.clientX - r.left, e.clientY - r.top); if (h2 !== hover) { hover = h2; cv.style.cursor = h2 ? 'pointer' : 'grab'; draw(); } }
    });
    cv.addEventListener('pointerup', function (e) {
      cv.style.cursor = hover ? 'pointer' : 'grab';
      if (drag && moved < 6) { var r = cv.getBoundingClientRect(), pl = pick(e.clientX - r.left, e.clientY - r.top); if (pl) { box.remove(); try { pl.go(); } catch (err) { say('Teleport failed: ' + err.message, '#ff9a9a'); } say('Teleported to ' + pl.name); } }
      drag = null;
    });
    var tc = {}; cv.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), z: view.z }; drag = null; } }, { passive: true });
    cv.addEventListener('touchmove', function (e) { if (pinch && e.touches.length === 2) { var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); view.z = Math.max(Math.min(cv.width / WW, cv.height / WH) * 0.6, Math.min(5, pinch.z * d / pinch.d)); draw(); } }, { passive: true });
    cv.addEventListener('touchend', function () { pinch = null; }, { passive: true });
    window.addEventListener('resize', function () { size(); draw(); });
    fit(); var anim = setInterval(function () { if (!document.getElementById('tm-world')) { clearInterval(anim); return; } draw(); }, 400);
    window.addEventListener('keydown', function esc(e) { if (e.code === 'Escape') { var b = document.getElementById('tm-world'); if (b) b.remove(); window.removeEventListener('keydown', esc); } });
  };
  // the eagle companion, on or off, whatever the quest says (test mode)
  TM.setEagle = function (on) {
    var Q = CC.EggQuest; if (!Q) return; var q = Q.serialize(); st().testMode = true;
    if (on) { q.stage = 'complete'; q.hatched = true; q.name = q.name || 'Skye'; } else { q.stage = 'unstarted'; q.hatched = false; q.name = ''; }
    Q.restore(q); if (!on && CC.Eagle && CC.Eagle.reset) CC.Eagle.reset();
    say(on ? 'Eagle companion ON' : 'Eagle companion OFF');
  };
  TM.eagleOn = function () { var q = CC.EggQuest && CC.EggQuest.status && CC.EggQuest.status(); return !!(q && q.hatched); };

  TM.open = function () {
    if (!hero()) return;
    if (st().coop) { if (CC.fx) CC.fx.text(hero().x, hero().y - 20, 'Test mode is single player only', '#ff9a9a', 11); return; }
    if (panel) panel.remove();
    panel = build(); document.body.appendChild(panel); refreshList();
    st().testMode = true;
  };
  TM.close = function () { if (panel) { panel.remove(); panel = null; } };
  TM.status = function () { return { cheats: cheats, list: plist.slice() }; };
})(window);
