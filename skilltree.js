/* Emberdeep skill tree: a small per-class node tree. One skill point per level above 1 (level 5 = 4 points).
 *
 * API (CC.SkillTree), all safe to call before a player exists:
 *   nodes(classId) -> [{id,name,desc,col,tier,max,parent,mastery}]   node(classId, id) -> node | null
 *   COLS -> column titles (the 4th is the class mastery column; its title is per class: colTitle(classId, col))
 *   total(p), spent(p), points(p)   points available = (level - 1) - spent
 *   rank(p, id)   canBuy(p, id) -> {ok, reason}   buy(p, id) -> true when a rank was bought
 * State lives on the player object (p.skills = {ranks:{id:n}, spent:n}), so it lasts for the whole run (floors, town, death screen)
 * and starts fresh with a new hero. Nodes change p.mods / p.flags and then call CC.Classes.applyItemStats(p) so stats refresh.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var CC = root.CC = root.CC || {};

  function mod(key, per) { return function (p) { p.mods = p.mods || {}; p.mods[key] = (p.mods[key] || 0) + per; }; }
  function flag(key) { return function (p) { p.flags = p.flags || {}; p.flags[key] = (p.flags[key] || 0) + 1; }; }
  function pct(v) { return Math.round(v * 100) + '%'; }

  // columns 0-2 are shared by every class; column 3 is the class mastery chain
  var COMMON = [
    { id: 'might', name: 'Might', desc: '+5% damage per rank', col: 0, tier: 0, max: 3, apply: mod('dmgPct', 0.05) },
    { id: 'precision', name: 'Precision', desc: '+3% crit chance per rank', col: 0, tier: 1, max: 3, apply: mod('critPct', 0.03) },
    { id: 'executioner', name: 'Executioner', desc: '+15% crit damage per rank', col: 0, tier: 2, max: 2, apply: mod('critDmg', 0.15) },
    { id: 'tough', name: 'Toughness', desc: '+6% max health per rank', col: 1, tier: 0, max: 3, apply: mod('hpPct', 0.06) },
    { id: 'plating', name: 'Plating', desc: '+1 armor per rank', col: 1, tier: 1, max: 3, apply: mod('armor', 1) },
    { id: 'mending', name: 'Mending', desc: '+0.8 health regen/s per rank', col: 1, tier: 2, max: 2, apply: mod('regenHp', 0.8) },
    { id: 'swift', name: 'Swiftness', desc: '+4% move speed per rank', col: 2, tier: 0, max: 3, apply: mod('speedPct', 0.04) },
    { id: 'focus', name: 'Focus', desc: '-4% cooldowns per rank', col: 2, tier: 1, max: 3, apply: mod('cdrPct', 0.04) },
    { id: 'scholar', name: 'Scholar', desc: '+8% experience per rank', col: 2, tier: 2, max: 2, apply: mod('xpPct', 0.08) }
  ];

  var MASTERY = {
    swordsman: { title: 'Duelist', nodes: [
      ['heavy', 'Heavy Blows', 'Combo finisher hits +50% harder', flag('heavy')],
      ['wide', 'Cyclone', 'Whirlwind radius +30%', flag('wide')],
      ['stun', 'Skull Rattler', 'Shield Bash stuns longer', flag('stun')]] },
    wizard: { title: 'Arcanist', nodes: [
      ['inferno', 'Inferno', 'Fireball explosion +30% radius', flag('inferno')],
      ['frostbite', 'Frostbite', 'Frost Nova slows longer, reaches farther', function (p) { flag('frostbite')(p); mod('aoePct', 0.1)(p); }],
      ['twin', 'Twin Bolt', 'Arcane bolt fires two missiles', flag('twin')]] },
    necromancer: { title: 'Deathcaller', nodes: [
      ['legion', 'Bone Legion', '+2 skeleton cap', flag('legion')],
      ['deadly', 'Deadly Minions', 'Skeletons +50% damage', flag('deadly')],
      ['feast', 'Soul Feast', 'Kills restore more health and mana', flag('feast')]] },
    thief: { title: 'Shadow', nodes: [
      ['venom', 'Venom Coat', 'Hits poison enemies for 3s', flag('venom')],
      ['cutthroat', 'Cutthroat', 'Backstabs deal much more damage', flag('cutthroat')],
      ['reset', 'Shadow Reset', 'Kills reset your dash', flag('dashreset')]] }
  };

  var COLS = ['Offense', 'Defense', 'Utility', 'Mastery'];
  var cache = {};

  function classKey(c) { return MASTERY[c] ? c : 'swordsman'; }

  function nodes(classId) {
    var key = classKey(classId);
    if (cache[key]) return cache[key];
    var list = COMMON.map(function (n) {
      return { id: n.id, name: n.name, desc: n.desc, col: n.col, tier: n.tier, max: n.max, apply: n.apply, mastery: false,
        parent: n.tier > 0 ? COMMON.filter(function (q) { return q.col === n.col && q.tier === n.tier - 1; })[0].id : null };
    });
    MASTERY[key].nodes.forEach(function (m, i) {
      list.push({ id: 'm_' + m[0], name: m[1], desc: m[2], col: 3, tier: i, max: 1, apply: m[3], mastery: true, parent: i ? 'm_' + MASTERY[key].nodes[i - 1][0] : null });
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
  function total(p) { return p ? Math.max(0, (p.level || 1) - 1) : 0; }
  function spent(p) { return state(p).spent; }
  function points(p) { return Math.max(0, total(p) - spent(p)); }
  function rank(p, id) { return state(p).ranks[id] || 0; }

  function canBuy(p, id) {
    if (!p) return { ok: false, reason: 'No hero' };
    var n = node(p.classId, id);
    if (!n) return { ok: false, reason: 'Unknown skill' };
    if (rank(p, id) >= n.max) return { ok: false, reason: 'Maxed' };
    if (n.parent && rank(p, n.parent) < 1) return { ok: false, reason: 'Needs ' + node(p.classId, n.parent).name };
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

  CC.SkillTree = {
    COLS: COLS, MASTERY: MASTERY, pct: pct,
    colTitle: function (classId, col) { return col === 3 ? MASTERY[classKey(classId)].title : COLS[col]; },
    nodes: nodes, node: node, total: total, spent: spent, points: points, rank: rank, canBuy: canBuy, buy: buy
  };
})();
