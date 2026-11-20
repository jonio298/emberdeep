/* Emberdeep shell: loop, input, camera, HUD, title/death screens, game-feel.
 *
 * Contract for other modules (all optional, every call is guarded):
 *   CC.state   {mode:'title'|'town'|'dungeon'|'dead', player, floor, gold, kills, map}
 *   CC.input   {moveX, moveY, aimX, aimY, attack, spell1, spell2, dash}
 *   camera     {x, y, w, h, zoom}: x,y = world top-left in px. The shell scales the ctx by zoom,
 *              so modules draw at (worldX - camera.x, worldY - camera.y) in world px.
 *   Dungeon    generate(floor) -> map {spawn:{x,y}, stairs:{x,y}, enemySpawns:[...]} (px coords), draw(ctx,cam)
 *   Classes    create(classId), update(dt), draw(ctx,cam)
 *   Enemies    spawnForFloor(floor, spawnPoints), update(dt), draw(ctx,cam)
 *   Loot       update(dt), draw(ctx,cam)
 *   Town       enter(), update(dt), draw(ctx,cam), load()
 *   player     {x,y,hp,maxHp,mana,maxMana,xp,xpNext|xpToNext,level, cd:{attack,spell1,spell2,dash},
 *               cdMax:{...}, spellNames:[a,b]} (cd values are seconds remaining)
 * Shell API: CC.setMode, CC.startRun(floor), CC.nextFloor(), CC.returnToTown(), CC.addKill(),
 *   CC.fx.shake(px), CC.fx.hitStop(sec), CC.fx.text(x,y,str,color,size), CC.fx.burst(x,y,color,n,speed)
 */
