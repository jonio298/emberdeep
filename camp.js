/* Emberdeep Campsite. A temporary, explorable checkpoint tied to its source map.
 * The camp, tent, and camp chest are in-session state; no generated-world save is implied.
 * In co-op your partner sees your camp marker in the world and can walk into it (their own visit: they can rest and warm
 * up, only the owner opens the chest). Smoke rises from the tent's stove pipe in the camp and from the world marker.
 */
(function () {
'use strict';
var CC = window.CC = window.CC || {};
var Camp = CC.Camp = {};
var home = null, pendingHome = null, visit = null, room = '', modal = '', page = 0, inventory = [], message = '', messageTime = 0, elapsed = 0;
var OUT = {w: 560, h: 420}, IN = {w: 420, h: 310};
var AREAS = ['cave', 'forest', 'plains', 'tree-tunnel', 'tree-ascent', 'town', 'defense'];
function state() { return CC.state; }
function hero() { return state() && state().player; }
function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
function inCamp() { return room === 'outside' || room === 'tent'; }
function dimensions() { return room === 'tent' ? IN : OUT; }
function clock() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }
function ownerName() { return visit ? (visit.name || 'Your partner') : 'Your'; }

// Things you can use. Same coordinates as the artwork so the prompts sit on the objects.
var SPOTS_OUT = [
  {id: 'tent',  x: OUT.w/2,     y: OUT.h/2-65, r: 57, label: 'Enter Tent',   px: OUT.w/2,     py: OUT.h/2-17, prompt: 'F  ENTER TENT'},
  {id: 'stump', x: OUT.w/2-125, y: OUT.h/2+57, r: 42, label: 'Sit on Stump', px: OUT.w/2-125, py: OUT.h/2+16, prompt: 'F  SIT'}
];
var SPOTS_IN = [
  {id: 'bed',   x: 98,  y: 200, r: 48, label: 'Rest & Heal', px: 98,  py: 96,  prompt: 'F  REST / HEAL'},
  {id: 'stove', x: 338, y: 168, r: 42, label: 'Warm Up',     px: 338, py: 94,  prompt: 'F  WARM UP'},
  {id: 'chest', x: 344, y: 248, r: 44, label: 'Open Chest',  px: 344, py: 176, prompt: 'F  OPEN CHEST'}
];
function spotNear() {
  var p = hero(); if (!p) return null;
  var list = room === 'tent' ? SPOTS_IN : room === 'outside' ? SPOTS_OUT : [], i;
  for (i = 0; i < list.length; i++) if (distance(p, list[i]) < list[i].r) return list[i];
  return null;
}

// Cave layouts mutate one shared dungeon object when changing floors.
function snapshotCave(d) {
  if (!d || !d.generate || !d.tiles) return null;
  var names=['tiles','floor','biome','biomeName','seed','spawn','stairs','chests','secrets','enemySpawns','boss',
    'decor','liquid','props','lights','staticLight','dist','explored','vis','_fovKey','_mmDirty'];
  var result={};
  names.forEach(function(k){
    var v=d[k];
    if(v===undefined)return;
    if(v && typeof v.slice==='function' && !Array.isArray(v))result[k]=v.slice();
    else if(v && typeof v==='object')result[k]=JSON.parse(JSON.stringify(v));
    else result[k]=v;
  });
  return result;
}
function restoreCave() {
  if (!home || !home.caveSnapshot) return;
  var d=home.dungeon, snapshot=home.caveSnapshot;
  Object.keys(snapshot).forEach(function(k){
    var v=snapshot[k];
    d[k] = v && typeof v.slice==='function' && !Array.isArray(v) ? v.slice() :
      v && typeof v==='object' ? JSON.parse(JSON.stringify(v)) : v;
  });
}
// Palisade collision shares the exact same coordinates as its rendered posts.
var GATE_HALF = 40, FENCE_X = 34, FENCE_Y = 34;
function campBlocked(x,y) {
  if (!isFinite(x) || !isFinite(y)) return true;
  if (room === 'tent') {
    if(x<44||x>IN.w-44||y<98||y>IN.h-26)return true;
    if(x>50&&x<144&&y>98&&y<182)return true;      // the bed
    if(x>146&&x<182&&y>108&&y<150)return true;    // nightstand
    if(x>314&&x<362&&y>98&&y<148)return true;     // wood stove
    if(x>304&&x<376&&y>182&&y<230)return true;    // chest
    if(x>230&&x<304&&y>168&&y<210)return true;    // table
    return false;
  }
  if(x<15||y<14||x>OUT.w-15||y>OUT.h-12)return true;
  if(y>=25&&y<=OUT.h-25&&(x>=25&&x<=45||x>=OUT.w-45&&x<=OUT.w-25))return true;
  if(x>=25&&x<=OUT.w-25&&y>=24&&y<=45)return true;
  // Southern fence is solid except for the actual walkable gate.
  if(y>=OUT.h-47&&y<=OUT.h-24&&Math.abs(x-OUT.w/2)>GATE_HALF)return true;
  // Canvas tent, campfire and stump also block walking through the objects.
  if(x>OUT.w/2-78&&x<OUT.w/2+78&&y>OUT.h/2-126&&y<OUT.h/2-39)return true;
  if(Math.hypot(x-(OUT.w/2+126),y-(OUT.h/2+40))<17)return true;
  if(Math.hypot(x-(OUT.w/2-126),y-(OUT.h/2+58))<15)return true;
  return false;
}
function floorMap() {
  return {campScene:true,isSolid:campBlocked,
    isSolidTile:function(x,y){return this.isSolid(x*32+16,y*32+16);},
    w:20,h:16,spawn:{x:OUT.w/2,y:OUT.h/2}};
}

/* ---- your partner's camp (co-op) ---- */
function remoteCamp() {
  var MP = CC.Multiplayer, r = MP && MP.active && MP.remote;
  if (!r || !(r.cpa >= 0) || !Number.isFinite(r.cpx)) return null;
  return {x: r.cpx, y: r.cpy, area: AREAS[r.cpa] || 'cave', floor: r.cpf || 1, treeFloor: r.cpt || 1,
    owner: MP.role === 'host' ? 'guest' : 'host', name: (MP.partnerName && MP.partnerName()) || 'Partner'};
}
function sameScene(c, s) {
  return !!(c && s && c.area === s.area && (c.floor || 1) === (s.floor || 1) && (c.area !== 'tree-ascent' || (c.treeFloor || 1) === (s.treeFloor || 1)));
}
function nearRemote() {
  var s = state(), p = hero(), r = remoteCamp();
  if (!r || !p || inCamp() || !s || (s.mode !== 'dungeon' && s.mode !== 'town') || !sameScene(r, s)) return null;
  return distance(p, r) < 54 ? r : null;
}
function fenceHit(x, y, c) {
  var dx = x - c.x, dy = y - c.y;
  if (Math.abs(dy) < 34 && Math.abs(dx) > 29 && Math.abs(dx) < 43) return true;
  if (Math.abs(dx) < 43 && dy > -34 && dy < -25) return true;
  if (Math.abs(dx) < 43 && dy > 25 && dy < 34 && Math.abs(dx) > 17) return true;
  return false;
}
// The palisade is solid for whoever walks the world: wrap the map's collision once and check any camp in the scene.
function ensureFence(m) {
  if (!m || typeof m.isSolid !== 'function' || m._campFence) return;
  var orig = m.isSolid; m._campFence = true;
  m.isSolid = function (x, y) {
    if (orig.call(m, x, y)) return true;
    if (inCamp()) return false;
    var s = state(); if (!s) return false;
    if (home && home.map === m && sameScene(home, s) && fenceHit(x, y, home)) return true;
    var r = remoteCamp();
    if (r && s.map === m && sameScene(r, s) && fenceHit(x, y, r)) return true;
    return false;
  };
}
var map = floorMap();
function note(s) { message = s; messageTime = 3; }
function sync() {
  state().area = room === 'tent' ? 'camp-tent' : 'camp';
  state().mode = 'dungeon';
  state().map = map;
  CC.Dungeon = map;
}
function goOutside() {
  room = 'outside'; sync(); var p=hero();
  if (p) { p.x = OUT.w/2; p.y = OUT.h/2+58; }
  modal = ''; page = 0;
}
function goTent() {
  room = 'tent'; sync(); var p=hero();
  if (p) { p.x = IN.w/2; p.y = IN.h-65; }
  modal='';
  note(visit ? 'Inside ' + ownerName() + "'s tent - rest at the bed or warm up by the stove." : 'Inside your tent - rest at the bed or store items in the chest.');
}
function enter() {
  if (!home || !hero()) return;
  visit = null;
  goOutside(); note('Camp established. Your new respawn checkpoint.');
}
// Walk into your partner's camp. It is their camp: you can rest and warm up, but only they open the chest.
function visitCamp(r) {
  var s = state(), p = hero();
  if (!r || !p || !s) return;
  visit = {owner: r.owner, name: r.name, area: r.area,
    ret: {mode: s.mode, area: s.area, floor: s.floor, map: s.map, dungeon: CC.Dungeon, x: r.x, y: r.y + 42, treeFloor: s.treeFloor || 1}};
  goOutside();
  note('Welcome to ' + r.name + "'s camp.");
}
function resync() { if (CC.Multiplayer && CC.Multiplayer.resync) CC.Multiplayer.resync(); }
function restoreWorld() {
  var h = visit ? visit.ret : home;
  if (!h) return false;
  var p=hero(), s=state();
  room = ''; modal=''; page=0;
  if (!visit) restoreCave();
  s.area=h.area; s.floor=h.floor; s.mode=h.mode;
  s.map=h.map; CC.Dungeon=h.dungeon;
  if (p) { p.x=h.x; p.y=h.y; }
  if(h.needsEnemies&&h.mode==='dungeon'&&CC.Enemies){
    h.needsEnemies=false;
    if(!(CC.restoreSessionWorld&&CC.restoreSessionWorld(h.area,h.floor,h.treeFloor))){
      CC.Enemies.spawnForFloor(h.floor,(h.map&&(h.map.enemySpawns||h.map.spawns))||[]);
      if(h.area==='tree-tunnel'&&CC.TreeTunnel)CC.TreeTunnel.populate(h.floor);
      if(h.area==='tree-ascent'&&CC.TreeAscent)CC.TreeAscent.populate(h.treeFloor||1);
    }
  }
  return true;
}
function leave(pack) {
  if (visit) {
    var who = visit.name;
    if (restoreWorld()) { visit = null; note('You leave ' + who + "'s camp."); resync(); }
    return;
  }
  if (!home) return;
  if (pack) {
    // Packing the campsite also packs its chest; never discard stored equipment.
    var bag = state().inventory = state().inventory || [];
    if (bag.length + inventory.length > 40) {
      modal = ''; note('Not enough room in your pack. Empty the camp chest first.');
      return;
    }
    while (inventory.length) bag.push(inventory.shift());
  }
  if (!restoreWorld()) return;
  if (pack) { home = null; inventory.length=0; }
  else note('Camp remains here. Return to the marker to enter.');
  resync();
}
Camp.request = function() {
  if (inCamp() || !hero() || !state() || (state().mode !== 'dungeon' && state().mode !== 'town')) return;
  if (home||pendingHome) { note('One camp at a time. Return to your camp or pack it up.'); return; }
  modal = 'set';
};
Camp.cancel = function() { modal = ''; };
Camp.confirm = function(yes) {
  if (modal === 'set') {
    modal = '';
    if (!yes || !hero()) return;
    var s=state(), p=hero();
    home = {mode:s.mode,area:s.area,floor:s.floor,map:s.map,dungeon:CC.Dungeon,x:p.x,y:p.y,
      treeFloor:s.treeFloor||1,
      caveSnapshot: s.area === 'cave' ? snapshotCave(CC.Dungeon) : null};
    ensureFence(home.map);
    enter();
  } else if (modal === 'leave') {
    if (yes) modal='pack'; else { modal=''; var p1=hero(); if(p1){p1.x=OUT.w/2;p1.y=OUT.h/2+55;} }
  } else if (modal === 'pack') {
    modal = '';
    if (yes) leave(true);
    else leave(false);
  }
};
Camp.isInside = inCamp;
Camp.hasCamp = function(){return !!home||!!pendingHome;};
Camp.isOpen = function(){return !!modal;};
Camp.isWorldCampNear = function() {
  var s=state(), p=hero();
  return !!(home && !inCamp() && s && p && s.map===home.map && s.area===home.area &&
    distance(p,home)<54);
};
// numbers shared with / read from the partner
Camp.shareInfo = function() { return home ? {x: home.x, y: home.y, a: Math.max(0, AREAS.indexOf(home.area)), f: home.floor || 1, t: home.treeFloor || 1} : null; };
// which place you are in, as a small number the partner can compare: 0 = out in the world
Camp.tag = function() {
  if (!inCamp()) return 0;
  var own = visit ? visit.owner : ((CC.Multiplayer && CC.Multiplayer.role) || 'host');
  return 10 + (own === 'guest' ? 2 : 0) + (room === 'tent' ? 1 : 0);
};
Camp.nearAction = function(){
  var p=hero();
  if (!p) return false;
  if (Camp.isWorldCampNear() || nearRemote()) return true;
  return !!spotNear();
};
Camp.interact = function() {
  var p=hero();
  if (!p) return false;
  if (modal) return true;
  if (!inCamp()) {
    if (Camp.isWorldCampNear()) { enter(); return true; }
    var r = nearRemote(); if (r) { visitCamp(r); return true; }
    return false;
  }
  var sp = spotNear();
  if (room==='outside') {
    if (sp && sp.id==='tent') { goTent(); return true; }
    if (sp && sp.id==='stump') {
      p.x=OUT.w/2-125;p.y=OUT.h/2+84;p.campSitting=true;
      note('Resting by the fire. A quiet moment.');
    }
    return true;
  }
  if (room==='tent' && sp) {
    if (sp.id==='bed') {
      p.hp=p.maxHp;p.mana=p.maxMana;
      if (CC.DayNight&&CC.DayNight.skipToMorning&&CC.DayNight.skipToMorning()) note('You sleep through the night. It is morning - health and mana fully restored.');
      else note('Well rested - health and mana fully restored.');
    } else if (sp.id==='stove') {
      p.mana=p.maxMana;
      note('The little stove crackles. Warm and cozy - mana restored.');
    } else if (sp.id==='chest') {
      if (visit) note('Only ' + visit.name + ' may open this chest.');
      else { modal='chest'; page=0; }
    }
  }
  return true;
};
Camp.update = function(dt) {
  elapsed+=dt;if(messageTime>0)messageTime-=dt;
  if(!inCamp()||modal)return;
  var p=hero();if(!p)return;
  var dim=dimensions();
  if(room==='outside' && p.y>dim.h-57 &&
      Math.abs(p.x-dim.w/2)<GATE_HALF-8) {
    if (visit) leave(false); else modal='leave';
    return;
  }
  if(room==='outside' && p.campSitting && CC.input && (Math.abs(CC.input.moveX)+Math.abs(CC.input.moveY)>0.2)) p.campSitting=false;
  if(room==='tent' && p.y>dim.h-51 && p.x>dim.w/2-65 && p.x<dim.w/2+65) {
    goOutside();
  }
};
Camp.key = function(code) {
  if(!modal)return false;
  if(modal==='chest'){
    if(code==='Escape' || code==='KeyF'){modal='';return true;}
    if(code==='ArrowRight'){page++;return true;}
    if(code==='ArrowLeft'){page=Math.max(0,page-1);return true;}
    return true;
  }
  if(code==='KeyY'||code==='Enter'){Camp.confirm(true);return true;}
  if(code==='KeyN'||code==='Escape'){Camp.confirm(false);return true;}
  return true;
};
Camp.respawn = function() {
  if(!home&&pendingHome&&CC.reenterSavedCamp){
    if(CC.reenterSavedCamp(pendingHome))Camp.bindToMap(pendingHome.area,state().map);
  }
  if(!home||!hero())return false;
  if(CC.rememberSessionWorld)CC.rememberSessionWorld();
  // The generated source map is intentionally retained, so the exact checkpoint still exists.
  room='';modal='';visit=null;
  var p=hero(),s=state();
  var sameWorld = s.area === home.area && s.floor === home.floor &&
    s.map === home.map && (!home.caveSnapshot || home.dungeon.floor === home.floor);
  restoreCave();
  s.area=home.area;s.floor=home.floor;s.map=home.map;s.mode=home.mode;
  CC.Dungeon=home.dungeon;
  p.x=home.x;p.y=home.y;p.hp=p.maxHp;p.mana=p.maxMana;p.invuln=2;
  if(CC.Enemies){
    // Never resurrect slain creatures or erase surviving ones on death.
    if(!sameWorld&&CC.restoreSessionWorld)
      CC.restoreSessionWorld(home.area,home.floor,home.treeFloor);
    if(CC.Enemies.projectiles)CC.Enemies.projectiles.length=0;
    CC.Enemies.zones=[];
  }
  note('You awaken at your camp.');
  return true;
};
// Waystone destination: arrive inside the existing campsite, retaining its
// original world map, chest, checkpoint and any stored items.
Camp.travelTo=function(){
  if(!home&&pendingHome&&CC.reenterSavedCamp){
    if(CC.reenterSavedCamp(pendingHome))Camp.bindToMap(pendingHome.area,state().map);
  }
  if(!home||!hero())return false;
  home.needsEnemies=true;
  visit=null;
  goOutside();
  note('The waystone returns you safely to your campsite.');
  return true;
};
Camp.exportState=function(){
  if(!home)return pendingHome||null;
  return {area:home.area,mode:home.mode,floor:home.floor,
    treeFloor:home.treeFloor||1,x:home.x,y:home.y,
    seed:home.map&&home.map.seed||null,items:inventory.slice()};
};
Camp.importState=function(data){
  if(!data||!Number.isFinite(data.x)||!Number.isFinite(data.y))return false;
  pendingHome={area:data.area,mode:data.mode||'dungeon',floor:data.floor||1,
    treeFloor:data.treeFloor||1,x:data.x,y:data.y,
    seed:data.seed,items:Array.isArray(data.items)?data.items:[]};
  return Camp.bindToMap(state().area,state().map);
};
Camp.bindToMap=function(area,worldMap){
  ensureFence(worldMap); // any camp in this scene (yours or your partner's) has a solid palisade
  if(!pendingHome||!worldMap||pendingHome.area!==area||
    (state().floor||1)!==(pendingHome.floor||1))return false;
  if(pendingHome.area==='tree-ascent'&&
    (state().treeFloor||1)!==(pendingHome.treeFloor||1))return false;
  var c=pendingHome;pendingHome=null;
  home={area:c.area,mode:c.mode,floor:c.floor,treeFloor:c.treeFloor,
    map:worldMap,dungeon:worldMap,x:c.x,y:c.y,caveSnapshot:null};
  inventory=c.items.slice();ensureFence(worldMap);return true;
};
Camp.clear = function(){room='';modal='';home=null;pendingHome=null;visit=null;inventory.length=0;};

/* Hand-painted 2.5D camp artwork. All objects use world coordinates to match gameplay collision. */
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h);}
function path(c,points,color){c.fillStyle=color;c.beginPath();c.moveTo(points[0],points[1]);for(var i=2;i<points.length;i+=2)c.lineTo(points[i],points[i+1]);c.closePath();c.fill();}
function line(c,points,color,w){c.strokeStyle=color;c.lineWidth=w||1;c.beginPath();c.moveTo(points[0],points[1]);for(var i=2;i<points.length;i+=2)c.lineTo(points[i],points[i+1]);c.stroke();}
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,6.283185);c.fill();}
function arc(c,x,y,r,color,w){c.strokeStyle=color;c.lineWidth=w||1;c.beginPath();c.arc(x,y,r,0,6.283185);c.stroke();}
function glow(c,x,y,r,color) {
  var g=c.createRadialGradient(x,y,2,x,y,r);
  g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');
  rect(c,x-r,y-r,2*r,2*r,g);
}
function shadow(c,x,y,rx,ry){ellipse(c,x,y,rx,ry,'rgba(6,6,7,0.45)');}
function randArt(n){var k=Math.sin(n*93.17+51.1)*24673.132;return k-Math.floor(k);}
function biome(){return visit?visit.area:(home&&home.area)||'cave';}

