import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function boot() {
  const world = { performance, console };
  const texts = [], drops = [], saves = [];
  world.window = world;
  new Function('window', read('realm.js'))(world);
  const CC = world.CC = world.CC || {};
  const player = { x: 0, y: 0, hp: 100, maxHp: 100, equipment: {} };
  const list = [];
  CC.state = { area: 'cinderwake', floor: 3, mode: 'dungeon', player };
  CC.fx = { text: (x, y, s) => texts.push(s), shake() {}, burst() {} };
  CC.Audio = { event() {}, fx() {} };
  CC.SaveGame = { save: () => saves.push(1) };
  CC.Loot = { drops, _spawn: (kind, x, y, extra) => ({ kind, x, y, ...extra }) };
  CC.Enemies = {
    list, boss: null, damage(e, amount) { e.hp -= amount; if (e.hp <= 0) this._kill(e); return amount; },
    _kill(e) { e.dead = true; e.hp = 0; }, update() {}, spawn(type, x, y) { const e = { type, x, y, hp: 20, maxHp: 20 }; list.push(e); return e; },
    spawnForFloor(floor, points) { list.length = 0; for (const pt of points) list.push({ type: pt.type, x: pt.x, y: pt.y, hp: 50, maxHp: 50 }); return list; }
  };
  const said = [];
  new Function('window', read('cinderwake.js'))(world);
  CC.Cinderwake.say = (name, text) => said.push({ name, text });
  new Function('window', read('cinderwake_story.js'))(world);
  return { CC, world, player, list, texts, drops, said, saves };
}

function load(env, floor) {
  const map = env.CC.Cinderwake.generate(floor, 7);
  Object.assign(env.CC.state, { area: 'cinderwake', floor, map });
  env.CC.Dungeon = map;
  env.CC.Enemies.spawnForFloor(floor, map.enemySpawns);
  return map;
}

test('every secret, lore pickup and extra chest is on a reachable tile of its floor', () => {
  const env = boot();
  for (const floor of [1, 2, 3]) {
    for (const seed of [1, 7, 19, 33]) {
      const map = env.CC.Cinderwake.generate(floor, seed);
      const points = [...map.secrets, ...map.lore, ...map.chests, ...map.secrets.map(s => s.chest)];
      for (const point of points) assert.equal(map.isSolidTile(Math.floor(point.x / 32), Math.floor(point.y / 32)), false, floor + '/' + seed);
    }
  }
  assert.deepEqual(env.CC.Cinderwake.generate(1, 1).secrets.map(s => s.id), ['brazier']);
  assert.deepEqual(env.CC.Cinderwake.generate(2, 1).secrets.map(s => s.id), ['candle']);
  assert.deepEqual(env.CC.Cinderwake.generate(3, 1).secrets.map(s => s.id), ['ash']);
  assert.equal(env.CC.Cinderwake.generate(2, 1).chests.map(c => c.tier).sort().join(), '1,2,2');
});

test('the glass stair appears only once BOTH vault chests are opened, and the state survives a save', () => {
  const env = boot(), S = env.CC.CinderwakeStory;
  const cellar = { vaultChests: [{ opened: false }, { opened: false }], glass: { x: 100, y: 100 } };
  env.CC.state.area = 'village-cellar';
  env.player.x = 100; env.player.y = 100;
  assert.equal(S.revealed(cellar), false);
  cellar.vaultChests[0].opened = true;
  assert.equal(S.revealed(cellar), false, 'one chest is not enough');
  assert.equal(S.nearGlass(cellar), false);
  cellar.vaultChests[1].opened = true;
  assert.equal(S.nearGlass(cellar), true);
  const saved = S.serialize();
  S.reset();
  assert.equal(S.isOpen(), false);
  S.restore(JSON.parse(JSON.stringify(saved)));
  assert.equal(S.isOpen(), true);
});

test('the brazier and the candle open secret chests; the candle wakes a Candlewraith; the bell and pages are readable', () => {
  const env = boot(), S = env.CC.CinderwakeStory;
  let map = load(env, 1);
  env.player.x = map.bell.x; env.player.y = map.bell.y;
  assert.equal(S.interact(), true);
  assert.match(env.said.at(-1).text, /warm to the touch/);
  const before = map.chests.length, brazier = map.secrets[0];
  env.player.x = brazier.x; env.player.y = brazier.y;
  assert.equal(S.nearAction(), true);
  assert.equal(S.interact(), true);
  assert.equal(brazier.done, true);
  assert.equal(map.chests.length, before + 1);
  assert.equal(map.chests.at(-1).tier, 2);
  assert.equal(S.interact(), false, 'it only works once');
  const page = map.lore[0];
  env.player.x = page.x; env.player.y = page.y;
  assert.equal(S.interact(), true);
  assert.deepEqual(S.lore().map(l => l.id), ['page']);

  map = load(env, 2);
  const candle = map.secrets[0], foes = env.list.length;
  env.player.x = candle.x; env.player.y = candle.y;
  S.interact();
  assert.equal(env.list.length, foes + 1);
  assert.equal(env.list.at(-1).type, 'candlewraith');
  assert.equal(map.chests.at(-1).tier, 3);
});

