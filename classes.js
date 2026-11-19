/* Emberdeep classes: Swordsman, Wizard, Necromancer, Thief.
 *
 * XP curve (documented): xpToNext(level) = round(40 * level^1.7)
 *   -> 40, 130, 259, 422, 617, 841, 1093, 1372, 1676 for levels 1..9. Level 10 needs their sum (6450 xp).
 * Spells: every class starts with spell 1 only; spell 2 (E) unlocks at level 4 (SPELL2_LEVEL). The HUD slot shows
 *   'Lv 4' until then (spellNames is the HUD label list; spells holds the real names).
 * Start HP (level 1): swordsman 100, wizard 55, necromancer 65, thief 60 (was 140, 80, 95, 90).
 * Perk choice (pick 1 of 3) opens at every level divisible by 3 (3, 6, 9, ...). Each class has 8 perks.
 *
 * API (all on CC.Classes):
 *   create(classId) -> player; update(dt[, {noCombat:true}]); draw(ctx,cam); drawPlayer(ctx,cam)
 *   gainXp(n); damage(player, amount, src) -> dealt; heal(player, n); applyItemStats(player)
 *   choosePerk(index[, player]); hitEnemy(enemy, dmg, type, opts); minions; projectiles; xpToNext(level)
 * Player fields: x,y,r,hp,maxHp,mana,maxMana,xp,xpNext,level,stats,equipment,cd,cdMax,cost,spellNames,
 *   classId,perkOpen,perkChoices,perkQueue. Items: equipment[slot].stats may hold
 *   {hp,mana,dmg,armor,speed(fraction),crit(fraction),cdr(fraction),lifesteal(fraction),luck,regen}.
 * Enemies (CC.Enemies.list, if present): {x,y,r,hp,dead?}. This module sets enemy.stunT, enemy.slowT/slowMul and
 *   knocks enemies back; Enemies should honour them, and should NOT award xp/kills for deaths caused here
 *   (onKill awards xp = enemy.xp||enemy.xpValue||5, calls CC.addKill, and sets enemy._xpGiven).
 * Enemies/hazards hurt the player with CC.Classes.damage(player, amount). Minions are in CC.Classes.minions.
 * Camera: draws at (worldX - cam.x, worldY - cam.y). Town can call update(dt,{noCombat:true}) + drawPlayer.
 */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var CC = root.CC = root.CC || {};

  var cur = null, minions = [], projs = [], fxs = [], lastMap = null, noManaT = 0;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function alive(e) { return !!e && e.hp > 0 && !e.dead; }
  function foes() { var l = CC.Enemies && CC.Enemies.list; return Array.isArray(l) ? l : []; }
  function fx() { return CC.fx || null; }
  function hero() {
    var s = CC.state;
    return (s && s.player && s.player.isHero) ? s.player : cur;
  }
  function fxText(x, y, s, c, size) { var f = fx(); if (f && f.text) f.text(x, y, s, c, size); }
  function fxBurst(x, y, c, n, sp) { var f = fx(); if (f && f.burst) f.burst(x, y, c, n, sp); }
  function fxBlood(x, y, n, dx, dy) { var f = fx(); if (f && f.blood) f.blood(x, y, n, dx, dy); }
  function fxFlash(c, s) { var f = fx(); if (f && f.flash) f.flash(c, s); }
  function fxShake(v) { var f = fx(); if (f && f.shake) f.shake(v); }
  function fxStop(v) { var f = fx(); if (f && f.hitStop) f.hitStop(v); }

  /* ---------- data ---------- */
  var DEFS = {
    swordsman: { name: 'Swordsman', color: '#e8a23a', hp: 100, hpL: 16, mana: 40, manaL: 3, dmg: 12, dmgL: 2, speed: 92, armor: 2, crit: 0.05,
      spells: ['Bash', 'Whirl'], cost: { spell1: 8, spell2: 18 }, cdMax: { attack: 0.32, spell1: 4, spell2: 7, dash: 2.2 } },
    wizard: { name: 'Wizard', color: '#5cc8ff', hp: 55, hpL: 8, mana: 120, manaL: 10, dmg: 10, dmgL: 2.2, speed: 88, armor: 0, crit: 0.08,
      spells: ['Fire', 'Frost'], cost: { spell1: 20, spell2: 25 }, cdMax: { attack: 0.42, spell1: 2.5, spell2: 7, dash: 2.5 } },
    necromancer: { name: 'Necromancer', color: '#a46bff', hp: 65, hpL: 10, mana: 100, manaL: 8, dmg: 8, dmgL: 1.65, speed: 86, armor: 1, crit: 0.05,
      spells: ['Raise', 'Drain'], cost: { spell1: 25, spell2: 15 }, cdMax: { attack: 0.45, spell1: 5, spell2: 4, dash: 2.5 } },
    thief: { name: 'Thief', color: '#7de0b8', hp: 60, hpL: 9, mana: 70, manaL: 5, dmg: 9, dmgL: 1.9, speed: 108, armor: 1, crit: 0.15,
      spells: ['Knives', 'Smoke'], cost: { spell1: 12, spell2: 20 }, cdMax: { attack: 0.24, spell1: 2.2, spell2: 8, dash: 1.6 } }
  };

  function newMods() {
    return { dmgPct: 0, hpPct: 0, manaPct: 0, speedPct: 0, cdrPct: 0, critPct: 0, critDmg: 0, lifesteal: 0, regenHp: 0, regenMana: 0, armor: 0, xpPct: 0, aoePct: 0, spell1Pct: 0, spell2Pct: 0, spellCdr: 0 };
  }
  // spell power from the skill tree: 1 + the class's Mastery bonus for spell 1 or 2
  function sm(p, n) { return 1 + (p.mods['spell' + n + 'Pct'] || 0); }
  function flag(p, k) { p.flags[k] = (p.flags[k] || 0) + 1; }
  function perk(id, name, desc, fn) { return { id: id, name: name, desc: desc, apply: fn }; }

  var PERKS = {
    swordsman: [
      perk('iron', 'Iron Skin', '+3 armor', function (p) { p.mods.armor += 3; }),
      perk('berserk', 'Berserker', '+15% damage', function (p) { p.mods.dmgPct += 0.15; }),
      perk('vamp', 'Vampiric Edge', 'Heal 6% of damage dealt', function (p) { p.mods.lifesteal += 0.06; }),
      perk('heavy', 'Heavy Blows', 'Combo finisher hits +50% harder', function (p) { flag(p, 'heavy'); }),
      perk('fleet', 'Fleet Footed', '+10% move speed', function (p) { p.mods.speedPct += 0.1; }),
      perk('wide', 'Cyclone', 'Whirlwind radius +30%', function (p) { flag(p, 'wide'); }),
      perk('wind', 'Second Wind', 'Regenerate 1.5 HP/s', function (p) { p.mods.regenHp += 1.5; }),
      perk('stun', 'Skull Rattler', 'Shield Bash stuns 0.6s longer', function (p) { flag(p, 'stun'); })
    ],
    wizard: [
      perk('surge', 'Arcane Surge', '+15% damage', function (p) { p.mods.dmgPct += 0.15; }),
      perk('mana', 'Deep Mana', '+25% max mana', function (p) { p.mods.manaPct += 0.25; }),
      perk('quick', 'Quick Cast', '-10% cooldowns', function (p) { p.mods.cdrPct += 0.1; }),
      perk('inferno', 'Inferno', 'Fireball explosion +30% radius', function (p) { flag(p, 'inferno'); }),
      perk('shatter', 'Shatter', '+10% crit chance', function (p) { p.mods.critPct += 0.1; }),
      perk('frostbite', 'Frostbite', 'Frost Nova slows longer and reaches farther', function (p) { flag(p, 'frostbite'); p.mods.aoePct += 0.1; }),
      perk('siphon', 'Mana Siphon', '+2 mana regen/s', function (p) { p.mods.regenMana += 2; }),
      perk('twin', 'Twin Bolt', 'Arcane bolt fires two missiles', function (p) { flag(p, 'twin'); })
    ],
    necromancer: [
      perk('legion', 'Bone Legion', '+2 skeleton cap', function (p) { flag(p, 'legion'); }),
      perk('sturdy', 'Sturdy Bones', 'Skeletons +50% health', function (p) { flag(p, 'sturdy'); }),
      perk('vampirism', 'Vampirism', 'Life Drain heals fully', function (p) { flag(p, 'vampirism'); }),
      perk('feast', 'Soul Feast', 'Kills restore more health and mana', function (p) { flag(p, 'feast'); }),
      perk('deadly', 'Deadly Minions', 'Skeletons +50% damage', function (p) { flag(p, 'deadly'); }),
      perk('vigor', 'Dark Vigor', '+15% max health', function (p) { p.mods.hpPct += 0.15; }),
      perk('volley', 'Shard Volley', 'Bone shards fire in a 3-fan', function (p) { flag(p, 'volley'); }),
      perk('linger', 'Lingering Dead', 'Skeletons last 50% longer', function (p) { flag(p, 'linger'); })
    ],
    thief: [
      perk('keen', 'Keen Edge', '+10% crit chance', function (p) { p.mods.critPct += 0.1; }),
      perk('assassin', 'Assassin', '+40% crit damage', function (p) { p.mods.critDmg += 0.4; }),
      perk('venom', 'Venom Coat', 'Hits poison enemies for 3s', function (p) { flag(p, 'venom'); }),
      perk('evasion', 'Evasion', '15% chance to dodge any hit', function (p) { flag(p, 'evade'); }),
      perk('reset', 'Shadow Reset', 'Kills reset your dash', function (p) { flag(p, 'dashreset'); }),
      perk('cutthroat', 'Cutthroat', 'Backstabs deal much more damage', function (p) { flag(p, 'cutthroat'); }),
      perk('swift', 'Light Feet', '+12% move speed', function (p) { p.mods.speedPct += 0.12; }),
      perk('storm', 'Knife Storm', 'Throwing knives fan out to 5', function (p) { flag(p, 'storm'); })
    ]
  };

  /* ---------- stats ---------- */
  function xpToNext(level) { return Math.round(40 * Math.pow(level, 1.7)); }

  // spell 2 (the E key) is locked until this level; every class starts with spell 1 only
  var SPELL2_LEVEL = 4;
  // spellNames is what the HUD shows; p.spells keeps the real names
  function syncSpells(p) { p.spellNames = [p.spells[0], p.level >= SPELL2_LEVEL ? p.spells[1] : 'Lv ' + SPELL2_LEVEL]; }

  function itemSum(p) {
    var s = { hp: 0, mana: 0, dmg: 0, armor: 0, speed: 0, crit: 0, critDmg: 0, cdr: 0, lifesteal: 0, luck: 0, regen: 0 };
    var eq = p.equipment || {};
    for (var slot in eq) {
      var it = eq[slot];
      if (it && it.stats) for (var k in s) s[k] += +it.stats[k] || 0;
    }
    // loot.js stores these four as whole percents (5 = 5%, see LABEL 'Crit %'); stats here are fractions
    s.speed /= 100; s.crit /= 100; s.cdr /= 100; s.lifesteal /= 100;
    return s;
  }

  function recalc(p) {
    var d = DEFS[p.classId], m = p.mods, it = itemSum(p), L = p.level - 1;
    var oldHp = p.maxHp || 0, oldMana = p.maxMana || 0;
    p.maxHp = Math.round((d.hp + d.hpL * L + it.hp) * (1 + m.hpPct));
    p.maxMana = Math.round((d.mana + d.manaL * L + it.mana) * (1 + m.manaPct));
    p.stats = {
      dmg: (d.dmg + d.dmgL * L + it.dmg) * (1 + m.dmgPct),
      armor: d.armor + m.armor + it.armor,
      crit: Math.min(0.75, d.crit + m.critPct + it.crit),
      critDmg: 1.75 + m.critDmg + it.critDmg,
      speed: d.speed * (1 + m.speedPct + it.speed),
      luck: it.luck,
      cdr: Math.min(0.5, m.cdrPct + it.cdr),
      lifesteal: m.lifesteal + it.lifesteal,
      regen: m.regenHp + it.regen,
      manaRegen: 2 + m.regenMana
    };
    p.speed = p.stats.speed;
    if (p.maxHp > oldHp) p.hp += p.maxHp - oldHp;
    if (p.maxMana > oldMana) p.mana += p.maxMana - oldMana;
    p.hp = Math.min(p.hp, p.maxHp); p.mana = Math.min(p.mana, p.maxMana);
    for (var c in d.cdMax) p.cdMax[c] = d.cdMax[c] * (1 - p.stats.cdr) * ((c === 'spell1' || c === 'spell2') ? 1 - Math.min(0.5, m.spellCdr || 0) : 1);
  }

  function create(classId) {
    var d = DEFS[classId] ? DEFS[classId] : DEFS.swordsman;
    var id = DEFS[classId] ? classId : 'swordsman';
    var p = {
      isHero: true, classId: id, name: d.name, color: d.color, x: 0, y: 0, r: 8,
      level: 1, xp: 0, xpNext: xpToNext(1), hp: 0, maxHp: 0, mana: 0, maxMana: 0, stats: {},
      equipment: { weapon: null, armor: null, helm: null, gloves: null, boots: null, ring: null, amulet: null, trinket: null },
      mods: newMods(), flags: {}, perks: [], perkQueue: 0, perkOpen: false, perkChoices: null,
      cd: { attack: 0, spell1: 0, spell2: 0, dash: 0 }, cdMax: {}, cost: { spell1: d.cost.spell1, spell2: d.cost.spell2 },
      spells: d.spells.slice(), spellNames: [], face: 1, aimX: 1, aimY: 0, moving: false, anim: 0, atkAnim: 0, swingAng: 0, castFlash: 0,
      invuln: 0, iframes: 0, ambushT: 0, dashT: 0, dashVX: 0, dashVY: 0, dashHit: null, whirlT: 0, whirlTick: 0, combo: 0, comboT: 0, souls: 0, speed: d.speed
    };
    recalc(p);
    syncSpells(p);
    p.hp = p.maxHp; p.mana = p.maxMana;
    cur = p;
    minions.length = 0; projs.length = 0; fxs.length = 0;
    return p;
  }

  /* ---------- levelling & perks ---------- */
  function gainXp(n, p) {
    p = p || hero();
    if (!p || !(n > 0)) return;
    p.xp += n * (1 + p.mods.xpPct);
    while (p.xp >= p.xpNext && p.level < 50) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = xpToNext(p.level);
      recalc(p);
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
      p.mana = p.maxMana;
      syncSpells(p);
      fxText(p.x, p.y - 20, 'LEVEL UP! ' + p.level, '#ffe08a', 14);
      if (p.level === SPELL2_LEVEL) fxText(p.x, p.y - 34, p.spells[1] + ' unlocked!', '#9fe3ff', 12);
      if (p.level === 10 || p.level === 20 || p.level === 30) { // a new charge attack, equipped at once (change it on the skill screen)
        var ST = CC.SkillTree, cs = ST && ST.chargeSkills(p.classId)[p.level / 10];
        if (cs) { p.chargeSel = p.level / 10; fxText(p.x, p.y - 48, 'NEW CHARGE: ' + cs.name, '#ffd36b', 12); }
      }
      fxBurst(p.x, p.y, '#ffe08a', 24, 110);
      addFx({ kind: 'ring', x: p.x, y: p.y, r: 36, t: 0.5, max: 0.5, col: '#ffe08a' });
      if (p.level % 3 === 0) { p.perkQueue++; if (!p.perkOpen) openPerk(p); }
    }
    if (p.level >= 50) p.xp = Math.min(p.xp, p.xpNext - 1);
    // Levelling up no longer throws the skill tree open: the LEVEL UP button in the HUD (main.js) shows the unspent points.
  }

  function openPerk(p) {
    var pool = PERKS[p.classId].filter(function (k) { return p.perks.indexOf(k.id) < 0; });
    for (var i = pool.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    p.perkChoices = pool.slice(0, 3);
    p.perkOpen = p.perkChoices.length > 0;
    if (!p.perkOpen) p.perkQueue = 0;
  }

  function choosePerk(i, p) {
    p = p || hero();
    if (!p || !p.perkOpen || !p.perkChoices || !p.perkChoices[i]) return false;
    var pk = p.perkChoices[i];
    pk.apply(p);
    p.perks.push(pk.id);
    recalc(p);
    p.perkOpen = false; p.perkChoices = null;
    p.perkQueue = Math.max(0, p.perkQueue - 1);
    fxText(p.x, p.y - 20, pk.name + '!', '#9be36b', 12);
    if (p.perkQueue > 0) openPerk(p);
    return true;
  }

  function applyItemStats(p) { p = p || hero(); if (!p) return null; recalc(p); return p.stats; }

  /* ---------- damage helpers ---------- */
  function heal(p, n) {
    p = p || hero();
    if (!p || !(n > 0)) return 0;
    var before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + n);
    var got = p.hp - before;
    if (got >= 1) fxText(p.x, p.y - 14, '+' + Math.round(got), '#7dff9a', 10);
    return got;
  }

  function damage(p, amount, src) {
    p = p || hero();
    // Some custom miniboss AI calls Classes.damage directly. Forward guest
    // damage to their device rather than altering the host's proxy object.
    if(CC.Multiplayer&&CC.Multiplayer.isHost&&CC.Multiplayer.isHost()&&
       p===CC.Multiplayer.remote&&amount>0){
      if(p.invuln>0)return 0;
      p.invuln=.35;CC.Multiplayer.onGuestDamage(amount);return amount;
    }
    if (!p || p.hp <= 0 || p.invuln > 0 || p.iframes > 0 || !(amount > 0)) return 0;
    if (p.pw && p.pw.shield > 0) return 0; // Town Defense shield power-up
    if (p.flags && p.flags.evade && Math.random() < 0.15) {
      p.invuln = 0.2;
      fxText(p.x, p.y - 14, 'Dodge', '#7de0b8', 11);
      return 0;
    }
    var a = (p.stats ? p.stats.armor : 0) * (p.bearRoarT>0?.7:1);
    var dealt = Math.max(1, Math.round(amount * (1 - a / (a + 20))));
    p.hp = Math.max(0, p.hp - dealt);
    p.invuln = 0.35;
    fxText(p.x, p.y - 14, '-' + dealt, '#ff6b6b', 12);
    fxBurst(p.x, p.y, '#ff4d5e', 8, 70);
    fxBlood(p.x, p.y, 6 + Math.min(10, Math.round(dealt / p.maxHp * 40)));
    if (dealt > p.maxHp * 0.2) fxFlash('#ff2030', 0.14);
    fxShake(dealt > p.maxHp * 0.2 ? 6 : 3);
    fxStop(0.04);
    return dealt;
  }

  function onKill(e) {
    var p = hero();
    if (!p || e._xpGiven) return;
    e._xpGiven = true;
    fxBlood(e.x, e.y, 16 + Math.min(10, Math.round((e.r || 8) / 2)));
    fxBurst(e.x, e.y, '#d8d0b8', 5, 90); // bone chips
    fxShake(1.5);
    gainXp(e.xp || e.xpValue || 5, p);
    if (typeof CC.addKill === 'function') CC.addKill();
    if (p.flags.dashreset && p.cd.dash > 0) {
      p.cd.dash = 0;
      addFx({ kind: 'ring', x: p.x, y: p.y, r: 18, t: 0.25, max: 0.25, col: '#7de0b8' });
    }
    if (p.classId === 'necromancer') {
      var f = p.flags.feast || 0;
      heal(p, 3 + 3 * f);
      p.mana = Math.min(p.maxMana, p.mana + 5 + 5 * f);
      p.souls++;
      addFx({ kind: 'puff', x: e.x, y: e.y, r: 10, t: 0.4, max: 0.4, col: '#7dff9a' });
      if (p.souls >= 5) {
        p.souls = 0;
        raise(p, 1, true);
        fxText(p.x, p.y - 24, 'SOUL HARVEST', '#7dff9a', 11);
      }
    }
  }

  // One critical impact can catch additional nearby monsters. Targets already
  // struck by the same sword swipe are excluded from splash so they aren't
  // damaged twice. Splash never crits or recursively chains.
  function critRadius(classId) {
    return classId === 'swordsman' ? 42 : classId === 'thief' ? 43 :
      classId === 'wizard' ? 50 : 49;
  }
  function criticalGroup(p, e, dmg, type, opts) {
    var radius = critRadius(p.classId), own = opts.attackGroup,
        list = foes().slice(), protectedTargets = own && own.targets || [],
        already = own && own.splashed || [], participants = [e], j, other;
    for (j = 0; j < protectedTargets.length; j++) {
      other = protectedTargets[j];
      if (other !== e && other && Math.hypot(other.x-e.x,other.y-e.y) <= radius+(other.r||8))
        participants.push(other);
    }
    for(j=0;j<list.length;j++) {
      other=list[j];
      if (!alive(other) || other===e ||
          protectedTargets.indexOf(other)!==-1 || already.indexOf(other)!==-1) continue;
      if(Math.hypot(other.x-e.x,other.y-e.y) > radius+(other.r||8)) continue;
      // A wall shouldn't let the shock pass into a disconnected room.
      var D=CC.Dungeon,blocked=false;
      if(D&&D.isSolid)for(var step=1;step<5;step++){
        var frac=step/5;
        if(D.isSolid(e.x+(other.x-e.x)*frac,e.y+(other.y-e.y)*frac)){blocked=true;break;}
      }
      if(blocked)continue;
      if (own) own.splashed.push(other);
      participants.push(other);
      hitEnemy(other, Math.max(1,Math.round(dmg*.38)),type,
        {noCrit:true,basicAttack:true,attackKind:opts.attackKind,
         angle:opts.angle, splash:true});
    }
    return participants;
  }

  // EXPLODING SHOTS power-up: splash around the struck monster (shots and slashes alike)
  function explodeAt(e, dmg) {
    var l = foes(), n = 0, i, o, r = 46;
    for (i = 0; i < l.length && n < 12; i++) {
      o = l[i]; if (o === e || !alive(o)) continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) > r + (o.r || 8)) continue;
      n++; hitEnemy(o, Math.max(1, Math.round(dmg * 0.55)), 'fire', { noCrit: true, splash: true });
    }
    addFx({ kind: 'ring', x: e.x, y: e.y, r: r, t: 0.28, max: 0.28, col: '#ff9a3a' });
    fxBurst(e.x, e.y, '#ffb050', 8, 100);
  }
  var KILL_SHOT_CHANCE = 0.2; // a crit on a monster at 1/3 health or less: 1 in 5 is a perfect critical
  function hitEnemy(e, dmg, type, opts) {
    var p = hero();
    if (!alive(e)) return 0;
    opts = opts || {};
    var crit = !opts.noCrit && p && (typeof opts.preRolledCrit === 'boolean' ? opts.preRolledCrit : Math.random() < p.stats.crit);
    var back = false;
    if (p && p.classId === 'thief' && !opts.minion && type !== 'poison' && type !== 'fire') {
      var behind = typeof e.face === 'number' && e.face !== 0 && Math.abs(p.x - e.x) > 2 && (p.x - e.x) * e.face < 0;
      back = behind || p.ambushT > 0 || e.stunT > 0 || e.slowT > 0;
      if (back) { dmg *= p.flags.cutthroat ? 2.2 : 1.5; if (p.ambushT > 0) { p.ambushT = 0; crit = true; } }
    }
    if (crit) dmg *= p.stats.critDmg;
    // PERFECT CRITICAL (kill shot): a basic-attack crit on a non-boss already at 1/3 health
    // or less has a 1-in-10 chance to be an instant kill with a class finisher cinematic.
    var killShot = !!(crit && opts.basicAttack && !opts.minion && !opts.splash && p && !e.boss && !(p.pw && p.pw.rapid > 0) &&
      e.maxHp > 0 && e.hp <= e.maxHp / 3 && Math.random() < KILL_SHOT_CHANCE &&
      CC.CriticalScene && CC.CriticalScene.canFinish && CC.CriticalScene.canFinish());
    if (killShot) { e.rose = true; dmg = Math.max(dmg, Math.ceil(((e.hp || 1) + (e.shield || 0)) / 0.2) + 1); }
    dmg = Math.max(1, Math.round(dmg));
    var viaEnemies = CC.Enemies && typeof CC.Enemies.damage === 'function';
    if (viaEnemies) { try { CC.Enemies.damage(e, dmg, type); } catch (err) { e.hp -= dmg; } }
    else e.hp -= dmg;
    fxText(e.x, e.y - (e.r || 8) - 4, crit ? dmg + '!' : String(dmg), crit ? '#f04c57' : back ? '#7de0b8' : '#fff', crit ? 16 : 10);
    fxBurst(e.x, e.y, crit ? '#ffd24a' : '#ffffff', crit ? 14 : 4, crit ? 110 : 60);
    if (p && !opts.minion && (type === 'slash' || type === 'melee' || type === 'physical') &&
        Math.hypot(p.x - e.x, p.y - e.y) < 72 && !(e.ghost)) {
      // Blood on armor and blades is refreshed by close-range hits, fading in five seconds.
      p.bloodTime = 5;
      p.bloodMarks = [];
      for (var bi = 0; bi < 12; bi++)
        p.bloodMarks.push({ x: (Math.random() - 0.5) * 12, y: -13 + Math.random() * 22,
          r: 0.55 + Math.random() * 1.6 });
    }
    // Persistent damage: every landed basic slash or weapon projectile physically tears
    // a nonrectangular piece of flesh/fur/straw off the target.
    if (opts.basicAttack && !opts.minion && CC.WoundArt && CC.WoundArt.impact)
      CC.WoundArt.impact(e,opts.angle||0,type);
    if (type !== 'poison' && type !== 'fire') {
      e._hitFlash = crit ? 0.16 : 0.09;
      fxBlood(e.x, e.y, crit ? 10 : 4, p ? e.x - p.x : 0, p ? e.y - p.y : 0);
    }
    if (p && p.pw && p.pw.explode > 0 && (opts.basicAttack || opts.pw) && !opts.splash && !opts.minion)
      explodeAt(e, dmg); // exploding power-up: every basic hit bursts into splash damage
    if (crit && opts.basicAttack && !opts.minion && !opts.splash && !(p && p.pw && p.pw.rapid > 0)) {
      var attackGroup = opts.attackGroup;
      var participants = criticalGroup(p,e,dmg,type,opts);
      if (CC.CriticalScene) {
        if (attackGroup && attackGroup.cinematicStarted && CC.CriticalScene.addTargets) {
          CC.CriticalScene.addTargets(participants);
          if (killShot && CC.CriticalScene.finish && CC.CriticalScene.finish(e)) e._finisher = true;
        } else {
          CC.CriticalScene.trigger({ kind: opts.attackKind === 'projectile' ? 'projectile' : 'slash',
            heroClass: p.classId, x: e.x, y: e.y, r: e.r || 9, angle: opts.angle || 0,
            color: opts.color || '#e5c5b3', damage: dmg, sourceX: p.x, sourceY: p.y,
            targets:participants, radius:critRadius(p.classId),
            finisher: killShot ? e.id : null });
          if (killShot) e._finisher = true;
          if (attackGroup) attackGroup.cinematicStarted = true;
        }
      }
    }
    if (crit) {
      fxFlash('#ffe9a0', 0.08);
      addFx({ kind: 'ring', x: e.x, y: e.y, r: 18, t: 0.22, max: 0.22, col: '#ffd24a' });
      fxShake(2); fxStop(0.05);
    }
    if (back && !crit) fxText(e.x, e.y - (e.r || 8) - 14, 'Backstab', '#7de0b8', 9);
    if (p && p.flags.venom && !opts.minion && type !== 'poison' && type !== 'fire' && alive(e)) ignite(e, 3, p.stats.dmg * 0.4, '#7dff5a', 'poison');
    if (p && !opts.minion && p.stats.lifesteal > 0) heal(p, dmg * p.stats.lifesteal);
    if (killShot && alive(e) && CC.Enemies && CC.Enemies._kill) { e.hp = 0; try { CC.Enemies._kill(e); } catch (err) { /* normal damage already applied */ } }
    if (killShot && !alive(e)) fxText(e.x, e.y - (e.r || 8) - 18, 'KILL SHOT', '#ff4b5c', 11);
    if (!alive(e)) onKill(e);
    return dmg;
  }

  function status(e, k, t, mul) {
    if (k === 'stun') e.stunT = Math.max(e.stunT || 0, t);
    else { e.slowT = Math.max(e.slowT || 0, t); e.slowMul = mul; }
  }

  /* ---------- movement & targeting ---------- */
  function solidAt(x, y) {
    var D = CC.Dungeon;
    if (!D || typeof D.isSolid !== 'function') return false;
    try { return !!D.isSolid(x, y); } catch (e) { return false; }
  }

  function move(e, dx, dy) {
    var D = CC.Dungeon;
    if (D && typeof D.moveWithCollision === 'function') {
      try { return D.moveWithCollision(e, dx, dy); } catch (err) { /* fall through */ }
    }
    e.x += dx; e.y += dy;
    return null;
  }

  function nearest(x, y, range) {
    var best = null, bd = range * range, l = foes();
    for (var i = 0; i < l.length; i++) {
      var e = l[i]; if (!alive(e)) continue;
      var dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = e; }
    }
    return best;
  }

  function aimDir(p, range) {
    var t = nearest(p.x, p.y, range);
    var dx, dy;
    if (t) { dx = t.x - p.x; dy = t.y - p.y; }
    else { dx = p.aimX; dy = p.aimY; }
    var l = Math.sqrt(dx * dx + dy * dy);
    if (l < 0.001) { dx = p.face; dy = 0; l = 1; }
    return { x: dx / l, y: dy / l, a: Math.atan2(dy / l, dx / l), target: t };
  }

  function angDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= 6.2832;
    while (d < -Math.PI) d += 6.2832;
    return Math.abs(d);
  }

  function addFx(f) {
    if (fxs.length < 120) fxs.push(f);
    // Co-op: show this slash arc / spell ring / beam to the partner (trail puffs are too small to bother).
    if (!f.remote && CC.Multiplayer && CC.Multiplayer.sendFx &&
        (f.kind === 'arc' || f.kind === 'ring' || f.kind === 'beam' || (f.kind === 'puff' && f.r >= 10)))
      CC.Multiplayer.sendFx('fx', { kind: f.kind, x: f.x, y: f.y, a: f.a, half: f.half, r: f.r,
        t: f.t, max: f.max, col: f.col, x2: f.kind === 'beam' ? (f.ref ? f.ref.x : f.x2) : undefined,
        y2: f.kind === 'beam' ? (f.ref ? f.ref.y : f.y2) : undefined });
  }
  // Effects and projectiles cast by the other player: purely visual, never damage anything here.
  function addRemoteFx(d) {
    if (!d || !isFinite(d.x) || !isFinite(d.y) || !(d.t > 0)) return;
    var f = { kind: String(d.kind), x: d.x, y: d.y, a: d.a || 0, half: d.half || 0.5, r: d.r || 10,
      t: Math.min(1, d.t), max: Math.min(1, d.max || d.t), col: typeof d.col === 'string' ? d.col : '#fff', remote: true };
    if (f.kind === 'beam') { f.x2 = isFinite(d.x2) ? d.x2 : d.x; f.y2 = isFinite(d.y2) ? d.y2 : d.y; }
    else if (f.kind !== 'arc' && f.kind !== 'ring' && f.kind !== 'puff') return;
    addFx(f);
  }
  function addRemoteProjectile(d) {
    if (!d || !isFinite(d.x) || !isFinite(d.y) || !isFinite(d.vx) || !isFinite(d.vy) || projs.length >= 80) return;
    projs.push({ x: d.x, y: d.y, vx: d.vx, vy: d.vy, life: Math.min(2, d.life || 0.8), dmg: 0, r: d.r || 4,
      kind: String(d.kind || 'bolt'), type: 'visual', col: typeof d.col === 'string' ? d.col : '#fff',
      a: d.a || 0, hit: [], visual: true, preRolledCrit: !!d.preRolledCrit, critHero: d.critHero, critAge: 0 });
  }

  function knock(e, fromX, fromY, dist) {
    var dx = e.x - fromX, dy = e.y - fromY, l = Math.sqrt(dx * dx + dy * dy) || 1;
    // collision-resolved, so a knocked enemy slides to the wall edge instead of ending inside it
    var sx = e.x, sy = e.y;
    move(e, dx / l * dist, dy / l * dist);
    if (solidAt(e.x, e.y)) { e.x = sx; e.y = sy; } // belt and braces: never leave an entity inside a wall
  }

  // burning enemies (fireball): damage over time, ticked in update()
  var burning = [];
  function ignite(e, t, dps, col, type) {
    for (var i = 0; i < burning.length; i++) if (burning[i].e === e && burning[i].type === (type || 'fire')) { burning[i].t = Math.max(burning[i].t, t); return; }
    if (burning.length < 60) burning.push({ e: e, t: t, dps: dps, tick: 0.5, col: col || '#ff8a3c', type: type || 'fire' });
  }
  function updateBurning(p, dt) {
    for (var i = burning.length - 1; i >= 0; i--) {
      var b = burning[i];
      b.t -= dt; b.tick -= dt;
      if (b.t <= 0 || !alive(b.e)) { burning.splice(i, 1); continue; }
      if (Math.random() < 0.5) addFx({ kind: 'puff', x: b.e.x + rnd(-4, 4), y: b.e.y - 4, r: 3, t: 0.25, max: 0.25, col: b.col });
      if (b.tick <= 0) { b.tick = 0.5; hitEnemy(b.e, b.dps * 0.5, b.type, { noCrit: true }); }
    }
  }

  /* ---------- abilities ---------- */
  function spend(p, key) {
    var c = p.cost[key];
    if (p.mana < c) {
      if (noManaT <= 0) { fxText(p.x, p.y - 18, 'No mana', '#6bb8ff', 10); noManaT = 0.6; }
      return false;
    }
    p.mana -= c;
    return true;
  }

  function cone(p, dir, range, half, mult, type, knockDist, stunT, basicAttack) {
    var hits = 0, l = foes(), direct = [], i, e;
    for (i = 0; i < l.length; i++) {
      e=l[i]; if (!alive(e)) continue;
      var dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy);
      if (d>range+(e.r||8))continue;
      if (d>8 && angDiff(Math.atan2(dy,dx),dir.a)>half)continue;
      direct.push(e);
    }
    // A single swipe owns a single cinematic and every directly struck
    // monster, so the expanded critical radius cannot double-count them.
    var attackGroup={targets:direct,splashed:[],cinematicStarted:false};
    for (i=0;i<direct.length;i++) {
      e=direct[i];if(!alive(e))continue;
      hitEnemy(e,p.stats.dmg*mult,type,
        {basicAttack:!!basicAttack,attackKind:'slash',angle:dir.a,attackGroup:attackGroup});
      if(knockDist)knock(e,p.x,p.y,knockDist);
      if(stunT)status(e,'stun',stunT);
      hits++;
    }
    // Refresh the cutscene with every fully damaged sprite in this swipe,
    // including injuries that happened after the first critical registered.
    if(attackGroup.cinematicStarted && CC.CriticalScene && CC.CriticalScene.addTargets)
      CC.CriticalScene.addTargets(direct.concat(attackGroup.splashed));
    if ((type==='slash'||type==='melee')&&CC.Breakables)
      CC.Breakables.hitCone(p,dir,range,half);
    return hits;
  }

  function radial(p, cx, cy, rad, mult, type, slowT, slowMul) {
    var hits = 0, l = foes();
    for (var i = 0; i < l.length; i++) {
      var e = l[i]; if (!alive(e)) continue;
      var dx = e.x - cx, dy = e.y - cy;
      if (dx * dx + dy * dy > (rad + (e.r || 8)) * (rad + (e.r || 8))) continue;
      hitEnemy(e, p.stats.dmg * mult, type);
      if (slowT) status(e, 'slow', slowT, slowMul);
      hits++;
    }
    return hits;
  }

  function shoot(p, a, speed, life, dmgMul, r, kind, type, col, extra) {
    var sx = p.x + Math.cos(a) * 8, sy = p.y + Math.sin(a) * 8 - 2;
    if (solidAt(sx, sy)) { sx = p.x; sy = p.y; } // muzzle inside a wall (hugging it): start at the caster
    var pr = { x: sx, y: sy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: life, dmg: p.stats.dmg * dmgMul, r: r, kind: kind, type: type, col: col, a: a, hit: [] };
    if (extra) for (var k in extra) pr[k] = extra[k];
    // Pre-roll only basic projectiles, so crit visuals are present at launch and
    // this exact result is reused on hit. Spells/AOE retain the old hit-time rule.
    if ((kind === 'bolt' || kind === 'shard') && p.stats) {
      pr.preRolledCrit = Math.random() < p.stats.crit;
      pr.critHero = p.classId;
      if (pr.preRolledCrit) {
        pr.col = p.classId === 'wizard' ? '#52ceff' : '#b67bff';
        pr.critAge = 0;
      }
    }
    if (p.pw && p.pw.rapid > 0 && !pr.aoe) pr.pierce = true; // rapid fire power-up: shots pass through monsters
    if (projs.length < 80) projs.push(pr);
    if (CC.Multiplayer && CC.Multiplayer.sendFx)
      CC.Multiplayer.sendFx('pr', { x: pr.x, y: pr.y, vx: pr.vx, vy: pr.vy, life: pr.life, r: pr.r, kind: pr.kind,
        col: pr.col, a: pr.a, preRolledCrit: !!pr.preRolledCrit, critHero: pr.critHero });
    return pr;
  }

  function doAttack(p) {
    var cls = p.classId, dir, i;
    p.atkAnim = 0.2;
    if (cls === 'swordsman') {
      // Only a damaging swipe advances the chain. Multiple targets still count once.
      var step = (p.combo || 0) + 1, fin = step === 3;
      dir = aimDir(p, 56);
      var mult = fin ? 1.30 * (1 + 0.25 * (p.flags.heavy || 0)) : 0.85 + step * 0.10;
      var range = fin ? 38 : 31, half = fin ? 1.18 : 0.9;
      var hits = cone(p, dir, range, half, mult, 'slash', fin ? 8 : 3, 0, true);
      p.swingAng = dir.a; p.swingSign = step === 2 ? -1 : 1;
      addFx({ kind: 'arc', x: p.x, y: p.y, a: dir.a, half: half, r: range, t: 0.16, max: 0.16,
        col: hits && fin ? '#a06ed2' : '#ffffff' });
      if (hits > 0) {
        p.combo = fin ? 0 : step;
        p.comboT = 1.0;
        p.comboDisplay = step; p.comboDisplayT = 0.5;
        if (fin) {
          var cx = p.x + dir.x * 23, cy = p.y + dir.y * 23;
          radial(p, cx, cy, 43, 0.55, 'slash');
          addFx({ kind: 'ring', x: cx, y: cy, r: 43, t: 0.27, max: 0.27, col: '#9467bf' });
          fxBurst(cx, cy, '#9c6bcc', 15, 110);
          fxText(p.x, p.y - 25, 'RIFT CLEAVE  x3', '#aa80c9', 10);
          fxShake(3); fxStop(0.04);
        } else fxText(p.x, p.y - 24, step + ' HIT COMBO', '#a184c1', 9);
        fxStop(0.02);
      } else {
        p.combo = 0; p.comboT = 0; p.comboDisplayT = 0;
      }
      p.cd.attack = p.cdMax.attack * (fin && hits ? 1.25 : 0.9);
      if (p.pw && p.pw.rapid > 0) shoot(p, dir.a, 330, 0.5, 0.5, 6, 'wave', 'slash', '#cfe8ff', { pierce: true });
    } else if (cls === 'wizard') {
      dir = aimDir(p, 170);
      var twin = p.flags.twin ? [-0.1, 0.1] : [0];
      for (i = 0; i < twin.length; i++) shoot(p, dir.a + twin[i], 230, 0.8, p.flags.twin ? 0.75 : 1, 4, 'bolt', 'arcane', '#c9a8ff');
      p.cd.attack = p.cdMax.attack; p.castFlash = 0.15;
    } else if (cls === 'thief') {
      dir = aimDir(p, 40);
      var hit = (p.combo || 0) + 1, finish = hit === 5;
      p.swingAng = dir.a; p.swingSign = hit % 2 ? 1 : -1;
      var strikes = cone(p, dir, finish ? 33 : 27, finish ? 0.95 : 0.7,
        finish ? 1.22 : 0.78 + hit * 0.07, 'slash', finish ? 5 : 2, 0, true);
      addFx({ kind: 'arc', x: p.x, y: p.y, a: dir.a + (hit % 2 ? -0.16 : 0.16),
        half: finish && strikes ? 1.15 : 0.55, r: finish && strikes ? 39 : 27,
        t: 0.14, max: 0.14, col: finish && strikes ? '#a576ca' : '#bea4d3' });
      if (strikes > 0) {
        p.combo = finish ? 0 : hit;
        p.comboT = 0.95;
        p.comboDisplay = hit; p.comboDisplayT = 0.5;
        if (finish) {
          // Distinct shadow-bloom finisher. Splash hits are not combo progress.
          var nx = p.x + dir.x * 18, ny = p.y + dir.y * 18;
          radial(p, nx, ny, 46, 0.65, 'slash');
          addFx({ kind: 'ring', x: nx, y: ny, r: 46, t: 0.27, max: 0.27, col: '#9a60bf' });
          for (i = 0; i < 3; i++) addFx({ kind: 'arc', x: nx, y: ny,
            a: dir.a + (i - 1) * 0.48, half: 0.18, r: 28 + i * 5,
            t: 0.19, max: 0.19, col: '#9c70c6' });
          fxBurst(nx, ny, '#a678c4', 16, 105);
          fxText(p.x, p.y - 25, 'SHADOW BLOOM  x5', '#af84cc', 10);
          fxShake(3); fxStop(0.04);
        } else fxText(p.x, p.y - 24, hit + ' HIT COMBO', '#a184c1', 9);
      } else {
        p.combo = 0; p.comboT = 0; p.comboDisplayT = 0;
      }
      p.cd.attack = p.cdMax.attack * (finish && strikes ? 1.35 : 0.82);
      if (p.pw && p.pw.rapid > 0) shoot(p, dir.a, 360, 0.5, 0.45, 5, 'wave', 'slash', '#ffd0d8', { pierce: true });
    } else {
      dir = aimDir(p, 170);
      var fan = p.flags.volley ? [-0.2, 0, 0.2] : [0];
      for (i = 0; i < fan.length; i++) shoot(p, dir.a + fan[i], 250, 0.7, p.flags.volley ? 0.7 : 1, 3.5, 'shard', 'bone', '#e8e6d0');
      p.cd.attack = p.cdMax.attack; p.castFlash = 0.15;
    }
    p.face = dir.x >= 0 ? 1 : -1;
  }

  function raise(p, count, free) {
    var cap = 2 + Math.floor(p.level / 5) + 2 * (p.flags.legion || 0);
    var n = Math.min(count, cap - minions.length);
    if (n <= 0) return 0;
    for (var i = 0; i < n; i++) {
      var a = rnd(0, 6.28), d = rnd(18, 28);
      var hp = (28 + p.level * 2.7) * (1 + 0.4 * (p.flags.sturdy || 0));
      var rx = p.x + Math.cos(a) * d, ry = p.y + Math.sin(a) * d;
      if (solidAt(rx, ry)) { rx = p.x; ry = p.y; } // never raise a skeleton inside a wall
      minions.push({ x: rx, y: ry, r: 6, hp: hp, maxHp: hp, life: 16 * (1 + 0.5 * (p.flags.linger || 0)),
        dmg: (5 + p.stats.dmg * 0.42) * (1 + 0.35 * (p.flags.deadly || 0)) * sm(p, 1), atkCd: 0, anim: rnd(0, 6), face: 1, spawn: 0.35 });
      addFx({ kind: 'puff', x: rx, y: ry, r: 14, t: 0.4, max: 0.4, col: '#7dff9a' });
    }
    if (!free) addFx({ kind: 'ring', x: p.x, y: p.y, r: 34, t: 0.4, max: 0.4, col: '#7dff9a' });
    return n;
  }

  function doSpell1(p) {
    var cls = p.classId, dir;
    if (cls === 'swordsman') { // shield bash
      if (!spend(p, 'spell1')) return;
      dir = aimDir(p, 48);
      cone(p, dir, 38, 0.85, 1.3 * sm(p, 1), 'bash', 18, 1.0 + 0.6 * (p.flags.stun || 0));
      addFx({ kind: 'arc', x: p.x, y: p.y, a: dir.a, half: 0.85, r: 38, t: 0.25, max: 0.25, col: '#6bb8ff' });
      p.swingAng = dir.a; p.atkAnim = 0.25; fxShake(4); fxStop(0.05);
    } else if (cls === 'wizard') { // fireball
      if (!spend(p, 'spell1')) return;
      dir = aimDir(p, 190);
      shoot(p, dir.a, 170, 1.2, 2.4 * sm(p, 1), 6, 'fire', 'fire', '#ff8a3c', { aoe: 40 * (1 + p.mods.aoePct + 0.3 * (p.flags.inferno || 0)) });
      p.castFlash = 0.3; fxShake(2);
    } else if (cls === 'thief') { // throwing knives
      if (!spend(p, 'spell1')) return;
      dir = aimDir(p, 170);
      var spread = p.flags.storm ? [-0.4, -0.2, 0, 0.2, 0.4] : [-0.14, 0, 0.14];
      for (var ki = 0; ki < spread.length; ki++) shoot(p, dir.a + spread[ki], 300, 0.6, 0.8 * sm(p, 1), 3, 'shard', 'knife', '#cfd8e6');
      p.atkAnim = 0.15; p.castFlash = 0.1;
    } else { // raise skeletons
      var cap = 2 + Math.floor(p.level / 5) + 2 * (p.flags.legion || 0);
      if (minions.length >= cap) { if (noManaT <= 0) { fxText(p.x, p.y - 18, 'Max minions', '#7dff9a', 10); noManaT = 0.6; } return; }
      if (!spend(p, 'spell1')) return;
      raise(p, 2, false);
      p.castFlash = 0.3;
    }
    p.cd.spell1 = p.cdMax.spell1;
    p.face = dir ? (dir.x >= 0 ? 1 : -1) : p.face;
  }

  function doSpell2(p) {
    var cls = p.classId;
    if (cls === 'swordsman') { // whirlwind
      if (!spend(p, 'spell2')) return;
      p.whirlT = 0.7; p.whirlTick = 0;
    } else if (cls === 'wizard') { // frost nova
      if (!spend(p, 'spell2')) return;
      var rad = 72 * (1 + p.mods.aoePct);
      radial(p, p.x, p.y, rad, 1.0 * sm(p, 2), 'frost', 2.5 + 1.5 * (p.flags.frostbite || 0), 0.45);
      addFx({ kind: 'ring', x: p.x, y: p.y, r: rad, t: 0.45, max: 0.45, col: '#9fe3ff' });
      fxBurst(p.x, p.y, '#9fe3ff', 20, 120); fxShake(3); p.castFlash = 0.3;
    } else if (cls === 'thief') { // smoke bomb: slows nearby foes, brief invulnerability, primes an ambush
      if (!spend(p, 'spell2')) return;
      radial(p, p.x, p.y, 56, 0.4 * sm(p, 2), 'smoke', 2.5, 0.5);
      p.iframes = Math.max(p.iframes, 0.5); p.ambushT = 2;
      addFx({ kind: 'ring', x: p.x, y: p.y, r: 56, t: 0.5, max: 0.5, col: '#8a90a8' });
      addFx({ kind: 'puff', x: p.x, y: p.y, r: 22, t: 0.5, max: 0.5, col: '#5a5f78' });
      fxBurst(p.x, p.y, '#8a90a8', 16, 90); p.castFlash = 0.3;
    } else { // life drain
      var t = nearest(p.x, p.y, 110);
      if (!t) { if (noManaT <= 0) { fxText(p.x, p.y - 18, 'No target', '#aaa', 10); noManaT = 0.6; } return; }
      if (!spend(p, 'spell2')) return;
      var dealt = hitEnemy(t, p.stats.dmg * 1.7 * sm(p, 2), 'drain');
      heal(p, dealt * (0.38 + 0.27 * (p.flags.vampirism || 0)));
      addFx({ kind: 'beam', x: p.x, y: p.y, x2: t.x, y2: t.y, t: 0.3, max: 0.3, col: '#7dff9a', ref: t });
      p.castFlash = 0.3; p.face = t.x >= p.x ? 1 : -1;
    }
    p.cd.spell2 = p.cdMax.spell2;
  }

  // The dash goes where the hero is moving, never toward a target. Standing still it goes the way the hero faces.
  // Swordsman: a plain dash (invulnerable, no damage). Thief: a dash attack that can chain up to 3 times, the 2nd and 3rd only after the previous one hit something.
  var CHAIN_MAX = 3, CHAIN_WINDOW = 1.4;
  function doDash(p) {
    var inp = CC.input || {};
    var dx = +inp.moveX || 0, dy = +inp.moveY || 0;
    if (Math.abs(dx) + Math.abs(dy) < 0.2) { dx = p.face || 1; dy = 0; }
    var l = Math.sqrt(dx * dx + dy * dy) || 1; dx /= l; dy /= l;
    p.iframes = 0.22;
    if (p.classId === 'swordsman' || p.classId === 'thief') {
      var attack = p.classId === 'thief';
      p.cd.dash = attack ? 0 : p.cdMax.dash; // the thief's cool-down starts when the chain ends
      p.dashT = attack ? 0.14 : 0.16; p.dashVX = dx * (attack ? 460 : 440); p.dashVY = dy * (attack ? 460 : 440); p.dashHit = []; p.dashAttack = attack;
      p.swingAng = Math.atan2(dy, dx);
      if (attack) {
        p.atkAnim = 0.14; p.ambushT = Math.max(p.ambushT || 0, 0.4);
        p.dashComboT = CHAIN_WINDOW; // stays open until the next dash or it runs out
        addFx({ kind: 'puff', x: p.x, y: p.y, r: 12, t: 0.25, max: 0.25, col: '#b9a6ff' });
      } else addFx({ kind: 'puff', x: p.x, y: p.y, r: 10, t: 0.2, max: 0.2, col: '#ffd36b' });
    } else { // blink, stepped so walls stop it
      p.cd.dash = p.cdMax.dash;
      addFx({ kind: 'puff', x: p.x, y: p.y, r: 14, t: 0.3, max: 0.3, col: '#c9a8ff' });
      var bx0 = p.x, by0 = p.y;
      move(p, dx * 64, dy * 64);
      if (solidAt(p.x, p.y)) { p.x = bx0; p.y = by0; } // never end inside a wall
      addFx({ kind: 'puff', x: p.x, y: p.y, r: 14, t: 0.3, max: 0.3, col: p.classId === 'wizard' ? '#c9a8ff' : '#7dff9a' });
    }
    if (dx) p.face = dx > 0 ? 1 : -1;
  }
  // Called when a dash ends. Thief: a dash that hit opens the next link of the chain (up to 3); a miss, or the third link, starts the cool-down.
  function endDash(p) {
    if (p.chargedDash) {
      // Charged Phantom Rush is a single extended dash, not three free chain links.
      p.chargedDash=false;p.dashAttack=false;
      p.dashChain=0;p.dashComboT=0;
      p.cd.dash=Math.max(p.cd.dash||0,p.cdMax.dash*1.5);
      return;
    }
    if (!p.dashAttack) return;
    var hits = p.dashHit ? p.dashHit.length : 0;
    p.dashChain = (p.dashChain || 0) + 1;
    if (hits > 0 && p.dashChain < CHAIN_MAX) {
      p.cd.dash = 0; p.dashComboT = CHAIN_WINDOW;
      fxText(p.x, p.y - 24, 'DASH ' + (p.dashChain + 1) + '/' + CHAIN_MAX + ' READY', '#b9a6ff', 9);
    } else { p.dashChain = 0; p.dashComboT = 0; p.cd.dash = p.cdMax.dash; }
    p.dashAttack = false;
  }

  /* ---------- charged spell support ----------
   * The hold/aim gesture belongs to CC.SpellCharge. Keep all normal class spells
   * here, so tap actions remain perfectly identical to the old game.
   */
  function tapAction(slot) {
    var p=hero();
    if(!p||!CC.state||CC.state.mode!=='dungeon'||p.hp<=0||
       !p.cd||p.cd[slot]>.001||p.perkOpen)return false;
    if(slot==='spell2'&&p.level<SPELL2_LEVEL)return false;
    if(slot==='spell1')doSpell1(p);
    else if(slot==='spell2')doSpell2(p);
    else if(slot==='dash'&&p.dashT<=0)doDash(p);
    else return false;
    return p.cd[slot]>.001||(slot==='dash'&&p.dashT>0);
  }
  function summonCharged(x,y,count,p) {
    p=p||hero();if(!p||p.classId!=='necromancer')return 0;
    var cap=3+Math.floor(p.level/5)+2*(p.flags.legion||0);
    var n=Math.min(count,Math.max(0,cap-minions.length)),made=0;
    for(var i=0;i<n;i++){
      var a=i*6.2831853/Math.max(1,n)+.6,r=18+i%2*9,
          tx=x+Math.cos(a)*r,ty=y+Math.sin(a)*r;
      if(solidAt(tx,ty)){tx=p.x+Math.cos(a)*20;ty=p.y+Math.sin(a)*20;}
      if(solidAt(tx,ty))continue;
      var health=(33+p.level*3.4)*(1+.4*(p.flags.sturdy||0));
      minions.push({x:tx,y:ty,r:7,hp:health,maxHp:health,life:14,
        dmg:(5+p.stats.dmg*.62)*sm(p,1),atkCd:0,
        anim:rnd(0,6),face:1,spawn:.48,charged:true});
      addFx({kind:'puff',x:tx,y:ty,r:19,t:.53,max:.53,col:'#a7e3b0'});
      made++;
    }
    return made;
  }

  /* ---------- per-frame systems ---------- */
  function updateProjectiles(p, dt) {
    for (var i = projs.length - 1; i >= 0; i--) {
      var s = projs[i], end = false, target = null;
      if (s.preRolledCrit) s.critAge = (s.critAge || 0) + dt;
      s.life -= dt;
      // sub-step so fast shots can't tunnel; on a wall, stop at the last open point (the wall edge)
      var mvx = s.vx * dt, mvy = s.vy * dt, nSub = Math.max(1, Math.ceil(Math.max(Math.abs(mvx), Math.abs(mvy)) / 3));
      for (var q = 0; q < nSub; q++) {
        var nx = s.x + mvx / nSub, ny = s.y + mvy / nSub;
        if (solidAt(nx, ny)) {
          end = true;
          addFx({ kind: 'puff', x: s.x, y: s.y, r: s.r + 3, t: 0.18, max: 0.18, col: s.col });
          break;
        }
        s.x = nx; s.y = ny;
        // Basic bolts and shards can shatter the same destructibles as slashes.
        if (!end && !s.visual && CC.Breakables && CC.Breakables.hitProjectile(s)) {
          end=true;
          addFx({kind:'puff',x:s.x,y:s.y,r:9,t:.24,max:.24,col:s.col});
          break;
        }
      }
      var l = foes();
      for (var j = 0; j < l.length && !end; j++) {
        var e = l[j]; if (!alive(e)) continue;
        var dx = e.x - s.x, dy = e.y - s.y, rr = (e.r || 8) + s.r;
        if (dx * dx + dy * dy <= rr * rr) {
          if (s.pierce && !s.aoe) { // pass through, hitting each monster once
            if (!s.visual && s.hit.indexOf(e) < 0) {
              s.hit.push(e);
              hitEnemy(e, s.dmg, s.type, { basicAttack: s.kind === 'bolt' || s.kind === 'shard', pw: s.kind === 'wave', attackKind: 'projectile',
                angle: s.a, color: s.col, preRolledCrit: s.hit.length === 1 ? s.preRolledCrit : false });
              fxBurst(s.x, s.y, s.col, 4, 60);
            }
          } else { target = e; end = true; }
        }
      }
      if (Math.random() < 0.6) addFx({ kind: 'puff', x: s.x, y: s.y, r: s.r, t: 0.2, max: 0.2, col: s.col });
      if (s.life <= 0) end = true;
      if (s.visual) { // partner's shot: fly and vanish, no damage here
        if (end) { fxBurst(s.x, s.y, s.col, 5, 60); projs.splice(i, 1); }
        continue;
      }
      if (!end) continue;
      if (s.aoe) {
        radial(p, s.x, s.y, s.aoe, s.dmg / p.stats.dmg, s.type);
        var bl = foes();
        for (var bi = 0; bi < bl.length; bi++) { // fire leaves a burn: 3s damage over time
          var be = bl[bi], bx = be.x - s.x, by = be.y - s.y, br = s.aoe + (be.r || 8);
          if (alive(be) && bx * bx + by * by <= br * br) ignite(be, 3, p.stats.dmg * 0.5);
        }
        addFx({ kind: 'ring', x: s.x, y: s.y, r: s.aoe, t: 0.35, max: 0.35, col: '#ff8a3c' });
        fxBurst(s.x, s.y, '#ff8a3c', 18, 120); fxShake(4);
      } else if (target) {
        hitEnemy(target, s.dmg, s.type, {
          basicAttack: s.kind === 'bolt' || s.kind === 'shard',
          attackKind: 'projectile', angle: s.a, color: s.col,
          preRolledCrit: s.preRolledCrit
        });
        fxBurst(s.x, s.y, s.col, 5, 60);
      }
      projs.splice(i, 1);
    }
  }

  function damageMinion(m, amt) { m.hp -= amt; }

  function updateMinions(p, dt) {
    for (var i = minions.length - 1; i >= 0; i--) {
      var m = minions[i], l = foes(), k;
      m.life -= dt; m.anim += dt; if (m.spawn > 0) m.spawn -= dt; if (m.atkCd > 0) m.atkCd -= dt;
      for (k = 0; k < l.length; k++) { // enemies chew on skeletons they touch
        var en = l[k]; if (!alive(en)) continue;
        var cx = en.x - m.x, cy = en.y - m.y, rr = (en.r || 8) + m.r + 2;
        if (cx * cx + cy * cy <= rr * rr) m.hp -= Math.min(en.contactDmg || en.dmg || 5, 12) * 1.5 * dt;
      }
      if (m.life <= 0 || m.hp <= 0) {
        addFx({ kind: 'puff', x: m.x, y: m.y, r: 14, t: 0.4, max: 0.4, col: '#e8e6d0' });
        fxBurst(m.x, m.y, '#e8e6d0', 8, 70);
        minions.splice(i, 1);
        continue;
      }
      var t = nearest(m.x, m.y, 150), dx, dy, d;
      if (t) {
        dx = t.x - m.x; dy = t.y - m.y; d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d > (t.r || 8) + m.r + 2) move(m, dx / d * 70 * dt, dy / d * 70 * dt);
        else if (m.atkCd <= 0) { hitEnemy(t, m.dmg, 'bone', { minion: true, noCrit: true }); m.atkCd = 0.7; }
        m.face = dx >= 0 ? 1 : -1;
      } else {
        dx = p.x - m.x; dy = p.y - m.y; d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d > 40) { var sp = d > 120 ? 120 : 80; move(m, dx / d * sp * dt, dy / d * sp * dt); m.face = dx >= 0 ? 1 : -1; }
      }
      for (k = 0; k < minions.length; k++) { // gentle separation
        var o = minions[k]; if (o === m) continue;
        var sx = m.x - o.x, sy = m.y - o.y, sd = Math.sqrt(sx * sx + sy * sy);
        if (sd > 0 && sd < 10) move(m, sx / sd * 20 * dt, sy / sd * 20 * dt);
      }
    }
  }

  function updateFx(dt) {
    var fl = foes();
    for (var j = 0; j < fl.length; j++) if (fl[j]._hitFlash > 0) fl[j]._hitFlash -= dt;
    for (var i = fxs.length - 1; i >= 0; i--) {
      fxs[i].t -= dt;
      if (fxs[i].t <= 0) fxs.splice(i, 1);
    }
  }

  function syncWorld() {
    var map = CC.state && CC.state.map;
    if (map !== lastMap) { lastMap = map; minions.length = 0; projs.length = 0; fxs.length = 0; burning.length = 0; }
  }

  function update(dt, opts) {
    var p = hero();
    if (!p) return;
    syncWorld();
    var inp = CC.input || {}, k;
    for (k in p.cd) if (p.cd[k] > 0) {
      p.cd[k] = Math.max(0, p.cd[k] - dt);
      if (p.cd[k] === 0 && (k === 'spell1' || k === 'spell2')) { // ready feedback
        fxText(p.x, p.y - 22, (p.spells[k === 'spell1' ? 0 : 1] || k) + ' ready', '#9fe3ff', 9);
        addFx({ kind: 'ring', x: p.x, y: p.y, r: 16, t: 0.25, max: 0.25, col: '#9fe3ff' });
      }
    }
    p.atkAnim = Math.max(0, p.atkAnim - dt); p.castFlash = Math.max(0, p.castFlash - dt);
    p.invuln = Math.max(0, p.invuln - dt); p.iframes = Math.max(0, p.iframes - dt);
    if (p.ambushT > 0) p.ambushT = Math.max(0, p.ambushT - dt);
    if (noManaT > 0) noManaT -= dt;
    if (p.comboT > 0) { p.comboT -= dt; if (p.comboT <= 0) p.combo = 0; }
    if (p.comboDisplayT > 0) p.comboDisplayT -= dt;
    if (p.hp <= 0) { updateFx(dt); return; }
    if (p.perkOpen) { p.invuln = Math.max(p.invuln, 0.1); p.moving = false; updateFx(dt); return; }

    p.hp = Math.min(p.maxHp, p.hp + p.stats.regen * dt);
    p.mana = Math.min(p.maxMana, p.mana + p.stats.manaRegen * dt);
    // Real teleport: hero is intangible and cannot drift or attack during
    // dissolve/reform. SpellCharge owns the timed relocation and arrival hit.
    if(p.teleportPhase){
      p.moving=false;
      updateProjectiles(p,dt);updateBurning(p,dt);
      updateMinions(p,dt);updateFx(dt);return;
    }

    var mx = +inp.moveX || 0, my = +inp.moveY || 0, ml = Math.sqrt(mx * mx + my * my);
    if (ml > 1) { mx /= ml; my /= ml; ml = 1; }
    if (inp.aimX || inp.aimY) { p.aimX = inp.aimX; p.aimY = inp.aimY; }
    var sp = p.speed * (p.whirlT > 0 ? 0.6 : 1);
    if (p.dashT > 0) {
      var dsx=p.x,dsy=p.y,dres;
      if(p.chargedDash&&p.dashTarget){
        // Move by at most remaining distance: a charged dash stops on its
        // selected world-space landing pixel, never at a fixed dash length.
        var tx=p.dashTarget.x,ty=p.dashTarget.y,
          remaining=Math.hypot(tx-p.x,ty-p.y);
        var step=Math.min(remaining,(p.dashSpeed||600)*dt);
        var scale=remaining>0?step/remaining:0;
        dres=move(p,(tx-p.x)*scale,(ty-p.y)*scale);
        p.dashT-=dt;
        var reached=Math.hypot(tx-p.x,ty-p.y)<1.35;
        var blocked=(dres&&(dres.hitX||dres.hitY))||
          Math.hypot(p.x-dsx,p.y-dsy)<step*.50;
        if(solidAt(p.x,p.y)){p.x=dsx;p.y=dsy;blocked=true;}
        if(reached||blocked||p.dashT<=0){
          p.dashT=0;p.dashTarget=null;
          if(CC.SpellCharge&&CC.SpellCharge.land)CC.SpellCharge.land(p);
        }
      }else{
        dres=move(p,p.dashVX*dt,p.dashVY*dt);
        p.dashT-=dt;
        if(solidAt(p.x,p.y)){p.x=dsx;p.y=dsy;p.dashT=0;}
        if(dres&&(dres.hitX||dres.hitY)){
          p.dashT=0;
          addFx({kind:'puff',x:p.x,y:p.y,r:10,t:.2,max:.2,col:'#ffd36b'});
          fxShake(2);
        }
      }
      var l = p.dashAttack ? foes() : [];
      for (k = 0; k < l.length; k++) {
        var e = l[k]; if (!alive(e) || p.dashHit.indexOf(e) >= 0) continue;
        var dx = e.x - p.x, dy = e.y - p.y, rr = (e.r || 8) + p.r + 6;
        if (dx * dx + dy * dy <= rr * rr) { p.dashHit.push(e); hitEnemy(e, p.stats.dmg * 1.8, 'slash'); knock(e, p.x, p.y, 8); fxStop(0.04); }
      }
      addFx({ kind: 'puff', x: p.x, y: p.y, r: 8, t: 0.2, max: 0.2, col: '#ffffff' });
      p.moving = true;
      if (p.dashT <= 0) endDash(p);
    } else {
      if (p.dashComboT > 0) { p.dashComboT -= dt; if (p.dashComboT <= 0) { p.dashChain = 0; p.cd.dash = p.cdMax.dash; } }
      move(p, mx * sp * dt, my * sp * dt);
      p.moving = ml > 0.1;
    }
    if (Math.abs(mx) > 0.1) p.face = mx > 0 ? 1 : -1;
    p.anim += dt * (p.moving ? 1 : 0.35);
    if (p.bloodTime > 0) p.bloodTime = Math.max(0, p.bloodTime - dt);

    if (opts && opts.noCombat) { updateFx(dt); return; }

    if (inp.attack && p.cd.attack <= 0) doAttack(p);
    if (inp.spell1 && p.cd.spell1 <= 0) doSpell1(p);
    if (inp.spell2 && p.cd.spell2 <= 0 && p.level >= SPELL2_LEVEL) doSpell2(p);
    if (inp.dash && p.cd.dash <= 0 && p.dashT <= 0) doDash(p);

    if (p.whirlT > 0) {
      p.whirlT -= dt; p.whirlTick -= dt;
      if (p.whirlTick <= 0) {
        p.whirlTick = 0.14;
        var rad = 34 * (1 + p.mods.aoePct + 0.3 * (p.flags.wide || 0));
        if (radial(p, p.x, p.y, rad, 0.8 * sm(p, 2), 'slash')) fxStop(0.02);
        addFx({ kind: 'ring', x: p.x, y: p.y, r: rad, t: 0.2, max: 0.2, col: '#ffffff' });
      }
    }
    updateProjectiles(p, dt);
    updateBurning(p, dt);
    updateMinions(p, dt);
    updateFx(dt);
  }

  /* ---------- drawing ---------- */
  function R(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
  function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); }
  function line(c, x1, y1, x2, y2, col, w) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  function poly(c, pts, col) { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); }

  function drawHero(c, p, x, y) {
    var t = p.anim, f = p.face || 1;
    var bob = p.moving ? Math.sin(t * 14) * 1.5 : Math.sin(t * 3) * 0.6;
    var leg = p.moving ? Math.sin(t * 14) * 2 : 0;
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(x, y + 10, 9, 3.5, 0, 0, 6.2832); c.fill();
    var i;
    if (p.classId === 'swordsman') {
      // The critical uses these SAME helmet, plate, cape, boots and sword assets.
      // Only the body articulation changes: deep kneel, explosive thrust, recoil.
      var cp=p.criticalPose||null, kneel=cp?cp.kneel:0,
          drive=cp?cp.drive:0,withdraw=cp?cp.withdraw:0;
      var low=kneel*5-drive*2.5,spread=kneel*4.2;
      if(cp){
        // Left boot folds onto the ground, right boot braces behind the thrust.
        R(c,x-6-spread,y+4-low*.22,5,4+kneel*2,'#3b3f55');
        R(c,x+1+spread,y+5,4,5,'#3b3f55');
        line(c,x-4-spread,y+4-low*.24,x-9-spread,y+9,'#7e889d',2.7);
        line(c,x+3+spread,y+4,x+8+spread,y+9,'#646b82',2.5);
        R(c,x-11-spread,y+8,7,3,'#2a303e');
        R(c,x+5+spread,y+8,7,3,'#2a303e');
      }else{
        R(c,x-5,y+4+leg*.5,4,6,'#3b3f55');
        R(c,x+1,y+4-leg*.5,4,6,'#3b3f55');
      }
      // The plate armor, crest, cape and face ARE the live hero drawing.
      R(c,x-6+drive*3,y-6+bob+low,12,11,'#7c8aa6');
      R(c,x-6+drive*3,y+2+bob+low,12,2,'#4a3526');
      R(c,x-4+drive*3,y-5+bob+low,3,4,'#aab6cc');
      c.fillStyle='#2f6db5';c.beginPath();
      c.ellipse(x-f*8+drive*3,y-1+bob+low,3.5,5,0,0,6.2832);c.fill();
      c.strokeStyle='#ffd36b';c.lineWidth=1;c.stroke();
      circ(c,x+drive*3,y-10+bob+low,5,'#f0c39a');
      R(c,x-5+drive*3,y-16+bob+low,10,6,'#9aa7bd');
      R(c,x-f*6-1+drive*3,y-18+bob+low,3,7,'#d9413b');
      R(c,x+f*2+drive*3,y-10+bob+low,1,2,'#222');
      var ang;
      if(cp){
        // Draw the gripping arm from the real sprite, then a luminous blue blade
        // with enough length to reach the actual victim (not a fake icon at impact).
        var sx=x+f*7+drive*5,sy=y-1+bob+low,
            facing=Number.isFinite(cp.angle)?cp.angle:(f>0?0:Math.PI),
            reach=clamp(cp.distance||34,20,64),
            extension=-7+drive*(reach+11)-withdraw*(reach*.73);
        var hx=sx+Math.cos(facing)*extension,
            hy=sy+Math.sin(facing)*extension;
        line(c,x+f*5+drive*3,y-3+low,hx,hy,'#8997aa',3.5);
        circ(c,hx,hy,2.4,'#cda778');
        var tipX=hx+Math.cos(facing)*18,tipY=hy+Math.sin(facing)*18;
        c.save();
        c.shadowColor='#369cff';c.shadowBlur=7+12*drive*(1-withdraw*.55);
        line(c,hx,hy,tipX,tipY,'#1761be',6);
        line(c,hx,hy,tipX,tipY,'#73d8ff',3.6);
        line(c,hx+Math.cos(facing)*3,hy+Math.sin(facing)*3,tipX,tipY,'#f1fdff',1.7);
        c.restore();
        line(c,hx-Math.sin(facing)*5,hy+Math.cos(facing)*5,
          hx+Math.sin(facing)*5,hy-Math.cos(facing)*5,'#d9b67d',2.5);
        if(drive>.65){
          var spark=drive*(1-withdraw);
          c.save();c.globalAlpha=spark*.85;
          circ(c,tipX,tipY,2+spark*2,'#c5f5ff');
          c.restore();
        }
      }else{
        if(p.whirlT>0)ang=p.anim*22;
        else if(p.atkAnim>0)ang=p.swingAng+(p.atkAnim/.2-.5)*2.2*(p.swingSign||1);
        else ang=f>0?-1.1:-2.04;
        var hx0=x+f*7,hy0=y-1+bob;
        line(c,hx0,hy0,hx0+Math.cos(ang)*14,hy0+Math.sin(ang)*14,'#e6edf7',3);
        if(p.bloodTime>0){
          c.save();c.globalAlpha=Math.min(1,p.bloodTime/5);
          line(c,hx0+Math.cos(ang)*5,hy0+Math.sin(ang)*5,
            hx0+Math.cos(ang)*14,hy0+Math.sin(ang)*14,'#9c101b',1.8);
          c.restore();
        }
        line(c,hx0-Math.cos(ang),hy0-Math.sin(ang),
          hx0+Math.cos(ang)*2,hy0+Math.sin(ang)*2,'#b8860b',4);
      }
    } else if (p.classId === 'wizard') {
      poly(c, [x - 5, y - 5 + bob, x + 5, y - 5 + bob, x + 8, y + 9, x - 8, y + 9], '#5b3aa8');
      R(c, x - 8, y + 7, 16, 2, '#ffd36b'); R(c, x - 5, y + 1 + bob, 10, 2, '#3a2370');
      circ(c, x, y - 10 + bob, 4.5, '#f0c39a'); R(c, x - 3, y - 8 + bob, 6, 3, '#e8e8f0');
      R(c, x + f * 1.5, y - 11 + bob, 1, 2, '#222');
      poly(c, [x - 7, y - 12 + bob, x + 7, y - 12 + bob, x + f * 4, y - 27 + bob], '#3f2780');
      c.fillStyle = '#4b2f95'; c.beginPath(); c.ellipse(x, y - 12 + bob, 8, 2.5, 0, 0, 6.2832); c.fill();
      R(c, x - 4, y - 14 + bob, 8, 2, '#ffd36b');
      var sx = x + f * 9, so = p.atkAnim > 0 ? -2 : 0;
      line(c, sx, y - 12 + bob, sx, y + 9 + so, '#7a5230', 2);
      var orb = 3 + p.castFlash * 14 + Math.sin(t * 5) * 0.5;
      c.globalAlpha = 0.3; circ(c, sx, y - 14 + bob, orb + 3, '#9fe3ff'); c.globalAlpha = 1;
      circ(c, sx, y - 14 + bob, orb, '#c9f1ff');
    } else if (p.classId === 'thief') {
      R(c, x - 5, y + 4 + leg * 0.5, 4, 6, '#1f2a2a'); R(c, x + 1, y + 4 - leg * 0.5, 4, 6, '#1f2a2a');
      R(c, x - 5, y - 6 + bob, 10, 11, '#2d4a44'); R(c, x - 5, y + 1 + bob, 10, 2, '#6b4a2b');
      circ(c, x, y - 10 + bob, 5, '#e8b88e');
      poly(c, [x - 6, y - 8 + bob, x - 5, y - 16 + bob, x + 5, y - 16 + bob, x + 6, y - 8 + bob, x + 4, y - 9 + bob, x - 4, y - 9 + bob], '#1d2f2b');
      R(c, x - 5 + (f > 0 ? 0 : 6), y - 8 + bob, 4, 2, '#1d2f2b');
      R(c, x + f * 2, y - 10 + bob, 2, 1, '#7de0b8');
      R(c, x - f * 7 - 2, y - 7 + bob, 3, 3, '#7de0b8'); // scarf tail
      var tang = p.atkAnim > 0 ? p.swingAng + (p.atkAnim / 0.12 - 0.5) * 1.6 * (p.swingSign || 1) : (f > 0 ? -0.6 : -2.54);
      var thx = x + f * 6, thy = y - 1 + bob;
      line(c, thx, thy, thx + Math.cos(tang) * 9, thy + Math.sin(tang) * 9, '#e6edf7', 2);
      if (p.bloodTime > 0) {
        c.save(); c.globalAlpha = Math.min(1, p.bloodTime / 5);
        line(c, thx + Math.cos(tang) * 3, thy + Math.sin(tang) * 3,
          thx + Math.cos(tang) * 9, thy + Math.sin(tang) * 9, '#9c101b', 1.3);
        c.restore();
      }
      line(c, x - f * 6, y - 1 + bob, x - f * 6 - Math.cos(tang) * 6, y - 1 + bob + 3, '#cfd8e6', 2);
      if (p.ambushT > 0) { c.globalAlpha = 0.35; circ(c, x, y - 2 + bob, 11, '#7de0b8'); c.globalAlpha = 1; }
    } else {
      var z = Math.sin(t * 6) * 1;
      poly(c, [x - 6, y - 6 + bob, x + 6, y - 6 + bob, x + 9, y + 9, x + 5, y + 6 + z, x + 1, y + 10, x - 3, y + 6 - z, x - 6, y + 10, x - 9, y + 8], '#2a2238');
      R(c, x - 6, y + 1 + bob, 12, 2, '#3b2f52');
      circ(c, x, y - 10 + bob, 6, '#1c1527'); circ(c, x + f * 1, y - 9 + bob, 3.5, '#0a0710');
      R(c, x - 2 + f, y - 10 + bob, 1, 2, '#7dff9a'); R(c, x + 1 + f, y - 10 + bob, 1, 2, '#7dff9a');
      var bx = x + f * 9;
      line(c, bx, y - 6 + bob, bx, y + 9, '#4a3b5c', 2);
      circ(c, bx, y - 9 + bob, 3, '#e8e6d0'); R(c, bx - 1.5, y - 9 + bob, 1, 1, '#222'); R(c, bx + 0.5, y - 9 + bob, 1, 1, '#222');
      var fl = 2 + p.castFlash * 8 + Math.sin(t * 9);
      c.globalAlpha = 0.5; circ(c, bx, y - 15 + bob, fl + 2, '#7dff9a'); c.globalAlpha = 1; circ(c, bx, y - 15 + bob, fl, '#b8ffcb');
      for (i = 0; i < p.souls; i++) {
        var wa = t * 3 + i * 6.2832 / 5;
        circ(c, x + Math.cos(wa) * 15, y - 2 + Math.sin(wa) * 6 + bob, 1.8, '#7dff9a');
      }
    }
    if (p.bloodTime > 0 && p.bloodMarks) {
      c.save(); c.globalAlpha = Math.min(0.9, p.bloodTime / 5 * 0.9); c.fillStyle = '#a0141d';
      for (var spl = 0; spl < p.bloodMarks.length; spl++) {
        var mark = p.bloodMarks[spl];
        c.beginPath(); c.ellipse(x + mark.x, y + bob + mark.y, mark.r, mark.r * 0.7, 0, 0, 6.2832); c.fill();
      }
      c.restore();
    }
  }

  function drawMinion(c, m, cam) {
    var x = m.x - cam.x, y = m.y - cam.y, f = m.face, w = Math.sin(m.anim * 12);
    var sc = m.spawn > 0 ? 1 - m.spawn / 0.35 : 1;
    c.globalAlpha = m.life < 3 ? (Math.sin(m.life * 14) > 0 ? 1 : 0.4) : 1;
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x, y + 6, 6, 2.5, 0, 0, 6.2832); c.fill();
    R(c, x - 3, y + 2, 2, 5 * sc + w * 0.5, '#d8d4bc'); R(c, x + 1, y + 2, 2, 5 * sc - w * 0.5, '#d8d4bc');
    R(c, x - 3, y - 4, 6, 7 * sc, '#e8e6d0'); R(c, x - 3, y - 1, 6, 1, '#9a977f');
    circ(c, x, y - 7, 4, '#f2f0dc');
    R(c, x - 2 + f, y - 8, 1, 2, '#111'); R(c, x + 1 + f, y - 8, 1, 2, '#111');
    var swing = m.atkCd > 0.45 ? -1 : 0;
    line(c, x + f * 4, y - 1, x + f * 9, y - 6 + swing * 3, '#b8b4a0', 2);
    if (m.hp < m.maxHp) { R(c, x - 5, y - 13, 10, 2, '#300'); R(c, x - 5, y - 13, 10 * clamp(m.hp / m.maxHp, 0, 1), 2, '#7dff9a'); }
    c.globalAlpha = 1;
  }

  function drawFx(c, f, cam) {
    var x = f.x - cam.x, y = f.y - cam.y, a = clamp(f.t / f.max, 0, 1);
    c.globalAlpha = a;
    if (f.kind === 'arc') {
      var ar = f.r * (0.75 + 0.25 * (1 - a));
      c.lineCap = 'round';
      c.strokeStyle = f.col; c.globalAlpha = a * 0.35; c.lineWidth = 6 + 8 * a; // soft outer glow
      c.beginPath(); c.arc(x, y, ar, f.a - f.half, f.a + f.half); c.stroke();
      c.globalAlpha = a; c.lineWidth = 2 + 5 * a;
      c.beginPath(); c.arc(x, y, ar, f.a - f.half, f.a + f.half); c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = 1 + 1.5 * a; // bright edge
      c.beginPath(); c.arc(x, y, ar, f.a - f.half * 0.8, f.a + f.half * 0.8); c.stroke();
      c.lineCap = 'butt';
    } else if (f.kind === 'ring') {
      var rad = f.r * (1 - a * a);
      c.fillStyle = f.col; c.globalAlpha = a * 0.15; c.beginPath(); c.arc(x, y, rad, 0, 6.2832); c.fill();
      c.globalAlpha = a; c.strokeStyle = f.col; c.lineWidth = 2 + 2 * a; c.beginPath(); c.arc(x, y, rad, 0, 6.2832); c.stroke();
    } else if (f.kind === 'beam') {
      var tx = (f.ref && alive(f.ref) ? f.ref.x : f.x2) - cam.x, ty = (f.ref && alive(f.ref) ? f.ref.y : f.y2) - cam.y;
      var px = !f.remote && hero() ? hero().x - cam.x : x, py = !f.remote && hero() ? hero().y - cam.y : y;
      c.strokeStyle = f.col; c.lineWidth = 1 + 3 * a; c.beginPath(); c.moveTo(px, py);
      for (var i = 1; i < 6; i++) c.lineTo(px + (tx - px) * i / 6 + rnd(-3, 3), py + (ty - py) * i / 6 + rnd(-3, 3));
      c.lineTo(tx, ty); c.stroke();
    } else { // puff
      c.fillStyle = f.col; c.beginPath(); c.arc(x, y, f.r * (1.2 - a * 0.6), 0, 6.2832); c.fill();
    }
    c.globalAlpha = 1;
  }

  function drawProj(c, s, cam) {
    if (s.preRolledCrit && CC.CriticalScene && CC.CriticalScene.drawProjectile) {
      CC.CriticalScene.drawProjectile(c, s, cam);
      return;
    }
    var x = s.x - cam.x, y = s.y - cam.y;
    if (s.kind === 'wave') { // a crescent of cutting light
      c.save(); c.translate(x, y); c.rotate(s.a);
      c.strokeStyle = s.col; c.lineCap = 'round'; c.globalAlpha = 0.35; c.lineWidth = 6; c.beginPath(); c.arc(-6, 0, 11, -1.0, 1.0); c.stroke();
      c.globalAlpha = 1; c.lineWidth = 2.6; c.beginPath(); c.arc(-6, 0, 11, -1.0, 1.0); c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.beginPath(); c.arc(-6, 0, 11, -0.8, 0.8); c.stroke(); c.restore();
      return;
    }
    if (s.kind === 'shard') {
      c.save(); c.translate(x, y); c.rotate(s.a);
      poly(c, [-5, 0, 0, -2, 6, 0, 0, 2], '#e8e6d0'); c.restore();
    } else {
      if (typeof s.a === 'number') { // fading comet trail
        for (var tn = 1; tn <= 4; tn++) {
          c.globalAlpha = 0.28 - tn * 0.055;
          circ(c, x - Math.cos(s.a) * tn * s.r * 1.1, y - Math.sin(s.a) * tn * s.r * 1.1, Math.max(1, s.r - tn * 0.6), s.col);
        }
      }
      c.globalAlpha = 0.18; circ(c, x, y, s.r + 7, s.col);
      c.globalAlpha = 0.3; circ(c, x, y, s.r + 4, s.col); c.globalAlpha = 1;
      circ(c, x, y, s.r, s.col); circ(c, x, y, s.r * 0.5, '#ffffff');
    }
  }

  var perkRects = [];
  function drawPerkPanel(c, p) {
    var cv = c.canvas, W = root.innerWidth || (cv && cv.width) || 360, H = root.innerHeight || (cv && cv.height) || 640;
    var dpr = cv && cv.width && root.innerWidth ? cv.width / root.innerWidth : 1;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = 'rgba(8,4,16,0.78)'; c.fillRect(0, 0, W, H);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 22px "Trebuchet MS", Verdana, sans-serif'; c.fillStyle = '#ffe08a';
    c.fillText('LEVEL ' + p.level + ' - CHOOSE A PERK', W / 2, Math.max(40, H * 0.16));
    var cw = Math.min(W - 32, 340), ch = 74, x = (W - cw) / 2, y0 = Math.max(70, H * 0.16 + 30);
    perkRects = [];
    for (var i = 0; i < p.perkChoices.length; i++) {
      var pk = p.perkChoices[i], y = y0 + i * (ch + 12);
      perkRects.push({ x: x, y: y, w: cw, h: ch });
      c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x, y, cw, ch);
      c.strokeStyle = p.color; c.lineWidth = 2; c.strokeRect(x, y, cw, ch);
      c.font = 'bold 17px "Trebuchet MS", Verdana, sans-serif'; c.fillStyle = p.color; c.fillText(pk.name, W / 2, y + 24);
      c.font = '13px "Trebuchet MS", Verdana, sans-serif'; c.fillStyle = '#e6defa'; c.fillText(pk.desc, W / 2, y + 50);
    }
    c.restore();
  }

  function drawPlayer(c, cam) {
    var p = hero();
    if (!p) return;
    var px = p.x - cam.x, py = p.y - cam.y, col = p.color || '#ffffff';
    // class-coloured ground aura, brighter while casting or attacking
    var act = Math.max(p.castFlash || 0, (p.atkAnim || 0) * 2, p.whirlT > 0 ? 0.4 : 0);
    c.save();
    c.globalAlpha = 0.14 + act * 0.5 + 0.04 * Math.sin(p.anim * 3);
    c.fillStyle = col; c.beginPath(); c.ellipse(px, py + 9, 12 + act * 12, 4.5 + act * 4, 0, 0, 6.2832); c.fill();
    c.restore();
    if (p.invuln > 0 && p.hp > 0 && Math.sin(p.invuln * 60) > 0) c.globalAlpha = 0.5;
    if(p.teleportPhase){
      var tp=p.teleportPhase,tpart=tp.t/tp.duration;
      // Violet smoke / azure rune stream covers the vanished hero; no
      // fake ground-traversing dash frames during teleport.
      c.globalAlpha*=!tp.shifted?Math.max(.025,1-tpart*2.65):
        Math.max(.08,Math.min(1,(tpart-.48)*2.45));
    }
    // squash and stretch: lean into movement, stretch on attack
    var sq = p.moving ? 1 + Math.sin(p.anim * 14) * 0.04 : 1 + Math.sin(p.anim * 3) * 0.015, st = (p.atkAnim || 0) > 0 ? 1.08 : 1;
    c.save(); c.translate(px, py + 10); c.scale(st / sq, sq * (2 - st)); c.translate(-px, -(py + 10));
    drawHero(c, p, px, py);
    c.restore();
    if (p.hp > 0 && p.maxHp && p.hp / p.maxHp < 0.3) { // wounded: blood drip
      c.globalAlpha = 0.8; R(c, px - 3 + Math.sin(p.anim * 2) * 2, py + 2 + ((p.anim * 14) % 8), 1, 3, '#a01418');
    }
    c.globalAlpha = 1;
  }

  function drawCriticalHero(c,cam,pose){
    var p=hero();if(!p)return;
    var x=(Number.isFinite(pose.sourceX)?pose.sourceX:p.x)-cam.x,
        y=(Number.isFinite(pose.sourceY)?pose.sourceY:p.y)-cam.y,
        clone=Object.create(p);
    clone.criticalPose=pose;clone.moving=false;clone.atkAnim=0;
    clone.invuln=0;clone.face=Math.cos(pose.angle)>=0?1:-1;
    var scale=pose.heroClass==='swordsman'?1.35:1.30;
    c.save();c.translate(x,y);c.scale(scale,scale);c.translate(-x,-y);
    drawHero(c,clone,x,y);
    c.restore();
  }

  function draw(c, cam) {
    var p = hero();
    if (!p) return;
    var i;
    for (i = 0; i < fxs.length; i++) if (fxs[i].kind === 'ring' || fxs[i].kind === 'puff') drawFx(c, fxs[i], cam);
    for (i = 0; i < minions.length; i++) drawMinion(c, minions[i], cam);
    drawPlayer(c, cam);
    var fl = foes(); // white hit flash over struck enemies
    for (i = 0; i < fl.length; i++) {
      var en = fl[i];
      if (en._hitFlash > 0 && alive(en)) {
        c.globalAlpha = Math.min(0.7, en._hitFlash * 6); c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(en.x - cam.x, en.y - cam.y - (en.r || 8) * 0.3, (en.r || 8) + 3, 0, 6.2832); c.fill();
        c.globalAlpha = 1;
      }
    }
    for (i = 0; i < projs.length; i++) drawProj(c, projs[i], cam);
    for (i = 0; i < fxs.length; i++) if (fxs[i].kind === 'arc' || fxs[i].kind === 'beam') drawFx(c, fxs[i], cam);
    if (p.perkOpen && p.perkChoices) drawPerkPanel(c, p);
  }

  /* ---------- perk picking input (taps / keys 1-3) ---------- */
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('pointerdown', function (e) {
      var p = hero();
      if (!p || !p.perkOpen) return;
      e.stopPropagation(); e.preventDefault();
      for (var i = 0; i < perkRects.length; i++) {
        var r = perkRects[i];
        if (e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h) { choosePerk(i, p); return; }
      }
    }, true);
    root.addEventListener('keydown', function (e) {
      var p = hero();
      if (!p || !p.perkOpen) return;
      var n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (n !== undefined) choosePerk(n, p);
    });
  }

  CC.Classes = {
    DEFS: DEFS, PERKS: PERKS, minions: minions, projectiles: projs,
    create: create, update: update, draw: draw, drawPlayer: drawPlayer, drawHero: drawHero,
    drawCriticalHero: drawCriticalHero, critRadius: critRadius,
    gainXp: gainXp, xpToNext: xpToNext, damage: damage, heal: heal, damageMinion: damageMinion,
    applyItemStats: applyItemStats, choosePerk: choosePerk, hitEnemy: hitEnemy, status: status,
    tapAction:tapAction,summonCharged:summonCharged,
    addRemoteFx: addRemoteFx, addRemoteProjectile: addRemoteProjectile, drawMinion: drawMinion,
    get player() { return hero(); }
  };
})();