(function () {
  'use strict';

  var CC = window.CC = window.CC || {};
  CC.TILE = CC.TILE || 32;
  CC.input = { moveX: 0, moveY: 0, aimX: 1, aimY: 0, attack: false, spell1: false, spell2: false, dash: false, potion: false };
  CC.state = { mode: 'title', player: null, floor: 1, gold: 0, kills: 0, bestFloor: 1, map: null, classId: null, runGold: 0 };

  CC.CaveDungeon = CC.CaveDungeon || CC.Dungeon; // the realms (town, forest) swap CC.Dungeon; this keeps the cave generator

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 360, H = 640, dpr = 1, zoom = 1.5, titlePage = 'mode';
  var cam = { x: 0, y: 0, w: 240, h: 420, zoom: 1.5 };
  CC.getCamera = function () { return { x: cam.x, y: cam.y, w: cam.w, h: cam.h, zoom: curZoom || zoom, W: W, H: H }; };
  var curZoom = 0; // the zoom actually used on the last frame (Town Defense widens and narrows the view)
  // Player zoom: pinch with two fingers (or the mouse wheel) at any time. The target is set by the gesture and the
  // view eases toward it every frame, so the zoom is smooth. 1 = the normal view; below 1 zooms out.
  var ZOOM_MIN = 0.28, ZOOM_MAX = 2.2, userTarget = 1, userCur = 1, userAt = 0;
  try { var savedZoom = parseFloat(localStorage.getItem('emberdeep-zoom')); if (savedZoom >= ZOOM_MIN && savedZoom <= ZOOM_MAX) userTarget = userCur = savedZoom; } catch (_) { /* storage may be blocked */ }
  function setUserZoom(z) {
    userTarget = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    if (Math.abs(userTarget - 1) < 0.04) userTarget = 1; // a gentle detent at the normal view
  }
  CC.getUserZoom = function () { return userCur; };
  var pinch = { on: false, a: null, b: null, d0: 1, z0: 1 }, worldTouches = {};
  var STEP = 1 / 60;
  var time = 0;
  var hitStopLeft = 0, shakeMag = 0;
  var particles = [], texts = [], decals = [];
  var flashT = 0, flashMax = 0.15, flashCol = '#ffffff', hurtT = 0, lastHp = null, beat = 0, vigKey = '', vigGrad = null;
  var ui = [];                       // clickable canvas buttons rebuilt each frame
  var warned = {};

  var CLASSES = [
    { id: 'swordsman', name: 'Swordsman', color: '#e8a23a', desc: 'Tough frontline fighter. Fast combos, dash-slash, whirlwind.', spells: ['Bash', 'Whirl'] },
    { id: 'wizard', name: 'Wizard', color: '#5cc8ff', desc: 'Glass cannon. Arcane bolts, fireball, frost nova.', spells: ['Fire', 'Frost'] },
    { id: 'necromancer', name: 'Necromancer', color: '#a46bff', desc: 'Raise skeleton minions, drain life, harvest souls.', spells: ['Raise', 'Drain'] },
    { id: 'thief', name: 'Thief', color: '#7de0b8', desc: 'Fast and deadly. Crits, backstabs, throwing knives, shadow step.', spells: ['Knives', 'Smoke'] }
  ];

  /* ---------- safe module calls ---------- */
  function mod(name) { return CC[name] || null; }
  function call(name, fn) {
    var m = CC[name];
    if (!m || typeof m[fn] !== 'function') return undefined;
    try { return m[fn].apply(m, Array.prototype.slice.call(arguments, 2)); }
    catch (e) {
      if (!warned[name + fn]) { warned[name + fn] = 1; console.warn('CC.' + name + '.' + fn + ' failed:', e); }
    }
    return undefined;
  }
  function has(name, fn) { return !!(CC[name] && typeof CC[name][fn] === 'function'); }
  function uiOpen() { return !!(CC.UI && typeof CC.UI.isOpen === 'function' && CC.UI.isOpen()); } // skill tree / pack / map overlay

  /* ---------- game-feel ---------- */
  CC.fx = {
    shake: function (px) { shakeMag = Math.max(shakeMag, px || 4); },
    hitStop: function (sec) { hitStopLeft = Math.max(hitStopLeft, Math.min(sec || 0.05, 0.25)); },
    text: function (x, y, str, color, size) {
      if (texts.length > 80) texts.shift();
      size = size || 11;
      var big = size >= 14;
      texts.push({ x: x + (Math.random() - 0.5) * 8, y: y, vy: big ? -48 : -34, life: big ? 1.0 : 0.8, max: big ? 1.0 : 0.8, age: 0, s: String(str), c: color || '#fff', size: size });
    },
    burst: function (x, y, color, n, speed) {
      n = n || 10; speed = speed || 80;
      for (var i = 0; i < n; i++) {
        if (particles.length > 400) particles.shift();
        var a = Math.random() * 6.2832, v = speed * (0.3 + Math.random() * 0.7);
        particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + Math.random() * 0.4, max: 0.7, c: color || '#fff', size: 1 + Math.random() * 2, spark: true });
      }
    },
    // blood splatter: droplets arc under gravity (optionally biased along dx,dy) and leave floor stains where they land
    blood: function (x, y, n, dx, dy, color) {
      n = n || 8;
      var base = (dx || dy) ? Math.atan2(dy, dx) : 0, cone = (dx || dy) ? 1.1 : 3.1416;
      for (var i = 0; i < n; i++) {
        if (particles.length > 400) particles.shift();
        var a = base + (Math.random() * 2 - 1) * cone, v = 40 + Math.random() * 110;
        particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.45 + Math.random() * 0.45, max: 0.9, c: color || (Math.random() < 0.5 ? '#a01418' : '#6e0c10'), size: 1.5 + Math.random() * 2.5, blood: true });
      }
      if (n >= 6) addDecal(x, y, 3 + Math.random() * 4, color);
    },
    flash: function (color, sec) { flashCol = color || '#ffffff'; flashMax = flashT = Math.max(flashT, sec || 0.12); },
    hurt: function (sec) { hurtT = Math.max(hurtT, sec || 0.4); }
  };
  function addDecal(x, y, r, color) {
    if (decals.length > 220) decals.shift();
    decals.push({ x: x, y: y, r: r, c: color || '#5a0a0e', rot: Math.random() * 3.14, sq: 0.5 + Math.random() * 0.4 });
  }

  CC.addKill = function () { CC.state.kills++; };

  /* ---------- player fallback so the shell runs alone ---------- */
  function stubPlayer(classId) {
    var c = CLASSES.filter(function (k) { return k.id === classId; })[0] || CLASSES[0];
    return { stub: true, classId: c.id, color: c.color, x: 0, y: 0, r: 8, hp: 100, maxHp: 100, mana: 50, maxMana: 50,
      xp: 0, xpNext: 50, level: 1, speed: 90, cd: { attack: 0, spell1: 0, spell2: 0, dash: 0 },
      cdMax: { attack: 0.4, spell1: 4, spell2: 6, dash: 2 }, spellNames: c.spells };
  }

  /* Axis-separated swept hitbox; exact tile contact, including negative edges. */
  function movePlayer(p, dx, dy) {
    var D = CC.Dungeon, T = CC.TILE, r = p.r || p.radius || 8, eps = 1e-7;
    if (CC.state.mode !== 'dungeon' || !D || !D.isSolid) {
      p.x += dx; p.y += dy;
      return { x: p.x, y: p.y, hitX: false, hitY: false };
    }
    function blocked(x, y) {
      return D.isSolid(x - r + eps, y - r + eps) ||
        D.isSolid(x + r - eps, y - r + eps) ||
        D.isSolid(x - r + eps, y + r - eps) ||
        D.isSolid(x + r - eps, y + r - eps);
    }
    function axis(key, delta) {
      var count = Math.max(1, Math.ceil(Math.abs(delta) / Math.min(T / 4, r)));
      var step = delta / count, hit = false;
      for (var n = 0; n < count; n++) {
        var start = p[key], end = start + step;
        var x = key === 'x' ? end : p.x, y = key === 'y' ? end : p.y;
        if (!blocked(x, y)) { p[key] = end; continue; }
        var lo = 0, hi = 1;
        for (var k = 0; k < 40; k++) {
          var mid = (lo + hi) / 2, v = start + step * mid;
          if (blocked(key === 'x' ? v : p.x, key === 'y' ? v : p.y)) hi = mid;
          else lo = mid;
        }
        p[key] = start + step * lo;
        // Remove the probe tolerance so the physical edge rests on the wall.
        var edge = p[key] + (step > 0 ? r : -r);
        if (Math.abs(edge / T - Math.round(edge / T)) < 1e-6)
          p[key] = Math.round(edge / T) * T - (step > 0 ? r : -r);
        hit = true; break;
      }
      return hit;
    }
    var hitX = axis('x', dx), hitY = axis('y', dy);
    return { x: p.x, y: p.y, hitX: hitX, hitY: hitY };
  }
  CC.movePlayer = movePlayer;
  // Classes already route movement, blink and dash through this public helper.
  if (CC.Dungeon && CC.Dungeon.moveWithCollision) {
    var moveEntity = CC.Dungeon.moveWithCollision;
    CC.Dungeon.moveWithCollision = function (e, dx, dy) {
      if (e === CC.state.player) return movePlayer(e, dx, dy);
      return moveEntity.call(this, e, dx, dy);
    };
  }

  // In-memory session worlds: preserve dead monsters, opened loot and map geometry
  // across death, travel to town and revisits. A full reload resets these encounters.
  var worldCache={};
  var lastWorld=null; // the shared world as the host last stood in it (the host keeps simulating it while they are in town or a tent)
  function key(area,floor,treeFloor){return area+':'+(area==='tree-ascent'?(treeFloor||1):(floor||1));}
  function rememberWorld(){
    var s=CC.state,E=CC.Enemies,L=CC.Loot;
    if(s.map&&E&&(s.mode==='dungeon'||s.mode==='dead')&&s.area!=='town'){
      worldCache[key(s.area,s.floor,s.treeFloor)]={
        map:s.map,enemies:E.list.slice(),remains:E.remains||[],gore:E.gore||[],
        piles:E.piles||[],loot:L&&L.drops?L.drops.slice():[]
      };
    }
  }
  function clearWorldCache(){worldCache={};}
  CC.rememberSessionWorld=rememberWorld;
  CC.restoreSessionWorld=function(area,floor,treeFloor){
    var cache=worldCache[key(area,floor,treeFloor)],E=CC.Enemies,L=CC.Loot;
    if(!cache)return false;
    if(E){E.list=cache.enemies;E.remains=cache.remains;E.gore=cache.gore;
      E.piles=cache.piles;E.projectiles.length=0;E.zones=[];}
    if(L)L.drops=cache.loot;
    return true;
  };
  CC.reenterSavedCamp=function(meta){
    if(!meta||!['forest','plains','tree-ascent','tree-tunnel','cave'].includes(meta.area))return false;
    var s=CC.state;
    rememberWorld();
    s.area=meta.area;s.floor=Math.max(1,meta.floor||1);
    s.treeFloor=Math.max(1,meta.treeFloor||1);s.mode='dungeon';
    s.resumeSeed=meta.seed;
    loadFloor();return !!s.map;
  };

  CC.sessionStatus=function(){return {visited:Object.keys(worldCache)};};
  CC.respawnHere=function(){
    var s=CC.state,p=s.player,E=CC.Enemies;
    if(!p||s.mode!=='dead'||!s.map)return false;
    s.mode='dungeon';p.hp=p.maxHp;p.mana=p.maxMana;
    p.invuln=2;p.iframes=2;p.slowT=0;p.grabbedBy=null;p.grabT=0;
    p.x=s.map.spawn.x;p.y=s.map.spawn.y;
    if(E){E.projectiles.length=0;E.zones=[];}
    resetInputHeld();snapCamera();call('SaveGame','save');return true;
  };
  /* ---------- mode switching ---------- */
  CC.setMode = function (mode) {
    if(mode==='town')rememberWorld();
    CC.state.mode = mode;
    paused = false;
    call('UI', 'close');
    resetInputHeld();
    if (mode === 'town') {
      var p = CC.state.player;
      if (p) { p.hp = p.maxHp; p.mana = p.maxMana; if (p.stub) { p.x = 0; p.y = 0; } }
      call('Town', 'enter');
      call('Waypoints', 'discover', 'town', CC.Town && CC.Town.map);
      snapCamera();
    }
  };

  CC.startRun = function (floor, area) {
    call('CriticalScene', 'reset');
    var s = CC.state;
    s.area = area === 'tree-ascent' && has('TreeAscent', 'generate') ? 'tree-ascent' : area === 'tree-tunnel' && has('TreeTunnel', 'generate') ? 'tree-tunnel' : area === 'defense' && has('Defense', 'generate') ? 'defense' : area === 'plains' && has('Plains', 'generate') ? 'plains' : area === 'forest' && has('Forest', 'generate') ? 'forest' : 'cave'; // 'forest' = the Giant Forest, then the Rolling Plains, in front of floor 1
    s.floor = Math.max(1, floor | 0 || 1);
    if(!s.startGold)s.startGold=s.gold;
    s.mode = 'dungeon';
    paused = false;
    resetInputHeld();
    loadFloor();
  };

  // Travel between discovered regions without resetting hero XP, skills, equipment or gold.
  CC.travelToArea = function (dest) {
    if (dest !== 'plains' && dest !== 'forest' && dest !== 'cave') return false;
    if (dest === 'plains' && !(CC.Waypoints && CC.Waypoints.status().plains)) return false;
    call('CriticalScene', 'reset');
    CC.state.area=dest;CC.state.mode='dungeon';paused=false;
    resetInputHeld();loadFloor();
    return true;
  };
  CC.enterTreeAscent=function(byPartner){
    var s=CC.state,p=s.player,m=s.map;
    if(s.area!=='forest'||!p||!m||!m.ascentEntrance)return false;
    if(!byPartner&&Math.hypot(p.x-m.ascentEntrance.x,p.y-m.ascentEntrance.y)>67)return false;
    if(!CC.EggQuest||CC.EggQuest.stage()!=='climbing'){
      if(CC.fx&&CC.fx.text)CC.fx.text(p.x,p.y-27,
        CC.EggQuest&&CC.EggQuest.stage()==='unstarted'?'SPEAK TO SISTER ALDER':
          'THE EAGLE NEST HAS BEEN RESCUED','#ebc894',12);
      return true;
    }
    rememberWorld();s.area='tree-ascent';s.treeFloor=1;
    if(CC.fx&&CC.fx.text)CC.fx.text(p.x,p.y-24,'CLIMB TO THE EAGLE NEST','#d5e7b2',14);
    loadFloor();call('SaveGame','save');return true;
  };
  CC.nextFloor = function () {
    call('CriticalScene', 'reset');
    if(CC.state.area==='tree-ascent'){
      if(!call('TreeAscent','canAdvance'))return;
      if((CC.state.treeFloor||1)<5){
        rememberWorld();CC.state.treeFloor=(CC.state.treeFloor||1)+1;
        loadFloor();call('SaveGame','save');
      }
      return;
    }
    // Main hollow ALWAYS leads toward the Plains (via the original tunnel).
    // The egg ascent is a separate entrance, only reached from its side trail.
    if(CC.state.area==='forest'&&CC.EggQuest&&!CC.EggQuest.tunnelUnlocked()&&!CC.state.coop){
      var hero=CC.state.player,stage=CC.EggQuest.stage();
      if(hero)CC.fx.text(hero.x,hero.y-28,
        stage==='unstarted'?'SPEAK TO SISTER ALDER':
          stage==='climbing'?'FOLLOW THE EAGLE NEST SIDE PATH':'DELIVER EGGS TO ALDER',
        '#ecae7d',12);
      return;
    }
    rememberWorld();
    if (CC.state.area === 'forest' && has('TreeTunnel', 'generate')) {
      CC.state.area = 'tree-tunnel';
      CC.fx.text(cam.x + cam.w / 2, cam.y + cam.h / 2, 'INSIDE THE ANCIENT TREE', '#b9df8d', 16);
      loadFloor();
      return;
    }
    if (CC.state.area === 'tree-tunnel' && has('Plains', 'generate')) {
      if (!call('TreeTunnel', 'canExit')) return;
      CC.state.area = 'plains';
      CC.fx.text(cam.x + cam.w / 2, cam.y + cam.h / 2, 'THE OPEN PLAINS', '#ffd36b', 16);
      loadFloor();
      return;
    }
    if (CC.state.area === 'forest' && has('Plains', 'generate')) {
      CC.state.area = 'plains';
      CC.fx.text(cam.x + cam.w / 2, cam.y + cam.h / 2, 'THE OPEN PLAINS', '#ffd36b', 16);
      loadFloor();
      return;
    }
    if (CC.state.area === 'forest' || CC.state.area === 'plains') { // the hollow tree (or the barrow) leads down to floor 1 of the caves
      var fromPlains = CC.state.area === 'plains';
      CC.state.area = 'cave';
      CC.fx.text(cam.x + cam.w / 2, cam.y + cam.h / 2, fromPlains ? 'THE BARROW' : 'THE HOLLOW', '#ffd36b', 16);
      loadFloor();
      return;
    }
    CC.state.floor++;
    if (CC.state.floor > CC.state.bestFloor) CC.state.bestFloor = CC.state.floor;
    CC.fx.text(cam.x + cam.w / 2, cam.y + cam.h / 2, 'FLOOR ' + CC.state.floor, '#ffd36b', 16);
    loadFloor();
  };

  CC.returnToTown = function () { CC.state.fromForest = CC.state.mode === 'dungeon'; CC.setMode('town'); };

  function loadFloor() {
    var s=CC.state,p=s.player,map,E=CC.Enemies,L=CC.Loot,
        cached=worldCache[key(s.area,s.floor,s.treeFloor)];
    particles.length=0;texts.length=0;decals.length=0;call('Vfx','clear');
    if(cached&&cached.map){
      map=cached.map;CC.Dungeon=map;s.map=map;
      if(s.area==='forest'&&CC.Forest)CC.Forest.map=map;
      if(s.area==='plains'&&CC.Plains)CC.Plains.map=map;
      if(E){E.list=cached.enemies;E.remains=cached.remains;E.gore=cached.gore;
        E.piles=cached.piles;E.zones=[];E.projectiles.length=0;}
      if(L)L.drops=cached.loot;
      if(p&&map.spawn){p.x=map.spawn.x;p.y=map.spawn.y;}
      if(CC.Camp&&CC.Camp.bindToMap)CC.Camp.bindToMap(s.area,map);
      snapCamera();return;
    }
    if (s.area === 'forest') { map = call('Forest', 'generate',s.resumeSeed); CC.Dungeon = map; } // CC.Dungeon is whichever map the player is in
    else if (s.area === 'plains') { map = call('Plains', 'generate',s.resumeSeed); CC.Dungeon = map; }
    else if (s.area === 'tree-ascent') { map = call('TreeAscent','generate',s.treeFloor||1); CC.Dungeon=map; }
    else if (s.area === 'tree-tunnel') { map = call('TreeTunnel', 'generate', s.resumeSeed); CC.Dungeon = map; }
    else if (s.area === 'defense') { map = call('Defense', 'generate', s.resumeSeed); CC.Dungeon = map; }
    else { CC.Dungeon = CC.CaveDungeon; map = call('Dungeon', 'generate', s.floor, s.coop && Number.isFinite(s.resumeSeed) ? s.resumeSeed : undefined); }
    if (map && !Number.isFinite(map.seed)) map.seed = 0; // fixed-layout maps (the tunnel) still need a seed to be shared in co-op
    s.map = map || null;
    s.resumeSeed=null;
    if(s.area==='plains')call('Waypoints','discover','plains',map);
    call('Breakables','populate',s.area,map);
    var sp = map && (map.spawn || map.start);
    if (p && sp) { p.x = sp.x; p.y = sp.y; }
    else if (p && p.stub) { p.x = 0; p.y = 0; }
    if(s.area==='tree-ascent')call('TreeAscent','populate',s.treeFloor||1);
    else call('Enemies', 'spawnForFloor', s.area==='defense'?1:s.floor, (map && (map.enemySpawns || map.spawns)) || []);
    if(s.area==='defense')call('Defense','begin',map);
    // Explore co-op: the caves are far harder (the guest just receives the monsters from the host's snapshots)
    if(s.coop&&s.area==='cave'&&!(CC.Multiplayer&&CC.Multiplayer.isGuest&&CC.Multiplayer.isGuest()))call('Explore','harden',map,s.floor);
    if (s.area === 'tree-tunnel') call('TreeTunnel', 'populate', s.floor);
    if(CC.Camp&&CC.Camp.bindToMap)CC.Camp.bindToMap(s.area,map);
    snapCamera();
  }

  function startGame(classId) {
    var s = CC.state;
    s.coop = false;
    clearWorldCache();call('SaveGame','newGame');call('EggQuest','reset');
    s.gold=0;s.inventory=[];s.potions=2;s.manaPotions=1;s.bridgeDown=false;s.treeFloor=1;
    call('Camp', 'clear'); // a fresh hero must not inherit a previous run's fence or checkpoint
    call('Portal','reset');lastWorld=null;
    call('Waypoints','reset');
    s.classId = classId; s.kills = 0; s.runGold = 0; s.floor = 1;
    var p = call('Classes', 'create', classId);
    if (!p || typeof p !== 'object') p = stubPlayer(classId);
    s.player = p;
    s.charName = (CLASSES.filter(function (c) { return c.id === classId; })[0] || {}).name || classId;
    CC.setMode('town');
    call('SaveGame','save'); // the new character appears in the Continue list straight away
  }

  // A fresh, isolated multiplayer character. Never clear/overwrite solo saves.
  CC.beginCoop=function(classId,scene,character){
    clearWorldCache();
    var s=CC.state;
    call('Camp','clear');call('Portal','reset');call('EggQuest','reset');lastWorld=null;
    s.coop=true;s.inventory=[];s.potions=2;s.manaPotions=1;s.gold=0;s.kills=0;s.runGold=0;s.coopSlot=0;
    s.classId=classId;s.bestFloor=1;s.treeFloor=Math.max(1,scene&&scene.tf||1);
    s.player=call('Classes','create',classId);
    if(!s.player)s.player=stubPlayer(classId);
    // Diablo II style: the character you brought (from single player or an earlier co-op) keeps its level, gear and pack
    if(character&&character.data&&character.data.player&&character.data.classId===classId&&!s.player.stub){
      var cd=character.data;
      Object.assign(s.player,cd.player);
      call('Classes','applyItemStats',s.player);
      s.player.hp=s.player.maxHp;s.player.mana=s.player.maxMana;s.player.perkOpen=false;s.player.perkChoices=null;s.player.invuln=0;
      s.player.dashHit=null;s.player.grabbedBy=null;s.player.grabT=0;
      s.inventory=Array.isArray(cd.inventory)?JSON.parse(JSON.stringify(cd.inventory)):[];
      s.gold=cd.gold||0;s.potions=cd.potions||0;s.manaPotions=cd.manaPotions||0;
      s.coopSlot=character.slot||0;s.charName=character.name;
      call('EggQuest','restore',cd.quest); // the story you were on comes along
    }
    s.resumeSeed=scene&&Number.isFinite(scene.seed)?scene.seed:null;
    CC.startRun(scene&&scene.floor||1,(scene&&scene.area)||'forest');
    return true;
  };
  // put the hero beside a point (the leader, or a portal), on open ground
  function standNear(pt,beside){
    var s=CC.state,p=s.player,D=CC.Dungeon;
    if(!p||!pt||!Number.isFinite(pt.x)||!Number.isFinite(pt.y))return false;
    var offs=[[0,0],[22,0],[-22,0],[0,22],[0,-22],[30,18],[-30,18],[0,34]],i;
    for(i=beside?1:0;i<offs.length;i++){
      var x=pt.x+offs[i][0],y=pt.y+offs[i][1];
      if(!(D&&D.isSolid&&D.isSolid(x,y))){p.x=x;p.y=y;snapCamera();return true;}
    }
    return false;
  }
  CC.standNear=standNear;
  CC.syncCoopScene=function(scene,ax,ay){
    if(!scene||['cave', 'defense', 'forest', 'tree-tunnel', 'plains', 'tree-ascent'].indexOf(scene.area)<0||!CC.Multiplayer||!CC.Multiplayer.isGuest())return false;
    clearWorldCache();
    var s=CC.state;
    s.resumeSeed=scene.seed;s.treeFloor=Math.max(1,scene.tf||1);
    CC.startRun(scene.floor,scene.area);
    // arrive beside the leader (or at the portal you came through), not back at the entrance
    var x=Number.isFinite(ax)?ax:scene.px,y=Number.isFinite(ay)?ay:scene.py;
    if(Number.isFinite(x)&&Number.isFinite(y))standNear({x:x,y:y},true);
    return true;
  };
  /* ---- the shared world while the host is away (in town or in a tent) ---- */
  function inWorldNow(){
    var s=CC.state;
    return s.mode==='dungeon'&&!!s.map&&s.area!=='town'&&s.area!=='camp'&&s.area!=='camp-tent'&&!(CC.Camp&&CC.Camp.isInside&&CC.Camp.isInside());
  }
  function noteWorld(){
    var s=CC.state;
    if(!inWorldNow())return;
    lastWorld=lastWorld||{};
    lastWorld.map=s.map;lastWorld.dungeon=CC.Dungeon;lastWorld.area=s.area;lastWorld.floor=s.floor;lastWorld.treeFloor=s.treeFloor||1;
  }
  function isAwayNow(){var s=CC.state;return s.mode==='town'||!!(CC.Camp&&CC.Camp.isInside&&CC.Camp.isInside());}
  function coopHostAway(){
    var s=CC.state,MP=CC.Multiplayer;
    return !!(s.coop&&MP&&MP.isHost&&MP.isHost()&&lastWorld&&isAwayNow());
  }
  // The host's hero is elsewhere, so the monsters ignore them; the world keeps living for the partner, who still gets snapshots.
  function bgWorld(dt){
    var s=CC.state,w=lastWorld,keep={map:s.map,dungeon:CC.Dungeon,area:s.area,floor:s.floor,tf:s.treeFloor,player:s.player};
    s.map=w.map;CC.Dungeon=w.dungeon;s.area=w.area;s.floor=w.floor;s.treeFloor=w.treeFloor;
    try{
      s.player=null;
      call('Enemies','update',dt);call('Loot','update',dt);call('Breakables','update',dt);
      s.player=keep.player;
      call('Multiplayer','tick',dt);
    }finally{
      s.player=keep.player;
      s.map=keep.map;CC.Dungeon=keep.dungeon;s.area=keep.area;s.floor=keep.floor;s.treeFloor=keep.tf;
    }
  }
  /* ---- TP-Town: through the purple portal to the town centre, and back ---- */
  CC.portalToTown=function(){
    var s=CC.state,p=s.player,MP=CC.Multiplayer;
    if(!p||s.mode!=='dungeon'||!inWorldNow())return false;
    noteWorld();
    s.keepWorld=!!(s.coop&&MP&&MP.isHost&&MP.isHost()); // the host's monsters stay where they are
    if(CC.fx&&CC.fx.burst)CC.fx.burst(p.x,p.y,'#c58bff',18,95);
    s.fromForest=false;
    CC.setMode('town');
    s.keepWorld=false;
    call('Portal','arrived');
    return true;
  };
  CC.portalFromTown=function(){
    var s=CC.state,p=s.player,MP=CC.Multiplayer,mine=CC.Portal&&CC.Portal.mine&&CC.Portal.mine();
    if(!p||s.mode!=='town')return false;
    function sameAs(o,w){return o&&w&&o.area===w.area&&(o.floor||1)===(w.floor||1)&&(o.area!=='tree-ascent'||(o.treeFloor||1)===(w.treeFloor||1));}
    if(s.coop&&MP&&MP.active){
      if(MP.isHost()){
        if(!lastWorld)return false;
        s.area=lastWorld.area;s.floor=lastWorld.floor;s.treeFloor=lastWorld.treeFloor;s.map=lastWorld.map;CC.Dungeon=lastWorld.dungeon;s.mode='dungeon';
        call('Town','leave');
        var at=sameAs(mine,lastWorld)?mine:(lastWorld.map&&lastWorld.map.spawn);
        if(!standNear(at,!!sameAs(mine,lastWorld)))snapCamera();
      }else if(!(MP.rejoin&&MP.rejoin(mine)))return false;
    }else{
      if(!mine)return false;
      s.area=mine.area;s.floor=mine.floor;s.treeFloor=mine.treeFloor;s.mode='dungeon';
      if(Number.isFinite(mine.seed))s.resumeSeed=mine.seed;
      call('Town','leave');
      loadFloor();
      standNear(mine,true);
    }
    resetInputHeld();snapCamera();
    call('Portal','arrived');
    if(CC.fx&&CC.fx.burst&&s.player)CC.fx.burst(s.player.x,s.player.y,'#c58bff',18,95);
    return true;
  };
  CC.leaveTreeAscent=function(){
    var s=CC.state;
    if(s.area!=='tree-ascent'||!CC.EggQuest||!CC.EggQuest.hasGathered())return false;
    rememberWorld();s.area='forest';s.floor=1;loadFloor();
    // Leave via the quest tree at the end of its side trail, NOT the hollow tunnel.
    if(s.map&&s.map.ascentEntrance&&s.player){
      s.player.x=s.map.ascentEntrance.x;s.player.y=s.map.ascentEntrance.y;
    }
    call('SaveGame','save');return true;
  };
  // Continue retains RPG/quest progress; level geometry may regenerate after a
  // browser restart, while all in-memory maps survive ordinary deaths/returns.
  CC.loadSavedGame=function(data){
    if(!data||!data.player||!data.classId)return false;
    clearWorldCache();
    call('Camp','clear');call('Portal','reset');lastWorld=null;call('CriticalScene','reset');call('UI','close');
    call('Waypoints','reset');call('EggQuest','restore',data.quest);
    var s=CC.state,p=call('Classes','create',data.classId);
    if(!p)return false;
    Object.assign(p,data.player);
    var hp=p.hp,mp=p.mana;
    call('Classes','applyItemStats',p);
    p.hp=Math.max(1,Math.min(p.maxHp,hp));
    p.mana=Math.max(0,Math.min(p.maxMana,mp));
    p.perkOpen=false;p.perkChoices=null;p.invuln=1;
    p.dashHit=null;p.grabbedBy=null;p.grabT=0;
    s.player=p;s.classId=data.classId;s.charName=data.charName||p.name;
    s.floor=Math.max(1,data.floor||1);
    s.treeFloor=Math.max(1,Math.min(5,data.treeFloor||1));
    s.gold=data.gold||0;s.kills=data.kills||0;s.runGold=data.runGold||0;
    s.bestFloor=data.bestFloor||1;s.bridgeDown=!!data.bridgeDown;
    s.potions=data.potions||0;s.manaPotions=data.manaPotions||0;s.inventory=Array.isArray(data.inventory)?data.inventory:[];
    s.area=data.area||'town';s.resumeSeed=data.seed;
    if(data.waypoints&&CC.Waypoints&&CC.Waypoints.restore)
      CC.Waypoints.restore(data.waypoints);
    paused=false;resetInputHeld();
    if(s.area==='town'||data.mode==='town'){
      s.mode='town';CC.setMode('town');p.hp=Math.max(1,Math.min(p.maxHp,hp));
      p.mana=Math.max(0,Math.min(p.maxMana,mp));
    }else{
      s.mode='dungeon';loadFloor();
      var nx=Number(data.x),ny=Number(data.y),D=CC.Dungeon,rad=p.r||8;
      if(Number.isFinite(nx)&&Number.isFinite(ny)&&D&&D.isSolid&&
          !D.isSolid(nx-rad,ny-rad)&&!D.isSolid(nx+rad,ny+rad)&&
          !D.isSolid(nx-rad,ny+rad)&&!D.isSolid(nx+rad,ny-rad)){
        p.x=nx;p.y=ny;
      }
    }
    if(data.camp&&CC.Camp&&CC.Camp.importState)CC.Camp.importState(data.camp);
    snapCamera();return true;
  };
  function playerDead() {
    var p = CC.state.player;
    return p && p.hp <= 0;
  }
  CC.killPlayer = function () { if (CC.state.player) CC.state.player.hp = 0; };

  /* ---------- input ---------- */
  var keys = {};
  var joy = { id: null, bx: 0, by: 0, x: 0, y: 0, vx: 0, vy: 0, fixed: false };
  var held = { attack: 0, spell1: 0, spell2: 0, dash: 0, interact: 0, potion: 0, mpotion: 0 };
  var pending = {};
  var actionKeys = { Space: 'attack', KeyQ: 'spell1', KeyE: 'spell2',
    ShiftLeft: 'dash', ShiftRight: 'dash', KeyF: 'interact', Enter: 'interact', KeyH: 'potion', KeyN: 'mpotion' };
  var paused = false, uiWas = false;
  function playing() { return CC.state.mode === 'town' || CC.state.mode === 'dungeon'; }
  function pressAction(name) {
    if (playing() && !paused && !uiOpen() && !(CC.state.player && CC.state.player.perkOpen)) pending[name] = true;
  }
  CC.useManaPotion = function () {
    var s=CC.state,p=s&&s.player;
    if (!p || p.hp<=0 || p.mana>=p.maxMana || !s.manaPotions || !playing() ||
        paused || uiOpen() || p.perkOpen || (CC.Camp && CC.Camp.isOpen && CC.Camp.isOpen())) return false;
    s.manaPotions--;
    var amount=Math.max(25,Math.ceil(p.maxMana*.5)),before=p.mana;
    p.mana=Math.min(p.maxMana,p.mana+amount);
    if(CC.fx) { CC.fx.text(p.x,p.y-25,'+'+Math.ceil(p.mana-before)+' MP','#7fc4ff',12); CC.fx.burst(p.x,p.y,'#4a9bff',15,90); }
    return true;
  };
  CC.usePotion = function () {
    var s=CC.state,p=s&&s.player;
    if (!p || p.hp<=0 || p.hp>=p.maxHp || !s.potions || !playing() ||
        paused || uiOpen() || p.perkOpen || (CC.Camp && CC.Camp.isOpen && CC.Camp.isOpen())) return false;
    s.potions--;
    var amount=Math.max(20,Math.ceil(p.maxHp*.40)),before=p.hp;
    p.hp=Math.min(p.maxHp,p.hp+amount);
    if(CC.fx) {
      CC.fx.text(p.x,p.y-25,'+'+Math.ceil(p.hp-before)+' HP','#ff8493',12);
      CC.fx.burst(p.x,p.y,'#e74359',15,90);
    }
    return true;
  };
  function togglePause() {
    if (!playing()) return;
    paused = !paused;
    resetInputHeld();
  }
  function interact() {
    var s = CC.state, p = s.player;
    if (!p) return;
    if (CC.Multiplayer && CC.Multiplayer.isGuest && CC.Multiplayer.isGuest() && s.map) { // co-op guest: the host owns chests and stairs
      var gch = s.map.chests || [], gi;
      for (gi = 0; gi < gch.length; gi++) if (!gch[gi].opened && Math.hypot(p.x - gch[gi].x, p.y - gch[gi].y) <= 36) { CC.Multiplayer.requestChest(gi); return; }
      var gst = s.map.stairs, gae = s.map.ascentEntrance;
      if (s.area === 'forest' && gae && Math.hypot(p.x - gae.x, p.y - gae.y) <= 67) { CC.Multiplayer.requestTree(); CC.fx.text(p.x, p.y - 24, 'Following the leader...', '#d5e7b2', 10); return; }
      if (gst && gst.x > -900 && Math.hypot(p.x - gst.x, p.y - gst.y) <= 60) { CC.Multiplayer.requestDescend(); CC.fx.text(p.x, p.y - 24, 'Following the leader...', '#ffd36b', 10); return; }
    }
    if (CC.Waypoints && CC.Waypoints.interact && CC.Waypoints.interact()) return;
    if(s.area==='defense'&&CC.Defense&&CC.Defense.interact&&CC.Defense.interact())return;
    if(s.area==='tree-ascent'&&call('TreeAscent','interact'))return;
    if(s.area==='forest'&&CC.enterTreeAscent&&CC.enterTreeAscent())return;
    if(s.area==='forest'&&s.map&&s.map.stairs&&
        Math.hypot(p.x-s.map.stairs.x,p.y-s.map.stairs.y)<58){CC.nextFloor();return;}
    if (CC.Camp && CC.Camp.interact && CC.Camp.interact()) return;
    if (s.mode === 'town') {
      if (has('Town', 'interact')) call('Town', 'interact');
      else CC.startRun(1);
      return;
    }
    if (s.area === 'forest' && has('Forest', 'interact') && call('Forest', 'interact')) return;
    if (s.area === 'plains' && has('Plains', 'interact') && call('Plains', 'interact')) return;
    var st = s.map && s.map.stairs;
    if (st && Math.hypot(p.x - st.x, p.y - st.y) <= 26) { CC.nextFloor(); return; }
    var chests = s.map && s.map.chests || [];
    for (var n = 0; n < chests.length; n++) {
      var c = chests[n];
      if (!c.opened && Math.hypot(p.x - c.x, p.y - c.y) <= 32) {
        if (call('Dungeon', 'openChest', c)) call('Loot', 'roll', c, s.floor, 0);
        return;
      }
    }
    call('Loot', 'pickupNear', p);
  }
  // The mobile primary button switches to F/Enter only when an actionable target is close.
  // Keep the original keyboard actions unchanged, including Space for attack.
  function nearbyAction() {
    var s = CC.state, p = s.player, map = s.map;
    if (!p || !playing()) return false;
    if (CC.Waypoints && CC.Waypoints.isNear && CC.Waypoints.isNear()) return true;
    if(s.area==='tree-ascent'&&call('TreeAscent','nearAction'))return true;
    if (CC.Camp && CC.Camp.nearAction && CC.Camp.nearAction()) return true;
    function near(o, radius) { return o && Math.hypot(p.x - o.x, p.y - o.y) <= radius; }
    var npcs, j;
    if (s.mode === 'town') {
      if (CC.Town && CC.Town.dialog) return true;
      npcs = CC.Town && CC.Town.map && CC.Town.map.npcs || [];
      for (j = 0; j < npcs.length; j++) if (near(npcs[j], 48)) return true;
      return false;
    }
    if ((s.area === 'forest' || s.area === 'plains') && map) {
      npcs = map.npcs || [];
      for (j = 0; j < npcs.length; j++) if (near(npcs[j], 48)) return true;
    }
    // Forest/plains transitions happen by walking into them, not by using F.
    if (s.area==='forest'&&map&&near(map.ascentEntrance,67))return true;
    if (s.area==='forest'&&map&&near(map.stairs,58))return true;
    if (s.area !== 'forest' && s.area !== 'plains' && map && near(map.stairs, 26)) return true;
    var chests = map && map.chests || [];
    for (j = 0; j < chests.length; j++) if (!chests[j].opened && near(chests[j], 32)) return true;
    return false;
  }
  var ptrs = {},lastMouseWorld=null;
  var btns = {};                      // layout, recomputed on resize

  function layout() {
    var m = 18;
    btns.attack = { x: W - m - 44, y: H - m - 74, r: 40, label: 'ATK' };
    btns.spell1 = { x: W - m - 118, y: H - m - 40, r: 29, label: 'S1' };
    btns.spell2 = { x: W - m - 100, y: H - m - 120, r: 29, label: 'S2' };
    btns.dash = { x: W - m - 28, y: H - m - 154, r: 24, label: 'DASH' };
    // health and mana potions side by side, directly above DASH
    btns.potion = { x: btns.dash.x - 22, y: btns.dash.y - 48, r: 19, label: 'POTION' };
    btns.mpotion = { x: btns.dash.x + 22, y: btns.dash.y - 48, r: 19, label: 'MANA' };
  }

  function resetInputHeld() {
    call('SpellCharge','cancel');
    held.attack = held.spell1 = held.spell2 = held.dash = held.interact = held.potion = held.mpotion = 0;
    keys = {}; pending = {};
    lastMouseWorld=null;
    joy.id = null; joy.x = joy.y = 0;
    ptrs = {};
    call('Charge', 'cancel');
    var i = CC.input; i.moveX = i.moveY = 0; i.attack = i.spell1 = i.spell2 = i.dash = i.interact = i.potion = i.mpotion = false;
  }

  function pollInput() {
    var i = CC.input;
    var kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    var ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    var mx = joy.x, my = joy.y;
    if (kx || ky) {
      var l = Math.sqrt(kx * kx + ky * ky);
      mx = kx / l; my = ky / l;
    }
    i.moveX = mx; i.moveY = my;
    if (Math.abs(mx) + Math.abs(my) > 0.2) {
      var n = Math.sqrt(mx * mx + my * my);
      i.aimX = mx / n; i.aimY = my / n;
    }
    ['attack', 'spell1', 'spell2', 'dash', 'interact', 'potion', 'mpotion'].forEach(function (name) {
      i[name] = !!pending[name];
    });
    pending = {};
  }

  function hitUi(x, y) {
    for (var k = ui.length - 1; k >= 0; k--) {
      var b = ui[k];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  function pos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }

  var JOY_R = 58;
  function joyHome() { return { x: 84, y: H - 96 }; }
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* not fatal */ }
    var p = pos(e);
    var u = hitUi(p.x, p.y);
    if (u) { ptrs[e.pointerId] = { kind: 'ui' }; u.cb(); return; }
    var mode = CC.state.mode;
    if (paused || uiOpen() || (CC.Waypoints && CC.Waypoints.isOpen && CC.Waypoints.isOpen()) ||
        (CC.state.player && CC.state.player.perkOpen) || (mode !== 'dungeon' && mode !== 'town')) return;
    for (var name in btns) {
      var b = btns[name], dx = p.x - b.x, dy = p.y - b.y;
      if (dx * dx + dy * dy <= (b.r + 10) * (b.r + 10)) {
        var action = name === 'attack' && nearbyAction() ? 'interact' : name;
        // Charged spells are press/hold/release, unlike instantaneous tap-ATK.
        // Track this pointer independently so dragging aims without moving.
        if(mode==='dungeon' && (action==='spell1'||action==='spell2'||action==='dash') &&
           CC.SpellCharge){
          if(CC.SpellCharge.begin(action,b.x,b.y,W,H)){
            ptrs[e.pointerId]={kind:'charge',name:action};
            held[action]++;
          }
          // Never fire another instant spell while one is being aimed.
          return;
        }
        ptrs[e.pointerId] = { kind: 'btn', name: action };
        if (!held[action]) pressAction(action);
        held[action]++;
        return;
      }
    }
    // Two fingers placed close together on the empty world make a pinch-zoom; a thumb on the stick plus a far-away
    // second thumb is still just movement.
    if (e.pointerType === 'touch') {
      var others = Object.keys(worldTouches);
      if (!pinch.on && others.length === 1) {
        var o = worldTouches[others[0]], pd = Math.hypot(p.x - o.x, p.y - o.y);
        if (pd >= 24 && pd < W * 0.5) {
          pinch.on = true; pinch.a = +others[0]; pinch.b = e.pointerId; pinch.d0 = pd; pinch.z0 = userTarget;
          worldTouches[e.pointerId] = { x: p.x, y: p.y };
          if (joy.id === pinch.a) { joy.id = null; joy.x = joy.y = 0; } // stop walking while zooming
          ptrs[pinch.a] = { kind: 'pinch' }; ptrs[pinch.b] = { kind: 'pinch' };
          return;
        }
      } else if (others.length === 0) worldTouches[e.pointerId] = { x: p.x, y: p.y };
    }
    // The stick: left side of the screen, below the HUD. It is anchored where you touch (or at a fixed home spot) and only
    // ever drifts when the thumb goes far past the ring, so it can never wander across the screen.
    if (joy.id === null && p.x < W * 0.55 && p.y > H * 0.25) {
      var fixedStick = CC.Settings && CC.Settings.get('stick') === 'fixed', home = joyHome();
      if (!fixedStick || Math.hypot(p.x - home.x, p.y - home.y) < JOY_R * 2.2) {
        joy.id = e.pointerId; joy.x = joy.y = 0; joy.vx = joy.vy = 0; joy.fixed = fixedStick;
        if (fixedStick) { joy.bx = home.x; joy.by = home.y; }
        else { joy.bx = Math.max(JOY_R + 14, Math.min(W * 0.5, p.x)); joy.by = Math.max(H * 0.3, Math.min(H - JOY_R - 14, p.y)); }
        ptrs[e.pointerId] = { kind: 'joy' };
        if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) { /* optional */ } }
      }
    }
  }, { passive: false });

  canvas.addEventListener('pointermove', function (e) {
    if (worldTouches[e.pointerId]) { var wp = pos(e); worldTouches[e.pointerId] = { x: wp.x, y: wp.y }; }
    if (pinch.on && (e.pointerId === pinch.a || e.pointerId === pinch.b)) {
      e.preventDefault();
      var ta = worldTouches[pinch.a], tb = worldTouches[pinch.b];
      if (ta && tb) setUserZoom(pinch.z0 * Math.hypot(ta.x - tb.x, ta.y - tb.y) / pinch.d0);
      return;
    }
    var pressed=ptrs[e.pointerId];
    if(pressed&&pressed.kind==='charge'){
      e.preventDefault();
      var thumb=pos(e);
      call('SpellCharge','drag',thumb.x,thumb.y,W,H);
      return;
    }
    // PC: select an exact world-space destination under the mouse while
    // holding Q/E/Shift. Mobile sticks to independent drag-from-button aiming.
    if(e.pointerType==='mouse'){
      var cursor=pos(e);
      lastMouseWorld={x:cam.x+cursor.x/(curZoom||zoom),y:cam.y+cursor.y/(curZoom||zoom)};
      if(CC.SpellCharge&&CC.SpellCharge.isActive&&CC.SpellCharge.isActive())
        call('SpellCharge','worldAim',lastMouseWorld.x,lastMouseWorld.y);
    }
    if (e.pointerId !== joy.id) return;
    e.preventDefault();
    var p = pos(e), dx = p.x - joy.bx, dy = p.y - joy.by;
    var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    // only a long overshoot pulls the base along, and never out of the left side of the screen
    var REACH = JOY_R * 2.1;
    if (!joy.fixed && d > REACH) {
      joy.bx = Math.max(JOY_R + 14, Math.min(W * 0.5, p.x - dx / d * REACH)); joy.by = Math.max(H * 0.3, Math.min(H - JOY_R - 14, p.y - dy / d * REACH));
      dx = p.x - joy.bx; dy = p.y - joy.by; d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    }
    var vr = Math.min(d, JOY_R);
    joy.vx = dx / d * vr; joy.vy = dy / d * vr; // where the thumb is drawn: always on the ring
    // dead zone in the middle, full speed before the rim, and a gentle curve for fine control at low speed
    var raw = Math.max(0, Math.min(1, (vr - JOY_R * 0.12) / (JOY_R * 0.78))), m = Math.pow(raw, 1.3);
    if (m <= 0.001) { joy.x = joy.y = 0; } else { joy.x = dx / d * m; joy.y = dy / d * m; }
  }, { passive: false });

  function release(e) {
    delete worldTouches[e.pointerId];
    if (pinch.on && (e.pointerId === pinch.a || e.pointerId === pinch.b)) {
      pinch.on = false; delete ptrs[e.pointerId];
      var rest = e.pointerId === pinch.a ? pinch.b : pinch.a; // the other finger just waits to lift; it does not start the stick
      if (ptrs[rest]) ptrs[rest] = { kind: 'ui' };
      delete worldTouches[rest];
      try { localStorage.setItem('emberdeep-zoom', String(userTarget)); } catch (_) { /* optional */ }
      return;
    }
    var r = ptrs[e.pointerId];
    if (!r) return;
    delete ptrs[e.pointerId];
    if (r.kind === 'joy') { joy.id = null; joy.x = joy.y = 0; }
    else if(r.kind==='charge'){
      held[r.name]=Math.max(0,held[r.name]-1);
      if(e.type==='pointerup' && !paused && playing() && !uiOpen())
        call('SpellCharge','release',r.name);
      else call('SpellCharge','cancel');
    }
    else if (r.kind === 'btn') held[r.name] = Math.max(0, held[r.name] - 1);
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('wheel', function (e) {
    if (!playing() || paused || uiOpen()) return;
    e.preventDefault();
    setUserZoom(userTarget * Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016)));
    try { localStorage.setItem('emberdeep-zoom', String(userTarget)); } catch (_) { /* optional */ }
  }, { passive: false });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  ['gesturestart', 'gesturechange', 'dblclick'].forEach(function (n) {
    document.addEventListener(n, function (e) { e.preventDefault(); });
  });

  window.addEventListener('keydown', function (e) {
    if (actionKeys[e.code] || e.code === 'Escape' || e.code === 'KeyP' || e.code.indexOf('Arrow') === 0) e.preventDefault();
    if (e.repeat || keys[e.code]) return;
    keys[e.code] = true;
    if (CC.Waypoints && CC.Waypoints.isOpen && CC.Waypoints.isOpen() &&
        CC.Waypoints.key(e.code)) { e.preventDefault(); return; }
    if (CC.Camp && CC.Camp.isOpen && CC.Camp.isOpen() && CC.Camp.key(e.code)) return;
    // K / I / M open the skill tree, pack and map; Escape closes whichever is open before it would pause
    if (playing() && call('UI', 'key', e.code)) { resetInputHeld(); return; }
    if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
    if (e.code === 'KeyG') { call('Dungeon', 'toggleDebugGrid'); return; } // collision-grid overlay
    if(actionKeys[e.code]){
      var action=actionKeys[e.code];
      if((action==='spell1'||action==='spell2'||action==='dash') &&
         CC.state.mode==='dungeon'&&!paused && !uiOpen()){
        if(call('SpellCharge','begin',action,0,0) && lastMouseWorld)
          call('SpellCharge','worldAim',lastMouseWorld.x,lastMouseWorld.y);
      }else pressAction(action);
    }
  });
  window.addEventListener('keyup', function (e) {
    if(keys[e.code] && actionKeys[e.code]){
      var action=actionKeys[e.code];
      if(action==='spell1'||action==='spell2'||action==='dash')
        call('SpellCharge','release',action);
    }
    keys[e.code] = false;
  });
  window.addEventListener('blur', function () { keys = {}; resetInputHeld(); });

  /* ---------- sizing ---------- */
  function resize() {
    W = window.innerWidth || 360; H = window.innerHeight || 640;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    zoom = Math.max(1, Math.min(3, H / 400));
    cam.zoom = zoom; cam.w = W / zoom; cam.h = H / zoom;
    layout();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  /* ---------- update ---------- */
  function snapCamera() {
    var p = CC.state.player;
    if (p) { cam.x = p.x - cam.w / 2; cam.y = p.y - cam.h / 2; }
  }

  function updateStub(dt) {
    var p = CC.state.player, i = CC.input;
    if (!p || !p.stub) return;
    movePlayer(p, i.moveX * p.speed * dt, i.moveY * p.speed * dt);
    for (var k in p.cd) if (p.cd[k] > 0) p.cd[k] = Math.max(0, p.cd[k] - dt);
    p.mana = Math.min(p.maxMana, p.mana + 3 * dt);
    var act = [['attack', i.attack], ['spell1', i.spell1], ['spell2', i.spell2], ['dash', i.dash]];
    act.forEach(function (a) {
      if (a[1] && p.cd[a[0]] <= 0) {
        p.cd[a[0]] = p.cdMax[a[0]];
        CC.fx.burst(p.x + i.aimX * 12, p.y + i.aimY * 12, p.color, 8, 90);
        CC.fx.shake(a[0] === 'attack' ? 1 : 3);
      }
    });
  }

  // Walking into the hollow tree (forest -> plains) or the barrow (plains -> caves) fades through a short tunnel, then the next area loads.
  var tunnel = null;
  function updateTunnel(dt) {
    tunnel.t += dt;
    if (!tunnel.swapped && tunnel.t >= 0.7) { tunnel.swapped = true; CC.nextFloor(); }
    if (tunnel.t >= 1.5) tunnel = null;
  }
  function drawTunnel() {
    var t = tunnel.t, a = t < 0.7 ? t / 0.7 : Math.max(0, 1 - (t - 0.7) / 0.8);
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.08, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, '#2a1608'); g.addColorStop(0.45, '#120a05'); g.addColorStop(1, '#030201');
    ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    label(tunnel.label, W / 2, H / 2, 22, '#ffd36b');
    ctx.globalAlpha = 1;
  }

  // Presentation effects must keep expiring while gameplay is blocked by perk selection,
  // inventory/skill overlays, manual pause, or camp confirmation dialogs.
  // No enemies, input, combat, or player movement are advanced here.
  function updatePresentationFx(dt) {
    for (var a = particles.length - 1; a >= 0; a--) {
      var q = particles[a];
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92;
      if (q.blood) q.vy += 260 * dt;
      if (q.life <= 0) {
        if (q.blood && Math.random() < 0.5) addDecal(q.x, q.y, q.size * 0.8, q.c);
        particles.splice(a, 1);
      }
    }
    for (var b = texts.length - 1; b >= 0; b--) {
      var t = texts[b];
      t.life -= dt; t.age += dt; t.y += t.vy * dt; t.vy *= 0.94;
      if (t.life <= 0) texts.splice(b, 1);
    }
    if (flashT > 0) flashT = Math.max(0, flashT - dt);
    if (hurtT > 0) hurtT = Math.max(0, hurtT - dt);
    shakeMag *= Math.pow(0.002, dt);
    if (shakeMag < 0.1) shakeMag = 0;
  }

  function update(dt) {
    var s = CC.state, p = s.player;
    time += dt;
    call('UI', 'update', dt);
    call('Settings', 'tick', dt);
    updatePresentationFx(dt);
    call('Waypoints','update',dt);
    call('EggQuest','update',dt);
    if(!s.coop)call('SaveGame','auto',dt);
    else call('SaveGame','autoCharacter',dt);
    if (uiOpen() !== uiWas) { uiWas = uiOpen(); resetInputHeld(); }
    if (call('Eagle', 'sceneActive')) return; // the egg is hatching: the game waits
    // In a co-op session the world is shared, so a menu or a level-up perk popup must NOT freeze it: that froze every
    // monster, the crossbow and the partner's view too. The hero just stops responding to the controls meanwhile.
    var campOpen = !!(CC.Camp && CC.Camp.isOpen && CC.Camp.isOpen());
    var coopLive = !!(s.coop && CC.Multiplayer && CC.Multiplayer.active), menuOpen = uiWas || (p && p.perkOpen) || campOpen;
    if (paused || (menuOpen && !coopLive) ||
        (CC.Waypoints && CC.Waypoints.isOpen && CC.Waypoints.isOpen())) return;
    noteWorld();
    if (coopLive) { // in town or a tent the world is not paused: the host simulates it, and a guest keeps reporting to the party
      if (coopHostAway()) bgWorld(dt);
      else if (isAwayNow()) call('Multiplayer', 'tick', dt);
    }
    call('Portal', 'update', dt);
    if (tunnel) { updateTunnel(dt); return; }
    if (s.mode === 'dead' && s.coop && s.area === 'defense' && CC.Defense) { CC.Defense.deadUpdate(dt); return; } // the town fights on while you are down
    var beforeX=p&&p.x,beforeY=p&&p.y;
    pollInput();
    if (coopLive && menuOpen) { // a menu is up: the hero stands still while the shared world keeps running
      var ci = CC.input; ci.moveX = 0; ci.moveY = 0; ci.attack = false; ci.spell1 = false; ci.spell2 = false; ci.dash = false; ci.potion = false; ci.mpotion = false; ci.interact = false;
    }
    if (p && p.psyT > 0) { // seized by a psychic grip: no moving, no casting, dragged toward the caster
      p.psyT -= dt; var cs = CC.input; cs.moveX = 0; cs.moveY = 0; cs.attack = false; cs.spell1 = false; cs.spell2 = false; cs.dash = false; cs.potion = false; cs.mpotion = false; cs.interact = false;
      if (p.psyPull) { var pk = Math.min(1, dt * 7); movePlayer(p, (p.psyPull.x - p.x) * pk, (p.psyPull.y - p.y) * pk); }
      if (p.psyT <= 0) p.psyPull = null;
    }
    if (CC.input.interact && playing()) { interact(); return; }
    if (s.area === 'defense' && CC.Defense && CC.Defense.operating && CC.Defense.operating()) { // manning the crossbow: the stick aims, the hero stays put
      CC.Defense.feedAim(CC.input); CC.Defense.feedFire(!!(held.attack > 0 || keys.Space || CC.input.attack));
      CC.input.moveX = 0; CC.input.moveY = 0; CC.input.attack = false; CC.input.dash = false;
    }
    if (s.area === 'defense' && CC.Defense && CC.Defense.rapidActive && CC.Defense.rapidActive()) CC.input.attack = true; // rapid fire: autoshooting
    if (CC.input.potion) CC.usePotion();
    if (CC.input.mpotion) CC.useManaPotion();
    if (CC.Camp && CC.Camp.isInside && CC.Camp.isInside()) {
      call('Classes', 'update', dt, { noCombat: true });
      if (p && p.stub) movePlayer(p, CC.input.moveX * p.speed * dt, CC.input.moveY * p.speed * dt);
      call('Camp', 'update', dt);
      if(p)call('EggQuest','onMovement',p.x-beforeX,p.y-beforeY);
      if (p) {
        var txc = p.x - cam.w / 2, tyc = p.y - cam.h / 2;
        cam.x += (txc - cam.x) * Math.min(1, dt * 12);
        cam.y += (tyc - cam.y) * Math.min(1, dt * 12);
      }
      return;
    }

    if (s.mode === 'town' || s.mode === 'dungeon') {
      updateStub(dt);
      if (s.mode === 'town') {
        call('Town', 'update', dt);
        if (!has('Town', 'update') && p && !p.stub) call('Classes', 'update', dt, { noCombat: true });
      } else {
        call('Classes', 'update', dt);
        if(!(CC.Multiplayer&&CC.Multiplayer.isGuest()))call('Enemies', 'update', dt);
        call('SpellCharge','update',dt);
        call('Vfx','update',dt);
        call('Charge', 'update', dt, !!(keys.Space || held.attack > 0) && !(s.area === 'defense' && CC.Defense && CC.Defense.operatingNow && CC.Defense.operatingNow())); // hold attack to charge; a tap is the normal attack
        if(!(CC.Multiplayer&&CC.Multiplayer.isGuest()))call('Loot', 'update', dt);
        if(!(CC.Multiplayer&&CC.Multiplayer.isGuest()))call('Breakables','update',dt);
        call('Multiplayer','tick',dt);
        if (s.area === 'defense') call('Defense','update',dt);
        var isGuestNow = !!(CC.Multiplayer && CC.Multiplayer.isGuest && CC.Multiplayer.isGuest());
        if (s.area === 'tree-tunnel' && !isGuestNow) call('TreeTunnel', 'update', dt);
        if (s.area === 'tree-ascent') call('TreeAscent','update',dt);
        // Walk through the living tunnel and defeat its miniboss before entering the plains.
        var ex = s.map && s.map.stairs;
        if (ex && p && !p.stub && !isGuestNow && (
            (s.area === 'forest' && ((CC.EggQuest &&
              CC.EggQuest.tunnelUnlocked()) || s.coop)) ||
            s.area === 'plains' ||
            (s.area === 'tree-tunnel' && call('TreeTunnel', 'canExit'))) &&
            Math.hypot(p.x - ex.x, p.y - ex.y) <= 28 && !playerDead()) {
          tunnel = { t: 0, swapped: false, label: s.area === 'forest' ?
            'ENTERING THE HOLLOW TREE TUNNEL...' :
            s.area === 'tree-tunnel' ? 'EMERGING INTO THE PLAINS...' : 'DOWN INTO THE BARROW...' };
          resetInputHeld();
        }
        if (playerDead()) { s.mode = 'dead'; if (s.area === 'defense') call('Defense','onDown'); resetInputHeld(); call('SpellCharge','clear'); CC.fx.shake(10); }
      }
      if (s.mode !== 'town' && s.mode !== 'dungeon') return;
    }

    if(p&&s.mode!=='dead')call('EggQuest','onMovement',p.x-beforeX,p.y-beforeY);
    // camera follows with light smoothing
    if (p && (s.mode === 'town' || s.mode === 'dungeon')) {
      var tx = p.x - cam.w / 2, ty = p.y - cam.h / 2, k = 1 - Math.pow(0.0005, dt);
      cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    }

    // player damage / low-health feedback (detected from hp so every damage source is covered)
    if (p && !p.stub && typeof p.hp === 'number') {
      if (lastHp !== null && p.hp < lastHp - 0.5) { hurtT = Math.max(hurtT, 0.45); addDecal(p.x, p.y + 4, 4 + Math.random() * 3, '#6e0c10'); }
      lastHp = p.hp;
      if (p.maxHp && p.hp / p.maxHp < 0.35 && p.hp > 0) {
        beat += dt * (1.2 + (0.35 - p.hp / p.maxHp) * 4); // heartbeat speeds up as health drops
      } else beat = 0;
    } else lastHp = null;

  }

  /* ---------- drawing helpers ---------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function font(px, weight) { ctx.font = (weight || 'bold') + ' ' + px + 'px Georgia, "Palatino Linotype", "Book Antiqua", serif'; } // same serif as ui.js
  function label(str, x, y, px, color, align) {
    font(px); ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(str, x + 1, y + 1);
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }
  function addButton(x, y, w, h, text, color, cb) {
    ui.push({ x: x, y: y, w: w, h: h, cb: cb });
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, color); g.addColorStop(1, '#14101a');
    rr(x, y, w, h, 6); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#5a4630'; ctx.stroke(); // bronze frame, as in ui.js
    rr(x + 3, y + 3, w - 6, h - 6, 4); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(224,168,74,0.22)'; ctx.stroke();
    label(text, x + w / 2, y + h / 2, 16, '#e8dcc4');
  }

  // The settings gear, drawn with canvas primitives (no emoji fonts).
  function drawGearButton(x, y, w, h, cb) {
    ui.push({ x: x, y: y, w: w, h: h, cb: cb });
    var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#4a4358'); g.addColorStop(1, '#14101a');
    rr(x, y, w, h, 6); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#5a4630'; ctx.stroke();
    var cx = x + w / 2, cy = y + h / 2, i;
    ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = '#e8dcc4';
    for (i = 0; i < 8; i++) { ctx.save(); ctx.rotate(i * Math.PI / 4); ctx.fillRect(-2, -10, 4, 5); ctx.restore(); }
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fillStyle = '#2a2230'; ctx.fill();
    ctx.restore();
  }

  // Compact framed tent shortcut sits between Save and Pause. The drawing
  // uses canvas primitives, avoiding emoji/font differences on Android and iOS.
  function drawTentButton(x,y,w,h,cb,existing){
    addButton(x,y,w,h,'',existing?'#384d44':'#635037',cb);
    ctx.save();
    var cx=x+w/2,cy=y+h/2;
    ctx.lineJoin='round';ctx.lineCap='round';
    ctx.fillStyle=existing?'#bfd8bc':'#e1c99b';
    ctx.strokeStyle='#221b1e';ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(cx,cy-10);ctx.lineTo(cx+11,cy+8);
    ctx.lineTo(cx-11,cy+8);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#4a3532';
    ctx.beginPath();ctx.moveTo(cx,cy-6);ctx.lineTo(cx+4.6,cy+8);
    ctx.lineTo(cx-4.6,cy+8);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#f9dfb1';ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(cx,cy-10);ctx.lineTo(cx,cy+8);ctx.stroke();
    ctx.fillStyle='#d5ac75';ctx.fillRect(cx-13,cy+8,26,2);
    ctx.restore();
  }
  function drawFallbackFloor() {
    var T = CC.TILE, x0 = Math.floor(cam.x / T), y0 = Math.floor(cam.y / T);
    var cols = Math.ceil(cam.w / T) + 2, rows = Math.ceil(cam.h / T) + 2;
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var tx = x0 + i, ty = y0 + j;
      ctx.fillStyle = ((tx + ty) & 1) ? '#1d1730' : '#221b38';
      ctx.fillRect(tx * T - cam.x, ty * T - cam.y, T, T);
    }
  }

  function drawFallbackPlayer() {
    var p = CC.state.player;
    if (!p || !p.stub) return;
    var x = p.x - cam.x, y = p.y - cam.y;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(x, y + 7, 8, 3.5, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, p.r, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + CC.input.aimX * 4, y + CC.input.aimY * 4 - 1, 2, 0, 6.3); ctx.fill();
  }

  // floor stains from blood splatter; only where the tile has been explored
  function drawDecals() {
    var D = CC.Dungeon, hasExp = D && typeof D.isExplored === 'function';
    ctx.save();
    for (var i = 0; i < decals.length; i++) {
      var d = decals[i];
      if (d.x < cam.x - 16 || d.x > cam.x + cam.w + 16 || d.y < cam.y - 16 || d.y > cam.y + cam.h + 16) continue;
      if (hasExp && !D.isExplored(d.x, d.y)) continue;
      ctx.globalAlpha = 0.75; ctx.fillStyle = d.c;
      ctx.beginPath(); ctx.ellipse(d.x - cam.x, d.y - cam.y, d.r, d.r * d.sq, d.rot, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  // screen-space feedback: hit flash, red hurt pulse and the low-health vignette (logical W x H, like the HUD)
  function drawScreenFx() {
    var p = CC.state.player;
    if (!p || p.stub) return;
    var frac = p.maxHp ? p.hp / p.maxHp : 1, low = frac < 0.35 && p.hp > 0 ? (0.35 - frac) / 0.35 : 0;
    var pulse = low ? 0.55 + 0.45 * Math.sin(beat * 6.2832) : 0, hurt = hurtT > 0 ? hurtT / 0.45 : 0;
    var a = Math.max(low * (0.35 + 0.4 * pulse), hurt * 0.55);
    if (a > 0.01) {
      var key = W + 'x' + H;
      if (vigKey !== key) {
        vigGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.55);
        vigGrad.addColorStop(0, 'rgba(160,0,10,0)'); vigGrad.addColorStop(1, 'rgba(160,0,10,1)');
        vigKey = key;
      }
      ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = vigGrad; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    if (flashT > 0) { ctx.globalAlpha = 0.28 * (flashT / flashMax); ctx.fillStyle = flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  function drawWorld() {
    var s = CC.state, v = call('CriticalScene', 'view', cam.w, cam.h);
    var ox = shakeMag ? (Math.random() - 0.5) * shakeMag * 2 : 0;
    var oy = shakeMag ? (Math.random() - 0.5) * shakeMag * 2 : 0;
    var rx = cam.x, ry = cam.y, rw = cam.w, rh = cam.h;
    // Town Defense: always 20% wider than normal, and the whole town while manning the crossbow
    var defMul0 = s.area === 'defense' && CC.Defense && CC.Defense.zoomMul ? CC.Defense.zoomMul(zoom, W, H) : 1;
    var nowMs = Date.now(), zdt = Math.min(0.1, (nowMs - userAt) / 1000 || 0); userAt = nowMs;
    userCur += (userTarget - userCur) * Math.min(1, zdt * 14); // ease toward the pinch
    if (Math.abs(userTarget - userCur) < 0.0005) userCur = userTarget;
    var defMul = defMul0 * userCur;
    var bx = rx, by = ry;
    if (Math.abs(defMul - 1) > 0.0004) { var nw = W / (zoom * defMul), nh = H / (zoom * defMul); bx = rx + rw / 2 - nw / 2; by = ry + rh / 2 - nh / 2; cam.w = nw; cam.h = nh; }
    var cinematicZoom = v ? v.scale : 1, activeZoom = zoom * defMul * cinematicZoom; curZoom = zoom * defMul;
    if (v) {
      cam.w = W / activeZoom; cam.h = H / activeZoom;
      cam.x = bx * (1 - v.blend) + (v.x - cam.w / 2) * v.blend + ox;
      cam.y = by * (1 - v.blend) + (v.y - cam.h / 2) * v.blend + oy;
    } else {
      cam.x = Math.round(bx + ox); cam.y = Math.round(by + oy);
    }
    ctx.save();
    ctx.scale(activeZoom, activeZoom);
    ctx.fillStyle = '#0b0812'; ctx.fillRect(0, 0, cam.w, cam.h);
    if (CC.Camp && CC.Camp.isInside && CC.Camp.isInside()) {
      call('Camp', 'drawScene', ctx, cam);
      call('Multiplayer', 'drawWorld', ctx, cam); // a partner in the same camp
      call('Classes', 'drawPlayer', ctx, cam);
    } else if (s.mode === 'dungeon' || (s.mode === 'dead' && s.area === 'defense')) { // defense keeps the arena on screen while a hero is down
      // The shell already applied ctx.scale(zoom). Dungeon.draw scales by cam.zoom itself, so hand it a
      // zoom-1 view of the same camera: tiles, fog and entities then share one world-to-screen mapping.
      var dcam = { x: cam.x, y: cam.y, w: cam.w, h: cam.h, zoom: 1 };
      if (s.area === 'tree-tunnel') call('TreeTunnel', 'draw', ctx, dcam);
      else if (has('Dungeon', 'draw')) call('Dungeon', 'draw', ctx, dcam);
      else drawFallbackFloor();
      drawDecals();
      call('Breakables','draw',ctx,cam);
      call('Waypoints','draw',ctx,cam);
      call('Camp', 'drawWorldMarker', ctx, cam); // grounded below the hero, not painted over them
      call('Portal', 'drawWorld', ctx, cam);
      call('Loot', 'draw', ctx, cam);
      call('Enemies', 'draw', ctx, cam);
      call('Classes', 'draw', ctx, cam);
      call('Multiplayer','drawWorld',ctx,cam);
      call('Defense','drawWorld',ctx,cam);
      if(!s.coop)call('EggQuest','drawCompanion',ctx,cam);
      if(s.area==='tree-ascent')call('TreeAscent','drawEggs',ctx,cam);
      call('Charge', 'draw', ctx, cam);
      if (CC.Dungeon && typeof CC.Dungeon.drawFront === 'function') CC.Dungeon.drawFront(ctx, dcam); // trees and props in front of the hero redraw over the entities
      if (CC.Dungeon && CC.Dungeon.realm) CC.Dungeon.drawLighting(ctx, dcam); // open-air maps light the whole scene after the entities
      call('Vfx','draw',ctx,cam); // spell particles, nova rings, explosions and lightning
      call('Vfx','drawDarkness',ctx,cam); // the Patchwork Horror's dark
      call('SpellCharge','draw',ctx,cam); // illuminated aiming circle overlays the ground
    } else {
      if (has('Town', 'draw')) call('Town', 'draw', ctx, cam);
      else { drawFallbackFloor(); call('Classes', 'drawPlayer', ctx, cam); }
      call('Waypoints','draw',ctx,cam);
      call('Portal', 'drawTown', ctx, cam);
      call('Multiplayer', 'drawWorld', ctx, cam);
    }
    if (s.mode === 'town') call('Camp', 'drawWorldMarker', ctx, cam);
    drawFallbackPlayer();
    if (s.mode === 'dungeon') call('MonsterMelee', 'drawFx', ctx, cam);
    for (var a = 0; a < particles.length; a++) {
      var q = particles[a], qa = Math.max(0, q.life / q.max);
      ctx.globalAlpha = q.blood ? Math.min(1, qa * 2) : qa;
      ctx.fillStyle = q.c;
      var qs = q.blood ? q.size : q.size * (0.5 + 0.5 * qa);
      ctx.fillRect(q.x - cam.x - qs / 2, q.y - cam.y - qs / 2, qs, qs);
      if (q.spark && qs > 1.6) { // hot core
        ctx.globalAlpha = qa * 0.6; ctx.fillStyle = '#fff';
        ctx.fillRect(q.x - cam.x - 0.5, q.y - cam.y - 0.5, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    for (var b = 0; b < texts.length; b++) {
      var t = texts[b], pop = t.age < 0.12 ? 1 + 0.6 * (1 - t.age / 0.12) : 1, sz = Math.round(t.size * pop);
      ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.5));
      font(sz); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(t.s, t.x - cam.x, t.y - cam.y);
      ctx.fillStyle = t.c; ctx.fillText(t.s, t.x - cam.x, t.y - cam.y);
    }
    ctx.globalAlpha = 1;
    // Draw isolation over ALL normal particles, damage popups and monsters.
    // The critical scene itself redraws ONLY the hero and struck targets.
    if(s.mode==='dungeon')call('CriticalScene','drawWorld',ctx,cam);
    ctx.restore();
    cam.x = rx; cam.y = ry; cam.w = rw; cam.h = rh;
  }

  function bar(x, y, w, h, frac, c1, c2, text) {
    frac = Math.max(0, Math.min(1, frac || 0));
    // dark-fantasy bar (same palette as ui.js): near-black well, bronze frame, glossy fill
    rr(x, y, w, h, 3); ctx.fillStyle = 'rgba(10,6,14,0.9)'; ctx.fill();
    if (frac > 0) {
      var g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      rr(x + 1.5, y + 1.5, Math.max(3, (w - 3) * frac), h - 3, 2); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + 2, y + 2, Math.max(2, (w - 4) * frac), Math.max(1, (h - 4) * 0.35));
    }
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#5a4630'; rr(x, y, w, h, 3); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(224,168,74,0.25)'; rr(x + 2, y + 2, w - 4, h - 4, 2); ctx.stroke();
    if (text) label(text, x + w / 2, y + h / 2 + 0.5, Math.max(8, h - 3), '#fff');
  }

  function drawHud() {
    var s = CC.state, p = s.player;
    if (!p) return;
    var top = 10, left = 12, bw = Math.min(170, W * 0.5);
    if (has('Minimap', 'draw')) { // the minimap owns the upper-left corner; the bars sit to its right
      call('Minimap', 'draw', ctx, CC.Minimap.margin, CC.Minimap.margin, function (x, y, w, h, cb) { ui.push({ x: x, y: y, w: w, h: h, cb: cb }); });
      left = CC.Minimap.margin + CC.Minimap.size + 8; bw = Math.min(112, W - left - 110);
    }
    if (has('UI', 'drawHud')) return; // the themed panel (bars, level, gold, area, K / I / M, Retreat) is drawn by CC.UI.drawHud
    bar(left, top, bw, 16, p.hp / p.maxHp, '#ff6b6b', '#b01e3a', Math.ceil(p.hp) + '/' + Math.ceil(p.maxHp));
    bar(left, top + 20, bw, 12, p.mana / p.maxMana, '#6bb8ff', '#2a56c8', null);
    var xpNext = p.xpNext || p.xpToNext || 1;
    bar(left, top + 36, bw, 9, p.xp / xpNext, '#9be36b', '#4a9a2a', null);
    label('LV ' + (p.level || 1), left + bw + 8, top + 8, 13, '#e0a84a', 'left');

    label(Math.floor(s.gold) + ' G', W - 12, top + 8, 15, '#e8c04a', 'right');
    if (s.mode === 'dungeon') {
      label(s.area === 'forest' ? 'Giant Forest' : s.area === 'tree-tunnel' ? 'Hollow Tree' :
        s.area === 'plains' ? 'Rolling Plains' : 'Floor ' + s.floor, W - 12, top + 28, 13, '#e8dcc4', 'right');
      if (s.area === 'defense') addButton(W - 78, top + 42, 66, 26, 'Retreat', '#5a2a22', function () { CC.returnToTown(); });
      else if (!(CC.Camp && CC.Camp.isInside && CC.Camp.isInside())) addButton(W - 84, top + 42, 72, 26, 'TP-Town', '#4b2a78', function () { call('Portal', 'place'); });
    } else {
      label('Town', W - 12, top + 28, 13, '#e8dcc4', 'right');
    }
  }

  // A weighty, premium-feeling stick: a bronze-rimmed well, a glassy thumb, and a glow toward where you are heading.
  function drawStick() {
    var on = joy.id !== null, home = joyHome(), bx = on ? joy.bx : home.x, by = on ? joy.by : home.y, R = JOY_R;
    var tx = bx + (on ? joy.vx : 0), ty = by + (on ? joy.vy : 0), mag = on ? Math.hypot(joy.x, joy.y) : 0;
    ctx.save();
    ctx.globalAlpha = on ? 1 : 0.42;
    var well = ctx.createRadialGradient(bx, by, R * 0.15, bx, by, R);
    well.addColorStop(0, 'rgba(8,6,14,0.35)'); well.addColorStop(1, 'rgba(24,16,34,0.62)');
    ctx.beginPath(); ctx.arc(bx, by, R, 0, 6.2832); ctx.fillStyle = well; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(224,168,74,0.55)'; ctx.stroke(); // bronze rim
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,236,190,0.35)'; ctx.beginPath(); ctx.arc(bx, by, R - 3, 0, 6.2832); ctx.stroke();
    for (var q = 0; q < 4; q++) { // N / E / S / W notches
      var a = q * Math.PI / 2; ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * (R - 11), by + Math.sin(a) * (R - 11)); ctx.lineTo(bx + Math.cos(a) * (R - 4), by + Math.sin(a) * (R - 4));
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(224,168,74,0.5)'; ctx.stroke();
    }
    if (on && mag > 0.02) { // glow arc toward the heading, brighter the harder you push
      var ang = Math.atan2(joy.y, joy.x);
      ctx.beginPath(); ctx.arc(bx, by, R - 1.5, ang - 0.55, ang + 0.55); ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,196,110,' + (0.35 + 0.55 * mag) + ')'; ctx.shadowColor = 'rgba(255,170,70,0.9)'; ctx.shadowBlur = 10 * mag; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,214,150,0.25)'; ctx.stroke();
    }
    var th = ctx.createRadialGradient(tx - 7, ty - 8, 2, tx, ty, 28); // glassy thumb
    th.addColorStop(0, 'rgba(255,244,214,0.95)'); th.addColorStop(0.45, 'rgba(224,168,74,0.82)'); th.addColorStop(1, 'rgba(120,76,28,0.9)');
    ctx.beginPath(); ctx.arc(tx, ty, on ? 26 : 24, 0, 6.2832); ctx.fillStyle = th; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(tx - 7, ty - 9, 7, 0, 6.2832); ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill();
    ctx.restore();
  }

  function drawControls() {
    // joystick
    drawStick();

    var p = CC.state.player,chargeHUD=call('SpellCharge','info');
    for (var name in btns) {
      var b = btns[name], contextual = name === 'attack' && nearbyAction();
      var on = held[contextual ? 'interact' : name] > 0 || (name === 'attack' && keys.Space);
      // Compact ability labels: the spell name appears only after release.
      var txt = contextual ? 'ACTION' : name==='spell1'?'I':name==='spell2'?'II':b.label;
      var col = name === 'potion' ? '225,55,70' : name === 'mpotion' ? '60,130,235' : contextual ? '105,205,170' :
        name === 'attack' ? '255,140,70' : name === 'dash' ? '120,220,160' : '140,120,255';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.3);
      ctx.fillStyle = 'rgba(' + col + ',' + (on ? 0.7 : 0.35) + ')'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
      var cd = !contextual && p && p.cd ? p.cd[name] : 0, cdMax = !contextual && p && p.cdMax ? p.cdMax[name] : 0;
      if (cd > 0 && cdMax > 0) {
        var f = Math.min(1, cd / cdMax);
        ctx.beginPath(); ctx.moveTo(b.x, b.y);
        ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + f * 6.2832);
        ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
        label(cd.toFixed(cd < 10 ? 1 : 0), b.x, b.y - b.r - 8, 10, '#ddd');
      }
      if (name === 'potion' || name === 'mpotion') {
        var mana = name === 'mpotion', count=(CC.state && (mana ? CC.state.manaPotions : CC.state.potions))||0;
        ctx.save();ctx.translate(b.x,b.y-2);
        ctx.fillStyle='#ffc9c9';ctx.fillRect(-3,-10,6,3);
        ctx.fillStyle='#603a35';ctx.fillRect(-5,-7,10,3);
        ctx.beginPath();ctx.moveTo(-5,-4);ctx.lineTo(-9,0);ctx.lineTo(-8,9);
        ctx.quadraticCurveTo(0,13,8,9);ctx.lineTo(9,0);ctx.lineTo(5,-4);
        ctx.closePath();ctx.fillStyle=count>0?(mana?'#2f7be0':'#d9233a'):(mana?'#3a4660':'#70444a');ctx.fill();
        ctx.strokeStyle='#ffd2cc';ctx.lineWidth=1.4;ctx.stroke();
        ctx.fillStyle='#ffb6b2';ctx.fillRect(-5,1,3,4);
        ctx.restore();
        ctx.fillStyle='rgba(20,7,10,0.88)';ctx.fillRect(b.x+7,b.y+7,20,16);
        ctx.strokeStyle='#b96367';ctx.strokeRect(b.x+7,b.y+7,20,16);
        label(String(count),b.x+17,b.y+15,11,count>0?'#fff2e6':'#ad9394');
      } else if ((name === 'spell1' || name === 'spell2') && p && p.spells) {
        // the spell's own name on the button; the second spell shows LVL 4 UNLOCK until it is earned
        var si = name === 'spell1' ? 0 : 1, locked = si === 1 && (p.level || 1) < 4, sn = String(p.spells[si] || '').toUpperCase(), lines;
        if (locked) lines = ['LVL 4', 'UNLOCK'];
        else {
          font(9); lines = [sn];
          if (ctx.measureText(sn).width > b.r * 1.75 && sn.indexOf(' ') > 0) { var sp = sn.indexOf(' ', Math.floor(sn.length / 2) - 3); if (sp < 0) sp = sn.indexOf(' '); lines = [sn.slice(0, sp), sn.slice(sp + 1)]; }
        }
        if (locked) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.3); ctx.fillStyle = 'rgba(8,6,14,0.55)'; ctx.fill(); }
        label(txt, b.x, b.y - (lines.length > 1 ? 14 : 9), 11, locked ? '#9a93b0' : '#d9d2ff');
        for (var li = 0; li < lines.length; li++) label(lines[li], b.x, b.y + (lines.length > 1 ? 0 : 6) + li * 10, locked ? 9 : 9, locked ? '#ffd36b' : '#fff');
      } else label(txt, b.x, b.y, name==='spell1'||name==='spell2'?15:b.r>35?15:11, '#fff');
      var charge=chargeHUD&&chargeHUD.slot===name?chargeHUD:null;
      if(name==='spell1'||name==='spell2'||name==='dash'){
        var manaCost=charge?charge.cost:(name==='dash'?null:p&&p.cost&&p.cost[name]);
        if(manaCost!=null)label(manaCost+' MP',b.x,b.y+b.r+11,9,
          charge&&!charge.affordable?'#ed9095':'#b3c0ca');
      }
      if(charge&&charge.aiming){
        // Enlarged floating joystick remains within reachable screen bounds.
        var radius=b.r*(1.48+.10*charge.power),margin=14;
        var cx=Math.max(radius+margin,Math.min(W-radius-margin,b.x));
        var cy=Math.max(radius+margin,Math.min(H-radius-margin,b.y));
        var stickRadius=radius*.45,amount=charge.stickAmount;
        ctx.save();
        ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);
        ctx.fillStyle='rgba(10,19,30,.76)';ctx.fill();
        ctx.lineWidth=2;ctx.strokeStyle=charge.affordable?charge.color:'#e26c76';
        ctx.shadowColor=charge.color;ctx.shadowBlur=charge.ready?12:4;ctx.stroke();ctx.shadowBlur=0;
        ctx.beginPath();ctx.arc(cx,cy,radius*.65,0,Math.PI*2);
        ctx.strokeStyle='rgba(210,237,249,.24)';ctx.lineWidth=1;ctx.stroke();
        ctx.beginPath();ctx.arc(cx,cy,radius+4,-Math.PI/2,
          -Math.PI/2+Math.PI*2*Math.max(.005,charge.progress));
        ctx.lineWidth=3.3;ctx.strokeStyle=charge.color;ctx.stroke();
        var knobX=cx+charge.stickX*stickRadius*amount;
        var knobY=cy+charge.stickY*stickRadius*amount;
        ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(knobX,knobY);
        ctx.strokeStyle='rgba(220,244,253,.32)';ctx.lineWidth=2;ctx.stroke();
        ctx.beginPath();ctx.arc(knobX,knobY,Math.max(8,radius*.19),0,Math.PI*2);
        ctx.fillStyle='rgba(169,217,235,.46)';ctx.fill();
        ctx.strokeStyle='#d8f2ff';ctx.lineWidth=1.4;ctx.stroke();
        ctx.restore();
        label(charge.cost+' MP',cx,cy+radius+11,9,
          charge.affordable?'#c8d9e0':'#ff9399');
      }
    }
  }

  // ---- the Continue screen: up to five saved characters ----
  var delArm = {};
  var AREA_NAMES = {};
  function ago(t) {
    if (!t) return '';
    var s = Math.max(0, (Date.now() - t) / 1000);
    return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago';
  }
  function drawContinue() {
    addButton(W - 86, 14, 76, 27, 'Back', '#463645', function () { titlePage = 'mode'; });
    label('SAVED GAMES', W / 2, Math.max(50, H * 0.12) + 34, 18, '#ffd36b');
    var slots = call('SaveGame', 'slots') || [], cw = Math.min(W - 24, 400), x = (W - cw) / 2, y0 = Math.max(50, H * 0.12) + 62;
    var ch = Math.max(58, Math.min(86, (H - y0 - 24) / 5 - 8));
    slots.forEach(function (sl, n) {
      var yy = y0 + n * (ch + 8), inf = sl.info, cl = inf && CLASSES.filter(function (c) { return c.id === inf.classId; })[0];
      rr(x, yy, cw, ch, 12);
      var gr = ctx.createLinearGradient(x, yy, x + cw, yy);
      gr.addColorStop(0, inf ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.04)'); gr.addColorStop(1, 'rgba(255,255,255,0.03)');
      ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = inf && cl ? cl.color : '#3a3048'; ctx.stroke();
      label('SLOT ' + sl.n, x + 12, yy + 12, 9, '#8a7ea0', 'left');
      if (!inf) { label('Empty', x + cw / 2, yy + ch / 2 + 2, 14, '#6a6080'); return; }
      ui.push({ x: x, y: yy, w: cw - 44, h: ch, cb: function () { CC.state.coop = false; call('SaveGame', 'load', sl.n); } });
      var pw = Math.max(46, Math.min(64, ch - 8));
      if (CC.HeroPortraits && CC.HeroPortraits.draw) CC.HeroPortraits.draw(ctx, inf.classId, x + 8, yy + 14, pw, ch - 20);
      var tx0 = x + pw + 20;
      label(inf.name, tx0, yy + 28, 16, cl ? cl.color : '#fff', 'left');
      label('Level ' + inf.level + ' ' + (cl ? cl.name : inf.classId), tx0, yy + 46, 11, '#d8d0ee', 'left');
      label(inf.where + '  -  saved ' + ago(inf.savedAt), tx0, yy + 61, 10, '#9a90b4', 'left');
      var armed = delArm[sl.n] && delArm[sl.n] > Date.now();
      var dx = x + cw - 38, dy = yy + 8;
      ui.push({ x: dx - 6, y: dy - 6, w: 44, h: 36, cb: function () {
        if (delArm[sl.n] && delArm[sl.n] > Date.now()) { call('SaveGame', 'deleteSlot', sl.n); delete delArm[sl.n]; }
        else delArm[sl.n] = Date.now() + 3000;
      } });
      rr(dx, dy, 30, 22, 6); ctx.fillStyle = armed ? 'rgba(200,60,60,0.85)' : 'rgba(255,255,255,0.08)'; ctx.fill();
      label(armed ? 'DEL?' : 'X', dx + 15, dy + 12, armed ? 9 : 12, armed ? '#fff' : '#c88');
    });
    label('Tap a character to continue. A new game uses the first empty slot.', W / 2, H - 16, 10, '#8a80a8');
  }

  function drawTitle() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0f2e'); g.addColorStop(1, '#07040d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < 40; i++) { // drifting embers
      var ph = (time * (8 + i % 7) + i * 97) % (H + 20);
      var ex = (i * 53.7 + Math.sin(time + i) * 14) % W;
      ctx.globalAlpha = 0.25 + 0.5 * ((i * 31) % 10) / 10;
      ctx.fillStyle = i % 3 ? '#ff9a3c' : '#ffd36b';
      ctx.fillRect(ex, H - ph, 2, 2);
    }
    ctx.globalAlpha = 1;
    var pulse = 1 + Math.sin(time * 2) * 0.03;
    ctx.save(); ctx.translate(W / 2, Math.max(50, H * 0.12)); ctx.scale(pulse, pulse);
    label('EMBERDEEP', 0, 0, Math.min(44, W / 8.5), '#ffb347');
    ctx.restore();
    if(titlePage==='mode'){
      label('CHOOSE YOUR ADVENTURE', W/2, H*.25, 14, '#cfc5ff');
      addButton(W/2-125,H*.37,250,58,'SINGLE PLAYER','#645035',function(){titlePage='single';});
      addButton(W/2-125,H*.37+72,250,58,'MULTIPLAYER','#47356d',function(){
        if(CC.Multiplayer)CC.Multiplayer.openLobby();
      });
      label('Co-op dungeon adventures for two',W/2,H*.37+151,11,'#baa7c3');
      if(call('SaveGame','exists'))addButton(W/2-125,H*.37+181,250,44,'CONTINUE','#365848',function(){
        CC.state.coop=false;titlePage='continue';
      });
      return;
    }
    if(titlePage==='continue'){drawContinue();return;}
    addButton(W-86,14,76,27,'Back','#463645',function(){titlePage='mode';});
    label('Pick your hero', W / 2, Math.max(50, H * 0.12) + 34, 14, '#cfc5ff');

    var cw = Math.min(W - 32, 380),
        ch = Math.max(66,Math.min(120, (H-(call('SaveGame','exists')?265:190))/CLASSES.length-10)), x = (W - cw) / 2, y = Math.max(50, H * 0.12) + 60;
    CLASSES.forEach(function (c, n) {
      var yy = y + n * (ch + 12);
      ui.push({ x: x, y: yy, w: cw, h: ch, cb: function () { startGame(c.id); } });
      rr(x, yy, cw, ch, 14);
      var gr = ctx.createLinearGradient(x, yy, x + cw, yy);
      gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0.03)');
      ctx.fillStyle = gr; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = c.color; ctx.stroke();
      // Four individually illustrated heroes, sized to fit the original selection cards.
      var portraitWidth=Math.max(58,Math.min(83,ch*.66));
      if(CC.HeroPortraits&&CC.HeroPortraits.draw)
        CC.HeroPortraits.draw(ctx,c.id,x+6,yy+5,portraitWidth,ch-10);
      else {
        ctx.fillStyle=c.color;ctx.beginPath();ctx.arc(x+36,yy+ch/2,19,0,6.283);ctx.fill();
      }
      var textX=x+portraitWidth+20;
      label(c.name,textX,yy+23,17,c.color,'left');
      font(11,'normal');ctx.textAlign='left';ctx.fillStyle='#d8d0ee';
      wrap(c.desc,textX,yy+44,cw-portraitWidth-31,14);
    });
    if(call('SaveGame','exists')){
      addButton(W/2-120,H-85,240,43,'Continue Saved Adventure','#436c56',function(){
        CC.state.coop=false;titlePage='continue';
      });
      var ns=call('SaveGame','nextSlot');
      label(ns&&ns.replaces?'All 5 slots are full: a new hero replaces the oldest (slot '+ns.n+')':'A new hero is saved to slot '+(ns&&ns.n),W/2,H-21,11,ns&&ns.replaces?'#e0a06a':'#aa9cbd');
    }else label('Tap a hero to begin',W/2,H-22,12,'#8a80a8');
  }

  function wrap(text, x, y, maxW, lh) {
    var words = text.split(' '), line = '';
    for (var i = 0; i < words.length; i++) {
      var t = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = words[i]; y += lh; } else line = t;
    }
    ctx.fillText(line, x, y);
  }

  function drawDead() {
    var s = CC.state;
    if (s.area === 'defense' && CC.Defense) { CC.Defense.drawDead(ctx, W, H, addButton); return; }
    ctx.fillStyle = 'rgba(20,0,10,0.82)'; ctx.fillRect(0, 0, W, H);
    label('YOU DIED', W / 2, H * 0.22, 40, '#ff5a6a');
    var y = H * 0.36, lines = [['Floor reached', s.floor], ['Enemies slain', s.kills],
      ['Gold carried', Math.floor(s.gold)], ['Best floor', s.bestFloor]];
    lines.forEach(function (l, n) {
      label(l[0], W / 2 - 10, y + n * 30, 15, '#cfc5ff', 'right');
      label(String(l[1]), W / 2 + 10, y + n * 30, 17, '#ffe08a', 'left');
    });
    if (CC.Camp && CC.Camp.hasCamp && CC.Camp.hasCamp()) {
      addButton(W / 2 - 110, H * 0.59, 220, 48, 'Respawn at Camp', '#5b6341', function () {
        if (call('Camp', 'respawn')) { resetInputHeld(); snapCamera(); }
      });
      addButton(W / 2 - 110, H * 0.69, 220, 44, 'Return to Town', '#3a6a3a', function () { CC.returnToTown(); });
    } else addButton(W / 2 - 100, H * 0.72, 200, 47, 'Return to Town', '#3a6a3a', function () { CC.returnToTown(); });
    addButton(W/2-110,H*.57,220,45,'Respawn — preserve map','#657446',function(){CC.respawnHere();});
  }

  function drawFallbackTownPanel() {
    if (has('Town', 'draw')) return;
    label('Town (shops coming online)', W / 2, H * 0.3, 15, '#cfc5ff');
    addButton(W / 2 - 100, H * 0.38, 200, 50, 'Descend to Floor ' + Math.max(1, CC.state.floor), '#6a3a2a', function () { CC.startRun(1); });
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ui = [];
    var m = CC.state.mode;
    if (m === 'title') { drawTitle(); return; }
    drawWorld();
    if (m === 'town' || m === 'dungeon' || m === 'dead') drawScreenFx();
    if (m === 'dungeon') call('Vfx', 'drawScreen', ctx, W, H); // the sky flashes yellow for chain lightning
    if (m === 'dungeon') call('CriticalScene', 'drawScreen', ctx, W, H);
    // No floating HUD/buttons/other overlays during the brief critical close-up.
    if(m==='dungeon'&&call('CriticalScene','isActive'))return;
    if (tunnel && m === 'dungeon') drawTunnel();
    if (m === 'town' || m === 'dungeon') {
      drawHud(); drawControls();
      call('EggQuest','drawHud',ctx,W,H);
      call('Defense','drawScreen',ctx,W,H,addButton);
      call('Multiplayer','drawScreen',ctx,W,H);
      if (m === 'town') drawFallbackTownPanel();
      var mpHudShift = CC.Multiplayer && CC.Multiplayer.active ? 22 : 0; // room for the SESSION button
      var skillPts = CC.SkillTree && CC.state.player ? CC.SkillTree.points(CC.state.player) : 0;
      // Compact Save / Tent / Pause strip, anchored to the same responsive
      // bounds as the top-right character HUD (never overlaps the minimap).
      var mm = CC.Minimap;
      var reservedLeft = mm ? mm.margin + mm.size + 8 : 12;
      var hudWidth = Math.min(214,Math.max(150,W-8-reservedLeft));
      var hudLeft = W-8-hudWidth;
      var quickWidth = Math.min(188,hudWidth),quickGap = 5;
      var quickX = Math.max(hudLeft,W-14-quickWidth),quickY = 116 + mpHudShift;
      var gearW = 28, strip = quickWidth-gearW-quickGap, stripX = quickX+gearW+quickGap;
      var saveWidth = Math.round((strip-quickGap*2)*.34);
      var tentWidth = Math.round((strip-quickGap*2)*.21);
      var pauseWidth = strip-saveWidth-tentWidth-quickGap*2;
      drawGearButton(quickX, quickY, gearW, 30, function () { call('UI', 'open', 'settings'); });
      addButton(stripX,quickY,saveWidth,30,'Save','#466b53',function(){
        if(!CC.state.coop&&call('SaveGame','save')&&CC.state.player)
          CC.fx.text(CC.state.player.x,CC.state.player.y-18,'GAME SAVED','#b5efb6',12);
      });
      if(CC.Camp)drawTentButton(stripX+saveWidth+quickGap,quickY,
        tentWidth,30,function(){
        if(CC.Camp.isInside&&CC.Camp.isInside()){
          call('Camp','interact');
        }else if(CC.Camp.isWorldCampNear&&CC.Camp.isWorldCampNear()){
          call('Camp','interact');
        }else if(!(CC.Camp.hasCamp&&CC.Camp.hasCamp())){
          call('Camp','request');
        }else if(CC.state.player&&CC.fx&&CC.fx.text){
          CC.fx.text(CC.state.player.x,CC.state.player.y-26,
            'CAMP ALREADY SET','#ddc7a0',12);
        }
      },CC.Camp.hasCamp&&CC.Camp.hasCamp());
      addButton(stripX+saveWidth+tentWidth+quickGap*2,quickY,
        pauseWidth,30,paused?'Resume':'Pause','#4a3a6a',togglePause);
      // LEVEL UP: appears when skill points are waiting, with the count beside it. Nothing opens on its own.
      if (skillPts > 0 && !uiOpen()) {
        var luY = quickY + 36, luW = quickWidth - 34, pulse = 0.5 + 0.5 * Math.sin(time * 5);
        ctx.save();
        ctx.shadowColor = 'rgba(255,214,110,' + (0.5 + 0.4 * pulse) + ')'; ctx.shadowBlur = 8 + 6 * pulse;
        addButton(quickX, luY, luW, 30, 'LEVEL UP', '#8a6a1c', function () { call('UI', 'open', 'skills'); });
        ctx.restore();
        var cxp = quickX + luW + 6 + 14, cyp = luY + 15;
        ctx.beginPath(); ctx.arc(cxp, cyp, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#2a7a46'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#d9f5b8'; ctx.stroke();
        label(String(skillPts), cxp, cyp + 0.5, skillPts > 9 ? 13 : 16, '#ffffff');
        ui.push({ x: cxp - 14, y: cyp - 14, w: 28, h: 28, cb: function () { call('UI', 'open', 'skills'); } });
      }
      if (paused && !uiOpen()) {
        ctx.fillStyle = 'rgba(8,4,16,0.65)'; ctx.fillRect(0, H * 0.4, W, 80);
        label('PAUSED', W / 2, H * 0.4 + 40, 28, '#ffe08a');
      }
      var addHit = function (x, y, w, h, cb) { ui.push({ x: x, y: y, w: w, h: h, cb: cb }); };
      if (m === 'town') call('Town', 'drawPanel', ctx, W, H, addHit);
      else if (CC.state.area === 'forest') call('Forest', 'drawOverlay', ctx, W, H);
      else if (CC.state.area === 'plains') call('Plains', 'drawOverlay', ctx, W, H);
      if (CC.state.area === 'tree-tunnel') call('TreeTunnel', 'drawHud', ctx, W, H);
      if (CC.state.area === 'tree-ascent') call('TreeAscent','drawHud',ctx,W,H);
      call('MonsterMelee', 'drawStatus', ctx, W, H);
      call('UI', 'drawHud', ctx, W, H, addHit);   // CHAR and QUEST open the same tabbed journal
      call('UI', 'draw', ctx, W, H, addHit);
      call('Camp', 'drawUI', ctx, W, H, addHit);
      call('Waypoints','drawUI',ctx,W,H,addHit);
      call('Eagle','drawScene',ctx,W,H,addHit); // hatching scene and naming, above everything
    } else if (m === 'dead') {
      drawHud(); call('Defense','drawScreen',ctx,W,H,addButton); drawDead();
    }
  }

  /* ---------- main loop ---------- */
  var last = 0, acc = 0;
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    try {
      call('CriticalScene', 'update', dt);
      if (hitStopLeft > 0) { hitStopLeft -= dt; time += dt; }
      else {
        dt *= call('CriticalScene', 'rate') || 1;
        acc += dt;
        while (acc >= STEP) { update(STEP); acc -= STEP; }
      }
      draw();
    } catch (e) {
      if (!warned.frame) { warned.frame = 1; console.error('frame error', e); }
    }
    requestAnimationFrame(frame);
  }

  resize();
  call('Town', 'load');
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(frame); });
})();
