/* CC.Realm - open-air tile maps (the town and the Giant Forest) that plug into the same interface as CC.Dungeon.
 *
 * CC.Realm.create(o) returns a Dungeon-compatible object: w,h,tiles(1 = solid),spawn,stairs,chests,enemySpawns,boss,secrets,
 * isSolid/isSolidTile/moveWithCollision/isVisible/isExplored/openChest/draw/drawLighting/drawFullMap. Classes, Enemies and Loot
 * only ever talk to CC.Dungeon, so the shell swaps CC.Dungeon to a realm while the player is outside the caves.
 *
 * Builder options: w,h, kind (Uint8Array, art id per tile), tiles (Uint8Array, 1 = solid), spawn {x,y}, stairs, chests,
 *   props [{x,y,draw(ctx,sx,sy,t,cam)}], lights [{x,y,r,color,inten,flicker}], ambient 'r,g,b,a', playerLight (px),
 *   viewR (px an enemy can be seen at), ground(kind,hv,tx,ty) -> css colour, drawSolid(ctx,kind,sx,sy,hv,t) for solid art,
 *   drawStairs(ctx,sx,sy,t), fog (0..1). Kinds: 0 ground, 1 wood floor, 2 dirt path, 3 tree, 4 log wall, 5 water, 6 planks,
 *   7 palisade, 8 ruined wall, 9 solid with no art of its own (a prop draws it). Solid kinds (3,4,7,8,9) go through drawSolid.
 * Fog and reveal options (all optional; omitting them keeps the old look except for the new view haze and distance fade):
 *   fog (0..1)      strength of the drifting mist bands AND of the haze over the player's view; 0 turns both off.
 *   fovFog (0..1)   multiplier for the view haze alone (default 1). It is a lighter fog tint laid over the lit area around the
 *                   player: thin at the player's feet, thicker toward the edge of sight, so scenery emerges from it as you walk up.
 *   fogColor 'r,g,b' tint of the haze (default '140,158,170').
 *   viewBoost       multiplier on playerLight and viewR (default 1.6, i.e. the hero sees 60% farther than the raw numbers say).
 *                   The haze is light (about 11% at its densest, scaled by fog), and the light's edge falls off softly.
 *   reveal false    switches the distance fade off. Otherwise trees, solid art, chests and props fade in between revealNear
 *                   (px, default viewR*0.7, fully shown) and revealFar (px, default viewR*1.35, hidden); anything inside a
 *                   lamp's light stays shown. A prop can opt out with reveal:false. D.revealAt(x,y) -> 0..1 gives the same fade.
 * Depth (walking behind trees): draw() keeps its y-sorted list, and D.drawFront(ctx, cam) redraws, over the entities, the solid
 *   tiles (3,4,7,8,9) and the props marked front:true or having a drawFront(ctx,sx,sy,t,cam,prop) method whose base y is below the
 *   player's y and whose box (prop.frontBox {w,h} = half-width and height in px, default 70 x 300) overlaps the player. The caller
 *   runs it after Classes/Enemies and before drawLighting. Items right behind the player go see-through down to frontFade
 *   (0..1, default 0.6, 1 = opaque) so the hero never vanishes. Safe to call on a map with nothing to redraw.
 *   Limit: an enemy lower on screen than a redrawn tree is covered by it as well, since only the player's y is compared.
 * Load order: before forest.js and town.js.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var T = CC.TILE = CC.TILE || 32;
  var PI2 = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hash(tx, ty) {
    var n = (Math.imul(tx, 374761393) + Math.imul(ty, 668265263)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function fade(d, near, far) { // 1 up to near, 0 from far on, smooth between
    if (d <= near) return 1;
    if (d >= far) return 0;
    var k = (far - d) / (far - near);
    return k * k * (3 - 2 * k);
  }
  function mkCanvas(w, h) {
    var c = root.document && root.document.createElement ? root.document.createElement('canvas') : null;
    if (c) { c.width = w; c.height = h; }
    return c;
  }

  function create(o) {
    var W = o.w, H = o.h, N = W * H;
    var D = {
      w: W, h: H, tiles: o.tiles || new Uint8Array(N), kind: o.kind || new Uint8Array(N), floor: 1, biome: 0, biomeName: o.name || 'Realm',
      spawn: o.spawn, stairs: o.stairs || { x: -999, y: -999, tx: -1, ty: -1 }, chests: o.chests || [], enemySpawns: o.enemySpawns || [],
      boss: null, secrets: [], seed: 0, props: o.props || [], lights: o.lights || [], explored: new Uint8Array(N),
      deferLighting: true, realm: true, name: o.name || 'Realm', ambient: o.ambient || '4,6,12,0.9', playerLight: (o.playerLight || 150) * (o.viewBoost === undefined ? 1.6 : o.viewBoost),
      viewR: (o.viewR || 190) * (o.viewBoost === undefined ? 1.6 : o.viewBoost), fogAmt: o.fog === undefined ? 0.5 : o.fog, _scr: null, _t: 0, _items: null,

      isSolidTile: function (tx, ty) {
        tx = Math.floor(tx); ty = Math.floor(ty);
        if (!(tx >= 0 && ty >= 0 && tx < W && ty < H)) return true;
        return D.tiles[ty * W + tx] !== 0;
      },
      isSolid: function (x, y) {
        if (!isFinite(x) || !isFinite(y)) return true;
        return D.isSolidTile(Math.floor(x / T), Math.floor(y / T));
      },
      isVisible: function (x, y) {
        var p = CC.state && CC.state.player, d, i;
        if (!p) return true;
        d = Math.hypot(x - p.x, y - p.y);
        if (d < D.viewR) return true;
        for (i = 0; i < D.lights.length; i++) { var L = D.lights[i]; if (Math.hypot(x - L.x, y - L.y) < L.r * 0.8 && Math.hypot(p.x - L.x, p.y - L.y) < L.r + D.viewR) return true; }
        return false;
      },
      // distance reveal: 1 near the player or inside a lamp's light, fading to 0 just past the light so scenery comes into view
      revealAt: function (x, y) {
        var p = CC.state && CC.state.player, near, far, a, i, L, la;
        if (o.reveal === false || !p) return 1;
        near = o.revealNear || D.viewR * 0.7; far = o.revealFar || D.viewR * 1.35;
        a = fade(Math.hypot(x - p.x, y - p.y), near, far);
        for (i = 0; a < 1 && i < D.lights.length; i++) {
          L = D.lights[i];
          la = fade(Math.hypot(x - L.x, y - L.y), L.r * 0.5, L.r * 0.9) * (L.inten === undefined ? 0.95 : L.inten);
          if (la > a) a = la;
        }
        return a;
      },
      isExplored: function (x, y) { var tx = Math.floor(x / T), ty = Math.floor(y / T); return tx >= 0 && ty >= 0 && tx < W && ty < H && D.explored[ty * W + tx] === 1; },
      nearStairs: function (e, d) { var a = e.x - D.stairs.x, b = e.y - D.stairs.y; return a * a + b * b <= (d || 26) * (d || 26); },
      openChest: function (c) { if (c && !c.opened) { c.opened = true; return true; } return false; },
      interact: function () { return false; },
      updateSecrets: function () {}, updateFov: function () {}, discoveredSecrets: function () { return []; },
      generate: function () { return D; },

      _resolve: function (e, r) {
        for (var it = 0; it < 4; it++) {
          var moved = false, x0 = Math.floor((e.x - r) / T), x1 = Math.floor((e.x + r) / T), y0 = Math.floor((e.y - r) / T), y1 = Math.floor((e.y + r) / T);
          for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
            if (!D.isSolidTile(tx, ty)) continue;
            var l = tx * T, t = ty * T, rr = l + T, b = t + T;
            var cx = clamp(e.x, l, rr), cy = clamp(e.y, t, b), dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
            if (d2 >= r * r - 1e-6) continue;
            if (d2 > 1e-9) { var d = Math.sqrt(d2), k = (r - d) / d; e.x += dx * k; e.y += dy * k; }
            else {
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
        for (var s = 0; s < steps; s++) { e.x += sx; e.y += sy; D._resolve(e, r); }
        return { x: e.x, y: e.y, hitX: Math.abs(e.x - sx0 - dx) > 0.01, hitY: Math.abs(e.y - sy0 - dy) > 0.01 };
      },

      // mark what the player has walked near so the full map (M) shows it
      _explore: function () {
        var p = CC.state && CC.state.player;
        if (!p) return;
        var ptx = Math.floor(p.x / T), pty = Math.floor(p.y / T), R = 8, x, y;
        for (y = Math.max(0, pty - R); y <= Math.min(H - 1, pty + R); y++) for (x = Math.max(0, ptx - R); x <= Math.min(W - 1, ptx + R); x++) {
          if ((x - ptx) * (x - ptx) + (y - pty) * (y - pty) <= R * R) D.explored[y * W + x] = 1;
        }
      },

      draw: function (ctx, cam) {
        D._t = Date.now() / 1000;
        var t = D._t, x0 = Math.floor(cam.x / T) - 1, y0 = Math.floor(cam.y / T) - 1;
        var x1 = Math.ceil((cam.x + cam.w) / T) + 1, y1 = Math.min(H - 1, Math.ceil((cam.y + cam.h) / T) + 6), x, y, i, items = [];
        D._explore();
        for (y = Math.max(0, y0); y <= y1; y++) for (x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
          i = y * W + x;
          var k = D.kind[i], hv = hash(x, y), sx = Math.round(x * T - cam.x), sy = Math.round(y * T - cam.y);
          if (k === 3 || k === 4 || k === 7 || k === 8 || k === 9) {
            // solid art stands on a ground tile, drawn y-sorted with props
            if (sy > -T - 8 && sy < cam.h + 4 && sx > -T * 2 && sx < cam.w + T) {
              ctx.fillStyle = o.ground(0, hv, x, y); ctx.fillRect(sx, sy, T, T);
            }
            items.push({ y: y * T + T, solid: k, sx: sx, sy: sy, hv: hv, tx: x, ty: y, a: D.revealAt(x * T + T / 2, y * T + T / 2) });
          } else if (sy > -T && sy < cam.h && sx > -T && sx < cam.w) {
            ctx.fillStyle = o.ground(k, hv, x, y); ctx.fillRect(sx, sy, T + 0.5, T + 0.5);
            if (o.detail) o.detail(ctx, k, sx, sy, hv, t, x, y);
          }
        }
        var c, n;
        for (n = 0; n < D.chests.length; n++) {
          c = D.chests[n];
          items.push({ y: c.y + 6, chest: c, sx: Math.round(c.x - cam.x), sy: Math.round(c.y - cam.y), a: D.revealAt(c.x, c.y) });
        }
        for (n = 0; n < D.props.length; n++) {
          var pr = D.props[n];
          if (pr.x < cam.x - 120 || pr.x > cam.x + cam.w + 120 || pr.y < cam.y - 240 || pr.y > cam.y + cam.h + 160) continue;
          items.push({ y: pr.y + (pr.sortY || 0), prop: pr, sx: Math.round(pr.x - cam.x), sy: Math.round(pr.y - cam.y), a: pr.reveal === false ? 1 : D.revealAt(pr.x, pr.y) });
        }
        if (D.stairs && D.stairs.x > -900) items.push({ y: D.stairs.y, stairs: true, sx: Math.round(D.stairs.x - cam.x), sy: Math.round(D.stairs.y - cam.y), a: 1 });
        items.sort(function (a, b) { return a.y - b.y; });
        D._items = items;
        var ga = ctx.globalAlpha;
        for (n = 0; n < items.length; n++) {
          var it = items[n];
          if (it.a < 0.03) continue; // still out of sight
          if (it.a < 1) ctx.globalAlpha = ga * it.a;
          if (it.solid) o.drawSolid(ctx, it.solid, it.sx, it.sy, it.hv, t, it.tx, it.ty, D);
          else if (it.chest) drawChest(ctx, it.chest, it.sx, it.sy, t);
          else if (it.prop) it.prop.draw(ctx, it.sx, it.sy, t, cam, it.prop);
          else if (it.stairs && o.drawStairs) o.drawStairs(ctx, it.sx, it.sy, t);
          if (it.a < 1) ctx.globalAlpha = ga;
        }
      },

      // walk-behind pass: redraw trees and flagged props that stand in front of the player (see the header)
      drawFront: function (ctx, cam) {
        var p = CC.state && CC.state.player, items = D._items, t = D._t, n, it, pr, sx, sy, cx, hw, up, a, dxa, ga, fmin;
        if (!p || !items || !items.length || !o.drawSolid) return;
        var px = p.x - cam.x, py = p.y - cam.y, rr = (p.r || 8) + 6;
        fmin = o.frontFade === undefined ? 0.6 : o.frontFade;
        ga = ctx.globalAlpha;
        for (n = 0; n < items.length; n++) {
          it = items[n];
          if (it.y <= p.y || it.a < 0.03 || !(it.solid || it.prop)) continue; // only things whose base is below the player's feet
          pr = it.prop;
          if (pr && !(pr.front === true || typeof pr.drawFront === 'function')) continue;
          if (pr) { sx = Math.round(pr.x - cam.x); sy = Math.round(pr.y - cam.y); cx = sx; hw = pr.frontBox && pr.frontBox.w || 70; up = pr.frontBox && pr.frontBox.h || 300; }
          else { sx = Math.round(it.tx * T - cam.x); sy = Math.round(it.ty * T - cam.y); cx = sx + T / 2; hw = 70; up = 340; }
          var base = pr ? sy : sy + T;
          if (cx + hw < px - rr || cx - hw > px + rr || base < py - 30 || base - up > py + 6) continue; // misses the player's box
          dxa = Math.abs(px - cx);
          a = it.a * (it.y - p.y < 200 ? fmin + (1 - fmin) * clamp((dxa - 12) / 34, 0, 1) : 1); // see-through while the hero is right behind it
          if (a < 1) ctx.globalAlpha = ga * a;
          if (pr) { if (pr.drawFront) pr.drawFront(ctx, sx, sy, t, cam, pr); else pr.draw(ctx, sx, sy, t, cam, pr); }
          else o.drawSolid(ctx, it.solid, sx, sy, it.hv, t, it.tx, it.ty, D);
          if (a < 1) ctx.globalAlpha = ga;
        }
      },

      // darkness with holes for the player's light and every lamp, then warm glows and drifting fog
      drawLighting: function (ctx, cam) {
        var w = Math.ceil(cam.w), h = Math.ceil(cam.h), p = CC.state && CC.state.player, t = Date.now() / 1000, i, g, L;
        if (!D._scr || D._scr.width !== w || D._scr.height !== h) D._scr = mkCanvas(w, h);
        var s = D._scr;
        if (!s) return;
        var q = s.getContext('2d');
        q.globalCompositeOperation = 'source-over';
        q.clearRect(0, 0, w, h);
        q.fillStyle = 'rgba(' + D.ambient + ')'; q.fillRect(0, 0, w, h);
        q.globalCompositeOperation = 'destination-out';
        function hole(x, y, r, a) {
          var gr = q.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, 'rgba(0,0,0,' + a + ')'); gr.addColorStop(0.55, 'rgba(0,0,0,' + a * 0.8 + ')'); gr.addColorStop(0.85, 'rgba(0,0,0,' + a * 0.35 + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)'); // wide, soft edge: no hard cut-off ring
          q.fillStyle = gr; q.fillRect(x - r, y - r, r * 2, r * 2);
        }
        if (p) hole(p.x - cam.x, p.y - cam.y, D.playerLight * (1 + 0.02 * Math.sin(t * 3)), 1);
        for (i = 0; i < D.lights.length; i++) {
          L = D.lights[i];
          if (L.x < cam.x - L.r * 1.2 || L.x > cam.x + w + L.r * 1.2 || L.y < cam.y - L.r * 1.2 || L.y > cam.y + h + L.r * 1.2) continue;
          var fl = 1 + (L.flicker || 0) * (Math.sin(t * 9 + i * 3.1) * 0.5 + Math.sin(t * 23 + i) * 0.5);
          hole(L.x - cam.x, L.y - cam.y, L.r * fl, L.inten === undefined ? 0.95 : L.inten);
        }
        ctx.drawImage(s, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (i = 0; i < D.lights.length; i++) {
          L = D.lights[i];
          if (!L.color || L.x < cam.x - L.r || L.x > cam.x + w + L.r || L.y < cam.y - L.r || L.y > cam.y + h + L.r) continue;
          var sx = L.x - cam.x, sy = L.y - cam.y, rr = L.r * 0.7 * (1 + (L.flicker || 0) * Math.sin(t * 11 + i));
          g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr);
          g.addColorStop(0, 'rgba(' + L.color + ',0.22)'); g.addColorStop(1, 'rgba(' + L.color + ',0)');
          ctx.fillStyle = g; ctx.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
        }
        ctx.restore();
        if (D.fogAmt > 0 && p && o.fovFog !== 0) { // view haze: a lighter fog over what the player can see, thin underfoot and thicker toward the edge of sight
          var fa = D.fogAmt * (o.fovFog === undefined ? 1 : o.fovFog) * (1 + 0.08 * Math.sin(t * 0.6)), fc = o.fogColor || '140,158,170';
          var hx = p.x - cam.x, hy = p.y - cam.y, hr = Math.max(60, D.viewR * 1.25);
          var hg = ctx.createRadialGradient(hx, hy, hr * 0.12, hx, hy, hr);
          hg.addColorStop(0, 'rgba(' + fc + ',0)'); hg.addColorStop(0.5, 'rgba(' + fc + ',' + (0.035 * fa) + ')'); hg.addColorStop(1, 'rgba(' + fc + ',' + (0.11 * fa) + ')');
          ctx.save(); ctx.fillStyle = hg; ctx.fillRect(0, 0, w, h); ctx.restore(); // outside the radius the gradient holds its last stop
        }
        if (o.afterLight) o.afterLight(ctx, cam, D); // glowing things that must show through the dark (arrows, eyes)
        if (D.fogAmt > 0) { // slow drifting mist bands, anchored to the world so they slide as you walk
          ctx.save();
          for (i = 0; i < 7; i++) {
            var fx = ((i * 211 + t * (6 + i * 1.3)) % (w + 360)) - 180, fy = ((i * 137 + 40) % (h + 80)) - 40 + Math.sin(t * 0.3 + i) * 12;
            fx -= (cam.x * 0.25) % 40;
            var fr = 120 + (i % 3) * 40, fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
            fg.addColorStop(0, 'rgba(150,165,175,' + (0.1 * D.fogAmt) + ')'); fg.addColorStop(1, 'rgba(150,165,175,0)');
            ctx.fillStyle = fg; ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
          }
          ctx.restore();
        }
      },

      drawMinimap: function () {},
      drawFullMap: function (c, w, h) {
        var top = 52, x, y, i, Ly = CC.mapLayout ? CC.mapLayout(W, H, w, h, true) : { cell: Math.max(1, Math.min((w - 48) / W, (h - 92) / H)), ox: Math.round((w - Math.max(1, Math.min((w - 48) / W, (h - 92) / H)) * W) / 2), oy: 52 };
        var cell = Ly.cell, ox = Ly.ox, oy = Ly.oy; // a big map is centred on the hero at a wide zoom (see CC.mapLayout)
        c.save();
        c.fillStyle = 'rgba(4,5,10,0.94)'; c.fillRect(0, 0, w, h);
        var vx0 = Math.max(0, Math.floor(-ox / cell)), vx1 = Math.min(W, Math.ceil((w - ox) / cell) + 1), vy0 = Math.max(0, Math.floor(-oy / cell)), vy1 = Math.min(H, Math.ceil((h - oy) / cell) + 1);
        for (y = vy0; y < vy1; y++) for (x = vx0; x < vx1; x++) {
          i = y * W + x;
          if (!D.explored[i]) continue;
          var k = D.kind[i];
          c.fillStyle = D.tiles[i] ? (k === 3 ? '#1f3a26' : k === 5 ? '#16384e' : '#5a4630') : k === 1 ? '#8a6a3a' : k === 2 || k === 6 ? '#7a6a4a' : '#2c3f30';
          c.fillRect(ox + x * cell, oy + y * cell, Math.ceil(cell), Math.ceil(cell));
        }
        var p = CC.state && CC.state.player;
        if (D.stairs && D.stairs.x > -900 && D.isExplored(D.stairs.x, D.stairs.y)) {
          c.fillStyle = '#ffd36b'; c.fillRect(ox + D.stairs.tx * cell - 1, oy + D.stairs.ty * cell - 1, Math.max(4, cell * 1.4), Math.max(4, cell * 1.4));
        }
        c.fillStyle = '#e8dcc4'; c.font = 'bold 13px Georgia, serif'; c.textAlign = 'center'; c.fillText(D.name, w / 2, top - 14);
        c.restore();
      }
    };
    return D;
  }

  function drawChest(ctx, c, sx, sy, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(sx, sy + 8, 12, 5, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = c.opened ? '#4a3220' : '#7a4a22'; ctx.fillRect(sx - 10, sy - 6, 20, 13);
    ctx.fillStyle = c.opened ? '#2a1a10' : '#9a6232'; ctx.fillRect(sx - 10, sy - (c.opened ? 10 : 6), 20, c.opened ? 4 : 5);
    ctx.fillStyle = '#d8b24a'; ctx.fillRect(sx - 2, sy - 2, 4, 5);
    if (!c.opened) { ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 3); ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(sx, sy, 16, 0, PI2); ctx.fill(); }
    ctx.restore();
  }

  CC.Realm = { create: create, hash: hash };
})(window);
