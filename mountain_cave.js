/* CC.MountainCave - three connected cave floors reached from the Rocky Pass.
 * generate(floor, seed) returns a Realm map. Floors 1 and 2 have stairs.
 * Floor 3 has the reward chest and map.exit, the return point to the pass.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var T = CC.TILE || 32, W = 42, H = 34;
  var floors = [
    { name: 'The Bat Galleries', color: [73, 64, 59],
      rooms: [[6, 25], [16, 23], [16, 11], [29, 8], [35, 16]],
      enemies: [['bat', 'bat'], ['bat', 'skeleton'], ['bat', 'bat'], ['skeleton']] },
    { name: 'The Broken Vein', color: [53, 66, 73],
      rooms: [[35, 26], [24, 25], [24, 15], [11, 15], [7, 7]],
      enemies: [['bat', 'skeleton'], ['skeleton', 'screegolem'], ['bat', 'skeleton'], ['screegolem']] },
    { name: 'The Deep Vault', color: [64, 53, 73],
      rooms: [[8, 7], [19, 9], [30, 13], [27, 26], [12, 25]],
      enemies: [['skeleton', 'bat'], ['ghost', 'screegolem'], ['skeleton', 'ghost'], ['screegolem', 'ghost']] }
  ];

  function seeded(seed) {
    return function () {
      var n = seed = (seed + 0x6D2B79F5) >>> 0;
      n = Math.imul(n ^ (n >>> 15), n | 1);
      n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }

  function point(tx, ty) {
    return { x: (tx + 0.5) * T, y: (ty + 0.5) * T, tx: tx, ty: ty };
  }

  function drawRock(ctx, kind, x, y, shade) {
    ctx.fillStyle = shade < 0.5 ? '#27242e' : '#2d2934';
    ctx.fillRect(x, y, T, T);
    ctx.fillStyle = '#423a48';
    ctx.fillRect(x, y, T, 5);
    ctx.fillStyle = 'rgba(12,10,15,0.28)';
    ctx.fillRect(x + Math.floor(shade * (T - 3)), y + 5, 2, T - 5);
  }

  function drawStairs(ctx, x, y) {
    ctx.fillStyle = '#1b1821';
    ctx.fillRect(x - 14, y - 12, 28, 24);
    ctx.fillStyle = '#a19488';
    for (var step = 0; step < 4; step++) {
      ctx.fillRect(x - 11 + step * 2, y - 8 + step * 4, 22 - step * 4, 2);
    }
  }

  function drawExit(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#70616f';
    ctx.fillRect(x - 17, y - 24, 34, 28);
    ctx.fillStyle = '#25202c';
    ctx.fillRect(x - 12, y - 19, 24, 23);
    ctx.fillStyle = '#e1b985';
    ctx.beginPath();
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x - 8, y - 10);
    ctx.lineTo(x - 3, y - 10);
    ctx.lineTo(x - 3, y);
    ctx.lineTo(x + 3, y);
    ctx.lineTo(x + 3, y - 10);
    ctx.lineTo(x + 8, y - 10);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 10px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('ROCKY PASS', x, y - 30);
    ctx.restore();
  }

  function generate(floor, seed) {
    if (!Number.isInteger(floor) || floor < 1 || floor > floors.length) {
      throw new RangeError('Mountain Cave floor must be 1, 2, or 3');
    }
    seed = Number.isFinite(seed) ? seed >>> 0 : (Math.random() * 0x100000000) >>> 0;
    var rng = seeded(seed ^ Math.imul(floor, 0x9E3779B9));
    var layout = floors[floor - 1];
    var tiles = new Uint8Array(W * H).fill(1);
    var kind = new Uint8Array(W * H).fill(9);

    function carve(cx, cy, radius) {
      for (var y = Math.max(1, cy - radius); y <= Math.min(H - 2, cy + radius); y++) {
        for (var x = Math.max(1, cx - radius); x <= Math.min(W - 2, cx + radius); x++) {
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > radius * radius) continue;
          tiles[y * W + x] = 0;
          kind[y * W + x] = 0;
        }
      }
    }

    function tunnel(from, to) {
      var horizontalFirst = rng() < 0.5;
      var corner = horizontalFirst ? { tx: to.tx, ty: from.ty } : { tx: from.tx, ty: to.ty };
      for (var y = Math.min(from.ty, to.ty); y <= Math.max(from.ty, to.ty); y++) {
        carve(corner.tx, y, 1);
      }
      for (var x = Math.min(from.tx, to.tx); x <= Math.max(from.tx, to.tx); x++) {
        carve(x, corner.ty, 1);
      }
    }

    // Jitter the chambers around each floor's route and join them with three-tile-wide tunnels.
    var rooms = layout.rooms.map(function (anchor) {
      var room = point(anchor[0] + Math.floor(rng() * 3) - 1, anchor[1] + Math.floor(rng() * 3) - 1);
      carve(room.tx, room.ty, rng() < 0.5 ? 4 : 5);
      carve(room.tx + (rng() < 0.5 ? -3 : 3), room.ty + (rng() < 0.5 ? -2 : 2), 3);
      return room;
    });
    for (var i = 1; i < rooms.length; i++) tunnel(rooms[i - 1], rooms[i]);

    var lastRoom = rooms[rooms.length - 1], finalFloor = floor === floors.length;
    var chests = [], props = [];
    if (finalFloor) {
      var reward = point(lastRoom.tx - 2, lastRoom.ty);
      reward.opened = false;
      reward.tier = 1;
      chests.push(reward);
      var exit = point(lastRoom.tx, lastRoom.ty - 3);
      props.push({ x: exit.x, y: exit.y, draw: drawExit });
    }

    var spawns = [];
    layout.enemies.forEach(function (types, index) {
      var room = rooms[index + 1];
      var order = rng() < 0.5 ? -1 : 1;
      types.forEach(function (type, slot) {
        var mob = point(room.tx + 2 * order * (slot === 0 ? 1 : -1), room.ty + 2);
        mob.type = type;
        spawns.push(mob);
      });
    });

    var map = CC.Realm.create({
      name: 'Mountain Cave - ' + layout.name,
      w: W, h: H, tiles: tiles, kind: kind, spawn: rooms[0],
      stairs: finalFloor ? undefined : lastRoom,
      chests: chests, enemySpawns: spawns, props: props,
      lights: rooms.map(function (room) {
        return { x: room.x, y: room.y, r: 90, color: '198,154,112', inten: 0.24 };
      }),
      ambient: '13,10,23,0.76', playerLight: 145, viewR: 180, fog: 0.09, fogColor: '118,104,145',
      ground: function (kind, shade) {
        var color = layout.color, variation = Math.floor(shade * 12);
        return 'rgb(' + (color[0] + variation) + ',' + (color[1] + variation) + ',' + (color[2] + variation) + ')';
      },
      drawSolid: drawRock, drawStairs: drawStairs
    });
    map.seed = seed;
    map.floor = floor;
    map.exit = exit || null;
    return map;
  }

  CC.MountainCave = { generate: generate };
})(window);
