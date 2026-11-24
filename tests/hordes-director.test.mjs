import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function fixture(seed, heroLevel = 1, role = 'solo') {
  const sandbox = vm.createContext({ console });
  sandbox.window = sandbox;
  const load = file => vm.runInContext(
    readFileSync(new URL('../' + file, import.meta.url), 'utf8'), sandbox, { filename: file }
  );
  for (const file of ['classes.js', 'save_game.js', 'enemies.js', 'plains.js', 'endless.js']) load(file);
  const { CC } = sandbox;
  const originalState = CC.state = { mode: 'title' };
  const campaignMap = CC.Dungeon = { campaign: true };
  const originalEnemies = CC.Enemies.list;
  const originalPileChance = CC.Enemies.pileChance;
  const cues = [];
  CC.Audio = { event(name) { cues.push([CC.Endless.state.seconds, name]); } };
  CC.Difficulty = {
    hpMul() { throw new Error('Director read the hit difficulty modifier'); },
    dmgMul() { throw new Error('Director read the damage difficulty modifier'); }
  };
  const seeds = [];
  CC.Plains.generateSurvival = mapSeed => {
    seeds.push(mapSeed);
    const enemySpawns = [];
    for (let y = 62; y <= 674; y += 36) {
      for (let x = 62; x <= 926; x += 36) enemySpawns.push({ x, y });
    }
    return {
      spawn: { x: 494, y: 360 }, enemySpawns, chests: [],
      isSolid(x, y) {
        return x < 30 || y < 30 || x > 960 || y > 700 || (x > 550 && x < 594 && y > 240 && y < 400);
      }
    };
  };
  load('hordes.js');
  const E = CC.Endless;
  const H = CC.Hordes;
  const guest = { hp: 100, x: 680, y: 360 };
  if (role === 'host') E.setNetworkAdapter({ heroes: () => [guest] });
  assert.equal(E.start({ mode: 'plains', classId: 'wizard', seed, role }), true);
  CC.state.player.level = heroLevel;
  const plain = obj => JSON.parse(JSON.stringify(obj));
  const lighting = () => plain(H.lighting({ run: E.state }));
  const advance = (end, onStep, step = 0.25) => {
    while (E.state.seconds < end) {
      assert.equal(E.update(Math.min(step, end - E.state.seconds)), true);
      onStep?.(CC.Enemies.list, E.state.seconds);
    }
  };
  return { CC, E, H, seeds, cues, originalState, campaignMap, originalEnemies, originalPileChance,
    lighting, advance, guest };
}

function simulate(seed, step) {
  const { CC, E, H, seeds, advance } = fixture(seed);
  assert.deepEqual(seeds, [seed]);
  const counts = Array(8).fill(0);
  const layout = [];
  for (const [index, end] of [60, 210, 270, 300, 360, 510, 570, 600].entries()) {
    advance(end, enemies => {
      counts[index] += enemies.length;
      for (const e of enemies) layout.push([e.type, e.x, e.y]);
      enemies.length = 0;
    }, step);
  }
  assert.equal(E.state.level, 2);
  assert.equal(H.state.regular.length, 0);
  return { counts, layout };
}

test('seeded first-ten-minute counts track the phase curve within two spawns', () => {
  // Integrated rates rounded per phase, plus eight eruption enemies and one boss
  // in the second calm. The two-spawn tolerance covers fractional budget carry.
  const expected = [58, 394, 343, 103, 118, 633, 505, 147];
  const runs = new Map();
  for (const seed of [17, 42, 9001]) {
    const run = simulate(seed, 0.25);
    runs.set(seed, run);
    const { counts } = run;
    counts.forEach((count, i) => assert.ok(Math.abs(count - expected[i]) <= 2,
      `seed ${seed}, phase ${i + 1}: ${count} vs ${expected[i]}`));
  }
  const repeat = simulate(42, 0.25);
  assert.deepEqual(repeat, runs.get(42));
  assert.notDeepEqual(repeat.layout, runs.get(17).layout);
});

