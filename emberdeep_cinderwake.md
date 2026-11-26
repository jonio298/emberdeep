# THE CINDERWAKE - area design and lore bible

The area after the Abandoned Village (`village.js`, `CC.AbandonedVillage`). It is the "one beneath the chapel" that the ghosts keep
mentioning. Planned module `cinderwake.js` (`CC.Cinderwake`), monsters in `cinderwake_monsters.js`. This file is design only.

Stat numbers below are calibrated against `enemies.js` (Bone Warrior hp 26 / spd 58 / dmg 9, Ghoul hp 34 / dmg 9, Wailing Ghost hp 18,
Cinder Demon hp 52 / dmg 12, Drake hp 210 / dmg 18). Treat them as ranges for the implementer to tune.

## 1. Lore (canon)

Long before the village had a name, the founders settled a cold valley where nothing would grow. Under the hill (where the chapel now
stands) they found a buried furnace older than the valley, still warm. They called it the **Emberdeep**. It offered warmth, harvests and
winters that never came, and asked for years. Not coin, not blood: years of life, a little from every household, paid at the chapel on
the first frost.

The founders built the chapel over the furnace door so the bargain would look like worship. **Warden Halric Vane**, first of the founders,
became its keeper and kept the ledger of years. For three generations the village was the warmest place in the world and nobody asked why
the old died so young.

Then the village stopped paying. Brother Aldous refused the tithe, the families wanted their years back, and the Warden would not let them
go. The chapel bell tolled by itself, three times (the ghosts remember this). Everyone went to the chapel. The furnace collected the whole
debt at once, and the village burned from the inside without a flame in the sky.

- The **ghosts** in the village are the unpaid debt: years the Emberdeep was owed and never finished taking. They cannot move on until the
  furnace is cold.
- **Halric Vane** did not die. He bound himself to the furnace door as the **Hearthkeeper**, so the debt could still be collected and the
  ledger closed. He believes he is protecting the village.
- Rain in the village is the last weather the valley had. Below, the rain turns to **ash**: the village's years, burning slowly.
- The village cellar (`generateCellar`) was the founders' cold store. Its hidden vault is where Vane hid the way down.

Consistency with existing dialogue (`village.js` ghost lines):
- Brother Aldous: "Something below the floor listened instead." The Emberdeep.
- Mina: "Everyone went to the chapel when the bell rang. No one came out again." The collection.
- Widow Verrin: "There is one who lies beneath the chapel, and he is not at rest... I will tell you what he did to this village."
  Halric Vane, the Hearthkeeper. Verrin gets a new, longer line once the Cinderwake is open (section 4).

Tone: sombre and quiet. Little music, long silences, nothing jokes. Warmth is the horror; it is the first area that is pleasant to
stand in, and that is the warning.

## 2. Entry and layout (3 floors)

**Entry.** In the cellar's hidden vault (the room at `VAULT`), after the two vault chests are opened, the back wall is scorched through:
a stair of fused glass leading down. Entering plays the area title **THE CINDERWAKE**. Return is by the same stair (floor 1 exit).
**One rule:** the stair is revealed when both vault chests have been opened, and in no other way (the quest does not bypass it). The
quest hint in section 5 tells the player to loot the vault, so the hint and the trigger match.

General look: dark stone gone black and glassy, cracked with orange seams. Dim orange light from seams and braziers, `ambient`
around `'24,10,6,0.6'`, small player light, fog colour warm grey. Falling ash particles replace the village rain (reuse the rain
system in `after`, slower, grey-white, drifting sideways). Soft thump of a distant bellows as ambience.

Palette (floor / wall / accent):
- Floor 1: ash grey `[84,76,72]`, wall soot `[38,32,32]`, accent ember `[214,120,48]`
- Floor 2: slag black `[58,46,44]`, wall red-brown `[92,48,36]`, accent molten `[255,150,40]`
- Floor 3: bone-white ash `[120,110,100]`, wall charcoal `[26,22,24]`, accent furnace gold `[255,196,96]`

