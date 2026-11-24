import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function fixture() {
  const storage = new Map();
  const sandbox = vm.createContext({
    console,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    }
  });
  sandbox.window = sandbox;
  function load(file) {
    vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), sandbox, { filename: file });
  }
  for (const file of ['classes.js', 'save_game.js', 'settings.js', 'endless.js']) load(file);
  const { CC } = sandbox;
  const originalMap = { campaign: true };
  CC.state = { mode: 'title', map: originalMap, inventory: [] };
  CC.Dungeon = originalMap;
  CC.CaveDungeon = { campaign: true };
  CC.Enemies = { list: [{ campaign: true }], projectiles: [], zones: [], remains: [], gore: [], piles: [] };
  CC.Loot = { drops: [{ campaign: true }] };
  CC.UI = { open: false, isOpen() { return this.open; } };
  CC.closeEndlessOverlays = () => {
    CC.UI.open = false;
    CC.Classes.clear();
  };
  let updates = 0;
  let cleanups = 0;
  let kills = 0;
  let depth = 1;
  const queue = [];
  const director = {
    start(ctx) {
      depth = 1;
      assert.equal(queue.length, 0);
      ctx.setMap({ chests: [], spawn: { x: 24, y: 40 }, stairs: { x: 24, y: 40 } }, 'cave');
    },
    update() { updates++; },
    depth() { return { floor: depth }; },
    stairs() { depth++; return true; },
    kill() { kills++; },
    cleanup() { queue.length = 0; cleanups++; }
  };
  CC.Endless.registerDirector('catacombs', director);
  return {
    CC, sandbox, storage, originalMap, queue, director, load,
    counts: () => ({ updates, cleanups, kills })
  };
}

const fresh = { mode: 'catacombs', classId: 'wizard' };
const plain = value => JSON.parse(JSON.stringify(value));

test('active play advances the clock and excluded screens leave it unchanged', () => {
  const { CC, counts } = fixture();
  const E = CC.Endless;
  assert.equal(E.start(fresh), true);
  E.update(1.25);
  for (const flag of ['paused', 'inventory', 'perk', 'chest', 'transition', 'disconnect']) {
    assert.equal(E.update(9, { [flag]: true }), false, flag);
    assert.equal(E.state.seconds, 1.25, flag);
  }
  CC.UI.open = true;
  assert.equal(E.update(9), false);
  CC.UI.open = false;
  CC.state.player.perkOpen = true;
  assert.equal(E.update(9), false);
  CC.state.player.perkOpen = false;
  for (const overlay of ['chest choice', 'blocking transition']) {
    E.block(overlay);
    assert.equal(E.update(9), false, overlay);
    E.block(overlay, false);
  }
  assert.equal(E.update(0.75), true);
  assert.equal(E.state.seconds, 2);
  assert.equal(counts().updates, 2);
  assert.equal(E.formatTime(3661), '1:01:01');
  E.end();
  assert.equal(E.retry(), true);
  assert.equal(E.state.seconds, 0);
  assert.equal(E.formatTime(E.state.seconds), '00:00');
});

