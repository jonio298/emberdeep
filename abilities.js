/* CC.Skills - abilities, spell skill trees, synergies, repeatable training, unique perks and the four skill slots.
 *
 * Every class has FIVE abilities (the original two spells plus three more that unlock at levels 8, 16 and 26). Each ability has its own mini tree:
 *   Power   +10% damage per rank (repeatable, gated by level so damage cannot be stacked early)
 *   Reach   +8% area per rank        Haste   -5% cooldown per rank
 *   Effect  adds a status/effect (burn, freeze, bleed, poison, vulnerable, chain...) that grows per rank
 *   Master  a capstone (level 40+): +60% damage and a stronger effect
 *   Synergy (automatic, like Diablo II): every point you put into a partner ability's Power or Effect adds +5% damage to this one.
 * "Training" are class-independent repeatable passives (damage, health, crit...), each rank gated by character level up to level 99.
 * Four slots (keys Q, E, R, T / buttons I-IV) hold any unlocked ability; choose them on the Skills screen (Abilities page).
 *
 * Hooks: classes.js calls S.preHit / S.onHit from hitEnemy, S.route for the cast keys, S.update each frame; classes.js PERKS get the unique perks
 * appended here; main.js draws S.draw (ground effects) and the slot buttons through S.slotInfo / S.cdKey; ui.js hands the Skills tab to S.ui.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, S = CC.Skills = {}, TAU = Math.PI * 2;
  function R() { return Math.random(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function H() { return CC.Classes && CC.Classes._h || {}; }
  function ST() { return CC.SkillTree; }
  function hero() { var s = CC.state; return s && s.player && !s.player.stub ? s.player : null; }
  function txt(x, y, s, c, z) { if (CC.fx && CC.fx.text) CC.fx.text(x, y, s, c, z); }
  function burst(x, y, c, n, v) { if (CC.fx && CC.fx.burst) CC.fx.burst(x, y, c, n, v); }
  function shake(n) { if (CC.fx && CC.fx.shake) CC.fx.shake(n); }

  /* ---------- the abilities ---------- */
  // id, name, unlock level, mana, cooldown (s), kind, colour, description, effect {id,name,desc}, synergy partner
  var AB = {};
  function full(cls, id) { return id === 'spell1' || id === 'spell2' ? cls + '_' + id : id; } // the two original spells exist once per class
  function N(p, id) { return full(p && p.classId || 'swordsman', id); }
  function def(cls, id, name, lvl, cost, cd, kind, col, desc, eff, syn) { var fid = full(cls, id); AB[fid] = { id: fid, orig: kind === 'orig' ? id : null, cls: cls, name: name, lvl: lvl, cost: cost, cd: cd, kind: kind, col: col, desc: desc, eff: eff, syn: full(cls, syn) }; }
  // swordsman
  def('swordsman', 'spell1', 'Shield Bash', 1, 8, 4, 'orig', '#6bb8ff', 'Smash foes in front of you; stuns.', { id: 'stun', name: 'Concussion', desc: 'Stuns 0.35s longer per rank' }, 'leap');
  def('swordsman', 'spell2', 'Whirlwind', 4, 18, 7, 'orig', '#e8d8a0', 'Spin with your blade, cutting everything around you.', { id: 'bleed', name: 'Rending Winds', desc: 'Hits open bleeding wounds' }, 'wave');
  def('swordsman', 'leap', 'Leap Slam', 8, 22, 9, 'leap', '#ffb060', 'Leap forward and crash down, damaging and staggering foes.', { id: 'slow', name: 'Quake', desc: 'Slows foes hit, longer per rank' }, 'spell1');
  def('swordsman', 'wave', 'Blade Wave', 16, 20, 6, 'wave', '#9fd8ff', 'Send a piercing crescent of force through a line of foes.', { id: 'bleed', name: 'Razor Edge', desc: 'Opens bleeding wounds' }, 'spell2');
  def('swordsman', 'cry', 'War Cry', 26, 30, 22, 'cry', '#ff9a5a', 'A bellow that boosts your damage and speed for 8s.', { id: 'heal', name: 'Rally', desc: 'Heals 6% of max health per rank' }, 'leap');
  // wizard
  def('wizard', 'spell1', 'Fireball', 1, 20, 2.5, 'orig', '#ff8a3c', 'Hurl an exploding ball of fire.', { id: 'burn', name: 'Immolation', desc: 'Burns targets for damage over time' }, 'spell2');
  def('wizard', 'spell2', 'Frost Nova', 4, 25, 7, 'orig', '#9fe3ff', 'A ring of frost that damages and slows.', { id: 'freeze', name: 'Deep Freeze', desc: 'Briefly freezes foes solid' }, 'spell1');
  def('wizard', 'bolt', 'Chain Lightning', 8, 24, 5, 'chain', '#8fd0ff', 'Lightning leaps between nearby enemies.', { id: 'chain', name: 'Forked', desc: '+1 jump per rank' }, 'spell2');
  def('wizard', 'orb', 'Arcane Orb', 16, 30, 8, 'orb', '#b08aff', 'A slow, massive orb that tears through everything.', { id: 'slow', name: 'Gravity', desc: 'Slows foes hit' }, 'bolt');
  def('wizard', 'blink', 'Blink', 26, 22, 10, 'blink', '#c8a8ff', 'Teleport a short way, bursting where you leave and arrive.', { id: 'burn', name: 'Scorch', desc: 'The arrival burst sets foes ablaze' }, 'spell1');
  // necromancer
  def('necromancer', 'spell1', 'Raise Skeleton', 1, 25, 5, 'orig', '#d8d4c0', 'Raise skeleton warriors to fight for you.', { id: 'legion', name: 'Bone Legion', desc: '+1 skeleton cap per rank' }, 'spell2');
  def('necromancer', 'spell2', 'Life Drain', 4, 15, 4, 'orig', '#7dff9a', 'Drain life from a nearby foe.', { id: 'leech', name: 'Soul Leech', desc: 'Heal more of the damage dealt' }, 'spell1');
  def('necromancer', 'spear', 'Bone Spear', 8, 20, 4.5, 'spear', '#f0e8d0', 'A spear of bone that pierces a whole line of foes.', { id: 'bleed', name: 'Splinters', desc: 'Opens bleeding wounds' }, 'blast');
  def('necromancer', 'blast', 'Corpse Blast', 16, 28, 7, 'blast', '#9aff7a', 'Detonate rot on the nearest foe; the blast poisons.', { id: 'poison', name: 'Plague', desc: 'Poisons harder and longer' }, 'spear');
  def('necromancer', 'curse', 'Hex of Weakness', 26, 30, 14, 'curse', '#b06aff', 'A curse over a wide area: foes take extra damage and slow.', { id: 'vuln', name: 'Withering', desc: 'Foes take more damage' }, 'spell2');
  // thief
  def('thief', 'spell1', 'Throwing Knives', 1, 12, 2.2, 'orig', '#cfd8e6', 'Throw a fan of knives.', { id: 'poison', name: 'Venom Tips', desc: 'Knives poison' }, 'fan');
  def('thief', 'spell2', 'Smoke Bomb', 4, 20, 8, 'orig', '#8a90a8', 'Blind and slow foes; vanish for a moment.', { id: 'slow', name: 'Choking Smoke', desc: 'Slows longer, harder' }, 'step');
  def('thief', 'step', 'Shadow Step', 8, 18, 6, 'step', '#a078ff', 'Vanish and reappear behind a foe with a vicious backstab.', { id: 'bleed', name: 'Gutter', desc: 'The stab leaves a bleeding wound' }, 'spell2');
  def('thief', 'fan', 'Blade Fan', 16, 24, 7, 'fan', '#e6edf7', 'Hurl a ring of blades in every direction.', { id: 'bleed', name: 'Serrated', desc: 'Blades open bleeding wounds' }, 'spell1');
  def('thief', 'venom', 'Venom Flask', 26, 28, 12, 'venom', '#9aff3a', 'Shatter a flask: a toxic cloud that sickens foes.', { id: 'vuln', name: 'Weakening Toxin', desc: 'Poisoned foes take more damage' }, 'step');
  var ORDER = { swordsman: ['spell1', 'spell2', 'leap', 'wave', 'cry'], wizard: ['spell1', 'spell2', 'bolt', 'orb', 'blink'], necromancer: ['spell1', 'spell2', 'spear', 'blast', 'curse'], thief: ['spell1', 'spell2', 'step', 'fan', 'venom'] };
  S.AB = AB; S.ORDER = ORDER;
  function list(cls) { var c = ORDER[cls] ? cls : 'swordsman'; return ORDER[c].map(function (id) { return AB[full(c, id)]; }); }
  S.list = list;

  /* ---------- ranks, gates and modifiers ---------- */
  function sk(p) { if (!p.skills) p.skills = { ranks: {}, spent: 0 }; return p.skills; }
  function rk(p, key) { return p && p.skills && p.skills.ranks[key] || 0; }
  var KEYS = ['pow', 'rad', 'cdr', 'eff', 'ult'];
  var NODE = { // per key: name, desc, max, level needed for the next rank (r = ranks already bought)
    pow: { name: 'Power', desc: '+10% damage per rank', max: 20, need: function (a, r) { return a.lvl + 3 * r + 1; } },
    rad: { name: 'Reach', desc: '+8% area / reach per rank', max: 5, need: function (a, r) { return a.lvl + 5 * r + 2; } },
    cdr: { name: 'Haste', desc: '-5% cooldown per rank', max: 5, need: function (a, r) { return a.lvl + 6 * r + 3; } },
    eff: { name: 'Effect', desc: '', max: 3, need: function (a, r) { return a.lvl + 4 + 6 * r; } },
    ult: { name: 'Mastery', desc: 'Capstone: +60% damage and a much stronger effect', max: 1, need: function (a) { return Math.max(40, a.lvl + 24); } }
  };
  S.NODE = NODE; S.KEYS = KEYS;
  function nodeId(ab, k) { return 'ab:' + ab + ':' + k; }
  S.rank = function (p, ab, k) { return rk(p, nodeId(N(p, ab), k)); };
  function synBonus(p, ab) { ab = N(p, ab); var a = AB[ab], q = a && AB[a.syn]; return q ? 0.05 * (rk(p, nodeId(q.id, 'pow')) + rk(p, nodeId(q.id, 'eff'))) : 0; }
  S.synBonus = synBonus;
  S.dmgMul = function (p, ab) { ab = N(p, ab); return 1 + 0.1 * rk(p, nodeId(ab, 'pow')) + synBonus(p, ab) + (p.mods && p.mods.allSpellPct || 0) + (rk(p, nodeId(ab, 'ult')) ? 0.6 : 0); };
  S.radMul = function (p, ab) { ab = N(p, ab); return 1 + 0.08 * rk(p, nodeId(ab, 'rad')); };
  S.cdMul = function (p, ab) { ab = N(p, ab); return 1 - 0.05 * rk(p, nodeId(ab, 'cdr')); };
  S.effRank = function (p, ab) { ab = N(p, ab); return rk(p, nodeId(ab, 'eff')) + (rk(p, nodeId(ab, 'ult')) ? 2 : 0); };
  S.canBuy = function (p, ab, k) {
    ab = N(p, ab); var a = AB[ab], n = NODE[k], r = rk(p, nodeId(ab, k));
    if (!p || !a) return { ok: false, reason: 'Unknown' };
    if ((p.level || 1) < a.lvl) return { ok: false, reason: 'Unlocks at level ' + a.lvl };
    if (r >= n.max) return { ok: false, reason: 'Maxed' };
    if (k === 'ult' && (rk(p, nodeId(ab, 'pow')) < 5 || rk(p, nodeId(ab, 'eff')) < 2)) return { ok: false, reason: 'Needs Power 5, Effect 2' };
    var need = n.need(a, r); if ((p.level || 1) < need) return { ok: false, reason: 'Next rank at level ' + need };
    if (ST().points(p) < 1) return { ok: false, reason: 'No skill points' };
    return { ok: true, reason: '' };
  };
  function spendPoint(p, key) { var s = sk(p); s.ranks[key] = (s.ranks[key] || 0) + 1; s.spent++; var C = CC.Classes; if (C && C.applyItemStats) C.applyItemStats(p); }
  S.buy = function (p, ab, k) {
    ab = N(p, ab); if (!S.canBuy(p, ab, k).ok) return false;
    spendPoint(p, nodeId(ab, k));
    var a = AB[ab]; if (k === 'eff' && a.eff.id === 'legion') { p.flags.legion = (p.flags.legion || 0) + 1; } if (k === 'eff' && a.eff.id === 'leech') { p.flags.vampirism = (p.flags.vampirism || 0) + 1; }
    txt(p.x, p.y - 22, a.name + ' ' + NODE[k].name + ' ' + rk(p, nodeId(ab, k)), '#9be36b', 11); return true;
  };
  // Training: class-independent repeatable passives; the number of ranks you may own grows with level, so damage cannot be piled up early
  var TRAIN = [
    { id: 'might', name: 'Might', desc: '+3% damage per rank', start: 6, step: 4, max: 24, apply: function (m) { m.dmgPct += 0.03; } },
    { id: 'vigor', name: 'Vigor', desc: '+4% max health per rank', start: 5, step: 4, max: 24, apply: function (m) { m.hpPct += 0.04; } },
    { id: 'ferocity', name: 'Ferocity', desc: '+4% crit damage per rank', start: 10, step: 5, max: 18, apply: function (m) { m.critDmg += 0.04; } },
    { id: 'accuracy', name: 'Accuracy', desc: '+0.6% crit chance per rank', start: 8, step: 6, max: 14, apply: function (m) { m.critPct += 0.006; } },
    { id: 'tempo', name: 'Tempo', desc: '+1% cooldown reduction per rank', start: 12, step: 6, max: 12, apply: function (m) { m.cdrPct += 0.01; } },
    { id: 'sorcery', name: 'Sorcery', desc: '+3% damage on all abilities per rank', start: 9, step: 4, max: 22, apply: function (m) { m.allSpellPct = (m.allSpellPct || 0) + 0.03; } },
    { id: 'bulwark', name: 'Bulwark', desc: '+1 armor per rank', start: 7, step: 3, max: 30, apply: function (m) { m.armor += 1; } }
  ];
  S.TRAIN = TRAIN;
  S.trainMax = function (p, t) { return clamp(Math.floor(((p.level || 1) - t.start) / t.step) + 1, 0, t.max); };
  S.trainNext = function (t, r) { return t.start + r * t.step; };
  S.canTrain = function (p, t) {
    var r = rk(p, 't:' + t.id);
    if (r >= t.max) return { ok: false, reason: 'Maxed' };
    if (r >= S.trainMax(p, t)) return { ok: false, reason: 'Next rank at level ' + S.trainNext(t, r) };
    if (ST().points(p) < 1) return { ok: false, reason: 'No skill points' };
    return { ok: true, reason: '' };
  };
  S.train = function (p, t) { if (!S.canTrain(p, t).ok) return false; t.apply(p.mods); spendPoint(p, 't:' + t.id); txt(p.x, p.y - 22, t.name + ' ' + rk(p, 't:' + t.id), '#9be36b', 11); return true; };

  /* ---------- slots ---------- */
  var SLOT_ACT = ['spell1', 'spell2', 'spell3', 'spell4'];
  S.ensure = function (p) {
    if (!p) return;
    var c0 = p.classId || 'swordsman', f1 = full(c0, 'spell1'), f2 = full(c0, 'spell2');
    if (!p.slots || p.slots.some(function (id) { return id && !AB[id]; })) p.slots = [f1, f2, null, null];
    if (!p.slotSeen) p.slotSeen = {}; p.slotSeen[f1] = 1; p.slotSeen[f2] = 1;
    list(p.classId).forEach(function (a) { // a newly unlocked ability drops into the first empty slot
      if ((p.level || 1) >= a.lvl && !p.slotSeen[a.id]) { p.slotSeen[a.id] = 1; var i = p.slots.indexOf(null); if (i >= 0 && p.slots.indexOf(a.id) < 0) { p.slots[i] = a.id; txt(p.x, p.y - 40, a.name + ' unlocked!', '#9fe3ff', 12); } }
    });
  };
  S.assign = function (p, slot, id) {
    S.ensure(p); id = N(p, id); var a = AB[id]; if (!a || (p.level || 1) < a.lvl) return false;
    var cur = p.slots.indexOf(id); if (cur >= 0) p.slots[cur] = p.slots[slot]; p.slots[slot] = id; return true;
  };
  S.slotAct = function (name) { return SLOT_ACT.indexOf(name); };
  S.chargeOk = function (name) { var p = hero(); if (!p) return true; S.ensure(p); var i = SLOT_ACT.indexOf(name); return p.slots[i] === full(p.classId, name); }; // the hold-to-aim charge belongs to a spell sitting in its own slot
  S.cdKey = function (p, name) { var id = p && p.slots && p.slots[SLOT_ACT.indexOf(name)], a = AB[id]; return a && a.orig ? a.orig : id ? 'ab_' + id : name; };
  S.slotInfo = function (p, name) {
    S.ensure(p); var id = p.slots[SLOT_ACT.indexOf(name)], a = AB[id];
    if (!a) return { name: '', empty: true, cost: null, cdMax: 0 };
    var cost = a.kind === 'orig' ? (p.cost && p.cost[a.orig]) : a.cost;
    return { name: a.name, empty: false, cost: cost, locked: (p.level || 1) < a.lvl, lvl: a.lvl, key: S.cdKey(p, name), cdMax: p.cdMax && p.cdMax[S.cdKey(p, name)] || a.cd, col: a.col };
  };
  // the cast keys: slot i fires the ability sitting in it
  S.route = function (p, inp, fn) {
    S.ensure(p);
    for (var i = 0; i < 4; i++) {
      if (!inp[SLOT_ACT[i]]) continue;
      var id = p.slots[i], a = AB[id]; if (!a) continue;
      if (a.orig === 'spell1') { if (p.cd.spell1 <= 0) fn.doSpell1(p); }
      else if (a.orig === 'spell2') { if (p.cd.spell2 <= 0 && p.level >= 4) fn.doSpell2(p); }
      else S.cast(p, id);
    }
  };

  /* ---------- effects ---------- */
  function foes() { return (H().foes ? H().foes() : (CC.Enemies && CC.Enemies.list) || []).filter(function (e) { return e && e.hp > 0 && !e.dead && !e.hidden && !e.asleepHidden; }); }
  S.eff = function (p, e, abId, mult) { // apply an ability's effect to a foe it hit
    var a = AB[abId]; if (!a || !e || e.hp <= 0) return;
    var r = S.effRank(p, abId); if (r <= 0 && !(a.kind !== 'orig' && a.eff.id === 'vuln')) return;
    var C = CC.Classes, dps = (p.stats.dmg || 10) * 0.3 * Math.max(1, r) * (mult || 1);
    switch (a.eff.id) {
      case 'stun': if (C.status) C.status(e, 'stun', 0.35 * r); break;
      case 'slow': if (C.status) C.status(e, 'slow', 1.5 + r, 0.55 - 0.05 * Math.min(r, 5)); break;
      case 'freeze': if (C.status) { C.status(e, 'stun', 0.45 * r); C.status(e, 'slow', 2 + r, 0.5); } break;
      case 'burn': if (H().ignite) H().ignite(e, 3 + r, dps, '#ff8a3c', 'fire'); break;
      case 'poison': if (H().ignite) H().ignite(e, 4 + r, dps * 0.9, '#9aff3a', 'poison'); break;
      case 'bleed': if (CC.Wounds && R() < 0.35 + 0.15 * r) CC.Wounds.apply(e, { dur: 2.5 + 0.6 * r, dps: Math.max(2, dps * 0.8), src: 'skill' }); break;
      case 'vuln': e.vulnT = 5 + r; e.vulnMul = Math.max(e.vulnMul || 1, 1.1 + 0.05 * r); break;
    }
  };
  function hit(p, e, mult, type, abId) {
    var dmg = Math.max(1, Math.round(p.stats.dmg * mult * S.dmgMul(p, abId)));
    var d = CC.Classes.hitEnemy(e, dmg, type, { ability: abId }); S.eff(p, e, abId); return d;
  }
  function area(p, cx, cy, rad, mult, type, abId) { var n = 0; foes().forEach(function (e) { if (Math.hypot(e.x - cx, e.y - cy) <= rad + (e.r || 8)) { hit(p, e, mult, type, abId); n++; } }); return n; }
  function nearestFoe(x, y, range, not) { var best = null, bd = range; foes().forEach(function (e) { if (not && not.indexOf(e) >= 0) return; var d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }); return best; }
  function ring(p, x, y, r, col) { if (H().addFx) H().addFx({ kind: 'ring', x: x, y: y, r: r, t: 0.4, max: 0.4, col: col }); }
  function move(p, dx, dy) { var D = CC.Dungeon; if (D && D.moveWithCollision) { var st = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8)); for (var i = 0; i < st; i++) D.moveWithCollision(p, dx / st, dy / st); } else { p.x += dx; p.y += dy; } }
  S.zones = [];

  /* ---------- casting the new abilities ---------- */
  S.cast = function (p, id) {
    id = N(p, id); var a = AB[id]; if (!a || a.cls !== p.classId || a.kind === 'orig' || (p.level || 1) < a.lvl) return false;
    var key = 'ab_' + id; p.cd[key] = p.cd[key] || 0; if (p.cd[key] > 0) return false;
    if (p.mana < a.cost) { if (!S._nm || S._nm < Date.now()) { txt(p.x, p.y - 18, 'No mana', '#6bb8ff', 10); S._nm = Date.now() + 600; } return false; }
    var dir = H().aimDir ? H().aimDir(p, 240) : { x: p.face || 1, y: 0, a: 0 }, rm = S.radMul(p, id), ok = true, t, i, e;
    p.mana -= a.cost; p.castFlash = 0.3;
    switch (a.kind) {
      case 'leap': {
        var d = Math.min(150, dir.target ? Math.hypot(dir.target.x - p.x, dir.target.y - p.y) : 130);
        move(p, dir.x * d, dir.y * d); p.iframes = Math.max(p.iframes || 0, 0.45);
        var rr = 62 * rm; area(p, p.x, p.y, rr, 2.0, 'slash', id); ring(p, p.x, p.y, rr, '#ffb060'); burst(p.x, p.y, '#ffb060', 22, 150); shake(7); break;
      }
      case 'wave': {
        H().shoot(p, dir.a, 250, 0.95, 1.7 * S.dmgMul(p, id), 11 * rm, 'wave', 'wave', '#9fd8ff', { pierce: true, ability: id }); break;
      }
      case 'cry': {
        var r = S.effRank(p, id); p.skBuff = { t: 8, dmg: 0.25 + 0.05 * rk(p, nodeId(id, 'pow')) * 0.5, spd: 0.15 };
        if (a.eff.id === 'heal' && r > 0 && CC.Classes.heal) CC.Classes.heal(p, p.maxHp * 0.06 * r);
        ring(p, p.x, p.y, 70, '#ff9a5a'); burst(p.x, p.y, '#ff9a5a', 24, 120); txt(p.x, p.y - 26, 'WAR CRY!', '#ffb070', 13); shake(4); break;
      }
      case 'chain': {
        t = dir.target || nearestFoe(p.x, p.y, 260); if (!t) { ok = false; break; }
        var seen = [t], from = { x: p.x, y: p.y }, jumps = 2 + S.effRank(p, id), mult = 1.4, cur = t;
        for (i = 0; cur && i <= jumps; i++) { hit(p, cur, mult, 'shock', id); if (H().addFx) H().addFx({ kind: 'beam', x: from.x, y: from.y, x2: cur.x, y2: cur.y, t: 0.25, max: 0.25, col: '#8fd0ff' }); burst(cur.x, cur.y, '#bfe9ff', 6, 90); from = { x: cur.x, y: cur.y }; mult *= 0.85; cur = nearestFoe(cur.x, cur.y, 120 * rm, seen); if (cur) seen.push(cur); }
        break;
      }
      case 'orb': { H().shoot(p, dir.a, 95, 2.5, 2.2 * S.dmgMul(p, id), 12 * rm, 'orb', 'orb', '#b08aff', { pierce: true, ability: id }); break; }
      case 'blink': {
        var ox = p.x, oy = p.y; area(p, ox, oy, 50 * rm, 0.9, 'frost', id); ring(p, ox, oy, 50 * rm, '#c8a8ff');
        move(p, dir.x * 150, dir.y * 150); p.iframes = Math.max(p.iframes || 0, 0.4); area(p, p.x, p.y, 50 * rm, 0.9, 'fire', id); ring(p, p.x, p.y, 50 * rm, '#c8a8ff'); burst(p.x, p.y, '#c8a8ff', 20, 140); break;
      }
      case 'spear': { H().shoot(p, dir.a, 360, 0.7, 1.8 * S.dmgMul(p, id), 8 * rm, 'shard', 'bone', '#e8e6d0', { pierce: true, ability: id }); break; }
      case 'blast': {
        t = dir.target || nearestFoe(p.x, p.y, 260); if (!t) { ok = false; break; }
        var br = 70 * rm; area(p, t.x, t.y, br, 1.9, 'poison', id); ring(p, t.x, t.y, br, '#9aff7a'); burst(t.x, t.y, '#9aff7a', 24, 150); burst(t.x, t.y, '#d8d4c0', 10, 120); shake(5); break;
      }
      case 'curse': {
        var cr = 130 * rm; foes().forEach(function (e2) { if (Math.hypot(e2.x - p.x, e2.y - p.y) <= cr) { e2.vulnT = 6 + S.effRank(p, id); e2.vulnMul = 1.15 + 0.05 * S.effRank(p, id); if (CC.Classes.status) CC.Classes.status(e2, 'slow', 3, 0.6); hit(p, e2, 0.5, 'curse', id); } });
        ring(p, p.x, p.y, cr, '#b06aff'); burst(p.x, p.y, '#b06aff', 24, 120); txt(p.x, p.y - 26, 'HEX', '#d0a0ff', 12); break;
      }
      case 'step': {
        t = dir.target || nearestFoe(p.x, p.y, 260); var bk = t ? (t.face || 1) : 1;
        if (t) { burst(p.x, p.y, '#a078ff', 14, 100); p.x = t.x - bk * 18; p.y = t.y; var D = CC.Dungeon; if (D && D.isSolid && D.isSolid(p.x, p.y)) { p.x = t.x + bk * 18; } p.face = t.x >= p.x ? 1 : -1; p.ambushT = 1; hit(p, t, 2.4, 'slash', id); burst(t.x, t.y, '#ff4a5c', 14, 130); }
        else { move(p, dir.x * 110, dir.y * 110); }
        p.iframes = Math.max(p.iframes || 0, 0.45); burst(p.x, p.y, '#a078ff', 14, 100); break;
      }
      case 'fan': { for (i = 0; i < 12; i++) H().shoot(p, i / 12 * TAU, 280, 0.55, 0.75 * S.dmgMul(p, id), 3 * rm, 'shard', 'knife', '#e6edf7', { ability: id }); ring(p, p.x, p.y, 30, '#e6edf7'); break; }
      case 'venom': {
        var tx = dir.target ? dir.target.x : p.x + dir.x * 120, ty = dir.target ? dir.target.y : p.y + dir.y * 120;
        S.zones.push({ x: tx, y: ty, r: 64 * rm, t: 5, tick: 0.3, id: id, p: p }); burst(tx, ty, '#9aff3a', 18, 100); ring(p, tx, ty, 64 * rm, '#9aff3a'); break;
      }
    }
    if (!ok) { p.mana += a.cost; return false; }
    var cdv = a.cd * S.cdMul(p, id) * (1 - Math.min(0.5, p.stats.cdr || 0)); p.cd[key] = cdv; p.cdMax[key] = cdv;
    return true;
  };

  /* ---------- hooks from classes.js ---------- */
  var TYPE_AB = { swordsman: { bash: 'spell1' }, wizard: { fire: 'spell1', frost: 'spell2' }, thief: { knife: 'spell1', smoke: 'spell2' }, necromancer: { drain: 'spell2' } };
  S.preHit = function (p, e, type, opts) { // damage multipliers, applied before the hit lands
    var m = 1, f = p.flags || {}, melee = type === 'slash' || type === 'melee' || type === 'physical';
    if (e.vulnT > 0) m *= e.vulnMul || 1.2;
    if (p.skBuff && p.skBuff.t > 0) m *= 1 + p.skBuff.dmg;
    if (f.warlord && p.hp < p.maxHp * 0.5) m *= 1.2;
    if (f.execute && e.maxHp && e.hp < e.maxHp * 0.3) m *= 1 + 0.5 * f.execute;
    if (f.reaper && e.maxHp && e.hp < e.maxHp * 0.35) m *= 1.4;
    if (f.overcharge && !melee && p.mana > p.maxMana * 0.8) m *= 1.25;
    return m;
  };
  S.onHit = function (p, e, dmg, type, opts) {
    if (!p || !e || S._busy || (opts && (opts.noCrit && !opts.basicAttack || opts.minion))) return;
    var f = p.flags || {}, melee = type === 'slash' || type === 'melee' || type === 'physical', basic = !!(opts && opts.basicAttack), cls = p.classId, i;
    S._busy = true;
    try {
      var ab = opts && opts.ability || (cls === 'swordsman' && melee && p.whirlT > 0 ? 'spell2' : TYPE_AB[cls] && TYPE_AB[cls][type]); if (ab) ab = full(cls, ab);
      if (ab && !(opts && opts.ability)) S.eff(p, e, ab);
      if (f.magicBlade && cls === 'swordsman' && melee && basic) { // the glowing blade adds 3-7 magic damage, scaled by Arcane Edge, spell mastery and level
        var syn = 0; list('swordsman').forEach(function (a) { syn += rk(p, nodeId(a.id, 'pow')) * 0.02; });
        var mg = Math.round((3 + R() * 4) * (1 + 0.5 * (f.arcane || 0)) * (1 + syn + (p.mods.allSpellPct || 0)) + (p.level || 1) * 0.12);
        if (CC.Enemies && CC.Enemies.damage && e.hp > 0) CC.Enemies.damage(e, mg, 'magic');
        txt(e.x + 8, e.y - (e.r || 8) - 12, '+' + mg, '#6fd2ff', 9); burst(e.x, e.y, '#6fd2ff', 5, 80);
        if (f.arcane) p.mana = Math.min(p.maxMana, p.mana + 1);
      }
      if (f.tempest && cls === 'swordsman' && melee && basic) { p.tempestN = (p.tempestN || 0) + 1; if (p.tempestN >= 5) { p.tempestN = 0; area(p, e.x, e.y, 56, 0.8, 'magic', 'leap'); ring(p, e.x, e.y, 56, '#9fd8ff'); burst(e.x, e.y, '#9fd8ff', 16, 140); txt(p.x, p.y - 26, 'TEMPEST', '#9fd8ff', 10); } }
      if (f.staticCharge && cls === 'wizard' && !melee && R() < 0.2) { var n2 = nearestFoe(e.x, e.y, 110, [e]); if (n2) { if (CC.Enemies && CC.Enemies.damage) CC.Enemies.damage(n2, Math.max(1, Math.round(dmg * 0.5)), 'shock'); if (H().addFx) H().addFx({ kind: 'beam', x: e.x, y: e.y, x2: n2.x, y2: n2.y, t: 0.2, max: 0.2, col: '#8fd0ff' }); } }
      if (f.emberheart && type === 'fire' && H().ignite) H().ignite(e, 3, (p.stats.dmg || 10) * 0.25, '#ff8a3c', 'fire');
      if (f.frostbind && type === 'frost') { e.vulnT = Math.max(e.vulnT || 0, 4); e.vulnMul = Math.max(e.vulnMul || 1, 1.15); }
      if (f.plague && R() < 0.25 && H().ignite) H().ignite(e, 4, (p.stats.dmg || 10) * 0.2, '#9aff3a', 'poison');
      if (f.bloodletter && cls === 'thief' && basic && CC.Wounds && R() < 0.12) CC.Wounds.apply(e, { dur: 2.5, dps: Math.max(2, (p.stats.dmg || 10) * 0.22), src: 'blade' });
      if (f.thousandCuts && cls === 'thief' && basic && R() < 0.2) { var n3 = nearestFoe(e.x, e.y, 90, [e]); if (n3 && CC.Enemies && CC.Enemies.damage) { CC.Enemies.damage(n3, Math.max(1, Math.round(dmg * 0.4)), 'slash'); burst(n3.x, n3.y, '#e6edf7', 4, 80); } }
    } finally { S._busy = false; }
  };
  S.update = function (p, dt) {
    if (!p) return; S.ensure(p);
    if (p.skBuff) { p.skBuff.t -= dt; if (p.skBuff.t <= 0) p.skBuff = null; }
    if (p.stats) p.speed = p.stats.speed * (p.skBuff ? 1 + p.skBuff.spd : 1);
    if (p.flags && p.flags.boneArmor) { var n = (CC.Classes.minions || []).length; p.mods.armor = p.mods.armor; p.boneArmorN = n; }
    foes().forEach(function (e) { if (e.vulnT > 0) e.vulnT -= dt; });
    for (var i = S.zones.length - 1; i >= 0; i--) { // lingering venom clouds
      var z = S.zones[i]; z.t -= dt; z.tick -= dt;
      if (z.t <= 0) { S.zones.splice(i, 1); continue; }
      if (z.tick <= 0) { z.tick = 0.4; foes().forEach(function (e) { if (Math.hypot(e.x - z.x, e.y - z.y) <= z.r + (e.r || 8)) { CC.Classes.hitEnemy(e, Math.max(1, Math.round(p.stats.dmg * 0.3 * S.dmgMul(p, z.id))), 'poison', { noCrit: true, ability: z.id }); e.vulnT = Math.max(e.vulnT || 0, 2 + S.effRank(p, z.id)); e.vulnMul = Math.max(e.vulnMul || 1, S.effRank(p, z.id) > 0 ? 1.15 : 1); } }); }
    }
  };
  S.draw = function (c, cam) {
    var t = Date.now() / 1000;
    S.zones.forEach(function (z) {
      var x = z.x - cam.x, y = z.y - cam.y, a = Math.min(1, z.t / 1.2);
      var g = c.createRadialGradient(x, y, 4, x, y, z.r); g.addColorStop(0, 'rgba(150,255,60,' + 0.32 * a + ')'); g.addColorStop(1, 'rgba(90,200,40,0)'); c.fillStyle = g; c.fillRect(x - z.r, y - z.r, z.r * 2, z.r * 2);
      c.fillStyle = 'rgba(190,255,110,' + 0.5 * a + ')'; for (var i = 0; i < 6; i++) { var ph = (t * 0.6 + i / 6) % 1; c.beginPath(); c.arc(x + Math.cos(i * 2.4 + t) * z.r * 0.6, y - ph * 24 + Math.sin(i * 2.4) * z.r * 0.4, 2.2 - ph, 0, TAU); c.fill(); }
    });
    var p = hero(); if (p && p.flags && p.flags.magicBlade && p.classId === 'swordsman') { // sparks drifting off the glowing blade
      var x2 = p.x - cam.x + (p.face || 1) * 9, y2 = p.y - cam.y - 4; c.save(); c.globalCompositeOperation = 'lighter';
      for (var k = 0; k < 4; k++) { var ph2 = (t * 1.2 + k / 4) % 1; c.fillStyle = 'rgba(110,210,255,' + (1 - ph2) * 0.8 + ')'; c.fillRect(x2 + Math.sin(k * 4 + t * 3) * 6, y2 - 8 - ph2 * 16, 1.6, 1.6); } c.restore();
    }
  };


  /* ---------- the Skills screen: sub-tabs for Passives (ui.js's tree), Training, and Abilities with the slot picker ---------- */
  var uiMode = 'passives', selAb = null, selSlot = 0, ROMAN = ['I', 'II', 'III', 'IV'];
  S.uiBar = function (c, addHit, x, y, w, p, U) {
    var tabs = [['passives', 'Passives'], ['training', 'Training'], ['abilities', 'Abilities']], bw = Math.min(104, (w - 8) / 3 - 4), i;
    for (i = 0; i < 3; i++) (function (t, k) { U.button(c, addHit, x + 4 + k * (bw + 4), y + 2, bw, 22, t[1], true, function () { uiMode = t[0]; }, uiMode === t[0] ? '#7a5a22' : '#3a3046'); })(tabs[i], i);
    return uiMode;
  };
  S.uiPage = function (mode, c, addHit, x, y, w, h, p, U) {
    var COL = U.COL, tx = U.tx, btn = U.button, pts = ST().points(p), i, yy;
    tx(c, pts > 0 ? 'POINTS TO SPEND: ' + pts : 'Skill points: 0', x + 6, y + 10, 13, pts > 0 ? COL.good : COL.dim);
    tx(c, 'LV ' + (p.level || 1) + '/' + ST().MAX_LEVEL, x + w - 6, y + 10, 11, p.color || COL.text, 'right');
    if (mode === 'training') {
      tx(c, 'Repeatable skills. Each rank is gated by level, so power comes with growth, not all at once.', x + 6, y + 30, 10, COL.dim);
      var rh = Math.max(38, Math.min(54, (h - 60) / TRAIN.length));
      TRAIN.forEach(function (t, k) {
        var ry = y + 44 + k * rh, r = rk(p, 't:' + t.id), cb = S.canTrain(p, t), allowed = S.trainMax(p, t);
        c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x + 4, ry, w - 8, rh - 4);
        tx(c, t.name + '   ' + r + ' / ' + allowed + (allowed < t.max ? '  (max ' + t.max + ')' : ''), x + 12, ry + 12, 13, COL.text);
        tx(c, t.desc + (r >= allowed && r < t.max ? '   Next rank at level ' + S.trainNext(t, r) : ''), x + 12, ry + 30, 10, cb.ok ? COL.good : COL.dim);
        btn(c, addHit, x + w - 70, ry + 5, 58, rh - 14, '+1', cb.ok, function () { S.train(p, t); }, '#39644a');
      });
      return;
    }
    // abilities
    S.ensure(p); var lst = list(p.classId); if (!selAb || !AB[selAb] || AB[selAb].cls !== p.classId) selAb = lst[0].id;
    var bw = (w - 8) / 4;
    tx(c, 'SKILL SLOTS  (keys Q E R T)   tap a slot, then an ability', x + 6, y + 30, 10, COL.dim);
    for (i = 0; i < 4; i++) (function (k) {
      var sx = x + 4 + k * bw, id = p.slots[k], a = AB[id], on = selSlot === k;
      c.fillStyle = on ? 'rgba(224,168,74,0.25)' : 'rgba(255,255,255,0.06)'; c.fillRect(sx + 1, y + 40, bw - 3, 38); c.strokeStyle = on ? COL.accent : COL.line; c.lineWidth = on ? 2 : 1; c.strokeRect(sx + 1.5, y + 40.5, bw - 4, 37);
      tx(c, ROMAN[k], sx + 8, y + 50, 11, COL.accent); tx(c, a ? a.name : '— empty —', sx + bw / 2, y + 64, bw < 100 ? 9 : 10, a ? '#fff' : COL.dim, 'center');
      addHit(sx + 1, y + 40, bw - 3, 38, function () { selSlot = k; });
    })(i);
    var aw = (w - 8) / 5; yy = y + 86;
    lst.forEach(function (a, k) {
      var locked = (p.level || 1) < a.lvl, on = selAb === a.id;
      btn(c, addHit, x + 4 + k * aw, yy, aw - 3, 24, locked ? 'Lv ' + a.lvl : a.name.split(' ')[0], true, function () { selAb = a.id; }, on ? '#7a5a22' : locked ? '#2a2630' : '#3a3046');
    });
    var a = AB[selAb], locked = (p.level || 1) < a.lvl; yy += 32;
    tx(c, a.name, x + 8, yy + 6, 15, a.col); tx(c, a.cost + ' mana  ·  ' + a.cd + 's cooldown', x + w - 8, yy + 6, 10, COL.dim, 'right');
    tx(c, a.desc, x + 8, yy + 24, 10, COL.text);
    var cur = p.slots.indexOf(a.id);
    if (locked) tx(c, 'Unlocks at level ' + a.lvl, x + 8, yy + 42, 11, '#ffd36b');
    else btn(c, addHit, x + 4, yy + 32, w - 8, 22, cur >= 0 ? 'In slot ' + ROMAN[cur] + '  -  move to slot ' + ROMAN[selSlot] : 'Put in slot ' + ROMAN[selSlot], cur !== selSlot, function () { S.assign(p, selSlot, a.id); }, '#39644a');
    yy += 62;
    var rh = Math.max(32, Math.min(46, (y + h - yy - 40) / 5));
    KEYS.forEach(function (k, n) {
      var nd = NODE[k], r = rk(p, nodeId(a.id, k)), cb = S.canBuy(p, a.id, k), ry = yy + n * rh;
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x + 4, ry, w - 8, rh - 3);
      var nm = k === 'eff' ? a.eff.name : nd.name, ds = k === 'eff' ? a.eff.desc : nd.desc;
      tx(c, nm + '   ' + r + ' / ' + nd.max, x + 12, ry + 11, 12, r > 0 ? COL.text : COL.dim);
      tx(c, cb.ok || r >= nd.max ? ds : ds + '  -  ' + cb.reason, x + 12, ry + rh - 13, 9, cb.ok ? COL.good : COL.dim);
      btn(c, addHit, x + w - 60, ry + 4, 50, rh - 11, '+', cb.ok, function () { S.buy(p, a.id, k); }, '#39644a');
    });
    var q = AB[a.syn], sb = synBonus(p, a.id);
    tx(c, 'Synergy: +5% damage per point in ' + (q ? q.name : '') + ' (Power / Effect)  ->  now +' + Math.round(sb * 100) + '%   ·   total damage x' + S.dmgMul(p, a.id).toFixed(2), x + 8, yy + 5 * rh + 8, 10, '#9fd8ff');
  };

  /* ---------- perks: lots more, and unique ones ---------- */
  function fl(p, k) { p.flags[k] = (p.flags[k] || 0) + 1; }
  function P(id, name, desc, fn, req) { return { id: id, name: name, desc: desc, apply: fn, req: req }; }
  var COMMON = [
    P('c_vit', 'Hardy', '+12% max health', function (p) { p.mods.hpPct += 0.12; }), P('c_mind', 'Deep Well', '+15% max mana', function (p) { p.mods.manaPct += 0.15; }),
    P('c_greed', 'Fortune', '+15% gold find', function (p) { p.goldFind = (p.goldFind || 0) + 15; }), P('c_study', 'Quick Study', '+10% experience', function (p) { p.mods.xpPct += 0.1; }),
    P('c_aim', 'Deadly Aim', '+6% crit chance', function (p) { p.mods.critPct += 0.06; }), P('c_brutal', 'Brutality', '+30% crit damage', function (p) { p.mods.critDmg += 0.3; }),
    P('c_hard', 'Hardened', '+5 armor', function (p) { p.mods.armor += 5; }), P('c_recover', 'Recovery', '+1 HP/s and +1 mana/s', function (p) { p.mods.regenHp += 1; p.mods.regenMana += 1; }),
    P('c_quick', 'Quickstep', '+8% move speed, -5% cooldowns', function (p) { p.mods.speedPct += 0.08; p.mods.cdrPct += 0.05; }), P('c_craft', 'Spellcraft', '+12% damage on all abilities', function (p) { p.mods.allSpellPct = (p.mods.allSpellPct || 0) + 0.12; }),
    P('c_sturdy', 'Second Wind II', 'Regenerate 2.5 HP/s', function (p) { p.mods.regenHp += 2.5; }), P('c_edge', 'Honed', '+10% damage', function (p) { p.mods.dmgPct += 0.1; }),
    P('c_vamp', 'Bloodthirst', 'Heal 4% of damage dealt', function (p) { p.mods.lifesteal += 0.04; }), P('c_focus', 'Mental Focus', '-8% cooldowns', function (p) { p.mods.cdrPct += 0.08; })
  ];
  var UNIQUE = {
    swordsman: [
      P('magicblade', 'Magic Blade', 'Your blade glows blue, slashes turn blue and every hit adds 3-7 magic damage (grows with level, Arcane Edge and spell training)', function (p) { fl(p, 'magicBlade'); }),
      P('arcane', 'Arcane Edge', 'Magic Blade damage +50% and each hit restores 1 mana', function (p) { fl(p, 'arcane'); }, 'magicblade'),
      P('tempest', 'Tempest', 'Every 5th sword hit releases a shockwave', function (p) { fl(p, 'tempest'); }),
      P('crimson', 'Crimson Edge', 'Sword wounds are twice as likely and bleed 40% harder', function (p) { fl(p, 'crimson'); fl(p, 'gash'); }),
      P('bulwark2', 'Shield Wall', '+8 armor, Shield Bash +30% damage', function (p) { p.mods.armor += 8; p.mods.spell1Pct += 0.3; }),
      P('warlord', 'Warlord', '+20% damage while below half health', function (p) { fl(p, 'warlord'); })
    ],
    wizard: [
      P('staticcharge', 'Static Charge', 'Spell hits have a 20% chance to arc to a nearby foe', function (p) { fl(p, 'staticCharge'); }),
      P('overcharge', 'Overcharge', '+25% ability damage while your mana is above 80%', function (p) { fl(p, 'overcharge'); }),
      P('emberheart', 'Emberheart', 'Fire sets targets ablaze', function (p) { fl(p, 'emberheart'); }),
      P('frostbind', 'Frostbind', 'Frozen foes take 15% more damage from everything', function (p) { fl(p, 'frostbind'); }),
      P('manafont', 'Mana Font', '+30% max mana, +2 mana regen', function (p) { p.mods.manaPct += 0.3; p.mods.regenMana += 2; })
    ],
    necromancer: [
      P('plague', 'Plague Touch', 'Your hits have a 25% chance to poison', function (p) { fl(p, 'plague'); }),
      P('bonearmor', 'Bone Armor', '+6 armor and +10% max health', function (p) { p.mods.armor += 6; p.mods.hpPct += 0.1; }),
      P('reaper', 'Reaper', '+40% damage to foes below 35% health', function (p) { fl(p, 'reaper'); }),
      P('soulharvest', 'Soul Harvest', 'Heal 8% of damage dealt', function (p) { p.mods.lifesteal += 0.08; }),
      P('darkpact', 'Dark Pact', '+25% ability damage, -10% max health', function (p) { p.mods.allSpellPct = (p.mods.allSpellPct || 0) + 0.25; p.mods.hpPct -= 0.1; })
    ],
    thief: [
      P('bloodletter', 'Bloodletter', 'Dagger hits open bleeding wounds 12% of the time', function (p) { fl(p, 'bloodletter'); }),
      P('execute', 'Assassin', '+50% damage to foes below 30% health', function (p) { fl(p, 'execute'); }),
      P('thousand', 'Thousand Cuts', '20% of hits also slash a second foe nearby', function (p) { fl(p, 'thousandCuts'); }),
      P('shadowdancer', 'Shadow Dancer', '-25% cooldowns, +8% move speed', function (p) { p.mods.cdrPct += 0.25; p.mods.speedPct += 0.08; }),
      P('deadlytoxin', 'Deadly Toxin', 'Poison and bleed effects hit 30% harder (+12% damage)', function (p) { p.mods.dmgPct += 0.12; })
    ]
  };
  S.installPerks = function () {
    var C = CC.Classes; if (!C || !C.PERKS) return;
    Object.keys(C.PERKS).forEach(function (cls) {
      var have = {}; C.PERKS[cls].forEach(function (k) { have[k.id] = 1; });
      COMMON.concat(UNIQUE[cls] || []).forEach(function (k) { if (!have[k.id]) C.PERKS[cls].push(k); });
    });
  };
  S.installPerks();
})(window);
