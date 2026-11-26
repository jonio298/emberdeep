/* CC.CinderwakeStory - the story layer of the Cinderwake (design: emberdeep_cinderwake.md).
 *
 *   the way in      the cellar vault's back wall is scorched through to a glass stair once BOTH vault chests are opened (and in no other way)
 *   secrets         F1 brazier (snuff it: a closet chest), F2 candle on the Tally Wall (snuff it: a Candlewraith and a vault chest),
 *                   F3 the lectern's Ash Door (clear the antechamber, turn the ledger: the tithe room chest)
 *   lore pickups    a torn ledger page, a founder's coin, the tithe-bowl; Vane's Ledger Page from the boss
 *   the boss        the Hearthkeeper gets a boss bar and the boss music; his death completes THE UNPAID DEBT, drops the Heartcoal and the
 *                   reward chest, stops the ash, frees a ghost and leaves the furnace door shut with a deeper sealed stair beyond it
 *   the Heartcoal   a unique trinket: fire damage +12%, and a slow heal while you stand still
 * Public: serialize() restore(d) reset() isOpen() isDone() revealed(cellar) nearGlass(cellar) enterFromVault() drawGlass(c,x,y,t)
 *         nearAction() interact() update(dt) verrin() lore() heartcoal() found(id)
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, T = CC.TILE || 32, S = CC.CinderwakeStory = {}, E = CC.Enemies;
  var RANGE = 50, st = fresh(), lastX = null, lastY = null, knockT = 8, announced = false;

  function fresh() { return { open: false, done: false, core: false, lore: {}, secrets: {}, looted: {}, rewardTaken: false }; }
  function hero() { return CC.state && CC.state.player; }
  function cwMap() { var s = CC.state; return s && s.area === 'cinderwake' && s.map && s.map.cinderwake ? s.map : null; }
  function text(x, y, s, c, n) { if (CC.fx && CC.fx.text) CC.fx.text(x, y, s, c || '#ffb04a', n || 12); }
  function near(o) { var p = hero(); return !!(p && o && Math.hypot(p.x - o.x, p.y - o.y) <= RANGE); }
  function say(name, line, ms) { if (CC.Cinderwake && CC.Cinderwake.say) CC.Cinderwake.say(name, line, ms); }
  function save() { if (CC.SaveGame && CC.SaveGame.save) CC.SaveGame.save(); }

  S.reset = function () { st = fresh(); announced = false; };
  S.serialize = function () { return JSON.parse(JSON.stringify(st)); };
  S.restore = function (d) {
    st = fresh();
    if (d && typeof d === 'object') {
      st.open = !!d.open; st.done = !!d.done; st.core = !!d.core; st.rewardTaken = !!d.rewardTaken;
      ['lore', 'secrets', 'looted'].forEach(function (k) { if (d[k] && typeof d[k] === 'object') for (var id in d[k]) if (d[k][id]) st[k][id] = 1; });
    }
    announced = st.open;
    if (CC.Emberdeep && CC.Emberdeep.setCursed) CC.Emberdeep.setCursed(st.core);
  };
  S.markCore = function () { st.core = true; if (CC.Emberdeep && CC.Emberdeep.setCursed) CC.Emberdeep.setCursed(true); save(); };
  S.isCored = function () { return st.core; };
  S.isOpen = function () { return st.open; };
  S.isDone = function () { return st.done; };
  S.state = function () { return st; };

  /* ---------- the way in: a glass stair in the cellar vault ---------- */
  S.revealed = function (cellar) {
    var c = cellar || (CC.AbandonedVillage && CC.AbandonedVillage.cellar), v = c && c.vaultChests;
    if (!st.open && v && v.length > 1 && v[0].opened && v[1].opened) st.open = true; // both vault chests, and only that
    return st.open;
  };
  S.nearGlass = function (cellar) { var c = cellar || (CC.AbandonedVillage && CC.AbandonedVillage.cellar); return !!(c && c.glass && S.revealed(c) && near(c.glass)); };
  S.enterFromVault = function () { return !!(CC.enterCinderwake && CC.enterCinderwake() !== false); };
  S.drawGlass = function (c, x, y, t) {
    var cell = CC.AbandonedVillage && CC.AbandonedVillage.cellar;
    if (!cell || !S.revealed(cell)) return;
    c.fillStyle = '#1a1112'; c.fillRect(x - 16, y - 14, 32, 30);
    for (var i = 0; i < 4; i++) { c.fillStyle = 'rgba(' + (200 - i * 22) + ',' + (120 - i * 12) + ',' + (60 - i * 6) + ',0.9)'; c.fillRect(x - 14 + i * 2, y - 10 + i * 6, 28 - i * 4, 3); }
    c.fillStyle = 'rgba(255,150,60,' + (0.16 + 0.08 * Math.sin(t * 3)) + ')'; c.fillRect(x - 16, y - 14, 32, 30);
    c.strokeStyle = 'rgba(255,190,90,0.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 16, y - 14); c.lineTo(x - 6, y - 24); c.lineTo(x + 8, y - 17); c.stroke();
    if (S.nearGlass(cell)) { c.font = 'bold 10px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#ffd9a0'; c.fillText('[F] Descend the glass stair', x, y - 28); c.textAlign = 'left'; }
  };

  /* ---------- the Heartcoal ---------- */
  var HEART_FX = 'heartcoal';
  S.heartcoal = function () {
    return { uid: 9000000 + (Date.now() % 900000), slot: 'trinket', rarity: 4, rarityName: 'Legendary', color: '#ff8a3a', glow: '#ff8a3a', ilvl: 8, name: 'Heartcoal',
      stats: { regen: 2, dmg: 3, mana: 8 }, effect: { id: HEART_FX, desc: 'Warm. It should not be. Fire damage +12%; heal slowly while standing still.' },
      legendary: true, classReq: null, className: null, set: null, setName: null, prefix: null, suffix: null, value: 600 };
  };
  function wearsHeartcoal() {
    var p = hero(), eq = p && p.equipment, k;
    if (eq) for (k in eq) if (eq[k] && eq[k].effect && eq[k].effect.id === HEART_FX) return true;
    return false;
  }

  /* ---------- lore ---------- */
  var LORE_TEXT = {
    page: ['A Torn Ledger Page', 'A column of years, in two hands. The second hand is Halric Vane\'s, and it never stops adding.'],
    coin: ['A Founder\'s Coin', 'Stamped with a flame. On the back, scratched in: one year.'],
    bowl: ['The Founders\' Tithe-Bowl', 'First frost. Forty-one years paid.'],
    vane: ['Vane\'s Ledger Page', 'Balance carried forward: all of them.']
  };
  S.lore = function () { return Object.keys(LORE_TEXT).filter(function (id) { return st.lore[id]; }).map(function (id) { return { id: id, name: LORE_TEXT[id][0], text: LORE_TEXT[id][1] }; }); };
  S.found = function (id) {
    var l = LORE_TEXT[id], p = hero(); if (!l || st.lore[id]) return false;
    st.lore[id] = 1; if (p) text(p.x, p.y - 28, 'FOUND: ' + l[0].toUpperCase(), '#ffe0a0', 11);
    say(l[0], l[1], 7000); if (CC.Audio && CC.Audio.event) CC.Audio.event('pickup'); save(); return true;
  };

  /* ---------- map state when a floor is loaded ---------- */
  function reveal(m, secret) {
    var c = Object.assign({ opened: !!st.looted[secret.id], secretId: secret.id }, secret.chest);
    if (m.chests.every(function (o) { return o.secretId !== secret.id; })) m.chests.push(c);
  }
  function applyLoad(m) {
    if (m.cwStory) return; m.cwStory = true; m.cwDone = st.done;
    (m.lore || []).forEach(function (l) { if (st.lore[l.id]) l.taken = true; });
    (m.secrets || []).forEach(function (sc) { if (st.secrets[sc.id]) { sc.done = true; reveal(m, sc); } });
    if (m.floor === 3 && m.chests.length && m.chests[0].tier === 3 && !m.chests[0].secretId) {
      m.reward = m.chests.shift(); // the reward chest appears only once the Hearthkeeper has fallen
      if (st.done && !st.rewardTaken) { m.chests.push(m.reward); }
    }
    if (m.floor === 3 && st.done) addFreed(m);
  }
  function addFreed(m) {
    if (m.freed) return;
    var last = m.reward || { x: m.spawn.x, y: m.spawn.y - 200 };
    m.freed = { x: last.x - 70, y: last.y + 30, name: 'A freed ghost', line: 'The ash has stopped falling. Listen. It is cold. I had forgotten cold.' };
    m.sealed = { x: last.x - 3 * 32, y: last.y - 16 }; // the furnace door: on open floor in front of the furnace (the reward chest sits 3 tiles right of the hall's centre line)
    m.props.push({ x: m.freed.x, y: m.freed.y, draw: function (c, x, y, time) { ghostArt(c, x, y, time); } });
    m.props.push({ x: m.sealed.x, y: m.sealed.y, draw: function (c, x, y, time) { sealedArt(c, x, y, time); } });
  }
  function ghostArt(c, x, y, time) {
    c.save(); c.translate(x, y + 3 * Math.sin(time * 1.5)); c.globalAlpha *= 0.8; c.fillStyle = '#dfe4f0';
    c.beginPath(); c.arc(0, -23, 6, 0, Math.PI * 2); c.fill();
    var g = c.createLinearGradient(0, -19, 0, 8); g.addColorStop(0, '#dfe4f0'); g.addColorStop(1, 'rgba(160,170,200,0)'); c.fillStyle = g;
    c.beginPath(); c.moveTo(-5, -19); c.quadraticCurveTo(-11, -8, -14, 8); c.quadraticCurveTo(0, 1, 13, 8); c.quadraticCurveTo(10, -8, 5, -19); c.closePath(); c.fill(); c.restore();
  }
  function sealedArt(c, x, y, time) {
    c.fillStyle = '#16100f'; c.fillRect(x - 16, y - 14, 32, 30);
    for (var i = 0; i < 4; i++) { c.fillStyle = 'rgba(' + (150 - i * 18) + ',' + (170 - i * 14) + ',' + (190 - i * 10) + ',0.85)'; c.fillRect(x - 14 + i * 2, y - 10 + i * 6, 28 - i * 4, 3); }
    c.strokeStyle = 'rgba(190,230,255,' + (0.3 + 0.15 * Math.sin(time * 2)) + ')'; c.lineWidth = 1; c.strokeRect(x - 16, y - 14, 32, 30); // a cold draught
    c.font = 'bold 9px Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#bcd6f0'; c.fillText('SEALED', x, y - 20); c.textAlign = 'left';
  }

  /* ---------- the boss ---------- */
  function bossDown(e) {
    var m = cwMap(), p = hero(); if (st.done) return; st.done = true;
    if (m) { m.cwDone = true; if (m.reward && m.chests.indexOf(m.reward) < 0) m.chests.push(m.reward); addFreed(m); }
    if (CC.Loot && CC.Loot._spawn && CC.Loot.drops) { var it = S.heartcoal(); CC.Loot.drops.push(CC.Loot._spawn('item', e.x, e.y, { item: it, rarity: it.rarity, color: it.color })); }
    S.found('vane');
    if (p) text(p.x, p.y - 44, 'QUEST COMPLETE: THE UNPAID DEBT', '#ffd36b', 13);
    if (CC.Audio && CC.Audio.event) CC.Audio.event('newquest');
    if (CC.fx && CC.fx.shake) CC.fx.shake(8);
    save();
  }

  /* ---------- interaction ---------- */
  function targets() {
    var m = cwMap(), out = [], E2 = CC.Enemies;
    if (!m) return out;
    if (m.bell) out.push({ kind: 'bell', x: m.bell.x, y: m.bell.y });
    (m.lore || []).forEach(function (l) { if (!l.taken) out.push({ kind: 'lore', o: l, x: l.x, y: l.y }); });
    (m.secrets || []).forEach(function (sc) { if (!sc.done) out.push({ kind: 'secret', o: sc, x: sc.x, y: sc.y }); });
    if (m.freed) out.push({ kind: 'freed', x: m.freed.x, y: m.freed.y });
    if (m.sealed) out.push({ kind: 'sealed', x: m.sealed.x, y: m.sealed.y });
    return out;
  }
  function pick() { var best = null, bd = RANGE, p = hero(); if (!p) return null; targets().forEach(function (t) { var d = Math.hypot(p.x - t.x, p.y - t.y); if (d <= bd) { bd = d; best = t; } }); return best; }
  S.nearAction = function () { return !!pick(); };
  function antechamberClear() { var l = (CC.Enemies && CC.Enemies.list) || []; return !l.some(function (e) { return !e.dead && e.hp > 0 && e.type !== 'hearthkeeper'; }); }
  S.interact = function () {
    var t = pick(), m = cwMap(), p = hero(); if (!t || !m) return false;
    if (t.kind === 'bell') { say('The Bell', 'It is warm to the touch.'); return true; }
    if (t.kind === 'lore') { t.o.taken = true; S.found(t.o.id); return true; }
    if (t.kind === 'freed') { say(m.freed.name, m.freed.line); return true; }
    if (t.kind === 'sealed') { // the furnace door has swung open: the way down to the Emberdeep
      text(p.x, p.y - 28, 'HEAT ROLLS UP FROM BELOW', '#ffb04a', 11); say('The Furnace Door', st.core ? 'The furnace door stands open on a cold, dark stair. The Emberdeep is quiet now.' : 'The door groans open. A stair of fused glass drops into the red dark, and the heat of the earth\'s core breathes up it. The knocking has stopped. Something below is waiting.', 5000);
      if (CC.Emberdeep && CC.Emberdeep.enter) CC.Emberdeep.enter(); return true; }
    var sc = t.o;
    if (sc.id === 'ash') {
      if (!antechamberClear()) { text(p.x, p.y - 28, 'SOMETHING STILL WATCHES. CLEAR THE ROOM FIRST.', '#ffb04a', 11); return true; }
      say('The Ledger', 'First frost. Forty-one years paid.');
      text(p.x, p.y - 28, 'THE ASH DOOR SLIDES BACK', '#ffd9a0', 12);
    } else if (sc.id === 'brazier') {
      text(p.x, p.y - 28, 'YOU SNUFF THE BRAZIER. A CLOSET OPENS.', '#ffd9a0', 11);
    } else if (sc.id === 'candle') {
      text(p.x, p.y - 28, 'YOU SNUFF THE CANDLE... SOMETHING STIRS', '#ffd9a0', 11);
      if (CC.Enemies && CC.Enemies.spawn) { var w = CC.Enemies.spawn('candlewraith', sc.x + 24, sc.y + 20, 4); if (w) { w.asleep = false; } }
    }
    sc.done = true; st.secrets[sc.id] = 1; reveal(m, sc);
    if (CC.Audio && CC.Audio.event) CC.Audio.event('door');
    if (CC.fx && CC.fx.shake) CC.fx.shake(3);
    save(); return true;
  };

  /* ---------- per frame ---------- */
  S.update = function (dt) {
    var m = cwMap(), p = hero(), en = CC.Enemies, hk, i;
    // the vault wall scorches through the moment the second vault chest opens
    var cell = CC.AbandonedVillage && CC.AbandonedVillage.cellar;
    if (CC.state && CC.state.area === 'village-cellar' && cell && cell.vaultChests && !st.open && S.revealed(cell) && p) {
      announced = true; text(p.x, p.y - 36, 'THE BACK WALL SCORCHES THROUGH...', '#ffb04a', 12); if (CC.fx && CC.fx.shake) CC.fx.shake(5); save();
    }
    if (p && wearsHeartcoal()) { // warm: a slow heal while standing still (anywhere)
      var moved = lastX === null ? 99 : Math.hypot(p.x - lastX, p.y - lastY);
      if (moved < 0.4 * Math.max(0.5, dt * 60) && p.hp > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt * p.maxHp * 0.012);
    }
    if (p) { lastX = p.x; lastY = p.y; }
    if (en && en.boss && en.boss.type === 'hearthkeeper' && !m) en.boss = null; // the bar belongs to the Cinderwake only
    if (!m || !en) return;
    hk = null; for (i = 0; i < en.list.length; i++) if (en.list[i].type === 'hearthkeeper' && !en.list[i].dead) hk = en.list[i];
    if (hk) { // a real boss bar and the boss music, without switching on the generic boss AI
      hk.bar = hk.bar || { name: 'The Hearthkeeper', pct: 1, phase: 1, phases: 3, color: '#ff8a2a', intro: 0 };
      if (en.boss !== hk) en.boss = hk;
    }
    if (m.reward && m.reward.opened) st.rewardTaken = true;
    (m.secrets || []).forEach(function (sc) { var c = m.chests.filter(function (o) { return o.secretId === sc.id; })[0]; if (c && c.opened && !st.looted[sc.id]) { st.looted[sc.id] = 1; if (sc.id === 'ash') S.found('bowl'); } });
    if (st.done && m.floor === 3) { // the furnace door stays shut: a slow knocking behind it, answered from far below
      knockT -= dt;
      if (knockT <= 0 && p && !st.core) { knockT = 14 + Math.random() * 6; if (CC.fx && CC.fx.shake) CC.fx.shake(2); text(p.x, p.y - 40, '...knock...', '#bcd6f0', 10); if (CC.Audio && CC.Audio.fx) CC.Audio.fx('thud', { vol: 0.35, gap: 500 }); }
    }
  };

  /* ---------- Widow Verrin, once the way is open ---------- */
  S.verrin = function () {
    if (st.core) return ['The ash has stopped falling over the whole valley. You went down into the Emberdeep itself and put out the curse. Rest, traveller. You have earned it.'];
    if (st.done) return ['So you have been below. Halric Vane kept the ledger and the keys. If you put him down, tell him the debt is a lie.',
      'The Emberdeep was never the bottom. Halric\'s furnace was only the first door. Whatever it was warming, it is awake.'];
    if (st.open) return ['The glass stair is open, then. Be careful with warm places, traveller. Warmth is how it asks.'];
    return null;
  };

  /* ---------- hooks into the engine ---------- */
  if (E) {
    var prevSpawn = E.spawnForFloor;
    E.spawnForFloor = function (floor, points) {
      var m = CC.state && CC.state.area === 'cinderwake' && CC.state.map && CC.state.map.cinderwake ? CC.state.map : null;
      if (!m) return prevSpawn.apply(this, arguments);
      applyLoad(m);
      var pts = st.done ? points.filter(function (p) { return p.type !== 'hearthkeeper'; }) : points; // he does not come back
      return prevSpawn.call(this, floor, pts);
    };
    var prevKill = E._kill;
    E._kill = function (e) {
      var was = !!(e && e.dead), r = prevKill.apply(this, arguments);
      if (e && e.dead && !was && e.type === 'hearthkeeper') { try { bossDown(e); } catch (err) { if (root.console) console.error(err); } }
      return r;
    };
    var prevDamage = E.damage;
    E.damage = function (e, amount, type) {
      if (type === 'fire' && wearsHeartcoal()) amount *= 1.12;
      return prevDamage.call(this, e, amount, type);
    };
    var prevUpdate = E.update;
    E.update = function (dt) { var r = prevUpdate.apply(this, arguments); try { S.update(dt); } catch (err) { if (root.console) console.error(err); } return r; };
  }
  S.applyLoad = applyLoad;
})(typeof window !== 'undefined' ? window : globalThis);
