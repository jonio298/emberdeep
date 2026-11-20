/* Emberdeep scarecrow horror: the crows in the straw.
 *  - nesting-crow peek and orbit at half health (the drawn peek lives in Plains.drawMonster; this controls REAL crows)
 *  - slashCrows(e, angle): 1 in 4 melee hits on the scarecrow tears 1-3 crows out of the slice (classes.js calls it)
 *  - the aerial attack: two crows grab its shoulders and hold it high up, flapping. It cannot be hit by melee up there (classes.js checks
 *    e.airborne), only by projectiles and spells. It fires one crow out of each sleeve; they swoop at you, peck, and fly back into its shirt;
 *    then it fires again. 3-5 volleys, then it drops and lands with a thud. Kill the carriers and it plummets, stunned.
 * Crows peck eyes (wounds.js blinds the hero 1.5 s on a hit).
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{},E=CC.Enemies;
if(!E)return;
var PI=Math.PI, TAU=PI*2, PEEK_TIME=1.52, ORBIT_TIME=1.55, HOVER=74;
var oldThink=E._think,oldUpdate=E.update,oldDraw=E.draw;
function alive(e){return !!(e&&!e.dead&&e.hp>0&&!e._gone);}
function R(){return Math.random();}
function crowCount(){return E.list.filter(function(v){return alive(v)&&v.type==='crow';}).length;}
function fxText(x,y,s,c,z){if(CC.fx&&CC.fx.text)CC.fx.text(x,y,s,c,z);}
function fxBurst(x,y,c,n,v){if(CC.fx&&CC.fx.burst)CC.fx.burst(x,y,c,n,v);}
function mv(e,dx,dy){var D=CC.Dungeon;if(D&&D.moveWithCollision)D.moveWithCollision(e,dx,dy);else{e.x+=dx;e.y+=dy;}}
function release(e){
 if(!e)return;
 if(e.crowHelpers)for(var i=0;i<e.crowHelpers.length;i++){var b=e.crowHelpers[i];if(b){b.carryTarget=null;b.crowOrbit=null;b.cd=.7;}}
 E.list.forEach(function(v){if(v.sleeve&&v.sleeve.owner===e){v.sleeve=null;v.cd=.5;}});
 e.crowLift=null;e.carryHeight=0;e.airborne=false;
}
function makeBirds(e){
 if(crowCount()>11)return [];
 var birds=[];
 for(var i=0;i<2;i++){
  var b=E.spawn('crow',e.x+(i?10:-10),e.y-12,e.floor||1,{awake:true});
  if(!b)continue;
  b.asleep=false;b.state='idle';b.cd=10;
  b.crowOrbit={target:e,t:0,time:ORBIT_TIME,side:i?1:-1,angle:i?Math.PI:0};
  b.crowOrigin=e.id;
  birds.push(b);
 }
 fxText(e.x,e.y-36,'THE CROWS ESCAPE!','#b9a5d0',10);fxBurst(e.x,e.y-12,'#91768c',24,100);
 return birds;
}

/* ---------- crows torn out of a slash ---------- */
function slashCrows(e,ang,p){
 if(!alive(e)||crowCount()>13)return;
 var n=1+Math.floor(R()*3),base=Number.isFinite(ang)?ang:(p?Math.atan2(e.y-p.y,e.x-p.x):R()*TAU);
 for(var i=0;i<n;i++){
  var a=base+(i-(n-1)/2)*.55+(R()-.5)*.3,b=E.spawn('crow',e.x+Math.cos(a)*6,e.y-6+Math.sin(a)*4,e.floor||1,{awake:true});
  if(!b)continue;
  b.asleep=false;b.state='idle';b.cd=.9+R()*.5;b.launch={vx:Math.cos(a)*260,vy:Math.sin(a)*200-30,t:.42};b.strafe=R()<.5?1:-1;
 }
 if(CC.Audio){CC.Audio.fx('caw',{x:e.x,y:e.y,vol:0.8,gap:60});setTimeout(function(){CC.Audio&&CC.Audio.fx('caw',{x:e.x,y:e.y,vol:0.6,gap:60});},120);}
 fxText(e.x,e.y-e.r*2.4,'CAW!','#cfc4dc',11);fxBurst(e.x,e.y-6,'#17151c',10,130);fxBurst(e.x,e.y-6,'#d8b84a',8,90);
 if(CC.fx&&CC.fx.blood)CC.fx.blood(e.x,e.y-4,3,Math.cos(base),Math.sin(base),'#3a1a0a');
}