test('saved hero progress, equipment and campaign storage are isolated until reward delivery', () => {
  const { CC, storage, originalMap, queue, counts } = fixture();
  const S = CC.SaveGame;
  const E = CC.Endless;
  const previous = CC.state;
  const cave = CC.CaveDungeon;
  const originalEnemies = CC.Enemies.list;
  const originalDrops = CC.Loot.drops;
  const hero = CC.Classes.create('wizard');
  hero.level = 13;
  hero.xp = 35;
  hero.equipment.weapon = { name: 'Campaign wand', stats: { dmg: 7 } };
  CC.Classes.applyItemStats(hero);
  Object.assign(previous, {
    mode: 'dungeon', area: 'forest', player: hero, classId: 'wizard', charName: 'Mira',
    gold: 38, potions: 4, manaPotions: 3, inventory: [{ name: 'Campaign charm' }]
  });
  const slot = S.newGame().n;
  assert.equal(S.save(), true);
  const key = 'emberdeep.save.v3.slot' + slot;
  const baseline = storage.get(key);
  const character = plain(S.characterSnapshot(previous));
  let finalized = 0;
  E.setRewardAdapter({
    finalize(result, destination) {
      finalized++;
      assert.equal(result.mode, 'catacombs');
      assert.equal(result.elapsedSeconds, 7.25);
      assert.equal(result.floor, 2);
      assert.equal(result.reason, 'death');
      assert.deepEqual(plain(result.character), { id: 'slot:1', slot, name: 'Mira', classId: 'wizard', level: 13 });
      assert.deepEqual(plain(S.characterSnapshot(CC.state)), character);
      assert.equal(CC.state.map, null);
      assert.equal(CC.Enemies.list, originalEnemies);
      assert.equal(CC.Loot.drops, originalDrops);
      assert.equal(storage.get(key), baseline);
      assert.equal(destination.deliver(data => { data.gold += 10; }).ok, true);
      return { personalBest: true };
    }
  });
  assert.equal(E.start({ mode: 'catacombs', slot }), true);
  assert.equal(CC.state.player.level, 13);
  assert.equal(CC.state.player.stats.dmg, hero.stats.dmg);
  assert.equal(CC.state.player.equipment.weapon.name, 'Campaign wand');
  assert.equal(CC.state.potions, 4);
  CC.state.player.level = 99;
  CC.state.player.equipment.weapon.stats.dmg = 999;
  CC.state.inventory.push({ name: 'Run drop' });
  CC.state.gold = 300;
  CC.state.potions = 19;
  CC.state.coopSlot = slot;
  assert.equal(S.save(), false);
  assert.equal(S.saveCharacter(), false);
  assert.equal(storage.get(key), baseline);
  assert.equal(E.interact(), true);
  E.update(7.25);
  E.onHit(42);
  E.onKill({});
  CC.Enemies.list.push({ hp: 1 });
  CC.Enemies.projectiles.push({});
  CC.Classes.projectiles.push({});
  CC.Loot.drops.push({});
  queue.push('pending spawn');
  CC.UI.open = true;
  CC.state.player.hp = 0;
  E.checkDeath();
  assert.equal(E.end(), false);
  assert.equal(finalized, 1);
  assert.equal(counts().kills, 1);
  assert.equal(counts().cleanups, 1);
  assert.equal(E.state.result.kills, 1);
  assert.equal(E.state.result.biggestHit, 42);
  assert.equal(queue.length, 0);
  assert.equal(CC.Classes.projectiles.length, 0);
  assert.equal(CC.UI.open, false);
  assert.equal(CC.Dungeon, originalMap);
  assert.equal(CC.CaveDungeon, cave);
  assert.equal(S.slotData(slot).player.level, 13);
  assert.equal(S.slotData(slot).gold, character.gold + 10);
  assert.equal(E.exit(), true);
  assert.equal(CC.state, previous);
  assert.equal(CC.state.player.equipment.weapon.stats.dmg, 7);
  assert.equal(S.save(), true);
});

test('fresh class starts with its starter kit and retire requires confirmation', () => {
  const { CC, storage, queue, counts } = fixture();
  const E = CC.Endless;
  assert.equal(E.start(fresh), true);
  assert.equal(CC.state.player.classId, 'wizard');
  assert.equal(CC.state.player.level, 1);
  assert.equal(CC.state.potions, 2);
  assert.equal(CC.state.manaPotions, 1);
  assert.equal(storage.size, 0);
  CC.state.player.level = 6;
  E.update(3);
  E.retire();
  assert.equal(E.update(8), false);
  assert.equal(E.retire(false), true);
  assert.equal(E.state.phase, 'playing');
  E.retire();
  assert.equal(E.retire(true), true);
  assert.equal(E.state.result.reason, 'retire');
  assert.equal(E.state.result.seconds, 3);
  assert.equal(E.state.result.character.level, 1);
  assert.equal(CC.state.player.level, 1);
  assert.equal(storage.size, 0);
  assert.equal(E.retry(), true);
  queue.push('pending');
  assert.equal(E.exit(), true);
  assert.equal(queue.length, 0);
  assert.equal(counts().cleanups, 2);
  assert.equal(E.state, null);
  assert.equal(CC.state.mode, 'title');
});

