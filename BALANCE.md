# Emberdeep balance plan (balance.js, tests/balance.test.mjs)

**Goal:** the hero reaches the Emberdeep boss at about level 20 (about 54,000 XP in total).

| Area | Level band | Kills its band needs | Monsters on the map |
|---|---|---|---|
| Giant Forest | 1 - 5 | 80 | ~120 |
| Hollow Tree tunnel | 3 - 6 | (a branch) | own |
| Rolling Plains | 5 - 10 | 140 | ~325 |
| Rocky Pass | 10 - 14 | 150 | ~530 |
| Abandoned Village | 13 - 16 | 120 | ~160 |
| Cinderwake (3 floors) | 16 - 19 | 150 | ~70 per floor |
| Emberdeep | 19 - 21 | 100 | ~60 + the boss |

A monster's level inside its band depends on how far it stands from the way in (the far end is the hard end).
Caves and Endless modes keep their own floor-based scaling; night stalkers have their own.

**Per monster at level L** (the hero curve is measured from classes.js + loot.js and re-checked by the test):
- HP x hero damage(L) / hero damage(1), so a normal monster always takes the same number of hits
- damage x hero effective health(L) / (1), plus 1.2% pressure per level, so a hit always costs a similar share of your health
- XP = XP a level needs / kills a level should take (20 / 30 / 40 / 50 for levels 1-5 / 6-10 / 11-15 / 16+), relative to the area's average monster
- loot level = L, so gear keeps pace
- bosses: HP x0.4, damage x0.55 of the same curve (their base numbers are already big)

**Replay (`CC.state.cycle` = 1, 2, ...):** HP x(1 + 0.9n), damage x(1 + 0.5n), XP x(1 + 0.6n); 35-60% of ordinary monsters get elite abilities
(Swift, Armored, Vampiric, Explosive, Frenzied, Shielded); 18% per replay swap in tougher kinds (ghoul, scorpion, ghost, demon).
Test mode has a Replay selector. The save keeps `cycle` and `chapter` (Part 2 of the full version).

**To tune:** change `B.BAND`, `B.hero.*`, `killsPerLevel`, `B.TARGET` in balance.js; run `npm test` - the simulator fails if hits-to-kill drifts, a
monster kills you in under 4 hits, the pass is too empty for its band, or the hero curve no longer matches the real class and loot code.

## Spells (balance.js `SPELLS`, `spellStats`; the "spell simulator" tests)

Damage is in units of one basic hit. Sustained spell damage must be 15-90% of the basic attack (charge skills 25-130%), a cast must be worth
at least two basic hits, and damage per mana must be 0.1-0.7. The table's multipliers are checked against the real code by regex, so the
table cannot drift silently. Charge skills cost 30% of max mana with an 8 s cooldown.

| Class | Spell | Cast value | vs basic dps | per mana |
|---|---|---|---|---|
| Swordsman | Bash / Whirl / Blade Storm / Dragon Rush / Sky Cleaver | 2.6 / 10 / 12.8 / 9 / 18.9 | 21 / 46 / 51 / 36 / 76% | .33 / .56 / .64 / .31 / .50 |
| Wizard | Fireball / Frost Nova / Lightning Spear / Blizzard / Meteor Storm | 3.6 / 5.4 / 14.4 / 22.8 / 22.5 | 60 / 32 / 76 / 120 / 118% | .18 / .22 / .23 / .25 / .18 |
| Necromancer | Drain / Soul Spear / Plague Nova / Army of the Dead | 2.7 / 9 / 12 / 18 | 30 / 51 / 67 / 101% | .18 / .17 / .16 / .18 |
| Thief | Knives / Venom Burst / Phantom Blades | 3.1 / 10 / 12 | 34 / 30 / 36% | .26 / .29 / .24 |

Not measured (utility, no damage): Raise Skeletons, Smoke Bomb. The thief's third charge skill and the SpellPairs charged versions
(x1.68 mana, x1.75 cooldown) are not in the table yet.
