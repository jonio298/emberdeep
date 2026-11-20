/* CC.Explore - the co-op Explore run: Giant Forest -> Hollow Tree tunnel (and its mini boss) -> Rolling Plains -> the caves.
 * The caves are much harder in co-op: 30% more monsters, 40% more monster health, and nests of 10+ skeletons or 10+ snakes.
 * harden(map, floor) runs on the host right after a cave floor is populated; the guest receives the result in snapshots.
 */
(function (root) {
  'use strict';
  var CC = root.CC = root.CC || {};
  var HP_MUL = 1.4, EXTRA = 0.3;
  function rnd() { return Math.random(); }

  function scaleHp(e, m) { e.maxHp = Math.max(1, Math.round(e.maxHp * m)); e.hp = e.maxHp; }

  CC.Explore = {
    HP_MUL: HP_MUL, EXTRA: EXTRA,
    harden: function (map, floor) {
      var E = CC.Enemies, i;
      if (!E || !map) return;
      var base = E.list.slice(), spawn = map.spawn || { x: 0, y: 0 };
      // +40% health on everything that is already here
      for (i = 0; i < base.length; i++) scaleHp(base[i], HP_MUL);
      // +30% more monsters: a second one beside random existing ones
      var extra = Math.round(base.length * EXTRA), made = 0, tries = 0, pool = base.filter(function (e) { return !e.boss && !e.stitched; });
      while (made < extra && pool.length && tries++ < extra * 4) {
        var src = pool[Math.floor(rnd() * pool.length)], a = rnd() * 6.2832, d = 26 + rnd() * 30;
        var e = E.spawn(src.type, src.x + Math.cos(a) * d, src.y + Math.sin(a) * d, floor, { size: src.size });
        if (e) { scaleHp(e, HP_MUL); if (src.group) e.group = src.group; made++; }
      }
      // nests: 10+ skeletons or 10+ snakes packed into one room, woken together
      var spots = (map.enemySpawns || []).filter(function (p) { return Math.hypot(p.x - spawn.x, p.y - spawn.y) > 280; });
      var nests = Math.min(spots.length, 2 + Math.floor(floor / 3)), kinds = ['skeleton', 'snake'];
      for (i = 0; i < nests; i++) {
        var pt = spots.splice(Math.floor(rnd() * spots.length), 1)[0], kind = kinds[i % 2], n = 10 + Math.floor(rnd() * 5) + Math.floor(floor / 4);
        var gid = 5000 + i, k;
        for (k = 0; k < n; k++) {
          var aa = rnd() * 6.2832, rr = 14 + rnd() * 70;
          var m = E.spawn(kind, pt.x + Math.cos(aa) * rr, pt.y + Math.sin(aa) * rr, floor);
          if (m) { m.group = gid; scaleHp(m, HP_MUL); }
        }
      }
    }
  };
})(window);
