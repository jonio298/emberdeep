import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const STALKERS = ['grinmask', 'marionette', 'scytheweaver', 'veiledwidow', 'wailchorus', 'skullbloom', 'cinderhound', 'gloomcrawler', 'gravemaw'];

function boot(cls = 'swordsman') {
  const sb = vm.createContext({ console, performance });
  sb.window = sb;
  sb.CC = { Forest: { drawMonster: () => false }, state: { mode: 'dungeon', area: 'forest', floor: 1, gold: 0, inventory: [], map: { chests: [] } } };
  for (const f of ['droptables.js', 'loot.js', 'legendary_weapons.js', 'classes.js', 'enemies.js', 'frost.js', 'legendary.js']) vm.runInContext(read(f), sb, { filename: f });
  const CC = sb.CC, p = CC.Classes.create(cls);
  p.level = 30; CC.Classes.applyItemStats(p); p.hp = p.maxHp = 10000; p.mana = p.maxMana = 1000; p.x = 100; p.y = 100;
  CC.state.player = p; CC.Dungeon = { isSolid: () => false, isSolidTile: () => false, moveWithCollision(e, dx, dy) { e.x += dx; e.y += dy; return {}; }, openChest: c => { if (c.opened) return false; c.opened = true; return true; } };
  CC.fx = { text() {}, burst() {}, shake() {}, blood() {}, flash() {} };
  const E = CC.Enemies, mk = (x = 130, y = 100, type = 'slime', hp = 1000) => { const e = E.spawn(type, x, y, 1, { awake: true }); e.maxHp = e.hp = hp; e.asleep = false; return e; };
  const equip = id => { const l = CC.Loot.LEGENDS.find(q => q.effect.id === id && q.legendary70) || CC.Loot.LEGENDS.find(q => q.effect.id === id); const it = CC.Loot.makeItem(30, 4, 'weapon', p.classId, 30, l); p.equipment.weapon = it; CC.Legendary.tick(0.016); return it; };
  return { CC, p, E, mk, equip, LG: CC.Legendary, step: (n = 3) => { for (let i = 0; i < n; i++) CC.Legendary.tick(0.1); } };
}

test('there are 70 new legendary weapons: 14 per class, 5 bound to bosses, 9 to night stalkers, each with an implemented ability', () => {
  const { CC, LG } = boot(), list = CC.Loot.LEGEND_WEAPONS;
  assert.equal(list.length, 70);
  assert.equal(new Set(list.map(l => l.name)).size, 70, 'unique names');
  for (const cls of ['swordsman', 'wizard', 'necromancer', 'thief']) assert.equal(list.filter(l => l.cls === cls).length, 14, cls);
  assert.equal(list.filter(l => l.boundKind === 'boss').length, 5);
  const bound = list.filter(l => l.boundKind === 'stalker'); assert.equal(bound.length, 9);
  assert.deepEqual(Array.from(bound.map(l => l.boundTo)).sort(), STALKERS.slice().sort(), 'one per night stalker');
  for (const l of list) {
    assert.ok(LG.HANDLERS[l.effect.id], l.name + ' has an ability handler (' + l.effect.id + ')');
    assert.ok(l.effect.desc.length > 20 && l.qlvl >= 5 && l.qlvl <= 40 && l.stats.dmg > 0, l.name);
    assert.ok(['sword', 'axe', 'mace', 'dagger', 'staff', 'wand', 'bow', 'spear'].includes(l.weaponType), l.name + ' type ' + l.weaponType);
  }
  assert.ok(new Set(list.map(l => l.effect.id)).size >= 68, 'abilities are mostly unique');
  assert.ok(CC.Loot.LEGENDS.length >= 21 + 60, 'they are in the drop pool');
});

