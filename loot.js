/* CC.Loot - items, rarity, drops, beams, pickup (task t5).
 *
 * API: drops[], roll(source, floor, luck, opts), rollItem(floor, luck, minRarity), update(dt), draw(ctx, cam),
 *      pickupNear(player), clear(), compare(item, equipped), hydrate(obj), RARITIES, LEGENDS.
 *   source: an enemy {x,y,elite?,boss?} or a chest {x,y,tier,opened}. roll() spawns drop entities
 *   (opts.spawn === false only returns them) and returns the array.
 * Item: {uid,name,slot,rarity,rarityName,color,ilvl,stats,effect,legendary,value,compare(equipped)}
 *   slots: weapon, armor, helm, gloves, boots, ring, amulet, trinket. compare() returns tooltip data (see Loot.compare).
 *   After JSON save/load call CC.Loot.hydrate(item) to restore compare().
 * Pickup: gold -> CC.state.gold, hp/mana orbs heal the player, potions -> CC.state.potions,
 *   items -> CC.state.inventory (auto-sold for gold when 40 are held). update() calls pickupNear(CC.state.player).
 *
 * ---- WEAPON DATA CONTRACT (task t3; data only, combat in classes.js applies it later) ----
 * Every item with slot 'weapon' also carries:
 *   weaponType  'sword'|'axe'|'dagger'|'staff'|'wand'|'bow'|'mace'|'spear' (CC.Loot.WEAPON_TYPES)
 *   attackSpeed type speed multiplier (dagger 1.35 ... mace 0.85); stats.dmg is already scaled by the type
 *   element     null | 'fire'|'ice'|'lightning'|'poison'|'arcane'|'shadow'|'holy' (CC.Loot.ELEMENTS)
 *   abilityId   null | magic ability id, e.g. ignite, fireball, chill, freeze, shock, chain_lightning, envenom, arcane_bolt,
 *               drain_life, smite. Legendary/set weapons use their effect.id (burn_on_hit, set_emberlord, ...).
 *   abilityName display name of the ability (null when none)
 *   power       0 when no element/ability, else (4 for element + 4 for ability) * rarity mult * (1 + 0.05*(level-1) + 0.03*(floor-1)) * 0.85..1.15
 *   affixes     [{stat,value}..., {prefix}, {suffix}] summary of the rolled affixes
 *   Magic by rarity (element chance / ability chance): Common 0/0, Uncommon 15%/0, Rare 100%/50%, Epic 100%/100%, Legendary 100%/100%.
 *   Rare+ weapons get an elemental name prefix (Flaming, Frozen, Shocking, Venomous ...). A non-legendary ability also sets item.effect.
 *
 * ---- DROP ODDS (task t3) ----
 * Rarity base weights: Common 78, Uncommon 18, Rare 3.5, Epic 0.4, Legendary 0.1 (before gating). Common is the junk tier.
 * Weight of tier t is multiplied by (1 + k)^t with k = 0.06*(playerLevel-1) + 0.02*(floor-1) + 0.01*min(luck, LUCK_CAP), then normalised.
 *   Player level (CC.state.player.level, or the level arg of rollItem/makeItem) is the main driver; floor is a small bonus.
 * RARITY_MIN_FLOOR = [1, 1, 2, 4, 7]: a tier cannot drop before its floor. Elites count as floor+1 and bosses as
 *   floor+2 for this gate only (RARITY_TIER_BONUS); every 5 player levels add +1 to the gate floor.
 * Simulated 1000 normal rollItem drops (Common/Uncommon/Rare/Epic/Legendary):
 *   level 1 floor 1: 804/196/0/0/0 | level 1 floor 3: 752/212/36/0/0 | level 20 floor 3: 563/283/127/27/0 | level 30 floor 5: 461/279/173/44/43
 * Rarity stat multipliers: 1, 1.2, 1.45, 1.8, 2.3 (RARITIES[].mult).
 * Stat scale: BASE * depthScale(ilvl) * (1 + 0.12*(ilvl-1)) * mult, depthScale = 0.5 at floor 1 rising to 1 at floor 9.
 * Drop chances per kill: normal item 7% (+0.15%/luck), elite 30%; charm 1.5% / 10%; gold 55% / always.
 * Gold per pile: (2 + 1.5*floor) * (0.6..1.6), x2 boss, x1.5 chest. Chests/bosses guarantee at least Uncommon
 *   (Rare only once the gate allows it); boss luck bonus 4. Inventory auto-sell value is item.value.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var rnd = Math.random;
  function R() { return rnd(); }
  function ri(a, b) { return a + Math.floor(R() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(R() * a.length)]; }

  var RARITIES = [
    { id: 0, name: 'Common', color: '#b8bcc4', weight: 78, mult: 1.0, affixes: 1 },
    { id: 1, name: 'Uncommon', color: '#4ad66a', weight: 18, mult: 1.2, affixes: 2 },
    { id: 2, name: 'Rare', color: '#4a9bff', weight: 3.5, mult: 1.45, affixes: 3 },
    { id: 3, name: 'Epic', color: '#b45cff', weight: 0.4, mult: 1.8, affixes: 4 },
    { id: 4, name: 'Legendary', color: '#ffa21f', weight: 0.1, mult: 2.3, affixes: 2 }
  ];
  var RARITY_MIN_FLOOR = [1, 1, 2, 4, 7];
  var RARITY_TIER_BONUS = { normal: 0, elite: 1, boss: 2 };
  var LUCK_CAP = 30;
  var LEVEL_ODDS = 0.06, FLOOR_ODDS = 0.02; // per player level / per floor shift of the rarity weights
  var SLOTS = ['weapon', 'armor', 'helm', 'gloves', 'boots', 'ring', 'amulet', 'trinket'];
  var SLOT_W = { weapon: 22, armor: 18, helm: 12, gloves: 10, boots: 10, ring: 14, amulet: 12, trinket: 14 };
  var LABEL = { dmg: 'Damage', armor: 'Armor', hp: 'Max HP', mana: 'Max Mana', crit: 'Crit %', speed: 'Move Speed %',
    lifesteal: 'Life Steal %', luck: 'Luck', cdr: 'Cooldown Reduction %', regen: 'HP Regen/s', magnet: 'Pickup Range', gold: 'Gold Find %' };
  var BASE = { dmg: 3, armor: 3, hp: 12, mana: 10, crit: 2, speed: 2, lifesteal: 1, luck: 3, cdr: 2, regen: 0.4, magnet: 10, gold: 5 };
  var SCORE = { dmg: 3, armor: 1.5, hp: 0.5, mana: 0.4, crit: 2, speed: 2, lifesteal: 3, luck: 1, cdr: 2.5, regen: 5, magnet: 0.2, gold: 0.4 };
  var PRIMARY = { weapon: 'dmg', armor: 'armor', helm: 'armor', gloves: 'crit', boots: 'speed', ring: 'crit', amulet: 'mana', trinket: 'luck' };
  var POOL = {
    weapon: ['dmg', 'crit', 'lifesteal', 'speed', 'cdr', 'mana'],
    armor: ['armor', 'hp', 'regen', 'speed', 'hp', 'luck'],
    helm: ['armor', 'hp', 'mana', 'luck', 'regen', 'cdr'],
    gloves: ['crit', 'dmg', 'speed', 'lifesteal', 'armor', 'cdr'],
    boots: ['speed', 'armor', 'hp', 'regen', 'luck', 'cdr'],
    ring: ['crit', 'speed', 'lifesteal', 'cdr', 'dmg', 'gold'],
    amulet: ['mana', 'hp', 'regen', 'cdr', 'luck', 'magnet'],
    trinket: ['luck', 'gold', 'magnet', 'speed', 'cdr', 'crit']
  };
  var BASES = {
    weapon: ['Rusty Blade', 'Iron Sword', 'Oak Staff', 'Bone Wand', 'Hooked Cleaver', 'Crystal Rod', 'Hunter Bow', 'Short Bow', 'Iron Mace', 'Spiked Club', 'Hunting Spear', 'Boar Pike'],
    armor: ['Leather Vest', 'Chain Shirt', 'Moth-eaten Robe', 'Bone Plate', 'Hide Cuirass', 'Cloth Wrap'],
    helm: ['Leather Cap', 'Iron Helm', 'Bone Crown', 'Cloth Hood', 'Horned Helm', 'Skull Mask'],
    gloves: ['Cloth Wraps', 'Leather Gloves', 'Iron Gauntlets', 'Bone Claws', 'Hide Mitts', 'Spiked Fists'],
    boots: ['Worn Boots', 'Leather Boots', 'Iron Greaves', 'Soft Sandals', 'Hide Treads', 'Bone Stompers'],
    ring: ['Copper Ring', 'Bone Ring', 'Iron Band', 'Silver Loop', 'Jade Ring', 'Twisted Band'],
    amulet: ['Fang Necklace', 'Glass Pendant', 'Rune Charm', 'Amber Amulet', 'Tooth Talisman', 'Shell Choker'],
    trinket: ['Old Coin', 'Glowing Pebble', 'Cracked Idol', 'Mushroom Cap', 'Spider Silk Knot', 'Lantern Shard']
  };
  var PREFIX = ['Gloom', 'Ember', 'Frost', 'Venom', 'Shadow', 'Ancient', 'Runed', 'Spectral', 'Gilded', 'Cursed'];
  var SUFFIX = { dmg: 'of Might', armor: 'of Warding', hp: 'of Vigor', mana: 'of the Mind', crit: 'of Precision', speed: 'of Swiftness',
    lifesteal: 'of the Leech', luck: 'of Fortune', cdr: 'of Haste', regen: 'of Mending', magnet: 'of Greed', gold: 'of Plenty' };

  // 21 named legendaries; effect ids are data for classes.js / combat to interpret.
  var LEGENDS = [
    { name: 'Emberfang', slot: 'weapon', stats: { dmg: 1.6, crit: 1 }, effect: { id: 'burn_on_hit', desc: 'Hits set enemies ablaze for 3s.' } },
    { name: 'Stormcaller Rod', slot: 'weapon', stats: { dmg: 1.3, cdr: 1.2 }, effect: { id: 'chain_lightning', desc: 'Attacks chain lightning to 2 nearby enemies.' } },
    { name: 'Gravewhisper', slot: 'weapon', stats: { dmg: 1.2, mana: 1.5 }, effect: { id: 'raise_on_kill', desc: '15% chance a slain enemy rises as a skeleton ally.' } },
    { name: 'Dawnbreaker', slot: 'weapon', stats: { dmg: 1.5, crit: 1.5 }, effect: { id: 'crit_damage', desc: 'Critical hits deal +60% damage.' } },
    { name: 'Voidreaver', slot: 'weapon', stats: { dmg: 1.4, lifesteal: 2 }, effect: { id: 'lifesteal_big', desc: 'Heal for 8% of damage dealt.' } },
    { name: 'Stonehide Mantle', slot: 'armor', stats: { armor: 2, hp: 1.5 }, effect: { id: 'thorns', desc: 'Reflect 25% of melee damage taken.' } },
    { name: 'Shroudweave', slot: 'armor', stats: { armor: 1, speed: 1.5 }, effect: { id: 'dodge', desc: '10% chance to dodge any hit.' } },
    { name: "Titan's Bulwark", slot: 'armor', stats: { armor: 2.5, hp: 2 }, effect: { id: 'big_hp', desc: '+25% maximum health.' } },
    { name: 'Ashen Plate', slot: 'armor', stats: { armor: 2, regen: 1.5 }, effect: { id: 'nova_low_hp', desc: 'Below 30% HP, emit a fire nova (20s cooldown).' } },
    { name: 'Ring of Echoes', slot: 'ring', stats: { cdr: 1.5, crit: 1 }, effect: { id: 'double_cast', desc: '15% chance spells cast twice.' } },
    { name: 'Blood Signet', slot: 'ring', stats: { lifesteal: 2, dmg: 1 }, effect: { id: 'kill_heal', desc: 'Heal 4% max HP on kill.' } },
    { name: 'Quickening Band', slot: 'ring', stats: { cdr: 2.5, speed: 1.5 }, effect: { id: 'dash_reset', desc: 'Killing blows reset dash cooldown.' } },
    { name: "Miser's Loop", slot: 'ring', stats: { gold: 3, luck: 1.5 }, effect: { id: 'gold_rain', desc: '+50% gold from all sources.' } },
    { name: 'Heart of the Mountain', slot: 'amulet', stats: { hp: 2.5, regen: 2 }, effect: { id: 'regen_still', desc: 'Regenerate triple while standing still.' } },
    { name: 'Soulwell', slot: 'amulet', stats: { mana: 2.5, regen: 1 }, effect: { id: 'kill_mana', desc: 'Restore 8 mana on kill.' } },
    { name: 'Eye of the Deep', slot: 'amulet', stats: { magnet: 4, luck: 2 }, effect: { id: 'wide_magnet', desc: 'Loot flies to you from twice as far.' } },
    { name: 'Phoenix Tear', slot: 'amulet', stats: { hp: 2, mana: 1.5 }, effect: { id: 'revive', desc: 'Once per floor, rise with 50% HP when slain.' } },
    { name: 'Lucky Coin', slot: 'trinket', stats: { luck: 5, gold: 2 }, effect: { id: 'lucky', desc: 'Rarer loot: effectively +15 Luck.' } },
    { name: 'Cracked Hourglass', slot: 'trinket', stats: { cdr: 3, speed: 1 }, effect: { id: 'dash_cdr', desc: 'Dash recharges 40% faster.' } },
    { name: 'Wyrm Tooth', slot: 'trinket', stats: { crit: 3, dmg: 1 }, effect: { id: 'crit_bleed', desc: 'Critical hits cause bleeding.' } },
    { name: 'Lantern of Souls', slot: 'trinket', stats: { mana: 2, luck: 2 }, effect: { id: 'light_radius', desc: 'Light radius +30%; slain foes drop soul sparks.' } }
  ];

  // Affix names per stat: prefix (rare+) and suffix (uncommon+). Legacy SUFFIX/PREFIX stay as fallbacks.
  var PREFIX_STAT = {
    dmg: ['Savage', 'Brutal', 'Ember'], armor: ['Bulwark', 'Ironbound', 'Stalwart'], hp: ['Hardy', 'Verdant', 'Sturdy'],
    mana: ['Arcane', 'Runed', 'Lucid'], crit: ['Keen', 'Razor', 'Deadeye'], speed: ['Fleet', 'Gale', 'Nimble'],
    lifesteal: ['Vampiric', 'Venom', 'Sanguine'], luck: ['Gilded', 'Auspicious', 'Fey'], cdr: ['Quickened', 'Spectral', 'Frost'],
    regen: ['Mending', 'Blessed', 'Ancient'], magnet: ['Covetous', 'Magnetic', 'Gloom'], gold: ['Opulent', 'Gilded', 'Cursed']
  };
  var SUFFIX_STAT = {
    dmg: ['of Might', 'of Ruin', 'of the Bear'], armor: ['of Warding', 'of the Bastion'], hp: ['of Vigor', 'of the Oak'],
    mana: ['of the Mind', 'of the Well'], crit: ['of Precision', 'of the Viper'], speed: ['of Swiftness', 'of the Hare'],
    lifesteal: ['of the Leech', 'of Thirst'], luck: ['of Fortune', 'of the Clover'], cdr: ['of Haste', 'of Echoes'],
    regen: ['of Mending', 'of the Troll'], magnet: ['of Greed', 'of the Magpie'], gold: ['of Plenty', 'of the Dragon']
  };
  var CLASSES = ['swordsman', 'wizard', 'necromancer', 'thief'];
  var CLASS_NAME = { swordsman: 'Swordsman', wizard: 'Wizard', necromancer: 'Necromancer', thief: 'Thief' };
  var CLASS_WEAPONS = {
    swordsman: ['Knight Blade', 'Bastard Sword', 'War Cleaver'], wizard: ['Arcane Wand', 'Star Staff', 'Orb Rod'],
    necromancer: ['Skull Scepter', 'Grave Staff', 'Bone Crook'], thief: ['Venom Dagger', 'Stiletto', 'Kris', 'Shiv', 'Backstabber']
  };
  var CLASS_ARMOR = { swordsman: 'Plate Hauberk', wizard: 'Starweave Robe', necromancer: 'Shroud of Bones', thief: 'Shadow Leathers' };
  // Sets: pieces by slot; rolled as Epic (15%) or Legendary (35%) when the slot has a piece.
  var SETS = {
    nightblade: { name: 'Nightblade Regalia', cls: 'thief', color: '#3cf0c8', pieces: { weapon: 'Nightblade Dagger', armor: 'Nightblade Garb', ring: 'Nightblade Band' },
      bonus: 'Set (3): Backstabs deal +50% damage and dash leaves a smoke cloud.' },
    emberlord: { name: "Emberlord's Panoply", cls: 'swordsman', color: '#ff7a30', pieces: { weapon: 'Emberlord Greatsword', armor: 'Emberlord Plate', amulet: 'Emberlord Sigil' },
      bonus: 'Set (3): Attacks ignite enemies; take 20% less fire damage.' },
    graveking: { name: "Grave King's Vestments", cls: 'necromancer', color: '#9cff6a', pieces: { weapon: 'Grave King Scepter', armor: 'Grave King Robes', trinket: 'Grave King Skull' },
      bonus: 'Set (3): Minions are 30% stronger and rise twice as often.' },
    stormweaver: { name: "Stormweaver's Garb", cls: 'wizard', color: '#6ad8ff', pieces: { weapon: 'Stormweaver Staff', armor: 'Stormweaver Mantle', ring: 'Stormweaver Loop' },
      bonus: 'Set (3): Spells chain lightning and cost 20% less mana.' }
  };
  var SET_IDS = Object.keys(SETS);
  // Extra class-restricted legendaries.
  LEGENDS.push(
    { name: 'Nightfang', slot: 'weapon', cls: 'thief', stats: { dmg: 1.2, crit: 2.5 }, effect: { id: 'backstab_crit', desc: 'Attacks from behind always critically strike.' } },
    { name: 'Whisperkiss', slot: 'weapon', cls: 'thief', stats: { dmg: 1, speed: 2, crit: 1.5 }, effect: { id: 'poison_dagger', desc: 'Hits poison enemies for 4s.' } },
    { name: 'Archmage Focus', slot: 'weapon', cls: 'wizard', stats: { dmg: 1.4, mana: 2 }, effect: { id: 'spell_pierce', desc: 'Spells pierce through enemies.' } },
    { name: "Warlord's Edge", slot: 'weapon', cls: 'swordsman', stats: { dmg: 1.8, armor: 1 }, effect: { id: 'cleave', desc: 'Attacks cleave in a wide arc.' } },
    { name: 'Deathbinder', slot: 'weapon', cls: 'necromancer', stats: { dmg: 1.1, mana: 2, lifesteal: 1 }, effect: { id: 'minion_surge', desc: 'Minions gain +40% damage.' } },
    { name: 'Cloak of Daggers', slot: 'armor', cls: 'thief', stats: { armor: 1, speed: 2, crit: 1 }, effect: { id: 'shadow_step', desc: 'Dashing makes you untargetable briefly.' } }
  );

  // ---------- charms: small passive items with a bonus and a tradeoff ----------
  var CHARM_LIMIT = 3;
  var CHARM_BONUS = ['dmg', 'crit', 'speed', 'lifesteal', 'luck', 'cdr', 'regen', 'magnet', 'gold', 'mana', 'hp'];
  var CHARM_COST = ['armor', 'hp', 'speed', 'mana', 'regen', 'dmg', 'luck'];
  var CHARM_NAMES = ['Fang', 'Bead', 'Knucklebone', 'Feather', 'Acorn', 'Rune Chip', 'Ember Seed', 'Glass Eye', 'Wax Seal', 'Thimble'];
  var CHARM_ADJ = { dmg: 'Wrathful', crit: 'Sharp', speed: 'Swift', lifesteal: 'Hungry', luck: 'Lucky', cdr: 'Hasty', regen: 'Mending',
    magnet: 'Greedy', gold: 'Gilded', mana: 'Brimming', hp: 'Hale' };
  var CHARM_OF = { armor: 'of Fragility', hp: 'of the Frail', speed: 'of Burden', mana: 'of Drought', regen: 'of Rot', dmg: 'of Restraint', luck: 'of Ruin' };

  // ---------- weapon generator ----------
  // dmg = multiplier on the weapon's dmg stat; spd = attack speed multiplier (data only, combat may read it).
  var WEAPON_TYPES = {
    sword: { dmg: 1.0, spd: 1.0, re: /sword|blade|edge|greatsword/i, cls: 'swordsman' },
    axe: { dmg: 1.15, spd: 0.9, re: /axe|cleaver/i },
    dagger: { dmg: 0.8, spd: 1.35, re: /dagger|stiletto|kris|shiv|backstabber|fang/i, cls: 'thief' },
    staff: { dmg: 0.9, spd: 0.95, re: /staff|crook|rod|scepter|focus/i, cls: 'wizard' },
    wand: { dmg: 0.8, spd: 1.2, re: /wand|orb/i, cls: 'necromancer' },
    bow: { dmg: 1.0, spd: 1.0, re: /bow/i },
    mace: { dmg: 1.2, spd: 0.85, re: /mace|club/i },
    spear: { dmg: 1.05, spd: 1.0, re: /spear|pike/i }
  };
  var WEAPON_TYPE_IDS = Object.keys(WEAPON_TYPES);
  var LEGEND_TYPE = { 'Emberfang': 'sword', 'Gravewhisper': 'wand', 'Dawnbreaker': 'sword', 'Voidreaver': 'axe', 'Archmage Focus': 'staff',
    'Deathbinder': 'staff', 'Nightfang': 'dagger', 'Whisperkiss': 'dagger', "Warlord's Edge": 'sword' };
  var LEGEND_ELEMENT = { burn_on_hit: 'fire', chain_lightning: 'lightning', poison_dagger: 'poison', raise_on_kill: 'shadow', lifesteal_big: 'shadow',
    spell_pierce: 'arcane', minion_surge: 'shadow', crit_damage: 'holy', set_emberlord: 'fire', set_stormweaver: 'lightning', set_graveking: 'shadow', set_nightblade: 'poison' };
  // Elements: adjective prefixes plus the magic abilities each element can grant (id -> display name, description).
  var ELEMENTS = {
    fire: { adj: ['Flaming', 'Blazing', 'Searing'], abilities: { ignite: ['Ignite', 'Hits set enemies ablaze.'], fireball: ['Fireball', 'Chance to hurl a fireball.'], ember_nova: ['Ember Nova', 'Bursts into flame on kill.'] } },
    ice: { adj: ['Frozen', 'Glacial', 'Rimed'], abilities: { chill: ['Chill', 'Hits slow enemies.'], frost_shard: ['Frost Shard', 'Chance to fire ice shards.'], freeze: ['Deep Freeze', 'Chance to freeze enemies solid.'] } },
    lightning: { adj: ['Shocking', 'Stormforged', 'Crackling'], abilities: { shock: ['Shock', 'Hits briefly stun enemies.'], chain_lightning: ['Chain Lightning', 'Lightning jumps between enemies.'], thunder_strike: ['Thunder Strike', 'Chance to call down a bolt.'] } },
    poison: { adj: ['Venomous', 'Toxic', 'Septic'], abilities: { envenom: ['Envenom', 'Hits poison enemies over time.'], toxic_cloud: ['Toxic Cloud', 'Leaves a poison cloud on kill.'] } },
    arcane: { adj: ['Arcane', 'Eldritch', 'Runebound'], abilities: { arcane_bolt: ['Arcane Bolt', 'Chance to fire a homing bolt.'], mana_siphon: ['Mana Siphon', 'Hits restore mana.'] } },
    shadow: { adj: ['Umbral', 'Dread', 'Gravetouched'], abilities: { drain_life: ['Drain Life', 'Hits steal a little health.'], curse: ['Hex', 'Hits curse enemies to take more damage.'] } },
    holy: { adj: ['Radiant', 'Hallowed', 'Blessed'], abilities: { smite: ['Smite', 'Chance to strike with holy light.'], mend: ['Mending Light', 'Kills heal a little health.'] } }
  };
  var ELEMENT_IDS = Object.keys(ELEMENTS);
  // Weapon types lean toward certain elements (weights are even otherwise).
  var TYPE_ELEMENTS = { staff: ['arcane', 'fire', 'ice', 'lightning'], wand: ['shadow', 'arcane', 'poison', 'ice'], dagger: ['poison', 'shadow', 'ice'],
    sword: ['fire', 'holy', 'ice', 'lightning'], axe: ['fire', 'lightning', 'poison'], bow: ['ice', 'poison', 'fire', 'lightning'], mace: ['holy', 'fire', 'shadow'], spear: ['lightning', 'ice', 'poison'] };
  // [element chance, magic ability chance] by rarity id.
  var WEAPON_MAGIC = [[0, 0], [0.15, 0], [1, 0.5], [1, 1], [1, 1]];

  function weaponType(it) {
    var n = it.name || '', t, c;
    if (LEGEND_TYPE[n]) return LEGEND_TYPE[n];
    for (t in WEAPON_TYPES) if (WEAPON_TYPES[t].re.test(n)) return t;
    for (t in WEAPON_TYPES) if (WEAPON_TYPES[t].cls && WEAPON_TYPES[t].cls === it.classReq) return t;
    return 'sword';
  }
  // Adds weaponType/attackSpeed/element/abilityId/abilityName/power/affixes to a finished weapon item (data only).
  function decorateWeapon(it, rarity, floor, level) {
    var type = weaponType(it), T = WEAPON_TYPES[type], M = WEAPON_MAGIC[rarity], rar = RARITIES[rarity], el = null, ab = null, abName = null, abDesc = null, i;
    it.weaponType = type; it.attackSpeed = T.spd;
    if (it.stats.dmg) it.stats.dmg = Math.max(1, Math.round(it.stats.dmg * T.dmg));
    if (it.legendary || it.set) {
      el = LEGEND_ELEMENT[it.effect && it.effect.id] || null; ab = it.effect ? it.effect.id : null; abName = it.effect ? it.name : null;
      if (!el && rarity >= 3) el = pick(TYPE_ELEMENTS[type]);
    } else {
      if (R() < M[0]) el = pick(TYPE_ELEMENTS[type] || ELEMENT_IDS);
      if (el && R() < M[1]) {
        ab = pick(Object.keys(ELEMENTS[el].abilities));
        abName = ELEMENTS[el].abilities[ab][0]; abDesc = ELEMENTS[el].abilities[ab][1];
      }
      if (el && rarity >= 2) { // elemental prefix replaces the stat prefix
        var old = it.prefix; it.prefix = pick(ELEMENTS[el].adj);
        it.name = old ? it.name.replace(old, it.prefix) : it.prefix + ' ' + it.name;
      }
      if (ab && !it.effect) it.effect = { id: ab, desc: abName + ': ' + abDesc };
    }
    // power: ability / element strength, scaled by rarity, player level and (slightly) floor
    var power = (el ? 4 : 0) + (ab ? 4 : 0);
    power = power ? Math.round(power * rar.mult * (1 + 0.05 * (level - 1) + 0.03 * (floor - 1)) * (0.85 + 0.3 * R()) * 10) / 10 : 0;
    it.element = el; it.abilityId = ab; it.abilityName = abName; it.power = power;
    it.affixes = [];
    for (i in it.stats) it.affixes.push({ stat: i, value: it.stats[i] });
    if (it.prefix) it.affixes.push({ prefix: it.prefix });
    if (it.suffix) it.affixes.push({ suffix: it.suffix });
  }

  var uid = 1;
  function statValue(stat, ilvl, mult) {
    var depthScale = 0.5 + 0.5 * Math.min(1, (ilvl - 1) / 8);
    var v = BASE[stat] * depthScale * (1 + 0.12 * (ilvl - 1)) * mult * (0.8 + 0.4 * R());
    return stat === 'regen' ? Math.max(0.1, Math.round(v * 10) / 10) : Math.max(1, Math.round(v));
  }

  // tier: 'normal' | 'elite' | 'boss' shifts only the depth gate (RARITY_MIN_FLOOR).
  // level (player level, default 1) is the main driver of rarity; floor only adds a small bonus.
  function curLevel(level) {
    if (level > 0) return level | 0;
    var p = CC.state && CC.state.player;
    return p && p.level > 0 ? p.level | 0 : 1;
  }
  function pickRarity(floor, luck, minRarity, tier, level) {
    floor = Math.max(1, floor); level = curLevel(level);
    var gateFloor = floor + (RARITY_TIER_BONUS[tier] || 0) + Math.floor((level - 1) / 5), lk = Math.max(0, Math.min(LUCK_CAP, luck || 0));
    var k = LEVEL_ODDS * (level - 1) + FLOOR_ODDS * (floor - 1) + 0.01 * lk, tot = 0, w = [], i;
    var maxOk = 0;
    for (i = 0; i < RARITIES.length; i++) if (gateFloor >= RARITY_MIN_FLOOR[i]) maxOk = i;
    var minR = Math.min(minRarity || 0, maxOk);
    for (i = 0; i < RARITIES.length; i++) {
      w[i] = (i < minR || i > maxOk) ? 0 : RARITIES[i].weight * Math.pow(1 + k, i);
      tot += w[i];
    }
    var r = R() * tot;
    for (i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; }
    return maxOk;
  }

  function pickSlot() {
    var t = 0, s; for (s in SLOT_W) t += SLOT_W[s];
    var r = R() * t;
    for (s in SLOT_W) { r -= SLOT_W[s]; if (r < 0) return s; }
    return 'weapon';
  }

  function compare(item, eq) {
    var keys = {}, k, diffs = [], score = 0;
    for (k in item.stats) keys[k] = 1;
    if (eq) for (k in eq.stats) keys[k] = 1;
    for (k in keys) {
      var to = item.stats[k] || 0, from = eq && eq.stats[k] || 0, d = Math.round((to - from) * 10) / 10;
      score += d * (SCORE[k] || 1);
      diffs.push({ stat: k, label: LABEL[k] || k, from: from, to: to, delta: d, dir: d > 0 ? 'up' : d < 0 ? 'down' : 'same' });
    }
    if (item.effect) score += 12;
    if (eq && eq.effect) score -= 12;
    return { slot: item.slot, equippedName: eq ? eq.name : null, better: score > 0, score: Math.round(score * 10) / 10, diffs: diffs,
      newEffect: item.effect ? item.effect.desc : null, lostEffect: eq && eq.effect ? eq.effect.desc : null };
  }
  function hydrate(it) {
    if (it && !it.compare) Object.defineProperty(it, 'compare', { value: function (eq) { return compare(this, eq); }, enumerable: false, writable: true, configurable: true });
    return it;
  }

  function finishValue(it) {
    var v = 0, stat;
    for (stat in it.stats) v += Math.abs(it.stats[stat]) * (SCORE[stat] || 1) * (it.stats[stat] < 0 ? 0.3 : 1);
    it.value = Math.max(1, Math.round(v * (1 + it.rarity)));
    return hydrate(it);
  }

  // makeItem(floor, rarity, slot, cls): slot may be 'charm'. Optional cls (class id) avoids items restricted to other classes.
  function makeItem(floor, rarity, slot, cls, level) {
    floor = Math.max(1, floor | 0 || 1); level = curLevel(level);
    rarity = Math.max(0, Math.min(RARITIES.length - 1, rarity | 0));
    if (slot === 'charm') return makeCharm(floor, rarity);
    var rar = RARITIES[rarity], it = { uid: uid++, slot: slot, rarity: rarity, rarityName: rar.name, color: rar.color, ilvl: floor, stats: {}, effect: null, legendary: false,
      classReq: null, className: null, set: null, setName: null, glow: rar.color, prefix: null, suffix: null };
    var mult = rar.mult, i, stat, setId = null;
    function ok(c) { return !cls || !c || c === cls; }
    if (rarity >= 3 && slot) {
      var cands = SET_IDS.filter(function (id) { return SETS[id].pieces[slot] && ok(SETS[id].cls); });
      if (cands.length && R() < (rarity === 4 ? 0.35 : 0.15)) setId = pick(cands);
    }
    if (setId) {
      var S = SETS[setId];
      it.name = S.pieces[slot]; it.set = setId; it.setName = S.name; it.glow = S.color; it.legendary = rarity === 4;
      it.effect = { id: 'set_' + setId, desc: S.bonus };
      it.classReq = S.cls;
      var sp = POOL[slot].slice(), pr = PRIMARY[slot];
      it.stats[pr] = statValue(pr, floor, mult * 1.4);
      while (Object.keys(it.stats).length < 3 && sp.length) {
        stat = sp.splice(Math.floor(R() * sp.length), 1)[0];
        if (!it.stats[stat]) it.stats[stat] = statValue(stat, floor, mult);
      }
    } else if (rarity === 4) {
      var pool = LEGENDS.filter(function (l) { return (!slot || l.slot === slot) && ok(l.cls); });
      if (!pool.length) pool = LEGENDS.filter(function (l) { return ok(l.cls); });
      var L = pick(pool);
      it.name = L.name; it.slot = L.slot; it.legendary = true; it.effect = { id: L.effect.id, desc: L.effect.desc };
      if (L.cls) it.classReq = L.cls;
      for (stat in L.stats) it.stats[stat] = statValue(stat, floor, mult * L.stats[stat]);
      var extra = pick(POOL[L.slot]);
      if (!it.stats[extra]) it.stats[extra] = statValue(extra, floor, mult * 0.7);
    } else {
      var prim = PRIMARY[slot], pl = POOL[slot].slice(), n = rar.affixes, base;
      // class-restricted bases: weapons (incl. thief daggers) and armor
      var useClass = (slot === 'weapon' && R() < 0.45) || (slot === 'armor' && R() < 0.2);
      if (useClass) {
        var cc = cls || pick(CLASSES);
        it.classReq = cc;
        base = slot === 'weapon' ? pick(CLASS_WEAPONS[cc]) : CLASS_ARMOR[cc];
      } else base = pick(BASES[slot]);
      it.stats[prim] = statValue(prim, floor, mult * 1.2);
      if (it.classReq === 'thief' && slot === 'weapon' && !it.stats.crit) it.stats.crit = statValue('crit', floor, mult);
      while (Object.keys(it.stats).length < n + 1 && pl.length) {
        i = Math.floor(R() * pl.length); stat = pl.splice(i, 1)[0];
        if (!it.stats[stat]) it.stats[stat] = statValue(stat, floor, mult);
      }
      var keys = Object.keys(it.stats), second = keys[1] || prim, third = keys[2] || keys[0];
      it.name = base;
      if (rarity >= 2) { it.prefix = pick(PREFIX_STAT[third] || PREFIX); it.name = it.prefix + ' ' + it.name; }
      if (rarity >= 1) { it.suffix = pick(SUFFIX_STAT[second] || [SUFFIX[second]]); it.name += ' ' + it.suffix; }
    }
    if (it.classReq) it.className = CLASS_NAME[it.classReq] || it.classReq;
    if (it.slot === 'weapon') decorateWeapon(it, rarity, floor, level);
    return finishValue(it);
  }

  // Charm: bonus + tradeoff. stats holds the net values (tradeoff negative); bonus/tradeoff describe them separately.
  function makeCharm(floor, rarity) {
    rarity = Math.min(rarity, 3); // charms are never legendary-tier
    var rar = RARITIES[rarity], it = { uid: uid++, slot: 'charm', rarity: rarity, rarityName: rar.name, color: rar.color, glow: rar.color, ilvl: floor,
      stats: {}, effect: null, legendary: false, classReq: null, className: null, set: null, setName: null, prefix: null, suffix: null };
    var bonus = pick(CHARM_BONUS), cost, tries = 0;
    do { cost = pick(CHARM_COST); } while (cost === bonus && ++tries < 20);
    if (cost === bonus) cost = bonus === 'armor' ? 'hp' : 'armor';
    var bv = statValue(bonus, floor, rar.mult * 0.9);
    var cv = statValue(cost, floor, rar.mult * 0.45);
    it.stats[bonus] = bv; it.stats[cost] = -cv;
    it.bonus = { stat: bonus, value: bv }; it.tradeoff = { stat: cost, value: -cv };
    it.prefix = CHARM_ADJ[bonus]; it.suffix = CHARM_OF[cost];
    it.name = it.prefix + ' ' + pick(CHARM_NAMES) + ' ' + it.suffix;
    it.effect = { id: 'charm', desc: '+' + bv + ' ' + (LABEL[bonus] || bonus) + ', -' + cv + ' ' + (LABEL[cost] || cost) };
    return finishValue(it);
  }
  function rollCharm(floor, luck, tier, level) {
    floor = Math.max(1, floor || (CC.state && CC.state.floor) || 1);
    var r = pickRarity(floor, luck, 0, tier, level);
    return makeCharm(floor, r);
  }
  // level: player level (defaults to CC.state.player.level, else 1)
  function rollItem(floor, luck, minRarity, cls, tier, level) { return makeItem(floor, pickRarity(floor, luck, minRarity, tier, level), pickSlot(), cls, level); }

  // ---------- drops ----------
  var L = CC.Loot = {
    drops: [], RARITIES: RARITIES, LEGENDS: LEGENDS, SLOTS: SLOTS, LABEL: LABEL, _floor: null, _t: 0,
    rollItem: rollItem, makeItem: makeItem, compare: compare, hydrate: hydrate,
    WEAPON_TYPES: WEAPON_TYPE_IDS, ELEMENTS: ELEMENT_IDS, rollCharm: rollCharm, CHARM_LIMIT: CHARM_LIMIT, SETS: SETS, CLASSES: CLASSES,
    charmLimit: function () { var p = CC.state && CC.state.player; return CHARM_LIMIT + (p && p.charmSlots | 0); },
    // true when the item may be equipped by the class id (items without classReq fit everyone)
    usableBy: function (item, cls) { return !item || !item.classReq || !cls || item.classReq === String(cls).toLowerCase(); },
    setRandom: function (fn) { rnd = fn || Math.random; },
    clear: function () { this.drops.length = 0; },

    // Auto-equip a freshly picked-up item when it beats what is worn in its slot (or the slot is empty).
    // Skips charms, other classes' gear and legendary/set pieces already worn; the old piece goes to the pack
    // (sold when the pack is full). Turn off with CC.state.autoEquip = false. Returns true when it equipped.
    autoEquip: function (player, item) {
      var s = CC.state || {};
      if (!player || !item || s.autoEquip === false || item.slot === 'charm' || SLOTS.indexOf(item.slot) < 0) return false;
      if (!this.usableBy(item, player.classId)) return false;
      player.equipment = player.equipment || {};
      var eq = player.equipment[item.slot] || null;
      if (eq) {
        if ((eq.legendary || eq.set) && !item.legendary && !item.set) return false;
        if (!compare(item, eq).better) return false;
      }
      s.inventory = s.inventory || [];
      if (eq && s.inventory.length >= 40) { s.gold = (s.gold || 0) + (eq.value || 0); }
      else if (eq) s.inventory.push(eq);
      player.equipment[item.slot] = item;
      var C = CC.Classes;
      if (C && typeof C.applyItemStats === 'function') { try { C.applyItemStats(player); } catch (e) { /* best effort */ } }
      return true;
    },

    _spawn: function (kind, x, y, extra) {
      var a = R() * Math.PI * 2, s = 40 + R() * 70;
      var d = { kind: kind, x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0, vz: 150 + R() * 70, age: 0, amount: 0, item: null, rarity: 0, color: '#fff', seed: R() * 100 };
      for (var k in extra) d[k] = extra[k];
      return d;
    },

    roll: function (src, floor, luck, opts) {
      opts = opts || {};
      floor = Math.max(1, floor || (CC.state && CC.state.floor) || 1);
      var p = CC.state && CC.state.player;
      luck = (luck || 0) + (p && p.luck || 0);
      var out = [], x = src.x || 0, y = src.y || 0, self = this;
      var chest = src.tier !== undefined && src.opened !== undefined || src.isChest, boss = !!src.boss, elite = !!src.elite;
      function add(d) { out.push(d); if (opts.spawn !== false) self.drops.push(d); }
      var tier = boss ? 'boss' : elite ? 'elite' : 'normal';
      function gold(n) {
        for (var i = 0; i < n; i++) add(self._spawn('gold', x, y, { amount: Math.max(1, Math.round((2 + floor * 1.5) * (0.6 + R()) * (boss ? 2 : chest ? 1.5 : 1))), color: '#ffd24a' }));
      }
      function item(minR, bonusLuck) {
        var it = rollItem(floor, luck + (bonusLuck || 0), minR, undefined, chest ? 'normal' : tier);
        add(self._spawn('item', x, y, { item: it, rarity: it.rarity, color: it.color }));
      }
      function charm(bonusLuck) {
        var it = rollCharm(floor, luck + (bonusLuck || 0), chest ? 'normal' : tier);
        add(self._spawn('item', x, y, { item: it, rarity: it.rarity, color: it.color }));
      }
      if (chest) {
        if (R() < 0.12) charm();
        var n = 1 + (R() < 0.2 ? 1 : 0) + Math.min(1, src.tier | 0);
        for (var i = 0; i < n; i++) item(1);
        gold(ri(2, 3));
        if (R() < 0.5) add(self._spawn('hp', x, y, { amount: 25, color: '#ff4a5a' }));
        if (R() < 0.2) add(self._spawn('potion', x, y, { color: '#ff7ad0' }));
      } else if (boss) {
        item(1, 4); item(1, 4); if (R() < 0.3) item(1, 4);
        if (R() < 0.25) charm(4);
        gold(ri(4, 6));
        add(self._spawn('hp', x, y, { amount: 40, color: '#ff4a5a' })); add(self._spawn('mana', x, y, { amount: 30, color: '#4aa8ff' }));
        add(self._spawn('potion', x, y, { color: '#ff7ad0' }));
      } else {
        if (R() < (elite ? 0.3 : 0.07 + Math.min(luck, LUCK_CAP) * 0.0015)) item(0);
        if (R() < (elite ? 0.1 : 0.015)) charm();
        if (R() < (elite ? 1 : 0.55)) gold(elite ? ri(1, 3) : 1);
        if (R() < 0.12) add(self._spawn('hp', x, y, { amount: 12 + floor * 2, color: '#ff4a5a' }));
        if (R() < 0.1) add(self._spawn('mana', x, y, { amount: 10 + floor * 2, color: '#4aa8ff' }));
        if (R() < 0.03 + (elite ? 0.07 : 0)) add(self._spawn('potion', x, y, { color: '#ff7ad0' }));
      }
      return out;
    },

    update: function (dt) {
      var s = CC.state, p = s && s.player;
      this._t += dt;
      if (s && s.floor !== this._floor) { this._floor = s.floor; this.drops.length = 0; }
      var D = CC.Dungeon, hasD = D && D.isSolid;
      for (var i = 0; i < this.drops.length; i++) {
        var d = this.drops[i];
        d.age += dt;
        // pop-out arc with one bounce
        if (d.z > 0 || d.vz > 0) {
          d.vz -= 520 * dt; d.z += d.vz * dt;
          if (d.z <= 0) { d.z = 0; if (d.vz < -60) d.vz = -d.vz * 0.35; else d.vz = 0; }
          var nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
          if (!hasD || !D.isSolid(nx, ny)) { d.x = nx; d.y = ny; } else { d.vx = d.vy = 0; }
          var f = Math.max(0, 1 - 2.2 * dt); d.vx *= f; d.vy *= f;
        }
      }
      if (p) this.pickupNear(p, dt);
    },

    pickupNear: function (player, dt) {
      var got = [], s = CC.state || {}, pr = player.r || player.radius || 10;
      var mag = 90 + (player.magnet || 0) * (player.wideMagnet ? 2 : 1) * 1.5;
      for (var i = this.drops.length - 1; i >= 0; i--) {
        var d = this.drops[i], dx = player.x - d.x, dy = player.y - d.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (d.age < 0.5) continue;
        if (d.kind !== 'item' && dist < mag && dist > 1) { // magnet pull
          var sp = (180 + (mag - dist) * 5) * (dt || 0.016);
          d.x += dx / dist * sp; d.y += dy / dist * sp; d.z = 0; d.vz = 0; dist -= sp;
        }
        if (dist < pr + (d.kind === 'item' ? 16 : 8)) {
          this.drops.splice(i, 1);
          if (d.kind === 'gold') {
            var g = Math.round(d.amount * (1 + (player.goldFind || 0) / 100)); s.gold = (s.gold || 0) + g; this._text(d.x, d.y, '+' + g, '#ffd24a');
          } else if (d.kind === 'hp') {
            player.hp = Math.min(player.maxHp || player.hp + d.amount, player.hp + d.amount); this._text(d.x, d.y, '+' + d.amount + ' HP', '#ff6a78');
          } else if (d.kind === 'mana') {
            player.mana = Math.min(player.maxMana || player.mana + d.amount, player.mana + d.amount); this._text(d.x, d.y, '+' + d.amount + ' MP', '#6ab8ff');
          } else if (d.kind === 'potion') {
            s.potions = (s.potions || 0) + 1; this._text(d.x, d.y, 'Potion', '#ff9ae0');
          } else if (d.kind === 'item') {
            s.inventory = s.inventory || [];
            if (this.autoEquip(player, d.item)) { this._text(d.x, d.y, 'Equipped ' + d.item.name, d.item.color, 11); }
            else if (s.inventory.length >= 40) { s.gold = (s.gold || 0) + d.item.value; this._text(d.x, d.y, 'Sold +' + d.item.value, '#ffd24a'); }
            else { s.inventory.push(d.item); this._text(d.x, d.y, d.item.name, d.item.color, d.item.rarity >= 3 ? 12 : 10); }
            if (CC.fx && CC.fx.burst) CC.fx.burst(d.x, d.y, d.item.color, 6 + d.item.rarity * 3, 80);
          }
          got.push(d);
        }
      }
      return got;
    },
    _text: function (x, y, str, color, size) { if (CC.fx && CC.fx.text) CC.fx.text(x, y - 8, str, color, size || 10); },

    // ---------- drawing ----------
    draw: function (ctx, cam) {
      var D = CC.Dungeon, margin = 40, t = this._t;
      var vw = cam.w || (ctx.canvas && ctx.canvas.width) || 400, vh = cam.h || (ctx.canvas && ctx.canvas.height) || 700;
      for (var i = 0; i < this.drops.length; i++) {
        var d = this.drops[i];
        if (d.x < cam.x - margin || d.x > cam.x + vw + margin || d.y < cam.y - 120 || d.y > cam.y + vh + margin) continue;
        if (D && D.isExplored && !D.isExplored(d.x, d.y)) continue;
        var sx = Math.round(d.x - cam.x), sy = Math.round(d.y - cam.y);
        drawDrop(ctx, d, sx, sy, t);
      }
    }
  };

  function drawDrop(ctx, d, sx, sy, t) {
    var rar = d.kind === 'item' ? d.rarity : 0, col = d.kind === 'item' && d.item && d.item.glow || d.color, pop = Math.min(1, d.age / 0.45);
    var scale = d.age < 0.45 ? (0.3 + 0.8 * pop + Math.sin(pop * Math.PI) * 0.25) : 1; // pop-out overshoot
    var bob = d.z <= 0.5 ? Math.sin(t * 3 + d.seed) * 1.5 : 0, y = sy - d.z - 6 - bob;
    ctx.save();
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy, 6 * scale * (1 - Math.min(0.4, d.z / 80)), 2.5, 0, 0, 6.3); ctx.fill();
    if (d.kind === 'item') {
      if (rar === 0) glow(ctx, sx, sy - 4, 12 * scale, col); // faint rarity-colored ground glow for commons
      if (rar >= 4 || d.item.set) { // legendary/set: pulsing halo
        ctx.globalCompositeOperation = 'lighter';
        var hr = 20 + 4 * Math.sin(t * 5 + d.seed), hg = ctx.createRadialGradient(sx, sy - 6, 0, sx, sy - 6, hr);
        hg.addColorStop(0, hexA(col, 0.35)); hg.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = hg; ctx.fillRect(sx - hr, sy - 6 - hr, hr * 2, hr * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (rar >= 1) { // coloured light beam
        var bh = 34 + rar * 26, bw = 3 + rar * 1.6, al = (0.28 + 0.1 * rar) * (0.8 + 0.2 * Math.sin(t * 4 + d.seed)) * Math.min(1, d.age * 3);
        ctx.globalCompositeOperation = 'lighter';
        var g = ctx.createLinearGradient(0, sy, 0, sy - bh);
        g.addColorStop(0, hexA(col, al)); g.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = g; ctx.fillRect(sx - bw / 2, sy - bh, bw, bh);
        ctx.fillStyle = hexA(col, al * 0.35); ctx.fillRect(sx - bw, sy - bh * 0.7, bw * 2, bh * 0.7);
        var rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 16 + rar * 3);
        rg.addColorStop(0, hexA(col, 0.5)); rg.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = rg; ctx.fillRect(sx - 24, sy - 12, 48, 24);
        if (rar >= 2) for (var k = 0; k < rar; k++) { // rising sparkles
          var ph = (t * 0.6 + k * 0.37 + d.seed) % 1;
          ctx.fillStyle = hexA(col, 1 - ph); ctx.fillRect(sx + Math.sin(d.seed * 7 + k * 2 + ph * 4) * 7, sy - ph * bh, 2, 2);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      if (d.age < 0.6 && rar >= 2) { // spawn shock-ring
        var rr = d.age / 0.6;
        ctx.strokeStyle = hexA(col, 1 - rr); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 6 + rr * (14 + rar * 6), 0, 6.3); ctx.stroke();
      }
      drawItemIcon(ctx, d.item, sx, y, scale, col);
    } else if (d.kind === 'gold') {
      var sq = Math.abs(Math.cos(t * 4 + d.seed)); // spinning coin
      ctx.fillStyle = '#b8860b'; ctx.fillRect(sx - 3 * scale * sq - 0.5, y - 3, 6 * scale * sq + 1, 6);
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(sx - 2 * scale * sq, y - 2.5, 4 * scale * sq, 5);
    } else if (d.kind === 'hp' || d.kind === 'mana') {
      glow(ctx, sx, y, 10 * scale, col);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, y, 4 * scale, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(sx - 2, y - 2, 2, 2);
    } else if (d.kind === 'potion') {
      glow(ctx, sx, y, 10 * scale, col);
      ctx.fillStyle = '#c0c8d8'; ctx.fillRect(sx - 1.5, y - 6 * scale, 3, 3);
      ctx.fillStyle = col; ctx.fillRect(sx - 4 * scale, y - 3 * scale, 8 * scale, 7 * scale);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(sx - 3 * scale, y - 2 * scale, 2, 4);
    }
    ctx.restore();
  }
  function glow(ctx, x, y, r, col) {
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hexA(col, 0.6)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over';
  }
  function drawItemIcon(ctx, it, x, y, s, col) {
    ctx.fillStyle = 'rgba(10,10,16,0.85)'; ctx.fillRect(x - 7 * s, y - 7 * s, 14 * s, 14 * s);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.strokeRect(x - 7 * s, y - 7 * s, 14 * s, 14 * s);
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2;
    switch (it.slot) {
      case 'weapon': ctx.beginPath(); ctx.moveTo(x - 4 * s, y + 4 * s); ctx.lineTo(x + 4 * s, y - 4 * s); ctx.stroke(); ctx.fillRect(x - 4 * s, y + 1 * s, 4 * s, 2); break;
      case 'armor': ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 4 * s); ctx.lineTo(x + 4 * s, y - 4 * s); ctx.lineTo(x + 3 * s, y + 2 * s); ctx.lineTo(x, y + 5 * s); ctx.lineTo(x - 3 * s, y + 2 * s); ctx.closePath(); ctx.fill(); break;
      case 'helm': ctx.beginPath(); ctx.arc(x, y, 4.5 * s, Math.PI, 0); ctx.lineTo(x + 4.5 * s, y + 4 * s); ctx.lineTo(x - 4.5 * s, y + 4 * s); ctx.closePath(); ctx.fill(); break;
      case 'gloves': ctx.fillRect(x - 3 * s, y - 1 * s, 6 * s, 5 * s); ctx.fillRect(x - 3 * s, y - 5 * s, 1.5 * s, 4 * s); ctx.fillRect(x - 0.7 * s, y - 5 * s, 1.5 * s, 4 * s); ctx.fillRect(x + 1.6 * s, y - 5 * s, 1.5 * s, 4 * s); break;
      case 'boots': ctx.beginPath(); ctx.moveTo(x - 2 * s, y - 5 * s); ctx.lineTo(x + 2 * s, y - 5 * s); ctx.lineTo(x + 2 * s, y + 1 * s); ctx.lineTo(x + 5 * s, y + 4 * s); ctx.lineTo(x - 3 * s, y + 4 * s); ctx.closePath(); ctx.fill(); break;
      case 'ring': ctx.beginPath(); ctx.arc(x, y + 1, 3.5 * s, 0, 6.3); ctx.stroke(); ctx.fillRect(x - 1, y - 5 * s, 3, 3); break;
      case 'amulet': ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 5 * s); ctx.lineTo(x, y - 1 * s); ctx.lineTo(x + 4 * s, y - 5 * s); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y + 2 * s, 2.5 * s, 0, 6.3); ctx.fill(); break;
      case 'charm': ctx.beginPath(); ctx.moveTo(x, y - 5 * s); ctx.lineTo(x + 4 * s, y); ctx.lineTo(x, y + 5 * s); ctx.lineTo(x - 4 * s, y); ctx.closePath(); ctx.fill(); break;
      default: ctx.beginPath(); for (var i = 0; i < 5; i++) { var a = -1.57 + i * 1.2566, a2 = a + 0.628; ctx.lineTo(x + Math.cos(a) * 5 * s, y + Math.sin(a) * 5 * s); ctx.lineTo(x + Math.cos(a2) * 2 * s, y + Math.sin(a2) * 2 * s); } ctx.closePath(); ctx.fill();
    }
  }
  function hexA(c, a) {
    var r = parseInt(c.substr(1, 2), 16), g = parseInt(c.substr(3, 2), 16), b = parseInt(c.substr(5, 2), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = CC;
})(typeof window !== 'undefined' ? window : globalThis);