test('floor 3: the reward chest is held back, the boss gets a bar, the Ash Door needs a cleared room, and his death pays out', () => {
  const env = boot(), S = env.CC.CinderwakeStory, E = env.CC.Enemies;
  const map = load(env, 3);
  assert.ok(map.reward && !map.chests.includes(map.reward), 'the reward chest waits for the boss');
  const keeper = E.list.find(e => e.type === 'hearthkeeper');
  assert.ok(keeper);
  S.update(0.016);
  assert.equal(E.boss, keeper);
  assert.equal(keeper.bar.name, 'The Hearthkeeper');
  const ash = map.secrets[0];
  env.player.x = ash.x; env.player.y = ash.y;
  S.interact();
  assert.equal(ash.done, false, 'foes still stand: the door stays shut');
  E.list.filter(e => e !== keeper).forEach(e => E._kill(e));
  S.interact();
  assert.equal(ash.done, true);
  assert.equal(map.chests.at(-1).tier, 3);

  E.damage(keeper, 9999, 'slash');
  assert.equal(S.isDone(), true);
  assert.ok(map.chests.includes(map.reward));
  assert.equal(env.drops.filter(d => d.item.name === 'Heartcoal').length, 1);
  assert.ok(map.freed && map.sealed && map.cwDone);
  assert.ok(env.texts.some(t => /UNPAID DEBT/.test(t)));
  assert.ok(S.lore().some(l => l.id === 'vane'));
  assert.deepEqual(S.verrin().length, 2);
  // reloading the floor: no second boss
  const again = env.CC.Cinderwake.generate(3, 7);
  Object.assign(env.CC.state, { map: again });
  E.spawnForFloor(3, again.enemySpawns);
  assert.equal(E.list.some(e => e.type === 'hearthkeeper'), false);
});

test('the Heartcoal boosts fire damage and heals only while standing still', () => {
  const env = boot(), S = env.CC.CinderwakeStory, E = env.CC.Enemies;
  load(env, 1);
  const item = S.heartcoal();
  assert.equal(item.name, 'Heartcoal');
  assert.equal(item.slot, 'trinket');
  assert.equal(item.legendary, true);
  const foe = { type: 'sootwretch', hp: 1000, maxHp: 1000, x: 0, y: 0 };
  E.damage(foe, 100, 'fire');
  assert.equal(foe.hp, 900);
  env.player.equipment.trinket = item;
  E.damage(foe, 100, 'fire');
  assert.ok(Math.abs(foe.hp - (900 - 112)) < 1e-9);
  env.player.hp = 50;
  S.update(0.016); S.update(1);
  assert.ok(env.player.hp > 50, 'heals while still');
  const hp = env.player.hp;
  env.player.x += 40; S.update(0.016);
  assert.equal(env.player.hp, hp, 'no healing while moving');
});

test('the shell is wired: scripts, area hooks, quest, music, save and the vault stair', () => {
  const html = read('index.html'), main = read('main.js');
  for (const file of ['cinderwake.js', 'cinderwake_monsters.js', 'cinderwake_story.js']) assert.match(html, new RegExp('<script src="' + file + '"></script>'));
  assert.ok(html.indexOf('cinderwake_story.js') < html.indexOf('main.js'));
  assert.match(main, /CC\.enterCinderwake/);
  assert.match(main, /CC\.leaveCinderwake/);
  assert.match(main, /s\.area === 'cinderwake'/);
  assert.match(read('village.js'), /map\.glass = glass/);
  assert.match(read('questnav.js'), /THE UNPAID DEBT/);
  assert.match(read('audio.js'), /cinderwake/);
  assert.match(read('save_game.js'), /CinderwakeStory/);
});

test('the furnace door to the Emberdeep stands on reachable floor, and using it enters the Emberdeep', () => {
  for (const seed of [1, 5, 7, 12, 19, 33]) {
    const env = boot(), S = env.CC.CinderwakeStory, E = env.CC.Enemies;
    const map = env.CC.Cinderwake.generate(3, seed);
    Object.assign(env.CC.state, { area: 'cinderwake', floor: 3, map });
    env.CC.Dungeon = map;
    E.spawnForFloor(3, map.enemySpawns);
    const keeper = E.list.find(e => e.type === 'hearthkeeper');
    E.damage(keeper, 99999, 'slash');
    assert.ok(map.sealed, 'the sealed stair exists once he has fallen');
    const T = 32, tile = p => [Math.floor(p.x / T), Math.floor(p.y / T)];
    assert.equal(map.isSolidTile(...tile(map.sealed)), false, 'seed ' + seed + ': the door is not inside a wall');
    const seen = new Set([tile(map.spawn).join(',')]), q = [tile(map.spawn)];
    for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (seen.has(k) || map.isSolidTile(x + dx, y + dy)) continue; seen.add(k); q.push([x + dx, y + dy]); } }
    assert.ok(seen.has(tile(map.sealed).join(',')), 'reachable from the start');
    let entered = 0;
    env.CC.Emberdeep = { enter() { entered++; return true; }, setCursed() {} };
    env.player.x = map.sealed.x + 20; env.player.y = map.sealed.y;
    assert.equal(S.nearAction(), true);
    assert.equal(S.interact(), true);
    assert.equal(entered, 1, 'the door opens onto the Emberdeep');
  }
});