function pine(c,x,y,scale) {
  c.save();c.translate(x,y);c.scale(scale,scale);
  shadow(c,2,26,24,11);
  path(c,[-6,20,-3,-17,8,-17,10,22],'#574032');
  rect(c,-2,-13,3,24,'#87664a');
  for(var i=0;i<3;i++){
    var yy=-65+i*23,ww=18+i*9;
    path(c,[-ww,yy+42,0,yy-9,ww,yy+42],i===1?'#23402f':'#1b352b');
    path(c,[-ww+4,yy+39,0,yy-9,1,yy+36],i===1?'#335641':'#2b4b38');
    line(c,[-ww+6,yy+40,0,yy+13,ww-5,yy+40],'rgba(149,175,117,0.2)',1);
  }
  c.restore();
}
function rock(c,x,y,w,h){
  shadow(c,x+2,y+3,w*0.57,h*0.45);
  path(c,[x-w/2,y,x-w*0.32,y-h,x+w*0.25,y-h*0.85,x+w/2,y-h*0.17,x+w*0.41,y+h*0.26,x-w*0.31,y+h*0.2],'#615d5a');
  path(c,[x-w/2,y,x-w*.32,y-h,x+w*.05,y-h*.83,x+w*.07,y-h*.21],'#918981');
  line(c,[x+w*.07,y-h*.21,x+w*.39,y+h*.11],'#383738',1.3);
}
function tuft(c,x,y,scale,col){
  line(c,[x,y,x-4*scale,y-7*scale,x-8*scale,y-9*scale],col||'#52704e',1.5);
  line(c,[x,y,x+3*scale,y-9*scale,x+6*scale,y-12*scale],col||'#52704e',1.5);
  line(c,[x,y,x,y-13*scale],col||'#52704e',1.4);
}
function ground(c,w,h,inside){
  var area=biome();
  var colors=inside?['#34261f','#473429','#725340','#927358']:
    area==='forest'?['#121f19','#1a2e21','#344733','#5d6548']:
    area==='plains'?['#28291d','#40442a','#676343','#8c7853']:
    area==='town'?['#252720','#31352b','#514936','#897357']:
    ['#13141c','#20212a','#414047','#73654f'];
  var grad=c.createLinearGradient(0,0,w,h);
  grad.addColorStop(0,colors[0]);grad.addColorStop(.6,colors[1]);grad.addColorStop(1,colors[2]);
  rect(c,0,0,w,h,grad);
  if(inside){
    // Worn plank-and-hide floor over the earth.
    for(var row=0;row<12;row++){
      var y0=38+row*17;
      line(c,[28,y0,w-28,y0],row%2?'rgba(15,8,7,0.22)':'rgba(215,169,119,0.10)',1.3);
      for(var j=0;j<4;j++){
        var x0=30+j*90+(row%2)*24;
        line(c,[x0,y0,x0,y0+16],'rgba(10,7,7,0.21)',1);
      }
    }
  } else {
    // A cleared, tamped-down oval of earth inside the camp.
    shadow(c,w/2,h/2+38,205,144);
    ellipse(c,w/2,h/2+27,199,137,area==='forest'?'#3a3c2b':'#3c3428');
    ellipse(c,w/2,h/2+17,176,112,area==='plains'?'#65543c':'#4a4030');
    // Earthen path from the tent to the gate.
    path(c,[w/2-33,174,w/2+31,174,w/2+24,h-15,w/2-25,h-15],'rgba(125,100,67,0.24)');
  }
  for(var i=0;i<(inside?175:310);i++){
    var x=18+randArt(i*11+3)*(w-36),y=23+randArt(i*7+19)*(h-46);
    var cc=colors[2+(i%2)],r=1+randArt(i+200)*2.4;
    ellipse(c,x,y,r,r*.6,cc);
    if(!inside&&i%9===0)tuft(c,x,y,.6,area==='forest'?'#486040':'#68684a');
    if(!inside&&i%34===0){rect(c,x-3,y-1,2,2,'#b2a77e');rect(c,x+2,y+1,1,1,'#98785e');}
  }
  var v=c.createRadialGradient(w/2,h/2,35,w/2,h/2,Math.max(w,h)*.74);
  v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(2,2,7,0.82)');
  rect(c,0,0,w,h,v);
}
function fencePost(c,x,y,id,front){
  var h=18+((id*5)%5), wood=id%3===0?'#886542':id%3===1?'#735137':'#68472e';
  // The pointed top is a real timber spike, not an ornamental boundary line.
  path(c,[x-7,y+12,x-7,y-h+9,x,y-h-6,x+7,y-h+9,x+7,y+12],wood);
  path(c,[x-7,y-h+9,x,y-h-6,x+1,y+10,x-3,y+9],'#b58a58');
  line(c,[x+5,y-h+10,x+5,y+8],'#3c281d',1.5);
  rect(c,x-7,y-1,14,4,'#36291e');
  rect(c,x-7,y+7,14,3,'#4b3525');
  rect(c,x-5,y+1,2,2,'#d0ab67');
  if(front){line(c,[x-5,y+12,x+8,y+18],'rgba(0,0,0,.26)',2);}
}
function fenceSide(c,x1,y1,x2,y2,vertical,gapLo,gapHi){
  c.save();
  var len=vertical?Math.abs(y2-y1):Math.abs(x2-x1),n=Math.max(1,Math.floor(len/13));
  // Timber crossbars bind stakes together.
  line(c,[x1,y1+2,x2,y2+2],'#38291e',5);
  line(c,[x1,y1+10,x2,y2+10],'#2c2118',3);
  for(var i=0;i<=n;i++){
    var t=i/n,xx=x1+(x2-x1)*t,yy=y1+(y2-y1)*t;
    var coord=vertical?yy:xx;
    if(gapLo!==undefined&&coord>gapLo&&coord<gapHi)continue;
    shadow(c,xx+4,yy+17,9,3);
    fencePost(c,xx,yy,i,!vertical);
  }
  c.restore();
}
function lantern(c,x,y,post){
  c.save();
  if(post){
    line(c,[x,y+22,x,y-34,x+13,y-38,x+17,y-27],'#6b5034',3);
    x+=17;y-=24;
  } else line(c,[x,y-20,x,y-8],'#c8b79b',2);
  glow(c,x,y,32,'rgba(255,173,75,0.18)');
  path(c,[x-7,y-8,x+7,y-8,x+9,y+5,x-9,y+5],'#372e28');
  path(c,[x-5,y-7,x+5,y-7,x+6,y+4,x-6,y+4],'#e9a75a');
  rect(c,x-2,y-5,4,8,'#fff0ac');
  rect(c,x-9,y-10,18,3,'#8e7953');
  rect(c,x-10,y+5,20,3,'#55473b');c.restore();
}
function crate(c,x,y,w,h){
  shadow(c,x+w*.55,y+h, w*.7,h*.35);
  rect(c,x,y,w,h,'#47301f');
  rect(c,x+2,y+2,w-4,h-4,'#775134');
  line(c,[x+2,y+2,x+w-2,y+h-2],'#36241a',2);
  line(c,[x+w-2,y+2,x+2,y+h-2],'#ac8252',1.4);
  line(c,[x,y+h*.5,x+w,y+h*.5],'#30251e',2);
  rect(c,x+3,y+3,3,3,'#b29d71');rect(c,x+w-6,y+h-6,3,3,'#b29d71');
}
function barrel(c,x,y){
  shadow(c,x+2,y+12,16,6);
  ellipse(c,x,y+3,14,9,'#422e22');
  rect(c,x-13,y-24,26,29,'#724b2d');
  rect(c,x-13,y-18,26,4,'#92816c');rect(c,x-13,y-1,26,4,'#92816c');
  ellipse(c,x,y-24,13,7,'#9d6c43');
  ellipse(c,x,y-24,9,4,'#49301f');line(c,[x-10,y-23,x+8,y-23],'#b08351',1);
}
function smoke(c,x,y,phase,amount){
  c.save();c.globalAlpha=.2*(amount||1);
  c.lineWidth=2.5;c.lineCap='round';
  for(var i=0;i<4;i++){
    var p=((elapsed*.22+phase+i*.25)%1), yy=y-15-p*65, xx=x+Math.sin(elapsed*.9+i*2)*7+p*18;
    c.strokeStyle=i%2?'#c5b9a2':'#888887';c.beginPath();
    c.moveTo(xx,yy+8);c.bezierCurveTo(xx-9,yy,xx+9,yy-8,xx+3,yy-18);c.stroke();
  }
  c.restore();
}
function cookingFire(c,x,y,scale){
  scale=scale||1;c.save();c.translate(x,y);c.scale(scale,scale);
  var flick=(Math.sin(elapsed*8)*.5+Math.sin(elapsed*12+2)*.5),lit=.84+Math.sin(elapsed*9)*.10;
  glow(c,0,0,93,'rgba(255,162,65,'+(.24*lit).toFixed(3)+')');
  ellipse(c,0,12,32,17,'#29231e');
  for(var i=0;i<9;i++){var ang=i*6.283/9;ellipse(c,Math.cos(ang)*29,Math.sin(ang)*15+11,8,6,i%2?'#a09785':'#655d50');}
  line(c,[-16,10,17,16],'#563626',7);line(c,[17,8,-14,17],'#7b4b2c',6);
  for(i=0;i<5;i++)path(c,[-12+i*5,14,-5+i*5,-13-flick*5+i%2*4,4+i*4,14],i%2?'#e97126':'#ffd272');
  path(c,[-6,13,0,-7-flick*2,7,13],'#fff0aa');
  // Stable iron cooking tripod and animated hanging pot, future cooking point.
  line(c,[-30,10,-16,-36],'#82858a',3);line(c,[30,11,16,-36],'#82858a',3);
  line(c,[-16,-36,16,-36],'#b2a9a0',2.5);line(c,[0,-36,0,-19],'#aba19c',2);
  path(c,[-14,-20,14,-20,11,-5,-11,-5],'#292c31');
  ellipse(c,0,-19,14,4,'#858181');ellipse(c,0,-21,9,2,'#453f38');
  ellipse(c,0,-3,12,3,'#171a1b');
  smoke(c,0,-34,0,.8);
  c.restore();
}
function stump(c,x,y){
  shadow(c,x+5,y+16,31,12);
  rect(c,x-22,y-2,44,18,'#4b2e1e');
  for(var i=0;i<7;i++)line(c,[x-19+i*6,y-1,x-18+i*6,y+14],i%2?'#a0764a':'#332114',2);
  ellipse(c,x,y-3,24,14,'#8f623b');
  ellipse(c,x,y-4,19,10,'#b68a52');
  c.strokeStyle='#79512f';c.lineWidth=1.6;
  c.beginPath();c.ellipse(x,y-4,13,7,0,0,6.283);c.stroke();
  c.beginPath();c.ellipse(x+1,y-4,6,3,0,0,6.283);c.stroke();
  // A weathered hatchet leans against the stump.
  line(c,[x+26,y+20,x+10,y-17],'#a57a54',3);
  path(c,[x+10,y-19,x+22,y-24,x+27,y-13,x+11,y-9],'#898e8f');
  line(c,[x+12,y-17,x+24,y-19],'#c6c9bb',1);
}
function rug(c,x,y,w,h,color){
  shadow(c,x+w*.5,y+h*.65,w*.55,h*.54);
  rect(c,x,y,w,h,'#2c2725');rect(c,x+3,y+3,w-6,h-6,color);
  c.strokeStyle='#c9a979';c.lineWidth=1.5;c.strokeRect(x+7,y+6,w-14,h-12);
  for(var i=7;i<w-6;i+=9){rect(c,x+i,y-1,1,4,'#c2a374');rect(c,x+i,y+h-2,1,4,'#c2a374');}
  for(i=7;i<h-5;i+=10){rect(c,x,y+i,4,1,'#d6ab7a');rect(c,x+w-4,y+i,4,1,'#d6ab7a');}
}
function chest(c,x,y,open){
  shadow(c,x+34,y+42,44,16);
  rect(c,x,y+9,68,37,'#31231d');
  rect(c,x+3,y+7,62,34,'#795032');
  if(open){
    path(c,[x+4,y+9,x+13,y-15,x+58,y-15,x+65,y+9],'#915b36');
    rect(c,x+12,y-11,49,5,'#c0935c');rect(c,x+7,y+7,54,15,'#251d1b');
    ellipse(c,x+29,y+17,17,6,'#c6a95b');
  }else{
    path(c,[x+3,y+9,x+12,y-2,x+59,y-2,x+65,y+9],'#ab7546');
    rect(c,x+4,y+9,60,16,'#97653e');
    line(c,[x+8,y+11,x+59,y+11],'#d4a665',2);
  }
  rect(c,x+8,y+5,5,34,'#c0a167');rect(c,x+55,y+5,5,34,'#bca168');
  rect(c,x+28,y+17,13,15,'#c6aa6e');
  rect(c,x+33,y+20,4,5,'#34271d');
  for(var i=0;i<4;i++){rect(c,x+4+i*19,y+26,2,2,'#c6a063');}
}
function worldPrompt(c,x,y,title,active){
  c.save();c.textAlign='center';c.font='bold 9px Georgia,serif';
  var w=Math.max(58,c.measureText(title).width+14);
  rect(c,x-w/2,y-18,w,17,active?'rgba(45,34,23,0.86)':'rgba(22,19,19,.76)');
  c.strokeStyle=active?'#e0bd77':'#6c5d4c';c.lineWidth=1;c.strokeRect(x-w/2,y-18,w,17);
  c.fillStyle=active?'#ffdfa0':'#c0ad95';c.fillText(title,x,y-6);c.restore();
}
/* ---------- smoke from the tent's stove pipe ---------- */
function puffs(c,x,y,sc,n,amt){
  var t=clock(),i;
  c.save();
  for(i=0;i<n;i++){
    var u=((t*.26+i/n)%1),xx=x+Math.sin(t*1.2+i*2.3)*5*sc+u*u*24*sc,yy=y-u*66*sc,r=(2.6+u*9.5)*sc,a=Math.min(1,u*7)*(1-u)*.46*amt;
    c.fillStyle='rgba(216,210,202,'+a.toFixed(3)+')';
    c.beginPath();c.arc(xx,yy,r,0,6.283);c.fill();
    c.fillStyle='rgba(120,118,122,'+(a*.45).toFixed(3)+')';
    c.beginPath();c.arc(xx+r*.25,yy+r*.2,r*.6,0,6.283);c.fill();
  }
  c.restore();
}
function tent(c,x,y,scale,noSmoke){
  scale=scale||1;c.save();c.translate(x,y);c.scale(scale,scale);
  shadow(c,5,39,91,23);
  // Guy lines, pins and reinforced base.
  line(c,[-66,14,-99,42],'#c2aa80',1.7);line(c,[66,14,99,42],'#c2aa80',1.7);
  line(c,[0,-63,0,41],'#4d3e32',2.8);
  rect(c,-101,39,6,8,'#ad8750');rect(c,96,39,6,8,'#ad8750');
  path(c,[-80,38,0,-68,81,38],'#685c49');
  path(c,[-77,37,0,-64,0,39],'#b6a078');
  path(c,[0,-64,79,37,0,39],'#4c4a3e');
  path(c,[-62,34,-1,-46,-8,30],'#cdb58e');
  path(c,[9,-49,73,34,38,29],'#78705b');
  line(c,[-80,38,81,38],'#3d342c',6);
  line(c,[0,-63,0,-30],'#e0c99e',2);
  // Stitched seams, waxed canvas patches and two hanging flap panels.
  line(c,[-68,33,0,-61,64,33],'#e5cba4',1.4);
  line(c,[-36,33,-2,-38],'rgba(92,69,45,0.55)',1);
  line(c,[39,34,1,-39],'#342f2b',1.3);
  path(c,[31,-4,49,1,54,18,36,16],'#aa8c62');
  for(var i=0;i<4;i++)line(c,[35+i*4,1,37+i*4,14],'#604a34',1);
  path(c,[-24,38,0,-16,26,38],'#221b1b');
  var flap=Math.sin(elapsed*1.8)*3;
  path(c,[-25,38,0,-18,-11+flap,35],'#d5b98c');
  path(c,[0,-18,25,38,16+flap,34],'#6c5c46');
  line(c,[-12+flap,34,0,-18],'#ebd4ab',1);
  line(c,[16+flap,34,0,-18],'#352f2b',1.3);
  // A metal ring ties down the front flap.
  arc(c,0,21,2.8,'#d2be8b',1.5);
  // Emberdeep banner patch
  path(c,[-51,11,-38,-5,-26,11],'#6e4034');
  line(c,[-41,4,-38,1,-35,4],'#d5a978',1.4);
  // Stove pipe through the roof, with a rain cap and flashing
  rect(c,34,-60,6,46,'#2a292d');rect(c,34,-60,2,46,'#5a5a62');
  rect(c,33,-46,8,3,'#3b3a40');rect(c,33,-32,8,3,'#3b3a40');
  path(c,[29,-13,45,-13,47,-9,27,-9],'#3a3a40');
  path(c,[30,-62,37,-71,44,-62],'#3d3c42');rect(c,35,-62,4,4,'#222126');
  c.restore();
  if(!noSmoke){c.save();c.translate(x,y);c.scale(scale,scale);puffs(c,37,-70,1,7,1.6);c.restore();}
}

