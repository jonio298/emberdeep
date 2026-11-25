import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function fixture(seed, heroLevel = 1, role = 'solo', powerRoll) {
  const sandbox = vm.createContext({ console });
  sandbox.window = sandbox;
  const load = file => vm.runInContext(
    readFileSync(new URL('../' + file, import.meta.url), 'utf8'), sandbox, { filename: file }
  );
  for (const file of ['classes.js', 'save_game.js', 'enemies.js', 'plains.js', 'wounds.js', 'endless.js']) load(file);
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
  load('plains_powerups.js');
  if (powerRoll !== undefined) {
    const create = CC.PlainsPowerups.create;
    CC.PlainsPowerups.create = (run, map, _random, clearPath) => create(run, map, () => powerRoll, clearPath);
  }
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
  return { CC, E, H, sandbox, seeds, cues, originalState, campaignMap, originalEnemies, originalPileChance,
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
  // Integrated rates rounded per phase, plus seven eruption enemies and one boss
  // in the second calm. The two-spawn tolerance covers fractional budget carry.
  const expected = [49, 335, 292, 88, 101, 538, 429, 125];
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

function pickupFixture(index) {
  const run = fixture(42, 1, 'solo', index / 6);
  const { CC, E, H } = run;
  const hero = CC.state.player;
  const drop = () => {
    for (let i = 0; i < 21; i++) H.state.powerups.onKill(hero);
    E.update(0.05);
  };
  const target = (type = 'direwolf', x = hero.x - 55, y = hero.y) => {
    const enemy = CC.Enemies.spawn(type, x, y, 1, { awake: true, bossIdx: 0 });
    enemy.hp = enemy.maxHp = 500;
    return enemy;
  };
  return { ...run, hero, drop, target };
}

test('Plains pickups double damage and XP and shield incoming hits until their timers expire', () => {
  const attack = pickupFixture(4);
  const enemy = attack.target();
  const before = attack.CC.Enemies.damage(enemy, 10, 'arcane');
  attack.drop();
  assert.equal(attack.CC.Enemies.damage(enemy, 10, 'arcane'), before * 2);
  attack.advance(12.25);
  assert.equal(attack.CC.Enemies.damage(enemy, 10, 'arcane'), before);

  const level = pickupFixture(3);
  const startXp = level.hero.xp;
  level.CC.Classes.gainXp(1);
  const earned = level.hero.xp - startXp;
  level.drop();
  level.CC.Classes.gainXp(1);
  assert.equal(level.hero.xp - startXp, earned * 3);
  level.E.end();
  assert.equal(level.H.powerupActive('xp', level.hero), false);

  const guard = pickupFixture(1);
  guard.hero._poison = { t: 3 };
  guard.hero.wound = { t: 3 };
  guard.drop();
  assert.equal(guard.hero._poison, null);
  assert.equal(guard.hero.wound, null);
  const hp = guard.hero.hp;
  assert.equal(guard.CC.Classes.damage(guard.hero, 10), 0);
  guard.CC.Enemies._blast(guard.hero.x, guard.hero.y, 20, 10);
  assert.equal(guard.hero.hp, hp);
  guard.advance(8.25);
  guard.CC.Enemies._blast(guard.hero.x, guard.hero.y, 20, 10);
  assert.ok(guard.hero.hp < hp);
});

test('Rapid Fire is the Town Defense effect (faster piercing basic attacks) and Guardian fires and casts frost', () => {
  const rapid = pickupFixture(0);
  rapid.hero.pw = undefined;
  rapid.drop();
  assert.equal(rapid.H.powerupActive('rapid', rapid.hero), true);
  assert.ok(rapid.hero.pw && rapid.hero.pw.rapid > 11, 'the shared power-up state classes.js reads is set to 12 s');
  rapid.hero.cd.attack = 1;
  const t0 = rapid.E.state.seconds;
  rapid.advance(t0 + 0.25, undefined, 0.025);
  assert.ok(rapid.hero.cd.attack < 1 - 0.25 * 1.6 * 0.9, 'the attack cooldown drains 1.6x faster');
  rapid.advance(13, undefined, 0.025);
  assert.equal(rapid.hero.pw.rapid, 0, 'it ends and leaves nothing behind');

  const ally = pickupFixture(5);
  const primary = ally.target();
  const secondary = ally.target('direwolf', primary.x - 15, primary.y + 10);
  ally.drop();
  assert.equal(primary.slow, 2);
  assert.equal(secondary.slow, 2);
  const afterSpell = primary.hp;
  ally.advance(1.20);
  assert.ok(primary.hp < afterSpell);
});

test('director-spawned enemies drop a power-up that can be collected by walking over it', () => {
  const { CC, E, H, advance } = fixture(42, 1, 'solo', 0.5);
  const hero = CC.state.player;
  CC.addKill = enemy => E.onKill(enemy);
  advance(25, enemies => {
    for (const enemy of enemies) {
      enemy.x = hero.x + 36;
      enemy.y = hero.y;
      CC.Enemies.damage(enemy, enemy.hp * 2, 'arcane');
    }
    enemies.length = 0;
  });
  assert.ok(E.state.kills >= 16);
  assert.equal(H.powerupActive('xp', hero), false);
  hero.x += 36;
  E.update(0.05);
  assert.equal(H.powerupActive('xp', hero), true);
});

test('Bomb kills every live monster including an invulnerable boss and clears enemy hazards', () => {
  const { CC, E, drop, target } = pickupFixture(2);
  const normal = target();
  const boss = target('boss');
  boss.invuln = 10;
  const skeleton = target('skeleton');
  skeleton.collapsed = true;
  CC.addKill = enemy => E.onKill(enemy);
  CC.Enemies.projectiles.push({ hostile: true });
  CC.Enemies.zones.push({});
  drop();
  assert.ok([normal, boss, skeleton].every(enemy => enemy.dead && enemy.hp === 0));
  assert.equal(E.state.kills, 3);
  assert.equal(CC.Enemies.projectiles.length, 0);
  assert.equal(CC.Enemies.zones.length, 0);
});

test('crow and raven hits can blind in the campaign but not in Plains Survival', () => {
  const { CC, E, sandbox } = fixture(73);
  vm.runInContext('Math.random = () => 0', sandbox);
  CC.Audio.fx = () => {};
  const hero = CC.state.player;
  const birds = [{ type: 'crow', x: 0, y: 0 }, { type: 'raven', x: 0, y: 0 }];
  for (const bird of birds) {
    hero.blindT = 0;
    CC.Wounds.onHit(hero, bird, 5);
    assert.equal(hero.blindT, 0);
  }
  E.end();
  E.exit();
  CC.state.player = hero;
  for (const bird of birds) {
    hero.blindT = 0;
    CC.Wounds.onHit(hero, bird, 5);
    assert.equal(hero.blindT, 1.5);
  }
});

test('surge warns three active seconds early and its deferred enemies stay capped at an edge', () => {
  const { CC, E, H, cues, advance } = fixture(19);
  const hero = CC.state.player;
  Object.assign(hero, { x: 55, y: 55 });
  const list = CC.Enemies.list;
  const cap = 77;
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
    const baseCrow = enemies.spawn('crow', 365, 360, 1, { awake: true });
    assert.equal(existing.dmg, baseCrow.dmg * 1.15);
    enemies.list.splice(0, enemies.list.length, existing);
    Object.assign(existing, { x: 365, y: 360 });
    const baseline = { hp: existing.maxHp, dmg: baseCrow.dmg, spd: existing.spd };
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
      assert.equal(existing.dmg, Math.round(baseline.dmg * 1.15 ** level) * 1.15);
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
      assert.equal(fresh.dmg, Math.round(familyBase.dmg * 1.15 ** level) * 1.15);
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
  const nextCap = 87;
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
  assert.ok(CC.Enemies.list.length >= 81 && CC.Enemies.list.length <= 85);
  const crow = CC.Enemies.list.find(e => e.type === 'crow');
  assert.equal(crow.maxHp, Math.round(baseCrow.maxHp * 1.25));
  for (const e of CC.Enemies.list) {
    assert.ok(Math.hypot(e.x - guest.x, e.y - guest.y) >= H.TUNING.placement.minDistance);
  }
});
