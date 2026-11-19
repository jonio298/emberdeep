/* Emberdeep Campsite. A temporary, explorable checkpoint tied to its source map.
 * The camp, tent, and camp chest are in-session state; no generated-world save is implied.
 */
(function () {
'use strict';
var CC = window.CC = window.CC || {};
var Camp = CC.Camp = {};
var home = null, returnPoint = null, room = '', modal = '', page = 0, inventory = [], message = '', messageTime = 0, elapsed = 0;
var OUT = {w: 560, h: 420}, IN = {w: 360, h: 270};
function state() { return CC.state; }
function hero() { return state() && state().player; }
function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
function inCamp() { return room === 'outside' || room === 'tent'; }
function dimensions() { return room === 'tent' ? IN : OUT; }
function floorMap() {
  return { campScene: true, isSolid: function(x,y) {
    var a = dimensions();
    return x < 36 || y < 38 || x > a.w-36 || y > a.h-36;
  }, isSolidTile: function(x,y) { return this.isSolid(x*32+16,y*32+16); },
  w: 20,h:16,spawn:{x:OUT.w/2,y:OUT.h/2} };
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
  s.area=home.area; s.floor=home.floor; s.mode=home.mode;
  s.map=home.map; CC.Dungeon=home.dungeon;
  if (p) { p.x=home.x; p.y=home.y; }
  return true;
}
function leave(pack) {
  if (!restoreWorld()) return;
  if (pack) { home = null; returnPoint = null; inventory.length=0; }
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
    home = {mode:s.mode,area:s.area,floor:s.floor,map:s.map,dungeon:CC.Dungeon,x:p.x,y:p.y};
    returnPoint={x:p.x,y:p.y};
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
  if (room === 'outside') return distance(p,{x:OUT.w/2,y:OUT.h/2-65})<57;
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
  if(room==='outside' && (p.x<53 || p.x>dim.w-53 || p.y<53 || p.y>dim.h-53)) {
    modal='leave';
  }
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
  s.area=home.area;s.floor=home.floor;s.map=home.map;s.mode=home.mode;
  CC.Dungeon=home.dungeon;
  p.x=home.x;p.y=home.y;p.hp=p.maxHp;p.mana=p.maxMana;p.invuln=2;
  if(CC.Enemies){ // reset hostile encounters near the checkpoint, not the entire map
    var E=CC.Enemies;
    if(E.list) E.list=E.list.filter(function(e){return !e.dead && distance(e,home)>160;});
    if(E.projectiles)E.projectiles.length=0;
  }
  note('You awaken at your camp.');
  return true;
};
Camp.clear = function(){room='';modal='';home=null;inventory.length=0;};
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h);}
function path(c,points,color){c.fillStyle=color;c.beginPath();c.moveTo(points[0],points[1]);for(var i=2;i<points.length;i+=2)c.lineTo(points[i],points[i+1]);c.closePath();c.fill();}
function log(c,x,y){rect(c,x-11,y-3,22,8,'#54321f');rect(c,x-9,y-6,18,5,'#91643d');}
function fire(c,x,y){
  rect(c,x-19,y+7,38,5,'#49382b');log(c,x,y+6);
  for(var k=0;k<5;k++){
    var flick=Math.sin(elapsed*7+k*2)*4;
    path(c,[x-10+k*4,y+6,x-3+k*3,y-13-flick,x+5+k*2,y+6],
      k%2?'#f6a343':'#e86131');
  }
  // cooking stand and suspended empty pot - ready for future cooking gameplay
  c.strokeStyle='#aaa59b';c.lineWidth=2;c.beginPath();c.moveTo(x-23,y-14);c.lineTo(x-18,y-30);c.lineTo(x+18,y-30);c.lineTo(x+23,y-14);c.stroke();
  rect(c,x-10,y-23,20,8,'#34363b');rect(c,x-11,y-25,22,3,'#858386');
}
function tent(c,x,y){
  path(c,[x-73,y+35,x,y-53,x+74,y+35],'#6f6251');
  path(c,[x-65,y+32,x,y-42,x,y+31],'#9b8464');
  path(c,[x,y-42,x+67,y+32,x,y+31],'#50483f');
  path(c,[x-18,y+31,x,y-11,x+21,y+31],'#19151c');
  c.strokeStyle='#cab18a';c.lineWidth=2;c.beginPath();c.moveTo(x,y-53);c.lineTo(x,y+34);c.stroke();
  rect(c,x-78,y+34,156,5,'#29211d');
}
function ground(c,w,h,inside){
  var area=home&&home.area || 'cave';
  var col=area==='forest'?'#142519':area==='plains'?'#38362b':area==='town'?'#222c27':'#161522';
  rect(c,0,0,w,h,col);
  var seed=71;
  for(var k=0;k<180;k++){
    seed=(seed*1664525+1013904223)>>>0;var x=(seed%w);
    seed=(seed*1664525+1013904223)>>>0;var y=(seed%h);
    rect(c,x,y,1+(k%3),1,inside?'#45352e':area==='forest'?'#2d4530':'#474035');
  }
  // Biome-specific darkness surrounds the camp, while the fire illuminates its center.
  var cx=w/2,cy=h/2;
  var grad=c.createRadialGradient(cx,cy,38,cx,cy,Math.max(w,h)*0.63);
  grad.addColorStop(0,'rgba(4,3,10,0)');grad.addColorStop(1,'rgba(4,3,10,0.83)');
  rect(c,0,0,w,h,grad);
}
Camp.drawWorldMarker=function(c,cam){
  if(!home||inCamp()||!state()||state().map!==home.map||state().area!==home.area)return;
  var x=home.x-cam.x,y=home.y-cam.y;
  c.save();rect(c,x-13,y-12,26,20,'#594f39');
  path(c,[x-16,y+8,x,y-22,x+16,y+8],'#b79a6b');fire(c,x+19,y+4);
  c.fillStyle='#ffe0a1';c.font='bold 10px Georgia';c.textAlign='center';c.fillText('CAMP [F]',x,y-31);c.restore();
};
Camp.drawScene=function(c,cam){
  var a=dimensions(),x=-cam.x,y=-cam.y;
  c.save();c.translate(x,y);
  ground(c,a.w,a.h,room==='tent');
  if(room==='outside'){
    // rough sharpened palisade, with a southern exit gap
    for(var side=0;side<4;side++){
      var count=side<2?17:12;
      for(var k=0;k<count;k++){
        if(side===1&&k>=7&&k<=9)continue;
        var px=side<2?34+k*(a.w-68)/(count-1):(side===2?34:a.w-34);
        var py=side<2?(side===0?34:a.h-34):34+k*(a.h-68)/(count-1);
        path(c,[px-5,py+8,px,py-13,px+5,py+8],'#62452f');
        c.strokeStyle='#3b281d';c.lineWidth=2;c.strokeRect(px-5,py+6,10,3);
      }
    }
    tent(c,a.w/2,a.h/2-65);
    fire(c,a.w/2+132,a.h/2+35);
    // stump with rounded wood grain rings
    c.fillStyle='#543522';c.beginPath();c.ellipse(a.w/2-125,a.h/2+57,23,14,0,0,Math.PI*2);c.fill();
    c.strokeStyle='#a47846';c.lineWidth=3;c.beginPath();c.ellipse(a.w/2-125,a.h/2+52,18,10,0,0,Math.PI*2);c.stroke();
    rect(c,a.w/2-125,a.h/2+60,35,14,'#4c301f');
  } else {
    // tent interior: fabric walls, quilted bed on left, storage chest on right.
    path(c,[30,a.h-35,a.w/2,28,a.w-30,a.h-35],'#695849');
    path(c,[55,a.h-42,a.w/2,50,a.w/2,a.h-42],'#987d65');
    path(c,[a.w/2,50,a.w-55,a.h-42,a.w/2,a.h-42],'#4d4039');
    rect(c,a.w/2-115,a.h/2-15,78,55,'#493321');rect(c,a.w/2-110,a.h/2-11,68,47,'#a46a69');
    rect(c,a.w/2-105,a.h/2-7,58,15,'#d9d4b8');
    rect(c,a.w/2+48,a.h/2-12,66,46,'#493322');rect(c,a.w/2+50,a.h/2-9,62,15,'#ad7b42');
    rect(c,a.w/2+75,a.h/2-11,6,43,'#d1ae6a');rect(c,a.w/2+50,a.h/2+15,62,5,'#28211b');
    rect(c,a.w/2-64,a.h-33,128,10,'#251b19');
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
