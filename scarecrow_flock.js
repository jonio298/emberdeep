/* Emberdeep scarecrow horror: nesting-crow peek, full orbit and two-crow aerial carry.
 * The drawn peeking sequence lives in Plains.drawMonster; this controls REAL crows.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{},E=CC.Enemies;
if(!E)return;
var TAU=Math.PI*2, PEEK_TIME=1.52, ORBIT_TIME=1.55, CARRY_TIME=4.25;
var oldThink=E._think,oldUpdate=E.update,oldDraw=E.draw;
function alive(e){return !!(e&&!e.dead&&e.hp>0);}
function release(e){
 if(!e)return;
 if(e.crowHelpers)for(var i=0;i<e.crowHelpers.length;i++){
  var b=e.crowHelpers[i];if(b){b.carryTarget=null;b.crowOrbit=null;b.cd=.7;}
 }
 e.crowLift=null;e.carryHeight=0;
}
function makeBirds(e){
 var aliveBirds=E.list.filter(function(v){return alive(v)&&v.type==='crow';}).length;
 if(aliveBirds>11)return [];
 var birds=[];
 for(var i=0;i<2;i++){
  var b=E.spawn('crow',e.x+(i?10:-10),e.y-12,e.floor||1,{awake:true});
  if(!b)continue;
  b.asleep=false;b.state='idle';b.cd=10;
  b.crowOrbit={target:e,t:0,time:ORBIT_TIME,side:i?1:-1,angle:i?Math.PI:0};
  b.crowOrigin=e.id;
  birds.push(b);
 }
 if(CC.fx){if(CC.fx.text)CC.fx.text(e.x,e.y-36,'THE CROWS ESCAPE!','#b9a5d0',10);
  if(CC.fx.burst)CC.fx.burst(e.x,e.y-12,'#91768c',24,100);}
 return birds;
}
function lift(e,birds){
 if(!alive(e)||birds.length!==2||!alive(birds[0])||!alive(birds[1]))return;
 e.crowLift={t:0,fire:.55,duration:CARRY_TIME};e.crowHelpers=birds;e.carryHeight=14;
 e.dormant=false;e.state='idle';e.cd=CARRY_TIME+1;
 for(var i=0;i<2;i++){
  birds[i].crowOrbit=null;birds[i].carryTarget=e;birds[i].carrySide=i?-1:1;
  birds[i].state='idle';birds[i].cd=8;
 }
 if(CC.fx){if(CC.fx.text)CC.fx.text(e.x,e.y-43,'THE FLOCK LIFTS IT!','#e6bc65',12);
  if(CC.fx.burst)CC.fx.burst(e.x,e.y-18,'#b4a078',15,90);}
}
E.update=function(dt){
 var result=oldUpdate.apply(this,arguments);
 if(!CC.state||CC.state.area!=='plains')return result;
 for(var i=0;i<this.list.length;i++){
  var e=this.list[i];
  if(!e||e.type!=='scarecrow')continue;
  if(!alive(e)){if(e.crowLift)release(e);e.crowHatch=null;continue;}
  var h=e.crowHatch;
  if(!h)continue;
  if(h.phase==='peek'){
   h.age+=dt;
   if(h.age>=PEEK_TIME){
    h.phase='orbit';h.age=0;h.birds=makeBirds(e);
    e.crowHelpers=h.birds;
   }
  }else if(h.phase==='orbit'){
   h.age+=dt;
   if(h.age>=ORBIT_TIME+.1){
    var b=h.birds.filter(alive);
    // The two birds can grip and hoist their original scarecrow after one full circle.
    if(b.length===2&&Math.random()<.64)lift(e,b);
    h.phase='done';h.age=0;
   }
  }else if(h.phase==='done'){
   h.age+=dt;
   if(h.age>1)e.crowHatch=null;
  }
 }
 return result;
};
E._think=function(e,dt,p,d,ang,f){
 if(e.type==='crow'&&e.crowOrbit){
  var o=e.crowOrbit,owner=o.target;
  if(!alive(owner)){e.crowOrbit=null;e.cd=.4;return;}
  o.t+=dt;
  var fraction=Math.min(1,o.t/o.time);
  var a=o.angle+fraction*TAU, radius=23+Math.sin(fraction*PI)*15;
  e.x=owner.x+Math.cos(a)*radius;
  e.y=owner.y-14+Math.sin(a)*radius*.59;
  e.dangerous=false;e.cd=6;e.state='idle';e.tele=null;
  if(fraction>=1){e.crowOrbit=null;e.cd=.7;}
  return;
 }
 if(e.type==='crow'&&e.carryTarget){
  var target=e.carryTarget;
  if(!alive(target)||!target.crowLift){e.carryTarget=null;e.cd=.6;return;}
  var side=e.carrySide||1;
  e.x=target.x+side*(target.r*1.25+5)+Math.sin(e.anim*18)*1.4;
  e.y=target.y-(target.carryHeight||20)-target.r*1.8+Math.cos(e.anim*19+side)*2.2;
  e.dangerous=false;e.cd=10;e.state='idle';e.tele=null;
  return;
 }
 if(e.type==='scarecrow'&&e.crowLift){
  var q=e.crowLift;q.t+=dt;q.fire-=dt;
  var birds=e.crowHelpers||[];
  if(q.t>=q.duration||birds.length!==2||!alive(birds[0])||!alive(birds[1])){
   release(e);e.state='recover';e.t=.75;e.cd=1.2;return;
  }
  var sway=Math.sin(e.anim*5.1)*2.8;
  e.carryHeight=Math.min(23,14+q.t*3)+sway;
  // A slow aerial procession that can be dodged, still respects collisions.
  var vx=Math.cos(ang)*e.spd*f*dt*.62,vy=Math.sin(ang)*e.spd*f*dt*.62;
  if(CC.Dungeon&&CC.Dungeon.moveWithCollision)CC.Dungeon.moveWithCollision(e,vx,vy);
  else {
   var nx=e.x+vx,ny=e.y+vy;
   if(!CC.Dungeon||!CC.Dungeon.isSolid||!CC.Dungeon.isSolid(nx,ny)){e.x=nx;e.y=ny;}
  }
  if(q.fire<=0){
   q.fire=.74+.12*Math.random();
   var a=Math.atan2(p.y-e.y,p.x-e.x);
   for(var i=0;i<2;i++){
    this._shoot(e,a+(i?-.17:.17),185,e.dmg*.46,'#ecc94e','corn',2.2);
    var shot=this.projectiles[this.projectiles.length-1];
    if(shot){shot.x=e.x+(i?-e.r*1.20:e.r*1.20);shot.y=e.y-e.carryHeight-e.r*.72;}
   }
   e.cornFlash=.24;
   if(CC.fx&&CC.fx.burst)CC.fx.burst(e.x,e.y-e.carryHeight,'#e9c55e',6,50);
  }
  e.cornFlash=Math.max(0,(e.cornFlash||0)-dt);
  e.dangerous=false;e.state='idle';e.cd=4;e.tele=null;
  return;
 }
 return oldThink.apply(this,arguments);
};
E.draw=function(ctx,cam){
 var result=oldDraw.apply(this,arguments);
 var arr=this.list||[];
 // Wing-beats and taut straw ropes make the pickup readable even at mobile scale.
 for(var i=0;i<arr.length;i++){
  var e=arr[i];if(!e||!alive(e)||!e.crowLift)continue;
  var x=e.x-cam.x,y=e.y-cam.y,h=e.carryHeight||18,birds=e.crowHelpers||[];
  if(x< -80||x>cam.w+80||y< -90||y>cam.h+70)continue;
  ctx.save();
  ctx.strokeStyle='#d1ad6a';ctx.lineWidth=1.6;ctx.lineCap='round';
  for(var j=0;j<birds.length;j++){
   var b=birds[j];if(!alive(b))continue;
   ctx.beginPath();ctx.moveTo(b.x-cam.x,b.y-cam.y+3);
   ctx.lineTo(x+(j?e.r*1.20:-e.r*1.20),y-h-e.r*.96);ctx.stroke();
   ctx.strokeStyle='#eee0c8';ctx.beginPath();
   ctx.moveTo(b.x-cam.x-2,b.y-cam.y+2);ctx.lineTo(b.x-cam.x,b.y-cam.y+6);
   ctx.lineTo(b.x-cam.x+2,b.y-cam.y+2);ctx.stroke();
   ctx.strokeStyle='#d1ad6a';
  }
  if(e.cornFlash>0){
   ctx.globalAlpha=Math.min(.75,e.cornFlash*3);
   ctx.fillStyle='#f3c64c';
   for(j=0;j<7;j++)ctx.fillRect(x+(j-3)*4,y-h+Math.sin(j*2.4)*7,2,2);
  }
  ctx.restore();
 }
 for(var k=0;k<this.projectiles.length;k++){
  var shot=this.projectiles[k];if(!shot||shot.kind!=='corn')continue;
  var sx=shot.x-cam.x,sy=shot.y-cam.y;
  if(sx< -15||sx>cam.w+15||sy< -15||sy>cam.h+15)continue;
  ctx.save();ctx.translate(sx,sy);ctx.rotate(Math.atan2(shot.vy,shot.vx));
  ctx.fillStyle='#ebc542';ctx.beginPath();ctx.ellipse(0,0,6,3,0,0,TAU);ctx.fill();
  ctx.strokeStyle='#fff0ac';ctx.lineWidth=1;
  for(var j=0;j<3;j++){ctx.beginPath();ctx.moveTo(-2+j*2,-2);ctx.lineTo(-2+j*2,2);ctx.stroke();}
  ctx.fillStyle='#6d8c3b';ctx.beginPath();ctx.moveTo(-5,-1);ctx.lineTo(-10,-5);
  ctx.lineTo(-7,2);ctx.closePath();ctx.fill();ctx.restore();
 }
 return result;
};
CC.ScarecrowFlock={status:function(e){return e&&e.crowLift?'carried':e&&e.crowHatch?e.crowHatch.phase:'idle';}};
})(window);