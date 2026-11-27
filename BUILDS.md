# Emberdeep build log

Every build gets a number `YYYYMMDD.N` (N counts builds made that day). The newest build is at the top and must match
`CC.VERSION.build` in `version.js` (shown at the bottom of the title screen). Add a line here whenever you change the game.

| Build | Version | Notes |
|---|---|---|
| 20261126.29 | 0.3.0 | Menu leather grain now uses a cheap plain-alpha texture (no overlay blend or clipping), speeding up every menu. |
| 20261126.28 | 0.3.0 | Item pickup sound 70% quieter; night songs 50% louder; a much lighter inventory screen (no canvas blur, flat cells, the hero panel painted once) with bigger tap areas on items; the night card waits for the area title; "It's coming..." in red after a stalker spawns. |
| 20261126.27 | 0.3.0 | Night stalkers are far stronger and scale harder with your level; no pointer arrow to them; the night light is 30% smaller; a spawn sound; the night songs skip their long cricket build-up. |
| 20261126.26 | 0.3.0 | Three feral growl sounds for the night stalkers (as each one appears and as each attack begins). |
| 20261126.25 | 0.3.0 | The single Icicle Cannon shard auto-aims: a boss in reach first, otherwise the closest monster. |
| 20261126.24 | 0.3.0 | Night stalkers are 30% larger; as they are hurt, limbs, heads and horns tear off (flying away) and the sprite shows the ragged bleeding gap while they keep attacking. |
| 20261126.23 | 0.3.0 | No more glowing red eyes painted on ordinary monsters at night; they keep their normal sprites. |
| 20261126.22 | 0.3.0 | The first night stalker now comes out of the dark about 12 seconds after night falls (was up to 40). |
| 20261126.21 | 0.3.0 | The Rocky Pass gets its own song (Mountain Pass). Two night songs (Crickets After Dark, Midnight Pixel Path) play back and forth under the night sky. |
| 20261126.20 | 0.3.0 | Phone back button steps back through menus (title pages, character window, pause menu, then 'Really save and exit?') instead of leaving the page; test mode gets Night/Day, freeze time and night-stalker spawning; the game loads at 92% zoom; a modest lit circle at night. |
| 20261126.19 | 0.3.0 | Night light reworked as ambient light, like a torch in a dark room: the dark is cut away around the hero in a soft falloff with a wide, even wash of class-coloured light (no ring, no bright blob on the sprite). |
| 20261126.18 | 0.3.0 | The hero's night light is now a class-coloured circle lying on the ground under every sprite; nothing glows over the player any more. |
| 20261126.17 | 0.3.0 | A creepy 'Night Falls. Evil walks.' title fades in (shivering blood-red letters) when night begins, then fades away. |
| 20261126.16 | 0.3.0 | Night: 40% fewer fireflies; a half-visible fog of war beyond your light (lighter, colder dark that slowly breathes) with pale eyes that open and close out in the gloom. |
| 20261126.16 | 0.3.0 | Night: 40% fewer fireflies; a half-visible fog of war beyond your light (lighter, colder dark that slowly breathes) with pale eyes that open and close out in the gloom. |
| 20261126.15 | 0.3.0 | Night Stalkers drawn at ordinary-monster scale (about 50-76 px, reaches and dashes scaled to match) and their sprite sheets halved in size (4.5 MB to 2.1 MB). |
| 20261126.14 | 0.3.0 | The nine Night Stalkers (Grinning Mask, Puppet Butcher, Scythe Weaver, Veiled Widow, Wailing Chorus, Skull Bloom, Cinderhound, Gloom Crawler, Gravemaw) hunt you out of the dark at night with telegraphed choreographed attacks, strong stats and boss-grade loot; class-coloured night light around each hero (swordsman blue/white, necromancer green/white, thief red/white, wizard deep blue/white). Sprite sheets in assets/night, originals in art_source/night_monsters. |
| 20261126.13 | 0.3.0 | Endless modes (Survival, Catacombs, Town Defense) play Warfront Ascension and Struggle for the Throne back and forth on a loop. |
| 20261126.12 | 0.3.0 | Fix: the furnace door to the Emberdeep was placed inside the hall's wall and could not be reached; it now stands on open floor in front of the furnace (tested on many seeds). |
| 20261126.11 | 0.3.0 | Every menu now uses the iron & leather design: the character window (all tabs, with ribbon titles), inventory, skills, quests, map, stats, settings, party, buttons, dialogs, the level-up perk panel and the title menu. |
| 20261126.10 | 0.3.0 | Settings window redrawn in the iron & leather style (riveted iron frame, stitched leather, ribbon title, red close button, ON pills, chevron steppers, gold sliders, icons) with the same options; Emberdeep chest placement fix. |
| 20261126.9 | 0.3.0 | The Emberdeep: the Hearthkeeper's furnace door now opens onto the earth's boiling, lava-filled core: the Boiling Descent (lava pools, geysers, stronger Cinderwake creatures) and the Core, a lava-ringed island where the Emberheart boss (three phases) holds the curse. Breaking it lifts the curse, drops a legendary, and updates Verrin and the quest log (The Source of the Curse). |
| 20261126.8 | 0.3.0 | Day/night cycle (10 min each, sleep in the tent to skip the night); night monsters +15% health +20% damage with scarier glowing eyes (bats red, skeletons purple) and Dire Wolves become Werewolves; fireflies, pond frogs and wind-swept plains grass; the Rocky Pass is now a long mountain maze with dead ends and a nature puzzle (spring, elder oak, sunbeam mirrors, sunpetal, thornwall) guarding the village; NPC speech paints above the controls and a tap moves it on; thief +30% health +25% damage. |
| 20261126.7 | 0.3.0 | Full pack: a pickup that beats something of its kind in the pack now replaces (and sells) the weakest such item instead of being sold itself; applies to ground pickups, auto-equip swaps and co-op pickups. |
| 20261126.6 | 0.3.0 | Darker gritty marble stone UI; Settings now scrolls inside its modal (wheel or drag); Cinderwake floors added to the test-mode world map; perfect shot glow and explosion follow the real camera (zoom, shake, cutscene); village ghost holes land where the shot passed through the body. |
| 20261126.5 | 0.3.0 | The Tablet of Ascension: the Skills screen is redrawn as a carved stone tablet with three tablets (I Passives, II Abilities, III Charges), line-art runes, Roman numerals, seals, and a stone-styled character window. |
| 20261126.4 | 0.3.0 | The Cinderwake is playable: glass stair in the cellar vault (both vault chests), three floors with their monsters, secrets (brazier, candle, Ash Door), lore pickups, the Hearthkeeper boss with bar and music, the Heartcoal, quest The Unpaid Debt, Widow Verrin's new lines, save support. |
| 20261126.3 | 0.3.0 | Fuseblade Gambit moved to Venom Flask's hold (replacing Toxic Deluge); Shadow Step's hold is Assassination Step again. |
| 20261126.2 | 0.3.0 | Perfect shot fixes: the golden orb now flies slower and homes in on a locked target so it always hits; explosion is anchored on the monster and follows it, and is mapped correctly during the kill cutscene zoom. |
| 20261126.1 | 0.3.0 | First numbered build. Perfect shot is now a golden swirling projectile with dimmed surroundings and an animated golden explosion; independent tap/charge cooldowns; Icicle Blast cone; Fuseblade Gambit; flamethrower hold restored; 20 paired tap/hold spells; multiplayer network fixes; title menu restructure; Endless modes (Survival, Catacombs, Town Defense). |
