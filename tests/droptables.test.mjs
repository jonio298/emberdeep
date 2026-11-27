import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function boot(seed = 5) {
  const sb = vm.createContext({ console, performance });
  sb.window = sb;
  sb.CC = { state: { mode: 'dungeon', area: 'forest', floor: 1, player: { classId: 'wizard', level: 10, luck: 0 }, inventory: [] } };
  for (const f of ['droptables.js', 'loot.js']) vm.runInContext(read(f), sb, { filename: f });
  sb.CC.Loot.setRandom(seeded(seed));
  return { CC: sb.CC, DT: sb.CC.DropTables, Loot: sb.CC.Loot, rnd: seeded(seed + 1) };
}
// the count within 4.5 standard deviations of n * p
function within(count, n, p, what) {
  const mean = n * p, sd = Math.sqrt(n * p * (1 - p));
  assert.ok(Math.abs(count - mean) <= 4.5 * sd + 1, `${what}: ${count} vs expected ${mean.toFixed(1)} (+/- ${(4.5 * sd).toFixed(1)})`);
}

test('quality rolls follow the table in Diablo II order (legendary, epic, rare, uncommon, else common)', () => {
  const { DT, rnd } = boot();
  for (const tier of ['normal', 'champion', 'miniboss', 'boss', 'chest3']) {
    const q = DT.TIERS[tier].q, N = 300000, c = [0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) c[DT.rollQuality(tier, 12, 0, rnd, 0)]++;
    const p4 = q.leg, p3 = (1 - q.leg) * q.epic, p2 = (1 - q.leg) * (1 - q.epic) * q.rare, p1 = (1 - q.leg) * (1 - q.epic) * (1 - q.rare) * q.unc;
    within(c[4], N, p4, tier + ' legendary'); within(c[3], N, p3, tier + ' epic'); within(c[2], N, p2, tier + ' rare'); within(c[1], N, p1, tier + ' uncommon');
  }
  assert.ok(DT.TIERS.boss.q.leg > DT.TIERS.miniboss.q.leg && DT.TIERS.miniboss.q.leg > DT.TIERS.champion.q.leg && DT.TIERS.champion.q.leg > DT.TIERS.normal.q.leg, 'better sources, better odds');
});

test('low-level monsters cannot drop the higher qualities; champions, mini-bosses and bosses never drop common', () => {
  const { DT, rnd } = boot();
  for (let i = 0; i < 40000; i++) assert.ok(DT.rollQuality('boss', 1, 0, rnd) <= 4 && DT.rollQuality('normal', 1, 0, rnd) <= 4);
  let epic = 0, rare = 0; for (let i = 0; i < 200000; i++) { const r = DT.rollQuality('boss', 3, 0, rnd); if (r === 3) epic++; if (r === 2) rare++; }
  assert.equal(epic, 0, 'no epics below item level 4');
  assert.ok(rare > 0);
  for (const tier of ['champion', 'miniboss', 'boss', 'chest1']) for (let i = 0; i < 5000; i++) assert.ok(DT.rollQuality(tier, 10, 0, rnd) >= 1, tier + ' never common');
});

test('Magic Find only raises the quality odds, with diminishing returns, and never changes how many items drop', () => {
  const { DT, rnd } = boot();
  const o0 = DT.odds('boss', 0), o30 = DT.odds('boss', 30), o90 = DT.odds('boss', 90), o300 = DT.odds('boss', 300);
  assert.ok(o30.leg > o0.leg && o90.leg > o30.leg && o300.leg > o90.leg);
  assert.ok(Math.abs(o30.leg / o0.leg - (1 + DT.mfEff(30, 'leg') / 100)) < 1e-9);
  assert.ok(o300.leg / o0.leg < 1 + DT.K.leg / 100, 'a hard cap on the legendary multiplier: ' + (o300.leg / o0.leg).toFixed(2));
  assert.ok((o90.leg - o30.leg) < (o30.leg - o0.leg) * 2, 'each extra point of MF is worth less');
  assert.ok(DT.mfEff(30, 'epic') > DT.mfEff(30, 'leg') * 0 && DT.mfEff(1e6, 'leg') < DT.K.leg, 'MF is bounded by its K');
  const n0 = [], n1 = []; for (let i = 0; i < 20000; i++) { n0.push(DT.pickCount('normal', rnd)); }
  const rnd2 = seeded(1); for (let i = 0; i < 20000; i++) n1.push(DT.pickCount('normal', rnd2));
  assert.equal(n0.reduce((a, b) => a + b, 0) > 0, true);
});

