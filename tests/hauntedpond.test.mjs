import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../hauntedpond.js', import.meta.url), 'utf8');

function scene() {
  const enemies = {
    TYPES: {}, list: [], projectiles: [], damage(e, amount) { e.hp -= amount; return amount; },
    _think() {}, _kill() {}, update() {}, spawnForFloor() {},
    _tele(e, atk, duration, angle) {
      e.atk = atk; e.state = 'telegraph'; e.t = duration; e.ang = angle;
      e.tele = { kind: 'circle', rad: 60, max: duration };
    },
    _shoot(e, angle, speed, damage, color, kind, life) {
      this.projectiles.push({ x: e.x, y: e.y, vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed, dmg: damage, color, kind, life, hostile: true, r: 5 });
    }, _zone() {},
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

test('Pond Lady starts alone, receives 2x HP / 70% damage and summons four monster types', () => {
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
  assert.equal(boss.maxHp, 200, 'base 100 HP becomes 200');
  assert.equal(boss.hp, 200);
  assert.equal(boss.dmg, 14, 'base 20 damage becomes 14');
  assert.equal(pd.stage, 'fight');

  boss.state = 'idle'; boss.hp = 125; boss.cd = 5;
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

test('Mist Lunge has a locked visible warning lane and can be dodged', () => {
  const { CC, pd, player, enemies } = scene();
  CC.HauntedPond.interact();
  for (let i = 0; i < 5; i++) CC.HauntedPond.advanceDialogue();
  enemies.update(5.5);
  const boss = pd.boss;
  Object.assign(boss, { state: 'idle', n: 0, cd: 0, mistCd: 99, s1: 1, s2: 1 });
  enemies._think(boss, 0.1, player, 0, 0, 1);
  assert.equal(boss.atk, 'mistLunge');
  assert.equal(boss.state, 'telegraph');
  assert.ok(boss.mistLine && boss.mistLine.x1 > boss.mistLine.x0);
  const line = { ...boss.mistLine };
  player.y += 100; // dodge away while the attack is charging
  const hp = player.hp;
  enemies._think(boss, 1.0, player, 100, 0, 1);
  assert.equal(boss.state, 'recover');
  assert.equal(player.hp, hp, 'the attack uses its announced lane, not the moving player');
  assert.equal(boss.x, line.x1);
  assert.equal(boss.mistLine, null);
});

test('Mist Grasp visibly locks its circle and does not track the hero', () => {
  const { CC, pd, player, enemies } = scene();
  CC.HauntedPond.interact();
  for (let i = 0; i < 5; i++) CC.HauntedPond.advanceDialogue();
  enemies.update(5.5);
  const boss = pd.boss;
  Object.assign(boss, { state: 'idle', n: 1, cd: 0, mistCd: 99, s1: 1, s2: 1 });
  enemies._think(boss, 0.1, player, 0, 0, 1);
  assert.equal(boss.atk, 'mistGrasp');
  const circle = { ...boss.mistCircle }, hp = player.hp;
  player.y += 110; // move out after target has been locked
  enemies._think(boss, 1.2, player, 110, 0, 1);
  assert.equal(player.hp, hp);
  assert.ok(circle.rad >= 50);
  assert.equal(boss.mistCircle, null);
});

test('Peering Volley gives eye warnings before firing capped projectiles', () => {
  const { CC, pd, player, enemies } = scene();
  CC.HauntedPond.interact();
  for (let i = 0; i < 5; i++) CC.HauntedPond.advanceDialogue();
  enemies.update(5.5);
  const boss = pd.boss;
  Object.assign(boss, { state: 'idle', n: 2, cd: 0, mistCd: 99, s1: 1, s2: 1 });
  enemies._think(boss, 0.1, player, 0, 0, 1);
  assert.equal(boss.atk, 'mistVolley');
  assert.ok(boss.mistEyes.length > 0 && boss.mistEyes.length <= 5);
  assert.equal(enemies.projectiles.length, 0, 'no shots before telegraph finishes');
  enemies._think(boss, 1.2, player, 0, 0, 1);
  assert.ok(enemies.projectiles.length >= 1 && enemies.projectiles.length <= 5);
  assert.equal(boss.mistEyes, null);
});

test('Disappearing demon has safe, obvious arrival and cannot be hit while vanished', () => {
  const { CC, pd, player, enemies } = scene();
  CC.HauntedPond.interact();
  for (let i = 0; i < 5; i++) CC.HauntedPond.advanceDialogue();
  enemies.update(5.5);
  const boss = pd.boss;
  Object.assign(boss, { state: 'idle', n: 4, cd: 7, mistCd: 0, s1: 1, s2: 1 });
  enemies._think(boss, 0.1, player, 0, 0, 1);
  assert.equal(boss.state, 'mistFade');
  assert.ok(boss.mistDest, 'arrival is chosen before the boss vanishes');
  enemies._think(boss, 0.5, player, 0, 0, 1);
  assert.equal(boss.state, 'mistHidden');
  assert.equal(boss.hidden, true);
  const hp = boss.hp;
  assert.equal(enemies.damage(boss, 50), 0, 'no hitting an empty location');
  assert.equal(boss.hp, hp);
  enemies._think(boss, 1.1, player, 0, 0, 1);
  assert.equal(boss.state, 'mistAppear');
  assert.equal(boss.hidden, false);
  assert.ok(Math.hypot(boss.x - player.x, boss.y - player.y) >= 95,
    'reappearance does not overlap the hero');
  assert.equal(enemies.damage(boss, 10), 10);
});

test('Boss post-fog rendering stays available and source drawing avoids duplicates', () => {
  const { CC, pd, enemies } = scene();
  CC.HauntedPond.interact();
  for (let i = 0; i < 5; i++) CC.HauntedPond.advanceDialogue();
  enemies.update(5.5);
  pd.h = 1;
  const strokes = [];
  const context = new Proxy({ globalAlpha: 1,
    createRadialGradient() { return { addColorStop() {} }; } }, {
    get(o, k) {
      if (k in o) return o[k];
      return (...args) => { strokes.push(String(k)); };
    },
    set(o, k, v) { o[k] = v; return true; }
  });
  assert.doesNotThrow(() => CC.HauntedPond.drawBossFocus(context, { x: pd.x - 180, y: pd.y - 130, w: 360, h: 260 }));
  assert.ok(strokes.includes('fillRect'), 'the visible demon is drawn over the fog');
  const shell = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const enemySource = readFileSync(new URL('../enemies.js', import.meta.url), 'utf8');
  assert.ok(shell.indexOf("call('HauntedPond', 'drawBossFocus'") > shell.indexOf("CC.Dungeon.drawLighting(ctx, dcam)"));
  assert.ok(enemySource.includes("e.type === 'merehorror' && CC.HauntedPond"), 'no doubled draw under fog');
});

test('Pond Lady announces bright blood orbs and then fires a locked spread', () => {
  const { pd, player, enemies } = scene();
  pd.stage = 'fight';
  const boss = { type: 'merehorror', x: pd.x + 80, y: pd.y, spd: 0,
    cd: 0, n: 5, state: 'idle', hp: 100, maxHp: 100,
    dmg: 12, r: 20, anim: 0, summonCd: 10, mistCd: 10 };
  enemies._think(boss, .1, player, 80, Math.PI, 1);
  assert.equal(boss.atk, 'bloodOrbs');
  assert.equal(boss.state, 'telegraph');
  assert.ok(boss.projectileAim, 'target is locked during telegraph');
  assert.equal(enemies.projectiles.length, 0);
  enemies._think(boss, 1, player, 80, Math.PI, 1);
  assert.equal(enemies.projectiles.length, 3);
  assert.ok(enemies.projectiles.every(q => q.pondShot && q.hostile && q.color === '#ff78c7'));
});

test('Pond combat effects are redrawn above fog only during the encounter', () => {
  const { CC, pd, player } = scene();
  let redraws = 0;
  CC.Classes.drawPondCombat = () => { redraws++; };
  const c = { save() {}, restore() {}, fillRect() {}, beginPath() {}, arc() {},
    fill() {}, stroke() {}, moveTo() {}, lineTo() {} };
  CC.HauntedPond.drawCombatFocus(c, { x: 1900, y: 1900, w: 400, h: 400 });
  assert.equal(redraws, 0);
  pd.h = 1; pd.stage = 'fight';
  CC.HauntedPond.drawCombatFocus(c, { x: 1900, y: 1900, w: 400, h: 400 });
  assert.equal(redraws, 1);
  player.x += 2000;
  CC.HauntedPond.drawCombatFocus(c, { x: 1900, y: 1900, w: 400, h: 400 });
  assert.equal(redraws, 1);
});
