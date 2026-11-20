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
