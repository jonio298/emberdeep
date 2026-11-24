/* Plains Survival director. The shared Endless lifecycle owns active play time. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const TAU = Math.PI * 2;
  const TUNING = {
    nightfallEverySeconds: 300,
    spawnStep: 0.25,
    spawnPerSecondBase: 1.2,
    spawnGrowthPerMinute: 0.35,
    rateCarryover: 0.7,
    calm: { end: 60, rate: 0.7 },
    swell: { end: 210, rate: 1, endRate: 1.6 },
    surge: { end: 270, rate: 2.2, warning: 3, coneCosine: 0.5 },
    dread: { rate: 1.2, warning: 5 },
    population: { base: 90, perLevel: 12, max: 160, multiplier: 0.85 },
    stats: { health: 1.25, damagePerNightfall: 1.15, damageMultiplier: 1.15, speed: 1.06, maxSpeed: 1.4 },
    elite: { chance: 0.04, laterChance: 0.067, laterLevel: 3, health: 2 },
    darknessByLevel: [1, 0.85, 0.70, 0.55, 0.42, 0.32, 0.25],
    heroLightRadius: 150,
    fadeSeconds: 3,
    encounter: { eruptionAt: 1, bossAt: 3, bannerSeconds: 6, size: 7, bossHealthPerLevel: 0.4 },
    placement: { minDistance: 110, warningDistance: 150, approachDistance: 230, warningRadius: 28,
      bossRadius: 20, gap: 12, rewarn: 0.75, angles: 12, radialFactors: [1, 0.8, 1.2], rayStep: 8 },
    crowFlocks: { flankOffset: Math.PI / 3, diveCooldowns: [1.2, 0.7], prepRange: 220 },
    rosters: [
      [['crow', 4], ['bat', 2]],
      [['direwolf', 4]],
      [['mawworm', 3]],
      [['ghost', 3]],
      [['demon', 3]]
    ],
    encounters: [
      { family: 'direwolf', boss: 0, cue: 'Wolves flank. Crows dive in flocks.' },
      { family: 'mawworm', boss: 1, cue: 'The ground stirs. Watch for burrowers.' },
      { family: 'ghost', boss: 2, cue: 'The dead pass through walls.' },
      { family: 'demon', boss: 3, cue: 'Cinder demons bring fire.' }
    ]
  };
  const H = CC.Hordes = { TUNING, state: null };
  const engines = () => CC.Enemies;
  const alive = e => !e.dead && e.hp > 0;
  const clamp01 = n => Math.max(0, Math.min(1, n));
  const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  function seeded(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value + 0x6D2B79F5) >>> 0;
      let n = Math.imul(value ^ value >>> 15, value | 1);
      n ^= n + Math.imul(n ^ n >>> 7, n | 61);
      return ((n ^ n >>> 14) >>> 0) / 0x100000000;
    };
  }

  function start(ctx) {
    const map = CC.Plains.generateSurvival(ctx.run.seed);
    ctx.setMap(map, 'plains');
    H.state = {
      map, random: seeded(ctx.run.seed), tick: 0, budget: 0, level: 0, surge: null,
      regular: [], encounters: [], nightfall: null, crowAngle: 0, crowSide: 1, tracked: new WeakMap()
    };
    if (ctx.run.role !== 'guest') {
      // Keep bone decals. Resurrection would insert an unscaled enemy outside the director's cap.
      const enemies = engines();
      const pileChance = enemies.pileChance;
      enemies.pileChance = () => 0;
      H.state.restorePiles = () => { enemies.pileChance = pileChance; };
    }
  }

  function cleanup() {
    H.state?.restorePiles?.();
    H.state = null;
  }

  function partyMultipliers(ctx) {
    return ctx.run.role !== 'solo' && ctx.livingHeroes().length > 1
      ? CC.Endless.TUNING.coop : { enemyCount: 1, enemyHealth: 1 };
  }

  function cap(level, party) {
    const p = TUNING.population;
    return Math.round(Math.min(p.max, p.base + p.perLevel * level) * party.enemyCount * p.multiplier);
  }

  function rateAt(second, level) {
    const { calm, swell, surge, dread } = TUNING;
    let phaseRate = dread.rate;
    if (second < calm.end) phaseRate = calm.rate;
    else if (second < swell.end) {
      const progress = (second - calm.end) / (swell.end - calm.end);
      phaseRate = swell.rate + (swell.endRate - swell.rate) * progress;
    } else if (second < surge.end) phaseRate = surge.rate;
    const carriedMinutes = level * TUNING.nightfallEverySeconds * TUNING.rateCarryover / 60;
    return (TUNING.spawnPerSecondBase + TUNING.spawnGrowthPerMinute * (second / 60 + carriedMinutes)) * phaseRate * TUNING.population.multiplier;
  }

  function rollType(state, level) {
    const highest = Math.min(level, TUNING.rosters.length - 1);
    const pool = TUNING.rosters.slice(0, highest + 1).flatMap((family, index) =>
      family.map(([type, weight]) => [type, index === highest && level > highest ? weight + level - highest : weight]));
    let pick = state.random() * pool.reduce((total, [, weight]) => total + weight, 0);
    return pool.find(([, weight]) => (pick -= weight) < 0)[0];
  }

  function walkable(map, point, radius) {
    if (map.isSolid(point.x, point.y)) return false;
    for (let i = 0; i < 8; i++) {
      const angle = i * TAU / 8;
      if (map.isSolid(point.x + Math.cos(angle) * radius, point.y + Math.sin(angle) * radius)) return false;
    }
    return true;
  }

  function farFromHeroes(point, heroes) {
    const minimum = TUNING.placement.minDistance ** 2;
    return heroes.every(hero => distanceSquared(hero, point) >= minimum);
  }

  function inView(point, camera) {
    return camera && point.x >= camera.x && point.x <= camera.x + camera.w &&
      point.y >= camera.y && point.y <= camera.y + camera.h;
  }

  function hasOpenApproach(map, hero, point, distance) {
    const samples = Math.ceil(distance / TUNING.placement.rayStep);
    for (let i = 1; i < samples; i++) {
      const f = i / samples;
      if (map.isSolid(hero.x + f * (point.x - hero.x), hero.y + f * (point.y - hero.y))) return false;
    }
    return true;
  }

  function placement(state, heroes, request) {
    const hero = heroes[request.anchor % heroes.length];
    const camera = CC.getCamera?.();
    const warning = request.kind !== 'regular' && request.kind !== 'surge';
    const radius = request.kind === 'boss' ? TUNING.placement.bossRadius : engines().TYPES[request.type].r;
    const preferred = warning ? TUNING.placement.warningDistance : TUNING.placement.approachDistance;
    const directionX = Math.cos(request.angle);
    const directionY = Math.sin(request.angle);
    const minimum = TUNING.placement.minDistance;
    const { gap, warningRadius, angles, radialFactors } = TUNING.placement;
    const nearby = engines().list.filter(alive);
    let best = null;
    let bestScore = Infinity;
    function consider(point, local) {
      const dx = point.x - hero.x;
      const dy = point.y - hero.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < minimum || (heroes.length > 1 && !farFromHeroes(point, heroes))) return;
      const fit = (directionX * dx + directionY * dy) / distance;
      if (request.kind === 'surge' && fit < TUNING.surge.coneCosine) return;
      const visible = inView(point, camera);
      const viewCost = camera && (warning ? !visible : visible) ? preferred : 0;
      const score = Math.abs(distance - preferred) +
        (1 - fit) * preferred + viewCost;
      if (score >= bestScore || !walkable(state.map, point, radius)) return;
      if (local && !hasOpenApproach(state.map, hero, point, distance)) return;
      const occupied = nearby.some(e => distanceSquared(e, point) < (e.r + radius + gap) ** 2);
      const reserved = state.encounters.some(other => other !== request && other.point &&
        distanceSquared(other.point, point) < warningRadius ** 2);
      if (occupied || reserved) return;
      bestScore = score;
      best = point;
    }
    // The map supplies reachable fallback positions around the arena. Sample
    // nearer open approaches so a warning can land on the player's screen.
    for (let i = 0; i < angles; i++) {
      const angle = request.angle + i * TAU / angles;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      for (const factor of radialFactors) {
        const distance = preferred * factor;
        consider({ x: hero.x + dx * distance, y: hero.y + dy * distance }, true);
      }
    }
    for (const point of state.map.enemySpawns) consider(point, false);
    return best;
  }

  function scale(enemy, base, level, party) {
    const s = TUNING.stats;
    const healthFraction = enemy.hp / enemy.maxHp;
    const bossHealth = enemy.boss ? 1 + TUNING.encounter.bossHealthPerLevel * level : 1;
    const speed = Math.min(s.maxSpeed, s.speed ** level);
    enemy.maxHp = Math.max(1, Math.round(base.hp * s.health ** level * party.enemyHealth * bossHealth));
    enemy.hp = enemy.maxHp * healthFraction;
    enemy.dmg = Math.round(base.damage * s.damagePerNightfall ** level) * s.damageMultiplier;
    enemy.spd *= speed / base.speedMultiplier;
    base.speedMultiplier = speed;
  }

  function spawn(state, request, point, party) {
    const enemy = engines().spawn(request.type, point.x, point.y, 1, { awake: true, bossIdx: request.boss });
    if (request.elite) {
      enemy.elite = true;
      enemy.affixes = [];
      enemy.maxHp *= TUNING.elite.health;
      enemy.hp = enemy.maxHp;
    }
    if (enemy.boss) {
      // Let the encounter director provide the adds through the capped queue.
      const { def } = enemy;
      enemy.def = { ...def, p1: def.p1.filter(a => a !== 'summon'), p2: def.p2.filter(a => a !== 'summon') };
      enemy.miniBoss = true;
      engines().bossBar = enemy.bar;
    }
    const base = { hp: enemy.maxHp, damage: enemy.dmg, speedMultiplier: 1 };
    state.tracked.set(enemy, base);
    scale(enemy, base, state.level, party);
    if (request.crowSide) {
      enemy.strafe = request.crowSide;
      enemy.cd = TUNING.crowFlocks.diveCooldowns[Math.min(state.level, 2) - 1];
    }
  }

  function queueEncounter(state, heroes, time, level, party) {
    const spec = TUNING.encounters[(level - 1) % TUNING.encounters.length];
    state.level = level;
    state.nightfall = { time, cue: spec.cue };
    for (const enemy of engines().list) {
      const base = state.tracked.get(enemy);
      if (!base || !alive(enemy)) continue;
      scale(enemy, base, level, party);
      if (enemy.type === 'crow' && enemy.state === 'idle' &&
          heroes.some(hero => Math.hypot(hero.x - enemy.x, hero.y - enemy.y) < TUNING.crowFlocks.prepRange)) {
        enemy.cd = TUNING.crowFlocks.diveCooldowns[Math.min(level, 2) - 1];
      }
    }
    const { eruptionAt, bossAt, size } = TUNING.encounter;
    const angle = state.random() * TAU;
    const boss = { kind: 'boss', type: 'boss', boss: spec.boss, angle, anchor: 0, due: time + bossAt };
    state.encounters.push(boss);
    for (let i = 0; i < size; i++) {
      state.encounters.push({ kind: 'eruption', type: spec.family, due: time + eruptionAt,
        angle: angle + i * TAU / size, anchor: i });
    }
    CC.Audio?.event?.('thunder', { vol: 0.35 });
    if (!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) CC.fx?.shake?.(4);
  }

  function regularRequest(state, heroes, time) {
    const type = rollType(state, state.level);
    const anchor = Math.floor(state.random() * heroes.length);
    const hero = heroes[anchor];
    const local = hero === CC.state.player;
    const vx = local ? CC.input?.moveX ?? 0 : hero.vx ?? 0;
    const vy = local ? CC.input?.moveY ?? 0 : hero.vy ?? 0;
    let angle = (vx || vy) && state.random() < 0.5
      ? Math.atan2(vy, vx) + (state.random() - 0.5) * Math.PI
      : state.random() * TAU;
    const surge = state.surge && time >= state.surge.start && time < state.surge.end;
    if (surge) angle = state.surge.angle;
    let crowSide = 0;
    if (type === 'crow' && state.level > 0) {
      crowSide = state.crowSide;
      if (crowSide === 1) state.crowAngle = angle;
      if (!surge) angle = state.crowAngle + crowSide * TUNING.crowFlocks.flankOffset;
      state.crowSide *= -1;
    }
    const e = TUNING.elite;
    const elite = state.level > 0 && state.random() < (state.level >= e.laterLevel ? e.laterChance : e.chance);
    return { type, kind: surge ? 'surge' : 'regular', angle, anchor, elite, crowSide,
      surgeEnd: surge ? state.surge.end : null };
  }

  function drain(state, heroes, time, limit, party) {
    let live = engines().list.filter(alive).length;
    for (let i = 0; i < state.encounters.length;) {
      const request = state.encounters[i];
      if (request.point && !farFromHeroes(request.point, heroes)) request.point = null;
      if (!request.point) {
        request.point = placement(state, heroes, request);
        request.ready = Math.max(request.due, time + TUNING.placement.rewarn);
      }
      if (request.point && time >= request.ready && live < limit) {
        spawn(state, request, request.point, party);
        state.encounters.splice(i, 1);
        live++;
      } else {
        i++;
      }
    }
    // Give announced encounters the first open slots, including while their markers are arming.
    const reserved = state.encounters.filter(request => request.due <= time).length;
    for (let i = 0; i < state.regular.length && live < limit - reserved;) {
      const request = state.regular[i];
      if (request.kind === 'surge' && time >= request.surgeEnd) request.kind = 'regular';
      const point = placement(state, heroes, request);
      if (!point) {
        i++;
        continue;
      }
      spawn(state, request, point, party);
      state.regular.splice(i, 1);
      live++;
    }
  }

  function update(_dt, ctx) {
    const state = H.state;
    const heroes = ctx.livingHeroes();
    if (!heroes.length) return;
    const party = partyMultipliers(ctx);
    const step = TUNING.spawnStep;
    const cycle = TUNING.nightfallEverySeconds;
    const targetTick = Math.floor(ctx.run.seconds / step + 1e-8);
    while (state.tick < targetTick) {
      const time = ++state.tick * step;
      const second = time % cycle;
      const previousLevel = Math.floor((time - step) / cycle);
      const limit = cap(previousLevel, party);
      // The midpoint keeps the integrated budget independent of render frame size.
      state.budget += step * rateAt((time - step / 2) % cycle, previousLevel) * party.enemyCount;
      const count = Math.floor(state.budget);
      state.budget -= count;
      for (let i = 0; i < count && state.regular.length < limit; i++) {
        state.regular.push(regularRequest(state, heroes, time - step / 2));
      }
      if (second === TUNING.swell.end - TUNING.surge.warning) {
        const start = time + TUNING.surge.warning;
        const probe = { kind: 'regular', type: 'crow', anchor: 0, angle: state.random() * TAU };
        const point = placement(state, heroes, probe);
        state.surge = { warned: time, start, end: start + TUNING.surge.end - TUNING.swell.end,
          angle: point ? angleTo(heroes[0], point) : probe.angle };
        CC.Audio?.event?.('thunder', { vol: 0.22 });
      }
      if (second === 0) queueEncounter(state, heroes, time, previousLevel + 1, party);
      drain(state, heroes, time, cap(state.level, party), party);
    }
  }

  function depth(ctx) {
    const level = ctx.run.role === 'guest' ? ctx.run.level : H.state.level;
    return { level, label: level ? 'NIGHTFALL ' + roman(level) : 'ROLLING PLAINS' };
  }

  function roman(level) {
    let label = '';
    for (const [amount, symbol] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'],
      [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
      label += symbol.repeat(Math.floor(level / amount));
      level %= amount;
    }
    return label;
  }

  function lighting(ctx) {
    const levels = TUNING.darknessByLevel;
    const depthLevel = ctx.run.role === 'guest' ? ctx.run.level : H.state.level;
    const level = Math.min(levels.length - 1, depthLevel);
    const time = ctx.run.seconds % TUNING.nightfallEverySeconds;
    const light = { levels, level, radius: TUNING.heroLightRadius };
    if (level > 0 && level === depthLevel && time < TUNING.fadeSeconds) {
      const t = clamp01(time / TUNING.fadeSeconds);
      light.transition = { fromLevel: level - 1, progress: t * t * (3 - 2 * t) };
    }
    return light;
  }

  function draw(canvas, cam, ctx) {
    const time = ctx.run.seconds;
    canvas.save();
    canvas.lineWidth = 2;
    for (const request of H.state.encounters) {
      if (!request.point) continue;
      const { x, y } = request.point;
      const sx = x - cam.x;
      const sy = y - cam.y;
      const radius = TUNING.placement.warningRadius;
      const progress = clamp01(1 - (request.ready - time) / TUNING.encounter.bossAt);
      canvas.strokeStyle = request.kind === 'boss' ? '#ffe0b8' : '#ffc6cb';
      canvas.fillStyle = 'rgba(100, 12, 32, 0.4)';
      canvas.beginPath();
      canvas.arc(sx, sy, radius, 0, TAU);
      canvas.fill();
      canvas.stroke();
      canvas.beginPath();
      canvas.arc(sx, sy, radius * progress, 0, TAU);
      canvas.stroke();
    }
    canvas.restore();
  }

  function drawHud(canvas, width, height, _button, ctx) {
    const time = ctx.run.seconds;
    const surge = H.state.surge;
    const nightfall = H.state.nightfall;
    const relative = time % TUNING.nightfallEverySeconds;
    const cycle = TUNING.nightfallEverySeconds;
    let label;
    let detail;
    if (nightfall && time - nightfall.time < TUNING.encounter.bannerSeconds) {
      label = depth(ctx).label;
      detail = nightfall.cue;
    } else if (surge && time >= surge.warned && time < surge.start) {
      label = 'SURGE IN ' + Math.ceil(surge.start - time);
    } else if (relative >= cycle - TUNING.dread.warning) {
      label = 'NIGHTFALL APPROACHES';
    }
    if (!label) return;
    canvas.save();
    canvas.fillStyle = 'rgba(20, 10, 24, 0.9)';
    canvas.fillRect(width / 2 - 145, height * 0.24, 290, 48);
    canvas.fillStyle = '#fff0d5';
    canvas.textAlign = 'center';
    canvas.font = 'bold 16px sans-serif';
    canvas.fillText(label, width / 2, height * 0.24 + 20);
    canvas.font = '12px sans-serif';
    if (detail) canvas.fillText(detail, width / 2, height * 0.24 + 37);
    if (surge && time >= surge.warned && time < surge.start) {
      canvas.translate(width / 2, height * 0.24 + 35);
      canvas.rotate(surge.angle);
      canvas.beginPath();
      canvas.moveTo(11, 0);
      canvas.lineTo(-6, 6);
      canvas.lineTo(-6, -6);
      canvas.closePath();
      canvas.fill();
    }
    canvas.restore();
  }

  function kill(enemy) {
    if (!enemy.boss || !H.state.tracked.has(enemy)) return;
    H.state.map.chests.push({ x: enemy.x, y: enemy.y, opened: false });
    if (engines().boss !== enemy) return;
    engines().boss = engines().list.find(e => e.boss && alive(e)) || null;
    engines().bossBar = engines().boss?.bar || null;
  }

  Object.assign(H, { start, startGuest: start, update, cleanup, depth, lighting, draw, drawHud, kill });
  CC.Endless.registerDirector('plains', H);
})(typeof window !== 'undefined' ? window : globalThis);
