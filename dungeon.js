/* CC.Dungeon - procedural cave dungeon, tile art and lighting (task t3).
 *
 * API (world coordinates are pixels, CC.TILE = 32 px per tile):
 *   generate(floor[, seed])  build a floor; returns CC.Dungeon
 *   isSolid(x,y)             pixel coords; out of bounds is solid
 *   isSolidTile(tx,ty)       tile coords
 *   moveWithCollision(e,dx,dy)  e = {x,y,r|radius}; mutates e, returns {x,y,hitX,hitY}
 *   draw(ctx,camera)         camera = {x,y (top-left, world px), w,h (view size, world px), zoom?}
 *                            Caller applies zoom/DPR once, as for Classes, Enemies and Loot.
 *                            drawLighting/drawDebug use that same caller-owned transform.
 *                            If CC.Dungeon.deferLighting is true, draw() skips fog/light and the
 *                            caller invokes drawLighting(ctx,camera) after drawing entities.
 *   drawMinimap(ctx,x,y,size)
 *   drawFullMap(ctx,w,h)     full-screen map overlay in screen space (fog-of-war aware: explored tiles only)
 * Secrets: 0-2 sealed rooms per floor in CC.Dungeon.secrets[], each
 *   {id,kind:'chest'|'shrine',door:{tx,ty,x,y},entry,cells,center,found,open,chest|shrine}.
 *   They stay ordinary solid wall (identical art) until discovered (viewer within ~3 tiles with the wall in view -> cracks
 *   fade in), then open when the viewer stands next to the crack for ~0.8s or calls interact(player) / openSecret(s).
 *   Opening carves door + room, plays a crumble animation and adds the guaranteed chest to chests[]; shrines apply on step-on
 *   (useShrine). draw() drives discovery/opening from CC.state.player. updateSecrets(px,py,dt) can also be called directly.
 * Data after generate(): w,h,tiles(1=wall),spawn,stairs,chests,enemySpawns,boss,biome,biomeName,floor.
 * The viewer for light/fog is CC.state.player (x,y) or, failing that, the camera centre.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var T = CC.TILE = CC.TILE || 32;
  var W = 56, H = 56, N = W * H;
  var SIGHT = 9;          // tiles revealed around the viewer
  var LIGHT_R = 7.5;      // tiles of player light radius

  // ---------- helpers ----------
  function rngFrom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; }
  function shade(c, f) {
    var h = hex(c);
    return 'rgb(' + clamp(Math.round(h[0] * f), 0, 255) + ',' + clamp(Math.round(h[1] * f), 0, 255) + ',' + clamp(Math.round(h[2] * f), 0, 255) + ')';
  }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ---------- biomes (one per 5 floors) ----------
  var BIOMES = [
    { name: 'Mossy Caverns', floor: '#4a4d45', wallTop: '#6e7266', wallFace: '#33362f', accent: '#63d46a', accent2: '#c8e86a',
      crystal: '#8ff0a0', mush: '#7be07a', light: [255, 196, 120], ambient: [6, 9, 8], crystalChance: 0.02, mushChance: 0.05 },
    { name: 'Crystal Depths', floor: '#3b4062', wallTop: '#5d6397', wallFace: '#24284d', accent: '#6ad8ff', accent2: '#c68bff',
      crystal: '#6ad8ff', mush: '#c68bff', light: [150, 185, 255], ambient: [5, 6, 16], crystalChance: 0.085, mushChance: 0.015 },
    { name: 'Ember Hollows', floor: '#5c3d33', wallTop: '#85503c', wallFace: '#3a1c19', accent: '#ff7a2a', accent2: '#ffd04a',
      crystal: '#ff6a3a', mush: '#ffb040', light: [255, 150, 70], ambient: [14, 5, 4], crystalChance: 0.05, mushChance: 0.02 },
    { name: 'Bone Crypt', floor: '#5d5b50', wallTop: '#8c8873', wallFace: '#3c382d', accent: '#c8ffb0', accent2: '#e8e0b0',
      crystal: '#b6ffd0', mush: '#d8f0a0', light: [210, 255, 190], ambient: [8, 9, 7], crystalChance: 0.03, mushChance: 0.04 }
  ];
  // Environment pass: two more themes (indices 4, 5 so existing indices stay stable) and per-biome horror/prop tuning.
  BIOMES.push(
    { name: 'Flooded Catacombs', floor: '#37484f', wallTop: '#5f7a80', wallFace: '#1f2e33', accent: '#5ad0e0', accent2: '#a0f0ff',
      crystal: '#7fe8ff', mush: '#6ad0b0', light: [150, 220, 230], ambient: [4, 9, 12], crystalChance: 0.02, mushChance: 0.035 },
    { name: 'Hell-Touched Depths', floor: '#4a2222', wallTop: '#7a2a2a', wallFace: '#2a0c0c', accent: '#ff3030', accent2: '#ffa040',
      crystal: '#ff2a2a', mush: '#ff6a20', light: [255, 90, 60], ambient: [16, 3, 3], crystalChance: 0.04, mushChance: 0.02 }
  );
  // Floors 1-5 Mossy, 6-10 Crypt, 11-15 Flooded, 16-20 Ember, 21-25 Hell-touched, 26-30 Crystal, then repeats.
  var BIOME_ORDER = [0, 3, 4, 2, 5, 1];
  // liquid: pool coverage (blobs per 14 floor tiles); moss/drip: wall + floor decals; fog: drifting haze colour;
  // bones/webs/blood/cage: per-floor-tile prop chance (grows slightly with depth); altar: chance of one altar per floor.
  var THEME = [
    { liquid: 'water', pool: 0.012, moss: 1, drip: '#2f6a3a', fog: [40, 62, 48], bones: 0.006, webs: 0.01, blood: 0.004, cage: 0.002, altar: 0.1 },
    { liquid: null, pool: 0, moss: 0, drip: null, fog: [40, 50, 95], bones: 0.003, webs: 0.006, blood: 0.003, cage: 0.001, altar: 0.05 },
    { liquid: 'lava', pool: 0.02, moss: 0, drip: '#c03010', fog: [75, 30, 14], bones: 0.012, webs: 0.004, blood: 0.01, cage: 0.004, altar: 0.3 },
    { liquid: null, pool: 0, moss: 0, drip: '#6a0c0c', fog: [62, 70, 55], bones: 0.04, webs: 0.03, blood: 0.02, cage: 0.008, altar: 0.5 },
    { liquid: 'water', pool: 0.04, moss: 1, drip: '#2a6a7a', fog: [40, 82, 92], bones: 0.015, webs: 0.01, blood: 0.006, cage: 0.006, altar: 0.25 },
    { liquid: 'lava', pool: 0.035, moss: 0, drip: '#a01010', fog: [92, 20, 14], bones: 0.03, webs: 0.005, blood: 0.04, cage: 0.012, altar: 0.8 }
  ];
  BIOMES.forEach(function (b, i) { b.theme = THEME[i]; });
  var LIQ = { water: { deep: '#123650', shallow: '#2c7a9a', hi: '#9fe0f0', edge: '#0a2030' }, lava: { deep: '#721404', shallow: '#e0480e', hi: '#ffd25a', edge: '#2a0a04' } };
  function biomeIndex(floor) { return BIOME_ORDER[Math.floor((Math.max(1, floor) - 1) / 5) % BIOME_ORDER.length]; }

  // ---------- generation ----------
  function carve(rng, attempt) {
    var g = new Uint8Array(N), x, y, i, it;
    if (attempt < 10) {
      for (y = 0; y < H; y++) for (x = 0; x < W; x++)
        g[y * W + x] = (x === 0 || y === 0 || x === W - 1 || y === H - 1 || rng() < 0.5) ? 1 : 0;
      for (it = 0; it < 5; it++) {
        var n = new Uint8Array(N).fill(1);
        for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
          var c = 0;
          for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++)
            if (dx || dy) c += g[(y + dy) * W + x + dx];
          n[y * W + x] = c > 4 ? 1 : c < 4 ? 0 : g[y * W + x];
        }
        g = n;
      }
    } else { // drunkard's-walk fallback, connected by construction
      g.fill(1); x = W >> 1; y = H >> 1;
      for (i = 0; i < 2600; i++) {
        g[y * W + x] = 0; g[y * W + x + 1] = 0; g[(y + 1) * W + x] = 0;
        var d = (rng() * 4) | 0;
        x = clamp(x + (d === 0 ? 1 : d === 1 ? -1 : 0), 2, W - 4);
        y = clamp(y + (d === 2 ? 1 : d === 3 ? -1 : 0), 2, H - 4);
      }
    }
    return g;
  }

  // keep only the largest open region; returns its size
  function keepLargest(g) {
    var label = new Int32Array(N), best = 0, bestId = 0, id = 0, stack = new Int32Array(N), i;
    for (i = 0; i < N; i++) {
      if (g[i] || label[i]) continue;
      id++;
      var sp = 0, cnt = 0; stack[sp++] = i; label[i] = id;
      while (sp) {
        var c = stack[--sp]; cnt++;
        var cx = c % W, nb = [c - W, c + W, cx > 0 ? c - 1 : -1, cx < W - 1 ? c + 1 : -1];
        for (var k = 0; k < 4; k++) {
          var m = nb[k];
          if (m >= 0 && m < N && !g[m] && !label[m]) { label[m] = id; stack[sp++] = m; }
        }
      }
      if (cnt > best) { best = cnt; bestId = id; }
    }
    for (i = 0; i < N; i++) if (!g[i] && label[i] !== bestId) g[i] = 1;
    return best;
  }

  function bfs(g, start) {
    var dist = new Int16Array(N).fill(-1), q = new Int32Array(N), h = 0, t = 0;
    dist[start] = 0; q[t++] = start;
    while (h < t) {
      var c = q[h++], cx = c % W, nb = [c - W, c + W, cx > 0 ? c - 1 : -1, cx < W - 1 ? c + 1 : -1];
      for (var k = 0; k < 4; k++) {
        var m = nb[k];
        if (m >= 0 && m < N && !g[m] && dist[m] < 0) { dist[m] = dist[c] + 1; q[t++] = m; }
      }
    }
    return dist;
  }

  function open3(g, x, y) {
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++)
      if (g[(y + dy) * W + x + dx]) return false;
    return true;
  }
  function shuffle(a, rng) {
    for (var i = a.length - 1; i > 0; i--) { var j = (rng() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function center(tx, ty) { return { tx: tx, ty: ty, x: tx * T + T / 2, y: ty * T + T / 2 }; }

  // Try to plan a sealed room behind wall tile D next to open floor F, facing dir. Needs the room plus a one-tile ring to be solid
  // and unclaimed, so opening D can only ever connect the room to F. Returns a secret record or null (marks `blocked` on success).
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function trySecret(g, blocked, fx, fy, dir, srng) {
    var dx = dir[0], dy = dir[1], lx = -dy, ly = dx;
    var rw = 3 + ((srng() * 2) | 0), rd = 2 + ((srng() * 2) | 0), lo = (rw - 1) >> 1, hi = rw - 1 - lo, cells = [], k, l;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (k = 2; k <= rd + 1; k++) for (l = -lo; l <= hi; l++) {
      var cx = fx + dx * k + lx * l, cy = fy + dy * k + ly * l;
      cells.push([cx, cy]); x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
    }
    var ex0 = x0 - 1, ey0 = y0 - 1, ex1 = x1 + 1, ey1 = y1 + 1, x, y;
    if (ex0 < 0 || ey0 < 0 || ex1 > W - 1 || ey1 > H - 1) return null;
    for (y = ey0; y <= ey1; y++) for (x = ex0; x <= ex1; x++) if (!g[y * W + x] || blocked[y * W + x]) return null;
    for (y = ey0; y <= ey1; y++) for (x = ex0; x <= ex1; x++) blocked[y * W + x] = 1;
    var kc = 2 + ((rd - 1) >> 1), ctr = center(fx + dx * kc, fy + dy * kc), dr = center(fx + dx, fy + dy);
    return { kind: 'chest', door: dr, entry: center(fx, fy), dir: { x: dx, y: dy }, cells: cells, center: ctr,
      rect: { x0: x0, y0: y0, x1: x1, y1: y1 }, found: false, open: false, foundAt: 0, openAt: 0, dwell: 0, chest: null, shrine: null };
  }
  function lightInto(sl, L) {
    var r0 = Math.ceil(L.r);
    for (var yy = Math.max(0, L.ty - r0); yy <= Math.min(H - 1, L.ty + r0); yy++)
      for (var xx = Math.max(0, L.tx - r0); xx <= Math.min(W - 1, L.tx + r0); xx++) {
        var d = Math.sqrt((xx - L.tx) * (xx - L.tx) + (yy - L.ty) * (yy - L.ty)), v = 1 - d / L.r;
        if (v > 0) { v = v * v * L.inten; if (v > sl[yy * W + xx]) sl[yy * W + xx] = v; }
      }
  }

  var D = CC.Dungeon = {
    w: W, h: H, tiles: new Uint8Array(N).fill(1), floor: 0, biome: 0, biomeName: '',
    chests: [], secrets: [], enemySpawns: [], lights: [], deferLighting: false,
    spawn: center(1, 1), stairs: center(1, 1), boss: null, seed: 0,
    BIOMES: BIOMES, biomeIndex: biomeIndex,

    generate: function (floor, seed) {
      floor = Math.max(1, floor | 0 || 1);
      if (seed === undefined) seed = (Math.random() * 2147483647) | 0;
      var g, region, attempt, rng, i, x, y;
      for (attempt = 0; attempt < 14; attempt++) {
        rng = rngFrom(seed * 2654435761 + floor * 40503 + attempt * 7919);
        g = carve(rng, attempt);
        region = keepLargest(g);
        if (region >= 700 || attempt >= 10 && region >= 300) break;
      }
      // spawn: roomy floor tile
      var floors = [];
      for (i = 0; i < N; i++) if (!g[i]) floors.push(i);
      var roomy = floors.filter(function (k) { var kx = k % W, ky = (k / W) | 0; return kx > 1 && ky > 1 && kx < W - 2 && ky < H - 2 && open3(g, kx, ky); });
      var pool = roomy.length ? roomy : floors;
      var sIdx = pool[(rng() * pool.length) | 0];
      var dist = bfs(g, sIdx);
      // stairs: farthest roomy tile
      var cand = (roomy.length ? roomy : floors).slice().sort(function (a, b) { return dist[b] - dist[a]; });
      var stIdx = cand[0];
      var used = {}; used[sIdx] = 1; used[stIdx] = 1;

      var chests = [], tier = Math.min(3, (floor / 5) | 0);
      var nCh = Math.min(8, 3 + ((rng() * 3) | 0) + ((floor / 5) | 0));
      var spots = shuffle(floors.filter(function (k) { return dist[k] >= 6 && !used[k]; }), rng);
      function far(list, tx, ty, d) {
        for (var q = 0; q < list.length; q++) { var a = list[q].tx - tx, b = list[q].ty - ty; if (a * a + b * b < d * d) return false; }
        return true;
      }
      for (i = 0; i < spots.length && chests.length < nCh; i++) {
        var cx = spots[i] % W, cy = (spots[i] / W) | 0;
        if (far(chests, cx, cy, 6) && (cx - (stIdx % W)) * (cx - (stIdx % W)) + (cy - ((stIdx / W) | 0)) * (cy - ((stIdx / W) | 0)) > 9) {
          var ch = center(cx, cy); ch.opened = false; ch.tier = tier; chests.push(ch); used[spots[i]] = 1;
        }
      }
      var enemies = [], nEn = Math.min(40, 8 + floor * 2);
      spots = shuffle(floors.filter(function (k) { return dist[k] >= 10 && !used[k]; }), rng);
      for (i = 0; i < spots.length && enemies.length < nEn; i++) {
        var ex = spots[i] % W, ey = (spots[i] / W) | 0;
        if (far(enemies, ex, ey, 3)) { enemies.push(center(ex, ey)); used[spots[i]] = 1; }
      }
      var boss = null;
      if (floor % 5 === 0) {
        var near = floors.filter(function (k) { return !used[k] && open3(g, k % W, (k / W) | 0) && dist[k] >= dist[stIdx] - 8; });
        if (near.length) { var bk = near[(rng() * near.length) | 0]; boss = center(bk % W, (bk / W) | 0); }
      }

      // secret rooms: own rng stream so the rest of the layout for a seed is unaffected; tiles stay solid until opened
      var srng = rngFrom(seed * 1597334677 + floor * 69069 + 12345), sr0 = srng();
      var wantSecrets = sr0 < 0.2 ? 0 : sr0 < 0.7 ? 1 : 2, secrets = [], blockedS = new Uint8Array(N), doorMask = new Uint8Array(N);
      var sfl = shuffle(floors.slice(), srng);
      for (i = 0; i < sfl.length && secrets.length < wantSecrets; i++) {
        var sf = sfl[i];
        if (used[sf]) continue;
        var sfx = sf % W, sfy = (sf / W) | 0, sd0 = (srng() * 4) | 0;
        for (var sd = 0; sd < 4; sd++) {
          var sec = trySecret(g, blockedS, sfx, sfy, DIRS[(sd0 + sd) & 3], srng);
          if (!sec) continue;
          sec.id = secrets.length; sec.kind = srng() < 0.6 ? 'chest' : 'shrine';
          if (sec.kind === 'chest') { sec.chest = center(sec.center.tx, sec.center.ty); sec.chest.opened = false; sec.chest.tier = Math.min(3, tier + 1); sec.chest.secret = true; }
          else { sec.shrine = center(sec.center.tx, sec.center.ty); sec.shrine.used = false; sec.shrine.type = srng() < 0.5 ? 'life' : 'fortune'; }
          doorMask[sec.door.ty * W + sec.door.tx] = 1; secrets.push(sec); break;
        }
      }

      // decor + static lights
      var bi = biomeIndex(floor), B = BIOMES[bi];
      var decor = new Uint8Array(N), lights = [], torches = [];
      function addLight(tx, ty, r, col, inten, kind) { lights.push({ tx: tx, ty: ty, x: tx * T + T / 2, y: ty * T + T / 2, r: r, color: col, inten: inten, kind: kind }); }
      for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
        i = y * W + x;
        if (g[i] && !g[i + W] && rng() < 0.07 && far(torches, x, y, 5) && !doorMask[i]) {
          decor[i] = 1; torches.push({ tx: x, ty: y }); addLight(x, y, 5, B.light, 1, 'torch');
        }
      }
      for (i = 0; i < floors.length; i++) {
        var k = floors[i];
        if (used[k]) continue;
        var kx = k % W, ky = (k / W) | 0;
        if (!(g[k - 1] || g[k + 1] || g[k - W] || g[k + W])) continue;
        var r = rng();
        if (r < B.crystalChance) { decor[k] = 2; addLight(kx, ky, 3.2, hex(B.crystal), 0.7, 'crystal'); }
        else if (r < B.crystalChance + B.mushChance) { decor[k] = 3; addLight(kx, ky, 2.5, hex(B.mush), 0.5, 'mush'); }
      }
      // environment: liquid pools (decorative, walkable) and horror props, from their own rng so layouts per seed are unchanged
      var th = B.theme, prng = rngFrom(seed * 1103515245 + floor * 12289 + 4242), liquid = new Uint8Array(N), props = new Uint8Array(N);
      function inner(p) { var px_ = p % W, py_ = (p / W) | 0; return px_ > 1 && py_ > 1 && px_ < W - 2 && py_ < H - 2; }
      if (th.liquid) {
        var nPool = Math.round(floors.length * th.pool / 14) + 1;
        for (i = 0; i < nPool; i++) {
          var cur = floors[(prng() * floors.length) | 0], steps = 12 + ((prng() * 26) | 0);
          if (dist[cur] < 6 || !inner(cur)) continue;
          for (var ps = 0; ps < steps; ps++) {
            if (!g[cur] && !used[cur] && dist[cur] >= 4 && inner(cur)) {
              liquid[cur] = 1;
              if (th.liquid === 'lava' && ((cur % W) * 3 + ((cur / W) | 0) * 5) % 4 === 0) addLight(cur % W, (cur / W) | 0, 2.6, [255, 110, 40], 0.7, 'lava');
            }
            var nx_ = cur + [1, -1, W, -W][(prng() * 4) | 0];
            if (nx_ > W && nx_ < N - W && !g[nx_]) cur = nx_;
          }
        }
      }
      var dk = 1 + floor * 0.03;
      for (i = 0; i < floors.length; i++) {
        var pk = floors[i];
        if (used[pk] || liquid[pk] || decor[pk] || !inner(pk)) continue;
        var pr = prng(), wN = g[pk - W], wC = wN && (g[pk - 1] || g[pk + 1]);
        if (pr < th.bones * dk) props[pk] = 1 + (prng() < 0.4 ? 1 : 0);
        else if (wC && prng() < th.webs * 8 * dk) props[pk] = 3 + (g[pk + 1] ? 16 : 0);
        else if (pr > 0.5 && pr < 0.5 + th.blood * dk) props[pk] = 4;
        else if (pr > 0.8 && pr < 0.8 + th.blood * 1.2 * dk) props[pk] = 5;
        else if (wN && pr > 0.3 && pr < 0.3 + th.cage * dk) props[pk] = 7;
      }
      if (prng() < th.altar) {
        var ac = floors.filter(function (q) { return !used[q] && !liquid[q] && !props[q] && dist[q] >= 8 && inner(q) && open3(g, q % W, (q / W) | 0); });
        if (ac.length) { var ak = ac[(prng() * ac.length) | 0]; props[ak] = 6; used[ak] = 1; addLight(ak % W, (ak / W) | 0, 3.5, [255, 60, 60], 0.75, 'altar'); }
      }
      addLight(stIdx % W, (stIdx / W) | 0, 4, hex(B.accent), 0.8, 'stairs');
      var sl = new Float32Array(N);
      lights.forEach(function (L) { lightInto(sl, L); });

      this.tiles = g; this.floor = floor; this.biome = bi; this.biomeName = B.name; this.seed = seed;
      this.spawn = center(sIdx % W, (sIdx / W) | 0);
      this.stairs = center(stIdx % W, (stIdx / W) | 0);
      this.chests = chests; this.secrets = secrets; this.enemySpawns = enemies; this.boss = boss; this._lastT = 0;
      this.decor = decor; this.liquid = liquid; this.props = props; this.lights = lights; this.staticLight = sl; this.dist = dist;
      this.explored = new Uint8Array(N); this.vis = new Uint8Array(N);
      this._fovKey = -1; this._mmDirty = true;
      this.updateFov(this.spawn.x, this.spawn.y);
      return this;
    },

    // ---------- queries ----------
    // The tile grid is the single source of truth: art, fog and collision all read it.
    // Fractional or non-finite input is floored / treated as solid, never as open floor.
    isSolidTile: function (tx, ty) {
      tx = Math.floor(tx); ty = Math.floor(ty);
      if (!(tx >= 0 && ty >= 0 && tx < W && ty < H)) return true;
      return this.tiles[ty * W + tx] !== 0;
    },
    isSolid: function (x, y) {
      if (!isFinite(x) || !isFinite(y)) return true;
      return this.isSolidTile(Math.floor(x / T), Math.floor(y / T));
    },
    // what the renderer draws for a tile: 'wall' or 'floor' (same rule as isSolidTile)
    tileArt: function (tx, ty) { return this.isSolidTile(tx, ty) ? 'wall' : 'floor'; },

    // ---------- collision debug overlay ----------
    debugGrid: false,
    setDebugGrid: function (on) { this.debugGrid = !!on; return this.debugGrid; },
    toggleDebugGrid: function () { return this.setDebugGrid(!this.debugGrid); },
    // Checks that tileArt and isSolid/isSolidTile agree on every tile (centre, edges, corners)
    // and that spawn, stairs, chests, enemy spawns and boss sit on walkable tiles.
    verifyAlignment: function () {
      var bad = [], e = 0.001, tx, ty, self = this;
      for (ty = -1; ty <= H; ty++) for (tx = -1; tx <= W; tx++) {
        var art = this.tileArt(tx, ty) === 'wall', x0 = tx * T, y0 = ty * T, pts = [
          [x0, y0], [x0 + T - e, y0], [x0, y0 + T - e], [x0 + T - e, y0 + T - e], [x0 + T / 2, y0 + T / 2]];
        if (this.isSolidTile(tx, ty) !== art) bad.push('tile ' + tx + ',' + ty + ' art/solid mismatch');
        for (var k = 0; k < pts.length; k++)
          if (this.isSolid(pts[k][0], pts[k][1]) !== art) { bad.push('pixel probe ' + k + ' of tile ' + tx + ',' + ty); break; }
      }
      function on(name, p) { if (p && self.isSolid(p.x, p.y)) bad.push(name + ' on solid tile ' + p.tx + ',' + p.ty); }
      on('spawn', this.spawn); on('stairs', this.stairs); on('boss', this.boss);
      this.chests.forEach(function (c, i) { on('chest ' + i, c); });
      this.enemySpawns.forEach(function (c, i) { on('enemy ' + i, c); });
      if (this.isSolid(-1, 0) !== true || this.isSolid(0, -1) !== true || this.isSolid(W * T, 0) !== true || this.isSolid(0, H * T) !== true) bad.push('out of bounds not solid');
      if (this.isSolid(NaN, 0) !== true) bad.push('NaN not solid');
      return { ok: bad.length === 0, problems: bad };
    },
    drawDebug: function (ctx, cam) {
      if (!this.tiles) return;
      var v = this._view(ctx, cam);
      ctx.save();
      // The world caller owns zoom and DPR; keep tiles, fog and entities in one transform.
      ctx.translate(-v.cx, -v.cy);
      ctx.lineWidth = 1;
      for (var ty = v.y0; ty <= v.y1; ty++) for (var tx = v.x0; tx <= v.x1; tx++) {
        var solid = this.isSolidTile(tx, ty);
        ctx.fillStyle = solid ? 'rgba(255,40,40,0.28)' : 'rgba(40,255,90,0.12)';
        ctx.fillRect(tx * T, ty * T, T, T);
        ctx.strokeStyle = solid ? 'rgba(255,90,90,0.8)' : 'rgba(90,255,140,0.45)';
        ctx.strokeRect(tx * T + 0.5, ty * T + 0.5, T - 1, T - 1);
      }
      var p = root.CC && CC.state && CC.state.player;
      if (p && typeof p.x === 'number') {
        var r = p.r || p.radius || 10;
        ctx.strokeStyle = '#ffff40'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.stroke();
      }
      ctx.restore();
    },
    isVisible: function (x, y) { var tx = Math.floor(x / T), ty = Math.floor(y / T); return tx >= 0 && ty >= 0 && tx < W && ty < H && this.vis[ty * W + tx] === 1; },
    isExplored: function (x, y) { var tx = Math.floor(x / T), ty = Math.floor(y / T); return tx >= 0 && ty >= 0 && tx < W && ty < H && this.explored[ty * W + tx] === 1; },
    nearStairs: function (e, d) { var a = e.x - this.stairs.x, b = e.y - this.stairs.y; return a * a + b * b <= (d || 26) * (d || 26); },
    openChest: function (c) { if (c && !c.opened) { c.opened = true; return true; } return false; },

    // push a circle out of solid tiles (iterative)
    _resolve: function (e, r) {
      for (var it = 0; it < 4; it++) {
        var moved = false;
        var x0 = Math.floor((e.x - r) / T), x1 = Math.floor((e.x + r) / T);
        var y0 = Math.floor((e.y - r) / T), y1 = Math.floor((e.y + r) / T);
        for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
          if (!this.isSolidTile(tx, ty)) continue;
          var l = tx * T, t = ty * T, rr = l + T, b = t + T;
          var cx = clamp(e.x, l, rr), cy = clamp(e.y, t, b), dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
          if (d2 >= r * r - 1e-6) continue;
          if (d2 > 1e-9) {
            var d = Math.sqrt(d2), p = (r - d) / d; e.x += dx * p; e.y += dy * p;
          } else { // centre inside tile: leave by nearest edge
            var dl = e.x - l, dr = rr - e.x, dt = e.y - t, db = b - e.y, m = Math.min(dl, dr, dt, db);
            if (m === dl) e.x = l - r; else if (m === dr) e.x = rr + r; else if (m === dt) e.y = t - r; else e.y = b + r;
          }
          moved = true;
        }
        if (!moved) break;
      }
    },

    moveWithCollision: function (e, dx, dy) {
      var r = e.r || e.radius || 10, sx0 = e.x, sy0 = e.y;
      var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.5)));
      var sx = dx / steps, sy = dy / steps;
      for (var s = 0; s < steps; s++) { e.x += sx; e.y += sy; this._resolve(e, r); }
      return { x: e.x, y: e.y, hitX: Math.abs(e.x - sx0 - dx) > 0.01, hitY: Math.abs(e.y - sy0 - dy) > 0.01 };
    },

    // ---------- fog of war ----------
    updateFov: function (px, py) {
      var tx = clamp(Math.floor(px / T), 0, W - 1), ty = clamp(Math.floor(py / T), 0, H - 1), key = ty * W + tx;
      if (key === this._fovKey) return;
      this._fovKey = key; this._mmDirty = true;
      var vis = this.vis, ex = this.explored, g = this.tiles;
      vis.fill(0);
      for (var y = Math.max(0, ty - SIGHT); y <= Math.min(H - 1, ty + SIGHT); y++)
        for (var x = Math.max(0, tx - SIGHT); x <= Math.min(W - 1, tx + SIGHT); x++) {
          var ddx = x - tx, ddy = y - ty;
          if (ddx * ddx + ddy * ddy > SIGHT * SIGHT) continue;
          // walk a line from the viewer; stop at the first wall (the wall itself is seen)
          var n = Math.max(Math.abs(ddx), Math.abs(ddy)), ok = true;
          for (var s = 1; s < n; s++) {
            var lx = Math.round(tx + ddx * s / n), ly = Math.round(ty + ddy * s / n);
            if (g[ly * W + lx]) { ok = false; break; }
          }
          if (ok) { vis[y * W + x] = 1; ex[y * W + x] = 1; }
        }
      // any wall touching a visible floor tile is revealed too, so the edge of the walkable area is never a black void
      var y0 = Math.max(1, ty - SIGHT), y1 = Math.min(H - 2, ty + SIGHT), x0 = Math.max(1, tx - SIGHT), x1 = Math.min(W - 2, tx + SIGHT), wy, wx, nIdx;
      for (wy = y0; wy <= y1; wy++) for (wx = x0; wx <= x1; wx++) {
        nIdx = wy * W + wx;
        if (!g[nIdx] || vis[nIdx]) continue;
        if ((!g[nIdx - 1] && vis[nIdx - 1]) || (!g[nIdx + 1] && vis[nIdx + 1]) || (!g[nIdx - W] && vis[nIdx - W]) || (!g[nIdx + W] && vis[nIdx + W]) ||
            (!g[nIdx - W - 1] && vis[nIdx - W - 1]) || (!g[nIdx - W + 1] && vis[nIdx - W + 1]) || (!g[nIdx + W - 1] && vis[nIdx + W - 1]) || (!g[nIdx + W + 1] && vis[nIdx + W + 1])) {
          vis[nIdx] = 1; ex[nIdx] = 1;
        }
      }
    },

    // ---------- secret rooms ----------
    // Carve door + room (idempotent). Returns true when this call opened it.
    openSecret: function (s, t) {
      if (!s || s.open) return false;
      var i, c;
      this.tiles[s.door.ty * W + s.door.tx] = 0;
      for (i = 0; i < s.cells.length; i++) { c = s.cells[i]; this.tiles[c[1] * W + c[0]] = 0; }
      s.open = true; s.found = true; s.openAt = t !== undefined ? t : (this._now || Date.now() / 1000);
      if (s.chest) this.chests.push(s.chest);
      var L = { tx: s.center.tx, ty: s.center.ty, x: s.center.x, y: s.center.y, r: 4.5, color: s.kind === 'shrine' ? [190, 150, 255] : [255, 200, 120], inten: 0.8, kind: 'secret' };
      this.lights.push(L); if (this.staticLight) lightInto(this.staticLight, L);
      this._fovKey = -1; this._mmDirty = true;
      return true;
    },
    // Proximity discovery / dwell-to-open / shrine step-on. px,py = viewer in world px.
    updateSecrets: function (px, py, dt) {
      var list = this.secrets || [], now = this._now || Date.now() / 1000;
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (s.open) {
          var sh = s.shrine;
          if (sh && !sh.used) { var sx = px - sh.x, sy = py - sh.y; if (sx * sx + sy * sy <= (T * 0.9) * (T * 0.9)) this.useShrine(s); }
          continue;
        }
        var dx = px - s.door.x, dy = py - s.door.y, d2 = dx * dx + dy * dy;
        if (!s.found) {
          if (d2 <= (3.2 * T) * (3.2 * T) && this.vis[s.door.ty * W + s.door.tx]) { s.found = true; s.foundAt = now; }
        } else if (d2 <= (1.7 * T) * (1.7 * T)) {
          s.dwell += dt || 0;
          if (s.dwell >= 0.8) this.openSecret(s, now);
        } else s.dwell = Math.max(0, s.dwell - (dt || 0));
      }
    },
    // Explicit interaction: open a crack within reach or use a nearby shrine. Returns {type,secret} or null.
    interact: function (e) {
      if (!e) e = root.CC && CC.state && CC.state.player;
      if (!e) return null;
      var list = this.secrets || [];
      for (var i = 0; i < list.length; i++) {
        var s = list[i], dx = e.x - s.door.x, dy = e.y - s.door.y;
        if (!s.open && dx * dx + dy * dy <= (1.5 * T) * (1.5 * T)) {
          if (!s.found) { s.found = true; s.foundAt = this._now || Date.now() / 1000; }
          this.openSecret(s); return { type: 'secret', secret: s };
        }
        if (s.open && s.shrine && !s.shrine.used) {
          var sx = e.x - s.shrine.x, sy = e.y - s.shrine.y;
          if (sx * sx + sy * sy <= (1.5 * T) * (1.5 * T)) return { type: 'shrine', secret: s, result: this.useShrine(s) };
        }
      }
      return null;
    },
    useShrine: function (s) {
      var sh = s && s.shrine;
      if (!sh || sh.used) return null;
      sh.used = true;
      var st = root.CC && CC.state, p = st && st.player, msg, col;
      if (sh.type === 'life') {
        if (p) { p.hp = p.maxHp || p.hp; if (p.maxMana) p.mana = p.maxMana; }
        msg = 'Shrine of Life: fully restored'; col = '#ff6a78';
      } else {
        var gold = 25 + 15 * this.floor;
        if (st) st.gold = (st.gold || 0) + gold;
        msg = 'Shrine of Fortune: +' + gold + ' gold'; col = '#ffd24a';
      }
      if (root.CC && CC.fx && CC.fx.text) CC.fx.text(sh.x, sh.y - 12, msg, col, 11);
      return { type: sh.type, message: msg };
    },
    // secrets the viewer has found (cracked or opened)
    discoveredSecrets: function () { return (this.secrets || []).filter(function (s) { return s.found; }); },
    // Checks the secret plan without mutating this floor: 0-2 secrets, hidden while sealed, and every room cell,
    // door and reward reachable from spawn once opened (on a copy of the tiles).
    verifySecrets: function () {
      var bad = [], list = this.secrets || [], g2 = this.tiles.slice(), i, j, s, c;
      if (list.length > 2) bad.push('more than 2 secrets');
      for (i = 0; i < list.length; i++) {
        s = list[i];
        if (s.open) { bad.push('secret ' + i + ' already open'); continue; }
        if (!g2[s.door.ty * W + s.door.tx]) bad.push('secret ' + i + ' door not sealed');
        for (j = 0; j < s.cells.length; j++) { c = s.cells[j]; if (!g2[c[1] * W + c[0]]) bad.push('secret ' + i + ' room not sealed'); if (this.explored[c[1] * W + c[0]]) bad.push('secret ' + i + ' room revealed'); }
        if (!s.chest && !s.shrine) bad.push('secret ' + i + ' has no reward');
        g2[s.door.ty * W + s.door.tx] = 0;
        for (j = 0; j < s.cells.length; j++) { c = s.cells[j]; g2[c[1] * W + c[0]] = 0; }
      }
      var d = bfs(g2, this.spawn.ty * W + this.spawn.tx);
      for (i = 0; i < list.length; i++) {
        s = list[i];
        if (d[s.door.ty * W + s.door.tx] < 0) bad.push('secret ' + i + ' door unreachable');
        if (d[s.center.ty * W + s.center.tx] < 0) bad.push('secret ' + i + ' reward unreachable');
        for (j = 0; j < s.cells.length; j++) { c = s.cells[j]; if (d[c[1] * W + c[0]] < 0) { bad.push('secret ' + i + ' cell unreachable'); break; } }
      }
      return { ok: bad.length === 0, count: list.length, problems: bad };
    },

    // ---------- rendering ----------
    _view: function (ctx, cam) {
      var z = cam.zoom || 1;
      var vw = cam.w || ctx.canvas.width / z, vh = cam.h || ctx.canvas.height / z;
      var p = root.CC && CC.state && CC.state.player;
      var px = p && typeof p.x === 'number' ? p.x : cam.x + vw / 2, py = p && typeof p.y === 'number' ? p.y : cam.y + vh / 2;
      return {
        z: z, vw: vw, vh: vh, px: px, py: py, cx: Math.round(cam.x), cy: Math.round(cam.y),
        // tile range uses the same rounded camera as the translate, so art never drifts from the grid
        x0: Math.max(0, Math.floor(Math.round(cam.x) / T)), y0: Math.max(0, Math.floor(Math.round(cam.y) / T)),
        x1: Math.min(W - 1, Math.floor((Math.round(cam.x) + vw) / T)), y1: Math.min(H - 1, Math.floor((Math.round(cam.y) + vh) / T))
      };
    },

    draw: function (ctx, cam) {
      if (!this.explored) return;
      var v = this._view(ctx, cam), S = getSprites(this.biome), B = BIOMES[this.biome], g = this.tiles;
      var time = cam.time || Date.now() / 1000, rimCol = shade(B.wallTop, 1.2);
      this.updateFov(v.px, v.py);
      var pl0 = root.CC && CC.state && CC.state.player;
      if (pl0 && typeof pl0.x === 'number' && this.secrets && this.secrets.length) {
        this._now = time;
        this.updateSecrets(pl0.x, pl0.y, this._lastT ? clamp(time - this._lastT, 0, 0.1) : 0);
        this._lastT = time;
      } else this._now = time;
      var glow = this._glow = this._glow || [];
      glow.length = 0;
      ctx.save();
      // The world caller owns zoom and DPR; keep tiles, fog and entities in one transform.
      ctx.translate(-v.cx, -v.cy);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#04050a';
      ctx.fillRect(v.cx, v.cy, v.vw + 2, v.vh + 2);
      for (var ty = v.y0; ty <= v.y1; ty++) for (var tx = v.x0; tx <= v.x1; tx++) {
        var i = ty * W + tx;
        if (!this.explored[i]) continue;
        var px = tx * T, py = ty * T, hsh = (tx * 7 + ty * 13 + ((tx * ty) & 3)) & 3;
        if (this.tileArt(tx, ty) === 'wall') {
          var south = ty + 1 < H && !g[i + W];
          ctx.drawImage(south ? S.face[hsh] : S.top[hsh], px, py);
          if (!south) { // bright rim exactly on every edge where rock meets open floor (wall/floor boundary = tile boundary)
            ctx.fillStyle = rimCol;
            if (tx > 0 && !g[i - 1]) ctx.fillRect(px, py, 2, T);
            if (tx < W - 1 && !g[i + 1]) ctx.fillRect(px + T - 2, py, 2, T);
            if (ty > 0 && !g[i - W]) ctx.fillRect(px, py, T, 2);
          }
          // Mark exposed edges inside the solid tile, never on the walkable neighbour.
          ctx.fillStyle = shade(B.wallTop, 1.45);
          if (!this.isSolidTile(tx, ty - 1)) ctx.fillRect(px, py, T, 2);
          if (!this.isSolidTile(tx - 1, ty)) ctx.fillRect(px, py, 2, T);
          if (!this.isSolidTile(tx + 1, ty)) ctx.fillRect(px + T - 2, py, 2, T);
          if (south) ctx.fillRect(px, py + T - 2, T, 2);
          if (this.decor[i] === 1) {
            drawTorch(ctx, px, py, time + tx);
            glow.push(i);
          }
        } else {
          ctx.drawImage(S.floor[hsh], px, py);
          // Floor art fills the full walkable tile; wall edges are drawn only on walls.
          var dc = this.decor[i];
          if (this.liquid[i]) {
            drawLiquid(ctx, px, py, tx, ty, B, this.liquid, time, i);
            if (B.theme.liquid === 'lava' && (tx * 3 + ty * 5) % 4 === 0) glow.push(i);
          }
          var prp = this.props[i];
          if (prp) {
            drawProp(ctx, px, py, prp, hsh, B, time, tx, ty);
            if (prp === 6) glow.push(i);
          }
          if (dc === 2) { drawCrystal(ctx, px, py, B, hsh, time + tx); glow.push(i); }
          else if (dc === 3) { drawMushroom(ctx, px, py, B, hsh); glow.push(i); }
        }
      }
      var st = this.stairs;
      if (st.tx >= v.x0 - 1 && st.tx <= v.x1 + 1 && st.ty >= v.y0 - 1 && st.ty <= v.y1 + 1 && this.explored[st.ty * W + st.tx]) drawStairs(ctx, st.tx * T, st.ty * T, B, time);
      for (var c = 0; c < this.chests.length; c++) {
        var ch = this.chests[c];
        if (ch.tx < v.x0 || ch.tx > v.x1 || ch.ty < v.y0 || ch.ty > v.y1 || !this.explored[ch.ty * W + ch.tx]) continue;
        drawChest(ctx, ch.tx * T, ch.ty * T, ch);
      }
      var sl = this.secrets || [];
      for (var q = 0; q < sl.length; q++) {
        var sc = sl[q];
        if (!sc.found || !this.explored[sc.door.ty * W + sc.door.tx]) continue;
        if (sc.door.tx < v.x0 - 2 || sc.door.tx > v.x1 + 2 || sc.door.ty < v.y0 - 2 || sc.door.ty > v.y1 + 2) continue;
        drawSecret(ctx, sc, this, B, time);
      }
      ctx.restore();
      if (!this.deferLighting) this.drawLighting(ctx, cam);
      if (this.debugGrid) this.drawDebug(ctx, cam);
    },

    drawLighting: function (ctx, cam) {
      if (!this.explored) return;
      var v = this._view(ctx, cam), B = BIOMES[this.biome], time = cam.time || Date.now() / 1000;
      var cols = v.x1 - v.x0 + 1, rows = v.y1 - v.y0 + 1;
      if (cols < 1 || rows < 1) return;
      var dk = this._dk;
      if (!dk || dk.width !== cols || dk.height !== rows) { dk = this._dk = mk(cols, rows); this._dkc = dk.getContext('2d'); this._dkd = this._dkc.createImageData(cols, rows); }
      var data = this._dkd.data, flick = 0.94 + 0.06 * Math.sin(time * 9) * Math.sin(time * 3.7);
      var amb = B.ambient, R = LIGHT_R * T, o = 0;
      for (var ty = v.y0; ty <= v.y1; ty++) for (var tx = v.x0; tx <= v.x1; tx++, o += 4) {
        var i = ty * W + tx, ex = this.explored[i], vis = this.vis[i], light = 0;
        if (ex) {
          var dx = tx * T + T / 2 - v.px, dy = ty * T + T / 2 - v.py, d = Math.sqrt(dx * dx + dy * dy) / R;
          var pl = vis && d < 1 ? (1 - d) : 0; pl = Math.min(1, pl * 1.35); pl = pl * pl * (3 - 2 * pl);
          // Keep revealed terrain readable even outside the player's brightest light.
          light = Math.max(pl * flick, vis ? 0.42 : 0.28) + this.staticLight[i] * (vis ? 0.75 : 0.45) * (0.92 + 0.08 * Math.sin(time * 8 + i * 0.9) * Math.sin(time * 3.1 + i * 0.37));
          if (light > 1) light = 1;
        }
        data[o] = amb[0]; data[o + 1] = amb[1]; data[o + 2] = amb[2]; data[o + 3] = ex ? Math.round(255 * (1 - light) * 0.96) : 255;
      }
      this._dkc.putImageData(this._dkd, 0, 0);
      ctx.save();
      // The world caller owns zoom and DPR; keep tiles, fog and entities in one transform.
      ctx.translate(-v.cx, -v.cy);
      // additive warm glow: player, torches, crystals
      ctx.globalCompositeOperation = 'lighter';
      var pg = glowSprite(B.light);
      ctx.globalAlpha = 0.22 * flick;
      ctx.drawImage(pg, v.px - 150, v.py - 150, 300, 300);
      var gl = this._glow || [];
      for (var q = 0; q < gl.length; q++) {
        var gi = gl[q], gx = gi % W, gy = (gi / W) | 0, kind = this.decor[gi] || (this.liquid[gi] ? 4 : this.props[gi] === 6 ? 5 : 0);
        var col = kind === 1 ? B.light : kind === 2 ? hex(B.crystal) : kind === 4 ? [255, 110, 40] : kind === 5 ? [255, 70, 70] : hex(B.mush);
        var rad = kind === 1 ? 70 : kind === 2 ? 52 : kind === 4 ? 46 : kind === 5 ? 58 : 38;
        ctx.globalAlpha = (this.vis[gi] ? 0.42 : 0.2) * (kind === 1 ? 0.85 + 0.15 * Math.sin(time * 11 + gx * 3) : 1);
        ctx.drawImage(glowSprite(col), gx * T + T / 2 - rad, gy * T + T / 2 - rad, rad * 2, rad * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // drifting haze tinted by biome
      var fg = B.theme && B.theme.fog;
      if (fg) {
        var fs = glowSprite(fg);
        ctx.globalAlpha = 0.17;
        for (var fi = 0; fi < 9; fi++) {
          var fx = v.cx + ((fi * 211 + time * (6 + (fi % 3) * 3)) % (v.vw + 360)) - 180, fy = v.cy + ((fi * 137) % Math.max(1, v.vh)) + Math.sin(time * 0.3 + fi) * 20;
          ctx.drawImage(fs, fx - 140, fy - 90, 280, 180);
        }
        ctx.globalAlpha = 1;
      }
      // One darkness sample covers exactly one collision tile. Interpolation would smear
      // opaque fog across a walkable neighbour and make its edge look like a wall.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this._dk, v.x0 * T, v.y0 * T, cols * T, rows * T);
      ctx.restore();
      // vignette in view space
      var key = v.vw + 'x' + v.vh;
      if (this._vgKey !== key) {
        var gr = ctx.createRadialGradient(v.vw / 2, v.vh / 2, Math.min(v.vw, v.vh) * 0.3, v.vw / 2, v.vh / 2, Math.hypot(v.vw, v.vh) * 0.55);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.65)');
        this._vg = gr; this._vgKey = key;
      }
      ctx.save();
      // The world caller owns zoom and DPR; keep tiles, fog and entities in one transform.
      ctx.fillStyle = this._vg;
      ctx.fillRect(0, 0, v.vw, v.vh);
      ctx.restore();
    },

    drawMinimap: function (ctx, x, y, size) {
      if (!this.explored) return;
      var mm = this._mm;
      if (!mm) { mm = this._mm = mk(W, H); this._mmc = mm.getContext('2d'); this._mmd = this._mmc.createImageData(W, H); this._mmDirty = true; }
      if (this._mmDirty) {
        var d = this._mmd.data, B = BIOMES[this.biome], fc = hex(B.floor), wc = hex(B.wallTop);
        for (var i = 0, o = 0; i < N; i++, o += 4) {
          if (!this.explored[i]) { d[o + 3] = 0; continue; }
          var c = this.tiles[i] ? wc : fc, f = this.tiles[i] ? 0.55 : 1.5;
          d[o] = Math.min(255, c[0] * f); d[o + 1] = Math.min(255, c[1] * f); d[o + 2] = Math.min(255, c[2] * f); d[o + 3] = this.vis[i] ? 255 : 190;
        }
        this._mmc.putImageData(this._mmd, 0, 0); this._mmDirty = false;
      }
      var s = size / Math.max(W, H), p = root.CC && CC.state && CC.state.player;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(mm, x, y, W * s, H * s);
      var st = this.stairs;
      if (this.explored[st.ty * W + st.tx]) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + st.tx * s - 1, y + st.ty * s - 1, Math.max(3, s * 1.5), Math.max(3, s * 1.5)); }
      ctx.fillStyle = '#ffb02a';
      for (var c = 0; c < this.chests.length; c++) {
        var ch = this.chests[c];
        if (!ch.opened && this.explored[ch.ty * W + ch.tx]) ctx.fillRect(x + ch.tx * s, y + ch.ty * s, Math.max(2, s), Math.max(2, s));
      }
      if (p) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + (p.x / T) * s - 1.5, y + (p.y / T) * s - 1.5, 3, 3); }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      ctx.restore();
    },

    // Full-screen map in screen space (0,0)-(w,h). Shows only explored tiles; secrets appear once found.
    drawFullMap: function (ctx, w, h) {
      if (!this.explored) return;
      var B = BIOMES[this.biome], now = Date.now() / 1000, pad = 24, top = 52, bottom = 40, i, tx, ty;
      var cell = Math.max(1, Math.min((w - pad * 2) / W, (h - top - bottom) / H));
      var ox = Math.round((w - cell * W) / 2), oy = Math.round(top + (h - top - bottom - cell * H) / 2), self = this;
      var cFloorV = shade(B.floor, 1.35), cFloorE = shade(B.floor, 0.85), cWallV = shade(B.wallTop, 0.62), cWallE = shade(B.wallTop, 0.42);
      function mx(t) { return ox + t * cell; }
      function my(t) { return oy + t * cell; }
      ctx.save();
      ctx.fillStyle = 'rgba(4,5,10,0.94)'; ctx.fillRect(0, 0, w, h);
      ctx.textBaseline = 'middle';
      var fl = 0, fe = 0;
      for (ty = 0; ty < H; ty++) for (tx = 0; tx < W; tx++) {
        i = ty * W + tx;
        if (!this.tiles[i]) fl++;
        if (!this.explored[i]) continue;
        if (!this.tiles[i]) fe++;
        ctx.fillStyle = this.tiles[i] ? (this.vis[i] ? cWallV : cWallE) : (this.vis[i] ? cFloorV : cFloorE);
        ctx.fillRect(mx(tx), my(ty), Math.ceil(cell), Math.ceil(cell));
      }
      var m = Math.max(3, cell * 0.9), k;
      // discovered secrets: outline of opened rooms, crack marker on sealed ones
      var found = 0;
      for (k = 0; k < this.secrets.length; k++) {
        var s = this.secrets[k];
        if (!s.found) continue;
        found++;
        var pulse = 0.65 + 0.35 * Math.sin(now * 4 + k);
        if (s.open) {
          ctx.strokeStyle = 'rgba(200,150,255,0.9)'; ctx.lineWidth = 1.5;
          ctx.strokeRect(mx(s.rect.x0) - 1, my(s.rect.y0) - 1, (s.rect.x1 - s.rect.x0 + 1) * cell + 2, (s.rect.y1 - s.rect.y0 + 1) * cell + 2);
          var rw = s.chest || s.shrine;
          if (rw && this.explored[s.center.ty * W + s.center.tx]) {
            ctx.fillStyle = s.shrine ? (s.shrine.used ? '#6a5a88' : '#d6b4ff') : (s.chest.opened ? '#6a5a88' : '#ff9aff');
            diamond(ctx, mx(s.center.tx + 0.5), my(s.center.ty + 0.5), m * 0.8);
          }
        } else {
          ctx.fillStyle = 'rgba(200,150,255,' + pulse.toFixed(2) + ')';
          diamond(ctx, mx(s.door.tx + 0.5), my(s.door.ty + 0.5), m * 0.9);
        }
      }
      // chests (opened ones dim)
      for (k = 0; k < this.chests.length; k++) {
        var ch = this.chests[k];
        if (!this.explored[ch.ty * W + ch.tx]) continue;
        ctx.fillStyle = ch.opened ? '#7a6a4a' : '#ffb02a';
        ctx.fillRect(mx(ch.tx + 0.5) - m / 2, my(ch.ty + 0.5) - m / 2, m, m);
        ctx.strokeStyle = '#2a1a08'; ctx.lineWidth = 1; ctx.strokeRect(mx(ch.tx + 0.5) - m / 2, my(ch.ty + 0.5) - m / 2, m, m);
      }
      // boss
      if (this.boss && this.explored[this.boss.ty * W + this.boss.tx]) {
        ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = 2; var bx = mx(this.boss.tx + 0.5), by = my(this.boss.ty + 0.5);
        ctx.beginPath(); ctx.moveTo(bx - m / 2, by - m / 2); ctx.lineTo(bx + m / 2, by + m / 2); ctx.moveTo(bx + m / 2, by - m / 2); ctx.lineTo(bx - m / 2, by + m / 2); ctx.stroke();
      }
      // stairs
      var st = this.stairs;
      if (this.explored[st.ty * W + st.tx]) {
        var sx = mx(st.tx + 0.5), sy = my(st.ty + 0.5);
        ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx - m, sy - m * 0.7); ctx.lineTo(sx + m, sy - m * 0.7); ctx.lineTo(sx, sy + m); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // player
      var p = root.CC && CC.state && CC.state.player;
      if (p && typeof p.x === 'number') {
        var ppx = mx(p.x / T), ppy = my(p.y / T), pr = m * (0.7 + 0.2 * Math.sin(now * 5));
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ppx, ppy, pr + 2, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ppx, ppy, Math.max(2, m * 0.45), 0, 6.2832); ctx.fill();
      }
      // frame, title, legend
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(ox - 0.5, oy - 0.5, cell * W + 1, cell * H + 1);
      var open = 0, tot = this.chests.length; for (k = 0; k < tot; k++) if (this.chests[k].opened) open++;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('Floor ' + this.floor + ' - ' + this.biomeName, pad, 26);
      ctx.font = '13px sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = '#c8ccd8';
      ctx.fillText('Explored ' + Math.round(100 * fe / Math.max(1, fl)) + '%   Chests ' + open + '/' + tot + '   Secrets found ' + found, w - pad, 26);
      var lx = pad, ly = h - 20, items = [['#ffd24a', 'Stairs'], ['#ffb02a', 'Chest'], ['#d6b4ff', 'Secret'], ['#ff4a4a', 'Boss'], ['#ffffff', 'You']];
      ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
      for (k = 0; k < items.length; k++) {
        ctx.fillStyle = items[k][0]; ctx.fillRect(lx, ly - 5, 10, 10);
        ctx.fillStyle = '#c8ccd8'; ctx.fillText(items[k][1], lx + 15, ly); lx += 25 + items[k][1].length * 7;
      }
      ctx.restore();
    },

    // ---------- self check (logged) ----------
    selfCheck: function (n) {
      n = n || 50;
      var failures = [], log = [], keepSeed = this.seed;
      for (var s = 1; s <= n; s++) {
        var floor = 1 + (s % 16), seed = s * 31 + 7;
        this.generate(floor, seed);
        var g = this.tiles, d = bfs(g, this.spawn.ty * W + this.spawn.tx), tag = 'seed ' + seed + ' floor ' + floor;
        var bad = [];
        if (g[this.spawn.ty * W + this.spawn.tx]) bad.push('spawn in wall');
        if (d[this.stairs.ty * W + this.stairs.tx] < 1) bad.push('stairs unreachable');
        if (!this.chests.length) bad.push('no chests');
        var va = this.verifyAlignment();
        if (!va.ok) bad.push('alignment: ' + va.problems.slice(0, 3).join('; '));
        var vs = this.verifySecrets();
        if (!vs.ok) bad.push('secrets: ' + vs.problems.slice(0, 3).join('; '));
        this.chests.forEach(function (c, i) { if (d[c.ty * W + c.tx] < 0) bad.push('chest ' + i + ' unreachable'); });
        this.enemySpawns.forEach(function (c, i) { if (d[c.ty * W + c.tx] < 0) bad.push('enemy ' + i + ' unreachable'); });
        for (var x = 0; x < W; x++) if (!g[x] || !g[(H - 1) * W + x]) { bad.push('open border'); break; }
        log.push(tag + ': chests=' + this.chests.length + ' enemies=' + this.enemySpawns.length + ' secrets=' + vs.count + ' stairsDist=' + d[this.stairs.ty * W + this.stairs.tx] + ' biome=' + this.biomeName + (bad.length ? ' FAIL ' + bad.join(',') : ' ok'));
        if (bad.length) failures.push(tag + ': ' + bad.join(','));
      }
      return { ok: failures.length === 0, runs: n, failures: failures, log: log };
    }
  };

  // ---------- sprites (lazy; browser only) ----------
  var spriteCache = {}, glowCache = {};
  function glowSprite(col) {
    var key = col.join(','), c = glowCache[key];
    if (c) return c;
    c = mk(128, 128);
    var g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.9)');
    gr.addColorStop(0.4, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.3)');
    gr.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return (glowCache[key] = c);
  }
  function getSprites(bi) {
    if (spriteCache[bi]) return spriteCache[bi];
    var P = BIOMES[bi], rng = rngFrom(900 + bi), S = { floor: [], top: [], face: [] }, v;
    for (v = 0; v < 4; v++) {
      var c = mk(T, T), g = c.getContext('2d'), bx, by, r;
      // floor slab
      g.fillStyle = P.floor; g.fillRect(0, 0, T, T);
      for (by = 0; by < 16; by++) for (bx = 0; bx < 16; bx++) {
        r = rng();
        if (r < 0.34) { g.fillStyle = shade(P.floor, r < 0.15 ? 0.86 : 1.12); g.fillRect(bx * 2, by * 2, 2, 2); }
      }
      g.fillStyle = shade(P.floor, 0.7); g.fillRect(0, T - 1, T, 1); g.fillRect(T - 1, 0, 1, T);
      g.fillStyle = shade(P.floor, 1.2); g.fillRect(0, 0, T, 1); g.fillRect(0, 0, 1, T);
      var cx = 4 + ((rng() * 20) | 0), cy = 4 + ((rng() * 20) | 0);
      if (v & 1) { g.fillStyle = shade(P.floor, 0.6); for (var k = 0; k < 6; k++) { g.fillRect(cx + k * 2, cy + ((k * 3 + v) % 4), 2, 1); } }
      if (v >= 2) { g.fillStyle = shade(P.floor, 0.65); g.fillRect(cx, cy + 2, 5, 2); g.fillStyle = shade(P.floor, 1.3); g.fillRect(cx, cy, 5, 2); }
      if (P.theme.moss) { // moss patches
        g.globalAlpha = 0.55;
        for (var mp = 0; mp < 3; mp++) {
          var mx0 = (rng() * 24) | 0, my0 = (rng() * 24) | 0;
          for (var mq = 0; mq < 7; mq++) { g.fillStyle = shade(P.accent, 0.35 + rng() * 0.3); g.fillRect(mx0 + ((rng() * 8) | 0), my0 + ((rng() * 6) | 0), 2 + ((rng() * 3) | 0), 2); }
        }
        g.globalAlpha = 1;
      }
      if (!(v & 1)) { // jagged crack
        var crx = 3 + ((rng() * 12) | 0), cry = 2 + ((rng() * 10) | 0);
        g.strokeStyle = shade(P.floor, 0.4); g.lineWidth = 1; g.beginPath(); g.moveTo(crx, cry);
        for (var cs = 0; cs < 6; cs++) { crx += 2 + ((rng() * 4) | 0); cry += ((rng() * 7) | 0) - 1; g.lineTo(crx, cry); }
        g.stroke();
      }
      S.floor.push(c);
      // wall top
      c = mk(T, T); g = c.getContext('2d');
      // solid rock mass: clearly darker than the floor so a wall never reads as walkable ground in dim light
      g.fillStyle = shade(P.wallTop, 0.42); g.fillRect(0, 0, T, T);
      for (by = 0; by < 16; by++) for (bx = 0; bx < 16; bx++) {
        r = rng();
        if (r < 0.4) { g.fillStyle = shade(P.wallTop, r < 0.2 ? 0.32 : 0.52); g.fillRect(bx * 2, by * 2, 2, 2); }
      }
      for (var sb = 0; sb < 3; sb++) { // rock strata bands
        var sy_ = 5 + sb * 10 + ((rng() * 4) | 0);
        g.fillStyle = shade(P.wallTop, 0.6); g.fillRect(0, sy_, T, 2);
        g.fillStyle = shade(P.wallTop, 0.28); g.fillRect(((rng() * 10) | 0), sy_ + 2, 8 + ((rng() * 14) | 0), 1);
      }
      g.fillStyle = shade(P.wallTop, 0.3); g.fillRect(0, 0, T, 2); g.fillRect(0, 0, 2, T);
      S.top.push(c);
      // wall face (the visible front of a wall: shaded brickwork)
      c = mk(T, T); g = c.getContext('2d');
      var gr = g.createLinearGradient(0, 0, 0, T);
      gr.addColorStop(0, shade(P.wallFace, 1.35)); gr.addColorStop(1, shade(P.wallFace, 0.65));
      g.fillStyle = gr; g.fillRect(0, 0, T, T);
      for (var row = 0; row < 3; row++) {
        var yy = 5 + row * 9;
        g.fillStyle = shade(P.wallFace, 0.45); g.fillRect(0, yy, T, 1);
        for (var kx = 0; kx < 3; kx++) { var xx = ((row + v) % 2 ? 8 : 0) + kx * 16; g.fillRect(xx, yy, 1, 9); }
        g.fillStyle = shade(P.wallFace, 1.45); g.fillRect(0, yy + 1, T, 1);
      }
      for (var q = 0; q < 18; q++) { g.fillStyle = shade(P.wallFace, rng() < 0.5 ? 0.7 : 1.25); g.fillRect((rng() * T) | 0, 5 + ((rng() * 26) | 0), 2, 1); }
      if (P.theme.drip && (v & 1 || P.theme.moss)) { // blood / slime / water stains running down the wall
        for (var dr = 0; dr < 3; dr++) {
          var drx = 2 + ((rng() * 27) | 0), drl = 6 + ((rng() * 18) | 0);
          g.fillStyle = P.theme.drip; g.globalAlpha = 0.7; g.fillRect(drx, 4, 2, drl); g.fillRect(drx - 1, 4 + drl - 2, 4, 3); g.globalAlpha = 1;
        }
      }
      g.fillStyle = P.wallTop; g.fillRect(0, 0, T, 4);
      g.fillStyle = shade(P.wallTop, 1.25); g.fillRect(0, 0, T, 1);
      g.fillStyle = shade(P.wallTop, 0.6); g.fillRect(0, 4, T, 1);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, T - 3, T, 3);
      S.face.push(c);
    }
    return (spriteCache[bi] = S);
  }

  function drawLiquid(ctx, px, py, tx, ty, B, liq, t, i) {
    var kind = B.theme.liquid, L = LIQ[kind], lava = kind === 'lava';
    ctx.fillStyle = L.deep; ctx.fillRect(px, py, T, T);
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * (lava ? 1.2 : 1.8) + tx * 1.7 + ty * 1.1);
    ctx.fillStyle = L.shallow; ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
    ctx.globalAlpha = 1;
    var ox = ((Math.sin(t * 0.9 + tx * 2.3) + 1) * 7) | 0, oy = ((Math.cos(t * 0.7 + ty * 2.9) + 1) * 7) | 0;
    ctx.fillStyle = L.hi; ctx.fillRect(px + 4 + ox, py + 6 + oy, 7, 1); ctx.fillRect(px + 14 - (ox >> 1), py + 18 + (oy >> 1), 5, 1);
    if (lava && ((t * 1.5 + tx * 3 + ty) % 4) < 0.25) { ctx.fillStyle = '#fff0a0'; ctx.fillRect(px + 8 + ((tx * 5 + ty) % 14), py + 10 + ((ty * 3) % 10), 3, 3); }
    ctx.fillStyle = L.edge;
    if (!liq[i - 1]) ctx.fillRect(px, py, 2, T);
    if (!liq[i + 1]) ctx.fillRect(px + T - 2, py, 2, T);
    if (!liq[i - W]) ctx.fillRect(px, py, T, 2);
    if (!liq[i + W]) ctx.fillRect(px, py + T - 2, T, 2);
  }
  // props: 1 bones, 2 skull, 3 cobweb (+16 = right corner), 4 blood pool, 5 blood smear, 6 altar, 7 hanging cage
  function drawProp(ctx, px, py, pr, h, B, t, tx, ty) {
    var kind = pr & 15, o = (tx * 5 + ty * 3) % 7, bone = '#d8d0b8', bone2 = '#9a927c', n;
    if (kind === 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px + 6, py + 22, 20, 3);
      ctx.fillStyle = bone; ctx.fillRect(px + 7 + o, py + 14, 12, 2); ctx.fillRect(px + 6 + o, py + 13, 3, 4); ctx.fillRect(px + 17 + o, py + 13, 3, 4);
      ctx.fillStyle = bone2; ctx.fillRect(px + 10, py + 20, 10, 2); ctx.fillRect(px + 9, py + 19, 2, 4);
      for (n = 0; n < 3; n++) { ctx.fillStyle = n & 1 ? bone : bone2; ctx.fillRect(px + 11 + n * 4, py + 7 + (o & 3), 2, 5); } // ribs
    } else if (kind === 2) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px + 9, py + 22, 15, 3);
      ctx.fillStyle = bone; ctx.fillRect(px + 10, py + 11, 12, 9); ctx.fillRect(px + 12, py + 9, 8, 2); ctx.fillRect(px + 12, py + 20, 8, 3);
      ctx.fillStyle = '#1a1410'; ctx.fillRect(px + 12, py + 14, 3, 3); ctx.fillRect(px + 17, py + 14, 3, 3); ctx.fillRect(px + 15, py + 18, 2, 2);
      ctx.fillStyle = bone2; ctx.fillRect(px + 13, py + 21, 1, 2); ctx.fillRect(px + 16, py + 21, 1, 2); ctx.fillRect(px + 19, py + 21, 1, 2);
    } else if (kind === 3) {
      var right = pr >> 4, wx = right ? px + T : px, dir = right ? -1 : 1;
      ctx.strokeStyle = 'rgba(225,225,230,0.55)'; ctx.lineWidth = 1; ctx.beginPath();
      for (n = 1; n <= 4; n++) { ctx.moveTo(wx, py + n * 6); ctx.lineTo(wx + dir * 24, py); }
      ctx.moveTo(wx, py); ctx.lineTo(wx + dir * 22, py + 22);
      for (n = 1; n <= 3; n++) { ctx.moveTo(wx + dir * n * 6, py + 0.5); ctx.quadraticCurveTo(wx + dir * n * 4, py + n * 4, wx + dir * 1, py + n * 6 + 2); }
      ctx.stroke();
    } else if (kind === 4) {
      ctx.fillStyle = '#3c0606'; ctx.beginPath(); ctx.ellipse(px + 16, py + 17, 12 + (o & 1) * 2, 8, 0.2 * o, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#6e0c0c'; ctx.beginPath(); ctx.ellipse(px + 15, py + 16, 8, 5, 0.2 * o, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(190,40,40,0.7)'; ctx.fillRect(px + 12 + (o & 3), py + 13, 3, 1);
      ctx.fillStyle = '#4a0808'; ctx.fillRect(px + 26, py + 6 + o, 2, 2); ctx.fillRect(px + 4, py + 24 - (o & 3), 2, 2);
    } else if (kind === 5) {
      ctx.save(); ctx.translate(px + 16, py + 16); ctx.rotate(((tx * 31 + ty * 17) % 8) * 0.785);
      ctx.fillStyle = '#4a0808'; ctx.fillRect(-14, -3, 22, 5); ctx.fillRect(-4, -5, 12, 2);
      ctx.fillStyle = '#7a1010'; ctx.fillRect(-12, -2, 16, 2);
      ctx.fillStyle = '#3c0606'; ctx.fillRect(10, -1, 3, 2); ctx.fillRect(15, 0, 2, 2);
      ctx.restore();
    } else if (kind === 6) {
      var pulse = 0.6 + 0.4 * Math.sin(t * 2.2 + tx);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(px + 2, py + 24, 28, 5);
      ctx.fillStyle = '#34303a'; ctx.fillRect(px + 4, py + 12, 24, 14);
      ctx.fillStyle = '#4c4656'; ctx.fillRect(px + 3, py + 9, 26, 5);
      ctx.fillStyle = '#1c1a22'; ctx.fillRect(px + 4, py + 24, 24, 2);
      ctx.fillStyle = '#5a0a0a'; ctx.fillRect(px + 8, py + 10, 16, 3); ctx.fillRect(px + 22, py + 13, 2, 7);
      ctx.fillStyle = 'rgba(255,60,60,' + pulse.toFixed(2) + ')'; ctx.fillRect(px + 14, py + 15, 4, 6); ctx.fillRect(px + 11, py + 17, 10, 2);
      for (n = 0; n < 2; n++) { // candles
        var cxp = px + 6 + n * 20, fl = Math.sin(t * 13 + n * 2) * 1;
        ctx.fillStyle = '#e8e0c8'; ctx.fillRect(cxp, py + 4, 3, 6);
        ctx.fillStyle = '#ffb02e'; ctx.fillRect(cxp + fl * 0.3, py + 1, 3, 4);
        ctx.fillStyle = '#fff2a0'; ctx.fillRect(cxp + 1, py + 2, 1, 2);
      }
    } else if (kind === 7) {
      var sw = Math.sin(t * 1.3 + tx) * 1.5;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px + 8, py + 27, 16, 3);
      ctx.fillStyle = '#4a4a52'; ctx.fillRect(px + 15 + sw * 0.3, py, 2, 5); // chain
      ctx.fillStyle = bone2; ctx.fillRect(px + 12 + sw, py + 12, 8, 7); ctx.fillStyle = '#1a1410'; ctx.fillRect(px + 13 + sw, py + 14, 2, 2); ctx.fillRect(px + 17 + sw, py + 14, 2, 2);
      ctx.fillStyle = bone2; ctx.fillRect(px + 14 + sw, py + 19, 4, 6);
      ctx.strokeStyle = '#2c2c34'; ctx.lineWidth = 2; ctx.strokeRect(px + 8 + sw, py + 5, 16, 22);
      ctx.lineWidth = 1; ctx.beginPath();
      for (n = 1; n < 4; n++) { ctx.moveTo(px + 8 + sw + n * 4, py + 5); ctx.lineTo(px + 8 + sw + n * 4, py + 27); }
      ctx.stroke();
      ctx.fillStyle = '#5a0a0a'; ctx.fillRect(px + 12 + sw, py + 27, 2, 3);
    }
  }
  function drawTorch(ctx, px, py, t) {
    ctx.fillStyle = '#2a1c12'; ctx.fillRect(px + 14, py + 14, 4, 12);
    ctx.fillStyle = '#4a3422'; ctx.fillRect(px + 12, py + 22, 8, 3);
    var f = Math.sin(t * 12) * 1.2, h = 9 + Math.sin(t * 17) * 1.5;
    ctx.fillStyle = '#e8541c'; ctx.fillRect(px + 12 + f * 0.3, py + 14 - h + 4, 8, h);
    ctx.fillStyle = '#ffb02e'; ctx.fillRect(px + 13 + f * 0.5, py + 15 - h + 5, 6, h - 3);
    ctx.fillStyle = '#fff2a0'; ctx.fillRect(px + 14.5 + f * 0.6, py + 17 - h + 6, 3, Math.max(2, h - 6));
  }
  function drawCrystal(ctx, px, py, B, h, t) {
    var col = B.crystal, pulse = 0.85 + 0.15 * Math.sin(t * 2.5);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px + 7, py + 24, 18, 4);
    function shard(x, y, w, hh, f) {
      ctx.fillStyle = shade(col, 0.6 * pulse + f * 0.1);
      ctx.beginPath(); ctx.moveTo(px + x, py + y); ctx.lineTo(px + x + w / 2, py + y - hh); ctx.lineTo(px + x + w, py + y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(col, 1.15 * pulse);
      ctx.beginPath(); ctx.moveTo(px + x + w / 2, py + y - hh); ctx.lineTo(px + x + w, py + y); ctx.lineTo(px + x + w / 2, py + y); ctx.closePath(); ctx.fill();
    }
    shard(8, 26, 8, 14 + (h & 1) * 3, 0); shard(14, 27, 9, 20, 1); shard(20, 26, 7, 11, 0);
  }
  function drawMushroom(ctx, px, py, B, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px + 8, py + 24, 16, 3);
    function shroom(x, y, s) {
      ctx.fillStyle = '#d8d0b8'; ctx.fillRect(px + x, py + y - 3 * s, 2 * s, 3 * s);
      ctx.fillStyle = B.mush; ctx.fillRect(px + x - 2 * s, py + y - 5 * s, 6 * s, 2 * s); ctx.fillRect(px + x - s, py + y - 6 * s, 4 * s, s);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px + x, py + y - 5 * s, s, s);
    }
    shroom(11, 25, 2); shroom(19 + (h & 1) * 2, 24, 1.5);
  }
  function drawStairs(ctx, px, py, B, t) {
    ctx.fillStyle = '#0a0a0e'; ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
    for (var i = 0; i < 4; i++) {
      var s = 3 + i * 3;
      ctx.fillStyle = shade(B.accent, 0.35 + i * 0.18); ctx.fillRect(px + s, py + s, T - s * 2, T - s * 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.25 * Math.sin(t * 3)) + ')'; ctx.fillRect(px + 13, py + 13, 6, 6);
  }
  function diamond(ctx, x, y, r) {
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
  }
  // cracked-wall hint, reveal ring and crumble animation for a found secret; also the shrine inside an opened room
  function drawSecret(ctx, s, dun, B, time) {
    var px = s.door.tx * T, py = s.door.ty * T, c, k;
    if (!s.open) {
      var a = clamp((time - s.foundAt) / 0.8, 0, 1);
      ctx.strokeStyle = 'rgba(12,6,4,' + (0.9 * a).toFixed(2) + ')'; ctx.lineWidth = 2; ctx.lineJoin = 'miter';
      ctx.beginPath(); ctx.moveTo(px + 15, py + 2); ctx.lineTo(px + 11, py + 9); ctx.lineTo(px + 18, py + 14); ctx.lineTo(px + 12, py + 21); ctx.lineTo(px + 17, py + 30);
      ctx.moveTo(px + 18, py + 14); ctx.lineTo(px + 26, py + 17); ctx.moveTo(px + 11, py + 9); ctx.lineTo(px + 4, py + 11); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * (0.25 + 0.15 * Math.sin(time * 4 + s.id));
      ctx.drawImage(glowSprite([200, 160, 255]), px - 16, py - 16, T + 32, T + 32);
      ctx.restore();
      var rt = (time - s.foundAt) / 0.8;
      if (rt >= 0 && rt < 1) { ctx.strokeStyle = 'rgba(214,180,255,' + (1 - rt).toFixed(2) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 6 + rt * 40, 0, 6.2832); ctx.stroke(); }
      return;
    }
    var age = time - s.openAt;
    if (age >= 0 && age < 1.1) { // flash + flying rubble
      if (age < 0.3) { ctx.fillStyle = 'rgba(255,240,200,' + (0.6 * (1 - age / 0.3)).toFixed(2) + ')'; ctx.fillRect(px - 8, py - 8, T + 16, T + 16); }
      var fade = 1 - age / 1.1;
      for (k = 0; k < 12; k++) {
        var ang = k * 0.5236 + s.id, sp = 26 + (k % 3) * 16;
        ctx.fillStyle = shade(B.wallTop, 0.55 + (k % 3) * 0.2); ctx.globalAlpha = fade;
        ctx.fillRect(px + T / 2 + Math.cos(ang) * sp * age - 2, py + T / 2 + Math.sin(ang) * sp * age + 70 * age * age - 2, 4 - age * 2, 4 - age * 2);
      }
      ctx.globalAlpha = 1;
    }
    var sh = s.shrine;
    if (sh && dun.explored[sh.ty * W + sh.tx]) {
      var sx = sh.tx * T, sy = sh.ty * T, col = sh.type === 'life' ? '#ff6a78' : '#ffd24a', pu = sh.used ? 0.25 : 0.7 + 0.3 * Math.sin(time * 3);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(sx + 6, sy + 25, 20, 4);
      ctx.fillStyle = '#4a4660'; ctx.fillRect(sx + 8, sy + 20, 16, 6); ctx.fillStyle = '#6a6488'; ctx.fillRect(sx + 11, sy + 10, 10, 11);
      ctx.fillStyle = '#8a84aa'; ctx.fillRect(sx + 11, sy + 10, 10, 2);
      c = ctx.globalAlpha; ctx.globalAlpha = pu; ctx.fillStyle = col; ctx.fillRect(sx + 13, sy + 4, 6, 6); ctx.globalAlpha = c;
    }
  }
  function drawChest(ctx, px, py, c) {
    var gold = c.tier >= 2 ? '#ffe070' : '#d8a030';
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(px + 4, py + 24, 24, 4);
    ctx.fillStyle = '#5a3418'; ctx.fillRect(px + 5, py + 13, 22, 12);
    ctx.fillStyle = '#7a4a22'; ctx.fillRect(px + 5, py + (c.opened ? 7 : 10), 22, c.opened ? 5 : 6);
    ctx.fillStyle = gold; ctx.fillRect(px + 5, py + 17, 22, 2); ctx.fillRect(px + 14, py + 14, 4, 6);
    if (c.opened) { ctx.fillStyle = '#1a0f08'; ctx.fillRect(px + 7, py + 13, 18, 3); }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = CC;
})(typeof window !== 'undefined' ? window : globalThis);
