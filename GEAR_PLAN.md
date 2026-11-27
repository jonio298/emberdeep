# Emberdeep gear update: the plan (drops, class loot, 70 legendary weapons)

Status (build 20261126.38): steps 1-4 are built: drop tables and quality pipeline (`droptables.js`), the 70 weapons as data (`legendary_weapons.js`), the ability engine (`legendary.js`) with every weapon's ability implemented, boss/stalker-bound drops, the Legendary Codex, test-mode Give legendary, and tests (`tests/droptables.test.mjs`, `tests/legendary.test.mjs`). A power-cap test (stat totals and damage multipliers) is in. NOT done: per-weapon art (they use the generic base art) and live play-testing of every ability (only Emberfang was tried in the browser). Where an ability in section 4 differs from what was built, the in-game description (`legendary_weapons.js`) is the truth: Dawnbreaker dazes instead of blinding, Mirage Edge stuns instead of leaving a decoy, Sepulcher Staff only raises the minion cap, Worm-Eaten Regalia raises 8 skeletons below half health, The Last Word gives double damage for 3 s after a free cast, Locksmith's Pick opens chests as you walk up. Decisions: no sockets or runes for now; strict required levels.

## 1. Where we are now (what exists in the code)

- `loot.js` has 5 rarities (Common, Uncommon, Rare, Epic, Legendary), a `LEGENDS` table of 21 hand-made items (only **5 are weapons**), generated
  weapon types (`sword axe dagger staff wand bow mace spear`) with a loose class lean, `luck` as a stat (cap 30), and item level = `floor`.
- Until the balance pass (build .33) every monster dropped at item level 1. Since then `e.floor` = the monster's level band (1 to 21), so gear now keeps pace.
- Drops are one roll per kill: a rarity weight table shifted by level/floor, with elite and boss bonuses. There is no "nothing drops" roll,
  no treasure classes, no quality tiers like uniques vs sets, no per-source tables, and no class bias on drops.

## 2. Research: how Diablo II handled drops (and what we should copy)

