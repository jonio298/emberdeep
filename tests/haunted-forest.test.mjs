import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scripts = ['realm.js', 'village.js', 'haunted_forest.js'].map((file) =>
  new Function('window', readFileSync(new URL('../' + file, import.meta.url), 'utf8'))
);

function scene() {
  const messages = [];
  let saves = 0;
  const CC = {
    state: { player: {}, gold: 20 },
    SaveGame: { save() { saves++; } },
    fx: { text(x, y, text) { messages.push(text); } }
  };
  for (const load of scripts) load({ CC });
  return { CC, village: CC.AbandonedVillage, forest: CC.HauntedForest, messages, saves: () => saves };
}

function enter(CC, area, map, position) {
  CC.state.area = area;
  CC.Dungeon = map;
  Object.assign(CC.state.player, position);
}

function walkableFrom(map, start, tileSize) {
  const tileAt = (point) => [Math.floor(point.x / tileSize), Math.floor(point.y / tileSize)];
  const queue = [tileAt(start)];
  const seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    const name = x + ',' + y;
    if (seen.has(name) || map.isSolidTile(x, y)) continue;
    seen.add(name);
    queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
  return (point) => seen.has(tileAt(point).join(','));
}

test('Elsie offers the ring quest beside a walkable trail due north of the village square', () => {
  const { CC, village, forest, saves } = scene();

  for (const seed of [0, 1, 17, 431, 0xffffffff]) {
    const map = village.generate(seed);
    const trail = map.forestTrail;
    assert.equal(trail.tx, map.vil.plazaX);
    assert.ok(trail.ty < map.vil.plazaY);
    const reachable = walkableFrom(map, map.spawn, CC.TILE);
    assert.ok(reachable(map.ringQuestGiver));
    assert.ok(reachable(trail));
    for (let y = trail.ty; y <= map.vil.plazaY; y++) {
      assert.equal(map.isSolidTile(trail.tx, y), false);
    }
  }

  const map = village.map;
  enter(CC, 'village', map, map.ringQuestGiver);
  assert.ok(village.nearAction());
  assert.equal(village.nearForestTrail(), false);
  assert.ok(village.interact());
  assert.equal(forest.stage(), 'accepted');
  assert.equal(village.speech.name, 'Elsie');
  assert.match(village.speech.text, /wedding ring/i);
  assert.match(village.speech.text, /north trail from the square/i);
  assert.ok(village.interact());
  assert.equal(saves(), 1, 'repeated dialogue does not re-accept the quest');
  enter(CC, 'village', map, map.forestTrail);
  assert.ok(village.nearForestTrail());
});

test('the seeded woods connect exit, apparitions, and remains and draw both eye colors through the fog', () => {
  const { CC, forest } = scene();
  const map = forest.generate(17);
  const repeated = forest.generate(17);
  assert.deepEqual(repeated.tiles, map.tiles);
  assert.deepEqual(repeated.eyes, map.eyes);
  assert.deepEqual(repeated.apparitions, map.apparitions);
  assert.notDeepEqual(forest.generate(0xffffffff).tiles, map.tiles);

  for (const seed of [0, 1, 17, 431, 0xffffffff]) {
    const sample = forest.generate(seed);
    const reachable = walkableFrom(sample, sample.spawn, CC.TILE);
    assert.ok(reachable(sample.exit));
    assert.ok(reachable(sample.ringSite));
    assert.ok(sample.apparitions.every(reachable));
    assert.ok(sample.eyes.every((eye) => sample.isSolid(eye.x, eye.y)));
    assert.ok(sample.spawn.y > sample.ringSite.y);
  }

  enter(CC, 'haunted-forest', forest.map, forest.map.exit);
  assert.ok(forest.nearExit());
  assert.equal(forest.nearAction(), false);
  assert.equal(forest.interact(), false);
  assert.ok(forest.map.fogAmt >= 0.7);

  // Exercise the real Realm lighting callback with a recording canvas.
  const paint = [];
  const ctx = new Proxy({
    globalAlpha: 1,
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    ellipse(x, y, rx, ry) { paint.push({ color: this.fillStyle, ry }); }
  }, {
    get(target, key) { return key in target ? target[key] : () => {}; }
  });
  forest.map._scr = { width: 440, height: 360, getContext: () => ctx };
  const center = forest.map.apparitions[0];
  enter(CC, 'haunted-forest', forest.map, center);
  const camera = { x: center.x - 220, y: center.y - 180, w: 440, h: 360 };
  forest.map._t = 1;
  forest.map.drawLighting(ctx, camera);
  assert.ok(paint.some(({ color }) => color === '#ffd84f'), 'yellow eyes are drawn');
  assert.ok(paint.some(({ color }) => color === '#ff4841'), 'red eyes are drawn');
  assert.ok(paint.some(({ color }) => color === '#e0efea'), 'apparitions are drawn');
  paint.length = 0;
  forest.map._t = 4.12 - forest.map.eyes[0].phase;
  forest.map.drawLighting(ctx, camera);
  assert.ok(paint.some(({ color, ry }) => color === '#ffd84f' && ry < 0.5), 'eyes blink closed');
});

test('the remains require acceptance and returning a restored ring rewards gold exactly once', () => {
  const { CC, forest, village, messages, saves } = scene();
  const map = forest.generate(123);
  const villageMap = village.generate(456);
  enter(CC, 'haunted-forest', map, map.ringSite);
  assert.ok(forest.interact());
  assert.equal(forest.stage(), 'unstarted');
  assert.equal(saves(), 0);

  enter(CC, 'village', villageMap, villageMap.ringQuestGiver);
  assert.ok(village.interact());
  const acceptedSave = JSON.parse(JSON.stringify(forest.serialize()));
  forest.restore(null);
  assert.equal(forest.stage(), 'unstarted');
  forest.restore(acceptedSave);
  assert.equal(forest.stage(), 'accepted');

  enter(CC, 'haunted-forest', map, map.ringSite);
  assert.ok(forest.interact());
  assert.match(messages.at(-1), /Wedding ring found/);
  assert.equal(forest.stage(), 'ring-found');
  assert.ok(forest.interact());
  assert.equal(saves(), 2, 'repeated searches do not acquire a second ring');

  const resumed = scene();
  resumed.forest.restore(JSON.parse(JSON.stringify(forest.serialize())));
  const restoredVillage = resumed.village.generate(456);
  enter(resumed.CC, 'village', restoredVillage, restoredVillage.ringQuestGiver);
  assert.ok(resumed.village.interact());
  assert.equal(resumed.forest.stage(), 'completed');
  assert.equal(resumed.CC.state.gold, 20 + resumed.forest.rewardGold);
  assert.equal(resumed.saves(), 1);
  assert.ok(resumed.village.interact());
  assert.equal(resumed.saves(), 1);

  const completed = resumed.forest.serialize();
  resumed.village.reset();
  assert.equal(resumed.forest.stage(), 'unstarted');
  resumed.forest.restore(completed);
  assert.ok(resumed.village.interact());
  assert.equal(resumed.CC.state.gold, 20 + resumed.forest.rewardGold);
  assert.equal(resumed.saves(), 1);
  resumed.forest.restore({ stage: 'unknown' });
  assert.equal(resumed.forest.stage(), 'unstarted');
});