### Floor 1 - The Ashfall Stair
Mood: quiet descent, the first warmth. Ash drifts down from above like snow.
- Layout: a long switchback stair with 4 landings, each a small room; spawn at the top, stairs to floor 2 at the bottom.
- Monsters: Ember Moth, Soot Wretch (1-2 per landing).
- Set pieces: a row of burnt pews fused into the floor (the chapel's, fallen through); the chapel **bell**, cracked, lying on a landing.
  Interact: it will not ring ("It is warm to the touch.").
- Ghost: **Sister Imre** on landing 2 (section 4).
- Loot: 2 tier-1 chests; a ledger page (lore item) on the bell landing.
- Secret: a landing wall with a brazier the player can snuff (interact) opens a closet with a tier-2 chest.

### Floor 2 - The Slag Warrens
Mood: heat and crowding; the first area where the warmth hurts.
- Layout: a cave maze of five rooms (mirror the `rooms` list approach in `mountain_cave.js`) linked by narrow tunnels, with slow rivers
  of slag that are impassable tiles and damage on contact. Stairs to floor 3 in the far room.
- Monsters: Slag Crawler, Soot Wretch, Ember Moth, Candlewraith (the first appears here, paired with Slag Crawlers).
- Set pieces: the **Tally Wall**: a cavern wall scratched with thousands of tallies, one per year taken, with village names. The
  ghost **Tomas Reeve** stands by it.
- Loot: 3 chests (tier 1, 2, 2); one "founder's coin" (lore item) in the Candlewraith room.
- Secret: a lit candle on the Tally Wall; snuff it (interact) and a section of wall slides back to reveal a vault with a tier-3 chest.
  The candle respawns a Candlewraith when snuffed (fight it).

### Floor 3 - The Hearth
Mood: still, almost beautiful. A great round hall, warm gold light, the Emberdeep itself glowing behind a sealed iron door.
- Layout: an antechamber with two Candlewraiths and two Slag Crawlers, then a round boss hall. The Hearthkeeper stands at the door.
- Set pieces: the **Ledger**, a stone lectern holding Vane's book of years; the **furnace door**, fused shut, visible behind him.
- Loot: the reward chest (section 6) appears after the boss; one tier-2 chest in the antechamber.
- Secret: **the Ash Door.** Behind the Ledger lectern, one stretch of the hall's charcoal wall is not warm like the rest. Interact with the
  lectern (or hit that wall) after the antechamber is cleared to turn the ledger to its first page; the wall slides back to a tiny
  room, the founders' tithe room, with a tier-3 chest and a readable line: "First frost. Forty-one years paid." The chest holds a
  second lore item (the founders' tithe-bowl) and does not depend on the boss. Its existence is hinted by a faint draught of cold
  air and a gap in the ash on the floor in front of the lectern.
- Exit: a return stair at the antechamber (`map.exit`). The furnace door stays closed (see teaser).

## 3. Monsters

All are hostile and use the existing enemy framework; new ids are `sootwretch`, `embermoth`, `slagcrawler`, `candlewraith`,
`hearthkeeper`. `min` (first floor available) is the area floor number. Names avoid the existing Cinder Demon.

### Soot Wretch (`sootwretch`)
- Role: slow melee bruiser / area denial.
- Behaviour: shuffles toward the player; on each swing it leaves an **ash puddle** that lingers 6s and damages (about 2 per tick) and slows
  anything standing in it. Takes a short stagger on hit.
- Stats: hp 40-48, spd 38-46, dmg 9-11, radius 11, xp 14-18.
- Weakness: slow; burning does nothing, but a hard knockback sends it out of its own puddles.
- Lore: "A villager the furnace kept warm until nothing was left but soot, still walking home."

### Ember Moth (`embermoth`)
- Role: fast flier, swarm pressure.
- Behaviour: flutters erratically toward the player in groups of 2-4; on death it bursts into a small blast (radius ~40) that hurts
  the player and other monsters alike.
- Stats: hp 6-10, spd 105-120, dmg 4-5 (blast 6), radius 6, xp 3-5.
- Weakness: very fragile; kill at range so the blast misses you.
- Lore: "They are drawn to the one lamp still lit in the valley, and the lamp is not a lamp."

### Slag Crawler (`slagcrawler`)
- Role: armoured ranged artillery.
- Behaviour: low, wide crawler that creeps toward the player and spits a **molten glob** (slow arcing projectile) every ~2s from range,
  leaving a short burn patch. Front armour: reduces damage from normal hits.
- Stats: hp 48-58, spd 44-52, dmg 10-12 (glob 8), radius 12, xp 20-26, `armored`.
- Weakness: weak to burst / charged spells and attacks to the exposed back; kiting around it is safe once its glob lands.
- Lore: "Cooled slag that remembers being a coin purse, a cooking pot, a ring."

### Candlewraith (`candlewraith`)
- Role: support healer that makes the other monsters tougher.
- Behaviour: a pale ghost carrying a lit candle. While the candle burns it **heals nearby monsters** (about 3 hp per second, radius ~120)
  and floats away from the player. Killing it, or hitting the candle (a small hitbox above it), snuffs the candle and ends the healing.
- Stats: hp 16-22, spd 52-60, dmg 6-7, radius 9, xp 18-24, `ghost`.
- Weakness: fragile; kill it first. Ranged attacks that hit the candle snuff it.
- Lore: "She lit a candle for every year she was owed. She is still counting."

### The Hearthkeeper (`hearthkeeper`) - boss
- Who: Warden Halric Vane, bound to the furnace door.
- Look: a tall figure of black iron and ash, a coal-red cavity for a chest, a ledger chained to one hand.
- Stats: hp 380-460, spd 40-48, dmg 14-16 (melee), radius 20, xp 220-260. Gets a boss bar like existing bosses (`bossbattle` music).
- Phase 1 (100-60% hp), **Ember Ring**: fires a ring of 10-12 ember shots that expand outward, with a gap that rotates each cast.
  Between casts, a heavy **ledger slam** melee (telegraphed circle, like the Drake's `telRad`).
- Phase 2 (60-30%), adds **the Charge**: a telegraphed line dash that leaves a trail of burning ash, and summons 3 Ember Moths
  every 12s.
- Phase 3 (below 30%), **Collection**: the ledger opens and the hall's floor fills with slow, spreading ember seams that damage on
  contact; the Hearthkeeper stops moving and fires rings faster. The player must stand on the safe gaps.
- Weakness: his chest cavity (the "coal") is exposed for 2s after each charge; hits to it take bonus damage. Candles and moths are
  not needed.
- Death: he kneels, the ledger burns, and a last line plays (section 4). The furnace door does NOT open.
- Lore: "He is not guarding the furnace. He is keeping the village's accounts open, so that someday it might be paid in full."

## 4. Ghosts and NPCs (dialogue in the style of `village.js`)

Same format as `GHOSTS` in `village.js`: `{ name, lines: [...] }`. Ghosts are friendly, fade in and out, and are spoken to with F.

```
{ name: 'Sister Imre', lines: [
  'I climbed to the belfry to still the bell, but it tolled three times with no hand on the rope, as Brother Aldous says. Mine were already warm.' ] }
{ name: 'Tomas Reeve', lines: [
  'Count the marks, traveller. Every one is a year. I scratched my own last, and it did not feel like a choice.' ] }
{ name: 'The Ledger-Clerk', lines: [
  'Halric said the books must balance. They never did, so he kept adding the next generation to the page.' ] }
{ name: 'Little Wren', lines: [
  'It is so warm here. Is it summer? I thought it was always winter.' ] }
{ name: 'Brother Aldous (below)', lines: [
  'Halric was a good man once. The furnace makes good men reasonable.' ] }
{ name: 'The Widow Verrin (after the quest hook)', lines: [
  'So you have been below. Halric Vane kept the ledger and the keys. If you put him down, tell him the debt is a lie.' ] }
{ name: 'Halric Vane (boss death speech)', lines: [
  'The book... does not balance. It never... balanced.' ] }
{ name: 'A freed ghost (floor 3, after the boss)', lines: [
  'The ash has stopped falling. Listen. It is cold. I had forgotten cold.' ] }
```

That is 8 spoken lines in total (six ghosts and NPCs at one line each, plus the boss death speech and the closing ghost). Canon note on
the bell: the three tolls were unassisted, exactly as Brother Aldous says in `village.js`. Sister Imre went up to stop it and failed; she
did not ring it.

## 5. Quest hook (for `questnav.js`)

The existing quest is `chapel` ("Beneath the Chapel") with the hint "Find the trapdoor and go down into the cellar." Extend it into a
chain with the same shape as the existing `{ title, lines, open, closed }` entries:

```
chapel (existing, kept): title 'BENEATH THE CHAPEL', closed: 'Find the trapdoor and go down into the cellar.'
cinderwake (new): { title: 'THE UNPAID DEBT',
  lines: ['The cellar vault hides a stair of fused glass.',
          'Below the chapel a furnace still burns, and its keeper',
          'still counts the years the village owes.',
          '',
          'Put the Hearthkeeper down and close the book.'],
  open: 'Descend the glass stair in the vault and defeat the Hearthkeeper.',
  closed: 'Loot the cellar vault to find the way down.' }
```

Marker: points at the cellar vault until both chests are opened, then at the revealed stair, then at the area exit once the boss is dead. Quest completes when the Hearthkeeper dies.

## 6. Reward

- **Heartcoal** (unique): a still-warm coal from the Hearthkeeper. Passive: a small bonus to fire-type spells and a slow health
  regeneration while standing still. Drawn as an ember-orange gem; name and tooltip: "Warm. It should not be."
- Plus a large xp / loot drop (a tier-3 chest on floor 3), and the quest completion toast.
- Lore keepsake: **Vane's Ledger Page** (no stat effect), a readable item: "Balance carried forward: all of them."

## 7. Where the story goes next (teaser)

With the Hearthkeeper dead the ash stops falling, but the furnace door stays closed, and from behind it the player can hear a very
slow, deliberate knocking, answered from far below. The Widow Verrin: "The Emberdeep was never the bottom. Halric's furnace was only the
first door. Whatever it was warming, it is awake." The last line of the area: a deeper stair, sealed, with the same fused glass as the
first and a faint cold draught coming up. The next area (not designed here) is the thing the furnace was built to warm.

## 8. Implementation notes (for other tasks)

- Area ids in the one const table of `cinderwake.js`: `sootwretch`, `embermoth`, `slagcrawler`, `candlewraith`, `hearthkeeper`.
- Spawn lists per floor: F1 `[moth, wretch]`, F2 `[crawler, wretch, moth, candlewraith]`, F3 antechamber `[candlewraith, crawler]`.
- Keep the village's existing ghost dialogue untouched; the new Widow Verrin line is a later-state replacement, not an edit.
- Music: reuse an existing track (for example `cave` or `ghosttown2`), boss uses `bossbattle`. No new audio assets are required.
