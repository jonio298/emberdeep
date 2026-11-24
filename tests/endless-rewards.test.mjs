import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const bestKey = 'emberdeep-endless-v1';
const levels = [0, 3, 6, 10, 15, 22, 30];
const hero = { id: 'slot-1', classId: 'swordsman', level: 1 };
const result = (progress, overrides = {}) => ({
  id: 'run-1', mode: 'plains', reason: 'death', elapsedSeconds: progress * 60, kills: 10, ...overrides
});

function boot(seed = 12345) {
  const storage = new Map(), sounds = [];
  const Math = Object.create(globalThis.Math);
  Math.random = () => {
    seed = (globalThis.Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const window = {
    Math,
    CC: {
      Endless: { TUNING: {} },
      Classes: { create: (classId) => ({ classId, name: classId, level: 1, hp: 10 }) },
      Audio: { play(name, opts) { sounds.push([name, opts.rate]); } }
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    }
  };
  window.window = window;
  for (const filename of ['loot.js', 'save_game.js', 'endless_rewards.js']) {
    runInNewContext(readFileSync(new URL('../' + filename, import.meta.url), 'utf8'), window, { filename });
  }
  const { CC } = window;
  const save = CC.SaveGame;
  function destination(character, inventory = []) {
    const slot = save.createCharacter(character.classId, character.id);
    const adapter = save.endlessRewardDestination({ ...character, slot });
    assert.equal(adapter.deliver(data => { data.inventory = inventory; }).ok, true);
    return adapter;
  }
  return { CC, rewards: CC.EndlessRewards, storage, sounds, destination };
}

test('each shared threshold gives the documented item count, rarity guarantees and bonuses', () => {
  const { CC, rewards } = boot();
  const guarantees = [[0], [0], [1, 1], [2, 1], [3, 2, 2], [4, 2, 2], [4, 4, 3, 3]];
  const bonusKeys = [
    ['gold'], ['gold'], ['gold', 'manaPotions', 'potions'], ['gold'],
    ['gold', 'respecTokens'], ['gold'], ['gold', 'title']
  ];
  assert.equal(CC.Endless.TUNING.rewardTiers, rewards.rewardTiers);
  for (const [index, progress] of levels.entries()) {
    const roll = rewards.rollReward(result(progress), hero);
    assert.equal(roll.tier.index, index);
    assert.equal(roll.items.length, guarantees[index].length);
    roll.items.forEach((item, i) => assert.ok(item.rarity >= guarantees[index][i]));
    assert.ok(roll.items.every(item => item.rarity <= (roll.tier.ceiling ?? 4)));
    assert.deepEqual(Object.keys(roll.bonuses).sort(), bonusKeys[index]);
    assert.ok(roll.bonuses.gold > 0);
    assert.equal(roll.charm?.slot, index === 3 ? 'charm' : undefined);
    if (index > 0) assert.equal(rewards.tierFor(progress - 0.001).index, index - 1);
  }
  assert.ok(rewards.rollReward(result(10), hero).bonuses.gold > rewards.rollReward(result(6), hero).bonuses.gold);
  assert.equal(rewards.rollReward(result(6), hero).bonuses.potions, 1);
  assert.equal(rewards.rollReward(result(6), hero).bonuses.manaPotions, 1);
  assert.equal(rewards.rollReward(result(15), hero).bonuses.respecTokens, 1);
  assert.equal(typeof rewards.rollReward(result(30), hero).bonuses.title, 'string');
  assert.equal(rewards.progress(result(0, { mode: 'catacombs', floor: 5 })), 10);
  assert.equal(rewards.rollReward(result(0, { mode: 'catacombs', floor: 5 }), hero).tier.name, 'Gold');
});

test('2,000 seeded runs per threshold give non-decreasing average rarity for fresh and veteran heroes', () => {
  for (const level of [1, 60]) {
    const { rewards } = boot();
    let previousAverage = -1;
    for (const [index, progress] of levels.entries()) {
      let raritySum = 0, itemCount = 0, extraLegendaries = 0;
      for (let i = 0; i < 2000; i++) {
        const { items } = rewards.rollReward(result(progress), { ...hero, level });
        for (const [slot, item] of items.entries()) {
          assert.ok(!item.classReq || item.classReq === hero.classId);
          if (index < 3) assert.ok(item.rarity < 4);
          if (index === 5 && slot > 0 && item.rarity === 4) extraLegendaries++;
          raritySum += item.rarity;
          itemCount++;
        }
      }
      const average = raritySum / itemCount;
      assert.ok(average >= previousAverage, 'rarity regressed at ' + progress + ' for level ' + level);
      if (index === 5) assert.ok(extraLegendaries / 4000 >= 0.27);
      previousAverage = average;
    }
  }
});

function finish(ceremony) {
  while (ceremony.current) {
    assert.equal(ceremony.reveal(), true);
    assert.equal(ceremony.choose('inventory'), true);
  }
  assert.equal(ceremony.claimBonuses(), true);
  assert.equal(ceremony.pending, false);
}

test('finalization is idempotent and co-op rolls use each restored class and level', () => {
  const { CC, rewards, storage, destination } = boot();
  const rolls = [];
  const original = CC.Loot.rollItem;
  CC.Loot.rollItem = (...args) => {
    rolls.push(args);
    return original(...args);
  };
  const dest = destination(hero);
  const run = result(10, { character: hero });
  const second = { id: 'slot-2', classId: 'necromancer', level: 11 };
  const partnerDest = destination(second);
  const firstCeremony = rewards.finalize(run, dest);
  assert.equal(rewards.finalize({ ...run, elapsedSeconds: 1800 }, dest), firstCeremony);
  const partnerCeremony = rewards.finalize({ ...run, character: second }, partnerDest);
  const retired = rewards.finalize({ ...run, id: 'run-2', reason: 'retire' }, dest);
  assert.equal(firstCeremony.tier.name, retired.tier.name);
  assert.equal(firstCeremony.tier.name, partnerCeremony.tier.name);
  assert.deepEqual(rolls.map(args => [args[3], args[5]]), [
    ['swordsman', 1], ['swordsman', 1], ['necromancer', 11], ['necromancer', 11], ['swordsman', 1], ['swordsman', 1]
  ]);
  finish(firstCeremony);
  finish(partnerCeremony);
  assert.equal(rewards.finalize(run, dest).pending, false);
  assert.equal(firstCeremony.claimBonuses(), false);
  assert.equal(firstCeremony.choose('inventory'), false);
  const firstSave = dest.read(), partnerSave = partnerDest.read();
  assert.equal(firstSave.gold, firstCeremony.bonuses.gold);
  assert.equal(partnerSave.gold, partnerCeremony.bonuses.gold);
  assert.equal(firstSave.inventory.length, 3);
  assert.equal(partnerSave.inventory.length, 3);
  const uids = [...firstSave.inventory, ...partnerSave.inventory].map(item => item.uid);
  assert.equal(new Set(uids).size, 6);
  assert.equal(JSON.parse(storage.get(bestKey)).plains.runs, 2);
});

test('the canvas ceremony reveals rarity and keeps full-pack items pending through failed delivery', () => {
  const { rewards, sounds, destination } = boot();
  const inventory = Array.from({ length: 40 }, (_, i) => ({ name: 'Old Blade ' + i, uid: 2000 + i }));
  const dest = destination(hero, inventory);
  let writeAvailable = false;
  const adapter = {
    read: dest.read,
    deliver(mutator) {
      return dest.deliver(data => mutator(data) && writeAvailable);
    }
  };
  const ceremony = rewards.finalize(result(30, { character: hero }), adapter);
  assert.equal(ceremony.current.item, null);
  assert.equal(ceremony.choose('inventory'), false);
  assert.equal(ceremony.claimBonuses(), false);
  const opened = [];
  const buttons = new Map(), labels = [];
  const ctx = { save() {}, restore() {}, fillText(label) { labels.push(label); } };
  const button = (x, y, width, height, label, color, action) => buttons.set(label, action);
  const draw = () => {
    buttons.clear();
    labels.length = 0;
    return ceremony.draw(ctx, 360, 640, button);
  };
  for (const [i, action] of ['stash', 'swap', 'sell', 'stash'].entries()) {
    assert.equal(ceremony.current.number, i + 1);
    assert.ok(ceremony.current.rarity.color.startsWith('#'));
    assert.equal(draw(), true);
    assert.ok(labels[0].includes(ceremony.current.rarity.name));
    buttons.get('Open Chest')();
    assert.equal(ceremony.reveal(), false);
    const item = ceremony.current.item;
    opened.push(item);
    assert.equal(ceremony.current.rarity.id, item.rarity);
    draw();
    assert.ok(labels.includes(item.name));
    buttons.get('Take Item')();
    assert.equal(ceremony.current.packFull, true);
    draw();
    if (i === 0) {
      buttons.get('Stash')();
      assert.equal(ceremony.current.item, item);
      assert.equal(dest.read().player.endlessStash, undefined);
      writeAvailable = true;
    }
    if (action === 'stash') buttons.get('Stash')();
    if (action === 'swap') buttons.get('Swap to Stash')();
    if (action === 'sell') buttons.get('Sell · ' + item.value + 'g')();
    assert.equal(ceremony.current?.number ?? 5, i + 2);
  }
  assert.deepEqual(sounds.slice(0, 2), [['awesome_legendary', 1], ['awesome_legendary', 1]]);
  assert.equal(sounds.length, 4);
  const save = dest.read();
  assert.deepEqual(Array.from(save.player.endlessStash, item => item.uid), [opened[0].uid, inventory[0].uid, opened[3].uid]);
  assert.equal(save.inventory[0].uid, opened[1].uid);
  assert.equal(save.inventory.length, 40);
  assert.equal(save.gold, opened[2].value);
  writeAvailable = false;
  assert.equal(ceremony.claimBonuses(), false);
  assert.equal(ceremony.pending, true);
  writeAvailable = true;
  draw();
  buttons.get('Collect Bonuses')();
  assert.equal(ceremony.pending, false);
  assert.equal(draw(), false);
  assert.equal(dest.read().gold, save.gold + ceremony.bonuses.gold);
  assert.deepEqual(Array.from(dest.read().player.endlessTitles), [ceremony.bonuses.title]);
});

test('Silver potions and the Platinum token are saved to their destination character', () => {
  const { rewards, destination } = boot();
  const dest = destination(hero);
  finish(rewards.finalize(result(6, { character: hero }), dest));
  assert.equal(dest.read().potions, 3);
  assert.equal(dest.read().manaPotions, 2);
  finish(rewards.finalize(result(15, { id: 'run-2', character: hero }), dest));
  assert.equal(dest.read().player.endlessRespecTokens, 1);
});

test('personal bests are separate, cover both modes and ignore mid-run quits', () => {
  const { rewards, storage, destination } = boot();
  const dest = destination(hero);
  const slotKey = 'emberdeep.save.v3.slot1';
  const campaign = storage.get(slotKey);
  const snapshot = (progress, overrides) => result(progress, { ...overrides, character: hero });
  assert.equal(rewards.best('plains'), null);
  assert.equal(rewards.finalize(snapshot(30, { reason: 'quit' }), dest), null);
  assert.equal(storage.has(bestKey), false);
  const plainsBest = rewards.finalize(snapshot(12), dest);
  const plainsShorter = rewards.finalize(snapshot(2, { id: 'run-2', kills: 5 }), dest);
  const catacombs = rewards.finalize(snapshot(1, { id: 'run-3', mode: 'catacombs', floor: 6 }), dest);
  assert.equal(plainsBest.personalBest, true);
  assert.equal(plainsShorter.personalBest, false);
  assert.equal(catacombs.personalBest, true);
  assert.equal(rewards.best('plains').bestLevel, 2);
  assert.equal(rewards.best('catacombs').bestFloor, 6);
  assert.deepEqual(JSON.parse(storage.get(bestKey)), {
    plains: { bestSeconds: 720, bestLevel: 2, kills: 15, runs: 2 },
    catacombs: { bestSeconds: 60, bestFloor: 6, kills: 10, runs: 1 }
  });
  assert.equal(storage.get(slotKey), campaign);
});
