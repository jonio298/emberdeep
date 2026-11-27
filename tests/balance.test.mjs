import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function seededRandom(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function boot(files) {
  const sandbox = vm.createContext({ console, performance });
  sandbox.window = sandbox;
  sandbox.CC = { Forest: { drawMonster: () => false }, state: { mode: 'dungeon', area: 'forest', player: { x: 0, y: 0, hp: 100, armor: 0, invuln: 0, r: 8 } } };
  for (const f of files) vm.runInContext(read(f), sandbox, { filename: f });
  return sandbox.CC;
}

const HP_MULT = +/var HP_MULT = ([\d.]+)/.exec(read('enemies.js'))[1];

test('hero curve check (measured with the real class and loot code)', () => {
  const sandbox = vm.createContext({ console, performance, __r: seededRandom(11) });
  sandbox.window = sandbox;
  sandbox.CC = { state: { mode: 'dungeon', area: 'forest', player: null }, Forest: { drawMonster: () => false } };
  vm.runInContext('Math.random = __r;', sandbox);
  for (const f of ['classes.js', 'loot.js', 'enemies.js', 'balance.js']) vm.runInContext(read(f), sandbox, { filename: f });
  const CC = sandbox.CC, B = CC.Balance, C = CC.Classes, Loot = CC.Loot;
  for (const L of [5, 10, 15, 20]) {
    let dmg = 0, hp = 0, n = 0;
    for (const cls of ['swordsman', 'wizard', 'necromancer', 'thief']) for (let rep = 0; rep < 10; rep++) {
      const p = C.create(cls); p.level = L;
      for (const slot of Loot.SLOTS) p.equipment[slot] = Loot.makeItem(L, L < 8 ? 1 : 2, slot);
      C.applyItemStats(p);
      dmg += p.stats.dmg; hp += p.maxHp; n++;
    }
    dmg /= n; hp /= n;
    assert.ok(Math.abs(dmg / B.hero.dmg(L) - 1) < 0.3, 'L' + L + ' damage: measured ' + dmg.toFixed(1) + ' vs table ' + B.hero.dmg(L).toFixed(1));
    assert.ok(Math.abs(hp / B.hero.hp(L) - 1) < 0.3, 'L' + L + ' health: measured ' + hp.toFixed(0) + ' vs table ' + B.hero.hp(L).toFixed(0));
  }
});

test('simulator: in every area band a normal monster always takes the same hits to kill, and a hit always costs a similar share of your health', () => {
  const CC = boot(['enemies.js', 'passmonsters.js', 'cinderwake_monsters.js', 'classes.js', 'balance.js']), B = CC.Balance, T = CC.Enemies.TYPES;
  const normal = Object.keys(T).filter(k => T[k].dmg > 0 && T[k].hp <= 130 && !/boss|dummy|weasel/i.test(k));
  assert.ok(normal.length >= 15, 'a good spread of monster kinds: ' + normal.length);
  const report = [];
  for (const [area, [lo, hi]] of Object.entries(B.BAND)) {
    for (const L of [lo, (lo + hi) / 2, hi]) {
      for (const k of normal) {
        const hp = T[k].hp * HP_MULT * B.hpScale(L), dmg = T[k].dmg * 0.95 * B.dmgScale(L);
        const hits = hp / B.hero.dmg(L), hitsAt1 = T[k].hp * HP_MULT / B.hero.dmg(1);
        assert.ok(Math.abs(hits / hitsAt1 - 1) < 0.01, area + ' L' + L + ' ' + k + ': ' + hits.toFixed(1) + ' hits to kill vs ' + hitsAt1.toFixed(1) + ' at level 1');
        const share = dmg / B.hero.effHp(L), share1 = T[k].dmg * 0.95 / B.hero.effHp(1);
        assert.ok(share / share1 >= 0.99 && share / share1 <= 1 + 0.012 * (hi - 1) + 0.02, area + ' L' + L + ' ' + k + ': a hit costs ' + (share * 100).toFixed(1) + '% (level 1: ' + (share1 * 100).toFixed(1) + '%)');
        assert.ok(B.hero.effHp(L) / dmg >= 4, area + ' L' + L + ' ' + k + ' would kill you in under 4 hits');
        assert.ok(hits <= 40, area + ' L' + L + ' ' + k + ' takes ' + hits.toFixed(0) + ' hits');
      }
      report.push(area + ' L' + L.toFixed(1) + ': HP x' + B.hpScale(L).toFixed(2) + ', damage x' + B.dmgScale(L).toFixed(2));
    }
  }
  assert.ok(report.length === Object.keys(B.BAND).length * 3);
});

test('the bands run in order and reach the Emberdeep boss at about level 20', () => {
  const B = boot(['classes.js', 'enemies.js', 'balance.js']).Balance, order = ['forest', 'tree-tunnel', 'plains', 'rocky-pass', 'village', 'cinderwake', 'emberdeep'];
  assert.ok(B.BAND.forest[0] === 1);
  assert.ok(B.BAND.emberdeep[0] <= B.BOSS_LEVEL && B.BAND.emberdeep[1] >= B.BOSS_LEVEL);
  for (let i = 2; i < order.length; i++) assert.ok(B.BAND[order[i]][0] >= B.BAND[order[i - 1]][0] - 1 && B.BAND[order[i]][1] >= B.BAND[order[i - 1]][1], order[i] + ' follows ' + order[i - 1]);
  assert.ok(B.BAND['rocky-pass'][0] >= 10, 'the pass opens at level 10 (the eagle gate)');
});

test('XP: killing an average monster gives about 1/kills-per-level of a level, so clearing each area carries you across its band', () => {
  const CC = boot(['classes.js', 'enemies.js', 'balance.js']), B = CC.Balance, C = CC.Classes;
  for (const L of [1, 5, 10, 15, 19]) {
    const perKill = B.xpFor(10, 10, L, 0), need = C.xpToNext(L);
    assert.ok(Math.abs(perKill * B.killsPerLevel(L) / need - 1) < 0.02, 'level ' + L);
  }
  // total XP across the whole game reaches level 20 (about 54,000 XP)
  let total = 0; for (let L = 1; L < 20; L++) total += C.xpToNext(L);
  assert.ok(total > 50000 && total < 58000, 'XP to level 20: ' + total);
  assert.ok(B.xpFor(10, 10, 20, 1) > B.xpFor(10, 10, 20, 0), 'replay gives more XP');
});

test('the Rocky Pass holds plenty of monsters for the XP its band needs', () => {
  const CC = boot(['classes.js', 'enemies.js', 'passmonsters.js', 'balance.js', 'realm.js', 'rockpass.js']), B = CC.Balance;
  for (const seed of [1, 4, 9]) {
    const map = CC.RockPass.generate(seed), n = map.enemySpawns.length, [lo, hi] = B.BAND['rocky-pass'];
    let kills = 0; for (let L = lo; L < hi; L++) kills += B.killsPerLevel(L);
    assert.ok(n >= kills * 1.5, 'seed ' + seed + ': ' + n + ' monsters for ' + kills + ' kills needed');
    CC.RockPass.reset();
  }
});

test('scaling a monster: health, damage, XP and loot level follow its level; replay makes it much stronger', () => {
  const CC = boot(['classes.js', 'enemies.js', 'passmonsters.js', 'balance.js']), B = CC.Balance, E = CC.Enemies;
  CC.state.area = 'rocky-pass'; CC.state.mode = 'dungeon'; CC.Dungeon = { spawn: { x: 0, y: 0 } };
  const near = E.spawn('screegolem', 10, 0, 1), far = E.spawn('screegolem', 1000, 0, 1);
  const baseHp = near.maxHp, baseDmg = near.dmg;
  E.update(0.016);
  assert.ok(near._bal < far._bal, 'the far end is the harder end: ' + near._bal.toFixed(1) + ' < ' + far._bal.toFixed(1));
  assert.ok(far._bal <= 14 && near._bal >= 10);
  assert.ok(far.maxHp > near.maxHp && far.dmg > near.dmg && far.floor > near.floor);
  assert.ok(Math.abs(far.maxHp / baseHp - B.hpScale(far._bal)) < 0.2);
  assert.ok(baseDmg >= 1);
  // replay
  CC.state.cycle = 2; const tough = E.spawn('screegolem', 1000, 0, 1); E.update(0.016);
  assert.ok(tough.maxHp > far.maxHp * 2.5 && tough.dmg > far.dmg * 1.8, 'replay 2: HP x2.8, damage x2.0');
  assert.ok(tough.xp > far.xp * 1.9, 'and more XP');
  // night stalkers and Endless are left alone
  CC.state.cycle = 0; const st = E.spawn('screegolem', 500, 0, 1); st.nightStalker = true; const hp0 = st.maxHp; E.update(0.016);
  assert.equal(st.maxHp, hp0);
  CC.state.area = 'forest';
});

test('replay swaps in tougher kinds and gives elite abilities to many ordinary monsters', () => {
  const CC = boot(['classes.js', 'enemies.js', 'passmonsters.js', 'balance.js']), E = CC.Enemies;
  CC.state.area = 'plains'; CC.state.mode = 'dungeon'; CC.Dungeon = { spawn: { x: 0, y: 0 } };
  CC.state.cycle = 1;
  const kinds = {}; let elites = 0;
  for (let i = 0; i < 300; i++) { const e = E.spawn('slime', i * 3, 0, 1); kinds[e.type] = (kinds[e.type] || 0) + 1; if (e.elite) elites++; }
  assert.ok(Object.keys(kinds).length >= 3, 'new kinds appear: ' + Object.keys(kinds).join(','));
  assert.ok(elites > 40, 'elite abilities: ' + elites);
  CC.state.cycle = 0; E.list.length = 0;
  const e0 = E.spawn('slime', 0, 0, 1);
  assert.equal(e0.type, 'slime'); assert.ok(!e0.elite, 'the first time through is unchanged');
});

test('the save keeps the replay count and the story chapter; test mode can set the replay', () => {
  assert.match(read('save_game.js'), /cycle:s\.cycle\|\|0,chapter:s\.chapter\|\|1/);
  assert.match(read('main.js'), /CC\.state\.cycle=data\.cycle\|0/);
  assert.match(read('testmode.js'), /Balance\.setCycle/);
});

test('spell simulator: every spell is worth casting, none replaces the basic attack, and mana efficiency is in a sane window', () => {
  const CC = boot(['classes.js', 'enemies.js', 'balance.js']), B = CC.Balance;
  let n = 0;
  for (const [cls, list] of Object.entries(B.SPELLS)) {
    for (const sp of list) {
      const s = B.spellStats(cls, sp); n++;
      assert.ok(s && s.cost > 0 && s.cd > 0, cls + ' ' + sp.name + ' has a cost and a cooldown');
      if (sp.utility) continue;
      assert.ok(s.burst >= 2, cls + ' ' + s.name + ': a cast is worth at least two basic hits (' + s.burst.toFixed(1) + ')');
      assert.ok(s.ratio >= (sp.charge ? 0.25 : 0.15) && s.ratio <= (sp.charge ? 1.3 : 0.9), cls + ' ' + s.name + ': sustained damage is ' + (s.ratio * 100).toFixed(0) + '% of the basic attack');
      assert.ok(s.perMana >= 0.1 && s.perMana <= 0.7, cls + ' ' + s.name + ': ' + s.perMana.toFixed(2) + ' damage per mana');
    }
    const charges = list.filter(sp => sp.charge && !sp.utility).map(sp => B.spellStats(cls, sp).ratio);
    assert.ok(Math.max(...charges) >= Math.min(...charges), cls);
  }
  assert.ok(n >= 19);
});

test('the spell table matches the numbers in the real spell code', () => {
  const classes = read('classes.js'), charge = read('charge.js');
  const checks = [
    [classes, /1\.3 \* sm\(p, 1\), 'bash'/, 'Shield Bash 1.3'], [classes, /0\.8 \* sm\(p, 2\), 'slash'/, 'Whirl 0.8 x 5 ticks'],
    [classes, /2\.4 \* sm\(p, 1\), 6, 'fire'/, 'Fireball 2.4'], [classes, /1\.8 \* sm\(p, 2\), 'frost'/, 'Frost Nova 1.8'], [classes, /0\.8 \* sm\(p, 1\), 3, 'shard'/, 'Knives 0.8 x 3'],
    [charge, /dmg \* 1\.7 \* scale, 'slash'/, 'Blade Storm 1.7 x 3'], [charge, /dmg \* 4\.5 \* scale, 'slash'/, 'Dragon Rush 4.5'], [charge, /dmg: dmg \* 1\.8 \* scale, flash: 1/, 'Lightning Spear 1.8 x 4'],
    [charge, /dmg \* 0\.45 \* scale, 'frost'/, 'Blizzard pulses'], [charge, /dmg \* 0\.8 \* scale, 'frost'/, 'Blizzard spikes'], [charge, /rad: 52, dmg: dmg \* 3 \* scale/, 'Meteor 3 x 5'],
    [charge, /dmg \* 4\.5 \* scale, 'drain'/, 'Soul Spear 4.5'], [charge, /dmg \* 4 \* scale, 'poison'\); status\(f, 'slow', 3\.5/, 'Plague Nova 4'], [charge, /dmg \* 2\.0 \* scale, 'drain'/, 'Army 2.0'],
    [charge, /dmg \* 4 \* scale, 'poison'\); status\(f, 'slow', 3, 0\.5/, 'Venom Burst 4'], [charge, /dmg \* 2 \* scale, 'shadow'/, 'Phantom Blades 2 x 2']];
  for (const [src, re, what] of checks) assert.match(src, re, what + ' is in the code');
});
