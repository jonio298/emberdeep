/* toughfliers.js - bats and birds were far too squishy (one hit). A single hit can now take at most ~32% of their maximum health, so every bat, crow and raven
 * takes at least 3 hits to kill no matter how hard the hero hits. Loaded before difficulty.js, so the cap applies to the damage AFTER the slider's scaling. */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, E = CC.Enemies; if (!E || !E.damage) return;
  var FLIERS = { bat: 1, crow: 1, raven: 1, eagle: 1 }, CAP = 0.32, base = E.damage;
  E.damage = function (e, amount, type) {
    if (e && FLIERS[e.type] && amount > 0 && e.maxHp > 0) amount = Math.max(1, Math.min(amount, Math.floor(e.maxHp * CAP)));
    return base.call(this, e, amount, type);
  };
  CC.ToughFliers = { cap: CAP };
})(window);