test('how many items: a normal monster drops one 7% of the time, a champion 1 or 2, a mini-boss 2-4, a boss 3-5 and never none', () => {
  const { DT, rnd } = boot();
  const N = 200000, c = { normal: 0 }, seen = { champion: {}, miniboss: {}, boss: {} };
  for (let i = 0; i < N; i++) c.normal += DT.pickCount('normal', rnd);
  within(c.normal, N, 0.07, 'normal drops');
  for (const t of Object.keys(seen)) for (let i = 0; i < 20000; i++) { const k = DT.pickCount(t, rnd); seen[t][k] = (seen[t][k] || 0) + 1; }
  assert.deepEqual(Object.keys(seen.champion).map(Number).sort(), [1, 2]);
  within(seen.champion[2], 20000, 0.35, 'champion second item');
  assert.deepEqual(Object.keys(seen.miniboss).map(Number).sort(), [2, 3, 4]);
  assert.deepEqual(Object.keys(seen.boss).map(Number).sort(), [3, 4, 5]);
});

test('overlevel: items can be above the monster level, bosses always, and every replay adds 3', () => {
  const { DT, rnd } = boot();
  for (const [tier, p, lo, hi] of [['normal', 0.04, 1, 2], ['champion', 0.08, 1, 3], ['miniboss', 0.15, 2, 4], ['boss', 1, 2, 5]]) {
    const N = 100000; let over = 0;
    for (let i = 0; i < N; i++) { const r = DT.itemLevel(10, tier, 0, rnd); if (r.over) { over++; assert.ok(r.over >= lo && r.over <= hi, tier + ' +' + r.over); } assert.equal(r.ilvl, 10 + r.over); }
    within(over, N, p, tier + ' overlevel rate');
  }
  assert.equal(DT.itemLevel(10, 'normal', 2, () => 0.99).ilvl, 16, 'two replays: +6');
});

test('a legendary only drops once the monster reaches its level, and your own class is likelier than others', () => {
  const { DT, rnd } = boot();
  const list = [{ name: 'a', slot: 'weapon', qlvl: 10, cls: 'wizard' }, { name: 'b', slot: 'weapon', qlvl: 10, cls: 'thief' }, { name: 'c', slot: 'weapon', qlvl: 30 }, { name: 'd', slot: 'ring', qlvl: 5 }];
  for (let i = 0; i < 2000; i++) assert.ok(DT.pickLegend(list, 'weapon', 12, 'wizard', rnd).qlvl <= 12);
  assert.equal(DT.pickLegend(list, 'weapon', 9, 'wizard', rnd), null, 'nothing yet at item level 9');
  let a = 0, b = 0; for (let i = 0; i < 20000; i++) { const r = DT.pickLegend(list, 'weapon', 12, 'wizard', rnd); if (r.name === 'a') a++; else b++; }
  within(a, 20000, 1 / (1 + 0.35), 'your class weight 1 vs 0.35');
  assert.equal(b + a, 20000);
});