/* ---------- the aerial attack ---------- */
function takeOff(e,p){
 if(crowCount()>15)return false;
 var birds=[];
 for(var i=0;i<2;i++){
  var b=E.spawn('crow',e.x+(i?e.r:-e.r),e.y-14,e.floor||1,{awake:true});
  if(!b)continue;
  b.asleep=false;b.state='idle';b.cd=30;b.carryTarget=e;b.carrySide=i?-1:1;birds.push(b);
 }
 if(birds.length<2){birds.forEach(function(b){b._gone=true;});return false;}
 e.crowLift={t:0,phase:'rise',pt:.5,vol:0,volleys:3+Math.floor(R()*3),wait:0};e.crowHelpers=birds;
 e.airborne=true;e.carryHeight=6;e.dormant=false;e.state='idle';e.cd=99;
 fxText(e.x,e.y-e.r*2.6,'THE CROWS LIFT IT!','#e6bc65',12);fxBurst(e.x,e.y+4,'#8a7a4a',16,110);fxBurst(e.x,e.y-8,'#17151c',10,120);
 if(CC.fx&&CC.fx.shake)CC.fx.shake(3);
 return true;
}
function fireSleeves(e,p){
 for(var i=0;i<2;i++){
  var side=i?1:-1,sx=e.x+side*e.r*1.12,sy=e.y-(e.carryHeight||0)-e.r*.9,b=E.spawn('crow',sx,sy,e.floor||1,{awake:true});
  if(!b)continue;
  b.asleep=false;b.state='idle';b.cd=30;b.xp=0;
  var jit=(R()-.5)*26;
  b.sleeve={owner:e,side:side,phase:'out',t:0,tx:p.x+jit,ty:p.y+(R()-.5)*20};
 }
 e.sleeveFlash=.3;fxBurst(e.x,e.y-(e.carryHeight||0)-e.r*.9,'#d8b84a',8,90);fxBurst(e.x,e.y-(e.carryHeight||0)-e.r*.9,'#17151c',6,110);
}
function sleeveThink(e,dt,p){
 var s=e.sleeve,o=s.owner;
 if(!alive(o)||!o.crowLift){e.sleeve=null;e.cd=.4;return;}
 s.t+=dt;e.state='idle';e.tele=null;
 var homeX=o.x,homeY=o.y-(o.carryHeight||0)-o.r*.5;
 if(s.phase==='out'){
  var dx=s.tx-e.x,dy=s.ty-e.y,d=Math.hypot(dx,dy)||1;
  mv(e,dx/d*215*dt,dy/d*215*dt);
  e.face=dx>=0?1:-1;e.dangerous=true; // the swoop: pecks anything it touches
  if(d<8||s.t>1.1){s.phase='back';s.t=0;e.dangerous=false;}
 }else{
  var bx=homeX-e.x,by=homeY-e.y,bd=Math.hypot(bx,by)||1;
  mv(e,bx/bd*270*dt,by/bd*270*dt);e.face=bx>=0?1:-1;e.dangerous=false;
  if(bd<10||s.t>2.6){ // back into the shirt
   e._gone=true;o.shirtFlash=.3;fxBurst(homeX,homeY,'#17151c',6,70);
  }
 }
 e.cd=30;
}
function airThink(e,dt,p,ang,f){
 var q=e.crowLift,birds=e.crowHelpers||[];
 q.t+=dt;e.dangerous=false;e.state='idle';e.cd=99;e.tele=null;
 if(q.phase!=='drop'&&(birds.length!==2||!alive(birds[0])||!alive(birds[1]))){ // the carriers were shot down: it plummets
  release(e);e.state='recover';e.t=1.3;e.cd=1.5;e.stunT=Math.max(e.stunT||0,1.2);
  fxText(e.x,e.y-e.r*2.4,'IT FALLS!','#ffd070',12);landFx(e,p,true);return;
 }
 var sway=Math.sin(e.anim*5.1)*2.6;
 if(q.phase==='rise'){
  e.carryHeight=HOVER*Math.min(1,1-Math.pow(1-Math.min(1,q.t/.75),2))+sway*.3;
  if(q.t>=.75){q.phase='hover';q.t=0;q.pt=.45;}
 }else if(q.phase==='hover'){
  e.carryHeight=HOVER+sway;
  var dd=Math.hypot(p.x-e.x,p.y-e.y),dr=dd>130?.55:dd<90?-.7:0; // hovers off to one side of you rather than on top of you
  mv(e,Math.cos(ang)*e.spd*f*dt*dr,Math.sin(ang)*e.spd*f*dt*dr);
  q.pt-=dt;
  var out=E.list.filter(function(v){return v.sleeve&&v.sleeve.owner===e&&alive(v);}).length;
  if(q.pt<=0&&out===0){
   if(q.vol>=q.volleys){q.phase='drop';q.t=0;fxText(e.x,e.y-e.r*3,'IT DROPS!','#ffd070',11);}
   else{q.vol++;fireSleeves(e,p);q.pt=.55;q.wait=0;}
  }else if(out>0){q.wait+=dt;if(q.wait>3.6)E.list.forEach(function(v){if(v.sleeve&&v.sleeve.owner===e)v.sleeve.phase='back';});}
 }else if(q.phase==='drop'){
  e.carryHeight=Math.max(0,HOVER*(1-Math.pow(Math.min(1,q.t/.32),2)));
  if(q.t>=.32){release(e);e.state='recover';e.t=.95;e.cd=1.6;landFx(e,p,false);}
 }
 e.sleeveFlash=Math.max(0,(e.sleeveFlash||0)-dt);e.shirtFlash=Math.max(0,(e.shirtFlash||0)-dt);
}
function landFx(e,p,fall){
 fxBurst(e.x,e.y+4,'#8a7a4a',22,150);fxBurst(e.x,e.y+4,'#d8b84a',10,110);
 if(CC.fx&&CC.fx.shake)CC.fx.shake(fall?4:7);
 E.projectiles.push({x:e.x,y:e.y,vx:0,vy:0,r:0,life:.4,ring:fall?40:58,color:'#d8b84a',fx:true});
 if(!fall&&p&&Math.hypot(p.x-e.x,p.y-e.y)<58+(p.r||8)&&CC.Classes&&CC.Classes.damage)CC.Classes.damage(p,Math.round(e.dmg*1.1)); // landing on someone hurts
}

