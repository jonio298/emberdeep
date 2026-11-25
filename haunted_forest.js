/* The Haunted Woods and its wedding-ring quest.
 * The shell owns travel (village.forestTrail, forest.exit) and persists serialize()/restore().
 * In the 'haunted-forest' area, interact() searches map.ringSite. The village ghost calls
 * speakToQuestGiver(). The shell should dispatch mutating interactions on the co-op host.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var T = CC.TILE || 32, W = 43, H = 39, TAU = Math.PI * 2;
  var HF = CC.HauntedForest = { map: null, questName: 'Till Death', rewardGold: 150 };
  var questStage = 'unstarted';

  HF.stage = function () { return questStage; };
  HF.serialize = function () { return { stage: questStage }; };
  HF.reset = function () { questStage = 'unstarted'; };
  HF.restore = function (data) {
    var stage = data && data.stage;
    questStage = ['accepted', 'ring-found', 'completed'].indexOf(stage) >= 0 ? stage : 'unstarted';
  };

  function hero() {
    var player = CC.state && CC.state.player;
    return player && !player.stub ? player : null;
  }

  function saveProgress() {
    if (CC.SaveGame && CC.SaveGame.save) CC.SaveGame.save();
  }

  HF.speakToQuestGiver = function () {
    if (questStage === 'unstarted') {
      questStage = 'accepted';
      saveProgress();
      return 'My Rowan went into the woods wearing our wedding ring. Take the north trail from the square. Follow the pale figures to the split oak. Bring me his ring, if you find him.';
    }
    if (questStage === 'accepted') {
      return 'Straight north from the square. Follow the pale figures through the fog. Rowan always waited for me beneath the split oak.';
    }
    if (questStage === 'ring-found') {
      CC.state.gold = (CC.state.gold || 0) + HF.rewardGold;
      questStage = 'completed';
      saveProgress();
      return 'His ring. He kept his promise. Thank you for bringing him home to me. Take the ' + HF.rewardGold + ' gold we saved for spring.';
    }
    return 'I can still feel him holding my hand.';
  };

  function nearby(site) {
    var player = hero();
    return player && Math.hypot(player.x - site.x, player.y - site.y) < 54;
  }

  function activeMap() {
    return CC.state && CC.state.area === 'haunted-forest' && CC.Dungeon === HF.map ? HF.map : null;
  }

  HF.nearAction = function () {
    var map = activeMap();
    return !!(map && nearby(map.ringSite));
  };

  HF.nearExit = function () {
    var map = activeMap();
    return !!(map && nearby(map.exit));
  };

  HF.interact = function () {
    if (!HF.nearAction()) return false;
    var site = HF.map.ringSite, text;
    if (questStage === 'accepted') {
      questStage = 'ring-found';
      text = 'Wedding ring found. Return to Elsie.';
      saveProgress();
    } else if (questStage === 'unstarted') {
      text = 'An old skeleton. Who was buried here?';
    } else {
      text = 'The bones lie still.';
    }
    if (CC.fx && CC.fx.text) CC.fx.text(site.x, site.y - 25, text, '#f7dca0', 14);
    return true;
  };

  function point(tx, ty) {
    return { tx: tx, ty: ty, x: (tx + 0.5) * T, y: (ty + 0.5) * T };
  }

  function seeded(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) >>> 0;
      var t = Math.imul(seed ^ (seed >>> 15), seed | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  HF.generate = function (fixedSeed) {
    var seed = Number.isFinite(fixedSeed) ? fixedSeed >>> 0 : (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    var rng = seeded(seed);
    var tiles = new Uint8Array(W * H).fill(1), kind = new Uint8Array(W * H).fill(3);
    var eyes = [], apparitions = [];
    var exit = point(21, H - 3), spawn = point(21, H - 5);
    var bend = 5 + Math.floor(rng() * 4);
    var ringSite = point(21 - bend, 6);

    function carve(cx, cy, radius, terrain) {
      for (var y = cy - radius; y <= cy + radius; y++) {
        for (var x = cx - radius; x <= cx + radius; x++) {
          if (x < 1 || x >= W - 1 || y < 1 || y >= H - 1) continue;
          if (Math.hypot(x - cx, y - cy) > radius) continue;
          tiles[y * W + x] = 0;
          kind[y * W + x] = terrain;
        }
      }
    }

    var trail = [];
    for (var y = exit.ty; y >= ringSite.ty; y--) {
      var u = (exit.ty - y) / (exit.ty - ringSite.ty);
      var x = Math.round(21 - bend * u + 6 * Math.sin(TAU * u));
      trail[y] = x;
      carve(x, y, 3, 0);
    }
    // Side paths end in clearings. The apparitions remain on the route to the oak.
    var forks = [{ y: 27, dx: 9 }, { y: 15, dx: -8 }];
    forks.forEach(function (fork) {
      var start = trail[fork.y];
      for (var step = 1; step <= Math.abs(fork.dx); step++) {
        carve(start + Math.sign(fork.dx) * step, fork.y - Math.floor(step / 3), 2, 0);
      }
      carve(start + fork.dx, fork.y - Math.floor(Math.abs(fork.dx) / 3), 3, 0);
    });
    carve(ringSite.tx, ringSite.ty, 4, 0);
    for (var ty = exit.ty; ty >= ringSite.ty; ty--) carve(trail[ty], ty, 1, 2);

    for (var row = 34; row >= 8; row -= 2) {
      [-1, 1].forEach(function (side) {
        var tx = trail[row];
        while (tx > 0 && tx < W - 1 && !tiles[row * W + tx]) tx += side;
        var eye = point(tx, row);
        eye.color = side < 0 ? '#ffd84f' : '#ff4841';
        eye.phase = rng() * 4;
        eyes.push(eye);
      });
    }
    for (var ghostY = 32; ghostY >= 8; ghostY -= 4) {
      var ghost = point(trail[ghostY], ghostY);
      ghost.dx = (trail[ghostY - 2] - ghost.tx) * T * 0.44;
      ghost.dy = -T * 0.85;
      ghost.phase = rng() * 5;
      apparitions.push(ghost);
    }
    // The skeleton rests at the foot of the split oak.
    var props = [
      { x: exit.x, y: exit.y, draw: drawExit },
      { x: ringSite.x, y: ringSite.y - T * 0.85, front: true, draw: drawOak },
      { x: ringSite.x, y: ringSite.y, draw: drawSkeleton }
    ];
    var map = CC.Realm.create({
      name: 'The Haunted Woods', w: W, h: H, tiles: tiles, kind: kind, spawn: spawn, props: props,
      ambient: '9,13,21,0.65', playerLight: 205, viewR: 245, viewBoost: 1.1,
      fog: 0.8, fogColor: '139,161,160', ground: ground, detail: detail,
      drawSolid: drawTree, afterLight: drawHauntings
    });
    map.seed = seed;
    map.exit = exit;
    map.ringSite = ringSite;
    map.eyes = eyes;
    map.apparitions = apparitions;
    HF.map = map;
    return map;
  };

  function oval(c, x, y, rx, ry, color) {
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, TAU);
    c.fill();
  }

  function ground(kind, variance) {
    var shade = Math.floor(variance * 10);
    return kind === 2 ? 'rgb(' + (41 + shade) + ',' + (40 + shade) + ',36)'
      : 'rgb(' + (20 + shade) + ',' + (30 + shade) + ',28)';
  }

  function detail(c, kind, x, y, variance) {
    if (variance > 0.72) {
      oval(c, x + T * variance, y + T * 0.65, 3, 1.5, kind === 2 ? '#6d624a' : '#43513d');
    }
  }

  function drawTree(c, kind, x, y, variance) {
    x += T * 0.5;
    y += T * 0.94;
    var h = 36 + variance * 42, lean = (variance - 0.5) * 18;
    oval(c, x, y, 18, 4, 'rgba(0,0,0,.32)');
    c.save();
    c.fillStyle = variance > 0.5 ? '#232628' : '#292a2a';
    c.beginPath();
    c.moveTo(x - 6, y);
    c.quadraticCurveTo(x - 4, y - h * 0.45, x + lean, y - h);
    c.quadraticCurveTo(x + 4, y - h * 0.45, x + 8, y);
    c.fill();
    c.strokeStyle = c.fillStyle;
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x, y - h * 0.35);
    c.quadraticCurveTo(x - 22, y - h * 0.58, x - 20, y - h * 0.85);
    c.moveTo(x, y - h * 0.55);
    c.quadraticCurveTo(x + 23, y - h * 0.68, x + 28, y - h * 0.92);
    c.stroke();
    c.restore();
  }

  function drawOak(c, x, y) {
    oval(c, x, y + 1, 39, 8, 'rgba(0,0,0,.55)');
    c.fillStyle = '#514740';
    c.beginPath();
    c.moveTo(x - 24, y);
    c.quadraticCurveTo(x - 7, y - 33, x - 32, y - 87);
    c.quadraticCurveTo(x - 12, y - 79, x, y - 56);
    c.quadraticCurveTo(x + 9, y - 92, x + 34, y - 100);
    c.quadraticCurveTo(x + 11, y - 50, x + 24, y);
    c.fill();
  }

  function drawExit(c, x, y) {
    c.save();
    c.fillStyle = '#494037';
    c.fillRect(x - 2, y - 30, 4, 30);
    c.fillStyle = '#625748';
    c.fillRect(x - 34, y - 33, 68, 14);
    c.fillStyle = '#e2d5ac';
    c.font = 'bold 9px Georgia';
    c.textAlign = 'center';
    c.fillText('TO VILLAGE', x, y - 23);
    c.restore();
  }

  function drawSkeleton(c, x, y, t) {
    oval(c, x, y + 3, 24, 8, '#252624');
    oval(c, x - 11, y - 8, 7, 6, '#e7e0cb');
    oval(c, x - 13, y - 8, 1.5, 1.7, '#252624');
    oval(c, x - 8, y - 8, 1.5, 1.7, '#252624');
    c.save();
    c.strokeStyle = '#d0c8b4';
    c.lineWidth = 2.3;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x - 9, y - 2);
    c.lineTo(x + 10, y + 4);
    c.lineTo(x + 22, y + 1);
    c.moveTo(x + 10, y + 4);
    c.lineTo(x + 19, y + 10);
    c.moveTo(x - 5, y);
    c.lineTo(x + 1, y - 8);
    c.lineTo(x + 10, y - 9);
    for (var i = 0; i < 4; i++) {
      c.moveTo(x - 7 + i * 4, y + 5 + i);
      c.quadraticCurveTo(x - 3 + i * 4, y + i, x - 5 + i * 4, y - 4 + i);
    }
    c.stroke();
    if (questStage === 'accepted') {
      c.shadowColor = '#ffcf62';
      c.shadowBlur = 5 + 4 * (1 + Math.sin(t * 5));
      c.strokeStyle = '#ffdf87';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(x + 11, y - 9, 2.8, 0, TAU);
      c.stroke();
    }
    c.restore();
  }

  function drawApparition(c, x, y, opacity) {
    c.save();
    c.globalAlpha *= opacity;
    var glow = c.createRadialGradient(x, y - 19, 3, x, y - 19, 35);
    glow.addColorStop(0, 'rgba(174,224,228,.32)');
    glow.addColorStop(1, 'rgba(174,224,228,0)');
    c.fillStyle = glow;
    c.fillRect(x - 35, y - 54, 70, 70);
    c.fillStyle = '#b8d8da';
    c.beginPath();
    c.moveTo(x - 9, y - 23);
    c.quadraticCurveTo(x, y - 31, x + 9, y - 23);
    c.quadraticCurveTo(x + 11, y - 9, x + 3, y + 6);
    c.quadraticCurveTo(x + 5, y, x - 3, y + 3);
    c.quadraticCurveTo(x - 12, y - 8, x - 9, y - 23);
    c.fill();
    oval(c, x, y - 31, 5, 7, '#e0efea');
    c.restore();
  }

  function drawHauntings(c, cam, map) {
    var t = map._t;
    function visible(x, y) {
      return x > -50 && y > -50 && x < cam.w + 50 && y < cam.h + 50
        && map.isVisible(x + cam.x, y + cam.y);
    }
    c.save();
    map.eyes.forEach(function (eye) {
      var x = eye.x - cam.x, y = eye.y - cam.y - 13;
      if (!visible(x, y)) return;
      var blink = (t + eye.phase) % 4;
      var height = blink < 0.24 ? 0.3 + 1.65 * Math.abs(blink / 0.12 - 1) : 1.95;
      c.shadowBlur = 10;
      c.shadowColor = eye.color;
      oval(c, x - 3.5, y, 2.35, height, eye.color);
      oval(c, x + 3.5, y, 2.35, height, eye.color);
    });
    c.shadowBlur = 0;
    map.apparitions.forEach(function (ghost) {
      var phase = ((t + ghost.phase) % 5) / 5;
      var x = ghost.x - cam.x + ghost.dx * phase;
      var y = ghost.y - cam.y + ghost.dy * phase + 3 * Math.sin(t * 2 + ghost.phase);
      if (visible(x, y)) drawApparition(c, x, y, 0.19 + 0.60 * Math.sin(phase * Math.PI));
    });
    if (HF.map === map && HF.nearAction()) {
      c.font = 'bold 12px Georgia';
      c.textAlign = 'center';
      c.fillStyle = '#f2e5ca';
      c.fillText('[F] Search remains', map.ringSite.x - cam.x, map.ringSite.y - cam.y - 26);
    }
    c.restore();
  }
})(window);
