/* CC.DropTables - Diablo II style drops (step 1 of the gear update, see GEAR_PLAN.md).
 *
 * Every source of loot has a TIER: normal monster, champion (elite), miniboss (night stalkers and other mini-bosses), boss, chest 1/2/3.
 * A tier says how many items it drops (its picks, and for a normal monster the chance of any drop at all), how likely it is to drop an item ABOVE the
 * monster's level (overlevel), and the base chance of each quality. The quality roll runs in Diablo II's order: Legendary, then Epic, then Rare,
 * then Uncommon, else Common. Only the roll is touched by Magic Find (our luck stat, 5 MF per luck point, with diminishing returns per quality);
 * it never changes whether something drops.
 *
 *   itemLevel(monsterLevel, tier, cycle, rnd)  ->  { ilvl, over }   the item level, with the overlevel roll and +3 per replay cycle
 *   mfEff(luck, quality)                       ->  effective Magic Find in percent
 *   odds(tier, luck)                           ->  { leg, epic, rare, unc }  the quality chances after Magic Find
 *   rollQuality(tier, ilvl, luck, rnd, minR)   ->  0..4 (Common..Legendary)
 *   pickCount(tier, rnd)                       ->  how many items this kill drops
 *   pickLegend(list, slot, ilvl, cls, rnd)     ->  an eligible legendary (qlvl <= ilvl), your class at weight 1, other classes at 0.35
 *   makeDrop(o)                                ->  one finished item (uses CC.Loot.makeItem)
 *   pity                                       ->  the bad-luck protection: a guaranteed legendary after PITY_AT miniboss/boss kills without one
 * A legendary has a quality level (qlvl): it is only eligible once the item level reaches it, and its required level is its qlvl. Every other item
 * needs ceil(ilvl * 0.8). Gear above your level can be carried but not worn (strict, Diablo II style).
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, DT = CC.DropTables = {};

  // chances are per item that drops; picks are how many items a kill drops; dropChance only matters for a normal monster
  DT.TIERS = {
    normal:   { dropChance: 0.07, picks: [1, 1], over: [0.04, 1, 2], q: { leg: 0.0002, epic: 0.006, rare: 0.04, unc: 0.20 }, minR: 0 },
    champion: { dropChance: 1, picks: [1, 2], pick2: 0.35, over: [0.08, 1, 3], q: { leg: 0.004, epic: 0.04, rare: 0.14, unc: 0.30 }, minR: 1 },
    miniboss: { dropChance: 1, picks: [2, 4], over: [0.15, 2, 4], q: { leg: 0.03, epic: 0.12, rare: 0.26, unc: 0.30 }, minR: 1 },
    boss:     { dropChance: 1, picks: [3, 5], over: [1, 2, 5], q: { leg: 0.08, epic: 0.25, rare: 0.30, unc: 0.20 }, minR: 1 },
    chest1:   { dropChance: 1, picks: [1, 2], pick2: 0.2, over: [0.08, 1, 2], q: { leg: 0.001, epic: 0.02, rare: 0.08, unc: 0.28 }, minR: 1 },
    chest2:   { dropChance: 1, picks: [2, 3], pick2: 0.2, over: [0.08, 1, 2], q: { leg: 0.004, epic: 0.06, rare: 0.16, unc: 0.30 }, minR: 1 },
    chest3:   { dropChance: 1, picks: [2, 3], pick2: 0.5, over: [0.08, 1, 2], q: { leg: 0.015, epic: 0.12, rare: 0.26, unc: 0.30 }, minR: 1 }
  };
  DT.MF_PER_LUCK = 5;
  DT.K = { leg: 250, epic: 1000, rare: 600, unc: 1000 }; // the Magic Find curve per quality (diminishing returns, like Diablo II)
  DT.EPIC_MIN_ILVL = 4; DT.RARE_MIN_ILVL = 2; // low-level monsters cannot drop the higher qualities
  DT.OTHER_CLASS_WEIGHT = 0.35; DT.PITY_AT = 25; DT.CYCLE_ILVL = 3; DT.REQ_FACTOR = 0.8;

  function rnd0() { return Math.random(); }
  DT.tierOf = function (src) {
    if (!src) return 'normal';
    if (src.isChest || (src.tier !== undefined && src.opened !== undefined)) return 'chest' + (1 + Math.max(0, Math.min(2, src.tier | 0)));
    if (src.boss) return 'boss';
    if (src.miniBoss || src.nightStalker) return 'miniboss';
    if (src.elite) return 'champion';
    return 'normal';
  };
  DT.itemLevel = function (monsterLevel, tier, cycle, rnd) {
    rnd = rnd || rnd0; var T = DT.TIERS[tier] || DT.TIERS.normal, over = 0;
    if (rnd() < T.over[0]) over = T.over[1] + Math.floor(rnd() * (T.over[2] - T.over[1] + 1));
    return { ilvl: Math.max(1, Math.round(monsterLevel) + over + DT.CYCLE_ILVL * (cycle || 0)), over: over };
  };
  DT.mfEff = function (luck, quality) { var mf = Math.max(0, luck || 0) * DT.MF_PER_LUCK, K = DT.K[quality] || 1000; return mf * K / (mf + K); };
  DT.odds = function (tier, luck) {
    var T = DT.TIERS[tier] || DT.TIERS.normal, out = {}, k;
    for (k in T.q) out[k] = Math.min(0.95, T.q[k] * (1 + DT.mfEff(luck, k) / 100));
    return out;
  };
  // Diablo II order: unique first, then down. minR guarantees at least that rarity (elites and chests never drop Common).
  DT.rollQuality = function (tier, ilvl, luck, rnd, minR) {
    rnd = rnd || rnd0; var o = DT.odds(tier, luck), r = 0;
    if (rnd() < o.leg) r = 4;
    else if (rnd() < o.epic) r = 3;
    else if (rnd() < o.rare) r = 2;
    else if (rnd() < o.unc) r = 1;
    if (r === 3 && ilvl < DT.EPIC_MIN_ILVL) r = 2;
    if (r === 2 && ilvl < DT.RARE_MIN_ILVL) r = 1;
    return Math.max(r, minR === undefined ? (DT.TIERS[tier] || {}).minR | 0 : minR);
  };
  DT.pickCount = function (tier, rnd) {
    rnd = rnd || rnd0; var T = DT.TIERS[tier] || DT.TIERS.normal;
    if (rnd() >= T.dropChance) return 0;
    if (T.pick2 !== undefined) return T.picks[0] + (rnd() < T.pick2 ? 1 : 0);
    return T.picks[0] + Math.floor(rnd() * (T.picks[1] - T.picks[0] + 1));
  };
  // the weapon you find is usually one you can use: weapon-slot drops are class bases 55% of the time (loot.js reads CLASS_WEAPON_ODDS)
  DT.CLASS_WEAPON_ODDS = 0.55;
  // src: { id, stalker } the kill that is dropping it. A bound weapon only drops from its own boss or night stalker, and then very often.
  DT.pickLegend = function (list, slot, ilvl, cls, rnd, src) {
    rnd = rnd || rnd0; var pool = [], w = [], tot = 0, i, l, q;
    for (i = 0; i < list.length; i++) {
      l = list[i]; q = l.qlvl || 1;
      if (slot && l.slot !== slot) continue;
      if (q > ilvl) continue; // not until the monster is high enough level
      var boundOk = true;
      if (l.boundTo) boundOk = !!src && src.id === l.boundTo && (l.boundKind === 'stalker' ? !!src.stalker : !src.stalker);
      if (!boundOk) continue;
      var wt = (!l.cls || !cls || l.cls === cls) ? 1 : DT.OTHER_CLASS_WEIGHT;
      wt *= 1 + Math.min(0.5, 0.04 * (ilvl - q));
      if (l.boundTo) wt *= 30;
      pool.push(l); w.push(wt); tot += wt;
    }
    if (!pool.length) return null;
    var r = rnd() * tot; for (i = 0; i < pool.length; i++) { r -= w[i]; if (r < 0) return pool[i]; }
    return pool[pool.length - 1];
  };
  DT.requiredLevel = function (item) {
    if (!item || item.slot === 'charm') return 1;
    if (item.legendary && item.qlvl) return item.qlvl;
    return Math.max(1, Math.ceil((item.ilvl || 1) * DT.REQ_FACTOR));
  };
  DT.canWear = function (item, level) { return !item || (level || 1) >= (item.reqLevel || DT.requiredLevel(item)); };

  // the Legendary Codex remembers every legendary you have picked up
  DT.found = function (item) { var s = CC.state; if (!s || !item || !item.legendary) return false; s.codex = s.codex || {}; if (s.codex[item.name]) return false; s.codex[item.name] = 1; return true; };
  DT.foundCount = function () { var s = CC.state; return s && s.codex ? Object.keys(s.codex).length : 0; };

  // bad-luck protection: counts miniboss and boss kills without a legendary
  DT.pity = {
    state: function () { var s = CC.state; if (!s) return { n: 0 }; if (!s.pity || typeof s.pity !== 'object') s.pity = { n: 0 }; return s.pity; },
    due: function () { return DT.pity.state().n >= DT.PITY_AT; },
    kill: function (tier, gotLegend) {
      var p = DT.pity.state();
      if (gotLegend) p.n = 0; else if (tier === 'boss' || tier === 'miniboss') p.n++;
    }
  };

  // one finished item. o: { tier, level (monster level), luck, cls, minR, force (a legendary no matter what), rnd, cycle, slot }
  DT.makeDrop = function (o) {
    var L = CC.Loot, rnd = o.rnd || rnd0, tier = o.tier || 'normal', lv = DT.itemLevel(o.level || 1, tier, o.cycle, rnd), q;
    q = o.force ? 4 : DT.rollQuality(tier, lv.ilvl, o.luck, rnd, o.minR);
    var slot = o.slot || null, legend = null;
    if (q === 4) {
      var from = { id: o.source, stalker: !!o.stalker };
      legend = DT.pickLegend(L.LEGENDS, slot, lv.ilvl, o.cls, rnd, from) || (!slot ? null : DT.pickLegend(L.LEGENDS, null, lv.ilvl, o.cls, rnd, from));
      if (!legend) q = 3; // nothing legendary is eligible yet at this item level: an epic instead
      else slot = legend.slot;
    }
    var it = L.rollItemOfQuality ? L.rollItemOfQuality(lv.ilvl, q, o.cls, slot, legend) : L.makeItem(lv.ilvl, q, slot || undefined, o.cls);
    it.over = lv.over; it.reqLevel = DT.requiredLevel(it);
    return it;
  };
})(typeof window !== 'undefined' ? window : globalThis);