test('whole items: a forced legendary has its level as the requirement; below any legendary level you get an epic; everything else needs 80% of its item level', () => {
  const { DT, Loot, CC } = boot();
  const lg = DT.makeDrop({ tier: 'boss', level: 40, luck: 0, cls: 'wizard', force: true });
  assert.equal(lg.rarity, 4); assert.ok(lg.legendary && lg.qlvl >= 5 && lg.qlvl <= lg.ilvl); assert.equal(lg.reqLevel, lg.qlvl);
  const low = DT.makeDrop({ tier: 'normal', level: 1, luck: 0, cls: 'wizard', force: true, rnd: () => 0.99 });
  assert.equal(low.rarity, 3, 'no legendary is eligible at item level 1');
  for (let i = 0; i < 300; i++) {
    const it = DT.makeDrop({ tier: 'champion', level: 15, luck: 0, cls: 'wizard' });
    assert.ok(it.reqLevel >= 1 && (it.legendary ? it.reqLevel === it.qlvl : it.reqLevel === Math.max(1, Math.ceil(it.ilvl * 0.8))), JSON.stringify([it.name, it.ilvl, it.reqLevel]));
  }
  const old = { name: 'Emberfang', slot: 'weapon', legendary: true, ilvl: 3, stats: {} };
  Loot.hydrate(old); assert.equal(old.reqLevel, 8, 'older saved legendaries get their level');
  const strict = { slot: 'weapon', reqLevel: 12, stats: { dmg: 99 }, rarity: 3, ilvl: 15 }, p = { classId: 'wizard', level: 11, equipment: {} };
  assert.equal(Loot.canWear(strict, 11), false); assert.equal(Loot.canWear(strict, 12), true);
  assert.equal(Loot.autoEquip(p, strict), false, 'strict: it stays in the pack');
  p.level = 12; assert.equal(Loot.autoEquip(p, strict), true);
  assert.match(read('ui.js'), /Requires level ' \+ it\.reqLevel/);
});

test('weapon drops lean toward your class (55% of the time a base you can use)', () => {
  const { Loot } = boot(9); let mine = 0; const N = 6000;
  for (let i = 0; i < N; i++) { const it = Loot.makeItem(10, 2, 'weapon', 'wizard'); if (it.classReq === 'wizard') mine++; }
  within(mine, N, 0.55, 'wizard weapons');
});

test('bad-luck protection: after 25 boss or mini-boss kills without a legendary, the next one drops a legendary; any legendary resets it', () => {
  const { CC, DT, Loot } = boot(3);
  CC.state.pity = { n: 0 };
  for (let i = 0; i < 24; i++) DT.pity.kill('boss', false);
  assert.equal(DT.pity.due(), false);
  DT.pity.kill('miniboss', false); assert.equal(DT.pity.due(), true);
  const out = Loot.roll({ x: 0, y: 0, boss: true }, 20, 0, { spawn: false });
  assert.ok(out.some(d => d.item && d.item.legendary), 'the due boss drops a legendary');
  assert.equal(CC.state.pity.n, 0, 'and the counter is reset');
  DT.pity.kill('normal', false); assert.equal(CC.state.pity.n, 0, 'normal kills do not count');
  assert.match(read('save_game.js'), /pity:\(s\.pity&&s\.pity\.n\)\|0/);
});

test('simulator: a typical hour of play at level 12 yields about one legendary, more on stalker hunts, and it scales with Magic Find', () => {
  const { DT } = boot();
  function perHour(luck, sources) {
    let t = 0; for (const [tier, kills] of sources) { const T = DT.TIERS[tier], items = T.dropChance * (T.pick2 !== undefined ? T.picks[0] + T.pick2 : (T.picks[0] + T.picks[1]) / 2); t += kills * items * DT.odds(tier, luck).leg; } return t;
  }
  const hour = [['normal', 900], ['champion', 40], ['miniboss', 6], ['chest1', 8], ['chest2', 3]];
  const a = perHour(0, hour), b = perHour(30, hour), hunt = perHour(0, [['miniboss', 20], ['champion', 40], ['normal', 500]]);
  assert.ok(a > 0.4 && a < 2.5, 'about one an hour: ' + a.toFixed(2));
  assert.ok(b > a * 1.5 && b < a * 2.3, 'MF 150: ' + b.toFixed(2));
  assert.ok(hunt > a, 'a stalker hunt is the better farm: ' + hunt.toFixed(2));
});