/* ---------- the cozy interior ---------- */
function ovalRug(c,cx,cy,rx,ry,c1,c2,c3){
  ellipse(c,cx+2,cy+4,rx+4,ry+3,'rgba(0,0,0,.34)');
  ellipse(c,cx,cy,rx,ry,c1);
  ellipse(c,cx,cy,rx-7,ry-5,c2);
  ellipse(c,cx,cy,rx-17,ry-11,c3);
  c.strokeStyle='rgba(232,205,150,.55)';c.lineWidth=1.2;
  c.beginPath();c.ellipse(cx,cy,rx-11,ry-8,0,0,6.283);c.stroke();
  for(var i=0;i<14;i++){var a=i*6.283/14;line(c,[cx+Math.cos(a)*(rx-24),cy+Math.sin(a)*(ry-15),cx+Math.cos(a)*(rx-34),cy+Math.sin(a)*(ry-20)],'rgba(240,214,160,.45)',1);}
  for(i=0;i<22;i++){var b=i*6.283/22;rect(c,cx+Math.cos(b)*(rx+1)-1,cy+Math.sin(b)*(ry+1)-1,2,2,'#d6b98a');}
}
function pillow(c,x,y,w,h,col){
  ellipse(c,x+1,y+2,w,h,'rgba(0,0,0,.25)');
  ellipse(c,x,y,w,h,col);
  ellipse(c,x-w*.2,y-h*.35,w*.55,h*.4,'rgba(255,255,255,.35)');
  c.strokeStyle='rgba(120,100,80,.35)';c.lineWidth=1;c.beginPath();c.ellipse(x,y,w-2.5,h-2,0,0,6.283);c.stroke();
}
function cozyBed(c,x,y){ // x,y = top-left, 92 wide
  shadow(c,x+48,y+78,58,12);
  // frame and carved headboard against the wall
  rect(c,x-2,y+4,96,78,'#33211a');
  rect(c,x-4,y-8,100,18,'#5a3a25');rect(c,x-4,y-8,100,3,'#9a6d44');rect(c,x-4,y+8,100,2,'#2a1a12');
  for(var i=0;i<5;i++){rect(c,x+4+i*20,y-4,12,10,'#6b452b');ellipse(c,x+10+i*20,y-4,6,3,'#7f5636');}
  ellipse(c,x-3,y-10,4,4,'#c9a35e');ellipse(c,x+95,y-10,4,4,'#c9a35e');
  // mattress and linen
  rect(c,x+2,y+8,88,72,'#eadfc9');rect(c,x+2,y+8,88,3,'#fff6e3');
  // two plump pillows
  pillow(c,x+26,y+24,19,10,'#f5eee1');pillow(c,x+66,y+24,19,10,'#e9dfce');
  // patchwork quilt
  var cols=['#8a3d47','#cda25a','#3d6b6b','#b3594a','#6c4b7a','#d9c28e'],r,k;
  c.save();c.beginPath();c.rect(x+2,y+38,88,42);c.clip();
  for(r=0;r<4;r++)for(k=0;k<7;k++){
    var col=cols[(r*3+k*2+(r%2))%cols.length];
    rect(c,x+2+k*13,y+38+r*11,13,11,col);
    line(c,[x+2+k*13,y+38+r*11,x+15+k*13,y+49+r*11],'rgba(255,255,255,.12)',1);
    c.strokeStyle='rgba(40,20,20,.35)';c.lineWidth=.8;c.strokeRect(x+2.5+k*13,y+38.5+r*11,12,10);
  }
  c.restore();
  // turned-down top edge and soft shadow
  path(c,[x+2,y+38,x+90,y+38,x+90,y+45,x+2,y+45],'#f1e6d2');
  line(c,[x+2,y+45,x+90,y+45],'rgba(60,30,30,.4)',1.4);
  // folded wool blanket at the foot
  rect(c,x+2,y+68,88,12,'#46603f');
  for(i=0;i<5;i++)line(c,[x+2,y+70+i*2.4,x+90,y+70+i*2.4],i%2?'#d8c892':'#2d4130',1);
  rect(c,x-1,y+80,3,5,'#2a1a12');rect(c,x+88,y+80,3,5,'#2a1a12');
}
function candleFlame(c,x,y,sz){
  var f=Math.sin(clock()*9+x)*.8+Math.sin(clock()*13)*.5;
  glow(c,x,y-4,24*sz,'rgba(255,190,95,'+(.30+.04*f).toFixed(3)+')');
  path(c,[x-2*sz,y,x,y-8*sz-f,x+2*sz,y],'#ff9a3d');
  path(c,[x-1*sz,y,x,y-5*sz-f*.6,x+1*sz,y],'#fff1a6');
}
function nightstand(c,x,y){ // 34 x 36
  shadow(c,x+18,y+40,22,6);
  rect(c,x+2,y+30,4,9,'#2f1f16');rect(c,x+28,y+30,4,9,'#2f1f16');
  rect(c,x,y+4,34,30,'#5f3f2a');rect(c,x+2,y+6,30,26,'#744c32');
  rect(c,x-1,y,36,6,'#946a46');rect(c,x-1,y,36,1.6,'#b88a5c');
  rect(c,x+4,y+10,26,9,'#6a4630');c.strokeStyle='#3a261a';c.lineWidth=1;c.strokeRect(x+4.5,y+10.5,25,8);
  ellipse(c,x+17,y+14.5,2.2,2.2,'#d2ab5f');
  rect(c,x+4,y+22,26,8,'#6a4630');c.strokeStyle='#3a261a';c.strokeRect(x+4.5,y+22.5,25,7);
  ellipse(c,x+17,y+26.5,2.2,2.2,'#d2ab5f');
  // books, a brass dish with a candle
  rect(c,x+3,y-5,13,3,'#7a3f3a');rect(c,x+4,y-8,11,3,'#3f5f6b');rect(c,x+5,y-8,2,11,'rgba(255,230,180,.25)');
  ellipse(c,x+25,y-1,6,2.5,'#b8893c');rect(c,x+23,y-9,4,8,'#f0e8cc');rect(c,x+23,y-9,1.5,8,'#fff8e2');
  candleFlame(c,x+25,y-10,1);
}
function windowArt(c,x,y,w,h){
  // outer frame and sill
  rect(c,x-8,y-8,w+16,h+16,'#47311f');rect(c,x-8,y-8,w+16,2,'#80603c');
  rect(c,x-12,y+h+4,w+24,6,'#5b4029');rect(c,x-12,y+h+4,w+24,2,'#9a7447');
  // night sky
  var g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#0d1a3a');g.addColorStop(.62,'#1f4066');g.addColorStop(1,'#37647d');
  c.fillStyle=g;c.fillRect(x,y,w,h);
  for(var i=0;i<13;i++){var sx=x+3+randArt(i*5+1)*(w-6),sy=y+2+randArt(i*7+3)*(h*.5);rect(c,sx,sy,1.2,1.2,i%3?'#e8eaff':'#ffffff');}
  ellipse(c,x+w*.72,y+h*.3,6.5,6.5,'#f6f0cc');ellipse(c,x+w*.72+2.8,y+h*.3-1.4,5.8,5.8,'#16294c');
  glow(c,x+w*.7,y+h*.3,22,'rgba(210,225,255,.22)');
  // pine silhouettes on a ridge
  path(c,[x,y+h,x,y+h*.78,x+w*.25,y+h*.7,x+w*.55,y+h*.8,x+w*.8,y+h*.68,x+w,y+h*.75,x+w,y+h],'#0a1622');
  for(i=0;i<5;i++){var tx=x+6+i*(w-12)/4,th=13+(i%2)*6;path(c,[tx-5,y+h,tx,y+h-th,tx+5,y+h],'#08121c');path(c,[tx-4,y+h-th*.45,tx,y+h-th-3,tx+4,y+h-th*.45],'#08121c');}
  // glazing bars and a reflection
  rect(c,x+w/2-1.5,y,3,h,'#47311f');rect(c,x,y+h/2-1.5,w,3,'#47311f');
  path(c,[x+3,y+h,x+16,y,x+24,y,x+11,y+h],'rgba(255,255,255,.07)');
  // curtains tied back, on a brass rod
  path(c,[x-10,y-6,x+13,y-6,x+8,y+h*.5,x+15,y+h+2,x-10,y+h+2],'#7a3a40');
  path(c,[x+w+10,y-6,x+w-13,y-6,x+w-8,y+h*.5,x+w-15,y+h+2,x+w+10,y+h+2],'#7a3a40');
  for(i=0;i<4;i++){line(c,[x-8+i*4,y-4,x-6+i*3,y+h],'rgba(40,10,15,.35)',1);line(c,[x+w+8-i*4,y-4,x+w+6-i*3,y+h],'rgba(40,10,15,.35)',1);}
  line(c,[x+2,y+h*.52,x+13,y+h*.5],'#d8b56a',2);line(c,[x+w-2,y+h*.52,x+w-13,y+h*.5],'#d8b56a',2);
  line(c,[x-14,y-9,x+w+14,y-9],'#c3a05a',3);ellipse(c,x-15,y-9,3.2,3.2,'#d9b96d');ellipse(c,x+w+15,y-9,3.2,3.2,'#d9b96d');
  // a little pot of wildflowers on the sill
  path(c,[x+w-26,y+h+4,x+w-14,y+h+4,x+w-16,y+h-6,x+w-24,y+h-6],'#a1573a');rect(c,x+w-26,y+h-8,12,3,'#bf7048');
  for(i=0;i<4;i++){var fx=x+w-24+i*3.4,fy=y+h-18-(i%2)*5;line(c,[fx,y+h-8,fx,fy],'#4d7a3d',1.3);ellipse(c,fx,fy,2.6,2.6,['#f2a3b8','#f5e27a','#ffffff','#b79bf0'][i]);}
}
function woodStove(c,x,y){ // body at x..x+46, y..y+38 ; pipe rises from its top
  var t=clock(),flick=.8+.2*Math.sin(t*8)+.08*Math.sin(t*13);
  // hearth stones
  path(c,[x-14,y+46,x+60,y+46,x+68,y+64,x-22,y+64],'#4a484d');
  path(c,[x-10,y+46,x+56,y+46,x+62,y+58,x-16,y+58],'#6a676c');
  for(var i=0;i<6;i++)line(c,[x-12+i*13,y+46,x-18+i*14,y+62],'rgba(20,18,22,.45)',1);
  glow(c,x+23,y+50,70,'rgba(255,140,50,'+(.2*flick).toFixed(3)+')');
  shadow(c,x+23,y+48,34,8);
  // legs
  rect(c,x+3,y+36,5,11,'#1b1b1f');rect(c,x+38,y+36,5,11,'#1b1b1f');
  // body
  var g=c.createLinearGradient(x,0,x+46,0);g.addColorStop(0,'#19191d');g.addColorStop(.35,'#3b3b42');g.addColorStop(1,'#1a1a1e');
  c.fillStyle=g;c.fillRect(x,y,46,38);
  rect(c,x-2,y-3,50,6,'#2a2a30');rect(c,x-2,y-3,50,1.5,'#5c5c66');
  rect(c,x-1,y+33,48,5,'#2a2a30');
  for(i=0;i<4;i++){ellipse(c,x+4+i*12.6,y+5,1.3,1.3,'#6d6d78');ellipse(c,x+4+i*12.6,y+33,1.3,1.3,'#6d6d78');}
  // door with a glowing grille
  rect(c,x+9,y+10,28,21,'#101013');rect(c,x+10,y+11,26,19,'#26262c');
  rect(c,x+13,y+15,20,11,'#3a1608');
  for(i=0;i<4;i++)rect(c,x+14+i*5,y+16,2.6,9,'rgba(255,'+Math.floor(120+60*flick)+',40,'+(.9*flick).toFixed(2)+')');
  glow(c,x+23,y+20,20,'rgba(255,150,60,'+(.5*flick).toFixed(3)+')');
  ellipse(c,x+36,y+21,1.8,1.8,'#b9a36a');
  // kettle on the plate, steaming
  ellipse(c,x+14,y-8,9,6,'#5d6a72');rect(c,x+5,y-14,18,8,'#6b7a83');ellipse(c,x+14,y-14,9,3,'#8a99a1');
  path(c,[x+23,y-12,x+31,y-17,x+32,y-15,x+24,y-8],'#6b7a83');ellipse(c,x+14,y-17,2.6,1.8,'#2f3a40');
  path(c,[x+5,y-12,x+1,y-9,x+5,y-6],'#2f3a40');
  puffs(c,x+30,y-17,.28,3,.8);
  // pipe up to the canvas, with a bend and a wall collar
  rect(c,x+30,y-84,8,82,'#26262b');rect(c,x+30,y-84,2.4,82,'#5c5c66');
  rect(c,x+28,y-62,12,3,'#3b3b42');rect(c,x+28,y-34,12,3,'#3b3b42');rect(c,x+28,y-10,12,3,'#3b3b42');
  rect(c,x+26,y-86,16,5,'#3a3a40');
}
function tableSet(c,x,y){ // 70 x 38
  shadow(c,x+36,y+46,44,9);
  rect(c,x+4,y+26,5,16,'#2f2018');rect(c,x+61,y+26,5,16,'#2f2018');
  rect(c,x,y+8,70,24,'#5e3f2a');rect(c,x,y+6,70,5,'#9a704a');
  // gingham tablecloth with hanging corners
  path(c,[x+3,y+8,x+67,y+8,x+70,y+24,x+66,y+30,x+4,y+30,x,y+24],'#d7c9ad');
  c.save();c.beginPath();c.rect(x,y+8,70,24);c.clip();
  for(var i=0;i<8;i++){rect(c,x+i*9,y+8,4.5,24,'rgba(150,50,55,.55)');}
  for(i=0;i<3;i++){rect(c,x,y+10+i*8,70,4,'rgba(150,50,55,.45)');}
  c.restore();
  line(c,[x+3,y+30,x+67,y+30],'rgba(60,30,30,.5)',1.4);
  // vase with wildflowers
  path(c,[x+9,y+8,x+17,y+8,x+16,y-2,x+10,y-2],'#8ec6c4');rect(c,x+9,y-3,8,2,'#b8e3df');
  var fl=['#f27f9b','#f6dc66','#ffffff','#a98cf2','#f0a15c'];
  for(i=0;i<5;i++){var fx=x+9+i*2.1,fy=y-12-((i*7)%6);line(c,[x+13,y-2,fx,fy],'#4f8a3e',1.2);ellipse(c,fx,fy,2.7,2.7,fl[i]);ellipse(c,fx,fy,.9,.9,'#d9a83c');}
  // candle in a saucer, plate with bread, mug and a rolled map
  ellipse(c,x+31,y+14,6,2.6,'#c9b27a');rect(c,x+29,y+4,4,9,'#f1e9cf');candleFlame(c,x+31,y+3,.9);
  ellipse(c,x+44,y+18,10,4.2,'#e8e2d2');ellipse(c,x+44,y+17,6.5,2.6,'#d6ccb4');ellipse(c,x+44,y+14.5,6,3.6,'#b9803f');ellipse(c,x+42.5,y+13.6,3,1.4,'#d9a35f');
  rect(c,x+57,y+9,7,7,'#c0623f');ellipse(c,x+57,y+12,2,2.6,'rgba(0,0,0,0)');c.strokeStyle='#c0623f';c.lineWidth=1.4;c.beginPath();c.arc(x+65,y+12.5,2.4,-1.4,1.4);c.stroke();ellipse(c,x+60.5,y+9,3.4,1.1,'#5b2b1a');
  rect(c,x+18,y+22,18,5,'#cdb58d');ellipse(c,x+18,y+24.5,2.5,2.6,'#e0cb9f');
  // two stools
  ellipse(c,x-12,y+30,9,5,'rgba(0,0,0,.3)');ellipse(c,x-12,y+26,9,4.5,'#6a4630');ellipse(c,x-12,y+25,7,3,'#8b6340');
  ellipse(c,x+84,y+30,9,5,'rgba(0,0,0,.3)');ellipse(c,x+84,y+26,9,4.5,'#6a4630');ellipse(c,x+84,y+25,7,3,'#8b6340');
}
function logPile(c,x,y){
  for(var r=0;r<3;r++)for(var k=0;k<4-r;k++){
    var lx=x+k*11+r*5.5,ly=y-r*8;
    ellipse(c,lx,ly,6,4.6,'#6a4a2c');ellipse(c,lx,ly,3.8,2.8,'#c79a60');ellipse(c,lx,ly,1.5,1.1,'#8d6538');
  }
}
function leatherPack(c,x,y){
  shadow(c,x+20,y+36,28,6);
  path(c,[x+4,y+34,x,y+10,x+8,y-2,x+34,y-2,x+42,y+10,x+38,y+34],'#7a4f2f');
  path(c,[x+8,y+34,x+5,y+12,x+14,y+2,x+30,y+2,x+36,y+12,x+33,y+34],'#946238');
  rect(c,x+8,y+14,26,16,'#6d4529');line(c,[x+20,y+14,x+20,y+30],'#2f1d12',1.3);
  rect(c,x+17,y+19,6,5,'#c8aa63');
  line(c,[x+10,y,x+10,y+14],'#4b2f1c',2);line(c,[x+30,y,x+30,y+14],'#4b2f1c',2);
  // bedroll strapped on top
  ellipse(c,x+20,y-4,24,6,'#5d6b54');ellipse(c,x+20,y-5,22,4.6,'#7d8d70');ellipse(c,x+44,y-4,5,6,'#4b5846');
  line(c,[x+8,y-8,x+8,y+1],'#3a2616',2);line(c,[x+32,y-8,x+32,y+1],'#3a2616',2);
}
function bootsPair(c,x,y){
  for(var i=0;i<2;i++){
    var bx=x+i*17;
    shadow(c,bx+6,y+13,9,3);
    path(c,[bx,y+12,bx,y-2,bx+9,y-3,bx+11,y+6,bx+17,y+8,bx+17,y+12],'#4c3321');
    path(c,[bx+1,y+10,bx+1,y,bx+7,y-1,bx+8,y+7],'#6a4a30');
    rect(c,bx,y+11,18,3,'#241810');
  }
}
function wallCloak(c,x,y){
  line(c,[x-6,y-4,x+30,y-4],'#6b4b2c',3);
  ellipse(c,x+1,y-4,2.4,2.4,'#c9a35e');ellipse(c,x+23,y-4,2.4,2.4,'#c9a35e');
  path(c,[x,y-2,x+24,y-2,x+30,y+56,x+14,y+62,x-5,y+54],'#41624a');
  path(c,[x+2,y-2,x+13,y-2,x+11,y+58,x-3,y+54],'#58795f');
  for(var i=0;i<3;i++)line(c,[x+4+i*7,y,x+6+i*6,y+56],'rgba(20,40,28,.4)',1);
  ellipse(c,x+12,y+4,2.6,2.6,'#d4b56a');
}
function shelfArt(c,x,y,w){
  rect(c,x,y,w,4,'#5b3d27');rect(c,x,y,w,1.5,'#8d6743');
  rect(c,x+4,y+4,3,6,'#3a2616');rect(c,x+w-7,y+4,3,6,'#3a2616');
  var bk=['#7a3f3a','#3f5f6b','#c19a4d','#4d6a3f','#6b4a7a'];
  for(var i=0;i<5;i++){var hh=10+(i%3)*3;rect(c,x+6+i*4.6,y-hh,4,hh,bk[i]);rect(c,x+6+i*4.6,y-hh,1,hh,'rgba(255,255,255,.18)');}
  // a jar of fireflies and a small candle
  rect(c,x+34,y-13,10,13,'rgba(170,220,210,.35)');c.strokeStyle='rgba(210,240,230,.7)';c.lineWidth=1;c.strokeRect(x+34.5,y-12.5,9,12);
  rect(c,x+33,y-15,12,3,'#8a6a3c');
  var t=clock();for(i=0;i<4;i++){var fx=x+36+(i*2.3),fy=y-10+Math.sin(t*2+i*1.7)*2;rect(c,fx,fy,1.6,1.6,'#e9ff9a');}
  glow(c,x+39,y-6,14,'rgba(230,255,150,.2)');
  rect(c,x+52,y-9,5,9,'#efe6c8');candleFlame(c,x+54.5,y-10,.8);
  if(w>70){rect(c,x+64,y-8,10,8,'#7a5238');ellipse(c,x+69,y-11,4,3,'#6a8f4a');}
}
function herbBundles(c,x0,x1,y){
  line(c,[x0,y,x1,y+3],'#bda26c',1.6);
  for(var i=0;i<5;i++){
    var bx=x0+6+i*(x1-x0-8)/4.2,by=y+1.4+(i*.6);
    line(c,[bx,by,bx,by+7],'#cbb480',1);
    var cols=['#7e9a5a','#a9694e','#8a8f4f','#b98a53','#6d8f58'];
    path(c,[bx-4,by+7,bx+4,by+7,bx+2.4,by+19,bx-2.4,by+19],cols[i%5]);
    line(c,[bx-1.4,by+9,bx-2,by+18],'rgba(40,50,25,.5)',1);
  }
}
function drawInterior(c,w,h){
  var i,j,t=clock();
  // ---- shell ----
  rect(c,0,0,w,h,'#0a070e');
  var wallG=c.createLinearGradient(0,8,0,96);wallG.addColorStop(0,'#8c7352');wallG.addColorStop(1,'#bda37b');
  path(c,[20,96,w/2,6,w-20,96],wallG);
  for(i=0;i<9;i++){var x0=28+i*(w-56)/8;line(c,[w/2,8,x0,96],i%2?'rgba(40,26,18,.34)':'rgba(244,220,176,.17)',1.2);}
  line(c,[20,96,w/2,6,w-20,96],'#e4cca0',2.6);
  rect(c,w/2-1.5,6,3,16,'#6b4b2c');
  // knee wall of vertical planks
  rect(c,20,84,w-40,14,'#4b3325');
  for(i=0;i<(w-40)/9;i++)line(c,[22+i*9,84,22+i*9,98],'rgba(10,6,4,.4)',1);
  rect(c,20,84,w-40,2,'#80603f');
  // side canvas panels
  path(c,[8,98,46,90,46,h-26,8,h-12],'#6a553d');path(c,[w-8,98,w-46,90,w-46,h-26,w-8,h-12],'#574734');
  for(i=0;i<4;i++){line(c,[12+i*8,100+i*2,18+i*7,h-16],'rgba(20,12,8,.3)',1.2);line(c,[w-12-i*8,100+i*2,w-18-i*7,h-16],'rgba(10,8,6,.3)',1.2);}
  // plank floor, warmer toward the front
  var fl=c.createLinearGradient(0,96,0,h-24);fl.addColorStop(0,'#46301f');fl.addColorStop(1,'#6f4d34');
  rect(c,46,96,w-92,h-120,fl);
  for(var r=0;r<14;r++){
    var yy=98+r*14;
    line(c,[46,yy,w-46,yy],'rgba(16,9,6,.3)',1.2);
    line(c,[46,yy+1.4,w-46,yy+1.4],'rgba(220,170,120,.07)',1);
    for(j=0;j<5;j++){var xx=60+j*80+(r%2)*38;line(c,[xx,yy,xx,yy+14],'rgba(12,7,5,.28)',1);}
  }
  rect(c,10,h-26,w-20,16,'#33231a');rect(c,10,h-26,w-20,2,'#6b4c33');
  // moonlight from the window falling across the floor
  path(c,[w/2-36,98,w/2+36,98,w/2+92,226,w/2-92,226],'rgba(150,190,255,.075)');
  path(c,[w/2-24,98,w/2+24,98,w/2+54,214,w/2-54,214],'rgba(170,205,255,.05)');
  // ---- wall things ----
  windowArt(c,w/2-32,26,64,40);
  shelfArt(c,54,62,82);
  herbBundles(c,254,314,58);
  wallCloak(c,13,106);
  // ---- floor things ----
  ovalRug(c,w/2-6,246,102,28,'#5d3037','#7a4146','#a05c4f');
  rug(c,54,186,94,44,'#4b3a50');
  logPile(c,376-46,258);
  // furniture, back to front
  cozyBed(c,52,102);
  nightstand(c,148,110);
  woodStove(c,316,102);
  tableSet(c,232,168);
  chest(c,306,184,modal==='chest');
  leatherPack(c,58,240);bootsPair(c,112,262);
  // potted fern by the wall
  path(c,[354,276,368,276,366,262,356,262],'#9a5a3c');rect(c,353,259,16,4,'#b86e46');
  for(i=0;i<7;i++){var a=-1.2+i*.4;line(c,[361,260,361+Math.sin(a)*16,260-Math.cos(a)*14],i%2?'#4f8a43':'#6aa655',2);}
  // hanging lantern warms the room
  line(c,[w/2+12,42,w/2+12,130],'#8d7a58',1.2);
  lantern(c,w/2+12,142,false);
  glow(c,w/2+12,142,130,'rgba(255,196,110,'+(.15+.03*Math.sin(t*5)).toFixed(3)+')');
  glow(c,172,120,70,'rgba(255,180,90,'+(.12+.02*Math.sin(t*7)).toFixed(3)+')');
  // stove smoke curls out through the roof vent
  c.save();c.beginPath();c.rect(300,0,80,100);c.clip();puffs(c,338,26,.9,5,.9);c.restore();
  // ---- the door: folded canvas tied back, night beyond ----
  path(c,[w/2-48,h-24,w/2,h-58,w/2+48,h-24],'#16222f');
  path(c,[w/2-40,h-24,w/2,h-52,w/2+40,h-24],'#1f3447');
  for(i=0;i<6;i++)rect(c,w/2-34+i*13+((i*5)%7),h-34-(i%3)*5,1.2,1.2,'#dfe6ff');
  path(c,[w/2-50,h-23,w/2-20,h-58,w/2-27,h-23],'#947760');
  path(c,[w/2+50,h-23,w/2+20,h-58,w/2+27,h-23],'#675447');
  line(c,[w/2-52,h-22,w/2+52,h-22],'#c0a077',2);
  var hh=hero();
  if(hh){
    var sp=spotNear();
    if(sp){
      var lab=sp.id==='bed'&&CC.DayNight&&CC.DayNight.isNight&&CC.DayNight.isNight()?'F  SLEEP UNTIL MORNING':sp.prompt;
      if(sp.id==='chest'&&visit)lab='F  CHEST (OWNER ONLY)';
      worldPrompt(c,sp.px,sp.py,lab,true);
    }
    if(hh.y>h-102&&Math.abs(hh.x-w/2)<70)worldPrompt(c,w/2,h-62,'EXIT TENT  ↓',true);
  }
  // soft vignette keeps the focus on the middle
  var v=c.createRadialGradient(w/2,h/2+10,60,w/2,h/2+10,Math.max(w,h)*.7);
  v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(4,2,8,.55)');
  rect(c,0,0,w,h,v);
}
function drawMarkerAt(c,cam,m,title,active){
  var x=m.x-cam.x,y=m.y-cam.y;
  if(x<-90||y<-110||x>cam.w+90||y>cam.h+90)return;
  c.save();c.translate(x,y);
  shadow(c,2,16,49,33);
  ellipse(c,0,0,43,31,'#3e3c30');
  ellipse(c,0,-2,33,22,'#514735');
  // Real mini-camp footprint, complete with sharpened perimeter and open southern gate.
  for(var i=-38;i<=38;i+=9){fencePost(c,i,-27,i+39,false);
    if(Math.abs(i)>16)fencePost(c,i,29,i+19,true);}
  for(i=-22;i<=22;i+=10){fencePost(c,-39,i,i+41,false);fencePost(c,39,i,i+42,false);}
  tent(c,-6,-4,.28,true);
  cookingFire(c,19,9,.32);
  ellipse(c,-24,16,7,4,'#735235');
  glow(c,19,8,16,'rgba(255,172,65,.23)');
  // smoke from the tent's stove pipe, readable from across the map
  puffs(c,-6+37*.28,-4-70*.28,.85,7,2.4);
  c.restore();
  worldPrompt(c,x,y-44,title,active);
}
Camp.drawWorldMarker=function(c,cam){
  var s=state();
  if(inCamp()||!s)return;
  if(home&&s.map===home.map&&s.area===home.area&&s.floor===home.floor&&(home.area!=='tree-ascent'||(s.treeFloor||1)===(home.treeFloor||1)))
    drawMarkerAt(c,cam,home,'CAMP  [F]',Camp.isWorldCampNear());
  var r=remoteCamp();
  if(r&&sameScene(r,s)&&(s.mode==='dungeon'||s.mode==='town'))
    drawMarkerAt(c,cam,r,String(r.name||'PARTNER').toUpperCase().slice(0,14)+"'S CAMP  [F]",!!nearRemote());
};
Camp.drawScene=function(c,cam){
  var a=dimensions(),w=a.w,h=a.h,inside=room==='tent';
  c.save();c.translate(-cam.x,-cam.y);
  if(!inside)ground(c,w,h,false);
  if(!inside){
    // Biome-specific silhouettes behind the spiked enclosure.
    if(biome()==='forest'){
      pine(c,48,103,1.1);pine(c,w-47,90,1.15);pine(c,69,h-75,.8);pine(c,w-73,h-68,.72);
      for(var g=0;g<9;g++)tuft(c,53+g*51,43+(g%3)*7,1,'#6f8250');
    }else if(biome()==='plains'){
      for(var g2=0;g2<12;g2++)tuft(c,34+g2*46,63+(g2%4)*58,.9,'#9b9d62');
      rock(c,78,85,47,24);rock(c,w-83,h-60,39,20);
    }else{
      for(var g3=0;g3<9;g3++)rock(c,49+g3*56,45+(g3%2)*17,15,13);
    }
    // Tamped walkway and pebbled flagstone around the central fire.
    for(var st=0;st<8;st++)ellipse(c,w/2-3+Math.sin(st*5)*12,185+st*25,24,7,
      st%2?'rgba(114,102,77,.28)':'rgba(90,79,58,.34)');
    // Real tall sharpened wooden stakes all around. Only the south gateway is open.
    fenceSide(c,FENCE_X,FENCE_Y,w-FENCE_X,FENCE_Y,false);
    fenceSide(c,FENCE_X,FENCE_Y,FENCE_X,h-FENCE_Y,true);
    fenceSide(c,w-FENCE_X,FENCE_Y,w-FENCE_X,h-FENCE_Y,true);
    fenceSide(c,FENCE_X,h-FENCE_Y,w-FENCE_X,h-FENCE_Y,false,
      w/2-GATE_HALF,w/2+GATE_HALF);
    // Gate lintel and metal-bound posts, with a worn path leading out.
    fencePost(c,w/2-GATE_HALF,h-FENCE_Y,121,true);
    fencePost(c,w/2+GATE_HALF,h-FENCE_Y,122,true);
    line(c,[w/2-GATE_HALF,h-FENCE_Y-8,w/2-GATE_HALF,h-FENCE_Y-29],'#bb9464',3);
    line(c,[w/2+GATE_HALF,h-FENCE_Y-8,w/2+GATE_HALF,h-FENCE_Y-29],'#bb9464',3);
    path(c,[w/2-20,h-FENCE_Y,w/2+20,h-FENCE_Y,w/2+25,h-13,w/2-26,h-13],
      'rgba(151,116,72,.24)');
    // A furnished living camp.
    tent(c,w/2,h/2-65,1);
    lantern(c,w/2-97,h/2-89,true);
    cookingFire(c,w/2+126,h/2+40,1);
    stump(c,w/2-125,h/2+57);
    crate(c,w/2+76,h/2-31,27,23);crate(c,w/2+95,h/2-14,22,18);
    barrel(c,w/2-98,h/2-18);
    // Stacked wood, split logs, canvas sacks, baskets and drying herbs.
    for(var k=0;k<5;k++){
      rect(c,w/2+84+k*9,h/2+92-(k%2)*5,18,7,k%2?'#8e623a':'#513321');
      ellipse(c,w/2+99+k*9,h/2+96-(k%2)*5,4,3,'#b88d55');
    }
    shadow(c,w/2-60,h/2+85,26,10);
    path(c,[w/2-86,h/2+89,w/2-78,h/2+54,w/2-48,h/2+57,w/2-41,h/2+89],'#766248');
    path(c,[w/2-77,h/2+61,w/2-48,h/2+61,w/2-44,h/2+88,w/2-80,h/2+86],'#9e835f');
    // Drying rack: crossbar, bundled herbs and a hanging strip for future cooking.
    line(c,[w/2+156,h/2-45,w/2+154,h/2+38],'#7d5937',3);
    line(c,[w/2+212,h/2-44,w/2+210,h/2+37],'#7d5937',3);
    line(c,[w/2+154,h/2-39,w/2+211,h/2-39],'#bd9361',4);
    for(k=0;k<5;k++){
      var bx=w/2+164+k*9,by=h/2-23;
      line(c,[bx,h/2-39,bx,by],'#bba475',1);
      if(k%2){ellipse(c,bx,by+3,6,10,'#624d39');line(c,[bx-2,by,bx+3,by+10],'#a96b53',1);}
      else{tuft(c,bx,by+5,.6,'#7d9360');}
    }
    // Animated firelight on the stakes and tent canvas.
    var flick=.86+.12*Math.sin(elapsed*8)+.05*Math.sin(elapsed*13);
    glow(c,w/2+126,h/2+40,126,'rgba(249,128,37,'+(.16*flick).toFixed(3)+')');
    smoke(c,w/2+126,h/2+3,1,1);
    // Context-aware in-world prompts instead of floating decoration.
    var p=hero();
    if(p){
      var nearTent=distance(p,{x:w/2,y:h/2-65})<57;
      var nearSeat=distance(p,{x:w/2-125,y:h/2+57})<42;
      if(nearTent)worldPrompt(c,w/2,h/2-17,'F  ENTER TENT',true);
      else if(nearSeat)worldPrompt(c,w/2-125,h/2+16,'F  SIT',true);
      if(p.y>h-96&&Math.abs(p.x-w/2)<GATE_HALF+20)
        worldPrompt(c,w/2,h-77,'EXIT THROUGH GATE',true);
    }
  }else{
    drawInterior(c,w,h);
  }
  c.restore();
};

