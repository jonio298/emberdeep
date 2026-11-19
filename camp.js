/* Emberdeep Campsite. A temporary, explorable checkpoint tied to its source map.
 * The camp, tent, and camp chest are in-session state; no generated-world save is implied.
 */
(function () {
'use strict';
var CC = window.CC = window.CC || {};
var Camp = CC.Camp = {};
var home = null, room = '', modal = '', page = 0, inventory = [], message = '', messageTime = 0, elapsed = 0;
var OUT = {w: 560, h: 420}, IN = {w: 360, h: 270};
function state() { return CC.state; }
function hero() { return state() && state().player; }
function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
function inCamp() { return room === 'outside' || room === 'tent'; }
function dimensions() { return room === 'tent' ? IN : OUT; }
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
    if(x<27||x>IN.w-27||y<29||y>IN.h-26)return true;
    // Solid bed / chest. Approach from the central aisle to interact.
    if(x>61&&x<146&&y>91&&y<159)return true;
    if(x>225&&x<298&&y>103&&y<161)return true;
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
// In the world, the small marker also has a physically solid palisade and open south gate.
// Only its current floor is affected; save and restore the original collision method.
function installWorldFence() {
  if(!home||!home.map||typeof home.map.isSolid!=='function')return;
  var scene=home.map, original=scene.isSolid;
  home.originalSolid=original;
  scene.isSolid=function(x,y){
    if(original.call(scene,x,y))return true;
    if(!home||inCamp()||state().area!==home.area||state().floor!==home.floor)return false;
    var dx=x-home.x,dy=y-home.y;
    if(Math.abs(dy)<34 && Math.abs(dx)>29 && Math.abs(dx)<43)return true;
    if(Math.abs(dx)<43 && dy>-34 && dy<-25)return true;
    if(Math.abs(dx)<43 && dy>25 && dy<34 && Math.abs(dx)>17)return true;
    return false;
  };
}
function uninstallWorldFence() {
  if(home&&home.originalSolid&&home.map)home.map.isSolid=home.originalSolid;
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
  modal=''; note('Inside your tent - rest at the bed or store items in the chest.');
}
function enter() {
  if (!home || !hero()) return;
  goOutside(); note('Camp established. Your new respawn checkpoint.');
}
function restoreWorld() {
  if (!home) return false;
  var p=hero(), s=state();
  room = ''; modal=''; page=0;
  restoreCave();
  s.area=home.area; s.floor=home.floor; s.mode=home.mode;
  s.map=home.map; CC.Dungeon=home.dungeon;
  if (p) { p.x=home.x; p.y=home.y; }
  return true;
}
function leave(pack) {
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
  if (pack) { uninstallWorldFence(); home = null; inventory.length=0; }
  else note('Camp remains here. Return to the marker to enter.');
}
Camp.request = function() {
  if (inCamp() || !hero() || !state() || (state().mode !== 'dungeon' && state().mode !== 'town')) return;
  if (home) { note('One camp at a time. Return to your camp or pack it up.'); return; }
  modal = 'set';
};
Camp.cancel = function() { modal = ''; };
Camp.confirm = function(yes) {
  if (modal === 'set') {
    modal = '';
    if (!yes || !hero()) return;
    var s=state(), p=hero();
    home = {mode:s.mode,area:s.area,floor:s.floor,map:s.map,dungeon:CC.Dungeon,x:p.x,y:p.y,
      caveSnapshot: s.area === 'cave' ? snapshotCave(CC.Dungeon) : null};
    installWorldFence();
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
Camp.hasCamp = function(){return !!home;};
Camp.isOpen = function(){return !!modal;};
Camp.isWorldCampNear = function() {
  var s=state(), p=hero();
  return !!(home && !inCamp() && s && p && s.map===home.map && s.area===home.area &&
    distance(p,home)<54);
};
Camp.nearAction = function(){
  var p=hero();
  if (!p) return false;
  if (Camp.isWorldCampNear()) return true;
  if (room === 'outside') return distance(p,{x:OUT.w/2,y:OUT.h/2-65})<57 || distance(p,{x:OUT.w/2-125,y:OUT.h/2+57})<42;
  if (room === 'tent') return distance(p,{x:IN.w/2-75,y:IN.h/2})<48 ||
    distance(p,{x:IN.w/2+80,y:IN.h/2})<50;
  return false;
};
Camp.interact = function() {
  var p=hero();
  if (!p) return false;
  if (modal) return true;
  if (Camp.isWorldCampNear()) { enter();return true; }
  if (room==='outside') {
    if (distance(p,{x:OUT.w/2,y:OUT.h/2-65})<57) {goTent();return true;}
    if (distance(p,{x:OUT.w/2-125,y:OUT.h/2+57})<42) {
      p.x=OUT.w/2-125;p.y=OUT.h/2+84;p.campSitting=true;
      note('Resting by the fire. A quiet moment.');
    }
    return true;
  }
  if(room==='tent'){
    if(distance(p,{x:IN.w/2-75,y:IN.h/2})<48){
      p.hp=p.maxHp;p.mana=p.maxMana;
      note('Well rested - health and mana fully restored.');
    } else if(distance(p,{x:IN.w/2+80,y:IN.h/2})<50) {modal='chest';page=0;}
    return true;
  }
  return false;
};
Camp.update = function(dt) {
  elapsed+=dt;if(messageTime>0)messageTime-=dt;
  if(!inCamp()||modal)return;
  var p=hero();if(!p)return;
  var dim=dimensions();
  if(room==='outside' && p.y>dim.h-57 &&
      Math.abs(p.x-dim.w/2)<GATE_HALF-8) {
    modal='leave';
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
  if(!home||!hero())return false;
  // The generated source map is intentionally retained, so the exact checkpoint still exists.
  room='';modal='';
  var p=hero(),s=state();
  var sameWorld = s.area === home.area && s.floor === home.floor &&
    s.map === home.map && (!home.caveSnapshot || home.dungeon.floor === home.floor);
  restoreCave();
  s.area=home.area;s.floor=home.floor;s.map=home.map;s.mode=home.mode;
  CC.Dungeon=home.dungeon;
  p.x=home.x;p.y=home.y;p.hp=p.maxHp;p.mana=p.maxMana;p.invuln=2;
  if(CC.Enemies){ // reset hostile encounters near the checkpoint, not the entire map
    var E=CC.Enemies;
    if(E.list) E.list = sameWorld ?
      E.list.filter(function(e){return !e.dead && distance(e,home)>160;}) : [];
    if(E.projectiles)E.projectiles.length=0;
  }
  note('You awaken at your camp.');
  return true;
};
Camp.clear = function(){uninstallWorldFence();room='';modal='';home=null;inventory.length=0;};

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
function biome(){return home&&home.area||'cave';}

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
function tent(c,x,y,scale){
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
  c.restore();
}
function rug(c,x,y,w,h,color){
  shadow(c,x+w*.5,y+h*.65,w*.55,h*.54);
  rect(c,x,y,w,h,'#2c2725');rect(c,x+3,y+3,w-6,h-6,color);
  c.strokeStyle='#c9a979';c.lineWidth=1.5;c.strokeRect(x+7,y+6,w-14,h-12);
  for(var i=7;i<w-6;i+=9){rect(c,x+i,y-1,1,4,'#c2a374');rect(c,x+i,y+h-2,1,4,'#c2a374');}
  for(i=7;i<h-5;i+=10){rect(c,x,y+i,4,1,'#d6ab7a');rect(c,x+w-4,y+i,4,1,'#d6ab7a');}
}
function bed(c,x,y){
  shadow(c,x+44,y+54,52,18);
  rect(c,x,y+6,84,53,'#422d21');
  rect(c,x+4,y+4,76,52,'#765333');
  rect(c,x+7,y+7,70,45,'#b78769');
  rect(c,x+7,y+22,70,30,'#864952');
  path(c,[x+7,y+22,x+77,y+22,x+73,y+27,x+11,y+27],'#c78b82');
  for(var j=0;j<4;j++)line(c,[x+9+j*17,y+28,x+9+j*17,y+49],'#b7716e',1);
  for(var i=0;i<3;i++)line(c,[x+9,y+29+i*8,x+75,y+29+i*8],'#bd7f70',.7);
  rect(c,x+12,y+9,57,17,'#d5cab6');
  rect(c,x+14,y+11,53,11,'#ede4d3');
  ellipse(c,x+30,y+12,9,2,'rgba(255,255,255,.3)');
  // Curled fur blanket over the foot of the cot
  path(c,[x+7,y+44,x+77,y+43,x+75,y+53,x+9,y+54],'#665b58');
  for(i=0;i<8;i++)line(c,[x+10+i*8,y+48,x+13+i*8,y+53],'#9e8d7a',1);
  rect(c,x+3,y+4,3,58,'#9e7548');rect(c,x+79,y+4,3,58,'#9e7548');
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
function table(c,x,y){
  shadow(c,x+25,y+24,30,12);
  rect(c,x+2,y+9,6,20,'#463124');rect(c,x+43,y+9,6,20,'#463124');
  rect(c,x,y,52,20,'#785335');rect(c,x+4,y+3,44,13,'#a0774e');
  for(var i=0;i<3;i++)line(c,[x+5,y+6+i*4,x+45,y+6+i*4],'rgba(54,34,19,.32)',1);
  // Rolled map, quill and a flask
  rect(c,x+9,y+6,25,8,'#c9b494');line(c,[x+13,y+9,x+28,y+10],'#80684a',1);
  ellipse(c,x+40,y+8,4,5,'#548987');rect(c,x+38,y+2,4,3,'#b9a586');
}
function worldPrompt(c,x,y,title,active){
  c.save();c.textAlign='center';c.font='bold 9px Georgia,serif';
  var w=Math.max(58,c.measureText(title).width+14);
  rect(c,x-w/2,y-18,w,17,active?'rgba(45,34,23,0.86)':'rgba(22,19,19,.76)');
  c.strokeStyle=active?'#e0bd77':'#6c5d4c';c.lineWidth=1;c.strokeRect(x-w/2,y-18,w,17);
  c.fillStyle=active?'#ffdfa0':'#c0ad95';c.fillText(title,x,y-6);c.restore();
}
Camp.drawWorldMarker=function(c,cam){
  if(!home||inCamp()||!state()||state().map!==home.map||state().area!==home.area||
    state().floor!==home.floor)return;
  var x=home.x-cam.x,y=home.y-cam.y;
  c.save();c.translate(x,y);
  shadow(c,2,16,49,33);
  ellipse(c,0,0,43,31,'#3e3c30');
  ellipse(c,0,-2,33,22,'#514735');
  // Real mini-camp footprint, complete with sharpened perimeter and open southern gate.
  for(var i=-38;i<=38;i+=9){fencePost(c,i,-27,i+39,false);
    if(Math.abs(i)>16)fencePost(c,i,29,i+19,true);}
  for(i=-22;i<=22;i+=10){fencePost(c,-39,i,i+41,false);fencePost(c,39,i,i+42,false);}
  tent(c,-6,-4,.28);
  cookingFire(c,19,9,.32);
  ellipse(c,-24,16,7,4,'#735235');
  glow(c,19,8,16,'rgba(255,172,65,.23)');
  c.restore();
  worldPrompt(c,x,y-37,'CAMP  [F]',Camp.isWorldCampNear());
};
Camp.drawScene=function(c,cam){
  var a=dimensions(),w=a.w,h=a.h,inside=room==='tent';
  c.save();c.translate(-cam.x,-cam.y);
  ground(c,w,h,inside);
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
    // Interior silhouette: layered waxed-cloth walls over a wood-framed floor.
    shadow(c,w/2,h/2,162,113);
    path(c,[25,h-30,w/2,20,w-25,h-30],'#564739');
    path(c,[43,h-38,w/2,33,w/2,h-34],'#a98b6b');
    path(c,[w/2,33,w-43,h-38,w/2,h-34],'#6d5848');
    path(c,[64,h-40,w/2,53,w/2,h-40],'rgba(215,188,138,.14)');
    for(var seam=0;seam<5;seam++){
      var x0=58+seam*55;
      line(c,[w/2,27,x0,h-38],seam%2?'rgba(36,26,21,.48)':'rgba(222,192,145,.23)',1.4);
    }
    line(c,[w/2,25,w/2,h-31],'#a98b67',2.5);
    line(c,[45,h-40,w/2,26,w-45,h-40],'#e2c69e',2);
    // Thick tent flooring and interlaced woven carpets.
    path(c,[35,h-40,w-35,h-40,w-24,h-25,24,h-25],'#3c2c25');
    rug(c,54,166,110,69,'#703b39');
    rug(c,194,159,120,67,'#544638');
    rug(c,151,188,61,42,'#9f744b');
    // Hanging lantern and a low writing desk.
    lantern(c,w/2,73,false);
    table(c,w/2-26,85);
    // The usable cot and chest are centered on their actual interaction points.
    bed(c,63,104);
    chest(c,227,111,modal==='chest');
    // Packed leather bags, spare boots, draped cloak and gear hanging at the sides.
    shadow(c,48,202,19,7);
    path(c,[37,197,43,178,52,177,60,197],'#513c2d');
    rect(c,41,187,16,11,'#765a43');rect(c,46,183,7,4,'#bd9965');
    path(c,[27,111,47,106,51,148,31,154],'#473c42');
    line(c,[29,111,45,108,51,147],'#b39176',1);
    line(c,[303,85,315,157],'#ba9672',3);
    path(c,[307,86,323,83,324,109,312,119],'#667d59');
    for(var k2=0;k2<5;k2++){ellipse(c,307+k2*3,94+k2*4,3,5,'#a39c66');}
    // Enamel lantern glow and open doorway with folded canvas ties.
    glow(c,w/2,78,100,'rgba(255,197,106,'+(.13+.03*Math.sin(elapsed*5)).toFixed(3)+')');
    path(c,[w/2-44,h-31,w/2,h-57,w/2+44,h-31],'#261e1d');
    path(c,[w/2-42,h-30,w/2-19,h-57,w/2-25,h-30],'#92735c');
    path(c,[w/2+42,h-30,w/2+19,h-57,w/2+25,h-30],'#655144');
    line(c,[w/2-46,h-29,w/2+46,h-29],'#bf9b72',2);
    var hhero=hero();
    if(hhero){
      if(distance(hhero,{x:IN.w/2-75,y:IN.h/2})<48)worldPrompt(c,105,95,'F  REST / HEAL',true);
      if(distance(hhero,{x:IN.w/2+80,y:IN.h/2})<50)worldPrompt(c,260,94,'F  OPEN CHEST',true);
      if(hhero.y>h-102&&Math.abs(hhero.x-w/2)<70)worldPrompt(c,w/2,h-52,'EXIT TENT  ↓',true);
    }
  }
  c.restore();
};

Camp.drawUI=function(c,W,H,hit){
  if(!inCamp()&&!modal)return;
  c.save();
  if(inCamp()){
    c.fillStyle='rgba(8,6,15,0.76)';c.fillRect(W/2-125,12,250,26);
    c.fillStyle='#e8d7b0';c.font='bold 14px Georgia';c.textAlign='center';
    c.fillText(room==='tent'?'INSIDE THE TENT':'YOUR CAMPSITE',W/2,30);
    if(room==='outside'){
      var w=118,h=30;
      c.fillStyle='#56402d';c.fillRect(W-132,148,w,h);c.strokeStyle='#b89a72';c.strokeRect(W-132,148,w,h);
      c.fillStyle='#fff';c.font='12px Georgia';c.fillText('Enter tent',W-74,168);
      hit(W-132,148,w,h,goTent);
    } else {
      c.fillStyle='#56402d';c.fillRect(W-136,148,122,30);c.strokeStyle='#b89a72';c.strokeRect(W-136,148,122,30);
      c.fillStyle='#fff';c.font='12px Georgia';c.fillText('Leave tent',W-75,168);
      hit(W-136,148,122,30,goOutside);
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
