/* CC.Enemies - monsters, elites and bosses (task t5).
 *
 * API: list[], projectiles[], boss, spawnForFloor(floor, spawnPoints), update(dt), draw(ctx, cam),
 *      damage(enemy, amount, type) -> damage dealt, queryCircle(x,y,r), nearest(x,y,range), alive().
 *   Player = CC.state.player ({x,y,hp,maxHp,r?,armor?,invuln?}). Enemies read it each update.
 *   damage types: 'melee','fire','frost','arcane','poison','necro' (fire burns, frost slows).
 * Types: bat (swarm), slime (splits twice), archer (skeleton archer), charger (goblin), spitter (mushroom), spider.
 * Horror bestiary (min = first floor it can spawn): skeleton (f2, collapses then rises once), snake (f2, poison hit-and-run),
 *   ghoul (f3, lifesteal leaping packs), scorpion (f3, armoured, poison sting), ghost (f4, phases through walls/fades, wails),
 *   demon (f6, fireballs + hellfire zones, fire-proof), dragon (f8+, max one per floor, fire breath; also boss Pyraxis on floor 20).
 *   Deaths leave CC.Enemies.remains (blood pools, bones, ichor, scorch, wisps) drawn under the monsters.
 * Elites carry 1-2 affixes: Swift, Armored, Vampiric, Explosive, Frenzied, Shielded.
 * Bosses spawn every 5th floor (5,10,15..), type cycles by floor: Grukk (rush), Vexa (burrow), Mortis (bombard);
 *   spawn('boss', x, y, floor, {bossIdx}) forces a type. 2 phases, phase 2 at 50% HP with faster, wider attacks.
 *   boss.bar / CC.Enemies.bossBar = {name,pct,phase,phases,color,intro}; death drops guaranteed Rare+ loot (boss.lootDrops).
 * Every telegraphed attack shows a red warning (line or circle) before it hits.
 * Toughness (task t5): base HP x HP_MULT (2). Unique specials (SPECIAL table, fired while idle with a clear line): bat Screech, slime Acid Glob,
 *   archer Triple Shot, charger War Cry (rage buff), spitter Spore Burst, spider Web Shot (poison + p.slowT), skeleton Bone Throw, snake Venom Spit,
 *   ghoul Pack Howl (rage), scorpion Stinger Volley, ghost Hex (p.cursed = 5s, +25% damage taken); demon/dragon keep fireballs/hellfire/breath/tail.
 *   Gait: slime hops, charger/skeleton/scorpion flank, bat/spider/ghoul/snake weave, archer/demon kite.
 * Dismemberment: parts (limb, armor, limb, head; chunks for slime/spitter) fly off at each 1/5 of lost HP (e.lostN); the enemy keeps fighting.
 * Bone piles: CC.Enemies.piles[] {x,y,bones}; bones/skulls from deaths and torn-off parts merge within 40px. After 5s untouched a pile rolls once
 *   (pileChance(bones): 0 under 6 bones, +5% per bone over 5, max 70%) to rise as a risen skeleton (60% HP, no further piles).
 * Enemies sleep until the player is within WAKE px or they are hurt. Works without any other CC module.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var rnd = Math.random;
  function R() { return rnd(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var WAKE = 240, PI2 = Math.PI * 2;
  /* Gore intensity: 0 = none, 1 = normal, 2 = extra messy. Scales burst sizes and bleeding, and raises the two caps below (hard-limited at 2x). */
  var GORE = 1;
  var GORE_PARTS_CAP = Math.round(110 * Math.min(2, GORE)), REMAINS_CAP = Math.round(170 * Math.min(2, Math.max(0.5, GORE)));
  // enemy types that spit or slosh blood out as a telegraph / now and then: n droplets, pow = launch speed (px/s)
  var SPURT = { ghoul: { n: 9, pow: 130 }, charger: { n: 7, pow: 110 }, demon: { n: 8, pow: 120 }, spitter: { n: 8, pow: 100 }, scorpion: { n: 6, pow: 100 } };

  /* Toughness: every base monster HP is multiplied by HP_MULT (basic enemies took ~2 hits of 10 damage before, ~4 now). */
  var HP_MULT = 2;
  /* Dismemberment: parts that fly off in this order as HP falls (one per equal slice of the HP bar). The enemy keeps fighting. */
  // Anatomy profiles: each detached piece is also hidden from the still-living sprite.
  var PARTS = ['armLeft', 'armRight', 'head', 'legLeft'];
  var ANATOMY = {
    charger: ['hornLeft', 'armLeft', 'hornRight', 'legLeft'], goblin: ['hornLeft', 'armLeft', 'head', 'legLeft'],
    demon: ['hornLeft', 'armLeft', 'hornRight', 'head'], dragon: ['hornLeft', 'hornRight', 'legLeft', 'head'],
    scorpion: ['armLeft', 'armRight', 'legLeft', 'legRight'], spider: ['legLeft', 'legRight', 'armLeft', 'armRight'],
    snake: ['tail', 'tail', 'head', 'tail'], bat: ['armLeft', 'armRight', 'head', 'legLeft'],
    slime: ['chunk', 'chunk', 'chunk', 'chunk'], spitter: ['chunk', 'chunk', 'chunk', 'chunk'],
    ghoul: ['armLeft', 'armRight', 'head', 'legLeft'], skeleton: ['armLeft', 'armRight', 'head', 'legLeft'],
    archer: ['armLeft', 'armRight', 'head', 'legLeft']
  };
  var ARMOR_LOOK = { skeleton: 1, archer: 1, charger: 1, demon: 1, dragon: 1, scorpion: 1 };
  /* Bone piles: every bone/skull left by a death or a torn-off part adds to the pile within PILE_R px. A pile that stays untouched for
     PILE_DELAY s rolls once to rise as a skeleton: chance = 0 below 6 bones, then +5% per bone above 5, capped at 70%. */
  var PILE_R = 40, PILE_DELAY = 5, PILE_MAX = 40;
  var PROJ_KIND = { spore: 'poison', venom: 'poison', web: 'web', fireball: 'fire', curse: 'curse' };
  // unique ranged specials, one per type (checked while the monster is idle with a clear line to the player): range/min px, cd seconds
  function fan(E, e, a, n, gap, spd, dmg, col, kind, life) { for (var i = 0; i < n; i++) E._shoot(e, a + (i - (n - 1) / 2) * gap, spd, dmg, col, kind, life); }
  function rageNear(E, e, rad, t) {
    for (var i = 0; i < E.list.length; i++) { var o = E.list[i]; if (!o.dead && !o.boss && Math.hypot(o.x - e.x, o.y - e.y) < rad && (e.group ? o.group === e.group || o === e : true)) o.rage = t; }
    if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y, '#ff6a2a', 8, 70);
  }
  var SPECIAL = {
    bat: { name: 'Screech', range: 130, min: 0, cd: 4, fn: function (E, e, p, a) { fan(E, e, a, 5, 0.35, 150, e.dmg * 0.5, '#c8a8ff', 'wail', 0.55); } },
    slime: { name: 'Acid Glob', range: 220, min: 90, cd: 5, fn: function (E, e, p, a) { E._shoot(e, a, 100, e.dmg * 0.8, '#7aff6a', 'spore', 2.4); } },
    archer: { name: 'Triple Shot', range: 300, min: 100, cd: 6, fn: function (E, e, p, a) { fan(E, e, a, 3, 0.2, 210, e.dmg * 0.8, '#e8e0b0', 'arrow', 2); } },
    charger: { name: 'War Cry', range: 260, min: 0, cd: 7, fn: function (E, e) { rageNear(E, e, 220, 4); } },
    spitter: { name: 'Spore Burst', range: 200, min: 0, cd: 5, fn: function (E, e, p, a) { fan(E, e, a, 8, PI2 / 8, 90, e.dmg * 0.8, '#b0e050', 'spore', 2); } },
    spider: { name: 'Web Shot', range: 220, min: 60, cd: 5, fn: function (E, e, p, a) { E._shoot(e, a, 170, e.dmg * 0.6, '#e8e8f4', 'web', 2); } },
    skeleton: { name: 'Bone Throw', range: 240, min: 100, cd: 4.5, fn: function (E, e, p, a) { E._shoot(e, a, 160, e.dmg, '#d8d4c0', 'bone', 2); } },
    snake: { name: 'Venom Spit', range: 200, min: 70, cd: 4, fn: function (E, e, p, a) { E._shoot(e, a, 190, e.dmg * 0.8, '#9aff3a', 'venom', 2); } },
    ghoul: { name: 'Pack Howl', range: 300, min: 0, cd: 8, fn: function (E, e) { rageNear(E, e, 300, 5); } },
    scorpion: { name: 'Stinger Volley', range: 220, min: 70, cd: 5.5, fn: function (E, e, p, a) { fan(E, e, a, 3, 0.25, 200, e.dmg * 0.7, '#d0c020', 'venom', 1.6); } },
    ghost: { name: 'Hex', range: 280, min: 80, cd: 7, fn: function (E, e, p, a) { E._shoot(e, a, 100, e.dmg * 0.6, '#b06aff', 'curse', 3); E.projectiles[E.projectiles.length - 1].ghost = true; } }
    // demon (fireball fans + hellfire zones) and dragon (fire breath + tail slam) already have their own unique attacks in _think
  };

  var TYPES = {
    bat:     { name: 'Cave Bat', hp: 6, spd: 95, dmg: 4, r: 6, xp: 3, color: '#6b5a8a', w: 1, blood: '#4a0e22' },
    slime:   { name: 'Slime', hp: 22, spd: 42, dmg: 6, r: 12, xp: 6, color: '#58c46a', w: 1, blood: '#3a9a4a' },
    archer:  { name: 'Skeleton Archer', hp: 16, spd: 55, dmg: 7, r: 9, xp: 8, color: '#d8d4c0', w: 0.8, bone: true },
    charger: { name: 'Goblin Charger', hp: 30, spd: 62, dmg: 10, r: 10, xp: 10, color: '#7aa83a', w: 0.8 },
    spitter: { name: 'Mushroom Spitter', hp: 20, spd: 0, dmg: 5, r: 10, xp: 8, color: '#c8506a', w: 0.7 },
    spider:  { name: 'Cave Spider', hp: 14, spd: 100, dmg: 5, r: 8, xp: 7, color: '#3a3040', w: 0.9, poison: true, blood: '#5a7a1a' },
    skeleton: { name: 'Bone Warrior', hp: 26, spd: 58, dmg: 9, r: 10, xp: 12, color: '#d8d4c0', w: 0.8, min: 2, bone: true },
    snake:   { name: 'Pit Viper', hp: 15, spd: 85, dmg: 5, r: 7, xp: 9, color: '#4a9a3a', w: 0.7, min: 2, poison: true, blood: '#6a8a1a' },
    ghoul:   { name: 'Ghoul', hp: 34, spd: 72, dmg: 9, r: 10, xp: 14, color: '#8a9a7a', w: 0.7, min: 3, vamp: true, bone: true, blood: '#5a1a1a' },
    scorpion: { name: 'Crypt Scorpion', hp: 30, spd: 48, dmg: 8, r: 10, xp: 14, color: '#b0702a', w: 0.6, min: 3, poison: true, armored: true, blood: '#a0a020' },
    ghost:   { name: 'Wailing Ghost', hp: 18, spd: 50, dmg: 7, r: 9, xp: 16, color: '#a8d8e8', w: 0.5, min: 4, ghost: true, blood: '#8ad0e0' },
    demon:   { name: 'Cinder Demon', hp: 52, spd: 55, dmg: 12, r: 12, xp: 28, color: '#c02a1a', w: 0.45, min: 6, fire: true, blood: '#401008' },
    dragon:  { name: 'Drake', hp: 210, spd: 50, dmg: 18, r: 17, xp: 120, color: '#a83a24', w: 0.06, min: 8, fire: true, bone: true, telRad: 80, blood: '#6a0c10' }
  };
  var AFFIXES = ['Swift', 'Armored', 'Vampiric', 'Explosive', 'Frenzied', 'Shielded'];
  var AFFIX_COLOR = { Swift: '#6ad8ff', Armored: '#b0b8c8', Vampiric: '#ff4a6a', Explosive: '#ff9a2a', Frenzied: '#ff5a2a', Shielded: '#7a9aff' };
  var BOSSES = [
    // signature attacks: Grukk 'rush' (3 chained charges), Vexa 'burrow' (dives, resurfaces under the player), Mortis 'bombard' (marked blast zones)
    { name: 'Grukk the Warlord', look: 'goblin', color: '#5a9a3a', minion: 'charger', biome: 0, intro: 'WAR!', p1: ['charge', 'slam', 'summon'], p2: ['rush', 'slam', 'ring', 'charge'] },
    { name: 'Vexa, Brood Mother', look: 'spider', color: '#7a3a8a', minion: 'spider', biome: 1, intro: 'SKITTER...', p1: ['volley', 'burrow', 'summon'], p2: ['volley', 'burrow', 'ring', 'burrow', 'summon'] },
    { name: 'Mortis the Lich', look: 'archer', color: '#6ad0c0', minion: 'archer', biome: 2, intro: 'KNEEL.', p1: ['bombard', 'summon', 'volley'], p2: ['bombard', 'ring', 'volley', 'bombard', 'summon'] },
    { name: 'Pyraxis the Ember Drake', look: 'dragon', color: '#c8452a', minion: 'demon', biome: 2, intro: 'BURN.', p1: ['volley', 'slam', 'bombard', 'summon'], p2: ['volley', 'ring', 'bombard', 'charge', 'slam', 'bombard'] }
  ];
  var BLOOD = '#7a0f14', BONE = '#d8d4c0';
  var nextId = 1;

  function playerOf() { return CC.state && CC.state.player; }
  function hurtPlayer(p, amt, e, kind) {
    if (!p || p.hp <= 0 || (p.invuln > 0)) return 0;
    if (p.cursed > 0) amt *= 1.25; // Hex: cursed players take 25% more damage
    var dmg = Math.max(1, Math.round(amt * 100 / (100 + (p.armor || 0))));
    p.hp -= dmg; p.invuln = 0.45; p.hurtFlash = 0.2;
    if (e && e.vamp) e.hp = Math.min(e.maxHp, e.hp + dmg * 0.5);
    if (kind === 'poison' || kind === 'web') { p._poison = { t: 3, dps: Math.max(1, amt * 0.25), acc: 0 }; if (kind === 'web') p.slowT = 1.5; } // slowT: data for the player code
    else if (kind === 'curse') p.cursed = 5;
    else if (kind === 'fire') p._poison = { t: 2.5, dps: Math.max(1, amt * 0.3), acc: 0, fire: true }; // burning reuses the DoT slot
    if (CC.fx) { if (CC.fx.shake) CC.fx.shake(2); if (CC.fx.text) CC.fx.text(p.x, p.y - 14, '-' + dmg, '#ff5a5a', 12); }
    return dmg;
  }
  function move(e, dx, dy) {
    var D = CC.Dungeon, hit = false;
    if (D && D.moveWithCollision) { var r = D.moveWithCollision(e, dx, dy); hit = r && (r.hitX || r.hitY); }
    else { e.x += dx; e.y += dy; }
    return hit;
  }

  // ---------- walls: all of this reads CC.Dungeon (tile grid = single source of truth) ----------
  function solid(x, y) { var D = CC.Dungeon; return !!(D && D.isSolid && D.isSolid(x, y)); }
  // circle of radius r at (x,y) is fully on walkable ground (centre + 8 points on its rim)
  function free(x, y, r) {
    if (solid(x, y)) return false;
    for (var k = 0; k < 8; k++) if (solid(x + Math.cos(k * 0.7854) * r, y + Math.sin(k * 0.7854) * r)) return false;
    return true;
  }
  // move an enemy to the nearest open spot (tile centres, expanding rings) if it was placed inside/against a wall
  function settle(e) {
    var D = CC.Dungeon;
    if (!D || !D.isSolid || free(e.x, e.y, e.r)) return e;
    var T = CC.TILE || 32, tx = Math.floor(e.x / T), ty = Math.floor(e.y / T), best = null, bd = 1e12, ring, ax, ay, cx, cy, dd;
    for (ring = 0; ring <= 30 && !best; ring++) {
      for (ay = -ring; ay <= ring; ay++) for (ax = -ring; ax <= ring; ax++) {
        if (Math.max(Math.abs(ax), Math.abs(ay)) !== ring) continue;
        cx = (tx + ax) * T + T / 2; cy = (ty + ay) * T + T / 2;
        if (!free(cx, cy, e.r)) continue;
        dd = (cx - e.x) * (cx - e.x) + (cy - e.y) * (cy - e.y);
        if (dd < bd) { bd = dd; best = { x: cx, y: cy }; }
      }
    }
    if (best) { e.x = best.x; e.y = best.y; }
    else if (D.spawn) { e.x = D.spawn.x; e.y = D.spawn.y; } // nothing open nearby: fall back to the known-walkable spawn tile
    return e;
  }
  // can a body of radius r travel the straight line (x0,y0)->(x1,y1) without touching a wall?
  function clearLine(x0, y0, x1, y1, r) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(len / 6)), nx = -dy / (len || 1) * r * 0.8, ny = dx / (len || 1) * r * 0.8;
    for (var i = 0; i <= n; i++) {
      var px = x0 + dx * i / n, py = y0 + dy * i / n;
      if (solid(px, py) || solid(px + nx, py + ny) || solid(px - nx, py - ny)) return false;
    }
    return true;
  }
  // distance along a ray to the first wall (capped at max); used to clip telegraphs
  function rayLen(x, y, ang, max) {
    var c = Math.cos(ang), s = Math.sin(ang);
    for (var d = 4; d < max; d += 4) if (solid(x + c * d, y + s * d)) return d - 4;
    return max;
  }
  // tile flow field: BFS distance from the player's tile over walkable tiles; rebuilt when the player changes tile
  var field = null;
  function flowFor(p) {
    var D = CC.Dungeon;
    if (!D || !D.tiles || !D.isSolidTile) return null;
    var T = CC.TILE || 32, W = D.w, H = D.h, tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    if (field && field.tiles === D.tiles && field.tx === tx && field.ty === ty) return field;
    var dist = new Int16Array(W * H).fill(-1), q = new Int32Array(W * H), h = 0, t = 0, i;
    if (!D.isSolidTile(tx, ty)) {
      i = ty * W + tx; dist[i] = 0; q[t++] = i;
      while (h < t) {
        var c = q[h++], cx = c % W, cy = (c / W) | 0, nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
        for (var k = 0; k < 4; k++) {
          var nx = nb[k][0], ny = nb[k][1];
          if (D.isSolidTile(nx, ny)) continue;
          var ni = ny * W + nx;
          if (dist[ni] < 0) { dist[ni] = dist[c] + 1; q[t++] = ni; }
        }
      }
    }
    field = { tiles: D.tiles, tx: tx, ty: ty, dist: dist, W: W, H: H, T: T };
    return field;
  }
  // angle an enemy should walk to reach the player: straight when the way is clear, else along the tile path
  function steer(e, p, ang) {
    if (clearLine(e.x, e.y, p.x, p.y, e.r)) { e.los = true; return ang; }
    e.los = false;
    var F = flowFor(p);
    if (!F) return ang;
    var D = CC.Dungeon, T = F.T, tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
    if (tx < 0 || ty < 0 || tx >= F.W || ty >= F.H) return ang;
    var own = F.dist[ty * F.W + tx];
    if (own < 0) return ang;
    var best = null, bd = own, ax, ay;
    for (ay = -1; ay <= 1; ay++) for (ax = -1; ax <= 1; ax++) {
      if (!ax && !ay) continue;
      var nx = tx + ax, ny = ty + ay;
      if (D.isSolidTile(nx, ny) || (ax && ay && (D.isSolidTile(tx + ax, ty) || D.isSolidTile(tx, ty + ay)))) continue; // no corner cutting
      var dv = F.dist[ny * F.W + nx];
      if (dv >= 0 && dv - (ax && ay ? 0.4 : 0) < bd) { bd = dv - (ax && ay ? 0.4 : 0); best = { x: nx * T + T / 2, y: ny * T + T / 2 }; }
    }
    if (!best) return ang;
    // when already in the player's tile (own 0) or the next tile is the goal, aim at the player
    return Math.atan2(best.y - e.y, best.x - e.x);
  }

  function make(type, x, y, floor, opts) {
    var d = TYPES[type], hs = 1 + 0.18 * (floor - 1), e = {
      id: nextId++, type: type, name: d.name, x: x, y: y, r: d.r, hp: 0, maxHp: 0, dmg: Math.round(d.dmg * (1 + 0.12 * (floor - 1))),
      spd: d.spd, xp: d.xp, color: d.color, state: 'idle', t: 0, cd: 0.5 + R() * 1.5, face: 1, flash: 0, slow: 0, burn: 0,
      asleep: true, dead: false, contact: 0, size: 0, floor: floor, ang: 0, tele: null, group: 0, anim: R() * 10, strafe: R() < 0.5 ? 1 : -1
    };
    opts = opts || {};
    e.maxHp = Math.round(d.hp * hs * HP_MULT); e.hp = e.maxHp;
    e.poison = !!d.poison; e.ghost = !!d.ghost; e.fireproof = !!d.fire; e.vamp = !!d.vamp; e.armored = !!d.armored; if (d.telRad) e.telRad = d.telRad;
    if (type === 'slime') { e.size = opts.size === undefined ? 2 : opts.size; e.r = [6, 9, 13][e.size]; e.maxHp = e.hp = Math.round(d.hp * hs * HP_MULT * [0.3, 0.55, 1][e.size]); e.dmg = Math.round(e.dmg * [0.6, 0.8, 1][e.size]); }
    return settle(e); // never spawn inside / overlapping a wall
  }
  function makeElite(e) {
    var n = R() < 0.3 ? 2 : 1, pool = AFFIXES.slice(), names = [];
    e.elite = true; e.affixes = [];
    while (n-- > 0) { var a = pool.splice(Math.floor(R() * pool.length), 1)[0]; e.affixes.push(a); names.push(a); }
    e.maxHp = e.hp = Math.round(e.maxHp * 2.4); e.dmg = Math.round(e.dmg * 1.4); e.xp *= 4; e.r += 2;
    if (e.affixes.indexOf('Swift') >= 0) e.spd *= 1.4;
    if (e.affixes.indexOf('Armored') >= 0) e.armored = true;
    if (e.affixes.indexOf('Vampiric') >= 0) e.vamp = true;
    if (e.affixes.indexOf('Frenzied') >= 0) e.frenzy = true;
    if (e.affixes.indexOf('Shielded') >= 0) e.shield = Math.round(e.maxHp * 0.35);
    e.name = names.join(' ') + ' ' + e.name;
    return settle(e); // radius grew
  }
  // boss type: by floor (every 5th floor cycles Grukk, Vexa, Mortis); an explicit index overrides (tests, biome-forced bosses)
  function makeBoss(floor, x, y, forceIdx) {
    var idx = forceIdx >= 0 && forceIdx < BOSSES.length ? forceIdx | 0 : (Math.max(1, Math.floor(floor / 5)) - 1) % BOSSES.length, B = BOSSES[idx], tier = Math.max(1, Math.floor(floor / 5));
    var e = make('charger', x, y, floor);
    e.type = 'boss'; e.boss = true; e.bossIdx = idx; e.def = B; e.name = B.name; e.color = B.color; e.r = 20; e.phase = 1; e.asleep = true;
    e.bar = { name: B.name, pct: 1, phase: 1, phases: 2, color: B.color, intro: 0 }; // health bar data, kept current by update()
    e.maxHp = e.hp = Math.round(380 * (1 + 0.55 * (tier - 1)) + floor * 6);
    e.dmg = Math.round(12 * (1 + 0.12 * (floor - 1))); e.spd = 58; e.xp = 120 * tier; e.atkIdx = 0; e.cd = 1.2; e.invuln = 0;
    return settle(e);
  }

  var E = CC.Enemies = {
    list: [], projectiles: [], zones: [], remains: [], gore: [], piles: [], boss: null, bossBar: null, TYPES: TYPES, AFFIXES: AFFIXES, BOSSES: BOSSES, _time: 0,
    setRandom: function (fn) { rnd = fn || Math.random; },
    alive: function () { return this.list.filter(function (e) { return !e.dead; }); },

    spawnForFloor: function (floor, points) {
      floor = Math.max(1, floor | 0 || 1);
      this.list.length = 0; this.projectiles.length = 0; this.boss = null; this.zones = []; this.remains = []; this.gore = []; this.piles = [];
      if (CC.Loot && CC.Loot.clear) CC.Loot.clear();
      var names = Object.keys(TYPES), D = CC.Dungeon, group = 1;
      points = points || [];
      for (var i = 0; i < points.length; i++) {
        var pt = points[i], px = pt.x, py = pt.y;
        // weighted pick; harder types unlock with depth
        var tot = 0, dragons = this.list.filter(function (x) { return x.type === 'dragon'; }).length;
        var w = names.map(function (n) { // depth gate: a type only appears from its min floor; dragons are rare and capped at one per floor
          var td = TYPES[n], v = td.w * ((n === 'charger' || n === 'archer') && floor < 2 ? 0.4 : 1);
          if (td.min && floor < td.min) v = 0;
          else if (td.min) v *= 1 + Math.min(1, (floor - td.min) * 0.1);
          if (n === 'dragon' && dragons >= 1) v = 0;
          tot += v; return v;
        });
        var r = R() * tot, type = names[0];
        for (var k = 0; k < names.length; k++) { r -= w[k]; if (r < 0) { type = names[k]; break; } }
        var eliteChance = Math.min(0.25, 0.04 + floor * 0.012);
        if (type === 'bat' || type === 'ghoul') { // swarm / pack: woken together
          var n = type === 'bat' ? 3 + Math.floor(R() * 2) : 2 + Math.floor(R() * 2); group++;
          for (var b = 0; b < n; b++) { var bt = make(type, px + (R() - 0.5) * 30, py + (R() - 0.5) * 30, floor); bt.group = group; this.list.push(bt); }
        } else {
          var e = make(type, px, py, floor);
          if (R() < eliteChance) makeElite(e);
          this.list.push(e);
        }
      }
      if (floor % 5 === 0) {
        var bp = (D && D.boss) || (D && D.stairs && { x: D.stairs.x - 60, y: D.stairs.y }) || points[points.length - 1] || { x: 200, y: 200 };
        this.boss = makeBoss(floor, bp.x, bp.y);
        this.list.push(this.boss);
      }
      return this.list;
    },

    // spawn one enemy of a given type (also used by summons/tests); opts.elite forces an elite
    spawn: function (type, x, y, floor, opts) {
      floor = Math.max(1, floor | 0 || 1);
      var e = type === 'boss' ? makeBoss(floor, x, y, opts && opts.bossIdx) : make(type, x, y, floor, opts);
      if (opts && opts.elite) makeElite(e);
      if (opts && opts.awake) e.asleep = false;
      this.list.push(e);
      if (e.boss) this.boss = e;
      return e;
    },

    queryCircle: function (x, y, r) {
      var out = [];
      for (var i = 0; i < this.list.length; i++) { var e = this.list[i]; if (!e.dead && Math.hypot(e.x - x, e.y - y) <= r + e.r) out.push(e); }
      return out;
    },
    nearest: function (x, y, range) {
      var best = null, bd = range || 1e9;
      for (var i = 0; i < this.list.length; i++) { var e = this.list[i]; if (e.dead) continue; var d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
      return best;
    },

    damage: function (e, amount, type) {
      if (!e || e.dead || amount <= 0) return 0;
      if (e.boss && e.invuln > 0) return 0;
      if (e.collapsed) return 0; // a collapsed skeleton is just a pile of bones until it reassembles
      type = type || 'melee';
      if (e.fireproof && type === 'fire') amount *= 0.3;
      if (e.ghost && e.eth && type === 'melee') amount *= 0.35; // faded ghosts barely feel steel
      if (e.armored) amount *= 0.65;
      if (e.state === 'stunned') amount *= 1.5;
      amount = Math.max(1, Math.round(amount));
      e.asleep = false; e.flash = 0.12;
      var dealt = amount;
      if (e.shield > 0) { var ab = Math.min(e.shield, amount); e.shield -= ab; amount -= ab; }
      e.hp -= amount;
      this._hitGore(e, dealt, type);
      if (type === 'frost') e.slow = 2;
      if (type === 'fire') e.burn = 3, e.burnDps = Math.max(1, dealt * 0.2);
      if (CC.fx && CC.fx.text) CC.fx.text(e.x, e.y - e.r - 6, String(dealt), type === 'fire' ? '#ff9a3a' : type === 'frost' ? '#8ad8ff' : type === 'necro' ? '#a8ff9a' : '#ffffff', 11);
      if (e.group) for (var i = 0; i < this.list.length; i++) if (this.list[i].group === e.group) this.list[i].asleep = false;
      if (e.boss && e.phase === 1 && e.hp <= e.maxHp * 0.5 && e.hp > 0) this._phase2(e);
      if (e.hp <= 0) this._kill(e); else this._dismember(e);
      return dealt;
    },

    _phase2: function (e) {
      e.phase = 2; e.invuln = 1.2; e.state = 'idle'; e.t = 1.2; e.tele = null; e.spd *= 1.3; e.atkIdx = 0; e.enraged = true;
      e.hidden = false; e.chain = 0; this.zones.length = 0; if (e.bar) e.bar.phase = 2;
      this._blast(e.x, e.y, 80, 0); // visual shockwave on the phase change
      if (CC.fx) { if (CC.fx.shake) CC.fx.shake(8); if (CC.fx.text) CC.fx.text(e.x, e.y - 40, 'ENRAGED!', '#ff5a3a', 16); }
    },

    _kill: function (e) {
      if (e.dead) return;
      if (e.type === 'skeleton' && !e.rose) { // first death: collapse into bones, rise again at 40% HP
        e.rose = true; e.collapsed = true; e.state = 'collapsed'; e.t = 1.6; e.hp = Math.ceil(e.maxHp * 0.4); e.burn = 0; e.tele = null; e.shield = 0;
        this._remains(e, true); this._goreBurst(e, true);
        if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y, BONE, 12, 90);
        return;
      }
      e.dead = true; e.hp = 0; e.deadT = 0;
      this._remains(e); this._goreBurst(e, false);
      if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y, (TYPES[e.type] && TYPES[e.type].blood) || BLOOD, e.boss ? 30 : 8, e.boss ? 180 : 80);
      if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y, e.color, e.boss ? 40 : 10, e.boss ? 200 : 100);
      if (CC.addKill) CC.addKill(e);
      var p = playerOf();
      if (p && CC.Classes && CC.Classes.gainXp) CC.Classes.gainXp(Math.round(e.xp * (1 + 0.1 * (e.floor - 1))));
      if (p && CC.Classes && CC.Classes.onKill) CC.Classes.onKill(e);
      if (e.boss) this._bossDeath(e);
      else if (CC.Loot && CC.Loot.roll) CC.Loot.roll(e, e.floor, 0);
      if (e.type === 'slime' && e.size > 0) {
        for (var i = 0; i < 2; i++) {
          var s = make('slime', e.x + (i ? 8 : -8), e.y, e.floor, { size: e.size - 1 }); s.asleep = false; s.cd = 0.6; this.list.push(s);
        }
      }
      if (e.affixes && e.affixes.indexOf('Explosive') >= 0) {
        this._blast(e.x, e.y, 56, e.dmg * 1.5);
      }
      if (e.boss && CC.fx && CC.fx.shake) CC.fx.shake(12);
    },
    // death remains: blood pool + splatter, bones (skeletal types), ichor (insects/snakes), scorch (fire types), fading wisps (ghosts)
    _remains: function (e, bonesOnly) {
      var d = TYPES[e.type] || {}, big = e.boss ? 3 : e.r > 14 ? 2 : 1, a = this.remains, i, bc = d.blood || BLOOD;
      function add(kind, ox, oy, s, col, life) {
        a.push({ kind: kind, x: e.x + ox, y: e.y + oy, s: s, col: col, seed: Math.floor(R() * 9000) + 1, life: life || 0, t: 0 });
        if (!bonesOnly && !e.risen) { if (kind === 'bone') E._pileAdd(e.x + ox, e.y + oy, 1); else if (kind === 'skull') E._pileAdd(e.x + ox, e.y + oy, 2); }
      }
      if (bonesOnly) { for (i = 0; i < 4; i++) add('bone', (R() - 0.5) * e.r * 2, (R() - 0.5) * e.r * 2, 0.8 + R() * 0.5, BONE); add('skull', 0, 2, 1, BONE); }
      else if (e.ghost) { add('wisp', 0, 0, e.r * 1.6, bc, 7); }
      else {
        add('pool', 0, 0, e.r * (1.1 + 0.3 * big), bc);
        for (i = 0; i < 2 + big * 2; i++) add('splat', (R() - 0.5) * e.r * 3.2, (R() - 0.5) * e.r * 3.2, 1.5 + R() * 2 * big, bc);
        if (d.bone || e.boss) { for (i = 0; i < big + 1; i++) add('bone', (R() - 0.5) * e.r * 2.4, (R() - 0.5) * e.r * 2.4, 0.8 + R() * 0.6 * big, BONE); if (e.boss || e.type === 'ghoul' || e.type === 'dragon') add('skull', (R() - 0.5) * e.r, (R() - 0.5) * e.r, big, BONE); }
        if (d.fire) add('scorch', 0, 0, e.r * 1.5, '#140806');
      }
      this._capRemains();
    },
    // keep decals light: drop the oldest fading decal first, else the oldest remain
    _capRemains: function () {
      var a = this.remains, j;
      while (a.length > REMAINS_CAP) {
        for (j = 0; j < a.length; j++) if (a[j].life) break;
        a.splice(j < a.length ? j : 0, 1);
      }
    },
    _addRemain: function (kind, x, y, s, col, life) {
      this.remains.push({ kind: kind, x: x, y: y, s: s, col: col, seed: Math.floor(R() * 9000) + 1, life: life || 0, t: 0 });
      this._capRemains();
    },
    // one flying piece of gore: blood droplet, chunk, bone or skull; pool > 0 means it lands as a blood pool of that size
    _gorePart: function (x, y, vx, vy, vz, kind, col, s, pool) {
      if (GORE <= 0) return;
      if (this.gore.length >= GORE_PARTS_CAP) this.gore.shift();
      var gq = { x: x, y: y, z: 4 + R() * 8, vx: vx, vy: vy, vz: vz, kind: kind, col: col, s: s, pool: pool || 0, rot: R() * PI2, spin: (R() - 0.5) * 24, t: 0 };
      this.gore.push(gq);
      return gq;
    },
    _bloodOf: function (e) { var d = TYPES[e.type] || {}; return d.blood || BLOOD; },
    _boney: function (e) { var d = TYPES[e.type] || {}; return !!(d.bone || e.boss); },
    // death: blood and chunks (and bones for bony types) fly out; some travel several tiles, rarely a huge explosion
    _goreBurst: function (e, bonesOnly) {
      if (GORE <= 0 || e.ghost) return;
      var big = e.boss ? 3 : e.r > 14 ? 2 : 1, bc = this._bloodOf(e), boney = bonesOnly || this._boney(e), i;
      var huge = !bonesOnly && R() < (e.boss ? 0.5 : 0.05), n = Math.min(44, Math.round((5 + big * 5 + e.r * 0.4) * (huge ? 2.2 : 1) * GORE));
      for (i = 0; i < n; i++) {
        var a = R() * PI2, far = huge ? R() < 0.6 : R() < 0.18, sp = far ? 190 + R() * (huge ? 260 : 130) : 50 + R() * 110, vz = far ? 140 + R() * 100 : 50 + R() * 110;
        var kind = bonesOnly ? 'bone' : boney && R() < 0.4 ? (big >= 2 && R() < 0.12 ? 'skull' : 'bone') : R() < 0.22 ? 'chunk' : 'blood';
        var gp = this._gorePart(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, vz, kind, kind === 'bone' || kind === 'skull' ? BONE : bc, 0.7 + R() * 0.8, kind === 'blood' && far ? 4 + R() * 3 : 0);
        if (gp && (bonesOnly || e.risen)) gp.nopile = true; // collapse bursts and risen skeletons never feed a pile
      }
      if (huge && CC.fx && CC.fx.text) CC.fx.text(e.x, e.y - 22, 'GIBBED!', '#ff3a3a', 13);
    },
    // a jet of blood in direction ang (a spurt, or a slosh); the leading drop lands as a pool
    _spurt: function (e, ang, n, pow, col) {
      if (GORE <= 0) return;
      for (var i = 0; i < n; i++) {
        var a = ang + (R() - 0.5) * 0.55, sp = pow * (0.6 + R() * 0.6);
        this._gorePart(e.x + Math.cos(ang) * e.r * 0.8, e.y + Math.sin(ang) * e.r * 0.8, Math.cos(a) * sp, Math.sin(a) * sp, 40 + R() * 70, 'blood', col, 0.9 + R() * 0.9, i === 0 ? 5 + R() * 3 : 0);
      }
    },
    _hitGore: function (e, dealt, type) {
      if (GORE <= 0 || e.ghost || this._time - (e._hgT || -1) < 0.1) return;
      e._hgT = this._time;
      var p = playerOf(), away = p ? Math.atan2(e.y - p.y, e.x - p.x) : R() * PI2, d = TYPES[e.type] || {};
      if (d.bone && !d.blood) { for (var i = 0; i < 2; i++) { var cp = this._gorePart(e.x, e.y, Math.cos(away + (R() - 0.5)) * 90, Math.sin(away + (R() - 0.5)) * 90, 60, 'bone', BONE, 0.5); if (cp) cp.nopile = true; } return; }
      var bc = this._bloodOf(e);
      if (dealt >= e.maxHp * 0.25 || R() < 0.12) this._spurt(e, away, Math.round(7 * GORE), 150, bc); // arterial spurt
      else this._spurt(e, away, 2 + Math.round(R() * 2), 90, bc);
    },
    // wounded enemies drip as they walk; closer drips and sometimes a flung drop as HP falls
    _bleed: function (e, dt) {
      var d = TYPES[e.type] || {};
      if (e._bx === undefined) { e._bx = e.x; e._by = e.y; e._bd = 0; }
      var mvd = Math.hypot(e.x - e._bx, e.y - e._by); e._bx = e.x; e._by = e.y;
      if (GORE <= 0 || e.ghost || e.collapsed || e.hp >= e.maxHp || (d.bone && !d.blood)) return;
      var frac = clamp(e.hp / e.maxHp, 0, 1), step = (8 + 34 * frac) / GORE, n = 0;
      e._bd += mvd + (e.spd === 0 ? dt * 14 : 0);
      while (e._bd >= step && n++ < 3) {
        e._bd -= step;
        this._addRemain('drip', e.x + (R() - 0.5) * e.r * 0.8, e.y + e.r * 0.5 + (R() - 0.5) * 3, 1 + (1 - frac) * 1.6, this._bloodOf(e), 30);
        if (frac < 0.35 && R() < 0.3) this._gorePart(e.x, e.y, (R() - 0.5) * 60, (R() - 0.5) * 60, 40 + R() * 40, 'blood', this._bloodOf(e), 0.8, 0);
      }
    },
    // blood-spitting and sloshing types: a spurt toward the player while telegraphing, and a slosh now and then
    _spurtAI: function (e, dt, ang) {
      var S = SPURT[e.type];
      if (!S || GORE <= 0 || e.collapsed) return;
      if (e.state === 'telegraph') { if (!e._sp) { e._sp = true; this._spurt(e, ang, S.n, S.pow, this._bloodOf(e)); } } else e._sp = false;
      e._sl = (e._sl === undefined ? 2 + R() * 4 : e._sl) - dt;
      if (e._sl <= 0) { e._sl = 4 + R() * 5; if (e.hp < e.maxHp * 0.8 || R() < 0.3) this._spurt(e, R() * PI2, Math.ceil(S.n * 0.6), S.pow * 0.6, this._bloodOf(e)); }
    },
    // ---------- dismemberment ----------
    // one body part per equal slice of lost HP (PARTS order); the enemy keeps attacking until hp reaches 0
    _dismember: function (e) {
      if (GORE <= 0 || e.ghost || e.collapsed || e.dead || e.hp <= 0) return;
      var n = PARTS.length, want = Math.min(n, Math.floor((1 - e.hp / e.maxHp) * (n + 1)));
      e.lostN = e.lostN || 0;
      var parts = ANATOMY[e.type] || PARTS;
      while (e.lostN < want) this._detach(e, parts[e.lostN++]);
    },
    _detach: function (e, slot) {
      var d = TYPES[e.type] || {}, boney = this._boney(e);
      var kind = slot === 'head' ? 'head' : slot.indexOf('horn') === 0 ? 'horn' :
        slot.indexOf('leg') === 0 ? 'hoof' : slot === 'chunk' || slot === 'tail' ? 'chunk' : 'limb';
      e.missing = e.missing || {};
      if (slot !== 'chunk' && slot !== 'tail' && e.missing[slot]) return;
      if (slot !== 'chunk') e.missing[slot] = true;
      e.nubs = e.nubs || [];
      if (!e.ghost && !e.collapsed && slot !== 'chunk') e.nubs.push({ slot: slot, t: 0, next: 0 });
      var col = boney && kind !== 'horn' && kind !== 'hoof' ? BONE : e.color;
      var a = R() * PI2, sp = 80 + R() * 90;
      var q = this._gorePart(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp,
        110 + R() * 80, kind, col, 0.9 + R() * 0.5, 0);
      if (q && boney && (kind === 'limb' || kind === 'head')) q.pileN = 2;
      if (!(d.bone && !d.blood)) this._spurt(e, a, 5, 120, this._bloodOf(e));
      if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y, this._bloodOf(e), 5, 70);
    },
    // Anatomy-local position of the severed joint (facing is handled by the sprite).
    _nubPosition: function (e, slot) {
      var r = e.r;
      if (slot === 'head') return { x: 0, y: -r * 0.23 };
      if (slot === 'hornLeft') return { x: -r * 0.55, y: -r * 0.75 };
      if (slot === 'hornRight') return { x: r * 0.55, y: -r * 0.75 };
      if (slot === 'armLeft') return { x: -r * 0.73, y: r * 0.12 };
      if (slot === 'armRight') return { x: r * 0.73, y: r * 0.12 };
      if (slot === 'legLeft') return { x: -r * 0.42, y: r * 0.63 };
      if (slot === 'legRight') return { x: r * 0.42, y: r * 0.63 };
      return { x: -r, y: r * 0.3 };
    },
    _bleedNubs: function (e, dt) {
      if (!e.nubs || !e.nubs.length || GORE <= 0 || e.collapsed || e.dead) return;
      var bone = (TYPES[e.type] || {}).bone && !(TYPES[e.type] || {}).blood;
      if (bone) return;
      for (var i = 0; i < e.nubs.length; i++) {
        var nub = e.nubs[i];
        nub.t += dt; nub.next -= dt;
        if (nub.next > 0) continue;
        nub.next = nub.t < 2 ? 0.13 + R() * 0.16 : 0.7 + R() * 0.7;
        var pt = this._nubPosition(e, nub.slot), face = e.face || 1;
        var ang = Math.atan2(pt.y, pt.x * face) + (R() - 0.5) * 0.4;
        var bx = e.x + pt.x * face, by = e.y + pt.y;
        for (var k = 0; k < (nub.t < 2 ? 3 : 1); k++) {
          var a = ang + (R() - 0.5) * 0.6, v = 75 + R() * 80;
          this._gorePart(bx, by, Math.cos(a) * v, Math.sin(a) * v, 40 + R() * 55,
            'blood', this._bloodOf(e), 0.7 + R() * 0.5, 0);
        }
      }
    },
    // ---------- bone piles ----------
    pileChance: function (bones) { return bones < 6 ? 0 : Math.min(0.7, (bones - 5) * 0.05); },
    _pileAdd: function (x, y, n) {
      var P = this.piles, b = null, i;
      for (i = 0; i < P.length; i++) if (Math.hypot(P[i].x - x, P[i].y - y) < PILE_R) { b = P[i]; break; }
      if (!b) { if (P.length >= PILE_MAX) P.shift(); b = { x: x, y: y, bones: 0, t: 0, done: false }; P.push(b); }
      b.x = (b.x * b.bones + x * n) / (b.bones + n); b.y = (b.y * b.bones + y * n) / (b.bones + n);
      b.bones += n; b.t = 0; b.done = false; // new bones restart the wait and allow another roll
    },
    _updatePiles: function (dt) {
      var P = this.piles, p = playerOf(), i, j;
      for (i = P.length - 1; i >= 0; i--) {
        var b = P[i];
        if (b.done) { if (this.pileChance(b.bones) <= 0) P.splice(i, 1); continue; }
        if ((b.t += dt) < PILE_DELAY) continue;
        if (p && Math.hypot(p.x - b.x, p.y - b.y) < 50) { b.t = PILE_DELAY - 0.5; continue; } // never rises on top of the player
        b.done = true;
        var skels = 0; for (j = 0; j < this.list.length; j++) if (!this.list[j].dead && this.list[j].type === 'skeleton') skels++;
        if (skels >= 12 || R() >= this.pileChance(b.bones)) continue;
        this._rise(b); P.splice(i, 1);
      }
    },
    _rise: function (b) {
      var s = make('skeleton', b.x, b.y, (CC.state && CC.state.floor) || 1), k;
      s.rose = true; s.risen = true; s.asleep = false; s.cd = 0.8; s.xp = Math.round(s.xp * 0.3); s.hp = Math.round(s.maxHp * 0.6);
      this.list.push(s);
      for (k = this.remains.length - 1; k >= 0; k--) { var rm = this.remains[k]; if ((rm.kind === 'bone' || rm.kind === 'skull') && !rm.life && Math.hypot(rm.x - b.x, rm.y - b.y) < PILE_R + 10) this.remains.splice(k, 1); }
      if (CC.fx) { if (CC.fx.burst) CC.fx.burst(b.x, b.y, BONE, 14, 90); if (CC.fx.text) CC.fx.text(b.x, b.y - 16, 'RISES!', '#d8d4c0', 11); }
    },
    // idle movement overlay + unique ranged specials
    _gait: function (e, dt, p, d, ang, f) {
      var sp = e.spd * f * dt, k = 0;
      if (e.type === 'slime') { k = Math.sin(e.anim * 3) * 0.9; move(e, Math.cos(ang) * sp * k, Math.sin(ang) * sp * k); } // hops: surges then stalls
      else if ((e.type === 'charger' || e.type === 'skeleton' || e.type === 'scorpion') && d > 100) { // flankers circle while closing in
        k = e.type === 'scorpion' ? 0.3 : 0.6;
        move(e, -Math.sin(ang) * sp * k * e.strafe, Math.cos(ang) * sp * k * e.strafe);
      }
    },
    _special: function (e, dt, p, d, ang) {
      var S = SPECIAL[e.type];
      if (!S || e.collapsed || e.state !== 'idle' || e.los === false) return;
      if (e.scd === undefined) e.scd = 2 + R() * 3;
      e.scd -= dt;
      if (e.scd > 0 || d > S.range || d < S.min) return;
      e.scd = S.cd * (0.8 + R() * 0.4);
      S.fn(this, e, p, ang);
      if (CC.fx && CC.fx.text) CC.fx.text(e.x, e.y - e.r - 8, S.name + '!', '#ffb0a0', 9);
    },
    _land: function (q) {
      var x = q.x, y = q.y;
      if (q.kind === 'bone') { this._addRemain('bone', x, y, 0.6 + q.s * 0.5, BONE); if (!q.nopile) this._pileAdd(x, y, 1); }
      else if (q.kind === 'limb' || q.kind === 'head' || q.kind === 'armor') { this._addRemain(q.kind, x, y, q.s, q.col); if (q.pileN) this._pileAdd(x, y, q.pileN); }
      else if (q.kind === 'skull') { this._addRemain('skull', x, y, 0.8, BONE); if (!q.nopile) this._pileAdd(x, y, 2); }
      else if (q.kind === 'chunk') { this._addRemain('chunk', x, y, 1 + q.s, q.col); this._addRemain('splat', x, y, 1 + q.s, q.col, 60); }
      else if (q.pool) { this._addRemain('pool', x, y, q.pool, q.col, 60); }
      else this._addRemain('splat', x, y, 0.8 + q.s * 0.7, q.col, 60);
    },
    _updateGore: function (dt) {
      var g = this.gore, D = CC.Dungeon, i;
      for (i = g.length - 1; i >= 0; i--) {
        var q = g[i], nx, ny;
        q.t += dt; q.vz -= 520 * dt; q.z += q.vz * dt; q.rot += q.spin * dt;
        nx = q.x + q.vx * dt; ny = q.y + q.vy * dt;
        if (D && D.isSolid && D.isSolid(nx, ny)) { q.vx = 0; q.vy = 0; } else { q.x = nx; q.y = ny; }
        if (q.z <= 0 || q.t > 2) { this._land(q); g.splice(i, 1); }
      }
    },
    _drawGore: function (ctx, cam, vw, vh) {
      var g = this.gore, i;
      for (i = 0; i < g.length; i++) {
        var q = g[i], sx = q.x - cam.x, sy = q.y - cam.y;
        if (sx < -20 || sx > vw + 20 || sy < -40 || sy > vh + 20) continue;
        var py = sy - Math.max(0, q.z);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, 1.5 + q.s, 1, 0, 0, PI2); ctx.fill();
        if (q.kind === 'blood') {
          ctx.strokeStyle = q.col; ctx.lineWidth = 1 + q.s * 0.6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(sx, py); ctx.lineTo(sx - q.vx * 0.025, py - q.vy * 0.025 + q.vz * 0.025); ctx.stroke(); ctx.lineCap = 'butt';
        } else if (q.kind === 'bone') {
          ctx.save(); ctx.translate(sx, py); ctx.rotate(q.rot); ctx.fillStyle = BONE; ctx.fillRect(-3.5 * q.s - 1, -1, 7 * q.s + 2, 2); ctx.fillRect(-3.5 * q.s - 2, -2, 2, 4); ctx.fillRect(3.5 * q.s, -2, 2, 4); ctx.restore();
        } else if (q.kind === 'skull') {
          ctx.fillStyle = BONE; ctx.beginPath(); ctx.arc(sx, py, 3.5, 0, PI2); ctx.fill(); ctx.fillStyle = '#10080a'; ctx.fillRect(sx - 2, py - 1, 1.5, 1.5); ctx.fillRect(sx + 0.5, py - 1, 1.5, 1.5);
        } else if (q.kind === 'horn' || q.kind === 'hoof') {
          ctx.save(); ctx.translate(sx, py); ctx.rotate(q.rot); ctx.fillStyle = q.col;
          ctx.beginPath(); ctx.moveTo(-4 * q.s, 2 * q.s); ctx.lineTo(4 * q.s, 0);
          ctx.lineTo(-3 * q.s, -2 * q.s); ctx.closePath(); ctx.fill();
          ctx.fillStyle = BLOOD; ctx.fillRect(-4 * q.s, -1, 2, 3); ctx.restore();
        } else if (q.kind === 'limb') {
          ctx.save(); ctx.translate(sx, py); ctx.rotate(q.rot); ctx.fillStyle = q.col; ctx.fillRect(-4 * q.s, -1.5, 8 * q.s, 3); ctx.fillStyle = BLOOD; ctx.fillRect(-4 * q.s - 1, -1.5, 2, 3); ctx.restore();
        } else if (q.kind === 'head') {
          ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(sx, py, 3.5 * q.s, 0, PI2); ctx.fill(); ctx.fillStyle = '#10080a'; ctx.fillRect(sx - 2, py - 1, 1.5, 1.5); ctx.fillRect(sx + 0.5, py - 1, 1.5, 1.5);
        } else if (q.kind === 'armor') {
          ctx.save(); ctx.translate(sx, py); ctx.rotate(q.rot); ctx.fillStyle = q.col; ctx.fillRect(-3.5 * q.s, -2.5, 7 * q.s, 5); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-3.5 * q.s, -2.5, 7 * q.s, 1.5); ctx.restore();
        } else {
          ctx.save(); ctx.translate(sx, py); ctx.rotate(q.rot); ctx.fillStyle = q.col; ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(3, -1); ctx.lineTo(2, 2.5); ctx.lineTo(-2.5, 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,120,120,0.35)'; ctx.fillRect(-1, -1, 2, 1); ctx.restore();
        }
      }
    },
    // boss death: staged rings + burst, then loot that is always Rare or better (CC.Loot.roll gives bosses minRarity Rare; verified and topped up here)
    _bossDeath: function (e) {
      var fx = CC.fx, k;
      e.hidden = false; e.tele = null; e.invuln = 0; e.lootDrops = [];
      this.zones.length = 0;
      for (k = 0; k < 3; k++) this.projectiles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 0, life: 0.35 + k * 0.2, ring: 50 + k * 40, color: k % 2 ? '#ffd24a' : e.color, fx: true });
      if (fx) {
        if (fx.burst) { fx.burst(e.x, e.y, '#ffd24a', 36, 240); fx.burst(e.x, e.y, '#ffffff', 20, 120); }
        if (fx.text) fx.text(e.x, e.y - 40, e.name + ' DEFEATED', '#ffd24a', 15);
        if (fx.hitStop) fx.hitStop(0.15);
      }
      var L = CC.Loot;
      if (!L || !L.roll) return;
      var rolled = L.roll(e, e.floor, 0, { spawn: false }) || [], out = [], has = false, i;
      // a boss never drops a sub-Rare item (Loot.roll can add Common/Uncommon charms): drop those, keep gold/potions/Rare+
      for (i = 0; i < rolled.length; i++) if (!rolled[i].item || rolled[i].item.rarity >= 2) out.push(rolled[i]);
      for (i = 0; i < out.length; i++) if (out[i].item && out[i].item.rarity >= 2) has = true;
      if (!has && L.makeItem && L._spawn) { // guarantee: top up with one Rare item
        var it = L.makeItem(e.floor, 2, L.SLOTS && L.SLOTS.length ? L.SLOTS[Math.floor(R() * L.SLOTS.length)] : 'weapon');
        out.push(L._spawn('item', e.x, e.y, { item: it, rarity: it.rarity, color: it.color }));
      }
      for (i = 0; i < out.length; i++) if (L.drops) L.drops.push(out[i]);
      e.lootDrops = out;
    },
    // marked ground zone: draws a warning, then blasts. kind 'burrow' also moves the owner there and resurfaces it.
    _zone: function (x, y, rad, t, dmg, owner, kind) {
      if (this.zones.length < 24) this.zones.push({ x: x, y: y, rad: rad, t: t, max: t, dmg: dmg, owner: owner || null, kind: kind || 'blast' });
    },
    _updateZones: function (dt) {
      for (var i = this.zones.length - 1; i >= 0; i--) {
        var z = this.zones[i];
        if ((z.t -= dt) > 0) continue;
        this.zones.splice(i, 1);
        this._blast(z.x, z.y, z.rad, z.dmg);
        if (CC.fx && CC.fx.shake) CC.fx.shake(z.kind === 'burrow' ? 5 : 3);
        var o = z.owner;
        if (z.kind === 'burrow' && o && !o.dead) {
          o.hidden = false; o.invuln = 0; o.state = 'recover'; o.t = 0.9;
          if (!solid(z.x, z.y)) { o.x = z.x; o.y = z.y; }
          for (var k = 0; k < 8; k++) this._shoot(o, k * PI2 / 8, 120, o.dmg * 0.6, o.color, 'orb', 2.5);
        }
      }
    },
    _blast: function (x, y, rad, dmg) {
      var p = playerOf();
      this.projectiles.push({ x: x, y: y, vx: 0, vy: 0, r: 0, life: 0.35, ring: rad, color: '#ff9a2a', fx: true });
      if (dmg > 0 && p && Math.hypot(p.x - x, p.y - y) < rad + (p.r || 10) && clearLine(x, y, p.x, p.y, 1)) hurtPlayer(p, dmg, null); // blasts don't pass walls
    },
    _shoot: function (e, ang, spd, dmg, color, kind, life) {
      this.projectiles.push({ x: e.x, y: e.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r: kind === 'arrow' ? 4 : 5, dmg: dmg, life: life || 2.5, color: color, kind: kind || 'orb', hostile: true });
    },

    // ---------- update ----------
    update: function (dt) {
      this._time += dt;
      var p = playerOf(), D = CC.Dungeon, i;
      this._updateZones(dt); this._updateGore(dt); this._updatePiles(dt);
      for (i = this.remains.length - 1; i >= 0; i--) { var rm = this.remains[i]; if (rm.life && (rm.t += dt) > rm.life) this.remains.splice(i, 1); }
      var bs = this.boss;
      if (bs && !bs.dead) { // health bar data for any UI (CC.Enemies.bossBar), refreshed every frame
        bs.bar.pct = clamp(bs.hp / bs.maxHp, 0, 1); bs.bar.phase = bs.phase; bs.bar.intro = Math.max(0, (bs.bar.intro || 0) - dt);
        this.bossBar = bs.asleep ? null : bs.bar;
      } else this.bossBar = null;
      if (p) {
        if (p.invuln > 0) p.invuln -= dt;
        if (p.cursed > 0) p.cursed -= dt;
        if (p.slowT > 0) p.slowT -= dt;
        if (p._poison) { var po = p._poison; po.t -= dt; po.acc += po.dps * dt; if (po.acc >= 1 && p.hp > 1) { var tk = Math.floor(po.acc); po.acc -= tk; p.hp -= tk; } if (po.t <= 0) p._poison = null; }
      }
      for (i = this.list.length - 1; i >= 0; i--) {
        var e = this.list[i];
        if (e.dead) { e.deadT += dt; if (e.deadT > 0.6) this.list.splice(i, 1); continue; }
        e.anim += dt; if (e.flash > 0) e.flash -= dt; if (e.contact > 0) e.contact -= dt;
        this._bleed(e, dt);
        this._bleedNubs(e, dt);
        if (e.invuln > 0) e.invuln -= dt;
        if (e.burn > 0) { e.burn -= dt; e.hp -= (e.burnDps || 1) * dt; if (e.hp <= 0) { this._kill(e); continue; } this._dismember(e); }
        var slowF = e.slow > 0 ? 0.5 : 1; if (e.slow > 0) e.slow -= dt;
        if (!p || p.hp <= 0) continue;
        var dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
        if (e.asleep) { if (d < WAKE) { e.asleep = false; if (e.group) for (var g = 0; g < this.list.length; g++) if (this.list[g].group === e.group) this.list[g].asleep = false; } else continue; }
        if (e.boss && !e.introDone) { // intro when the boss wakes: name banner, shake, brief invulnerable pause
          e.introDone = true; e.bar.intro = 2.2; e.invuln = 1.0; e.state = 'idle'; e.cd = 1.6;
          if (CC.fx) { if (CC.fx.shake) CC.fx.shake(7); if (CC.fx.text) CC.fx.text(e.x, e.y - 44, e.def.intro || 'FIGHT!', e.color, 16); if (CC.fx.burst) CC.fx.burst(e.x, e.y, e.color, 24, 140); }
          this._blast(e.x, e.y, 90, 0);
        }
        e.face = dx >= 0 ? 1 : -1;
        if (e.rage > 0) e.rage -= dt;
        var f = slowF * (e.frenzy ? 1.25 : 1) * (e.rage > 0 ? 1.3 : 1); // rage: from War Cry / Pack Howl
        if (!e.ghost) ang = steer(e, p, ang); // ghosts float straight through walls, no pathing
        // walk the tile path around walls; equals the direct angle when the line is clear
        if (e.boss) this._boss(e, dt, p, d, ang, f); else this._think(e, dt * (e.frenzy ? 1.25 : 1), p, d, ang, f);
        if (!e.boss && d < 420) this._spurtAI(e, dt, ang);
        if (!e.boss) this._special(e, dt, p, d, ang);
        // contact damage while dangerous
        if (e.dangerous && e.contact <= 0 && d < e.r + (p.r || 10)) {
          if (hurtPlayer(p, e.dmg, e, e.poison ? 'poison' : e.fireproof ? 'fire' : null)) e.contact = 0.7;
        }
      }
      // projectiles
      for (i = this.projectiles.length - 1; i >= 0; i--) {
        var q = this.projectiles[i];
        q.life -= dt;
        if (!q.fx) {
          // sub-step so fast shots can't skip a wall; remove the shot at the last open point (the wall edge)
          var nSub = Math.max(1, Math.ceil(Math.max(Math.abs(q.vx), Math.abs(q.vy)) * dt / 3)), hitWall = false;
          for (var sI = 0; sI < nSub; sI++) {
            var nqx = q.x + q.vx * dt / nSub, nqy = q.y + q.vy * dt / nSub;
            if (!q.ghost && D && D.isSolid && D.isSolid(nqx, nqy)) { hitWall = true; break; }
            q.x = nqx; q.y = nqy;
          }
          if (hitWall) {
            q.life = 0;
            if (CC.fx && CC.fx.burst) CC.fx.burst(q.x, q.y, q.color, 3, 40);
          }
          else if (p && q.hostile && Math.hypot(p.x - q.x, p.y - q.y) < q.r + (p.r || 10)) { hurtPlayer(p, q.dmg, null, PROJ_KIND[q.kind] || null); q.life = 0; }
        }
        if (q.life <= 0) this.projectiles.splice(i, 1);
      }
    },

    // per-type AI. States: idle(chase) -> telegraph -> act -> recover/stunned
    _think: function (e, dt, p, d, ang, f) {
      e.cd -= dt; e.dangerous = false;
      if (e.state === 'idle' && !e.collapsed) this._gait(e, dt, p, d, ang, f);
      var sp = e.spd * f * dt, cx = Math.cos(ang), cy = Math.sin(ang);
      switch (e.type) {
        case 'skeleton': // bone warrior: shield-bash lunge; collapses on first death and reassembles
          if (e.collapsed) { if ((e.t -= dt) <= 0) { e.collapsed = false; e.state = 'idle'; e.cd = 0.8; if (CC.fx && CC.fx.burst) CC.fx.burst(e.x, e.y, BONE, 8, 60); } break; }
          dashAI(this, e, dt, d, ang, f, sp, { kind: 'lunge', range: 85, tele: 0.45, act: 0.22, speed: 230, rec: 0.7, cd: 1.2, cdR: 0.8 });
          break;
        case 'ghoul': // fast hunched pack hunter: weaving approach, leaping claws that heal it
          dashAI(this, e, dt, d, ang, f, sp, { kind: 'leap', range: 140, min: 30, tele: 0.35, act: 0.3, speed: 330, rec: 0.5, cd: 1.3, cdR: 1, wob: 0.35, wobF: 5 });
          break;
        case 'scorpion': // armoured crawler: slow, then a fast tail sting that poisons
          dashAI(this, e, dt, d, ang, f, sp, { kind: 'sting', range: 100, tele: 0.5, act: 0.2, speed: 300, rec: 0.9, cd: 1.5, cdR: 1 });
          break;
        case 'snake': // hit and run: weaves, strikes from range, slithers back out
          dashAI(this, e, dt, d, ang, f, sp, { kind: 'strike', range: 120, min: 20, tele: 0.3, act: 0.22, speed: 380, rec: 0.9, cd: 1.0, cdR: 0.8, wob: 0.7, wobF: 7, retreat: 1.3 });
          break;
        case 'ghost': // phases through walls; fades to a barely-hurtable state and cannot touch you then; wails slow ghost-orbs that also pass walls
          e.eth = Math.sin(e.anim * 1.1) > 0.25;
          if (e.state === 'idle') {
            e.dangerous = !e.eth;
            var gd = Math.sin(e.anim * 2.3) * 0.5, gs = sp * (e.eth ? 1.3 : 0.8);
            e.x += Math.cos(ang + gd) * gs; e.y += Math.sin(ang + gd) * gs;
            if (e.cd <= 0 && d < 260) this._tele(e, 'wail', 0.6, ang);
          } else if (e.state === 'telegraph') {
            if ((e.t -= dt) <= 0) {
              for (var gi = -1; gi <= 1; gi++) { this._shoot(e, e.ang + gi * 0.3, 85, e.dmg, '#bfeaff', 'wail', 4); this.projectiles[this.projectiles.length - 1].ghost = true; }
              e.state = 'idle'; e.cd = 2.4 + R() * 1.2; e.tele = null;
            }
          }
          break;
        case 'demon': // keeps its distance, alternates fireball fans and hellfire zones dropped on you
          if (e.state === 'idle') {
            if (d < 140) move(e, -cx * sp, -cy * sp); else if (d > 230) move(e, cx * sp, cy * sp); else move(e, -cy * sp * 0.5 * e.strafe, cx * sp * 0.5 * e.strafe);
            if (e.cd <= 0 && d < 320) this._tele(e, 'cast', 0.7, ang);
          } else if (e.state === 'telegraph') {
            if ((e.t -= dt) <= 0) {
              e.castN = (e.castN || 0) + 1;
              if (e.castN % 2) { for (var fi = -1; fi <= 1; fi++) this._shoot(e, e.ang + fi * 0.3, 130, e.dmg, '#ff6a1a', 'fireball', 3); }
              else for (var zi = 0; zi < 3; zi++) { var hx = p.x + (zi ? (R() - 0.5) * 120 : 0), hy = p.y + (zi ? (R() - 0.5) * 120 : 0); if (solid(hx, hy)) { hx = p.x; hy = p.y; } this._zone(hx, hy, 46, 0.9 + zi * 0.25, e.dmg * 1.2, null, 'blast'); }
              e.state = 'idle'; e.cd = 2 + R(); e.tele = null;
            }
          }
          break;
        case 'dragon': // fire breath cone at range, tail slam up close
          if (e.state === 'idle') {
            if (d > 90) move(e, cx * sp, cy * sp);
            if (e.cd <= 0) { if (d < 90) this._tele(e, 'tail', 0.6, ang); else if (d < 300) this._tele(e, 'breath', 0.9, ang); }
          } else if (e.state === 'telegraph') {
            if ((e.t -= dt) <= 0) {
              if (e.atk === 'tail') { this._blast(e.x, e.y, e.telRad || 80, e.dmg * 1.3); if (CC.fx && CC.fx.shake) CC.fx.shake(5); }
              else { for (var bj = 0; bj < 9; bj++) this._shoot(e, e.ang + (bj - 4) * 0.14, 150 + (bj % 3) * 25, e.dmg * 0.6, '#ff7a1a', 'fireball', 1.1); if (CC.fx && CC.fx.shake) CC.fx.shake(3); }
              e.state = 'recover'; e.t = 0.8; e.tele = null;
            }
          } else if (e.state === 'recover') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 1.6 + R(); } }
          break;
        case 'bat':
          if (e.state === 'idle') {
            var wob = Math.sin(e.anim * 6) * 0.9;
            move(e, Math.cos(ang + wob) * sp, Math.sin(ang + wob) * sp);
            if (e.cd <= 0 && d < 170) this._tele(e, 'dash', 0.35, ang);
          } else if (e.state === 'telegraph') { if ((e.t -= dt) <= 0) { e.state = 'act'; e.t = 0.32; e.tele = null; } }
          else if (e.state === 'act') { e.dangerous = true; move(e, Math.cos(e.ang) * 270 * f * dt, Math.sin(e.ang) * 270 * f * dt); if ((e.t -= dt) <= 0) { e.state = 'recover'; e.t = 0.6; } }
          else if (e.state === 'recover') { move(e, -cx * sp * 0.8, -cy * sp * 0.8); if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 1.2 + R() * 1.2; } }
          break;
        case 'slime':
          if (e.state === 'idle') {
            move(e, cx * sp, cy * sp);
            if (e.cd <= 0 && d < 90) this._tele(e, 'lunge', 0.5, ang);
          } else if (e.state === 'telegraph') { if ((e.t -= dt) <= 0) { e.state = 'act'; e.t = 0.28; e.tele = null; } }
          else if (e.state === 'act') { e.dangerous = true; move(e, Math.cos(e.ang) * 180 * f * dt, Math.sin(e.ang) * 180 * f * dt); if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 1.4 + R(); } }
          break;
        case 'archer':
          if (e.state === 'idle') {
            if (d < 120) move(e, -cx * sp * 1.2, -cy * sp * 1.2);            // flee when crowded
            else if (d > 240) move(e, cx * sp, cy * sp);                     // close in
            else move(e, -cy * sp * 0.6 * e.strafe, cx * sp * 0.6 * e.strafe); // strafe
            if (e.cd <= 0 && d < 300) this._tele(e, 'arrow', 0.7, ang);
          } else if (e.state === 'telegraph') {
            if ((e.t -= dt) <= 0) { this._shoot(e, e.ang, 210, e.dmg, '#e8e0b0', 'arrow', 2); e.state = 'idle'; e.cd = 1.8 + R() * 0.8; e.tele = null; if (R() < 0.4) e.strafe *= -1; }
          }
          break;
        case 'charger':
          if (e.state === 'idle') {
            move(e, cx * sp, cy * sp);
            if (e.cd <= 0 && d < 230 && d > 60) this._tele(e, 'charge', 0.75, ang);
          } else if (e.state === 'telegraph') { if ((e.t -= dt) <= 0) { e.state = 'act'; e.t = 0.7; e.tele = null; } }
          else if (e.state === 'act') {
            e.dangerous = true;
            var hit = move(e, Math.cos(e.ang) * 300 * f * dt, Math.sin(e.ang) * 300 * f * dt);
            if (hit || (e.t -= dt) <= 0) { e.state = hit ? 'stunned' : 'recover'; e.t = hit ? 1.0 : 0.5; if (hit && CC.fx && CC.fx.shake) CC.fx.shake(2); }
          } else if (e.state === 'stunned' || e.state === 'recover') { if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 1.5 + R(); } }
          break;
        case 'spitter':
          if (e.state === 'idle') {
            if (d < 60) move(e, -cx * 30 * dt, -cy * 30 * dt);
            if (e.cd <= 0 && d < 260) this._tele(e, 'spit', 0.6, ang);
          } else if (e.state === 'telegraph') {
            if ((e.t -= dt) <= 0) { for (var s = -1; s <= 1; s++) this._shoot(e, e.ang + s * 0.35, 120, e.dmg, '#b0e050', 'spore', 3); e.state = 'idle'; e.cd = 2.2 + R(); e.tele = null; }
          }
          break;
        case 'spider':
          if (e.hp < e.maxHp * 0.25 && e.state === 'idle' && !e.fled) { e.fled = true; e.state = 'flee'; e.t = 1.5; }
          if (e.state === 'flee') { move(e, -cx * sp * 1.1, -cy * sp * 1.1); if ((e.t -= dt) <= 0) e.state = 'idle'; }
          else if (e.state === 'idle') {
            var side = Math.sin(e.anim * 4) * 0.6;
            move(e, Math.cos(ang + side) * sp, Math.sin(ang + side) * sp);
            if (e.cd <= 0 && d < 140) this._tele(e, 'leap', 0.3, ang);
          } else if (e.state === 'telegraph') { if ((e.t -= dt) <= 0) { e.state = 'act'; e.t = 0.25; e.tele = null; } }
          else if (e.state === 'act') { e.dangerous = true; move(e, Math.cos(e.ang) * 340 * f * dt, Math.sin(e.ang) * 340 * f * dt); if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = 1.2 + R() * 0.8; } }
          break;
      }
    },
    _tele: function (e, kind, time, ang) {
      if (e.los === false) { e.cd = 0.25; return; } // no clear line to the player: keep walking the path, don't attack the wall
      e.state = 'telegraph'; e.t = time; e.ang = ang; e.atk = kind;
      var line = kind === 'dash' || kind === 'charge' || kind === 'arrow' || kind === 'lunge' || kind === 'leap' || kind === 'spit' || kind === 'sting' || kind === 'strike' || kind === 'wail' || kind === 'breath';
      var len = kind === 'arrow' ? 260 : kind === 'charge' ? 210 : kind === 'spit' ? 160 : kind === 'wail' ? 200 : kind === 'breath' ? 190 : kind === 'strike' ? 110 : 90;
      e.tele = { kind: line ? 'line' : 'circle', ang: ang, len: line ? (e.ghost ? len : rayLen(e.x, e.y, ang, len)) : len, rad: e.telRad || 60, max: time }; // line stops at the wall
    },

    // ---------- boss (2 phases) ----------
    _boss: function (e, dt, p, d, ang, f) {
      var B = e.def, sp = e.spd * f * dt, cx = Math.cos(ang), cy = Math.sin(ang);
      e.dangerous = false;
      var set = e.phase === 2 ? B.p2 : B.p1, rate = e.phase === 2 ? 1.35 : 1;
      if (e.state === 'idle') {
        if (d > 70) move(e, cx * sp, cy * sp);
        e.cd -= dt * rate;
        if (e.cd <= 0) {
          var atk = set[e.atkIdx++ % set.length]; e.atk = atk; e.ang = ang; e.state = 'telegraph';
          var tt = { charge: 0.9, rush: 0.8, slam: 0.9, ring: 0.9, summon: 0.8, volley: 0.7, burrow: 0.7, bombard: 0.8 }[atk] / (e.phase === 2 ? 1.25 : 1);
          e.t = tt;
          e.slamRad = e.phase === 2 ? 105 : 72;
          e.tele = atk === 'charge' || atk === 'rush' || atk === 'volley' ? { kind: 'line', ang: ang, len: atk === 'volley' ? 300 : 260, max: tt }
            : { kind: 'circle', rad: atk === 'ring' ? 150 : atk === 'slam' ? e.slamRad : 40, max: tt };
          if (e.tele.kind === 'line') e.tele.len = rayLen(e.x, e.y, ang, e.tele.len);
        }
      } else if (e.state === 'telegraph') {
        if (e.atk === 'charge' && e.tele) { /* line locked at start */ }
        if ((e.t -= dt) <= 0) {
          e.tele = null;
          switch (e.atk) {
            case 'charge': e.state = 'act'; e.t = e.chain > 0 ? 0.5 : 0.8; break;
            case 'rush': e.chain = 2; e.state = 'act'; e.t = 0.5; break; // Grukk: three charges in a row, re-aimed and re-telegraphed between each
            case 'burrow': // Vexa: dives (untouchable), marks the player's spot, resurfaces there with a blast + web ring
              e.hidden = true; e.invuln = 9; e.state = 'burrow'; e.t = 1.6;
              this._zone(p.x, p.y, 70, 0.95, e.dmg * 1.3, e, 'burrow'); break;
            case 'bombard': // Mortis: marks several blast zones around the player, each detonates after its own delay
              for (var z = 0, zn = e.phase === 2 ? 5 : 3; z < zn; z++) {
                var zx = p.x, zy = p.y;
                if (z > 0) { zx += (R() - 0.5) * 140; zy += (R() - 0.5) * 140; if (solid(zx, zy)) { zx = p.x; zy = p.y; } }
                this._zone(zx, zy, 46, 0.9 + z * 0.3, e.dmg, null, 'blast');
              }
              e.state = 'recover'; e.t = 1.0; break;
            case 'slam':
              this._blast(e.x, e.y, e.slamRad, e.dmg * 1.4); if (CC.fx && CC.fx.shake) CC.fx.shake(6);
              e.state = 'recover'; e.t = 0.7; break;
            case 'ring':
              var n = e.phase === 2 ? 16 : 11, off = R() * PI2;
              for (var k = 0; k < n; k++) this._shoot(e, off + k * PI2 / n, 105, e.dmg * 0.7, B.color, 'orb', 3.5);
              e.state = 'recover'; e.t = 0.8; break;
            case 'volley':
              var m = e.phase === 2 ? 7 : 5;
              for (var j = 0; j < m; j++) this._shoot(e, e.ang + (j - (m - 1) / 2) * 0.22, 150, e.dmg * 0.7, B.color, 'orb', 3);
              e.state = 'recover'; e.t = 0.7; break;
            case 'summon':
              var alive = this.list.filter(function (x) { return !x.dead && !x.boss; }).length;
              if (alive < 10) for (var s = 0; s < (e.phase === 2 ? 3 : 2); s++) {
                var mn = make(B.minion, e.x + Math.cos(s * 2.1) * 36, e.y + Math.sin(s * 2.1) * 36, e.floor); mn.asleep = false; this.list.push(mn);
              }
              e.state = 'recover'; e.t = 0.6; break;
          }
        }
      } else if (e.state === 'act') { // charge
        e.dangerous = true;
        var hit = move(e, Math.cos(e.ang) * (e.phase === 2 ? 380 : 320) * f * dt, Math.sin(e.ang) * (e.phase === 2 ? 380 : 320) * f * dt);
        var actDone = (e.t -= dt) <= 0 || hit;
        if (actDone && e.chain > 0) { // next charge of a rush
          e.chain--; e.ang = ang; e.state = 'telegraph'; e.atk = 'charge'; e.t = 0.45;
          e.tele = { kind: 'line', ang: ang, len: rayLen(e.x, e.y, ang, 260), max: 0.45 };
        } else if (actDone) { e.chain = 0; e.state = 'stunned'; e.t = e.phase === 2 ? 0.7 : 1.0; if (hit && CC.fx && CC.fx.shake) CC.fx.shake(5); }
      } else if (e.state === 'burrow') { // underground until its zone fires; failsafe resurfaces if the zone was lost
        if ((e.t -= dt) <= 0) { e.hidden = false; e.invuln = 0; e.state = 'recover'; e.t = 0.6; }
      } else if (e.state === 'stunned' || e.state === 'recover') {
        if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = e.phase === 2 ? 0.7 : 1.3; }
      }
    },

    // ---------- drawing ----------
    draw: function (ctx, cam) {
      var D = CC.Dungeon, vw = cam.w || (ctx.canvas && ctx.canvas.width) || 400, vh = cam.h || (ctx.canvas && ctx.canvas.height) || 700, t = this._time;
      var i, e;
      for (i = 0; i < this.remains.length; i++) { // blood, bones and scorch marks lie under everything else
        var m = this.remains[i], mx = m.x - cam.x, my = m.y - cam.y;
        if (mx < -40 || mx > vw + 40 || my < -40 || my > vh + 40) continue;
        if (D && D.isVisible && !D.isVisible(m.x, m.y)) continue;
        drawRemain(ctx, m, Math.round(mx), Math.round(my));
      }
      for (i = 0; i < this.list.length; i++) {
        e = this.list[i];
        if (e.x < cam.x - 60 || e.x > cam.x + vw + 60 || e.y < cam.y - 60 || e.y > cam.y + vh + 60) continue;
        if (D && D.isVisible && !D.isVisible(e.x, e.y)) continue;
        if (e.tele && !e.dead) drawTele(ctx, e, cam, t);
      }
      for (i = 0; i < this.list.length; i++) {
        e = this.list[i];
        if (e.x < cam.x - 60 || e.x > cam.x + vw + 60 || e.y < cam.y - 60 || e.y > cam.y + vh + 60) continue;
        if (D && D.isVisible && !D.isVisible(e.x, e.y)) continue;
        if (e.hidden) continue; // burrowed boss
        drawEnemy(ctx, e, Math.round(e.x - cam.x), Math.round(e.y - cam.y), t);
        if (e.lostN && !e.dead) { // wound marks: one red stump per detached part
          ctx.fillStyle = '#a01018';
          for (var wk = 0; wk < e.lostN; wk++) ctx.fillRect(Math.round(e.x - cam.x) + (wk - 1.5) * e.r * 0.5 - 1, Math.round(e.y - cam.y) - e.r * 0.2 + (wk % 2) * 3, 3, 3);
        }
      }
      this._drawGore(ctx, cam, vw, vh);
      for (i = 0; i < this.piles.length; i++) { // big bone piles stir as the rise roll nears
        var pl = this.piles[i], ch = this.pileChance(pl.bones), px0 = pl.x - cam.x, py0 = pl.y - cam.y;
        if (ch <= 0 || pl.done || px0 < -30 || px0 > vw + 30 || py0 < -30 || py0 > vh + 30) continue;
        if (D && D.isVisible && !D.isVisible(pl.x, pl.y)) continue;
        ctx.strokeStyle = 'rgba(216,212,192,' + (0.15 + 0.35 * clamp(pl.t / PILE_DELAY, 0, 1)).toFixed(2) + ')'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px0 + Math.sin(t * 25) * pl.t * 0.3, py0, 8 + ch * 10, 0, PI2); ctx.stroke();
      }
      for (i = 0; i < this.zones.length; i++) { // marked blast zones (warning, fills as detonation nears)
        var z = this.zones[i], zp = 1 - clamp(z.t / z.max, 0, 1), zx = z.x - cam.x, zy = z.y - cam.y;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,80,60,' + (0.4 + 0.4 * zp).toFixed(2) + ')'; ctx.fillStyle = 'rgba(255,40,40,' + (0.12 + 0.3 * zp).toFixed(2) + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(zx, zy, z.rad, 0, PI2); ctx.stroke();
        ctx.beginPath(); ctx.arc(zx, zy, z.rad * zp, 0, PI2); ctx.fill();
        ctx.restore();
      }
      for (i = 0; i < this.projectiles.length; i++) {
        var q = this.projectiles[i], sx = q.x - cam.x, sy = q.y - cam.y;
        if (sx < -20 || sx > vw + 20 || sy < -20 || sy > vh + 20) continue;
        if (q.fx) { ctx.strokeStyle = q.color; ctx.globalAlpha = Math.max(0, q.life / 0.35); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, q.ring * (1 - q.life / 0.35), 0, PI2); ctx.stroke(); ctx.globalAlpha = 1; continue; }
        ctx.fillStyle = q.color;
        if (q.kind === 'fireball') { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(sx, sy, q.r + 3, 0, PI2); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(sx, sy, q.r - 1, 0, PI2); ctx.fill(); ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(sx - q.vx * 0.04, sy - q.vy * 0.04, q.r - 2, 0, PI2); ctx.fill(); }
        else if (q.kind === 'wail') { ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(sx, sy, q.r + 1, 0, PI2); ctx.fill(); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(sx - q.vx * 0.06, sy - q.vy * 0.06, q.r + 3, 0, PI2); ctx.fill(); ctx.globalAlpha = 1; }
        else if (q.kind === 'arrow') { ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(q.vy, q.vx)); ctx.fillRect(-7, -1, 14, 2); ctx.fillStyle = '#fff'; ctx.fillRect(5, -2, 3, 4); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(sx, sy, q.r, 0, PI2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(sx - 1, sy - 1, 2, 2); }
      }
      if (this.boss && !this.boss.dead && !this.boss.asleep && !(CC.UI && CC.UI.ownsBossBar)) { // boss bar at top (skipped when ui.js draws its own) of view (world space)
        var b = this.boss, bx = cam.x + 10 - cam.x, by = 8, bw = vw - 20;
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 12);
        ctx.fillStyle = b.phase === 2 ? '#ff3a2a' : '#c03a3a'; ctx.fillRect(bx, by, bw * clamp(b.hp / b.maxHp, 0, 1), 10);
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(bx + bw * 0.5, by, 1, 10);
        ctx.fillStyle = '#fff'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(b.name + (b.phase === 2 ? ' - ENRAGED' : ''), bx + bw / 2, by + 8); ctx.textAlign = 'left';
      }
    }
  };

  // shared telegraph -> dash -> recover loop for the melee lunge monsters (skeleton, ghoul, scorpion, snake)
  function dashAI(E, e, dt, d, ang, f, sp, c) {
    if (e.state === 'idle') {
      var w = c.wob ? Math.sin(e.anim * c.wobF) * c.wob : 0;
      move(e, Math.cos(ang + w) * sp, Math.sin(ang + w) * sp);
      if (e.cd <= 0 && d < c.range && d > (c.min || 0)) E._tele(e, c.kind, c.tele, ang);
    } else if (e.state === 'telegraph') {
      if ((e.t -= dt) <= 0) { e.state = 'act'; e.t = c.act; e.tele = null; }
    } else if (e.state === 'act') {
      e.dangerous = true;
      var h = move(e, Math.cos(e.ang) * c.speed * f * dt, Math.sin(e.ang) * c.speed * f * dt);
      if (h || (e.t -= dt) <= 0) { e.state = 'recover'; e.t = c.rec; }
    } else if (e.state === 'recover') {
      if (c.retreat) move(e, -Math.cos(ang) * sp * c.retreat, -Math.sin(ang) * sp * c.retreat);
      if ((e.t -= dt) <= 0) { e.state = 'idle'; e.cd = c.cd + R() * c.cdR; }
    } else e.state = 'idle';
  }
  function srand(seed) { return function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }; }
  function drawRemain(ctx, m, sx, sy) {
    var rr = srand(m.seed), i, al = m.life ? 1 - m.t / m.life : 1;
    ctx.save(); ctx.translate(sx, sy);
    switch (m.kind) {
      case 'pool':
        ctx.fillStyle = m.col; ctx.globalAlpha = 0.7 * al;
        for (i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse((rr() - 0.5) * m.s * 0.9, (rr() - 0.5) * m.s * 0.6, m.s * (0.4 + rr() * 0.4), m.s * (0.25 + rr() * 0.3), rr() * 3, 0, PI2); ctx.fill(); }
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, m.s * 0.4, m.s * 0.25, 0, 0, PI2); ctx.fill(); break;
      case 'splat':
        ctx.fillStyle = m.col; ctx.globalAlpha = 0.75 * al;
        ctx.beginPath(); ctx.arc(0, 0, m.s, 0, PI2); ctx.fill();
        for (i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc((rr() - 0.5) * m.s * 4, (rr() - 0.5) * m.s * 4, 0.7 + rr() * 1.2, 0, PI2); ctx.fill(); } break;
      case 'bone':
        ctx.rotate(rr() * PI2); ctx.strokeStyle = m.col; ctx.fillStyle = m.col; ctx.lineWidth = 2; ctx.globalAlpha = 0.9 * al;
        var bl = 5 * m.s; ctx.beginPath(); ctx.moveTo(-bl, 0); ctx.lineTo(bl, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(-bl, -1.2, 1.6, 0, PI2); ctx.arc(-bl, 1.2, 1.6, 0, PI2); ctx.arc(bl, -1.2, 1.6, 0, PI2); ctx.arc(bl, 1.2, 1.6, 0, PI2); ctx.fill(); break;
      case 'skull':
        ctx.fillStyle = m.col; ctx.globalAlpha = 0.95 * al; var sk = 3 + m.s * 1.5;
        ctx.beginPath(); ctx.arc(0, 0, sk, 0, PI2); ctx.fill(); ctx.fillRect(-sk * 0.5, sk * 0.4, sk, sk * 0.5);
        ctx.fillStyle = '#10080a'; ctx.fillRect(-sk * 0.55, -sk * 0.3, sk * 0.4, sk * 0.4); ctx.fillRect(sk * 0.15, -sk * 0.3, sk * 0.4, sk * 0.4); break;
      case 'drip': // a single blood drop left by a wounded walker, with a smear
        ctx.fillStyle = m.col; ctx.globalAlpha = 0.8 * al; ctx.beginPath(); ctx.ellipse(0, 0, m.s * 1.2, m.s * 0.8, rr() * 3, 0, PI2); ctx.fill();
        ctx.globalAlpha = 0.5 * al; ctx.beginPath(); ctx.arc((rr() - 0.5) * 5, (rr() - 0.5) * 5, 0.8, 0, PI2); ctx.fill(); break;
      case 'chunk': // torn gobbet of flesh
        ctx.rotate(rr() * PI2); ctx.fillStyle = m.col; ctx.globalAlpha = 0.95 * al;
        ctx.beginPath(); ctx.moveTo(-3 * m.s * 0.6, -2); ctx.lineTo(3 * m.s * 0.6, -1); ctx.lineTo(2 * m.s * 0.6, 2.5); ctx.lineTo(-2.5, 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,140,140,0.35)'; ctx.fillRect(-1, -1, 2, 1); break;
      case 'horn': case 'hoof':
        ctx.rotate(rr() * PI2); ctx.fillStyle = m.col; ctx.globalAlpha = 0.95 * al;
        ctx.beginPath(); ctx.moveTo(-4 * m.s, 2); ctx.lineTo(4 * m.s, 0); ctx.lineTo(-3 * m.s, -2); ctx.fill(); break;
      case 'limb':
        ctx.rotate(rr() * PI2); ctx.fillStyle = m.col; ctx.globalAlpha = 0.95 * al; ctx.fillRect(-4 * m.s, -1.5, 8 * m.s, 3); ctx.fillStyle = '#7a0f14'; ctx.fillRect(-4 * m.s - 1, -1.5, 2, 3); break;
      case 'head':
        ctx.fillStyle = m.col; ctx.globalAlpha = 0.95 * al; ctx.beginPath(); ctx.arc(0, 0, 3.5 * m.s, 0, PI2); ctx.fill();
        ctx.fillStyle = '#10080a'; ctx.fillRect(-2, -1, 1.5, 1.5); ctx.fillRect(0.5, -1, 1.5, 1.5); break;
      case 'armor':
        ctx.rotate(rr() * PI2); ctx.fillStyle = m.col; ctx.globalAlpha = 0.95 * al; ctx.fillRect(-3.5 * m.s, -2.5, 7 * m.s, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-3.5 * m.s, -2.5, 7 * m.s, 1.5); break;
      case 'scorch':
        ctx.fillStyle = m.col; ctx.globalAlpha = 0.5 * al; ctx.beginPath(); ctx.ellipse(0, 0, m.s, m.s * 0.65, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = '#ff6a1a'; ctx.globalAlpha = 0.25 * al; for (i = 0; i < 4; i++) ctx.fillRect((rr() - 0.5) * m.s * 1.4, (rr() - 0.5) * m.s, 2, 2); break;
      case 'wisp':
        ctx.fillStyle = m.col; for (i = 0; i < 4; i++) { ctx.globalAlpha = 0.25 * al; ctx.beginPath(); ctx.arc((rr() - 0.5) * m.s, (rr() - 0.5) * m.s * 0.6 - m.t * 3, 2 + rr() * 3, 0, PI2); ctx.fill(); } break;
    }
    ctx.restore();
  }

  function drawTele(ctx, e, cam, t) {
    var T = e.tele, prog = 1 - clamp(e.t / T.max, 0, 1), sx = e.x - cam.x, sy = e.y - cam.y, a = 0.15 + 0.35 * prog;
    ctx.save();
    ctx.fillStyle = 'rgba(255,40,40,' + a.toFixed(2) + ')'; ctx.strokeStyle = 'rgba(255,80,60,' + (a + 0.2).toFixed(2) + ')'; ctx.lineWidth = 1.5;
    if (T.kind === 'line') {
      ctx.translate(sx, sy); ctx.rotate(T.ang);
      var w = e.boss ? 18 : 7;
      ctx.fillRect(0, -w / 2, T.len * Math.max(0.2, prog), w); ctx.strokeRect(0, -w / 2, T.len, w);
    } else {
      ctx.beginPath(); ctx.arc(sx, sy, T.rad, 0, PI2); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, sy, T.rad * prog, 0, PI2); ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemy(ctx, e, sx, sy, t) {
    ctx.save();
    var dead = e.dead, al = dead ? Math.max(0, 1 - e.deadT / 0.6) : 1, bob = Math.sin(e.anim * 8) * 1.2;
    ctx.globalAlpha = e.ghost ? al * (e.eth ? 0.3 : 0.8) : al;
    var sc = dead ? 1 - e.deadT * 0.5 : 1;
    if (e.elite && !dead) { // elite aura
      var ac = AFFIX_COLOR[e.affixes[0]];
      ctx.strokeStyle = ac; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 5); ctx.beginPath(); ctx.arc(sx, sy, e.r + 4, 0, PI2); ctx.stroke(); ctx.globalAlpha = al;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(sx, sy + e.r * 0.8, e.r * 0.9, e.r * 0.4, 0, 0, PI2); ctx.fill();
    var tele = e.state === 'telegraph', shake = tele ? Math.sin(t * 60) * 1.2 : 0;
    ctx.translate(sx + shake, sy + (e.type === 'bat' ? bob * 2 - 4 : bob * 0.4));
    ctx.scale(e.face * sc, sc);
    var col = e.flash > 0 ? '#ffffff' : e.color, r = e.r;
    if (tele && Math.floor(t * 14) % 2 === 0 && e.flash <= 0) col = '#ff8a7a';
    var dark = shadeC(col, 0.6);
    var look = e.boss ? e.def.look : e.type;
    // Clip away detached anatomy before drawing both base art and horror details.
    // The hole is genuine transparency, not a dark patch painted over the sprite.
    var missing = e.missing || {}, cuts = [], rr0 = r;
    if (missing.head) cuts.push([-r * 0.67, -r * 1.6, r * 1.34, r * 1.37]);
    if (missing.hornLeft) cuts.push([-r * 1.45, -r * 1.65, r * 0.95, r * 0.8]);
    if (missing.hornRight) cuts.push([r * 0.5, -r * 1.65, r * 0.95, r * 0.8]);
    if (missing.armLeft) cuts.push([-r * 2, -r * 0.13, r * 1.35, r * 0.9]);
    if (missing.armRight) cuts.push([r * 0.65, -r * 0.13, r * 1.35, r * 0.9]);
    if (missing.legLeft) cuts.push([-r * 1.1, r * 0.62, r * 0.95, r * 1.1]);
    if (missing.legRight) cuts.push([r * 0.15, r * 0.62, r * 0.95, r * 1.1]);
    ctx.save();
    if (cuts.length) {
      ctx.beginPath(); ctx.rect(-r * 4, -r * 4, r * 8, r * 8);
      for (var ci = 0; ci < cuts.length; ci++) ctx.rect(cuts[ci][0], cuts[ci][1], cuts[ci][2], cuts[ci][3]);
      ctx.clip('evenodd');
    }
    switch (look) {
      case 'bat': // wings flap
        var fl = Math.sin(e.anim * 22) * 5;
        ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r - 6, -fl - 2); ctx.lineTo(-r, 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r + 6, -fl - 2); ctx.lineTo(r, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, PI2); ctx.fill();
        ctx.fillStyle = '#ff4a4a'; ctx.fillRect(-3, -2, 2, 2); ctx.fillRect(1, -2, 2, 2); break;
      case 'slime':
        var sq = 1 + Math.sin(e.anim * 5) * 0.08 + (tele ? -0.25 : 0);
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 2, r * (2 - sq) * 0.95, r * sq * 0.8, 0, Math.PI, 0); ctx.lineTo(r * 0.95, 4); ctx.lineTo(-r * 0.95, 4); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-r * 0.5, -r * 0.4, 3, 3);
        ctx.fillStyle = '#143'; ctx.fillRect(-3, -1, 2, 3); ctx.fillRect(2, -1, 2, 3); break;
      case 'skeleton':
        if (e.collapsed) { ctx.strokeStyle = BONE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r, 4); ctx.lineTo(r * 0.6, 6); ctx.moveTo(-r * 0.6, 7); ctx.lineTo(r, 3); ctx.moveTo(-3, 2); ctx.lineTo(4, 7); ctx.stroke(); ctx.fillStyle = BONE; ctx.beginPath(); ctx.arc(-2, 3, 3.5, 0, PI2); ctx.fill(); break; }
        ctx.fillStyle = '#23232a'; ctx.fillRect(-r * 0.45, -r * 0.1, r * 0.9, r * 0.95);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
        for (var rb = 0; rb < 3; rb++) { ctx.moveTo(-r * 0.5, rb * 3); ctx.lineTo(r * 0.5, rb * 3); }
        ctx.moveTo(0, -r * 0.1); ctx.lineTo(0, r * 0.8); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -r * 0.55, r * 0.55, 0, PI2); ctx.fill();
        ctx.fillStyle = '#10101a'; ctx.fillRect(-r * 0.15, -r * 0.2, r * 0.3, r * 0.25);
        ctx.fillStyle = '#ff3a2a'; ctx.fillRect(-r * 0.4, -r * 0.65, 3, 3); ctx.fillRect(r * 0.15, -r * 0.65, 3, 3);
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-r * 1.0, -r * 0.1, r * 0.4, r * 0.8);
        ctx.strokeStyle = '#9aa4b0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.6); ctx.lineTo(r * 1.4, tele ? -r * 1.2 : -r * 0.5); ctx.stroke(); break;
      case 'ghoul':
        var ga = Math.sin(e.anim * 10) * 2;
        ctx.strokeStyle = dark; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-r * 0.5, 0); ctx.lineTo(-r * 1.2, r * 0.9 + ga); ctx.moveTo(r * 0.5, 0); ctx.lineTo(r * 1.2, r * 0.9 - ga); ctx.stroke();
        ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, r * 0.1, r * 0.8, r * 0.75, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(r * 0.15, -r * 0.55, r * 0.55, 0, PI2); ctx.fill();
        ctx.fillStyle = '#e8d84a'; ctx.fillRect(-r * 0.15, -r * 0.7, 3, 3); ctx.fillRect(r * 0.35, -r * 0.7, 3, 3);
        ctx.fillStyle = '#f0f0e0'; ctx.fillRect(-r * 0.05, -r * 0.3, 2, 3); ctx.fillRect(r * 0.25, -r * 0.3, 2, 3);
        ctx.fillStyle = '#7a1a1a'; ctx.fillRect(-r * 0.4, r * 0.1, 3, 3); ctx.fillRect(r * 0.3, 0, 2, 4); break;
      case 'ghost':
        var gw = Math.sin(e.anim * 5) * 2;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.9, Math.PI, 0);
        ctx.lineTo(r * 0.9, r * 0.9); ctx.lineTo(r * 0.45, r * 0.5 + gw); ctx.lineTo(0, r * 0.95); ctx.lineTo(-r * 0.45, r * 0.5 - gw); ctx.lineTo(-r * 0.9, r * 0.9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#0a1a2a'; ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.3, 2, 3.5, 0, 0, PI2); ctx.ellipse(r * 0.35, -r * 0.3, 2, 3.5, 0, 0, PI2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, r * 0.15, 2, 3 + Math.abs(gw), 0, 0, PI2); ctx.fill(); break;
      case 'scorpion':
        ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.beginPath();
        for (var sl = 0; sl < 3; sl++) { var so = Math.sin(e.anim * 10 + sl) * 2; ctx.moveTo(-r * 0.3, sl * 3); ctx.lineTo(-r - 3, sl * 4 + 2 + so); ctx.moveTo(r * 0.3, sl * 3); ctx.lineTo(r + 3, sl * 4 + 2 - so); }
        ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 1, r * 0.85, r * 0.6, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = dark; ctx.fillRect(-r * 0.5, -1, r, 2);
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.3); ctx.lineTo(-r * 1.1, -r * 0.9); ctx.moveTo(r * 0.6, -r * 0.3); ctx.lineTo(r * 1.1, -r * 0.9); ctx.stroke();
        var tl = tele ? -r * 1.9 : -r * 1.4 + Math.sin(e.anim * 3) * 2;
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, r * 0.5); ctx.quadraticCurveTo(r * 0.9, r * 0.6, r * 0.5, tl); ctx.stroke();
        ctx.fillStyle = '#d8e83a'; ctx.beginPath(); ctx.arc(r * 0.5, tl, 2.5, 0, PI2); ctx.fill(); break;
      case 'snake':
        ctx.strokeStyle = col; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round'; ctx.beginPath();
        for (var sn = 0; sn <= 6; sn++) { var sxn = -r * 1.8 + sn * r * 0.6, syn = Math.sin(e.anim * 8 - sn * 0.9) * r * 0.5 + r * 0.3; if (sn) ctx.lineTo(sxn, syn); else ctx.moveTo(sxn, syn); }
        ctx.stroke();
        ctx.strokeStyle = shadeC(col, 0.55); ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
        var hy = Math.sin(e.anim * 8 - 6 * 0.9) * r * 0.5 + r * 0.3, hx = r * 1.8;
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(hx - 3, hy - 4); ctx.lineTo(hx + 5, hy); ctx.lineTo(hx - 3, hy + 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffe04a'; ctx.fillRect(hx - 1, hy - 3, 2, 2);
        if (Math.sin(t * 14) > 0.2 || tele) { ctx.strokeStyle = '#e03a4a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx + 5, hy); ctx.lineTo(hx + 9, hy - 1); ctx.moveTo(hx + 8, hy - 1); ctx.lineTo(hx + 10, hy - 3); ctx.moveTo(hx + 8, hy - 1); ctx.lineTo(hx + 10, hy + 1); ctx.stroke(); } break;
      case 'demon':
        var wf = Math.sin(e.anim * 6) * 3;
        ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.2); ctx.lineTo(-r * 1.7, -r * 0.9 - wf); ctx.lineTo(-r * 1.2, r * 0.4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r * 0.4, -r * 0.2); ctx.lineTo(r * 1.7, -r * 0.9 - wf); ctx.lineTo(r * 1.2, r * 0.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col; ctx.fillRect(-r * 0.55, -r * 0.2, r * 1.1, r * 1.1);
        ctx.beginPath(); ctx.arc(0, -r * 0.5, r * 0.6, 0, PI2); ctx.fill();
        ctx.fillStyle = '#1a0a0a'; ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.8); ctx.lineTo(-r * 0.9, -r * 1.5); ctx.lineTo(-r * 0.15, -r * 1.0); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.8); ctx.lineTo(r * 0.9, -r * 1.5); ctx.lineTo(r * 0.15, -r * 1.0); ctx.fill();
        ctx.fillStyle = '#ffd24a'; ctx.fillRect(-r * 0.35, -r * 0.6, 3, 3); ctx.fillRect(r * 0.15, -r * 0.6, 3, 3);
        if (tele || Math.sin(t * 9) > 0.6) { ctx.fillStyle = '#ff9a2a'; ctx.beginPath(); ctx.arc(r * 0.9, r * 0.3, 3 + (tele ? 2 : 0), 0, PI2); ctx.fill(); }
        break;
      case 'dragon':
        var dw = Math.sin(e.anim * 5) * 5, ds = e.boss ? 1.15 : 1;
        ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.2); ctx.lineTo(-r * 1.6, -r * 1.5 - dw); ctx.lineTo(-r * 1.0, -r * 0.1); ctx.lineTo(-r * 1.3, r * 0.3); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.2); ctx.lineTo(r * 1.0, -r * 1.5 - dw); ctx.lineTo(r * 0.8, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = r * 0.45; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.3); ctx.quadraticCurveTo(-r * 1.6, r * 0.8, -r * 1.7, r * 0.1 + Math.sin(e.anim * 3) * 3); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, r * 0.1, r * 0.95 * ds, r * 0.7 * ds, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = '#e0b060'; ctx.beginPath(); ctx.ellipse(r * 0.1, r * 0.35, r * 0.6, r * 0.3, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.4); ctx.lineTo(r * 1.7, -r * 0.2); ctx.lineTo(r * 1.5, r * 0.3); ctx.lineTo(r * 0.7, r * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = dark; for (var sp2 = 0; sp2 < 4; sp2++) ctx.fillRect(-r * 0.6 + sp2 * r * 0.35, -r * 0.8, 3, 4);
        ctx.fillStyle = '#e8e0c0'; ctx.fillRect(r * 0.9, -r * 0.7, 2, 4); ctx.fillRect(r * 1.2, -r * 0.65, 2, 4);
        ctx.fillStyle = '#ffd24a'; ctx.fillRect(r * 1.1, -r * 0.15, 3, 3);
        if (tele || Math.sin(t * 7) > 0.8) { ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(r * 1.7, r * 0.05, 3 + (tele ? 3 : 0), 0, PI2); ctx.fill(); }
        break;
      case 'archer':
        ctx.fillStyle = dark; ctx.fillRect(-r * 0.5, 0, r, r * 0.9);
        ctx.fillStyle = col; ctx.fillRect(-r * 0.6, -r * 0.9, r * 1.2, r * 0.9);
        ctx.fillStyle = '#10101a'; ctx.fillRect(-r * 0.4, -r * 0.6, 3, 3); ctx.fillRect(r * 0.1, -r * 0.6, 3, 3);
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(r * 0.8, 0, r * 0.8, -1.2, 1.2); ctx.stroke(); break;
      case 'charger': case 'goblin':
        ctx.fillStyle = dark; ctx.fillRect(-r * 0.7, -r * 0.1, r * 1.4, r * 1.0);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -r * 0.3, r * 0.8, 0, PI2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.5); ctx.lineTo(-r * 1.3, -r * 0.9); ctx.lineTo(-r * 0.4, -r * 0.9); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.5); ctx.lineTo(r * 1.3, -r * 0.9); ctx.lineTo(r * 0.4, -r * 0.9); ctx.fill();
        ctx.fillStyle = '#ffe04a'; ctx.fillRect(-r * 0.4, -r * 0.4, 3, 3); ctx.fillRect(r * 0.15, -r * 0.4, 3, 3);
        if (e.boss) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(-r * 0.6, -r * 1.2, r * 1.2, 4); ctx.fillRect(-r * 0.6, -r * 1.5, 4, 4); ctx.fillRect(-2, -r * 1.6, 4, 5); ctx.fillRect(r * 0.6 - 4, -r * 1.5, 4, 4); } break;
      case 'spitter':
        var sw = 1 + (tele ? 0.3 * Math.sin(t * 30) : 0.05 * Math.sin(e.anim * 3));
        ctx.fillStyle = '#d8d0b0'; ctx.fillRect(-3, 0, 6, r * 0.9);
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -2, r * 1.2 * sw, r * 0.8 * sw, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#f0e0c0'; ctx.fillRect(-5, -r * 0.7, 3, 3); ctx.fillRect(2, -r * 0.5, 3, 3);
        ctx.fillStyle = '#240'; ctx.fillRect(-3, 2, 2, 2); ctx.fillRect(1, 2, 2, 2); break;
      case 'spider':
        ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
        for (var l = 0; l < 4; l++) { var lo = Math.sin(e.anim * 14 + l) * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-r - 3, -r * 0.8 + l * 4 + lo); ctx.moveTo(0, 0); ctx.lineTo(r + 3, -r * 0.8 + l * 4 - lo); ctx.stroke(); }
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 1, r * (e.boss ? 1.0 : 0.9), r * 0.8, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = e.boss ? '#ff7ad0' : '#ff3a3a'; ctx.fillRect(-4, -3, 2, 2); ctx.fillRect(-1, -4, 2, 2); ctx.fillRect(2, -3, 2, 2); break;
      default: // Giant Forest monsters draw themselves; anything unknown is a plain disc
        if (CC.Forest && CC.Forest.drawMonster && CC.Forest.drawMonster(ctx, e, r, col, dark, t)) break;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r, 0, PI2); ctx.fill();
    }
    if (!e.collapsed) horrorArt(ctx, e, look, r, col, dark, t);
    ctx.restore(); // restore anatomy clipping
    if (!e.collapsed && e.nubs) {
      var bc = (TYPES[e.type] || {}).blood || BLOOD;
      var bone = (TYPES[e.type] || {}).bone && !(TYPES[e.type] || {}).blood;
      for (var ni = 0; ni < e.nubs.length; ni++) {
        var n = e.nubs[ni], pt = { x: 0, y: 0 };
        if (n.slot === 'head') { pt.y = -r * 0.23; }
        else if (n.slot.indexOf('horn') === 0) { pt.x = n.slot === 'hornLeft' ? -r * 0.55 : r * 0.55; pt.y = -r * 0.75; }
        else if (n.slot.indexOf('arm') === 0) { pt.x = n.slot === 'armLeft' ? -r * 0.73 : r * 0.73; pt.y = r * 0.12; }
        else if (n.slot.indexOf('leg') === 0) { pt.x = n.slot === 'legLeft' ? -r * 0.42 : r * 0.42; pt.y = r * 0.63; }
        else { pt.x = -r; pt.y = r * 0.3; }
        ctx.fillStyle = bone ? '#605c53' : '#3a080c';
        ctx.beginPath(); ctx.ellipse(pt.x, pt.y, Math.max(2, r * 0.20), Math.max(1.8, r * 0.13), 0, 0, PI2); ctx.fill();
        if (!bone) {
          ctx.fillStyle = bc; ctx.beginPath(); ctx.ellipse(pt.x, pt.y, Math.max(1.5, r * 0.14), Math.max(1.3, r * 0.10), 0, 0, PI2); ctx.fill();
          var pulse = n.t < 2 ? 1 + 0.5 * Math.sin(n.t * 31) : 0.5;
          ctx.strokeStyle = bc; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(pt.x + (pt.x < 0 ? -1 : 1) * pulse * 3, pt.y + 2 + pulse * 3); ctx.stroke();
        }
      }
    }
    ctx.restore();
    if (dead) return;
    if (e.shield > 0) { ctx.strokeStyle = 'rgba(120,160,255,0.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, e.r + 2, 0, PI2); ctx.stroke(); }
    if (e.state === 'telegraph' && !e.boss) { ctx.fillStyle = '#ff4a3a'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', sx, sy - e.r - 6); ctx.textAlign = 'left'; }
    if (e.state === 'stunned') { ctx.fillStyle = '#ffe04a'; ctx.fillRect(sx - 4 + Math.sin(t * 8) * 4, sy - e.r - 8, 3, 3); }
    if (!e.boss && e.hp < e.maxHp) { // hp bar
      var w = Math.max(14, e.r * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(sx - w / 2 - 1, sy - e.r - 11, w + 2, 4);
      ctx.fillStyle = e.elite ? '#ffb02a' : '#d84a4a'; ctx.fillRect(sx - w / 2, sy - e.r - 10, w * clamp(e.hp / e.maxHp, 0, 1), 2);
    }
    if (e.elite) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(sx - 4, sy - e.r - 16, 8, 3); ctx.fillRect(sx - 4, sy - e.r - 18, 2, 2); ctx.fillRect(sx + 2, sy - e.r - 18, 2, 2); }
  }
  // horror detail painted over each monster's base art (local coords, facing +x): exposed ribs, torn flesh, fangs, drool,
  // extra eyes, stitched wounds, matted fur; then blood-slick wounds that multiply as HP drops. Purely visual.
  var BLOODY = 'rgba(150,12,18,0.9)', GUT = '#c26a74', RIB = '#e8e0c8';
  function horrorArt(ctx, e, look, r, col, dark, t) {
    var gs = e._gs || (e._gs = Math.floor(R() * 9000) + 1), rr = srand(gs), an = e.anim, k;
    var drp = (Math.sin(t * 3 + gs) + 1) * 0.5, tele = e.state === 'telegraph';
    function L(x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    function eye(x, y, c) { ctx.fillStyle = 'rgba(255,70,40,0.28)'; ctx.beginPath(); ctx.arc(x + 1, y + 1, 3.2, 0, PI2); ctx.fill(); ctx.fillStyle = c; ctx.fillRect(x, y, 2, 2); }
    function fang(x, y, l) { ctx.fillStyle = '#f0ead8'; ctx.beginPath(); ctx.moveTo(x - 1, y); ctx.lineTo(x + 1, y); ctx.lineTo(x, y + l); ctx.fill(); }
    function dr(x, y, len, c) { var ly = y + len * (0.6 + drp * 0.8); ctx.strokeStyle = c || BLOODY; ctx.lineWidth = 1.2; L(x, y, x, ly); ctx.fillStyle = c || BLOODY; ctx.beginPath(); ctx.arc(x, ly + 1, 1.1, 0, PI2); ctx.fill(); }
    function gash(x, y, w, a) { ctx.strokeStyle = '#3a0508'; ctx.lineWidth = 2.4; L(x - w, y - a, x + w, y + a); ctx.strokeStyle = '#b01820'; ctx.lineWidth = 1; L(x - w, y - a, x + w, y + a); }
    function stitch(x, y, n) { ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 1; for (var s = 0; s < n; s++) L(x + s * 3, y - 2.5, x + s * 3 + 1, y + 2.5); }
    function flesh(x, y, w, h) { ctx.fillStyle = 'rgba(150,40,48,0.9)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w * 0.5, y + h); ctx.fill(); }
    ctx.lineCap = 'butt';
    switch (look) {
      case 'bat':
        fang(-2, 3, 3.5); fang(2, 3, 3.5); eye(-5, -4, '#ff9a4a'); eye(3, -4, '#ff9a4a'); dr(0, 4, 5);
        ctx.fillStyle = 'rgba(8,4,14,0.9)'; ctx.beginPath(); ctx.arc(-r * 0.9, -1.5, 1.6, 0, PI2); ctx.arc(r * 0.9, -2.5, 1.4, 0, PI2); ctx.arc(-r * 1.3, 0, 1.2, 0, PI2); ctx.fill();
        ctx.strokeStyle = dark; ctx.lineWidth = 1; for (k = 0; k < 4; k++) L(-3 + k * 2, -r * 0.8, -4 + k * 2.5, -r * 0.8 - 3); break;
      case 'slime': {
        var ga = ctx.globalAlpha; ctx.globalAlpha = ga * 0.6; ctx.fillStyle = '#e8e4d0';
        ctx.beginPath(); ctx.arc(-r * 0.25, 0, r * 0.3, 0, PI2); ctx.fill(); ctx.fillRect(-r * 0.45, r * 0.25, r * 0.4, 2);
        ctx.fillStyle = '#10080a'; ctx.fillRect(-r * 0.4, -2, 2, 3); ctx.fillRect(-r * 0.15, -2, 2, 3);
        ctx.strokeStyle = RIB; ctx.lineWidth = 1; for (k = 0; k < 3; k++) L(r * 0.15, -2 + k * 3, r * 0.6, -3 + k * 3);
        ctx.globalAlpha = ga; eye(-r * 0.6, -r * 0.1, '#fff060'); eye(r * 0.5, -r * 0.45, '#fff060');
        dr(-r * 0.7, 3, 5, 'rgba(90,200,110,0.85)'); dr(r * 0.5, 4, 6, 'rgba(90,200,110,0.85)'); break;
      }
      case 'archer':
        ctx.strokeStyle = RIB; ctx.lineWidth = 1.2; for (k = 0; k < 3; k++) L(-r * 0.4, r * 0.15 + k * 3, r * 0.4, r * 0.15 + k * 3); L(0, 0, 0, r * 0.8);
        flesh(-r * 0.5, r * 0.05, 4, 6); flesh(r * 0.2, r * 0.1, 4, 7);
        ctx.strokeStyle = '#10101a'; ctx.lineWidth = 1; L(r * 0.25, -r * 0.9, 0, -r * 0.4); for (k = 0; k < 4; k++) L(-r * 0.4 + k * 3, -r * 0.1, -r * 0.4 + k * 3, r * 0.1);
        eye(-r * 0.1, -r * 0.85, '#ff7a3a'); dr(-r * 0.4, -r * 0.45, 4);
        ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 1.5; L(-r * 0.6, r * 0.3, -r * 1.3, -r * 0.2); ctx.strokeStyle = '#d8d8d0'; L(-r * 1.3, -r * 0.2, -r * 1.5, -r * 0.45); break;
      case 'charger': case 'goblin':
        fang(-r * 0.35, -r * 0.05, 4); fang(r * 0.3, -r * 0.05, 4); dr(r * 0.05, -r * 0.05, 7, 'rgba(210,230,170,0.75)');
        gash(r * 0.15, -r * 0.5, r * 0.5, r * 0.25); stitch(-r * 0.1, -r * 0.45, 4);
        ctx.fillStyle = 'rgba(10,6,4,0.9)'; ctx.beginPath(); ctx.moveTo(-r * 0.75, -r * 0.55); ctx.lineTo(-r * 1.0, -r * 0.7); ctx.lineTo(-r * 0.8, -r * 0.85); ctx.fill();
        eye(-r * 0.1, -r * 0.85, '#ff6a3a'); dr(-r * 0.3, r * 0.5, 5);
        ctx.strokeStyle = RIB; ctx.lineWidth = 1.2; for (k = 0; k < 3; k++) L(-r * 0.5, r * 0.15 + k * 3, -r * 0.1, r * 0.15 + k * 3);
        ctx.strokeStyle = 'rgba(30,20,10,0.8)'; ctx.lineWidth = 1; for (k = 0; k < 5; k++) L(-r * 0.6 + k * r * 0.3, r * 0.55, -r * 0.6 + k * r * 0.3 - 1, r * 0.85); break;
      case 'spitter':
        ctx.fillStyle = '#2a0608'; ctx.beginPath(); ctx.ellipse(0, 1, r * 0.55, r * 0.22, 0, 0, PI2); ctx.fill();
        for (k = 0; k < 5; k++) fang(-r * 0.4 + k * r * 0.2, 0, 2.5 + (k % 2));
        ctx.strokeStyle = 'rgba(120,10,30,0.7)'; ctx.lineWidth = 1; L(0, -2, -r * 0.7, -r * 0.5); L(0, -2, r * 0.6, -r * 0.6); L(0, -2, r * 0.1, -r * 0.8);
        ctx.fillStyle = '#f4f0e0'; ctx.beginPath(); ctx.arc(r * 0.6, -r * 0.2, 2.6, 0, PI2); ctx.fill(); ctx.fillStyle = '#b01020'; ctx.fillRect(r * 0.55, -r * 0.2 - 1, 2, 2);
        dr(-r * 0.1, 3, 7, 'rgba(160,255,120,0.8)'); stitch(-3, r * 0.5, 3); gash(r * 0.7, -r * 0.1, 3, 2);
        if (tele) { ctx.fillStyle = 'rgba(200,20,30,0.5)'; ctx.beginPath(); ctx.ellipse(0, 1, r * 0.6, r * 0.3, 0, 0, PI2); ctx.fill(); } break;
      case 'spider':
        ctx.strokeStyle = 'rgba(20,14,24,0.9)'; ctx.lineWidth = 1; for (k = 0; k < 9; k++) { var sa = k / 9 * PI2; L(Math.cos(sa) * r * 0.8, Math.sin(sa) * r * 0.7, Math.cos(sa) * r * 1.05, Math.sin(sa) * r * 0.95); }
        eye(-5, -5, '#ff3a3a'); eye(3, -5, '#ff3a3a'); eye(-3, -1, '#ff9a3a'); eye(1, -1, '#ff9a3a');
        fang(-2, -r * 0.75, -3.5); fang(2, -r * 0.75, -3.5); dr(-2, -r * 0.75 - 3, -4, 'rgba(160,255,60,0.9)');
        ctx.fillStyle = 'rgba(230,226,210,0.8)'; ctx.beginPath(); ctx.arc(0, r * 0.35, 2.7, 0, PI2); ctx.fill(); ctx.fillStyle = '#100a10'; ctx.fillRect(-1.6, r * 0.35 - 1, 1.2, 1.2); ctx.fillRect(0.4, r * 0.35 - 1, 1.2, 1.2);
        ctx.strokeStyle = BLOODY; ctx.lineWidth = 1.5; L(-r - 2, -r * 0.5, -r - 3, -r * 0.2); break;
      case 'skeleton':
        flesh(-r * 0.4, r * 0.05, 4, 8); flesh(r * 0.05, r * 0.1, 4, 6);
        ctx.strokeStyle = '#10101a'; ctx.lineWidth = 1; for (k = 0; k < 5; k++) L(-r * 0.35 + k * r * 0.18, -r * 0.3, -r * 0.35 + k * r * 0.18, -r * 0.12);
        L(r * 0.2, -r * 1.05, 0, -r * 0.55); dr(-r * 0.3, -r * 0.5, 5);
        ctx.strokeStyle = BLOODY; ctx.lineWidth = 1.5; L(r * 0.95, r * 0.15, r * 1.25, -r * 0.3);
        ctx.fillStyle = 'rgba(255,120,60,0.25)'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.6, 4, 0, PI2); ctx.arc(r * 0.25, -r * 0.6, 4, 0, PI2); ctx.fill();
        ctx.fillStyle = RIB; ctx.fillRect(-r * 0.1, r * 0.8, 2, 3); ctx.fillRect(r * 0.2, r * 0.8, 2, 3); break;
      case 'snake': {
        var hy = Math.sin(an * 8 - 6 * 0.9) * r * 0.5 + r * 0.3, hx = r * 1.8, y3 = Math.sin(an * 8 - 3 * 0.9) * r * 0.5 + r * 0.3;
        fang(hx + 3, hy + 1, 3.5); fang(hx + 3, hy - 1, -3); dr(hx + 3, hy + 4, 3, 'rgba(160,255,60,0.9)'); eye(hx - 1, hy + 1, '#ff3a3a');
        ctx.fillStyle = 'rgba(20,50,20,0.7)'; for (k = 1; k < 6; k++) { ctx.beginPath(); ctx.arc(-r * 1.8 + k * r * 0.6, Math.sin(an * 8 - k * 0.9) * r * 0.5 + r * 0.3 - 1.5, 1.2, 0, PI2); ctx.fill(); }
        ctx.fillStyle = '#b03a40'; ctx.beginPath(); ctx.ellipse(0, y3, r * 0.5, r * 0.4, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = RIB; ctx.fillRect(-r * 0.3, y3 - 1, r * 0.6, 2); stitch(-r * 0.3, y3 + r * 0.45, 3); dr(r * 0.1, y3 + r * 0.4, 4); break;
      }
      case 'ghoul': {
        ctx.fillStyle = '#6a1018'; ctx.beginPath(); ctx.ellipse(0, r * 0.2, r * 0.45, r * 0.4, 0, 0, PI2); ctx.fill();
        ctx.strokeStyle = RIB; ctx.lineWidth = 1.2; for (k = 0; k < 3; k++) L(-r * 0.35, r * 0.05 + k * 3.2, r * 0.35, r * 0.05 + k * 3.2);
        var sw = Math.sin(an * 4) * 2; ctx.strokeStyle = GUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, r * 0.5); ctx.quadraticCurveTo(sw, r * 1.0, -sw, r * 1.35); ctx.stroke();
        ctx.strokeStyle = dark; ctx.lineWidth = 1; for (k = 0; k < 6; k++) L(-r * 0.6 + k * r * 0.25, -r * 0.55, -r * 0.65 + k * r * 0.25, -r * 0.8);
        for (k = 0; k < 4; k++) fang(-r * 0.1 + k * r * 0.12, -r * 0.3, 3); dr(r * 0.3, -r * 0.2, 6, 'rgba(200,220,170,0.75)');
        gash(r * 0.2, -r * 0.8, r * 0.3, r * 0.12); stitch(r * 0.05, -r * 0.8, 3); eye(r * 0.1, -r * 0.95, '#ff6a3a'); break;
      }
      case 'scorpion': {
        var tl = tele ? -r * 1.9 : -r * 1.4 + Math.sin(an * 3) * 2;
        ctx.strokeStyle = '#2a1004'; ctx.lineWidth = 1; L(-r * 0.4, -r * 0.2, -r * 0.1, r * 0.3); L(r * 0.3, -r * 0.3, r * 0.5, r * 0.4);
        eye(-3, -r * 0.3, '#ffe04a'); eye(1, -r * 0.35, '#ffe04a'); eye(-1, -r * 0.1, '#ff6a3a');
        dr(r * 0.5, tl + 3, 5, 'rgba(200,255,60,0.9)'); fang(-r * 1.05, -r * 0.85, 3); fang(r * 1.05, -r * 0.85, 3);
        ctx.strokeStyle = RIB; ctx.lineWidth = 2; L(-r * 0.3, -r * 0.3, -r * 0.8, -r * 0.9); ctx.fillStyle = RIB; ctx.fillRect(-r * 0.8 - 1, -r * 0.9 - 1, 3, 3);
        gash(r * 0.2, r * 0.2, r * 0.3, 1); break;
      }
      case 'ghost':
        ctx.fillStyle = '#050a14'; ctx.beginPath(); ctx.moveTo(-r * 0.4, r * 0.1); for (k = 0; k < 5; k++) ctx.lineTo(-r * 0.4 + k * r * 0.2, r * 0.1 + (k % 2 ? 2 : 6) + Math.abs(Math.sin(an * 5)) * 2); ctx.lineTo(r * 0.4, r * 0.1); ctx.fill();
        ctx.fillStyle = 'rgba(190,240,255,0.5)'; ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.3, 4, 0, PI2); ctx.arc(r * 0.35, -r * 0.3, 4, 0, PI2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; for (k = 0; k < 3; k++) L(-r * 0.4, r * 0.35 + k * 3, r * 0.4, r * 0.35 + k * 3);
        dr(-r * 0.35, -r * 0.1, 7, 'rgba(150,220,235,0.8)'); dr(r * 0.35, -r * 0.1, 9, 'rgba(150,220,235,0.8)'); dr(0, r * 0.8, 5, 'rgba(150,220,235,0.7)'); break;
      case 'demon':
        ctx.fillStyle = '#6a0e0e'; ctx.fillRect(-r * 0.3, r * 0.05, r * 0.6, r * 0.5);
        ctx.strokeStyle = '#e8d8b0'; ctx.lineWidth = 1.2; for (k = 0; k < 3; k++) L(-r * 0.3, r * 0.15 + k * 3, r * 0.3, r * 0.15 + k * 3);
        ctx.strokeStyle = '#ffae2a'; ctx.lineWidth = 1; L(-r * 0.45, 0, -r * 0.25, r * 0.4); L(-r * 0.25, r * 0.4, -r * 0.45, r * 0.8); L(r * 0.35, r * 0.1, r * 0.5, r * 0.5);
        fang(-r * 0.2, -r * 0.3, 4); fang(r * 0.2, -r * 0.3, 4); dr(0, -r * 0.25, 6);
        eye(-r * 0.2, -r * 0.85, '#ffd24a'); eye(r * 0.1, -r * 0.85, '#ffd24a'); stitch(-r * 0.5, r * 0.7, 3); gash(r * 0.35, r * 0.7, r * 0.2, 2); break;
      case 'dragon':
        ctx.strokeStyle = RIB; ctx.lineWidth = 1.5; for (k = 0; k < 4; k++) L(-r * 0.4 + k * r * 0.28, 0, -r * 0.3 + k * r * 0.28, r * 0.45);
        ctx.fillStyle = 'rgba(20,6,6,0.8)'; ctx.beginPath(); ctx.arc(-r * 0.9, -r * 0.6, r * 0.18, 0, PI2); ctx.arc(-r * 0.7, -r * 0.2, r * 0.12, 0, PI2); ctx.fill();
        gash(r * 0.2, r * 0.05, r * 0.5, r * 0.2); stitch(-r * 0.1, r * 0.1, 5);
        for (k = 0; k < 4; k++) fang(r * 1.0 + k * r * 0.16, r * 0.28, 3.5); dr(r * 1.3, r * 0.3, 7); eye(r * 0.95, -r * 0.3, '#ffd24a'); break;
    }
    var frac = e.maxHp > 0 ? clamp(e.hp / e.maxHp, 0, 1) : 1, nW = frac < 0.95 ? Math.ceil((1 - frac) * 3) : 0, bone = (TYPES[e.type] || {}).bone && !(TYPES[e.type] || {}).blood;
    for (k = 0; k < nW; k++) { // wounds multiply as HP drops; low HP: blood runs down
      var wx = (rr() - 0.5) * r * 1.2, wy = (rr() - 0.5) * r * 1.2;
      if (bone) { ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 1.2; L(wx - 2, wy - 1, wx + 2, wy + 2); continue; }
      gash(wx, wy, 2.5 + rr() * 2, rr() * 2 - 1);
      if (k % 2) { ctx.fillStyle = RIB; ctx.fillRect(wx - 1, wy - 1, 2, 2); }
      if (frac < 0.4) dr(wx, wy + 1, 4 + rr() * 4);
    }
  }
  function shadeC(c, f) {
    if (c.charAt(0) !== '#') return c;
    var r = parseInt(c.substr(1, 2), 16) * f, g = parseInt(c.substr(3, 2), 16) * f, b = parseInt(c.substr(5, 2), 16) * f;
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = CC;
})(typeof window !== 'undefined' ? window : globalThis);