E.update=function(dt){
 var result=oldUpdate.apply(this,arguments);
 for(var j=this.list.length-1;j>=0;j--)if(this.list[j]._gone)this.list.splice(j,1);
 if(!CC.state||(CC.state.area!=='plains'&&CC.state.area!=='rocky-pass'))return result;
 for(var i=0;i<this.list.length;i++){
  var e=this.list[i];
  if(!e||e.type!=='scarecrow')continue;
  if(!alive(e)){if(e.crowLift)release(e);e.crowHatch=null;continue;}
  var h=e.crowHatch;
  if(!h)continue;
  if(h.phase==='peek'){
   h.age+=dt;
   if(h.age>=PEEK_TIME){h.phase='orbit';h.age=0;h.birds=makeBirds(e);e.crowHelpers=h.birds;}
  }else if(h.phase==='orbit'){
   h.age+=dt;
   if(h.age>=ORBIT_TIME+.1){h.phase='done';h.age=0;}
  }else if(h.phase==='done'){
   h.age+=dt;if(h.age>1)e.crowHatch=null;
  }
 }
 return result;
};
E._think=function(e,dt,p,d,ang,f){
 if(e.type==='crow'){
  if(e.launch){ // torn out of a slash: bursts away along the cut, then joins the fight
   var L=e.launch;L.t-=dt;mv(e,L.vx*dt,L.vy*dt);L.vx*=.94;L.vy*=.94;e.dangerous=false;e.state='idle';
   if(L.t<=0)e.launch=null;
   return;
  }
  if(e.sleeve){sleeveThink.call(this,e,dt,p);return;}
  if(e.crowOrbit){
   var o=e.crowOrbit,owner=o.target;
   if(!alive(owner)){e.crowOrbit=null;e.cd=.4;return;}
   o.t+=dt;
   var fraction=Math.min(1,o.t/o.time),a=o.angle+fraction*TAU,radius=23+Math.sin(fraction*PI)*15;
   e.x=owner.x+Math.cos(a)*radius;e.y=owner.y-14+Math.sin(a)*radius*.59;
   e.dangerous=false;e.cd=6;e.state='idle';e.tele=null;
   if(fraction>=1){e.crowOrbit=null;e.cd=.7;}
   return;
  }
  if(e.carryTarget){ // gripping the scarecrow's shoulder, flapping
   var target=e.carryTarget;
   if(!alive(target)||!target.crowLift){e.carryTarget=null;e.cd=.6;return;}
   var side=e.carrySide||1;
   e.x=target.x+side*(target.r*.95)+Math.sin(e.anim*18)*1.2;
   e.y=target.y-(target.carryHeight||20)-target.r*1.4+Math.cos(e.anim*19+side)*1.8;
   e.face=-side;e.dangerous=false;e.cd=10;e.state='idle';e.tele=null;
   return;
  }
 }
 if(e.type==='scarecrow'){
  if(!e._scInit){e._scInit=1;e.maxHp=e.hp=Math.round(e.maxHp*4);e.airCd=0.7+R()*0.6;} // a tougher horror, and its first leap comes almost at once
  if(e.crowLift){airThink.call(this,e,dt,p,ang,f);return;}
  if(!e.dormant&&(e.state==='idle'||e.state==='recover')&&!(e.crowHatch&&e.crowHatch.phase==='peek')&&p){ // now and then it leaps into the air on two crows
   e.airCd=(e.airCd===undefined?1.6+R()*1.6:e.airCd)-dt;
   if(e.airCd<=0&&d<340&&e.los!==false){e.airCd=6+R()*3;if(takeOff(e,p))return;}
  }
 }
 return oldThink.apply(this,arguments);
};
E.draw=function(ctx,cam){
 var result=oldDraw.apply(this,arguments),arr=this.list||[];
 for(var i=0;i<arr.length;i++){
  var e=arr[i];if(!e||!alive(e)||e.type!=='scarecrow')continue;
  var x=e.x-cam.x,y=e.y-cam.y,h=e.carryHeight||0;
  if(x<-90||x>cam.w+90||y<-120||y>cam.h+70)continue;
  ctx.save();
  if(e.crowLift){ // talons clamped on the shoulders; a long shadow on the ground shows how high it is
   ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(x,y+e.r*.8,e.r*(1-.35*h/HOVER),e.r*.4*(1-.35*h/HOVER),0,0,TAU);ctx.fill();
   var birds=e.crowHelpers||[];
   for(var j=0;j<birds.length;j++){
    var b=birds[j];if(!alive(b))continue;
    var side=j?1:-1,sx=x+side*e.r*.8,sy=y-h-e.r*1.05,bx=b.x-cam.x,by=b.y-cam.y;
    ctx.strokeStyle='#6a5a3a';ctx.lineWidth=1.5;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(bx-1,by+4);ctx.lineTo(sx-1.5,sy);ctx.moveTo(bx+1,by+4);ctx.lineTo(sx+1.5,sy);ctx.stroke();
    ctx.strokeStyle='#d8d0b0';ctx.lineWidth=1.2; // curled claws
    ctx.beginPath();for(var c=-1;c<=1;c++){ctx.moveTo(sx+c*2,sy-1);ctx.lineTo(sx+c*2+side*1,sy+3);}ctx.stroke();
   }
  }
  if(e.sleeveFlash>0){ctx.globalAlpha=Math.min(1,e.sleeveFlash*4);ctx.fillStyle='#d8b84a';for(var k=0;k<2;k++)for(var m=0;m<6;m++)ctx.fillRect(x+(k?1:-1)*(e.r*1.12+m*2.2)-1,y-h-e.r*.9+Math.sin(m*2.4+k)*5,2,2);ctx.globalAlpha=1;}
  if(e.shirtFlash>0){ctx.globalAlpha=Math.min(1,e.shirtFlash*4);ctx.fillStyle='#17151c';for(m=0;m<5;m++)ctx.fillRect(x+(m-2)*3,y-h-e.r*.5+Math.sin(m*3)*3,2,2);ctx.globalAlpha=1;}
  ctx.restore();
 }
 return result;
};
CC.ScarecrowFlock={slashCrows:slashCrows,takeOff:takeOff,status:function(e){return e&&e.crowLift?'airborne':e&&e.crowHatch?e.crowHatch.phase:'idle';}};
})(window);
