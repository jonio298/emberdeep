/* Emberdeep skill tree: one skill point per level above 1, up to level 99 (98 points): the passive tree below (level-30 sized), the repeatable Training skills and the ability trees (CC.Skills, abilities.js) soak them up.
 *
 * Four columns, six rows: three shared columns (Offense, Defense, Utility: four skills each, the last a capstone) and a class column of six skills that
 * power up the hero's two spells. Every skill also has a character level it needs, so the strong ones come late. Charge attacks unlock at levels
 * 10, 20 and 30 and are picked on the strip under the tree (CHARGE below; the charge code in charge.js plays them).
 *
 * API (CC.SkillTree), all safe to call before a player exists:
 *   nodes(classId) -> [{id,name,desc,col,tier,max,lvl,parent,mastery}]   node(classId, id) -> node | null
 *   total(p), spent(p), points(p)   points available = (min(level,30) - 1) - spent
 *   rank(p, id)   canBuy(p, id) -> {ok, reason}   buy(p, id) -> true when a rank was bought
 *   chargeSkills(classId) -> [{id,name,desc,lvl}] (index 0 is the starting charge)   chargeUnlocked(p, i)   chargeSelected(p)   selectCharge(p, i)
 * State lives on the player object (p.skills = {ranks:{id:n}, spent:n}, p.chargeSel). Nodes change p.mods / p.flags and then call
 * CC.Classes.applyItemStats(p) so stats refresh. Spell power uses p.mods.spell1Pct / spell2Pct and spell haste p.mods.spellCdr.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var CC = root.CC = root.CC || {};
  var MAX_LEVEL = 99;

  function mod(key, per) { return function (p) { p.mods = p.mods || {}; p.mods[key] = (p.mods[key] || 0) + per; }; }
  function flag(key) { return function (p) { p.flags = p.flags || {}; p.flags[key] = (p.flags[key] || 0) + 1; }; }
  function both() { var fns = arguments; return function (p, r) { for (var i = 0; i < fns.length; i++) fns[i](p, r); }; }
  function pct(v) { return Math.round(v * 100) + '%'; }

  // [id, name, desc, max, apply, level needed]; the four rows of each shared column, in order
  var COMMON = [
    [ // Offense
      ['might', 'Might', '+7% damage per rank', 2, mod('dmgPct', 0.07), 2],
      ['precision', 'Precision', '+4% crit chance per rank', 2, mod('critPct', 0.04), 5],
      ['executioner', 'Executioner', '+25% crit damage', 1, mod('critDmg', 0.25), 9],
      ['bloodlust', 'Bloodlust', 'Capstone: +10% damage and heal 4% of damage dealt', 1, both(mod('dmgPct', 0.1), mod('lifesteal', 0.04)), 20]
    ], [ // Defense
      ['tough', 'Toughness', '+8% max health per rank', 2, mod('hpPct', 0.08), 2],
      ['plating', 'Plating', '+2 armor per rank', 2, mod('armor', 2), 5],
      ['mending', 'Mending', '+1.5 health regen per second', 1, mod('regenHp', 1.5), 9],
      ['unbreakable', 'Unbreakable', 'Capstone: +20% max health and +3 armor', 1, both(mod('hpPct', 0.2), mod('armor', 3)), 20]
    ], [ // Utility
      ['swift', 'Swiftness', '+5% move speed per rank', 2, mod('speedPct', 0.05), 2],
      ['focus', 'Focus', '-5% cooldowns and +35% charged-Dash landing damage per rank', 2, mod('cdrPct', 0.05), 5],
      ['scholar', 'Scholar', '+15% experience', 1, mod('xpPct', 0.15), 9],
      ['quickening', 'Quickening', 'Capstone: -10% cooldowns, +10% speed, +30% charged-Dash landing damage and larger splash', 1, both(mod('cdrPct', 0.1), mod('speedPct', 0.1)), 20]
    ]
  ];

  // the class column: six skills that grow the two spells; [id, name, desc, max, apply, level needed]
  var MASTERY = {
    swordsman: { title: 'Blademaster', nodes: [
      ['bash', 'Bash Mastery', 'Shield Bash deals +25% damage per rank', 2, mod('spell1Pct', 0.25), 2],
      ['whirl', 'Whirl Mastery', 'Whirlwind deals +25% damage per rank', 2, mod('spell2Pct', 0.25), 4],
      ['wide', 'Cyclone', 'Whirlwind radius +30% per rank', 2, flag('wide'), 8],
      ['stun', 'Skull Rattler', 'Shield Bash stuns 0.6s longer per rank', 2, flag('stun'), 12],
      ['tempo', 'Battle Rhythm', 'Spell cooldowns -10% per rank', 2, mod('spellCdr', 0.1), 18],
      ['heavy', 'Blademaster', 'Capstone: combo finishers hit +50% harder', 1, flag('heavy'), 24]] },
    wizard: { title: 'Arcanist', nodes: [
      ['fire', 'Pyromancy', 'Fireball deals +25% damage per rank', 2, mod('spell1Pct', 0.25), 2],
      ['frost', 'Cryomancy', 'Frost Nova deals +25% damage per rank', 2, mod('spell2Pct', 0.25), 4],
      ['inferno', 'Inferno', 'Fireball explosion +30% radius per rank', 2, flag('inferno'), 8],
      ['frostbite', 'Frostbite', 'Frost Nova slows longer and reaches farther per rank', 2, both(flag('frostbite'), mod('aoePct', 0.1)), 12],
      ['flow', 'Arcane Flow', 'Spell cooldowns -10% per rank', 2, mod('spellCdr', 0.1), 18],
      ['twin', 'Twin Bolt', 'Capstone: arcane bolt fires two missiles', 1, flag('twin'), 24]] },
    necromancer: { title: 'Deathcaller', nodes: [
      ['bone', 'Bone Mastery', 'Raised skeletons hit +25% harder per rank', 2, mod('spell1Pct', 0.25), 2],
      ['drain', 'Drain Mastery', 'Life Drain deals +25% damage per rank', 2, mod('spell2Pct', 0.25), 4],
      ['legion', 'Bone Legion', '+2 skeleton cap per rank', 2, flag('legion'), 8],
      ['deadly', 'Deadly Minions', 'Skeletons +50% damage per rank', 2, flag('deadly'), 12],
      ['rhythm', 'Dark Rhythm', 'Spell cooldowns -10% per rank', 2, mod('spellCdr', 0.1), 18],
      ['feast', 'Soul Feast', 'Capstone: kills restore more health and mana', 1, flag('feast'), 24]] },
    thief: { title: 'Shadow', nodes: [
      ['knife', 'Knife Mastery', 'Throwing Knives deal +25% damage per rank', 2, mod('spell1Pct', 0.25), 2],
      ['smoke', 'Smoke Mastery', 'Smoke Bomb deals +25% damage per rank', 2, mod('spell2Pct', 0.25), 4],
      ['venom', 'Venom Coat', 'Hits poison enemies for 3s', 2, flag('venom'), 8],
      ['cutthroat', 'Cutthroat', 'Backstabs deal much more damage', 2, flag('cutthroat'), 12],
      ['tempo', 'Shadow Tempo', 'Spell cooldowns -10% per rank', 2, mod('spellCdr', 0.1), 18],
      ['reset', 'Shadow Reset', 'Capstone: kills reset your dash', 1, flag('dashreset'), 24]] }
  };

  // charge attacks: index 0 is the one every hero starts with; 1-3 unlock at levels 10, 20 and 30 (charge.js plays them)
  var CHARGE = {
    swordsman: [
      { id: 'earthsplitter', name: 'Earthsplitter', desc: 'A shockwave that hurls foes back and stuns them.', lvl: 1 },
      { id: 'bladestorm', name: 'Blade Storm', desc: 'A spinning storm of steel that cuts everything around you three times.', lvl: 10 },
      { id: 'dragonrush', name: 'Dragon Rush', desc: 'Dash a long line through your foes, cutting each one.', lvl: 20 },
      { id: 'skycleaver', name: 'Sky Cleaver', desc: 'Three huge shockwaves fan out from a mighty overhead strike.', lvl: 30 }],
    wizard: [
      { id: 'meteor', name: 'Meteor Call', desc: 'A meteor drops on the nearest foe.', lvl: 1 },
      { id: 'chain', name: 'Chain Lightning', desc: 'Lightning leaps between up to six foes.', lvl: 10 },
      { id: 'blizzard', name: 'Blizzard', desc: 'A freezing storm around you slows and wounds every foe nearby.', lvl: 20 },
      { id: 'meteorstorm', name: 'Meteor Storm', desc: 'Five meteors rain down one after another.', lvl: 30 }],
    necromancer: [
      { id: 'bonetide', name: 'Bone Tide', desc: 'A draining nova that heals you and raises skeletons.', lvl: 1 },
      { id: 'soulspear', name: 'Soul Spear', desc: 'A piercing spear of souls that drains everything in a line.', lvl: 10 },
      { id: 'plague', name: 'Plague Nova', desc: 'A huge wave of rot that poisons and weakens every foe in reach.', lvl: 20 },
      { id: 'army', name: 'Army of the Dead', desc: 'Raise a whole army and shake the ground around you.', lvl: 30 }],
    thief: [
      { id: 'flurry', name: 'Shadow Flurry', desc: 'Blink through several nearby foes, backstabbing each.', lvl: 1 },
      { id: 'venomburst', name: 'Venom Burst', desc: 'A cloud of venom that poisons and slows every foe around you.', lvl: 10 },
      { id: 'phantom', name: 'Phantom Blades', desc: 'Strike up to five foes twice each from the shadows.', lvl: 20 },
      { id: 'deathmark', name: 'Deathmark', desc: 'Mark every foe nearby; a second later each takes a killing blow.', lvl: 30 }]
  };

  var COLS = ['Offense', 'Defense', 'Utility', 'Mastery'];
  var cache = {};

  function classKey(c) { return MASTERY[c] ? c : 'swordsman'; }

  function nodes(classId) {
    var key = classKey(classId);
    if (cache[key]) return cache[key];
    var list = [];
    COMMON.forEach(function (col, ci) {
      col.forEach(function (n, tier) {
        list.push({ id: n[0], name: n[1], desc: n[2], col: ci, tier: tier, max: n[3], apply: n[4], lvl: n[5], mastery: false, capstone: tier === 3, parent: tier ? col[tier - 1][0] : null });
      });
    });
    var m = MASTERY[key].nodes;
    m.forEach(function (n, tier) {
      list.push({ id: 'm_' + n[0], name: n[1], desc: n[2], col: 3, tier: tier, max: n[3], apply: n[4], lvl: n[5], mastery: true, capstone: tier === 5, parent: tier ? 'm_' + m[tier - 1][0] : null });
    });
    cache[key] = list;
    return list;
  }

  function node(classId, id) {
    var l = nodes(classId);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }

  function state(p) {
    if (!p) return { ranks: {}, spent: 0 };
    if (!p.skills) p.skills = { ranks: {}, spent: 0 };
    return p.skills;
  }
  function total(p) { return p ? Math.max(0, Math.min(MAX_LEVEL, p.level || 1) - 1) : 0; }
  function spent(p) { return state(p).spent; }
  function points(p) { return Math.max(0, total(p) - spent(p)); }
  function rank(p, id) { return state(p).ranks[id] || 0; }

  function canBuy(p, id) {
    if (!p) return { ok: false, reason: 'No hero' };
    var n = node(p.classId, id);
    if (!n) return { ok: false, reason: 'Unknown skill' };
    if (rank(p, id) >= n.max) return { ok: false, reason: 'Maxed' };
    if (n.parent && rank(p, n.parent) < 1) return { ok: false, reason: 'Needs ' + node(p.classId, n.parent).name };
    if ((p.level || 1) < n.lvl) return { ok: false, reason: 'Needs level ' + n.lvl };
    if (points(p) < 1) return { ok: false, reason: 'No skill points' };
    return { ok: true, reason: '' };
  }

  function buy(p, id) {
    if (!canBuy(p, id).ok) return false;
    var n = node(p.classId, id), st = state(p);
    try { n.apply(p, st.ranks[id] || 0); } catch (e) { return false; }
    st.ranks[id] = (st.ranks[id] || 0) + 1;
    st.spent++;
    var C = CC.Classes;
    if (C && typeof C.applyItemStats === 'function') { try { C.applyItemStats(p); } catch (e2) { /* stats refresh is best effort */ } }
    if (CC.fx && CC.fx.text) CC.fx.text(p.x, p.y - 22, n.name + ' ' + st.ranks[id], '#9be36b', 11);
    return true;
  }

  function chargeSkills(classId) { return CHARGE[classKey(classId)]; }
  function chargeUnlocked(p, i) { var s = chargeSkills(p && p.classId)[i]; return !!(p && s && (p.level || 1) >= s.lvl); }
  function chargeSelected(p) { var i = (p && p.chargeSel) | 0; return chargeUnlocked(p, i) ? i : 0; }
  function selectCharge(p, i) { if (!chargeUnlocked(p, i)) return false; p.chargeSel = i; return true; }

  CC.SkillTree = {
    COLS: COLS, MASTERY: MASTERY, CHARGE: CHARGE, MAX_LEVEL: MAX_LEVEL, pct: pct,
    colTitle: function (classId, col) { return col === 3 ? MASTERY[classKey(classId)].title : COLS[col]; },
    nodes: nodes, node: node, total: total, spent: spent, points: points, rank: rank, canBuy: canBuy, buy: buy,
    chargeSkills: chargeSkills, chargeUnlocked: chargeUnlocked, chargeSelected: chargeSelected, selectCharge: selectCharge
  };
})();
