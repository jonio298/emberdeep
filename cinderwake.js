/* CC.Cinderwake - the furnace beneath the abandoned village's cellar vault. */
(function (root) {
  'use strict';
  const CC = root.CC = root.CC || {};
  const T = CC.TILE || 32;
  const WIDTH = 44, HEIGHT = 36;
  const ENEMY = {
    wretch: 'sootwretch', moth: 'embermoth', crawler: 'slagcrawler',
    wraith: 'candlewraith', boss: 'hearthkeeper'
  };
  const FLOORS = [
    {
      name: 'Ashfall Stair', ground: [84, 76, 72], wall: '#262020', ember: '214,120,48',
      rooms: [[7, 7, 4], [19, 8, 4], [19, 17, 4], [7, 23, 4], [25, 28, 5]],
      packs: [[ENEMY.moth, ENEMY.wretch], [ENEMY.moth], [ENEMY.wretch, ENEMY.moth], [ENEMY.wretch]],
      ghost: { name: 'Sister Imre', lines: [
        'I rang the bell the night it tolled alone. I wanted to stop it. My hands were already warm.',
        'The warmth is the worst of it. It never felt like being taken.',
        'The founders fed years of their lives to the Emberdeep. In return, the winters stayed away.'
      ] }
    },
    {
      name: 'The Slag Warrens', ground: [58, 46, 44], wall: '#5c3024', ember: '255,150,40',
      rooms: [[35, 27, 4], [25, 25, 5], [15, 25, 4], [11, 13, 5], [30, 9, 5]],
      packs: [[ENEMY.wretch, ENEMY.moth], [ENEMY.crawler], [ENEMY.crawler, ENEMY.wraith], [ENEMY.moth, ENEMY.wraith]],
      ghost: { name: 'Tomas Reeve', lines: [
        'Count the marks, traveller. Every one is a year. That one is my father, that one my sister.',
        'I scratched my own mark last. It did not feel like a choice.',
        'When the village stopped paying, the furnace took us all. We are the years it never finished taking.'
      ] }
    },
    {
      name: 'The Hearth', ground: [120, 110, 100], wall: '#1a1618', ember: '255,196,96',
      rooms: [[22, 29, 4], [22, 22, 5], [22, 10, 8]],
      packs: [[ENEMY.wraith, ENEMY.crawler, ENEMY.wraith, ENEMY.crawler]],
      ghost: { name: 'The Ledger-Clerk', lines: [
        'Halric said the books must balance. They never did. He kept adding the next generation to the page.',
        'Do not read the last line. It has your name on it, in any hand.'
      ] }
    }
  ];
  const PACK_OFFSETS = [[-2, 2], [2, 2], [-2, -2], [2, -2]];
  const ACTION_RANGE = 54;
  let shownMap = null, titleAt = 0, speech = null;

  function seeded(seed) {
    return function () {
      let n = seed = (seed + 0x6D2B79F5) >>> 0;
      n = Math.imul(n ^ (n >>> 15), n | 1);
      n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }

  function point(tx, ty) {
    return { tx, ty, x: (tx + 0.5) * T, y: (ty + 0.5) * T };
  }

  function generate(floor, seed) {
    if (!Number.isInteger(floor) || floor < 1 || floor > FLOORS.length) {
      throw new RangeError('Cinderwake floor must be 1, 2, or 3');
    }
    seed = Number.isFinite(seed) ? seed >>> 0 : (Math.random() * 0x100000000) >>> 0;
    const rng = seeded(seed ^ Math.imul(floor, 0x9E3779B9));
    const layout = FLOORS[floor - 1];
    const tiles = new Uint8Array(WIDTH * HEIGHT).fill(1);
    const kind = new Uint8Array(WIDTH * HEIGHT).fill(9);

    function carve(cx, cy, radius) {
      for (let y = Math.max(1, cy - radius); y <= Math.min(HEIGHT - 2, cy + radius); y++) {
        for (let x = Math.max(1, cx - radius); x <= Math.min(WIDTH - 2, cx + radius); x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
          tiles[y * WIDTH + x] = 0;
          kind[y * WIDTH + x] = 0;
        }
      }
    }

    const rooms = layout.rooms.map(([x, y, radius]) => {
      const room = point(x + Math.floor(rng() * 3) - 1, y + Math.floor(rng() * 3) - 1);
      carve(room.tx, room.ty, radius);
      return room;
    });
    for (let i = 1; i < rooms.length; i++) {
      const from = rooms[i - 1], to = rooms[i];
      const corner = rng() < 0.5 ? point(from.tx, to.ty) : point(to.tx, from.ty);
      for (let x = Math.min(from.tx, to.tx); x <= Math.max(from.tx, to.tx); x++) carve(x, corner.ty, 1);
      for (let y = Math.min(from.ty, to.ty); y <= Math.max(from.ty, to.ty); y++) carve(corner.tx, y, 1);
    }

    const spawn = rooms[0], landing = rooms[1], last = rooms[rooms.length - 1];
    const finalFloor = floor === FLOORS.length;
    const exit = finalFloor ? point(spawn.tx + 3, spawn.ty) : null;
    const retreat = floor === 1 ? point(spawn.tx - 3, spawn.ty) : null;
    const ghost = { ...point(landing.tx, landing.ty - 3), ...layout.ghost, nextLine: 0 };
    const props = [{ ...ghost, draw: drawGhost }];
    const at = (room, dx, dy) => point(room.tx + dx, room.ty + dy);
    let bellPoint = null;
    const secrets = [], lore = [], extraChests = [];
    const chest = (room, dx, dy, tier) => extraChests.push({ ...at(room, dx, dy), opened: false, tier });
    if (exit || retreat) props.push({ ...(exit || retreat), draw: drawReturn });
    if (floor === 1) {
      bellPoint = point(landing.tx + 2, landing.ty - 2);
      props.push({ ...bellPoint, draw: drawBell });
      lore.push({ id: 'page', ...at(landing, -2, -1), taken: false,
        name: 'A Torn Ledger Page', text: 'A column of years, in two hands. The second hand is Halric Vane\'s, and it never stops adding.' });
      secrets.push({ id: 'brazier', ...at(rooms[2], -3, -1), done: false, chest: { ...at(rooms[2], -3, 1), tier: 2 } });
      chest(rooms[3], 3, 0, 1); chest(rooms[4], 3, 1, 1);
    }
    if (floor === 2) {
      props.push({ ...point(landing.tx, landing.ty - 4), draw: drawTallies });
      lore.push({ id: 'coin', ...at(rooms[3], 3, -3), taken: false,
        name: 'A Founder\'s Coin', text: 'Stamped with a flame. On the back, scratched in: one year.' });
      secrets.push({ id: 'candle', ...at(landing, 3, -3), done: false, chest: { ...at(landing, -3, -3), tier: 3 } });
      chest(rooms[2], 3, 0, 1); chest(rooms[3], -3, 0, 2); chest(rooms[4], -3, 2, 2);
    }
    if (finalFloor) {
      props.push({ ...point(last.tx, last.ty - 6), draw: drawFurnace });
      secrets.push({ id: 'ash', ...at(last, -3, -1), done: false, chest: { ...at(last, -3, 2), tier: 3 } });
      chest(landing, 3, 1, 2);
    }
    for (const secret of secrets) props.push({ ...secret, secret, draw: drawSecret });
    for (const item of lore) props.push({ ...item, item, draw: drawLore });

    const enemySpawns = layout.packs.flatMap((pack, i) => pack.map((type, slot) => {
      const room = rooms[i + 1], [dx, dy] = PACK_OFFSETS[slot];
      return { ...point(room.tx + dx, room.ty + dy), type };
    }));
    const chests = [];
    if (finalFloor) {
      enemySpawns.push({ ...point(last.tx, last.ty - 3), type: ENEMY.boss });
      chests.push({ ...point(last.tx + 3, last.ty - 4), opened: false, tier: 3 });
    }
    chests.push(...extraChests);

    const map = CC.Realm.create({
      name: layout.name, w: WIDTH, h: HEIGHT, tiles, kind, spawn,
      stairs: finalFloor ? undefined : last, enemySpawns, chests, props,
      lights: rooms.map((room) => ({
        x: room.x, y: room.y, r: room === last && finalFloor ? 175 : 96,
        color: layout.ember, inten: 0.52, flicker: 0.11
      })),
      ambient: '24,10,6,0.76', playerLight: 125, viewR: 170,
      fog: 0.15, fogColor: '132,113,100',
      ground(kind, shade) {
        const variation = Math.floor(shade * 14);
        return 'rgb(' + layout.ground.map((channel) => channel + variation).join(',') + ')';
      },
      detail(c, kind, x, y, shade, time) {
        drawSeam(c, x, y, shade, time, layout.ember);
      },
      drawSolid(c, kind, x, y, shade) {
        drawWall(c, x, y, shade, layout.wall);
      },
      drawStairs(c, x, y) { drawSteps(c, x, y, false); },
      afterLight: drawAsh
    });
    return Object.assign(map, { floor, seed, exit, retreat, ghost, secrets, lore, bell: bellPoint, cinderwake: true });
  }

  function drawSeam(c, x, y, shade, time, ember) {
    c.fillStyle = 'rgba(23,16,16,0.26)';
    c.fillRect(x + shade * (T - 8), y + 5, 7, 2);
    if (shade < 0.91) return;
    const glow = 0.46 + 0.24 * Math.sin(time * 3 + shade * 73);
    c.strokeStyle = 'rgba(' + ember + ',' + glow + ')';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x + 4, y + T - 4);
    c.lineTo(x + T * 0.52, y + T * 0.4);
    c.lineTo(x + T - 3, y + T * 0.51);
    c.stroke();
  }

  function drawWall(c, x, y, shade, wall) {
    c.fillStyle = wall;
    c.fillRect(x, y, T, T);
    c.fillStyle = 'rgba(210,158,121,0.18)';
    c.fillRect(x, y, T, 4);
    c.fillStyle = 'rgba(12,7,9,0.44)';
    c.fillRect(x, y + T - 4, T, 4);
    c.fillRect(x + shade * (T - 3), y + 4, 2, T - 8);
  }

  function drawSteps(c, x, y, ascending) {
    c.fillStyle = '#201719';
    c.fillRect(x - 16, y - 13, 32, 26);
    c.fillStyle = ascending ? '#edd1a3' : '#ba8c70';
    for (let i = 0; i < 4; i++) {
      const inset = (ascending ? 3 - i : i) * 2;
      c.fillRect(x - 13 + inset, y - 9 + i * 5, 26 - inset * 2, 2);
    }
  }

  function drawReturn(c, x, y) {
    drawSteps(c, x, y, true);
    c.save();
    c.textAlign = 'center';
    c.font = 'bold 10px Georgia, serif';
    c.fillStyle = '#edd1a3';
    c.fillText('CELLAR VAULT', x, y - 20);
    c.restore();
  }

  function drawGhost(c, x, y, time) {
    c.save();
    c.translate(x, y + 3 * Math.sin(time * 1.6));
    c.globalAlpha *= 0.74 + 0.16 * Math.sin(time * 2.4);
    c.fillStyle = '#c6cbd8';
    c.beginPath();
    c.arc(0, -23, 6, 0, Math.PI * 2);
    c.fill();
    const fade = c.createLinearGradient(0, -19, 0, 8);
    fade.addColorStop(0, '#c6cbd8');
    fade.addColorStop(1, 'rgba(149,155,177,0)');
    c.fillStyle = fade;
    c.beginPath();
    c.moveTo(-5, -19);
    c.quadraticCurveTo(-11, -8, -14, 8);
    c.quadraticCurveTo(0, 1, 13, 8);
    c.quadraticCurveTo(10, -8, 5, -19);
    c.closePath();
    c.fill();
    c.fillStyle = '#423b45';
    c.fillRect(-3, -24, 2, 2);
    c.fillRect(2, -24, 2, 2);
    c.restore();
  }

  function drawBell(c, x, y) {
    c.fillStyle = '#664939';
    c.beginPath();
    c.ellipse(x, y - 5, 14, 10, -0.35, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#291c1c';
    c.fillRect(x - 2, y - 12, 2, 13);
  }

  function drawSecret(c, x, y, time, cam, prop) {
    const secret = prop && prop.secret, done = secret && secret.done;
    if (!secret) return;
    if (secret.id === 'ash') { // the lectern holding Vane's book of years; a gap in the ash in front of it
      c.fillStyle = '#2a2020'; c.fillRect(x - 9, y - 13, 18, 20);
      c.fillStyle = done ? '#b88867' : '#caa27a'; c.fillRect(x - 8, y - 15, 16, 5);
      c.fillStyle = 'rgba(8,4,4,0.5)'; c.beginPath(); c.ellipse(x, y + 10, 14, 4, 0, 0, Math.PI * 2); c.fill();
      return;
    }
    if (secret.id === 'candle') { // a lit candle on the Tally Wall
      c.fillStyle = '#e8dcc0'; c.fillRect(x - 2, y - 8, 4, 9);
      if (!done) {
        const f = 0.6 + 0.4 * Math.sin(time * 9);
        c.fillStyle = 'rgba(255,190,80,' + (0.22 * f) + ')'; c.beginPath(); c.arc(x, y - 12, 20, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffd36b'; c.beginPath(); c.ellipse(x, y - 12, 2.2, 3.6 * f + 1, 0, 0, Math.PI * 2); c.fill();
      } else { c.strokeStyle = 'rgba(190,190,190,0.5)'; c.beginPath(); c.moveTo(x, y - 9); c.quadraticCurveTo(x + 3, y - 15, x - 2, y - 21); c.stroke(); }
      return;
    }
    c.fillStyle = '#3a2a24'; c.fillRect(x - 8, y - 4, 16, 8); // a brazier
    c.fillStyle = '#241a18'; c.fillRect(x - 6, y + 3, 12, 6);
    if (!done) {
      const f = 0.7 + 0.3 * Math.sin(time * 11);
      c.fillStyle = 'rgba(255,150,40,' + (0.3 * f) + ')'; c.beginPath(); c.arc(x, y - 8, 22, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ff7a1a'; c.beginPath(); c.ellipse(x, y - 8, 5, 8 * f, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffd36b'; c.beginPath(); c.ellipse(x, y - 6, 2.4, 4 * f, 0, 0, Math.PI * 2); c.fill();
    } else { c.fillStyle = 'rgba(90,80,76,0.6)'; c.fillRect(x - 5, y - 6, 10, 3); }
  }

  function drawLore(c, x, y, time, cam, prop) {
    if (!prop || !prop.item || prop.item.taken) return;
    const glint = 0.5 + 0.5 * Math.sin(time * 3 + x);
    c.fillStyle = 'rgba(255,225,160,' + (0.25 + 0.25 * glint) + ')'; c.beginPath(); c.arc(x, y - 2, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#d9c79a'; c.fillRect(x - 4, y - 5, 8, 7);
    c.fillStyle = '#7a6040'; c.fillRect(x - 3, y - 3, 6, 1); c.fillRect(x - 3, y - 1, 4, 1);
  }

  function drawTallies(c, x, y) {
    c.fillStyle = '#392624';
    c.fillRect(x - 21, y - 20, 42, 24);
    c.strokeStyle = '#b88867';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 9; i++) {
      c.moveTo(x - 16 + i * 4, y - 15);
      c.lineTo(x - 15 + i * 4, y - 4);
    }
    c.moveTo(x - 18, y - 7);
    c.lineTo(x + 2, y - 13);
    c.stroke();
  }

  function drawFurnace(c, x, y, time) {
    c.fillStyle = '#4e342d';
    c.fillRect(x - 42, y - 47, 84, 53);
    c.fillStyle = '#201719';
    c.fillRect(x - 34, y - 40, 68, 43);
    c.fillStyle = 'rgba(255,175,71,' + (0.67 + 0.22 * Math.sin(time * 5)) + ')';
    c.fillRect(x - 30, y - 7, 60, 3);
    c.fillRect(x - 1, y - 36, 2, 30);
    c.save();
    c.textAlign = 'center';
    c.font = 'bold 11px Georgia, serif';
    c.fillStyle = '#f0b775';
    c.fillText('EMBERDEEP', x, y - 53);
    c.restore();
  }

  function drawAsh(c, cam, map) {
    if (map && map.cwDone) return; // the ash stops falling once the Hearthkeeper is down
    const time = map._t;
    const width = cam.w + 16, height = cam.h + 16;
    for (let i = 0; i < 52; i++) {
      const x = (i * 147.73 + time * (4 + i % 3)) % width - 8;
      const y = (i * 67.37 + time * (9 + i % 7)) % height - 8;
      const opacity = 0.34 + 0.17 * Math.sin(time * 2 + i * 1.4);
      c.fillStyle = 'rgba(219,204,188,' + opacity + ')';
      c.fillRect(x, y, i % 5 === 0 ? 2 : 1, 2);
    }
  }

  function activeMap() {
    const state = CC.state;
    if (state && state.area === 'cinderwake' && state.map && state.map.cinderwake) return state.map;
    return null;
  }

  function nearTarget(map) {
    const player = CC.state && CC.state.player;
    if (!map || !player || player.stub) return null;
    const exit = map.exit || map.retreat;
    if (exit && Math.hypot(player.x - exit.x, player.y - exit.y) <= ACTION_RANGE) return exit;
    if (Math.hypot(player.x - map.ghost.x, player.y - map.ghost.y) <= ACTION_RANGE) return map.ghost;
    return null;
  }

  function showTitle(map) {
    if (shownMap === map) return;
    shownMap = map;
    titleAt = Date.now();
    speech = null;
  }

  function enter() {
    if (!CC.enterCinderwake || CC.enterCinderwake() === false) return false;
    showTitle(activeMap());
    return true;
  }

  function leave() {
    if (!CC.leaveCinderwake || CC.leaveCinderwake() === false) return false;
    showTitle(null);
    return true;
  }

  function nearAction() {
    return !!nearTarget(activeMap());
  }

  function interact() {
    const map = activeMap();
    const target = nearTarget(map);
    if (!target) return false;
    if (target !== map.ghost) return leave();
    showTitle(map);
    const text = target.lines[target.nextLine];
    target.nextLine = (target.nextLine + 1) % target.lines.length;
    speech = { name: target.name, text, until: Date.now() + 6500 };
    return true;
  }

  function drawOverlay(c, width, height) {
    const map = activeMap();
    showTitle(map);
    if (!map) return;
    const now = Date.now();
    const elapsed = (now - titleAt) / 1000;
    if (elapsed < 5) {
      c.save();
      c.globalAlpha = Math.min(1, elapsed / 0.55, (5 - elapsed) / 1.25);
      c.textAlign = 'center';
      c.shadowColor = '#6f2e17';
      c.shadowBlur = 12;
      c.fillStyle = '#ffe4c8';
      c.font = 'italic ' + Math.min(42, width / 9) + 'px Georgia, serif';
      c.fillText('The Cinderwake', width / 2, height * 0.28);
      c.font = '18px Georgia, serif';
      c.fillText(map.name, width / 2, height * 0.28 + 28);
      c.restore();
    }
    if (speech && now < speech.until && CC.DialogBox) {
      CC.DialogBox.draw(c, width, height, function () {}, { name: speech.name, text: speech.text, low: true });
    }
  }

  // lets the story module speak through the same dialogue box the ghosts use
  function say(name, text, ms) {
    speech = { name, text, until: Date.now() + (ms || 6500) };
  }

  CC.Cinderwake = { generate, enter, leave, interact, nearAction, drawOverlay, say, activeMap };
})(window);