test('surge warns three active seconds early and its deferred enemies stay capped at an edge', () => {
  const { CC, E, H, cues, advance } = fixture(19);
  const hero = CC.state.player;
  Object.assign(hero, { x: 55, y: 55 });
  const list = CC.Enemies.list;
  const cap = H.TUNING.population.base;
  for (let i = 0; i < cap; i++) list.push({ x: 55, y: 55, r: 6, hp: 10 });
  advance(206.75);
  assert.equal(H.state.surge, null);
  advance(207);
  const { warned, start, angle } = H.state.surge;
  assert.equal(start - warned, 3);
  assert.deepEqual(cues.at(-1), [207, 'thunder']);
  let arrow;
  E.drawHud({
    save() {}, restore() {}, fillRect() {}, fillText() {}, translate() {}, rotate(value) { arrow = value; },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}
  }, 360, 640);
  assert.equal(arrow, angle);
  assert.equal(E.update(4, { paused: true }), false);
  assert.equal(E.state.seconds, 207);
  assert.strictEqual(H.state.surge.start, 210);
  advance(210, enemies => { enemies.length = 0; });
  advance(213, (enemies, time) => {
    assert.ok(enemies.length <= cap);
    if (time < 211) return;
    for (const e of enemies) {
      const bearing = Math.atan2(e.y - hero.y, e.x - hero.x);
      assert.ok(Math.cos(bearing - angle) >= H.TUNING.surge.coneCosine - 1e-9);
    }
  });
  assert.ok(list.length > 0);
  advance(231, enemies => assert.ok(enemies.length <= cap));
  assert.equal(list.length, cap);
  assert.ok(H.state.regular.length > 0);
  const survivor = list.at(-1);
  list[0].dead = true;
  E.update(0.25);
  assert.equal(list.filter(e => !e.dead).length, cap);
  assert.ok(list.includes(survivor));
  for (const e of list.slice(1)) {
    assert.equal(CC.Dungeon.isSolid(e.x, e.y), false);
    assert.ok(Math.hypot(e.x - hero.x, e.y - hero.y) >= H.TUNING.placement.minDistance);
  }
});

test('both nightfalls stage one encounter and scale surviving and new enemies once', () => {
  for (const heroLevel of [1, 77]) {
    const { CC, E, H, cues, advance, lighting } = fixture(52, heroLevel);
    const enemies = CC.Enemies;
    advance(15);
    const existing = enemies.list.find(e => e.type === 'crow');
    enemies.list.splice(0, enemies.list.length, existing);
    Object.assign(existing, { x: 365, y: 360 });
    const baseline = { hp: existing.maxHp, dmg: existing.dmg, spd: existing.spd };
    existing.hp /= 2;
    const holdExisting = list => { list.splice(1); };
    advance(299.75, holdExisting);
    assert.equal(E.state.level, 0);
    assert.equal(existing.maxHp, baseline.hp);
    assert.equal(E.update(40, { inventory: true }), false);
    assert.equal(H.state.nightfall, null);
    for (const [time, level, family, bossIdx, expectedCue] of [
      [300, 1, 'direwolf', 0, /flank/], [600, 2, 'mawworm', 1, /burrowers/]
    ]) {
      advance(time, holdExisting);
      assert.equal(E.state.level, level);
      assert.equal(H.state.nightfall.time, time);
      assert.match(H.state.nightfall.cue, expectedCue);
      assert.equal(lighting().transition.fromLevel, level - 1);
      assert.equal(lighting().transition.progress, 0);
      assert.equal(existing.maxHp, Math.round(baseline.hp * 1.25 ** level));
      assert.equal(existing.hp, existing.maxHp / 2);
      assert.equal(existing.dmg, Math.round(baseline.dmg * 1.15 ** level));
      assert.ok(Math.abs(existing.spd - baseline.spd * 1.06 ** level) < 1e-9);
      assert.equal(existing.cd, H.TUNING.crowFlocks.diveCooldowns[level - 1]);
      const warned = H.state.encounters.find(request => request.kind === 'boss');
      assert.ok(warned.point);
      assert.equal(warned.ready, time + 3);
      advance(time + 0.75);
      assert.ok(!enemies.list.some(e => e.boss));
      advance(time + 1);
      const fresh = enemies.list.find(e => e.type === family);
      assert.ok(fresh);
      const familyBase = enemies.spawn(family, 365, 360, 1);
      enemies.list.pop();
      assert.equal(fresh.maxHp, Math.round(familyBase.maxHp * 1.25 ** level));
      assert.equal(fresh.dmg, Math.round(familyBase.dmg * 1.15 ** level));
      assert.ok(Math.abs(fresh.spd - familyBase.spd * 1.06 ** level) < 1e-9);
      advance(time + 1.5);
      assert.equal(lighting().transition.progress, 0.5);
      advance(time + 3);
      const bosses = enemies.list.filter(e => e.boss);
      assert.equal(bosses.length, 1);
      const [boss] = bosses;
      assert.equal(boss.bossIdx, bossIdx);
      assert.equal(boss.miniBoss, true);
      assert.equal(boss.maxHp, Math.round(386 * 1.25 ** level * (1 + 0.4 * level)));
      assert.ok(!boss.def.p1.includes('summon'));
      assert.ok(!boss.def.p2.includes('summon'));
      assert.strictEqual(enemies.bossBar, boss.bar);
      assert.equal(lighting().transition, undefined);
      advance(time + 4);
      assert.equal(enemies.list.filter(e => e.boss).length, 1);
      assert.equal(existing.maxHp, Math.round(baseline.hp * 1.25 ** level));
      boss.dead = true;
      E.onKill(boss);
      assert.equal(CC.Dungeon.chests.length, level);
      holdExisting(enemies.list);
      assert.equal(cues.filter(([second]) => second === time).length, 1);
    }
  }
});

