import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function boot() {
  const world = { console };
  world.window = world;
  new Function('window', readFileSync(new URL('../loot.js', import.meta.url), 'utf8'))(world);
  const CC = world.CC;
  const player = { classId: 'wizard', equipment: {}, stats: {} };
  CC.state = { player, inventory: [], gold: 0 };
  return { CC, player, L: CC.Loot, state: CC.state };
}

const item = (CC, slot, stats, extra = {}) => CC.Loot.hydrate({ uid: Math.random(), name: extra.name || slot + JSON.stringify(stats), slot, rarity: 1, color: '#fff', stats, effect: null, value: extra.value ?? 10, classReq: null, ...extra });
function fill(env, n = 40) { while (env.state.inventory.length < n) env.state.inventory.push(item(env.CC, 'ring', { dmg: 0.1 }, { name: 'junk ring ' + env.state.inventory.length, value: 3 })); }

test('a full pack does not just sell the pickup: a better item replaces the weakest item of its kind', () => {
  const env = boot(), { CC, state, L } = env;
  const weak = item(CC, 'weapon', { dmg: 1 }, { name: 'Weak Sword', value: 7 }), mid = item(CC, 'weapon', { dmg: 3 }, { name: 'Mid Sword', value: 20 });
  state.inventory.push(mid, weak);
  fill(env);
  assert.equal(state.inventory.length, 40);
  const great = item(CC, 'weapon', { dmg: 6 }, { name: 'Great Sword', value: 60 });
  const r = L.stash(great, env.player);
  assert.equal(r.action, 'swapped');
  assert.equal(r.sold, weak, 'the lowest quality item it beats is the one sold');
  assert.equal(state.gold, 7);
  assert.ok(state.inventory.includes(great) && state.inventory.includes(mid) && !state.inventory.includes(weak));
  assert.equal(state.inventory.length, 40);
});

test('a full pack sells the pickup only when it beats nothing of its kind', () => {
  const env = boot(), { CC, state, L } = env;
  state.inventory.push(item(CC, 'weapon', { dmg: 5 }, { name: 'Good Sword' }));
  fill(env);
  const poor = item(CC, 'weapon', { dmg: 1 }, { name: 'Poor Sword', value: 4 });
  const r = L.stash(poor, env.player);
  assert.equal(r.action, 'sold');
  assert.equal(state.gold, 4);
  assert.equal(state.inventory.includes(poor), false);
  // a different slot with nothing to replace is also sold
  const boots = item(CC, 'boots', { speed: 2 }, { value: 9 });
  assert.equal(L.stash(boots, env.player).action, 'sold');
});

test('room in the pack: the item is simply added', () => {
  const env = boot();
  const r = env.L.stash(item(env.CC, 'helm', { hp: 2 }), env.player);
  assert.equal(r.action, 'added');
  assert.equal(env.state.inventory.length, 1);
  assert.equal(env.state.gold, 0);
});

test('gear your class cannot wear does not push out gear you can', () => {
  const env = boot(), { CC, state, L } = env;
  const mine = item(CC, 'weapon', { dmg: 1 }, { name: 'My Staff', value: 5 });
  state.inventory.push(mine);
  fill(env);
  const other = item(CC, 'weapon', { dmg: 9 }, { name: 'Thief Dagger', classReq: 'thief', value: 30 });
  assert.equal(L.stash(other, env.player).action, 'sold');
  assert.ok(state.inventory.includes(mine));
});

test('picking up from the ground with a full pack swaps instead of selling', () => {
  const env = boot(), { CC, state, L, player } = env;
  state.autoEquip = false;
  const weak = item(CC, 'amulet', { hp: 1 }, { name: 'Weak Amulet', value: 6 });
  state.inventory.push(weak);
  fill(env);
  const better = item(CC, 'amulet', { hp: 6 }, { name: 'Fine Amulet', value: 40 });
  L.drops.push({ kind: 'item', x: 0, y: 0, vx: 0, vy: 0, z: 0, vz: 0, age: 1, item: better, rarity: 1, color: '#fff' });
  const got = L.pickupNear({ x: 0, y: 0, r: 8, classId: 'wizard', equipment: {} }, 0.016);
  assert.equal(got.length, 1);
  assert.ok(state.inventory.includes(better) && !state.inventory.includes(weak));
  assert.equal(state.gold, 6);
});

test('the piece you were wearing also replaces a weaker pack item when the pack is full', () => {
  const env = boot(), { CC, state, L, player } = env;
  const worn = item(CC, 'helm', { hp: 3 }, { name: 'Worn Helm', value: 12 }), weak = item(CC, 'helm', { hp: 1 }, { name: 'Weak Helm', value: 5 });
  player.equipment.helm = worn;
  state.inventory.push(weak);
  fill(env);
  const upgrade = item(CC, 'helm', { hp: 8 }, { name: 'Great Helm', value: 50 });
  assert.equal(L.autoEquip(player, upgrade), true);
  assert.equal(player.equipment.helm, upgrade);
  assert.ok(state.inventory.includes(worn), 'the old helm took the weak one\'s place');
  assert.equal(state.inventory.includes(weak), false);
  assert.equal(state.gold, 5);
});