test('a fresh reward persists only the restored hero and committed reward', () => {
  const { CC } = fixture();
  const E = CC.Endless;
  const S = CC.SaveGame;
  const saved = S.createCharacter('thief', 'Existing Hero');
  E.setRewardAdapter({
    finalize(result, destination) {
      assert.equal(result.character.slot, 0);
      assert.equal(destination.read().player.level, 1);
      assert.equal(destination.deliver(() => false).ok, false);
      assert.equal(S.count(), 1);
      assert.equal(destination.deliver(data => { data.inventory.push({ name: 'Reward' }); }).slot, 2);
      assert.equal(destination.deliver(data => { data.gold += 2; }).slot, 2);
    }
  });
  assert.equal(E.start(fresh), true);
  CC.state.player.level = 10;
  CC.state.inventory.push({ name: 'Run-only item' });
  assert.equal(E.end(), true);
  assert.equal(S.count(), 2);
  assert.equal(S.slotData(saved).charName, 'Existing Hero');
  assert.equal(S.slotData(2).player.level, 1);
  assert.deepEqual(plain(S.slotData(2).inventory), [{ name: 'Reward' }]);
  assert.equal(S.slotData(2).gold, 2);
});

test('the selector starts a stub director and renders the HUD, confirmation and summary', () => {
  const { CC } = fixture();
  const E = CC.Endless;
  const labels = [];
  const buttons = new Map();
  const ctx = { fillText: text => labels.push(text), fillRect() {}, save() {}, restore() {} };
  const button = (x, y, w, h, label, color, callback) => { buttons.set(label, callback); };
  E.openSelector();
  E.drawSelector(ctx, 360, 640, button, () => {});
  assert.ok(labels.includes('No runs recorded'));
  buttons.get('Catacombs Exploration')();
  E.drawSelector(ctx, 360, 640, button, () => {});
  assert.ok(labels.includes('Swordsman · Lv 1'));
  buttons.get('START')();
  E.update(60);
  E.onKill({});
  E.drawHud(ctx, 360, 640, button);
  assert.ok(labels.includes('01:00'));
  assert.ok(labels.includes('FLOOR 1  •  Kills 1'));
  E.retire();
  assert.equal(E.drawRetire(ctx, 360, 640, button), true);
  buttons.get('Retire')();
  E.drawSummary(ctx, 360, 640, button);
  assert.ok(labels.includes('RUN SUMMARY'));
  assert.ok(labels.includes('01:00  •  FLOOR 1  •  Kills 1'));
  buttons.get('Exit')();
  assert.equal(CC.state.mode, 'title');
});

test('host death waits for every hero, and the guest displays authoritative progress', () => {
  const { CC, counts } = fixture();
  const E = CC.Endless;
  const partner = { hp: 10 };
  let disconnected = false;
  const events = [];
  E.setNetworkAdapter({
    heroes: () => [partner],
    blocked: () => disconnected,
    send: (type, data) => events.push([type, data])
  });
  E.start({ ...fresh, role: 'host' });
  disconnected = true;
  assert.equal(E.update(4), false);
  disconnected = false;
  assert.equal(E.update(2), true);
  CC.state.player.hp = 0;
  E.checkDeath();
  assert.equal(E.livingHeroes().length, 1);
  CC.state.player.hp = 5;
  partner.hp = 0;
  E.checkDeath();
  assert.equal(E.active(), true);
  CC.state.player.hp = 0;
  E.checkDeath();
  assert.equal(E.state.phase, 'summary');
  assert.deepEqual(events.map(event => event[0]), ['started', 'ended']);
  E.exit();

  E.start({ ...fresh, role: 'guest', runId: 'room-run' });
  assert.equal(E.update(10), true);
  assert.equal(E.state.seconds, 0);
  assert.equal(counts().updates, 1);
  assert.equal(E.sync({ id: 'other-run', mode: 'catacombs', seconds: 500 }), false);
  const progress = { id: 'room-run', mode: 'catacombs', seconds: 12, floor: 4, kills: 7 };
  assert.equal(E.sync(progress), true);
  assert.equal(E.state.seconds, 12);
  assert.equal(E.state.floor, 4);
  assert.equal(E.finishGuest(progress, 'death'), true);
  assert.equal(E.state.result.kills, 7);
});

