/* CC.Balance - one power curve for the whole game, so every monster is tuned from the same table.
 *
 * THE IDEA
 *   Every area has a LEVEL BAND [lo, hi]: the levels a hero is expected to be while fighting there (the hero should reach the Emberdeep
 *   boss at about level 20). A monster's level is picked by how far it stands from the way in (the far end of an area is the hard end).
 *   From its level L the monster gets:
 *     HP      x hpScale(L)   = hero damage at L  / hero damage at 1   (a normal monster always takes about the same number of hits)
 *     damage  x dmgScale(L)  = hero effective health at L / at 1, with a little extra pressure as the game goes on (a hit always costs
 *                              about the same share of your health)
 *     XP      = the XP a level needs / the kills a level should take (so clearing each area lands you in the next one's band)
 *     loot    = item level L (e.floor), so the gear you find keeps pace with the monsters
 *   The hero curve below was MEASURED (classes.js + loot.js with level-appropriate gear); tests/balance.test.mjs re-measures it and
 *   fails if it drifts, and runs the "simulator": hits to kill and hits to die for every normal monster in every band.
 *
 * REPLAY (the free version's second time round): CC.state.cycle = 1, 2, ... makes monsters much stronger (HP x(1+0.9n), damage x(1+0.5n),
 * XP x(1+0.6n)), gives many of them elite abilities (Swift, Armored, Vampiric, Explosive, Frenzied, Shielded) and swaps in tougher
 * kinds (ghosts, ghouls, scorpions, demons) among the ordinary ones.
 *
 *   BAND, hero.{dmg,hp,armor,dps}(L), hpScale(L), dmgScale(L), killsPerLevel(L), xpFor(baseXp, L, cycle), levelAt(area, progress),
 *   cycleMul(n), update() (scales new monsters), setCycle(n), SPELLS + spellStats(cls, spell, L) (the spell simulator)
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, B = CC.Balance = {}, E = CC.Enemies;

  // where the hero is expected to be, area by area (the caves and endless modes keep their own floor-based scaling)
  B.BAND = { forest: [1, 5], 'tree-tunnel': [3, 6], plains: [5, 10], 'rocky-pass': [10, 14], village: [13, 16], 'village-cellar': [15, 16], cinderwake: [16, 19], emberdeep: [19, 21] };
  B.BOSS_LEVEL = 20;

  // the typical hero at level L wearing gear found at level L (average of the four classes, measured)
  B.hero = {
    dmg: function (L) { return 10 + 4.2 * (L - 1); },
    hp: function (L) { return 75 + 21.5 * (L - 1); },
    armor: function (L) { return Math.min(48, 1 + 4.2 * (L - 1)); },
    attacksPerSec: 3, // the four classes average about three basic attacks a second
    dps: function (L) { return B.hero.dmg(L) * B.hero.attacksPerSec; },
    effHp: function (L) { return B.hero.hp(L) * (1 + B.hero.armor(L) / 100); } // armour: damage x 100/(100+armour)
  };
  B.hpScale = function (L) { return B.hero.dmg(L) / B.hero.dmg(1); };
  B.dmgScale = function (L) { return (B.hero.effHp(L) / B.hero.effHp(1)) * (1 + 0.012 * (L - 1)); };
  B.killsPerLevel = function (L) { return L <= 5 ? 20 : L <= 10 ? 30 : L <= 15 ? 40 : 50; };
  function xpToNext(L) { var C = CC.Classes; return C && C.xpToNext ? C.xpToNext(L) : Math.round(48 * Math.pow(L, 1.7)); }
  // an AVERAGE monster of the area is worth 1/killsPerLevel of a level; tougher kinds are worth proportionally more (bosses: up to 15 times)
  B.xpFor = function (baseXp, avgXp, L, cycle) { return (xpToNext(Math.round(L)) / B.killsPerLevel(L)) * Math.min(15, Math.max(0.1, baseXp / Math.max(1, avgXp || 10))) * (1 + 0.6 * (cycle || 0)); };
  B.cycleMul = function (n) { return { hp: 1 + 0.9 * (n || 0), dmg: 1 + 0.5 * (n || 0), xp: 1 + 0.6 * (n || 0) }; };
  B.levelAt = function (area, progress) { var b = B.BAND[area]; if (!b) return 0; var u = Math.max(0, Math.min(1, progress || 0)); return b[0] + (b[1] - b[0]) * u; };
  B.totalXpForBand = function (area) { var b = B.BAND[area], t = 0, L; if (!b) return 0; for (L = b[0]; L < b[1]; L++) t += xpToNext(L); return t; };
  B.setCycle = function (n) { if (CC.state) CC.state.cycle = Math.max(0, n | 0); };
  B.cycle = function () { return (CC.state && CC.state.cycle) || 0; };

  /* ---------- the spells: damage per cast, per second and per mana, in units of one basic hit ----------
   * mult = total damage multiple of the hero's damage per foe hit (read from classes.js, charge.js, smokebomb.js, spells_*.js),
   * n = how many foes a typical cast hits. slot: spell1/spell2 use the class's own cost and cooldown; charge: 1/2/3 are the charge skills
   * gained at levels 10/20/30 (30% of max mana, 8 s cooldown). utility: no damage worth measuring (minions, smoke). */
  B.SPELLS = {
    swordsman: [
      { id: 'bash', name: 'Shield Bash', slot: 'spell1', mult: 1.3, n: 2 },
      { id: 'whirl', name: 'Whirl', slot: 'spell2', mult: 4.0, n: 2.5 },
      { id: 'bladestorm', name: 'Blade Storm', charge: 1, mult: 5.1, n: 2.5 },
      { id: 'dragonrush', name: 'Dragon Rush', charge: 2, mult: 4.5, n: 2 },
      { id: 'skycleaver', name: 'Sky Cleaver', charge: 3, mult: 12.6, n: 1.5 }],
    wizard: [
      { id: 'fireball', name: 'Fireball', slot: 'spell1', mult: 2.4, n: 1.5 },
      { id: 'frostnova', name: 'Frost Nova', slot: 'spell2', mult: 1.8, n: 3 },
      { id: 'lightningspear', name: 'Lightning Spear', charge: 1, mult: 7.2, n: 2 },
      { id: 'blizzard', name: 'Blizzard', charge: 2, mult: 7.6, n: 3 },
      { id: 'meteor', name: 'Meteor Storm', charge: 3, mult: 15, n: 1.5 }],
    necromancer: [
      { id: 'raise', name: 'Raise Skeletons', slot: 'spell1', utility: true },
      { id: 'drain', name: 'Life Drain', slot: 'spell2', mult: 2.7, n: 1 },
      { id: 'soulspear', name: 'Soul Spear', charge: 1, mult: 4.5, n: 2 },
      { id: 'plague', name: 'Plague Nova', charge: 2, mult: 4, n: 3 },
      { id: 'army', name: 'Army of the Dead', charge: 3, mult: 2.0, n: 2.5, extra: 4 * 0.54 * 6 }], // plus four skeletons that fight for 18 s
    thief: [
      { id: 'knives', name: 'Throwing Knives', slot: 'spell1', mult: 2.4, n: 1.3 },
      { id: 'smoke', name: 'Smoke Bomb', slot: 'spell2', utility: true },
      { id: 'venom', name: 'Venom Burst', charge: 1, mult: 4, n: 2.5 },
      { id: 'phantom', name: 'Phantom Blades', charge: 2, mult: 4.0, n: 3 }]
  };
  B.spellStats = function (cls, sp, L) {
    var D = CC.Classes && CC.Classes.DEFS && CC.Classes.DEFS[cls]; if (!D) return null;
    var cd = sp.charge ? 8 : D.cdMax[sp.slot], cost = sp.charge ? Math.max(12, Math.round((D.mana + D.manaL * ((L || 10 * sp.charge) - 1)) * 0.3)) : D.cost[sp.slot];
    var burst = sp.utility ? 0 : (sp.mult * sp.n + (sp.extra || 0)), basic = 1 / D.cdMax.attack;
    return { name: sp.name, burst: burst, cd: cd, cost: cost, perSec: burst / cd, perMana: burst / cost, basicDps: basic, ratio: burst / cd / basic };
  };

  /* ---------- scaling the monsters of the current map ---------- */
  var mapRef = null, maxD = 1, spawnPt = null, avgXp = 10;
  function frame(map) { // how far the farthest monster stands from the way in: that is the hard end
    var list = E && E.list || [], i, e, d;
    spawnPt = map && map.spawn || (CC.state && CC.state.player) || { x: 0, y: 0 }; maxD = 1; var sum = 0, n = 0;
    for (i = 0; i < list.length; i++) { e = list[i]; if (e && !e._bal) { d = Math.hypot(e.x - spawnPt.x, e.y - spawnPt.y); if (d > maxD) maxD = d; if (!e.boss && !e.miniBoss && !e.nightStalker) { sum += e.xp || 0; n++; } } }
    avgXp = n ? sum / n : 10;
    mapRef = map;
  }
  function inScope() {
    var s = CC.state; if (!s || s.mode !== 'dungeon' || !B.BAND[s.area]) return false;
    if (CC.Endless && CC.Endless.active && CC.Endless.active()) return false;
    return true;
  }
  B.scale = function (e, L, cycle) {
    // some areas already spawned it with a 'floor' (1 + 18% HP and 12% damage per floor): take that out, the band replaces it
    var f0 = Math.max(1, e.floor || 1), hs = B.hpScale(L) * B.cycleMul(cycle).hp / (1 + 0.18 * (f0 - 1)) * (e.boss ? 0.4 : 1), ds = B.dmgScale(L) * B.cycleMul(cycle).dmg / (1 + 0.12 * (f0 - 1)) * (e.boss ? 0.55 : 1);
    var frac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    e.maxHp = Math.max(1, Math.round(e.maxHp * hs)); e.hp = Math.max(1, Math.round(e.maxHp * frac));
    e.dmg = Math.max(1, Math.round(e.dmg * ds));
    e.floor = Math.max(1, Math.round(L)); // the loot a monster drops is of its own level
    e.xp = B.xpFor(e.xp, avgXp, L, cycle) / (1 + 0.1 * (e.floor - 1)); // (the kill code multiplies by 1 + 0.1 per floor)
    e._bal = L;
  };
  B.update = function () {
    if (!E || !E.list || !inScope()) return;
    var s = CC.state, map = CC.Dungeon, list = E.list, cyc = B.cycle(), i, e, L;
    if (map !== mapRef) frame(map);
    for (i = 0; i < list.length; i++) {
      e = list[i]; if (!e || e._bal || e.dead || e.nightStalker || e.isDefenseBox || e.hp <= 0) continue;
      L = B.levelAt(s.area, Math.hypot(e.x - spawnPt.x, e.y - spawnPt.y) / maxD);
      if (L > 0) B.scale(e, L, cyc);
    }
  };

  /* ---------- enough monsters: an area must hold the kills its band needs (about 1.5x) ---------- */
  B.TARGET = { forest: 120, village: 160, cinderwake: 70, emberdeep: 60 }; // monsters per map (a map's own extras count)
  function densify() {
    var s = CC.state, want = s && B.BAND[s.area] && B.TARGET[s.area], D = CC.Dungeon, list = E && E.list, pool = [], i, tries, have = 0;
    if (!want || !list || !D || !D.isSolidTile || !(D.w > 0)) return;
    for (i = 0; i < list.length; i++) { var q = list[i]; if (q.dead || q.boss || q.miniBoss || q.nightStalker) continue; have++; if (E.TYPES[q.type] && q.type !== 'trainingDummy' && pool.indexOf(q.type) < 0) pool.push(q.type); }
    if (!pool.length) return;
    var sp = D.spawn || { x: 0, y: 0 }, T = CC.TILE || 32, floor = s.floor || 1;
    for (tries = 0; tries < 4000 && have < want; tries++) {
      var tx = 2 + Math.floor(Math.random() * (D.w - 4)), ty = 2 + Math.floor(Math.random() * (D.h - 4));
      if (D.isSolidTile(tx, ty)) continue;
      var x = tx * T + T / 2, y = ty * T + T / 2; if (Math.hypot(x - sp.x, y - sp.y) < 380) continue;
      E.spawn(pool[Math.floor(Math.random() * pool.length)], x, y, floor); have++;
    }
  }
  if (E && E.spawnForFloor) { var prevFloor = E.spawnForFloor; E.spawnForFloor = function () { var r = prevFloor.apply(this, arguments); try { densify(); } catch (err) { if (root.console) console.error(err); } return r; }; }

  /* ---------- replay: new abilities and new kinds among the ordinary monsters ---------- */
  var ORDINARY = { bat: 1, slime: 1, archer: 1, charger: 1, spitter: 1, spider: 1, skeleton: 1, snake: 1 }, UPGRADES = ['ghoul', 'scorpion', 'ghost', 'demon'];
  if (E && E.spawn) {
    var prevSpawn = E.spawn;
    E.spawn = function (type, x, y, floor, opts) {
      var cyc = B.cycle();
      if (cyc > 0 && inScope() && type !== 'boss' && ORDINARY[type]) {
        if (Math.random() < Math.min(0.5, 0.18 * cyc)) { var up = UPGRADES[Math.floor(Math.random() * UPGRADES.length)]; if (E.TYPES && E.TYPES[up]) type = up; }
        if (Math.random() < Math.min(0.6, 0.25 + 0.1 * cyc)) opts = Object.assign({}, opts, { elite: true });
      }
      return prevSpawn.call(this, type, x, y, floor, opts);
    };
  }
  if (E && E.update) { var prevUpdate = E.update; E.update = function (dt) { try { B.update(); } catch (err) { if (root.console) console.error(err); } return prevUpdate.apply(this, arguments); }; }
})(typeof window !== 'undefined' ? window : globalThis);