test('warning markers and announced spawns wait for slots, then cleanup and retry clear all state', () => {
  const { CC, E, H, originalState, campaignMap, originalEnemies, originalPileChance, advance } = fixture(7);
  const hero = CC.state.player;
  Object.assign(hero, { x: 55, y: 55 });
  const nextCap = 102;
  for (let i = 0; i < nextCap; i++) CC.Enemies.list.push({ x: 55, y: 55, r: 6, hp: 10 });
  advance(304);
  assert.ok(H.state.regular.length);
  assert.equal(H.state.encounters.length, H.TUNING.encounter.size + 1);
  assert.ok(H.state.encounters.every(e => e.point));
  assert.ok(!CC.Enemies.list.some(e => e.boss));
  CC.Enemies.list.pop();
  E.update(0.25);
  assert.equal(CC.Enemies.list.length, nextCap);
  assert.equal(CC.Enemies.list.filter(e => e.boss).length, 1);
  assert.ok(!H.state.encounters.some(e => e.kind === 'boss'));
  const oldMap = CC.Dungeon;
  assert.equal(E.end(), true);
  assert.equal(H.state, null);
  assert.strictEqual(CC.Enemies.list, originalEnemies);
  assert.strictEqual(CC.Enemies.pileChance, originalPileChance);
  assert.equal(E.retry(), true);
  assert.equal(E.state.seconds, 0);
  assert.equal(E.state.level, 0);
  assert.deepEqual(
    [H.state.regular.length, H.state.encounters.length, H.state.surge, H.state.nightfall, CC.Enemies.list.length],
    [0, 0, null, null, 0]
  );
  assert.notStrictEqual(CC.Dungeon, oldMap);
  assert.equal(E.exit(), true);
  assert.strictEqual(CC.state, originalState);
  assert.strictEqual(CC.Dungeon, campaignMap);
});

test('visual darkness stops at six while health and damage keep rising', () => {
  const { CC, E, advance, lighting } = fixture(73);
  advance(15);
  const old = CC.Enemies.list[0];
  CC.Enemies.list.splice(1);
  // Saturate the fixture while advancing the clock. This isolates the existing
  // enemy's stat updates from thousands of additional placement attempts.
  for (let i = 1; i < 160; i++) CC.Enemies.list.push({ x: 494, y: 360, r: 6, hp: 10 });
  advance(1803, undefined, 10);
  const light = lighting();
  const { maxHp, dmg, spd } = old;
  assert.equal(light.level, 6);
  assert.equal(light.levels[6], 0.25);
  assert.equal(light.radius, 150);
  advance(2100, undefined, 10);
  assert.equal(E.state.level, 7);
  assert.deepEqual(lighting(), light);
  assert.ok(old.maxHp > maxHp && old.dmg > dmg);
  assert.equal(old.spd, spd);
});

test('a host budgets for both living heroes and rejects placement too close to either', () => {
  const { CC, H, guest, advance } = fixture(81, 1, 'host');
  const baseCrow = CC.Enemies.spawn('crow', 365, 360, 1, { awake: true });
  CC.Enemies.list.length = 0;
  advance(60);
  assert.ok(CC.Enemies.list.length >= 94 && CC.Enemies.list.length <= 99);
  const crow = CC.Enemies.list.find(e => e.type === 'crow');
  assert.equal(crow.maxHp, Math.round(baseCrow.maxHp * 1.25));
  for (const e of CC.Enemies.list) {
    assert.ok(Math.hypot(e.x - guest.x, e.y - guest.y) >= H.TUNING.placement.minDistance);
  }
});