test('the game page loads Endless Survival and its rewards before the browser shell', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const entryScripts = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), match => match[1]);
  const required = ['endless.js', 'endless_rewards.js', 'hordes.js', 'main.js'];
  assert.deepEqual(entryScripts.filter(file => required.includes(file)), required);
});

test('the browser shell routes title clicks and pauses Endless simulation', () => {
  const { CC, sandbox, load } = fixture();
  const texts = new Map();
  const handlers = {};
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({
    fillText(text, x, y) { texts.set(text, { x, y }); },
    measureText: text => ({ width: text.length * 6 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient
  }, { get: (target, name) => target[name] ?? noop });
  const canvas = {
    getContext: () => ctx,
    addEventListener: (type, handler) => { handlers[type] = handler; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }),
    setPointerCapture: noop,
    releasePointerCapture: noop
  };
  let frame;
  let now = 0;
  const errors = [];
  Object.assign(sandbox, {
    console: { warn: (...args) => errors.push(args), error: (...args) => errors.push(args) },
    document: { getElementById: () => canvas, addEventListener: noop },
    requestAnimationFrame: callback => { frame = callback; },
    addEventListener: noop,
    performance: { now: () => now },
    navigator: {},
    innerWidth: 360,
    innerHeight: 640
  });
  function tick() {
    frame(now += 100);
  }
  function click(label) {
    const point = texts.get(label);
    assert.ok(point, 'Canvas button ' + label);
    const input = { clientX: point.x, clientY: point.y, pointerId: 1, pointerType: 'mouse', button: 0, preventDefault: noop };
    handlers.pointerdown(input);
    handlers.pointerup(input);
    texts.clear();
    tick();
  }
  let worldSteps = 0;
  CC.Classes.update = () => { worldSteps++; };
  load('main.js');
  tick();
  tick();
  click('ENDLESS');
  click('Catacombs Exploration');
  click('START');
  const E = CC.Endless;
  assert.equal(E.active(), true);
  assert.ok(worldSteps > 0);
  const before = E.state.seconds;
  const beforeSteps = worldSteps;
  CC.setPaused(true);
  tick();
  CC.setPaused(false);
  CC.UI.open = true;
  tick();
  CC.UI.open = false;
  CC.state.player.perkOpen = true;
  tick();
  CC.state.player.perkOpen = false;
  E.block('chest');
  tick();
  E.block('chest', false);
  E.block('transition');
  tick();
  E.block('transition', false);
  assert.equal(E.state.seconds, before);
  assert.equal(worldSteps, beforeSteps);
  tick();
  assert.ok(E.state.seconds > before);
  CC.killPlayer();
  tick();
  assert.ok(texts.has('RUN SUMMARY'));
  assert.deepEqual(errors, []);
});

test('reduce darkness caps the sampled lighting level', () => {
  const { CC } = fixture();
  const levels = [1, 0.85, 0.7, 0.55, 0.42, 0.32];
  assert.equal(CC.Endless.ambient(levels, 20), 0.32);
  CC.Settings.set('reduceDarkness', true);
  assert.equal(CC.Endless.ambient(levels, 20), 0.55);
  assert.equal(CC.Endless.ambient(levels, 2), 0.7);
});