// Draw the rich scene into a 2x-resolution buffer at 20fps. The hero/HUD continue at full
// frame rate; the fire, smoke and flap animate without thousands of vector draws per frame.
var rawDrawScene=Camp.drawScene, sceneBuffer=null, sceneKey='';
Camp.drawScene=function(c,cam){
  if(typeof document==='undefined'||!document.createElement||!c.drawImage)
    return rawDrawScene(c,cam);
  var dim=dimensions(),p=hero();
  var hot='',sp0=spotNear();
  if(p&&room==='outside')hot=sp0?sp0.id:(p.y>OUT.h-96&&Math.abs(p.x-OUT.w/2)<GATE_HALF+20?'gate':'');
  else if(p&&room==='tent')hot=sp0?sp0.id:(p.y>IN.h-102&&Math.abs(p.x-IN.w/2)<70?'door':'');
  var key=room+'|'+biome()+'|'+Math.floor(elapsed*20)+'|'+hot+'|'+(visit?'v':'')+'|'+(modal==='chest'?'c':'');
  if(!sceneBuffer||sceneBuffer.width!==dim.w*2||sceneBuffer.height!==dim.h*2){
    sceneBuffer=document.createElement('canvas');
    sceneBuffer.width=dim.w*2;sceneBuffer.height=dim.h*2;
    sceneKey='';
  }
  if(sceneKey!==key){
    var bc=sceneBuffer.getContext('2d');
    if(!bc)return rawDrawScene(c,cam);
    bc.setTransform(2,0,0,2,0,0);
    bc.clearRect(0,0,dim.w,dim.h);
    rawDrawScene(bc,{x:0,y:0,w:dim.w,h:dim.h});
    sceneKey=key;
  }
  c.drawImage(sceneBuffer,-cam.x,-cam.y,dim.w,dim.h);
};
Camp.drawUI=function(c,W,H,hit){
  if(!inCamp()&&!modal)return;
  c.save();
  if(inCamp()){
    c.fillStyle='rgba(8,6,15,0.76)';c.fillRect(W/2-125,12,250,26);
    c.fillStyle='#e8d7b0';c.font='bold 14px Georgia';c.textAlign='center';
    var nm=visit?String(visit.name||'PARTNER').toUpperCase().slice(0,14)+"'S ":'';
    c.fillText(room==='tent'?(visit?nm+'TENT':'INSIDE THE TENT'):(visit?nm+'CAMPSITE':'YOUR CAMPSITE'),W/2,30);
    // Contextual action panel for mobile; matches the exact physical interaction points.
    var p=hero(), act='', callback=null, ww=136, bx=W-ww-14, by=148;
    var spN=spotNear();
    if(spN){act=spN.label;callback=function(){Camp.interact();};}
    else if(room==='tent'){act='Leave Tent';callback=goOutside;}
    if(callback){
      c.fillStyle='rgba(25,19,17,.94)';c.fillRect(bx,by,ww,34);
      c.strokeStyle='#c19d63';c.lineWidth=1.5;c.strokeRect(bx,by,ww,34);
      c.fillStyle='#efd5a5';c.font='bold 12px Georgia';c.textAlign='center';
      c.fillText(act,bx+ww/2,by+21);
      hit(bx,by,ww,34,callback);
    }
  }
  if(messageTime>0 && !modal){
    c.fillStyle='rgba(10,7,13,0.86)';c.fillRect(W/2-170,H*0.20,340,35);
    c.fillStyle='#ffe4a8';c.font='12px Georgia';c.textAlign='center';c.fillText(message.slice(0,55),W/2,H*0.20+22);
  }
  if(modal) {
    c.fillStyle='rgba(5,4,10,0.70)';c.fillRect(0,0,W,H);
    var boxW=Math.min(340,W-28),bx=(W-boxW)/2,by=H*0.31, bh=modal==='chest'?250:150;
    c.fillStyle='#1e1821';c.fillRect(bx,by,boxW,bh);
    c.strokeStyle='#d3ab6a';c.lineWidth=2;c.strokeRect(bx,by,boxW,bh);
    c.textAlign='center';c.font='bold 18px Georgia';c.fillStyle='#f7dfb9';
    if(modal!=='chest') {
      c.fillText(modal==='set'?'Set up camp here?':modal==='leave'?'Leave area?':'Pack up tent?',W/2,by+43);
      c.font='13px Georgia';c.fillStyle='#bea991';c.fillText(modal==='pack'?'No keeps your checkpoint here.':'Choose an option below or press Y / N.',W/2,by+71);
      for(var i=0;i<2;i++){
        var x=bx+20+i*(boxW-40)/2,ww=(boxW-55)/2;
        c.fillStyle=i?'#49372f':'#41634c';c.fillRect(x,by+98,ww,37);
        c.fillStyle='#fff';c.fillText(i?'No [N]':'Yes [Y]',x+ww/2,by+122);
        (function(value,x0){hit(x0,by+98,ww,37,function(){Camp.confirm(value);});})(!i,x);
      }
    } else {
      var bag=state().inventory=state().inventory||[];
      c.fillText('CAMP CHEST',W/2,by+27);c.font='12px Georgia';c.fillStyle='#c5b2a0';
      c.fillText('Tap items to transfer (your pack / stored)',W/2,by+48);
      var total=Math.max(bag.length,inventory.length),maxPage=Math.max(0,Math.ceil(total/5)-1);
      page=Math.max(0,Math.min(page,maxPage));
      for(var j=0;j<5;j++){
        var index=page*5+j,yy=by+71+j*29;
        var left=bag[index],right=inventory[index],w2=(boxW-36)/2;
        c.fillStyle='#2c2630';c.fillRect(bx+10,yy,w2,25);c.fillRect(bx+26+w2,yy,w2,25);
        c.font='11px Georgia';c.fillStyle='#f2d9b3';c.textAlign='left';
        c.fillText(left?left.name.slice(0,20):'-',bx+15,yy+17);
        c.fillText(right?right.name.slice(0,20):'-',bx+31+w2,yy+17);
        (function(n){hit(bx+10,yy,w2,25,function(){if(bag[n]&&inventory.length<40){inventory.push(bag.splice(n,1)[0]);}});})(index);
        (function(n){hit(bx+26+w2,yy,w2,25,function(){if(inventory[n]&&bag.length<40){bag.push(inventory.splice(n,1)[0]);}});})(index);
      }
      c.textAlign='center';c.fillStyle='#fff';
      c.fillText('Page '+(page+1)+' / '+(maxPage+1),W/2,by+228);
      c.fillText('Close',bx+boxW-34,by+27);
      hit(bx+boxW-68,by+8,65,30,function(){modal='';});
      hit(bx+10,by+205,75,37,function(){page=Math.max(0,page-1);});
      hit(bx+boxW-85,by+205,75,37,function(){page=Math.min(maxPage,page+1);});
      c.fillText('< Prev',bx+45,by+230);c.fillText('Next >',bx+boxW-47,by+230);
    }
  }
  c.restore();
};
})();

