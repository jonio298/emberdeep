/* CC.Settings - player options, remembered in this browser.
 *   autoEquip  equip a looted piece automatically when it is better than what you wear (Loot.autoEquip reads CC.state.autoEquip)
 *   autoLevel  spend skill points and pick level-up perks for you
 *   critAnimations  legacy enabled switch; critMode controls kills/all/off cinematics
 *   stick      'floating' (appears under your thumb) or 'fixed' (always in the corner)
 * Opened from the gear button in the HUD (the Settings tab of the character screen).
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var KEY = 'emberdeep-settings', v = { autoEquip: true, autoLevel: false, critAnimations: true, critMode: 'kills', stick: 'floating', tutorial: true }, clock = 0;
  try { var raw = localStorage.getItem(KEY); if (raw) { var o = JSON.parse(raw); for (var k in v) if (o && o[k] !== undefined) v[k] = o[k]; } } catch (_) { /* storage may be blocked */ }
  if(v.critAnimations===false)v.critMode='off'; // Existing saves migrate cleanly.
  if(['kills','all','short','off'].indexOf(v.critMode)<0)v.critMode='kills';
  function save() { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* optional */ } }
  function apply() { if (CC.state) CC.state.autoEquip = !!v.autoEquip; }
  function changed(key) {
    if(key==='critAnimations')v.critMode=v.critAnimations?'kills':'off';
    if(key==='critMode'){
      if(['kills','all','short','off'].indexOf(v.critMode)<0)v.critMode='kills';
      v.critAnimations=v.critMode!=='off';
    }
    save();apply();
    if((key==='critAnimations'||key==='critMode')&&CC.CriticalScene&&CC.CriticalScene.reset)
      CC.CriticalScene.reset();
  }

  // Spend every available skill point (first affordable skill in tree order), and take the first offered perk.
  function autoLevel(p) {
    var ST = CC.SkillTree, C = CC.Classes, i, guard = 0;
    if (p.perkOpen && C && C.choosePerk) C.choosePerk(0, p);
    if (!ST || !ST.points || !p) return;
    while (ST.points(p) > 0 && guard++ < 40) {
      var list = ST.nodes(p.classId) || [], bought = false;
      for (i = 0; i < list.length; i++) { if (ST.canBuy(p, list[i].id).ok && ST.buy(p, list[i].id)) { bought = true; break; } }
      if (!bought) break;
    }
  }
  CC.Settings = {
    get: function (key) { return v[key]; },
    set: function (key, val) { v[key] = val; changed(key); },
    toggle: function (key) { v[key] = !v[key]; changed(key); return v[key]; },
    all: function () { return v; },
    tick: function (dt) {
      apply();
      clock += dt;
      if (clock < 0.3) return;
      clock = 0;
      var p = CC.state && CC.state.player;
      if (v.autoLevel && p && !p.stub && p.hp > 0) autoLevel(p);
    }
  };
})(window);