Sources: [Treasure Class (PureDiablo wiki)](https://www.purediablo.com/d2wiki/Treasure_Class), [Magic Find (Diablo wiki)](https://diablo-archive.fandom.com/wiki/Magic_Find_(Diablo_II)),
[Zax's Item Finding Guide](https://us.forums.blizzard.com/en/d2r/t/zax%C2%B4s-item-finding-guide/116303). The web search confirmed the structure below.
The exact formulas in section 2.3 are from memory of the game's data files and the community guides, not from a page I could open, so the
numbers there are the shape to copy and will be re-derived for our game anyway.

### 2.1 The pipeline (confirmed)
1. **Treasure Class (TC)**: every monster, chest and boss has a TC. A TC is a table with a **NoDrop** weight, a number of **picks**, and weighted entries
   that are either an item type or **another TC** (they nest). Picking walks down the tree to a base item.
2. **Item level (ilvl)** = the monster's level (bosses and chests have their own). The ilvl limits which bases can drop and how good the affixes can be.
3. **Quality roll**, in order: Unique, then Set, then Rare, then Magic, then Superior, else Normal. A unique or set only rolls if the item's own quality
   level (qlvl) is at or below the monster's level, which is why "high" uniques only drop from deep monsters.
4. **Properties**: affixes are rolled within ranges that depend on the ilvl. **Magic Find only shifts step 3**. It never changes whether anything
   drops or which base item drops.
5. **Boss and area tables** are better than normal-monster tables: bosses drop several items, can't roll NoDrop, and use upgraded TCs. Class-specific
   bases are weighted lower (a third) than generic ones. Items that have only one quality (runes) ignore MF.

### 2.2 What makes it addictive
- Almost every kill is nothing or junk, so a good drop is rare and the sound/colour of it matters.
- You can be shown a drop you can't use yet ("level 40 required"): it is a goal. Higher-level bases and uniques need a deeper monster *and* you to level.
- **Repeatable boss runs** are the farming loop. Bosses drop several items and have no NoDrop.
- **Diminishing returns on Magic Find** keep it from breaking the game (each quality has its own MF cap curve).
- Variance inside an item (stat ranges), so two copies of the same unique are not equal. This is what keeps people farming a "solved" item.

### 2.3 The formulas (from memory; to be re-derived)
- Quality chance per item roughly: `chance = (BASE - (ilvl - qlvl) / DIVISOR) / 128`, floored at a minimum. Higher ilvl than the item's qlvl makes it likelier.
- Magic Find, with diminishing returns per quality: `effMF = MF * K / (MF + K)` with a different K per quality (about 250 unique, 500 set, 600 rare),
  then `chance' = chance * (100 + effMF) / 100`.
- Magic Find helps magic items most, then rare, set, and unique least in percent terms.

## 3. The plan for Emberdeep

### 3.1 Treasure classes as data (new file `droptables.js`)
- Every source gets a TC: `normal`, `champion` (elite affix), `miniboss` (night stalkers, the Scree Golem ledges), `boss`, and `chest` tiers.
- A TC = `{ noDrop, picks, entries: [{ item | tc, weight }] }`, nested. The top TC is picked by source, then **upgraded by area band** (our level band
  from `balance.js`), exactly like D2's TC progression: the Forest tables hold low bases, the Emberdeep tables hold the best.
- `NoDrop` rises with the number of players (co-op) and falls with source tier. Bosses never roll NoDrop.
- Picks: normal 0-1, champion 1-2, miniboss 2-4, boss 4-6, replay cycles add one pick per cycle.
- Gold, potions and charms are TC entries too.

### 3.2 Item level, and drops higher than your character ("overlevel")
- `ilvl = monster level` (from `balance.js`, so the far end of an area drops higher). On top of that, **overlevel rolls**:
  - normal 4% to get +1 to +2 ilvl, champion 8% (+1 to +3), miniboss 15% (+2 to +4), boss always +2 to +5.
  - Replay cycle `n` adds +3 ilvl per cycle.
- Each item has a **required level**: legendaries have a fixed one (their `qlvl`), others use `ceil(ilvl * 0.8)`. Items above your level
  show their requirement in **red**. You can keep them, stash them and chase them. Decided: strict, you cannot wear them until you reach the level.
- This is the exact "monster is above your level" loop of D2: a level 12 hero gets a level 17 weapon drop from a Rocky Pass stalker and has
  a goal for 5 levels.

### 3.3 Quality tiers (rarity) and chances
Keep the five tiers, rename for clarity and add one: **Common, Uncommon, Rare, Epic, Legendary**, plus **Set** (the existing `SETS` become a proper tier).
Quality is rolled in D2's order (Legendary, then Set, then Epic, then Rare, then Uncommon, else Common) with these starting numbers
(chance per item that drops, at 0 Magic Find, before the ilvl bonus). They are tuning values to be set by the drop simulator, not final:

| Source | Legendary | Set | Epic | Rare | Uncommon |
|---|---|---|---|---|---|
| Normal monster | 0.02% | 0.03% | 0.6% | 4% | 20% |
| Champion | 0.4% | 0.6% | 4% | 14% | 30% |
| Mini-boss / night stalker | 3% | 4% | 12% | 26% | 30% |
| Boss | 12% | 12% | 25% | 30% | 20% |
| Chest (tier 1/2/3) | 0.1/0.4/1.5% | 0.2/0.6/2% | 2/6/12% | 8/16/26% | 28/30/30% |

- Legendary chance is multiplied by `1 + min(0.5, 0.04 * (ilvl - qlvl))`, where qlvl is the **specific legendary's** level, and a legendary is
  only eligible once the monster level is at least its qlvl (the D2 rule).
- **Magic Find = the existing `luck` stat** with diminishing returns: `eff = luck * K / (luck + K)`, K = 250 for legendary, 500 for set,
  600 for rare, 1000 for epic.
- **Bad-luck protection** (mobile-friendly, D2 has none): after 25 mini-boss/boss kills without a legendary, the next boss drop is guaranteed one.
- Target pacing (to be verified by the simulator): about one legendary per 40-60 minutes of normal play at 0 MF, about one per 20-30 minutes if you
  run night-stalker hunts or boss kills, and a complete 70-weapon collection takes many replay cycles on purpose.

### 3.4 Class-specific loot
Three levels, all data-driven by tags on each base and each legendary:
1. **Class-locked** (about 40% of the legendary weapons): only that class can equip it (the class art and effect are built for it).
2. **Class-preferred**: anyone can use it, and the owner class gets a bonus effect (e.g. +1 rank to one of its spells).
3. **Universal**: any class.
- **Drop bias**: 55% of weapon-slot drops are for your class's weapon types, 15% each for the others (D2 weighted class items at a third, we weight your own
  higher so you aren't buried in junk). Legendary weapon picks: your class and universal at weight 1, other classes at weight 0.35.
- Co-op: **personal loot** (each player rolls their own drops and sees only their own).

### 3.5 Legendary ability framework
70 abilities must not mean 70 pieces of special code. Plan: one small **event bus** in `legendary.js` with these hooks, and each weapon is data + a
small handler: `onHit, onCrit, onKill, onCast(spellId), onChargeRelease, onDash, onHurt, onTick(dt), modifySpell(spellId, params), modifyStat`.
About 12 reusable archetypes (burn on hit, chain, execute, stacking buff, spell modifier, minion modifier, stealth, aura, nova on low HP, etc.) cover
about 45 of the weapons; the rest have custom handlers (listed with a star in the tables).
- Item stats roll inside a range (D2 style variance), so two copies of the same legendary differ by up to 15%.
- Tooltips show the ability in plain words; legendaries show a gold beam, a drop sound, and appear on the minimap.

### 3.6 Where the 70 drop (sources)
- **Level-banded pool** (most): any source, once the monster level reaches the weapon's qlvl.
- **Boss-bound (5)**: only from one boss (Patchwork Horror, Mere Horror, Hearthkeeper, Emberheart, the Grinning Mask).
- **Stalker-bound (9)**: only from the matching night stalker. Night stalker hunts become the farming loop, like D2's boss runs.
- A **drop log**/collection screen (a "Legendary Codex") shows silhouettes of the ones you haven't found.

### 3.7 Build order
1. `droptables.js` and the quality pipeline replace `Loot.roll`, with a **drop simulator test** that kills a million monsters per source and asserts the
   rates above, the overlevel frequencies, the class weights and the pity timer (like D2 drop calculators).
2. `legendary.js`: the event bus and the first 12 archetypes, and the 5 existing legendary weapons migrated.
3. The 70 weapons in batches by class (art: reuse `itemart.js` base shapes plus a per-weapon colour/glow; unique silhouettes later).
4. UI: red level requirement, the Codex, comparison tooltips, drop beams and sounds.
5. Balance: add every weapon's ability to the spell/DPS simulator (`balance.js`), cap total power per weapon so no legendary beats the curve by more than
   about 25%, and tune.

### 3.8 Open questions
- DECIDED (2026-11-27): items above your level can't be equipped until you reach the required level, for every rarity (strict, Diablo II style). They can be carried and stashed.
- Sockets and gems or runewords in this update, or later? I'd leave them out so the update stays about legendaries and drops.
- Should **set items** be reworked now, or stay as they are?
- Is the "pity timer" ok for the feel you want, or do you want pure randomness like D2?

## 4. The 70 legendary weapons

Format: name, base type, level it starts dropping (qlvl), and its power. Class tags: **SW** swordsman, **WZ** wizard, **NC** necromancer, **TH** thief,
**ANY** universal. A star (*) marks a custom handler. All of them also roll normal stats (damage, crit, etc.).

### Swordsman (14)
| # | Name | Base | qlvl | Ability |
|---|---|---|---|---|
| 1 | Emberfang | Sword | 8 | Hits ignite for 3 s; a burning foe that dies explodes. |
| 2 | Dawnbreaker | Sword | 12 | Crits deal +60% and flash a blinding burst that makes nearby foes miss. |
| 3 | Stormbrand | Sword | 16 | Your dash leaves a lightning trail that shocks anything that crosses it. |
| 4 | Oathsplitter | Greatsword | 20 | Whirl hits twice per tick but costs 50% more mana. |
| 5 | Gravelord's Edge* | Sword | 25 | Every 5th hit slams the ground with a shockwave that knocks foes back. |
| 6 | Kingsbane | Sword | 30 | +100% damage to elites and bosses, -15% to everything else. |
| 7 | Hollow Tree Cleaver | Axe | 6 | Hits on foes below 30% health execute them. |
| 8 | Skullcrusher | Axe | 14 | Shield Bash always stuns, and armoured foes lose their armour for 4 s. |
| 9 | Ragewind | Axe | 22 | Each hit adds 6% attack speed (max 8 stacks); stacks drop after 4 s of no hits. |
| 10 | Bloodmoon Reaper* | Axe | 28 | Three kills within 3 s trigger a 5 s lifesteal frenzy. |
| 11 | Thunderhead | Mace | 10 | Shield Bash also sends out a ring of thunder that shocks every foe it crosses. |
| 12 | Ironvow | Mace | 18 | While you are attacking you take 25% less damage (a moving guard). |
| 13 | Sunforged Maul* | Mace | 26 | A full charge calls a column of sunlight on the target, burning and healing you. |
| 14 | Warlord's Edge | Sword | 35 | Each kill gives +1% damage (max 30 stacks); being hit loses 5 stacks. |

### Wizard (14)
| # | Name | Base | qlvl | Ability |
|---|---|---|---|---|
| 15 | Archmage Focus | Staff | 9 | Spells pierce through foes instead of stopping at the first. |
| 16 | Stormcaller Rod | Staff | 10 | Attacks chain lightning to 2 nearby foes. |
| 17 | Mana Thorn | Wand | 8 | Kills restore mana; at full mana your next hit deals +40%. |
| 18 | Rimefall Staff | Staff | 12 | Frost Nova and Blizzard freeze chance doubles (10% to 20%); cold chills last 5 s. |
| 19 | Twinflame Wand | Wand | 14 | Fireball splits into two flames that fan out. |
| 20 | Cinderspire | Staff | 15 | Fireball leaves burning ground for 4 s. |
| 21 | Prism Crook* | Staff | 17 | Each cast picks a random element (fire, ice, lightning, arcane) with a bonus effect. |
| 22 | Voidlens | Orb | 18 | Spells pull foes toward the point of impact. |
| 23 | Aetherwhip | Wand | 20 | Every 4 hits reduce your spell cooldowns by 1 s. |
| 24 | Glacier's Heart | Staff | 22 | Blizzard lasts 50% longer and covers a wider area; foes inside are slowed 20% more. |
| 25 | Thunderstaff of Vael | Staff | 24 | Lightning Spear stays twice as long and jumps to a second foe on its last pulse. |
| 26 | Starfall Scepter* | Staff | 28 | After each spell a star falls on the target a second later. |
| 27 | Hourglass Rod* | Staff | 30 | Below 40% health, a field slows time around you for 4 s (30 s cooldown). |
| 28 | The Last Word* | Staff | 32 | Every 10th spell is free and cast twice. |

### Necromancer (14)
| # | Name | Base | qlvl | Ability |
|---|---|---|---|---|
| 29 | Gravewhisper | Wand | 6 | 15% chance a slain foe rises as a skeleton ally. |
| 30 | Gravedigger's Spade | Mace | 8 | Kills sometimes unearth gold or a potion at the corpse. |
| 31 | Bonechoir Rod | Wand | 10 | Skeletons sing: +20% minion attack speed. |
| 32 | Hexbone Wand | Wand | 12 | Curses spread to the nearest foe when a cursed one dies. |
| 33 | Marrow Lash | Wand | 14 | Whenever a minion hits, you heal for 1% of your health. |
| 34 | Deathbinder | Staff | 15 | Minions surge: +30% damage for 6 s after you cast a spell. |
| 35 | Ghoulpiper | Wand | 16 | Raise Skeletons raises tougher ghouls with 2x health. |
| 36 | Soulwell Scythe* | Staff | 18 | Life Drain chains to 2 more foes. |
| 37 | Nightwarden's Reach | Staff | 20 | Soul Spear pierces everything and marks foes to take +15% damage. |
| 38 | Plague Censer | Staff | 22 | Plague Nova leaves a lingering miasma for 5 s. |
| 39 | Sepulcher Staff | Staff | 26 | Minion cap +3; minions explode when they die. |
| 40 | Memento Mori | Wand | 28 | After each kill your next hit within 4 s deals +50%. |
| 41 | Lich's Phylactery* | Orb | 30 | Once per fight, a fatal blow instead makes you a lich for 6 s (invulnerable, +50% damage). |
| 42 | Worm-Eaten Regalia | Staff | 34 | Army of the Dead raises 8 skeletons below half health. |

### Thief (14)
| # | Name | Base | qlvl | Ability |
|---|---|---|---|---|
| 43 | Nightfang | Dagger | 7 | Hits from behind a foe deal +40% and cause bleeding. |
| 44 | Locksmith's Pick | Dagger | 8 | Opens chests instantly; chests drop one more item. |
| 45 | Gutter Saint's Kris | Dagger | 9 | Hits cause a bleed that stacks 3 times. |
| 46 | Whisperkiss | Dagger | 10 | Crits reset your dash and make you silent for 2 s. |
| 47 | Cutpurse's Delight | Dagger | 11 | Hits steal gold; stealing from a foe below 30% health takes triple. |
| 48 | Venomtongue | Dagger | 12 | Throwing Knives poison; poison stacks up to 5 times. |
| 49 | Shadowstep Shiv | Dagger | 14 | Your dash ends with a free backstab on the nearest foe. |
| 50 | Ace of Spades* | Dagger | 16 | Each hit flips a coin: heads +100% damage, tails 0; and a 1% chance to slay outright. |
| 51 | Mirage Edge | Dagger | 20 | Smoke Bomb leaves a decoy that draws foes for 5 s. |
| 52 | Hailstorm Daggers | Dagger | 22 | Throwing Knives fan out to 7 knives that chill. |
| 53 | Eclipse Fang | Dagger | 26 | Phantom Blades strike three times on each foe. |
| 54 | Silent Requiem* | Dagger | 30 | Attacks from stealth deal triple damage and do not break stealth. |
| 55 | Razorwind Chakram* | Dagger | 34 | Your basic attack throws a spinning blade that returns to you, hitting twice. |
| 56 | Widowmaker | Bow | 18 | Arrows pierce 3 foes and apply a stacking mark that makes foes take more damage. |

### Boss-bound (5, any class)
| # | Name | Base | qlvl | Dropped by | Ability |
|---|---|---|---|---|---|
| 57 | Grinmask's Rictus Blade | Sword | 6 | The Grinning Mask | Kills make the next hit within 3 s a stunning crit. |
| 58 | Stitchblade* | Sword | 10 | Patchwork Horror | Takes a part of each killed foe: +1% damage per kind of monster slain this floor. |
| 59 | Drowned Trident | Spear | 12 | Mere Horror | Hits soak foes; soaked foes take double lightning and cold damage. |
| 60 | Hearthkeeper's Poker | Mace | 18 | Hearthkeeper | Fire damage you take is converted into health; your hits scorch for 3 s. |
| 61 | Emberheart Brand* | Sword | 21 | Emberheart | Below 30% health you erupt in a fire nova (20 s cooldown); fire damage +30%. |

### Night-stalker-bound (9, any class)
| # | Name | Base | qlvl | Dropped by | Ability |
|---|---|---|---|---|---|
| 62 | Rictus Fang | Dagger | 12 | The Grinning Mask (stalker) | Teleport-strike: your dash can end behind a foe, with a free crit. |
| 63 | Puppet Butcher's Cleaver | Axe | 14 | The Puppet Butcher | Every hit has a 10% chance to hook the foe and pull it to you. |
| 64 | Thread-Reaper | Staff | 16 | The Scythe Weaver | Spell hits leave a thread; after 3 seconds all threads tighten and detonate. |
| 65 | Widow's Sting* | Dagger | 15 | The Veiled Widow | Hits web the foe (slow 40%); a webbed foe killed spawns a spider ally. |
| 66 | Choir Reed | Wand | 17 | The Wailing Chorus | Every 8th hit emits a shriek that stuns everything in a short radius. |
| 67 | Bloomstaff | Staff | 18 | The Skull Bloom | Kills plant a skull bloom that bursts for area damage 3 s later. |
| 68 | Hound's Fang | Dagger | 19 | The Cinderhound | +20% move speed; dashes leave a fire trail. |
| 69 | Gloomreach | Spear | 20 | The Gloom Crawler | Strikes from unseen (out of a foe's sight) deal +80% and ignore armour. |
| 70 | Gravemaw Maul* | Mace | 22 | The Gravemaw | Each strike heals you for 3% of the damage and shakes the ground in a cone. |

(Class split: 56 class weapons in four groups of 14, 14 bound to bosses and stalkers. About 40% of the whole list is class-locked,
the rest is class-preferred or universal. The numbers in the abilities are starting points for the weapon simulator, not final.)

## 5. Risks
- 70 abilities means a lot of testing: every archetype gets one test, and the DPS/ability simulator caps outliers.
- Item art: 70 weapons need distinguishable art. Plan: base shapes in `itemart.js` with a per-weapon palette, glow and one extra detail, and a full art
  pass later.
- Drop rates are the thing players feel most: the simulator test plus a test-mode "drop X" and "force legendary" button.
