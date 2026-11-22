import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../hauntedpond.js', import.meta.url), 'utf8');

function scene() {
  const enemies = {
    TYPES: {}, list: [],
    _think() {}, _kill() {}, update() {}, spawnForFloor() {},
    _tele(e, atk, duration, angle) {
      e.atk = atk; e.state = 'telegraph'; e.t = duration; e.ang = angle;
      e.tele = { kind: 'circle', rad: 60, max: duration };
    },
    _shoot() {}, _zone() {},
    spawn(type, x, y) {
      const mob = { type, x, y, asleep: true, dead: false, cd: 0,
        state: 'idle', maxHp: 100, hp: 100, dmg: 20, spd: 55, anim: 0, r: 10 };
      this.list.push(mob);
      return mob;
    }
  };
  const player = { x: 2100, y: 2100, hp: 100, r: 10 };
  const pd = { x: 2100, y: 2100, cx: 65, cy: 65, R: 44, ry: 27, ri: 7,
    stage: 'calm', h: 0, fire: 0, turnT: 0, ghosts: [],
    islandTrees: [], trees: [], lady: { x: 2100, y: 2106, hidden: false }, W: 150, dirx: 1 };
  const map = { pond: pd, kind: new Uint8Array(150 * 150), w: 150, chests: [], isSolid() { return false; } };
  let heroDraws = 0;
  const CC = {
    TILE: 32, Enemies: enemies, Forest: { drawMonster() {} }, Plains: { map },
    Dungeon: map, state: { player },
    Classes: { drawPlayer() { heroDraws++; } },
    Audio: { event() {}, play() {} },
    fx: { burst() {}, text() {}, shake() {} },
    Vfx: { skyFlash() {} }, SaveGame: { save() {} }
  };
  new Function('window', source)({ CC });
  return { CC, pd, player, enemies, getHeroDraws: () => heroDraws };
}

test('Pond Lady starts alone, receives 4x HP / 70% damage and summons four monster types', () => {
  const { CC, pd, player, enemies } = scene();
  assert.equal(enemies.list.length, 0, 'island starts without monsters');
  assert.equal(CC.HauntedPond.interact(), true);
  assert.equal(pd.stage, 'talk');
  enemies.update(12);
  assert.equal(pd.stage, 'talk');
  for (let i = 0; i < 5; i++) assert.equal(CC.HauntedPond.advanceDialogue(), true);
  assert.equal(pd.stage, 'turn');
  enemies.update(5.5);
  const boss = pd.boss;
  assert.ok(boss);
  assert.equal(boss.maxHp, 400, 'base 100 HP becomes 400');
  assert.equal(boss.hp, 400);
  assert.equal(boss.dmg, 14, 'base 20 damage becomes 14');
  assert.equal(pd.stage, 'fight');

  boss.state = 'idle'; boss.hp = 250; boss.cd = 5;
  enemies._think(boss, 0.1, player, 80, 0, 1);
  assert.equal(boss.atk, 'summon');
  assert.equal(boss.state, 'telegraph', 'summons are announced before spawning');
  enemies._think(boss, 1.1, player, 80, 0, 1);

  const summons = enemies.list.filter(e => e.pondSummon);
  assert.equal(summons.length, 4);
  assert.deepEqual(
    new Set(summons.map(e => e.type)),
    new Set(['bat', 'pondterror', 'ghost', 'skeleton'])
  );
  assert.ok(summons.every(e => !e.asleep), 'summons are active immediately');
  assert.ok(summons.every(e => Math.hypot(e.x - pd.x, e.y - pd.y) < 192),
    'summons are on the playable island');
  assert.ok(summons.every(e => Math.hypot(e.x - player.x, e.y - player.y) >= 64),
    'summons cannot land on a player');

  for (let i = 0; i < 9; i++) {
    boss.state = 'telegraph'; boss.atk = 'summon'; boss.t = 0.1;
    enemies._think(boss, 0.2, player, 80, 0, 1);
  }
  assert.equal(enemies.list.filter(e => e.pondSummon && !e.dead).length, 8,
    'mobile-friendly cap avoids unbounded summons');
});

test('Teleporting Terror warns before reappearing at a safe island location', () => {
  const { enemies, pd, player } = scene();
  const monster = { type: 'pondterror', x: 2200, y: 2100,
    state: 'idle', anim: 1, r: 10, spd: 64, cd: 0, dead: false };
  enemies._think(monster, 1.5, player, 100, 0, 1);
  enemies._think(monster, 1.5, player, 100, 0, 1);
  assert.equal(monster.state, 'telegraph');
  enemies._think(monster, 0.7, player, 100, 0, 1);
  assert.equal(monster.state, 'recover');
  assert.ok(Math.hypot(monster.x - pd.x, monster.y - pd.y) < 192);
});

test('Hero is redrawn on top of dense pond fog only while near the pond', () => {
  const { CC, pd, player, getHeroDraws } = scene();
  const ctx = { save() {}, restore() {}, beginPath() {}, ellipse() {}, stroke() {} };
  CC.HauntedPond.drawHeroFocus(ctx, { x: 1800, y: 1800 });
  assert.equal(getHeroDraws(), 0, 'no duplicate hero in clear daylight');
  pd.h = 1;
  CC.HauntedPond.drawHeroFocus(ctx, { x: 1800, y: 1800 });
  assert.equal(getHeroDraws(), 1, 'hero above fog');
  player.x += 2000;
  CC.HauntedPond.drawHeroFocus(ctx, { x: 1800, y: 1800 });
  assert.equal(getHeroDraws(), 1, 'no extra render outside pond');
});

test('Pond dialogue requires each action and the player must be nearby', () => {
  const { CC, pd, player, enemies } = scene();
  player.x += 180;
  assert.equal(CC.HauntedPond.nearAction(), false);
  assert.equal(CC.HauntedPond.interact(), false);
  player.x -= 180;
  assert.equal(CC.HauntedPond.nearAction(), true);
  assert.equal(CC.HauntedPond.interact(), true);
  assert.equal(CC.Plains.speech.modal, true);
  for (let i = 1; i < 5; i++) {
    enemies.update(2);
    assert.equal(pd.stage, 'talk');
    assert.equal(CC.HauntedPond.advanceDialogue(), true);
  }
  assert.match(CC.Plains.speech.text, /Forever/);
  assert.equal(CC.HauntedPond.advanceDialogue(), true);
  assert.equal(pd.stage, 'turn');
  assert.equal(CC.Plains.speech, null);
});
test('Pond transformation includes timed cues and spawns only one boss', () => {
  const { CC, pd, enemies } = scene();
  CC.HauntedPond.interact();
  for (let i = 0; i < 5; i++) CC.HauntedPond.advanceDialogue();
  enemies.update(1.1);
  assert.ok(!pd.boss, 'no boss before the cinematic completes');
  enemies.update(1.8);
  assert.equal(pd.turnCue, 2);
  enemies.update(2.6);
  assert.equal(pd.stage, 'fight');
  assert.equal(enemies.list.filter(e => e.type === 'merehorror').length, 1);
  enemies.update(1);
  assert.equal(enemies.list.filter(e => e.type === 'merehorror').length, 1);
});
