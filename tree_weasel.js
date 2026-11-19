/* Emberdeep — Veyr, the Hollow Maw.
 * Unique demonic weasel guarding the eagle nest at Ancient Tree floor 5.
 * Explicit, choreographed attacks. At 65% HP he enters Rage, at 25%
 * Desperate Rage. Every attack has a readable windup and recovery.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{},E=CC.Enemies;if(!E)return;
var TAU=Math.PI*2,PI=Math.PI;
E.TYPES.weaselDemon={
 name:'Veyr, the Hollow Maw',hp:238,spd:67,dmg:13,r:17,xp:135,
 color:'#4d3449',blood:'#8d1c37',bone:true,w:0,min:99
};
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function rnd(){return Math.random();}
function clamp(x,lo,hi){return Math.min(hi,Math.max(lo,x));}
function oval(c,x,y,rx,ry,col){
 c.fillStyle=col;c.beginPath();c.ellipse(x,y,Math.max(.2,rx),Math.max(.2,ry),0,0,TAU);c.fill();
}
function line(c,x,y,xx,yy,col,width){
 c.strokeStyle=col;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';
 c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();
}
function text(e,msg,col){
 if(CC.fx&&CC.fx.text)CC.fx.text(e.x,e.y-e.r-24,msg,col||'#e7bdaf',12);
}
function burst(e,col,n){
 if(CC.fx&&CC.fx.burst)CC.fx.burst(e.x,e.y,col||'#ab547b',n||17,135);
}
function move(e,dx,dy){
 var D=CC.Dungeon;
 if(D&&D.moveWithCollision){
   var result=D.moveWithCollision(e,dx,dy);
   return !!(result&&(result.hitX||result.hitY));
 }
 e.x+=dx;e.y+=dy;return false;
}
function damage(e,p,scale,kind){
 if(!p||p.hp<=0)return 0;
 var result=CC.Classes&&CC.Classes.damage?
   CC.Classes.damage(p,e.dmg*scale,e):0;
 if(kind==='blight'&&result)p.slowT=Math.max(p.slowT||0,1.05);
 return result;
}
function push(e,p,amount,angle){
 if(!p||p.hp<=0)return;
 var D=CC.Dungeon,dx=Math.cos(angle)*amount,dy=Math.sin(angle)*amount;
 if(CC.movePlayer)CC.movePlayer(p,dx,dy);
 else if(D&&D.moveWithCollision)D.moveWithCollision(p,dx,dy);
 else{p.x+=dx;p.y+=dy;}
}
var moves=['needlePounce','tailScythe','hexSpit','rootDive'];
function launch(e,attack,ang,p){
 var phase=e.weaselPhase||1,fast=phase===3?.72:phase===2?.88:1;
 e.weaselMove=attack;e.weaselAngle=ang;
 e.weaselElapsed=0;e.weaselStep=0;e.dangerous=false;
 e.state='telegraph';
 e.weaselTarget={x:p.x,y:p.y};
 var dur=attack==='needlePounce'?.61:attack==='tailScythe'?.68:
   attack==='hexSpit'?.85:.95;
 e.t=dur*fast;
 var length=attack==='needlePounce'?165:attack==='hexSpit'?275:116;
 var radius=attack==='tailScythe'?(phase===3?99:phase===2?84:72):52;
 e.tele=attack==='needlePounce'||attack==='hexSpit'?
   {kind:'line',ang:ang,len:length,max:e.t}:
   {kind:'circle',rad:radius,max:e.t};
 text(e,attack==='needlePounce'?'FANG FEINT!':
   attack==='tailScythe'?'TAIL REAPER!':
   attack==='hexSpit'?'HEX FANGS!':'BENEATH YOUR FEET!',
   phase===3?'#ff5f7e':'#e2b4d6');
}
function recover(e,time){
 e.state='recover';e.t=time*(e.weaselPhase===3?.68:e.weaselPhase===2?.83:1);
 e.tele=null;e.dangerous=false;e.weaselMove='';
 e.weaselCd=(e.weaselPhase===3?.45:e.weaselPhase===2?.67:.94)+rnd()*.2;
}
function rage(e,stage){
 e.weaselPhase=stage;
 e.state='rageRoar';e.t=stage===3?.88:1.15;e.dangerous=false;
 e.weaselMove='';e.tele={kind:'circle',rad:stage===3?108:80,max:e.t};
 e.weaselFx={type:stage===3?'desperate':'rage',t:stage===3?1.7:1.4};
 e.invuln=Math.max(e.invuln||0,stage===3?.24:.35);
 text(e,stage===3?'DESPERATE BLOOD RAGE!':'THE HOLLOW MAW RAGES!',
   stage===3?'#fc5874':'#d198e7');
 burst(e,stage===3?'#ee304f':'#b25cd5',28);
 if(CC.fx&&CC.fx.shake)CC.fx.shake(stage===3?7:5);
}
function collide(e,p,reach,scale,knock){
 if(e.weaselHit)return;
 if(dist(e,p)<reach+(p.r||9)){
   e.weaselHit=true;
   if(damage(e,p,scale)&&knock){
     push(e,p,knock,Math.atan2(p.y-e.y,p.x-e.x));
     if(CC.fx&&CC.fx.shake)CC.fx.shake(3);
   }
   burst(e,'#a62f50',8);
 }
}
function volley(e,p){
 var phase=e.weaselPhase||1,count=phase===3?7:phase===2?5:3,
     base=Math.atan2(p.y-e.y,p.x-e.x);
 for(var i=0;i<count;i++){
   var ang=base+(i-(count-1)/2)*.17;
   E._shoot(e,ang,phase===3?225:185,e.dmg*.62,
     phase===3?'#fc4b7e':'#c37be8','curse',2.8);
   var shot=E.projectiles[E.projectiles.length-1];
   if(shot){shot.x=e.x+Math.cos(ang)*18;shot.y=e.y+Math.sin(ang)*18-6;}
 }
 burst(e,'#bb66d2',11);
}
var oldThink=E._think;
E._think=function(e,dt,p,d,ang,f){
 if(e.type!=='weaselDemon')return oldThink.apply(this,arguments);
 var phase=e.weaselPhase||1;
 if(!e.weaselPhase){e.weaselPhase=1;e.weaselCd=1.3;e.weaselCycle=0;phase=1;}
 var ratio=e.hp/Math.max(1,e.maxHp);
 if(ratio<=.25&&phase<3){rage(e,3);return;}
 if(ratio<=.65&&phase<2){rage(e,2);return;}
 if(e.weaselFx)e.weaselFx.t=Math.max(0,e.weaselFx.t-dt);
 e.weaselGlow=Math.max(0,(e.weaselGlow||0)-dt);
 e.dangerous=false;
 var speed=(e.spd||67)*f*dt*(phase===3?1.55:phase===2?1.24:1),
     cx=Math.cos(ang),cy=Math.sin(ang);
 if(e.state==='rageRoar'){
   if((e.t-=dt)<=0){
     if(dist(e,p)<(phase===3?110:80)){
       damage(e,p,phase===3?.76:.42);
       push(e,p,phase===3?55:34,ang);
     }
     burst(e,phase===3?'#ee445a':'#b369de',22);
     recover(e,1.1);
   }
   return;
 }
 if(e.state==='idle'){
   if(d>110)move(e,cx*speed,cy*speed);
   else if(d<58)move(e,-cx*speed*.56,-cy*speed*.56);
   else move(e,-cy*speed*.48,cx*speed*.48);
   e.weaselCd-=dt;
   if(e.weaselCd<=0&&d<330){
     var seq=phase===3?['needlePounce','tailScythe','needlePounce','hexSpit','rootDive']:
       phase===2?['needlePounce','rootDive','tailScythe','hexSpit']:
         moves;
     launch(e,seq[(e.weaselCycle++)%seq.length],ang,p);
   }
   return;
 }
 if(e.state==='telegraph'){
   // Coiled body and glowing eyes telegraph the selected attack. No damage.
   e.t-=dt;
   if(e.t>0)return;
   e.tele=null;e.state='act';e.weaselElapsed=0;e.weaselHit=false;
   e.weaselGlow=.48;
   if(e.weaselMove==='rootDive'){
     // The shadow appears under the *locked* destination during the warning.
     // Emerge just outside the hero with room to dodge the rear strike.
     var direction=e.weaselAngle+PI,offset=35;
     var tx=e.weaselTarget.x+Math.cos(direction)*offset,
         ty=e.weaselTarget.y+Math.sin(direction)*offset;
     var D=CC.Dungeon;
     if(!D||!D.isSolid||!D.isSolid(tx,ty)){e.x=tx;e.y=ty;}
     e.weaselAngle=Math.atan2(p.y-e.y,p.x-e.x);
     burst(e,'#6b4777',15);
   }
   if(e.weaselMove==='hexSpit')volley(e,p);
   if(e.weaselMove==='tailScythe'){
     var radius=phase===3?99:phase===2?84:72;
     if(dist(e,p)<radius){
       damage(e,p,phase===3?1.3:1.05,'blight');
       push(e,p,phase===3?55:36,ang);
     }
     if(CC.fx&&CC.fx.shake)CC.fx.shake(4);
     burst(e,'#b3437b',18);
   }
   return;
 }
 if(e.state==='act'){
   e.weaselElapsed+=dt;
   var elapsed=e.weaselElapsed,attack=e.weaselMove;
   if(attack==='needlePounce'){
     // Two staged moves in late phases: first pounce, visible recoil,
     // second pounce only after a fresh quick red line warning.
     var sprint=phase===3?420:phase===2?357:312,
         cutoff=phase===3?.26:.30;
     if(elapsed<cutoff){
       e.dangerous=true;
       var wall=move(e,Math.cos(e.weaselAngle)*sprint*dt,
         Math.sin(e.weaselAngle)*sprint*dt);
       collide(e,p,e.r+13,1.14,26);
       if(wall)elapsed=e.weaselElapsed=cutoff;
     }else if(phase>=2&&e.weaselStep===0){
       e.weaselStep=1;e.state='telegraph';
       e.weaselMove='returnPounce';e.weaselAngle=Math.atan2(p.y-e.y,p.x-e.x);
       e.t=phase===3?.18:.26;
       e.tele={kind:'line',ang:e.weaselAngle,len:137,max:e.t};
       text(e,'SECOND FANG!','#f2a2bb');
     }else recover(e,.73);
   }else if(attack==='returnPounce'){
     // This is a separate second commitment, so a dodge can avoid it.
     e.dangerous=true;
     move(e,Math.cos(e.weaselAngle)*(phase===3?442:377)*dt,
       Math.sin(e.weaselAngle)*(phase===3?442:377)*dt);
     collide(e,p,e.r+13,phase===3?1.25:1.05,35);
     if(elapsed>.26)recover(e,.78);
   }else if(attack==='rootDive'){
     // Purple-marked ambush emerges with a directional claw strike.
     if(elapsed<.26){
       e.dangerous=true;
       move(e,Math.cos(e.weaselAngle)*243*dt,Math.sin(e.weaselAngle)*243*dt);
       collide(e,p,e.r+15,1.18,30);
     }
     if(elapsed>.35)recover(e,.8);
   }else if(attack==='hexSpit'){
     if(elapsed>.27)recover(e,.67);
   }else if(attack==='tailScythe'){
     if(elapsed>.31)recover(e,.70);
   }else recover(e,.7);
   return;
 }
 if(e.state==='recover'){
   if((e.t-=dt)<=0){e.state='idle';e.weaselCd=Math.max(0,e.weaselCd);}
   return;
 }
 // External stuns may interrupt a move without leaving permanent telegraphs.
 if(e.state==='stunned'&&((e.t-=dt)<=0))recover(e,.65);
};
function drawMonster(c,e,r,col,dark,t){
 if(e.type!=='weaselDemon')return false;
 var rage=e.weaselPhase||1,low=rage===3,ex=e.weaselElapsed||0,
     moveName=e.weaselMove||'',
     stretch=(e.state==='act'&&(moveName==='needlePounce'||moveName==='returnPounce'))?.3:0,
     coil=(e.state==='telegraph'?Math.sin(t*30)*.10:0),
     pitch=e.state==='rageRoar'?Math.sin(t*24)*.14:0;
 c.save();
 var sc=r/17;
 c.scale(sc,sc);
 // Taut spine + rib cage + visible severed-fur silhouette.
 c.fillStyle='rgba(14,9,14,.55)';c.beginPath();
 c.ellipse(-4,10,27,8,0,0,TAU);c.fill();
 // Sickle tail, jointed, lashing with a serrated hook.
 c.strokeStyle=low?'#b52a53':'#322632';c.lineWidth=9;c.lineCap='round';
 c.beginPath();c.moveTo(-17,-1);
 c.bezierCurveTo(-29,-10+Math.sin(t*8)*5,-31,-26+Math.sin(t*6)*5,
   -17,-32+Math.sin(t*5)*3);c.stroke();
 c.strokeStyle=low?'#e24b65':'#836174';c.lineWidth=2;
 c.beginPath();c.moveTo(-29,-21,-14,-32);c.stroke();
 c.fillStyle='#c2ab99';c.beginPath();
 c.moveTo(-18,-32);c.lineTo(-12,-39);c.lineTo(-13,-29);c.closePath();c.fill();
 // Four sinewy split-toed paws; the near pair claws the ground.
 for(var i=0;i<4;i++){
   var x=i<2?-14:8,y=i%2?8:-1;
   c.fillStyle=i%2?'#2c202a':'#4a303d';
   c.beginPath();c.ellipse(x+stretch*11,y+5,6,7,
     Math.sin(t*8+i)*.2,0,TAU);c.fill();
   c.strokeStyle='#ead7c3';c.lineWidth=1.7;
   for(var k=0;k<3;k++){
     c.beginPath();c.moveTo(x+stretch*11-4+k*3,y+8);
     c.lineTo(x+stretch*11-5+k*3,y+13+(k%2));c.stroke();
   }
 }
 // Long low ferret silhouette with ragged violet-black fur.
 c.fillStyle='#2a1d2b';c.beginPath();
 c.ellipse(-3,-5,23+stretch*9,12+coil*3,pitch,0,TAU);c.fill();
 c.fillStyle='#4d3247';c.beginPath();
 c.ellipse(-2,-11,20+stretch*7,7.5,0,0,TAU);c.fill();
 for(i=0;i<13;i++){
   var xx=-20+i*3.2,yy=-13+Math.sin(i*5)*2;
   c.fillStyle=i%3?'#362536':'#745169';
   c.beginPath();c.moveTo(xx-2,yy);c.lineTo(xx+Math.sin(t*4+i)*2,yy-5-i%3);
   c.lineTo(xx+3,yy+1);c.fill();
 }
 // Exposed pale spine barbs & stitched muscle plates.
 for(i=0;i<5;i++){
   var ribX=-15+i*7;
   c.strokeStyle='#cdbab1';c.lineWidth=1.4;c.beginPath();
   c.moveTo(ribX,-2);c.quadraticCurveTo(ribX+4,4,ribX+2,7);c.stroke();
   c.fillStyle='#ba9a90';c.beginPath();
   c.moveTo(ribX,-14);c.lineTo(ribX+3,-22-(i%2)*4);
   c.lineTo(ribX+5,-12);c.fill();
 }
 // Scary long weasel snout and split jaw, unlike any bear, wolf or existing horror.
 c.fillStyle='#352234';c.beginPath();
 c.ellipse(17+stretch*8,-13,11,10,pitch,0,TAU);c.fill();
 c.fillStyle='#6a4655';c.beginPath();
 c.moveTo(18,-12);c.quadraticCurveTo(31,-12,41+stretch*8,-2);
 c.lineTo(29+stretch*8,2);c.quadraticCurveTo(23,-5,15,-6);c.fill();
 // Mouth opens during fang pounce and hex spit; teeth truly separate.
 var gape=e.state==='telegraph'?.3:e.state==='act'?.73:.20;
 c.fillStyle='#1a0717';c.beginPath();c.moveTo(21,-3);
 c.lineTo(39+stretch*8,-3);c.lineTo(34+stretch*8,gape*10);
 c.lineTo(20,gape*7);c.closePath();c.fill();
 c.fillStyle=low?'#ef3156':'#ae4779';c.beginPath();
 c.ellipse(29+stretch*7,gape*6,6,2,0,0,TAU);c.fill();
 for(i=0;i<5;i++){
   var tx=22+i*3;
   c.fillStyle='#f8e5c8';c.beginPath();c.moveTo(tx,-3);
   c.lineTo(tx+2,-3);c.lineTo(tx+1,gape*5);c.fill();
   c.beginPath();c.moveTo(tx+1,gape*8);c.lineTo(tx+3,gape*8);
   c.lineTo(tx+2,gape*4);c.fill();
 }
 oval(c,40+stretch*8,-3,3,2.5,'#0c0a10');
 // Torn tuft ears + red spectral pupils that intensify in two rage stages.
 c.fillStyle='#301e31';
 for(i=0;i<2;i++){
   var tx2=13+i*9;
   c.beginPath();c.moveTo(tx2,-18);c.lineTo(tx2+3,-29-(i%2)*4);
   c.lineTo(tx2+7,-16);c.fill();
   c.fillStyle='#a96379';
   c.beginPath();c.moveTo(tx2+2,-19);c.lineTo(tx2+3,-25);
   c.lineTo(tx2+5,-19);c.fill();c.fillStyle='#301e31';
 }
 c.save();c.shadowColor=low?'#ff1646':'#d356da';
 c.shadowBlur=low?14:rage===2?10:6;
 oval(c,23,-13,3.1,2.4,low?'#ff2348':rage===2?'#fa617e':'#df6cd4');
 oval(c,24,-13,1.2,1.1,'#fff5dc');c.restore();
 // The rage phase glows through the creature's fur as its chest heaves.
 if(rage>=2){
   c.save();c.globalAlpha=.30+Math.sin(t*11)*.12;
   c.strokeStyle=low?'#ff3655':'#be75dc';c.lineWidth=1.6;
   c.beginPath();c.ellipse(-2,-5,24+Math.sin(t*7)*2,13,0,0,TAU);c.stroke();
   for(i=0;i<6;i++){
     var a=i*1.72+t*(low?5:2),rad=18+i%2*8;
     oval(c,Math.cos(a)*rad,Math.sin(a)*rad-10,1.6,3,
       low?'#e34459':'#b16ed6');
   }
   c.restore();
 }
 if(e.state==='rageRoar'){
   c.save();c.globalAlpha=.45+.28*Math.sin(t*19);
   c.strokeStyle=low?'#f94466':'#c46fe0';c.lineWidth=2;
   for(i=0;i<3;i++){
     c.beginPath();c.arc(12,-5,25+i*9+Math.sin(t*9+i)*4,-.9,.9);c.stroke();
   }c.restore();
 }
 c.restore();
 return true;
}
var previousKill=E._kill;
E._kill=function(e){
 var was=e&&e.type==='weaselDemon'&&!e.dead;
 var output=previousKill.apply(this,arguments);
 if(was){
   text(e,'THE HOLLOW MAW FALLS','#f6d9a2');burst(e,'#d89b98',38);
   if(CC.fx&&CC.fx.shake)CC.fx.shake(7);
 }
 return output;
};
CC.TreeWeasel={
 drawMonster:drawMonster,
 status:function(){
   var b=(E.list||[]).find(function(x){return x.type==='weaselDemon'&&!x.dead;});
   return b?{hp:b.hp,maxHp:b.maxHp,phase:b.weaselPhase||1,
     attack:b.weaselMove||'',state:b.state}:null;
 }
};
})(window);