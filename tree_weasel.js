/* Emberdeep — Veyr, the Hollow Maw.
 * Unique demonic weasel guarding the eagle nest at Ancient Tree floor 5.
 * Explicit, choreographed attacks. At 72% HP he enters Rage, at 32%
 * Desperate Rage. Every attack has a readable windup and recovery.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{},E=CC.Enemies;if(!E)return;
var TAU=Math.PI*2,PI=Math.PI;
E.TYPES.weaselDemon={
 name:'Veyr, the Hollow Maw',hp:300,spd:84,dmg:21,r:19,xp:190,
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
var moves=['needlePounce','voidBite','tailScythe','demonStare','hexSpit','rootDive'];
function launch(e,attack,ang,p){
 var phase=e.weaselPhase||1,fast=phase===3?.72:phase===2?.88:1;
 e.weaselMove=attack;e.weaselAngle=ang;
 e.weaselElapsed=0;e.weaselStep=0;e.dangerous=false;
 e.state='telegraph';
 e.weaselTarget={x:p.x,y:p.y};
 var dur=attack==='needlePounce'?.55:attack==='tailScythe'?.61:
   attack==='hexSpit'?.76:attack==='voidBite'?.62:attack==='demonStare'?.9:.80;
 e.t=dur*fast;
 var length=attack==='needlePounce'?165:attack==='hexSpit'?275:attack==='demonStare'?330:116;
 var radius=attack==='tailScythe'?(phase===3?99:phase===2?84:72):52;
 e.tele=attack==='needlePounce'||attack==='hexSpit'||attack==='demonStare'?
   {kind:'line',ang:ang,len:length,max:e.t}:
   {kind:'circle',rad:radius,max:e.t};
 text(e,attack==='needlePounce'?'FANG FEINT!':
   attack==='tailScythe'?'TAIL REAPER!':
   attack==='hexSpit'?'HEX FANGS!':attack==='voidBite'?'VOID BITE!':attack==='demonStare'?'DEMON STARE!':'BENEATH YOUR FEET!',
   phase===3?'#ff5f7e':'#e2b4d6');
}
function recover(e,time){
 e.state='recover';e.t=time*(e.weaselPhase===3?.68:e.weaselPhase===2?.83:1);
 e.tele=null;e.dangerous=false;e.weaselMove='';
 e.weaselCd=(e.weaselPhase===3?.32:e.weaselPhase===2?.48:.67)+rnd()*.17;
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
 if(!e.weaselPhase){e.weaselPhase=1;e.weaselCd=.85;e.weaselCycle=0;phase=1;}
 var ratio=e.hp/Math.max(1,e.maxHp);
 if(ratio<=.32&&phase<3){rage(e,3);return;}
 if(ratio<=.72&&phase<2){rage(e,2);return;}
 if(e.weaselFx)e.weaselFx.t=Math.max(0,e.weaselFx.t-dt);
 e.weaselGlow=Math.max(0,(e.weaselGlow||0)-dt);
 e.dangerous=false;
 if(e.weaselFade===undefined)e.weaselFade=1;
 if(e.state!=='telegraph'||e.weaselMove!=='voidBite'){if(!(e.state==='act'&&e.weaselMove==='voidBite'))e.weaselFade=Math.min(1,e.weaselFade+dt*4);}
 var speed=(e.spd||67)*f*dt*(phase===3?1.55:phase===2?1.24:1),
     cx=Math.cos(ang),cy=Math.sin(ang);
 if(e.state==='rageRoar'){
   if((e.t-=dt)<=0){
     if(dist(e,p)<(phase===3?110:80)){
       damage(e,p,phase===3?.76:.42);
       push(e,p,phase===3?55:34,ang);
     }
     burst(e,phase===3?'#ee445a':'#b369de',22);
     recover(e,.82);
   }
   return;
 }
 if(e.state==='idle'){
   if(d>110)move(e,cx*speed,cy*speed);
   else if(d<58)move(e,-cx*speed*.56,-cy*speed*.56);
   else move(e,-cy*speed*.48,cx*speed*.48);
   e.weaselCd-=dt;
   if(e.weaselCd<=0&&d<330){
     var seq=phase===3?['voidBite','needlePounce','demonStare','tailScythe','voidBite','hexSpit','rootDive','needlePounce']:
       phase===2?['needlePounce','voidBite','rootDive','demonStare','tailScythe','hexSpit']:
         moves;
     launch(e,seq[(e.weaselCycle++)%seq.length],ang,p);
   }
   return;
 }
 if(e.state==='telegraph'){
   // Coiled body and glowing eyes telegraph the selected attack. No damage.
   e.t-=dt;
   if(e.weaselMove==='voidBite'&&e.t>0){e.weaselFade=clamp(e.t/(.62*(phase===3?.72:phase===2?.88:1)),0,1);return;}
   if(e.weaselMove==='demonStare'&&e.t>0){e.weaselAngle=e.weaselAngle;return;}
   if(e.t>0)return;
   e.tele=null;e.state='act';e.weaselElapsed=0;e.weaselHit=false;
   e.weaselGlow=.48;
   if(e.weaselMove==='voidBite'){
     // He melts into the shadows and tears out of them right behind the hero, jaws open.
     burst(e,'#4a2a66',16);
     var dir2=e.weaselAngle,tx2=e.weaselTarget.x+Math.cos(dir2)*42,ty2=e.weaselTarget.y+Math.sin(dir2)*42,D2=CC.Dungeon;
     if(D2&&D2.isSolid&&D2.isSolid(tx2,ty2)){tx2=e.weaselTarget.x-Math.cos(dir2)*42;ty2=e.weaselTarget.y-Math.sin(dir2)*42;}
     if(!D2||!D2.isSolid||!D2.isSolid(tx2,ty2)){e.x=tx2;e.y=ty2;}
     e.weaselAngle=Math.atan2(p.y-e.y,p.x-e.x);e.weaselFade=.15;
     burst(e,'#8a3ac0',18);text(e,'VOID BITE!','#d6a0ff');
     if(CC.fx&&CC.fx.shake)CC.fx.shake(3);
   }
   if(e.weaselMove==='demonStare'){
     // The gaze lands on anyone caught in the cone: their attacks weaken for 10 seconds.
     var toP=Math.atan2(p.y-e.y,p.x-e.x),df=Math.abs(Math.atan2(Math.sin(toP-e.weaselAngle),Math.cos(toP-e.weaselAngle)));
     if(d<340&&df<.42){p.stareT=10;text(e,'WEAKENED! -40% ATTACK','#ff8aa8');if(CC.fx&&CC.fx.flash)CC.fx.flash('#7a1030',.12);if(CC.fx&&CC.fx.shake)CC.fx.shake(4);}
   }
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
     }else if((phase>=2||e.weaselCycle%3===0)&&e.weaselStep===0){
       e.weaselStep=1;e.state='telegraph';
       e.weaselMove='returnPounce';e.weaselAngle=Math.atan2(p.y-e.y,p.x-e.x);
       e.t=phase===3?.23:phase===2?.29:.36;
       e.tele={kind:'line',ang:e.weaselAngle,len:137,max:e.t};
       text(e,'SECOND FANG!','#f2a2bb');
     }else recover(e,.62);
   }else if(attack==='returnPounce'){
     // This is a separate second commitment, so a dodge can avoid it.
     e.dangerous=true;
     move(e,Math.cos(e.weaselAngle)*(phase===3?442:377)*dt,
       Math.sin(e.weaselAngle)*(phase===3?442:377)*dt);
     collide(e,p,e.r+13,phase===3?1.25:1.05,35);
     if(elapsed>.26)recover(e,.61);
   }else if(attack==='rootDive'){
     // Purple-marked ambush emerges with a directional claw strike.
     if(elapsed<.26){
       e.dangerous=true;
       move(e,Math.cos(e.weaselAngle)*243*dt,Math.sin(e.weaselAngle)*243*dt);
       collide(e,p,e.r+15,1.18,30);
     }
     if(elapsed>.35)recover(e,.63);
   }else if(attack==='voidBite'){
     // the bite: a quick lunge through the hero with wide, snapping jaws
     e.weaselFade=Math.min(1,.15+elapsed*5);
     if(elapsed<.24){
       e.dangerous=true;
       move(e,Math.cos(e.weaselAngle)*330*dt,Math.sin(e.weaselAngle)*330*dt);
       collide(e,p,e.r+14,1.55,32);
     }
     if(elapsed>.5)recover(e,.7);
   }else if(attack==='demonStare'){
     if(elapsed>.42)recover(e,.7);
   }else if(attack==='hexSpit'){
     if(elapsed>.27)recover(e,.55);
   }else if(attack==='tailScythe'){
     if(elapsed>.31)recover(e,.57);
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
 var rage=e.weaselPhase||1,low=rage===3,moveName=e.weaselMove||'',i,k,
     lunge=(e.state==='act'&&(moveName==='needlePounce'||moveName==='returnPounce'||moveName==='voidBite'))?1:0,
     coil=(e.state==='telegraph'?Math.sin(t*30)*.10:0),
     roar=e.state==='rageRoar'?1:0,
     staring=(e.state==='telegraph'||e.state==='act')&&moveName==='demonStare',
     gape=roar?1:e.state==='telegraph'&&moveName!=='demonStare'?.55:e.state==='act'&&(moveName==='voidBite'||lunge)?1:staring?.25:.18+Math.sin(t*3)*.04,
     fade=e.weaselFade===undefined?1:e.weaselFade,
     hot=low?'#ff2348':rage===2?'#ff5a7a':'#d94cf0',
     fur0='#17101a',fur1='#2e1d2e',fur2='#4a3048',bone='#d8cbb8',flesh='#8c1a2e';
 if(fade<.02)return true;
 c.save();
 var sc=r/17*1.05;c.scale(sc,sc);c.globalAlpha=Math.max(.05,fade);
 // ground shadow and a ring of black smoke
 c.fillStyle='rgba(8,4,10,.6)';c.beginPath();c.ellipse(-3,11,30,8,0,0,TAU);c.fill();
 // possession aura: tongues of violet-black flame licking up behind him
 c.save();c.globalCompositeOperation='lighter';
 for(i=0;i<7;i++){
   var fx=-22+i*6.5,fh=14+Math.sin(t*5+i*1.7)*6+(rage-1)*4,sw=Math.sin(t*3+i)*4;
   var g=c.createLinearGradient(0,-8,0,-8-fh);g.addColorStop(0,low?'rgba(255,40,80,.34)':'rgba(150,60,200,.30)');g.addColorStop(1,'rgba(80,20,120,0)');
   c.fillStyle=g;c.beginPath();c.moveTo(fx-4,-8);c.quadraticCurveTo(fx+sw,-8-fh*.6,fx+sw*1.6,-8-fh);c.quadraticCurveTo(fx+3+sw,-8-fh*.4,fx+4,-8);c.fill();
 }
 c.restore();
 // the possessing spirit: a faint, screaming face hovering over his back
 c.save();c.globalAlpha*=.22+.1*Math.sin(t*4);c.translate(-4+Math.sin(t*2)*2,-33+Math.sin(t*3)*2);
 c.fillStyle='#cfc2ff';c.beginPath();c.ellipse(0,0,6,8,0,0,TAU);c.fill();
 c.fillStyle='#120818';c.beginPath();c.ellipse(-2.2,-1.5,1.5,2.2,0,0,TAU);c.ellipse(2.2,-1.5,1.5,2.2,0,0,TAU);c.fill();
 c.beginPath();c.ellipse(0,3.4,1.8,3.2+Math.sin(t*9)*1,0,0,TAU);c.fill();
 c.restore();
 // long barbed whip tail of bone and shadow
 var tw=Math.sin(t*6)*5;
 c.strokeStyle=fur0;c.lineWidth=7;c.lineCap='round';c.beginPath();c.moveTo(-21,-3);c.bezierCurveTo(-34,-6+tw,-38,-22,-26,-33+tw*.5);c.stroke();
 c.strokeStyle=fur2;c.lineWidth=3.2;c.beginPath();c.moveTo(-21,-3);c.bezierCurveTo(-34,-6+tw,-38,-22,-26,-33+tw*.5);c.stroke();
 for(i=1;i<6;i++){var u=i/6,bx=-21-13*Math.sin(u*2.1)-u*3,by=-3-u*30+tw*u*.5;c.fillStyle=bone;c.beginPath();c.moveTo(bx,by);c.lineTo(bx-5,by-3);c.lineTo(bx,by-1.5-i*.2);c.fill();}
 c.fillStyle=bone;c.beginPath();c.moveTo(-28,-31+tw*.5);c.lineTo(-20,-44+tw*.4);c.lineTo(-22,-31+tw*.5);c.lineTo(-14,-37+tw*.4);c.lineTo(-23,-27+tw*.5);c.closePath();c.fill();
 c.strokeStyle=hot;c.lineWidth=.8;c.globalAlpha*=.7;c.beginPath();c.moveTo(-26,-31+tw*.5);c.lineTo(-20,-43+tw*.4);c.stroke();c.globalAlpha=Math.max(.05,fade);
 // legs: two-jointed, sinewy, with long black claws
 var legs=[[-14,2,0],[-6,5,1],[10,2,1],[18,5,0]];
 for(i=0;i<4;i++){
   var lx=legs[i][0],ly=legs[i][1],ph=Math.sin(t*(lunge?18:9)+i*1.6)*3.2+(lunge?-3:0),kneeX=lx+(i<2?-6:5)+ph,kneeY=ly+7,fx2=lx+(i<2?-3:9)+ph*1.4,fy2=13;
   c.strokeStyle=legs[i][2]?fur0:fur1;c.lineWidth=4.2;c.lineJoin='round';c.beginPath();c.moveTo(lx,ly);c.lineTo(kneeX,kneeY);c.lineTo(fx2,fy2);c.stroke();
   c.strokeStyle=legs[i][2]?fur1:fur2;c.lineWidth=1.8;c.beginPath();c.moveTo(lx,ly);c.lineTo(kneeX,kneeY);c.lineTo(fx2,fy2);c.stroke();
   c.strokeStyle='#0a060c';c.lineWidth=1.7;
   for(k=0;k<3;k++){c.beginPath();c.moveTo(fx2+k*1.7-1.5,fy2);c.lineTo(fx2+k*2.4-1,fy2+5.5);c.stroke();}
 }
 // body: a long, starved ferret torso, fur patchy and torn
 var bl=lunge?7:0,bg=c.createLinearGradient(0,-18,0,8);bg.addColorStop(0,fur2);bg.addColorStop(.5,fur1);bg.addColorStop(1,fur0);
 c.fillStyle=bg;c.beginPath();c.moveTo(-23,-2);c.bezierCurveTo(-22,-14+coil*3,-6,-17,6+bl,-15);c.bezierCurveTo(16+bl,-14,20+bl,-8,17+bl,-1);c.bezierCurveTo(8,8,-12,9,-23,-2);c.fill();
 // torn flesh and exposed ribcage along the flank
 c.fillStyle=flesh;c.beginPath();c.moveTo(-14,-9);c.bezierCurveTo(-8,-13,2,-12,5,-7);c.bezierCurveTo(0,-2,-9,-3,-14,-9);c.fill();
 c.fillStyle='#35060f';c.beginPath();c.ellipse(-4,-8,6,3,.1,0,TAU);c.fill();
 c.strokeStyle=bone;c.lineWidth=1.6;
 for(i=0;i<5;i++){var rx=-12+i*4.3;c.beginPath();c.moveTo(rx,-12);c.quadraticCurveTo(rx+2.5,-8,rx+1,-3.5);c.stroke();}
 // jagged ridge of spine spikes and matted fur tufts
 for(i=0;i<9;i++){
   var sx=-21+i*3.9,sy=-12-Math.sin(i*.7)*2.4,hh=7+(i%3)*2.6+Math.sin(t*4+i)*.7;
   c.fillStyle=i%2?bone:'#a99888';c.beginPath();c.moveTo(sx-2,sy+1);c.lineTo(sx+.6+Math.sin(t*3+i)*.5,sy-hh);c.lineTo(sx+2.4,sy+1);c.fill();
 }
 for(i=0;i<12;i++){var tx3=-20+i*3.2,ty3=-3+Math.sin(i*3)*5;c.strokeStyle=i%3?fur0:fur2;c.lineWidth=1.2;c.beginPath();c.moveTo(tx3,ty3);c.lineTo(tx3-2.5,ty3+4+i%3);c.stroke();}
 // glowing cursed veins and stitches crawling across the body
 c.save();c.globalCompositeOperation='lighter';c.strokeStyle=hot;c.globalAlpha=.4+.25*Math.sin(t*7)+(rage-1)*.1;c.lineWidth=1;
 for(i=0;i<4;i++){c.beginPath();c.moveTo(-18+i*9,-12);c.bezierCurveTo(-14+i*9,-6,-20+i*9,-1,-13+i*9,4);c.stroke();}
 c.restore();
 c.strokeStyle='#0a060c';c.lineWidth=1;for(i=0;i<6;i++){c.beginPath();c.moveTo(8+i*1.6,-12+i*1.4);c.lineTo(11+i*1.6,-10.5+i*1.4);c.stroke();}
 // neck and the horned, half-skeletal head
 var hx=17+bl,hy=-12+(roar?-3:0),hs=1+roar*.08;
 c.fillStyle=fur1;c.beginPath();c.moveTo(8+bl,-15);c.quadraticCurveTo(14+bl,-21,hx+4,-18);c.lineTo(hx+4,-4);c.quadraticCurveTo(12+bl,-2,8+bl,-3);c.fill();
 c.save();c.translate(hx,hy);c.scale(hs,hs);
 // curved bone horns sweeping back
 for(i=0;i<2;i++){
   var hxx=-2+i*4.5;c.fillStyle=bone;c.beginPath();c.moveTo(hxx,-6);c.bezierCurveTo(hxx-6,-14,hxx-9,-20,hxx-4,-26-i*3);c.bezierCurveTo(hxx-3,-20,hxx-1,-13,hxx+3,-6);c.fill();
   c.strokeStyle='#8b7d6c';c.lineWidth=.7;c.beginPath();c.moveTo(hxx-1,-8);c.bezierCurveTo(hxx-5,-14,hxx-7,-19,hxx-4,-25-i*3);c.stroke();
 }
 // torn ears
 c.fillStyle=fur0;c.beginPath();c.moveTo(-3,-6);c.lineTo(-5,-15);c.lineTo(-1.5,-12);c.lineTo(1,-16);c.lineTo(3,-6);c.fill();
 // skull-like face: dark cranium, pale cracked mask over the snout
 c.fillStyle=fur0;c.beginPath();c.ellipse(1,-1,10,9,0,0,TAU);c.fill();
 c.fillStyle='#cfc4b2';c.beginPath();c.moveTo(3,-8);c.bezierCurveTo(11,-8,17,-5,24+lunge*3,-2);c.lineTo(23+lunge*3,2);c.bezierCurveTo(15,1,8,0,2,2);c.closePath();c.fill();
 c.strokeStyle='#5c4e46';c.lineWidth=.8;c.beginPath();c.moveTo(7,-7);c.lineTo(10,-2);c.lineTo(8,1);c.moveTo(14,-5);c.lineTo(16,-1);c.stroke();
 c.fillStyle='#0a060c';c.beginPath();c.ellipse(22+lunge*3,-1.4,1.6,1.3,0,0,TAU);c.fill(); // nostril
 // unhinged lower jaw: swings open, hanging fangs, a forked tongue
 var jaw=gape*.9;c.save();c.translate(5,2);c.rotate(jaw);
 c.fillStyle='#1b0710';c.beginPath();c.moveTo(0,0);c.lineTo(19+lunge*3,-1);c.lineTo(17+lunge*3,3.5);c.lineTo(1,5);c.closePath();c.fill();
 c.fillStyle=bone;for(i=0;i<6;i++){var jx=3+i*2.9;c.beginPath();c.moveTo(jx,0);c.lineTo(jx+1.2,-5-(i%2)*1.6);c.lineTo(jx+2.4,0);c.fill();}
 c.fillStyle='#b01c3a';c.beginPath();c.moveTo(4,1.6);c.quadraticCurveTo(14,3+Math.sin(t*12)*1.6,22+lunge*3,2);c.quadraticCurveTo(14,1,4,1.6);c.fill();
 c.restore();
 // upper fangs
 c.fillStyle='#fff0da';for(i=0;i<6;i++){var ux=7+i*2.9;c.beginPath();c.moveTo(ux,0.6);c.lineTo(ux+1.2,5.6+(i%3===0?2.6:0)+gape*2.4);c.lineTo(ux+2.4,0.6);c.fill();}
 // ichor drool falling from the jaw
 c.fillStyle='#2a0c18';for(i=0;i<3;i++){var dp=((t*1.6+i*.37)%1);c.beginPath();c.ellipse(12+i*4,4+dp*13+gape*4,.8,1.5+dp,0,0,TAU);c.fill();}
 // eyes: hollow sockets with burning slit pupils, and a third eye that opens on the stare
 c.fillStyle='#050207';c.beginPath();c.ellipse(5,-3,3.6,3,-.25,0,TAU);c.ellipse(11,-4.2,3,2.6,-.2,0,TAU);c.fill();
 c.save();c.shadowColor=hot;c.shadowBlur=(staring?20:low?14:9);
 var eg=staring?1.5:1;c.fillStyle=hot;c.beginPath();c.ellipse(5.4,-3,2.5*eg,1.9*eg,-.25,0,TAU);c.ellipse(11.2,-4.2,2.1*eg,1.7*eg,-.2,0,TAU);c.fill();
 c.fillStyle='#fff3d6';c.beginPath();c.ellipse(5.6,-3,.6,1.6*eg,-.25,0,TAU);c.ellipse(11.3,-4.2,.5,1.4*eg,-.2,0,TAU);c.fill();
 var third=staring?1:(low?.55:.25);c.fillStyle=hot;c.globalAlpha*=.4+.6*third;c.beginPath();c.ellipse(8,-8.4,1.5*third+.3,2.2*third+.3,0,0,TAU);c.fill();
 c.restore();
 c.restore();
 // front legs' shoulder muscle sheen and a collar of ragged chains/roots: signs of possession
 c.strokeStyle='#3a2a3c';c.lineWidth=1.4;c.beginPath();c.moveTo(8+bl,-14);c.quadraticCurveTo(10+bl,-6+Math.sin(t*5)*1.5,7+bl,0);c.stroke();
 // rage: crackling halo of cursed sparks round the body, brighter every phase
 if(rage>=2){
   c.save();c.globalCompositeOperation='lighter';c.globalAlpha=.55;c.fillStyle=hot;
   for(i=0;i<(low?10:6);i++){var a=i*1.9+t*(low?4:2.2),rad=22+(i%3)*5;c.beginPath();c.ellipse(Math.cos(a)*rad,-6+Math.sin(a)*rad*.55,1.2,2.4,a,0,TAU);c.fill();}
   c.restore();
 }
 if(roar){c.save();c.globalAlpha=.45+.28*Math.sin(t*19);c.strokeStyle=hot;c.lineWidth=2;for(i=0;i<3;i++){c.beginPath();c.arc(20,-6,25+i*9+Math.sin(t*9+i)*4,-.9,.9);c.stroke();}c.restore();}
 c.restore();
 return true;
}
// Distinct combat choreography is drawn in world-space. The root-dive marker
// shows the hero exactly where the weasel plans to emerge BEFORE the attack.
function drawFx(c,cam){
 var list=E.list||[];
 for(var i=0;i<list.length;i++){
  var e=list[i];
  if(!e||e.dead||e.type!=='weaselDemon')continue;
  var x=e.x-cam.x,y=e.y-cam.y,tt=E._time||0,phase=e.weaselPhase||1;
  c.save();
  if(e.state==='telegraph'&&e.weaselMove==='rootDive'&&e.weaselTarget){
    var tx=e.weaselTarget.x-cam.x,ty=e.weaselTarget.y-cam.y;
    var ratio=1-Math.max(0,e.t)/(e.tele&&e.tele.max||.9);
    c.globalAlpha=.38+.32*ratio;c.strokeStyle=phase===3?'#ff4a69':'#ba7ad9';
    c.lineWidth=2.5;
    c.beginPath();c.ellipse(tx,ty+5,30-ratio*8,13-ratio*3,0,0,TAU);c.stroke();
    for(var k=0;k<5;k++){
      var a=k*TAU/5+tt*.9;
      line(c,tx+Math.cos(a)*20,ty+Math.sin(a)*8+5,
        tx+Math.cos(a)*31,ty+Math.sin(a)*14+5,'#c68eec',1.2);
    }
    c.fillStyle='rgba(170,76,206,.16)';
    c.beginPath();c.ellipse(tx,ty+4,24,11,0,0,TAU);c.fill();
  }
  if(e.state==='telegraph'&&e.weaselMove==='voidBite'&&e.weaselTarget){
    var vx=e.weaselTarget.x+Math.cos(e.weaselAngle)*42-cam.x,vy=e.weaselTarget.y+Math.sin(e.weaselAngle)*42-cam.y,vr=1-Math.max(0,e.t)/(e.tele&&e.tele.max||.6);
    c.globalAlpha=.4+.4*vr;c.strokeStyle='#d08aff';c.lineWidth=2.4;c.beginPath();c.ellipse(vx,vy+5,26-vr*9,11-vr*3,0,0,TAU);c.stroke();
    c.fillStyle='rgba(70,16,110,.25)';c.beginPath();c.ellipse(vx,vy+4,22,9,0,0,TAU);c.fill();
    for(var vk=0;vk<6;vk++){var va=vk*TAU/6+tt*2;line(c,vx+Math.cos(va)*14,vy+5+Math.sin(va)*6,vx+Math.cos(va)*(24-vr*8),vy+5+Math.sin(va)*(10-vr*3),'#e0b4ff',1.3);}
  }
  if((e.state==='telegraph'||e.state==='act')&&e.weaselMove==='demonStare'){
    var sr=e.state==='act'?1:1-Math.max(0,e.t)/(e.tele&&e.tele.max||.9),sa=e.weaselAngle,hotc=phase===3?'255,40,80':'220,60,240';
    c.save();c.translate(x,y-8);c.rotate(sa);c.globalCompositeOperation='lighter';
    var sg=c.createLinearGradient(0,0,330,0);sg.addColorStop(0,'rgba('+hotc+','+(.55*sr)+')');sg.addColorStop(1,'rgba('+hotc+',0)');
    c.fillStyle=sg;c.beginPath();c.moveTo(6,-2);c.lineTo(330,-52*sr-4);c.lineTo(330,52*sr+4);c.lineTo(6,2);c.closePath();c.fill();
    c.strokeStyle='rgba(255,230,240,'+(.35+.4*sr)+')';c.lineWidth=1.2;c.beginPath();c.moveTo(6,-4);c.lineTo(330,-50*sr-4);c.moveTo(6,4);c.lineTo(330,50*sr+4);c.stroke();
    c.restore();
  }
  if(e.weaselFx&&e.weaselFx.t>0){
    var remain=e.weaselFx.t,t0=e.weaselFx.type==='desperate'?1.7:1.4,
        ratio2=1-clamp(remain/t0,0,1);
    c.globalAlpha=.58*(1-ratio2);
    c.strokeStyle=phase===3?'#ff4468':'#bd78da';c.lineWidth=2.6;
    for(k=0;k<3;k++){
      c.beginPath();c.arc(x,y,20+ratio2*(48+k*19),0,TAU);c.stroke();
    }
  }
  if(e.weaselGlow>0&&e.weaselMove==='tailScythe'){
    var power=e.weaselGlow/.48;
    c.globalAlpha=.52*power;c.strokeStyle=phase===3?'#ff516c':'#e6b5d7';
    c.lineWidth=2+power*2;
    c.beginPath();c.arc(x,y,phase===3?99:phase===2?84:72,
      -.7+tt*4,4.6+tt*4);c.stroke();
  }
  if(e.state==='act'&&
      (e.weaselMove==='needlePounce'||e.weaselMove==='returnPounce')){
    c.globalAlpha=.5;
    for(k=0;k<4;k++){
      var angle=e.weaselAngle+(k-2)*.18;
      line(c,x-Math.cos(angle)*(e.r+9),y-Math.sin(angle)*(e.r+9)+k*2,
        x-Math.cos(angle)*(e.r+25),y-Math.sin(angle)*(e.r+25)+k*3,
        phase===3?'#ff536d':'#ca91cb',1.5);
    }
  }
  c.restore();
 }
}
// the hero's DEMON STARE debuff: a weakened badge above their head while it lasts
var stareDraw=function(c,cam){
 var p=CC.state&&CC.state.player;if(!p||!(p.stareT>0))return;
 var x=p.x-cam.x,y=p.y-cam.y-(p.r||9)-26,tt=E._time||0;
 c.save();c.globalAlpha=.9;c.fillStyle='rgba(20,6,22,.78)';c.strokeStyle='#d24a80';c.lineWidth=1.2;c.beginPath();c.ellipse(x,y,17,7,0,0,TAU);c.fill();c.stroke();
 c.save();c.shadowColor='#ff3060';c.shadowBlur=6;c.fillStyle='#ff4a78';c.beginPath();c.ellipse(x-9,y,3.4,2.2,0,0,TAU);c.fill();c.restore();
 c.fillStyle='#fff';c.font='bold 8px Georgia,serif';c.textAlign='left';c.textBaseline='middle';c.fillText('-40% '+Math.ceil(p.stareT)+'s',x-3,y+.5);
 c.restore();
};
var previousKill=E._kill;
E._kill=function(e){
 var was=e&&e.type==='weaselDemon'&&!e.dead;
 var output=previousKill.apply(this,arguments);
 if(was){
   if(CC.state&&CC.state.map)CC.state.map.guardianSlain=true; // the nest can only be reached once Veyr has really fallen
   text(e,'THE HOLLOW MAW FALLS','#f6d9a2');burst(e,'#d89b98',38);
   if(CC.fx&&CC.fx.shake)CC.fx.shake(7);
 }
 return output;
};
CC.TreeWeasel={
 drawMonster:drawMonster,drawFx:function(c,cam){drawFx(c,cam);stareDraw(c,cam);},
 status:function(){
   var b=(E.list||[]).find(function(x){return x.type==='weaselDemon'&&!x.dead;});
   return b?{hp:b.hp,maxHp:b.maxHp,phase:b.weaselPhase||1,
     attack:b.weaselMove||'',state:b.state}:null;
 }
};
})(window);