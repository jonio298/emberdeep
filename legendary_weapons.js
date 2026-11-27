/* The legendary weapons (gear update, see GEAR_PLAN.md section 4): 56 class weapons in four groups of 14, 5 bound to a boss and 9 bound to a night stalker.
 * Each is data: name, base type, class lock (cls), level (qlvl), the ability id that legendary.js implements, and its description.
 * They are pushed onto CC.Loot.LEGENDS, so the drop tables (droptables.js) roll them: a legendary only drops once the item level reaches its qlvl,
 * your own class is likelier, and a bound weapon drops only from its boss or stalker (and often).
 * The first block repeats the 11 weapons that were already in loot.js under their old ability ids (now really implemented).
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {}, Loot = CC.Loot; if (!Loot || !Loot.LEGENDS) return;
  // per base type: damage and the second stat that makes the weapon what it is
  var BASE = {
    sword: { dmg: 1.5, crit: 1 }, greatsword: { dmg: 1.7, crit: 0.8 }, axe: { dmg: 1.6, crit: 0.8 }, mace: { dmg: 1.5, hp: 1.2 },
    dagger: { dmg: 1.2, crit: 2, speed: 1 }, staff: { dmg: 1.3, mana: 1.5 }, wand: { dmg: 1.1, mana: 2, cdr: 1 }, orb: { dmg: 1.1, cdr: 2, mana: 1 },
    bow: { dmg: 1.4, crit: 1.5 }, spear: { dmg: 1.45, crit: 0.8 }
  };
  var TYPE_OF = { greatsword: 'sword', orb: 'wand' }; // loot.js weapon types
  var list = [], seen = {};
  function W(name, cls, base, qlvl, id, desc, bound, kind, tweak) {
    var st = {}, k, b = BASE[base] || BASE.sword;
    for (k in b) st[k] = Math.round(b[k] * (0.9 + 0.2 * ((qlvl % 7) / 6)) * 100) / 100;
    if (tweak) for (k in tweak) st[k] = tweak[k];
    list.push({ name: name, slot: 'weapon', cls: cls || undefined, weaponType: TYPE_OF[base] || base, baseName: base, qlvl: qlvl, stats: st, effect: { id: id, desc: desc }, boundTo: bound || undefined, boundKind: bound ? kind : undefined, legendary70: true });
  }
  // ---- swordsman (14)
  W('Emberfang', 'swordsman', 'sword', 8, 'burn_on_hit', 'Hits ignite for 3 s; a burning foe that dies explodes.');
  W('Dawnbreaker', 'swordsman', 'sword', 12, 'crit_damage', 'Crits deal +60% and daze foes around the target.');
  W('Stormbrand', 'swordsman', 'sword', 16, 'dash_lightning', 'Your dash leaves a lightning trail that shocks anything that crosses it.');
  W('Oathsplitter', 'swordsman', 'greatsword', 20, 'whirl_double', 'Whirl hits twice per tick but costs 50% more mana.');
  W("Gravelord's Edge", 'swordsman', 'sword', 25, 'slam5', 'Every 5th hit slams the ground with a shockwave that knocks foes back.');
  W('Kingsbane', 'swordsman', 'sword', 30, 'bane', '+100% damage to elites and bosses, -15% to everything else.');
  W('Hollow Tree Cleaver', 'swordsman', 'axe', 6, 'execute', 'Hits on foes below 30% health execute them (10% for bosses).');
  W('Skullcrusher', 'swordsman', 'axe', 14, 'crusher', 'Shield Bash always stuns, and armoured foes lose their armour for 4 s.');
  W('Ragewind', 'swordsman', 'axe', 22, 'ragewind', 'Each hit adds 6% attack speed (max 8 stacks); stacks drop after 4 s of no hits.');
  W('Bloodmoon Reaper', 'swordsman', 'axe', 28, 'bloodmoon', 'Three kills within 3 s trigger a 5 s lifesteal frenzy.');
  W('Thunderhead', 'swordsman', 'mace', 10, 'thunder_ring', 'Shield Bash sends out a ring of thunder that shocks every foe it crosses.');
  W('Ironvow', 'swordsman', 'mace', 18, 'ironvow', 'While you are attacking you take 25% less damage.');
  W('Sunforged Maul', 'swordsman', 'mace', 26, 'sun_column', 'A full charge calls a column of sunlight on the target, burning foes and healing you.');
  W("Warlord's Edge", 'swordsman', 'sword', 22, 'cleave', 'Attacks cleave nearby foes; each kill gives +1% damage (max 30 stacks), being hit loses 5.');
  // ---- wizard (14)
  W('Archmage Focus', 'wizard', 'staff', 9, 'spell_pierce', 'Spell hits pierce through to a second foe behind the first.');
  W('Stormcaller Rod', 'wizard', 'staff', 10, 'chain_lightning', 'Attacks chain lightning to 2 nearby foes.');
  W('Mana Thorn', 'wizard', 'wand', 8, 'mana_thorn', 'Kills restore mana; at full mana your next hit deals +40%.');
  W('Rimefall Staff', 'wizard', 'staff', 12, 'rimefall', 'Frost Nova and Blizzard freeze chance doubles (10% to 20%); chills last 5 s.');
  W('Twinflame Wand', 'wizard', 'wand', 14, 'twinflame', 'Fireball splits into two flames that fan out.');
  W('Cinderspire', 'wizard', 'staff', 15, 'cinderspire', 'Fire hits leave burning ground for 4 s.');
  W('Prism Crook', 'wizard', 'staff', 17, 'prism', 'Each spell cast picks a random element (fire, ice, lightning, arcane) with a bonus effect.');
  W('Voidlens', 'wizard', 'orb', 18, 'voidlens', 'Spell hits pull nearby foes toward the point of impact.');
  W('Aetherwhip', 'wizard', 'wand', 20, 'aetherwhip', 'Every 4 hits reduce your spell cooldowns by 1 s.');
  W("Glacier's Heart", 'wizard', 'staff', 22, 'glacier', 'Blizzard lasts 50% longer and covers a wider area.');
  W('Thunderstaff of Vael', 'wizard', 'staff', 24, 'vael', 'Lightning Spear stays twice as long.');
  W('Starfall Scepter', 'wizard', 'staff', 28, 'starfall', 'After each spell a star falls on the nearest foe a second later.');
  W('Hourglass Rod', 'wizard', 'staff', 30, 'hourglass', 'Below 40% health, a field slows time around you for 4 s (30 s cooldown).');
  W('The Last Word', 'wizard', 'staff', 32, 'lastword', 'Every 10th spell is free, and your next hits deal double damage for 3 s.');
  // ---- necromancer (14)
  W('Gravewhisper', 'necromancer', 'wand', 6, 'raise_on_kill', '15% chance a slain foe rises as a skeleton ally.');
  W("Gravedigger's Spade", 'necromancer', 'mace', 8, 'unearth', 'Kills sometimes unearth gold or a potion at the corpse.');
  W('Bonechoir Rod', 'necromancer', 'wand', 10, 'bonechoir', 'Skeletons sing: +20% minion attack speed.');
  W('Hexbone Wand', 'necromancer', 'wand', 12, 'hexbone', 'Hits hex foes (+15% damage taken); a hexed foe that dies spreads the hex.');
  W('Marrow Lash', 'necromancer', 'wand', 14, 'marrow', 'Whenever a minion hits, you heal for 1% of your health.');
  W('Deathbinder', 'necromancer', 'staff', 15, 'minion_surge', 'Minions surge: +30% damage for 6 s after you cast a spell.');
  W('Ghoulpiper', 'necromancer', 'wand', 16, 'ghoulpiper', 'Your skeletons rise as tougher ghouls with 2x health.');
  W('Soulwell Scythe', 'necromancer', 'staff', 18, 'soulwell', 'Drain hits chain to 2 more foes and heal you.');
  W("Nightwarden's Reach", 'necromancer', 'staff', 20, 'nightwarden', 'Soul hits mark foes to take +15% damage for 5 s.');
  W('Plague Censer', 'necromancer', 'staff', 22, 'censer', 'Poison hits leave a lingering miasma for 5 s.');
  W('Sepulcher Staff', 'necromancer', 'staff', 26, 'sepulcher', 'Your minion cap rises by 3, so a bigger skeleton army can stand at once.');
  W('Memento Mori', 'necromancer', 'wand', 28, 'memento', 'After each kill your next hit within 4 s deals +50%.');
  W("Lich's Phylactery", 'necromancer', 'orb', 30, 'lich', 'A fatal blow instead makes you a lich for 6 s: invulnerable, +50% damage (once per 90 s).');
  W('Worm-Eaten Regalia', 'necromancer', 'staff', 34, 'regalia', 'Below half health, raise 8 skeletons (30 s cooldown).');
  // ---- thief (14)
  W('Nightfang', 'thief', 'dagger', 7, 'backstab_crit', 'Hits from behind a foe deal +40% and cause bleeding.');
  W("Locksmith's Pick", 'thief', 'dagger', 8, 'locksmith', 'Chests open as you walk up to them, and drop one more item.');
  W("Gutter Saint's Kris", 'thief', 'dagger', 9, 'kris', 'Hits cause a bleed that stacks 3 times.');
  W('Whisperkiss', 'thief', 'dagger', 10, 'poison_dagger', 'Hits poison; crits reset your dash.');
  W("Cutpurse's Delight", 'thief', 'dagger', 11, 'cutpurse', 'Hits steal gold; stealing from a foe below 30% health takes triple.');
  W('Venomtongue', 'thief', 'dagger', 12, 'venomtongue', 'Throwing Knives poison; poison stacks up to 5 times.');
  W('Shadowstep Shiv', 'thief', 'dagger', 14, 'shiv', 'Your dash ends with a free backstab on the nearest foe.');
  W('Ace of Spades', 'thief', 'dagger', 16, 'ace', 'Each hit flips a coin: heads +100% damage, tails nothing; and a 1% chance to slay outright.');
  W('Mirage Edge', 'thief', 'dagger', 20, 'mirage', 'Smoke Bomb also stuns foes around you for 1.5 s.');
  W('Hailstorm Daggers', 'thief', 'dagger', 22, 'hailstorm', 'Throwing Knives fan out to 7 knives that chill.');
  W('Eclipse Fang', 'thief', 'dagger', 26, 'eclipse', 'Shadow strikes (Phantom Blades) hit once more.');
  W('Silent Requiem', 'thief', 'dagger', 30, 'requiem', 'Attacks from stealth or smoke deal triple damage.');
  W('Razorwind Chakram', 'thief', 'dagger', 34, 'chakram', 'Basic hits sometimes send a spinning blade that returns for a second hit.');
  W('Widowmaker', 'thief', 'bow', 18, 'widowmaker', 'Hits apply a stacking mark (5 max) that makes foes take 4% more damage each.');
  // ---- bound to a boss (5, any class)
  W("Grinmask's Rictus Blade", null, 'sword', 6, 'rictus', 'Kills make your next hit within 3 s a stunning crit.', 'grinmask', 'boss');
  W('Stitchblade', null, 'sword', 10, 'stitch', 'Takes a part of each killed foe: +1% damage per kind of monster slain this floor.', 'patchwork', 'boss');
  W('Drowned Trident', null, 'spear', 12, 'trident', 'Hits soak foes; soaked foes take double lightning and cold damage.', 'merehorror', 'boss');
  W("Hearthkeeper's Poker", null, 'mace', 18, 'poker', 'Hits scorch for 3 s and heal you for 1% of your health.', 'hearthkeeper', 'boss');
  W('Emberheart Brand', null, 'sword', 21, 'brand', 'Below 30% health you erupt in a fire nova (20 s cooldown); fire damage +30%.', 'emberheart', 'boss');
  // ---- bound to a night stalker (9, any class)
  W('Rictus Fang', null, 'dagger', 12, 'rictusfang', 'Your dash teleports you behind the nearest foe with a free crit.', 'grinmask', 'stalker');
  W("Puppet Butcher's Cleaver", null, 'axe', 14, 'hook', 'Hits have a 10% chance to hook the foe and pull it to you.', 'marionette', 'stalker');
  W('Thread-Reaper', null, 'staff', 16, 'threads', 'Spell hits leave a thread; three seconds later all threads tighten and detonate.', 'scytheweaver', 'stalker');
  W("Widow's Sting", null, 'dagger', 15, 'web', 'Hits web the foe (slow 40%); a webbed foe that dies may spawn a spider ally.', 'veiledwidow', 'stalker');
  W('Choir Reed', null, 'wand', 17, 'shriek', 'Every 8th hit emits a shriek that stuns everything close.', 'wailchorus', 'stalker');
  W('Bloomstaff', null, 'staff', 18, 'bloom', 'Kills plant a skull bloom that bursts for area damage 3 s later.', 'skullbloom', 'stalker');
  W("Hound's Fang", null, 'dagger', 19, 'hound', '+20% move speed; dashes leave a fire trail.', 'cinderhound', 'stalker');
  W('Gloomreach', null, 'spear', 20, 'gloomreach', 'Strikes at foes that are not facing you deal +80%.', 'gloomcrawler', 'stalker');
  W('Gravemaw Maul', null, 'mace', 22, 'maw', 'Each strike heals you for 3% of its damage; every 4th strike shakes the ground.', 'gravemaw', 'stalker');

  // replace the older descriptive entries of the same name, add the rest
  var L = Loot.LEGENDS, i, j;
  for (i = 0; i < list.length; i++) {
    var old = -1; for (j = 0; j < L.length; j++) if (L[j].name === list[i].name) old = j;
    if (old >= 0) { list[i].qlvl = L[old].qlvl || list[i].qlvl; L[old] = list[i]; } else L.push(list[i]);
    seen[list[i].name] = 1;
  }
  Loot.LEGEND_WEAPONS = list.slice();
})(typeof window !== 'undefined' ? window : globalThis);