test('bound weapons drop only from their own boss or stalker; others never from the wrong source', () => {
  const { CC } = boot(), DT = CC.DropTables, L = CC.Loot.LEGENDS;
  let seen = 0; const rnd = (() => { let a = 7; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
  for (let i = 0; i < 4000; i++) {
    const g = DT.pickLegend(L, 'weapon', 40, 'wizard', rnd, { id: 'gravemaw', stalker: true }); assert.ok(g);
    if (g.boundTo) { assert.equal(g.boundTo, 'gravemaw'); assert.equal(g.boundKind, 'stalker'); seen++; }
  }
  assert.ok(seen > 1000, 'the stalker\'s own weapon is likely: ' + seen);
  for (let i = 0; i < 4000; i++) assert.ok(!DT.pickLegend(L, 'weapon', 40, 'wizard', rnd, { id: 'slime', stalker: false }).boundTo, 'a slime never drops a bound weapon');
  const boss = DT.pickLegend(L, 'weapon', 40, 'swordsman', () => 0.999, { id: 'grinmask', stalker: false }); assert.ok(boss);
  for (let i = 0; i < 2000; i++) { const g = DT.pickLegend(L, 'weapon', 40, 'swordsman', rnd, { id: 'grinmask', stalker: false }); if (g.boundTo) assert.equal(g.boundKind, 'boss'); }
});

test('every ability runs through every hook without errors, and class weapons are class-locked', () => {
  const { CC, p, mk, equip, LG, step } = boot('wizard');
  const types = ['slash', 'bash', 'fire', 'frost', 'magic', 'lightning', 'drain', 'poison', 'shard', 'shadow'];
  for (const l of CC.Loot.LEGEND_WEAPONS) {
    const it = equip(l.effect.id); assert.equal(it.legendId, l.effect.id); assert.equal(it.reqLevel, l.qlvl);
    if (l.cls) assert.equal(it.classReq, l.cls);
    const e1 = mk(130, 100), e2 = mk(160, 110, 'slime', 40);
    for (const t of types) CC.Classes.hitEnemy(e1, 30, t, { basicAttack: t === 'slash' });
    p.cd.spell1 = 0; p.cd.spell2 = 0; step(1); p.cd.spell1 = 3; p.cd.spell2 = 5; step(1);
    p.dashT = 0.15; p.dashVX = 400; p.dashVY = 0; step(3); p.dashT = 0;
    CC.Enemies._kill(e2);
    const H = LG.HANDLERS[l.effect.id]; if (H.onHurt) H.onHurt(LG.X, p, 40); if (H.onCharge) H.onCharge(LG.X, p, 1);
    step(40); p.hp = p.maxHp; CC.Enemies.list.length = 0; LG.reset();
  }
});

test('abilities do what they say (a sample)', () => {
  const t = boot('swordsman'), { CC, p, mk, equip, step } = t;
  // Kingsbane: x2 to elites, x0.85 to the rest
  equip('bane'); const normal = mk(), elite = mk(); elite.elite = true;
  const n0 = normal.hp, e0 = elite.hp; CC.Classes.hitEnemy(normal, 100, 'slash', { noCrit: true }); CC.Classes.hitEnemy(elite, 100, 'slash', { noCrit: true });
  const dn = n0 - normal.hp, de = e0 - elite.hp; assert.ok(de > dn * 2.2, `elite ${de} vs normal ${dn}`);
  // Hollow Tree Cleaver: executes a foe under 30%
  equip('execute'); const low = mk(130, 100, 'slime', 1000); low.hp = 200; CC.Classes.hitEnemy(low, 5, 'slash', { noCrit: true }); assert.ok(low.dead || low.hp <= 0, 'executed');
  const high = mk(130, 100, 'slime', 1000); CC.Classes.hitEnemy(high, 5, 'slash', { noCrit: true }); assert.ok(high.hp > 900);
  // Ironvow: 25% less damage while attacking
  equip('ironvow'); p.atkAnim = 0.2; assert.equal(Math.round(CC.Legendary.HANDLERS.ironvow.onHurt(CC.Legendary.X, p, 100)), 75); p.atkAnim = 0; assert.equal(CC.Legendary.HANDLERS.ironvow.onHurt(CC.Legendary.X, p, 100), 100);
  // Dawnbreaker: a crit hits 60% harder (forced crit)
  equip('crit_damage'); const c1 = mk(), c2 = mk(); CC.Classes.hitEnemy(c1, 100, 'slash', { preRolledCrit: false, noCrit: false }); CC.Classes.hitEnemy(c2, 100, 'slash', { preRolledCrit: true });
  assert.ok(1000 - c2.hp > (1000 - c1.hp) * 1.4);
  // Oathsplitter costs more mana per Whirl
  equip('whirl_double'); p.mana = 500; p.cd.spell2 = 0; step(1); p.cd.spell2 = 7; step(1); assert.ok(p.mana < 500, 'extra mana spent');
  // Ragewind stacks speed
  equip('ragewind'); const r = mk(); for (let i = 0; i < 5; i++) CC.Classes.hitEnemy(r, 1, 'slash', { basicAttack: true, noCrit: true }); assert.equal(p._lg.rage, 5);
  // Hound's Fang: +20% move speed while wielded, removed when you take it off
  const base = p.stats.speed; equip('hound'); assert.ok(Math.abs(p.stats.speed / base - 1.2) < 0.05 || p.stats.speed > base * 1.1, 'speed ' + p.stats.speed); p.equipment.weapon = null; step(1); assert.ok(Math.abs(p.stats.speed - base) < 1, 'speed back to normal');
  // Sepulcher: minion cap flag
  equip('sepulcher'); assert.equal(p.flags.legionLeg, 1.5); p.equipment.weapon = null; step(1); assert.equal(p.flags.legionLeg, 0);
  // Lich: a fatal blow is turned into lich form
  const L2 = CC.Legendary; equip('lich'); p.hp = 10; assert.equal(L2.HANDLERS.lich.onHurt(L2.X, p, 500), 0); assert.ok(p._lg.lich > 0 && p.hp >= 1);
  // Rimefall doubles the freeze odds and lengthens chills
  equip('rimefall'); assert.equal(L2.freezeMul(), 2); assert.equal(L2.chillFor(), 5);
});

test('legendary weapons appear in drops, show their level requirement, and strict levels still apply', () => {
  const { CC, p } = boot('wizard'), Loot = CC.Loot;
  const out = []; for (let i = 0; i < 400; i++) { const it = CC.DropTables.makeDrop({ tier: 'boss', level: 30, luck: 0, cls: 'wizard', force: true, source: 'x' }); out.push(it); }
  const weapons = out.filter(it => it.slot === 'weapon' && it.legendary70 === undefined && it.legendId);
  assert.ok(out.every(it => it.legendary && it.reqLevel >= 5), 'every forced drop is a legendary with a level');
  const w = Loot.makeItem(30, 4, 'weapon', 'wizard', 30, Loot.LEGEND_WEAPONS.find(l => l.name === 'The Last Word'));
  assert.equal(w.reqLevel, 32); p.level = 20; assert.equal(Loot.canWear(w, p.level), false); assert.equal(Loot.canWear(w, 32), true);
  assert.equal(w.weaponType, 'staff');
});

test('power cap: every weapon has comparable stats, and no damage multiplier is out of line with the curve', () => {
  const { CC, p, mk, LG } = boot('swordsman'), list = CC.Loot.LEGEND_WEAPONS;
  const totals = list.map(l => Object.values(l.stats).reduce((a, b) => a + b, 0)), mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  totals.forEach((t, i) => assert.ok(t > mean * 0.55 && t < mean * 1.6, list[i].name + ' stat total ' + t.toFixed(2) + ' vs mean ' + mean.toFixed(2)));
  // the damage multiplier a weapon gives in its best ordinary situation (never above 3x; most 2x or less)
  const e = mk(), elite = mk(); elite.elite = true; p.ambushT = 0; p._lg = { cs: 30, lw: 3, mm: 4, coin: true };
  const rows = [];
  for (const l of list) {
    const H = LG.HANDLERS[l.effect.id]; if (!H.dmgMul) continue;
    let best = 0; for (const target of [e, elite]) for (const crit of [false, true]) { target._mark = 5; target._wet = 1e9; best = Math.max(best, H.dmgMul(LG.X, p, target, 10, 'fire', { crit, melee: true, basic: true })); }
    rows.push([l.name, best]); assert.ok(best <= 3.01, l.name + ' multiplies damage by ' + best);
  }
  assert.ok(rows.filter(r => r[1] > 2.01).length <= 3, 'only a few weapons can exceed x2: ' + rows.filter(r => r[1] > 2.01).map(r => r[0]).join(', '));
});

test('every legendary weapon has its own art, using a known shape and motif', () => {
  const { CC } = boot(), sb = vm.createContext({ console }); sb.window = sb; sb.CC = {};
  vm.runInContext(read('legendart.js'), sb, { filename: 'legendart.js' });
  const LA = sb.CC.LegendArt, src = read('legendart.js');
  const shapes = new Set([...src.matchAll(/^\s{4}(\w+): function \(c, B, A, X\)/gm)].map(m => m[1])), motifs = new Set([...src.matchAll(/^\s{4}(\w+): function \(c, a, A\)/gm)].map(m => m[1]).concat('none'));
  assert.equal(Object.keys(LA.SPECS).length, 70);
  for (const w of CC.Loot.LEGEND_WEAPONS) {
    assert.ok(LA.has(w.name), 'no art for ' + w.name);
    const s = LA.SPECS[w.name];
    assert.ok(shapes.has(s[0]), w.name + ' shape ' + s[0]); assert.ok(motifs.has(s[3]), w.name + ' motif ' + s[3]);
  }
  assert.ok(new Set(Object.values(LA.SPECS).map(s => s.slice(0, 4).join('|'))).size >= 68, 'the weapons should look different from each other');
});
