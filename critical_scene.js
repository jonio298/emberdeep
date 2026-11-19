/* Emberdeep: four class-specific critical cinematics and charged projectiles.
 * Visual multi-hit beats NEVER reapply gameplay damage. All camera/HUD transforms
 * remain controlled by main.js; this module only paints and reports smooth zoom.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{}, TAU=Math.PI*2, now=0, active=null, queue=[];
var reduced=!!(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches);
var LENGTHS={swordsman:.73,thief:.59,wizard:.67,necromancer:.73};
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t);}
function L(){return active?active.duration:.65;}
function envelope(){
 if(!active)return 0;
 return smooth(now/.13)*smooth((L()-now)/.23);
}
function heroKind(o){
 var v=o.heroClass|| (o.kind==='slash'?'swordsman':'wizard');
 return LENGTHS[v]?v:(o.kind==='slash'?'swordsman':'wizard');
}
function trigger(hit){
 if(!hit||!isFinite(hit.x)||!isFinite(hit.y)||['slash','projectile'].indexOf(hit.kind)<0)return false;
 if(!(CC.state&&CC.state.mode==='dungeon'))return false;
 var id=heroKind(hit),o={
   kind:hit.kind,heroClass:id,
   x:hit.x,y:hit.y,sourceX:Number.isFinite(hit.sourceX)?hit.sourceX:hit.x-30,
   sourceY:Number.isFinite(hit.sourceY)?hit.sourceY:hit.y,
   angle:hit.angle||0,r:clamp(hit.r||10,5,30),
   color:hit.color||'#f0e0d2',damage:hit.damage||0,duration:LENGTHS[id]
 };
 if(!active){active=o;now=0;}
 else if(queue.length<5)queue.push(o);
 return true;
}
function update(dt){
 if(!active)return;
 now+=clamp(dt||0,0,.12);
 if(now>=active.duration){active=queue.shift()||null;now=0;}
}
function reset(){active=null;queue.length=0;now=0;}
function view(){
 if(!active)return null;
 var k=reduced?0:envelope();
 return {x:active.x,y:active.y,scale:1+.47*k,blend:k};
}
function rate(){return active&&!reduced?1-.76*envelope():1;}
function stroke(c,x1,y1,x2,y2,color,width){
 c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();
}
function circle(c,x,y,r,color){
 c.fillStyle=color;c.beginPath();c.arc(x,y,Math.max(.1,r),0,TAU);c.fill();
}
function oval(c,x,y,rx,ry,color){
 c.fillStyle=color;c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);c.fill();
}
function arc(c,x,y,r,a,b,color,width){
 c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(x,y,r,a,b);c.stroke();
}
function glow(c,x,y,r,color){
 var g=c.createRadialGradient(x,y,1,x,y,Math.max(2,r));
 g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
}
function diamond(c,x,y,size,col){
 c.fillStyle=col;c.beginPath();c.moveTo(x,y-size);c.lineTo(x+size,y);
 c.lineTo(x,y+size);c.lineTo(x-size,y);c.closePath();c.fill();
}
function hitBurst(c,ox,oy,index,red){
 c.save();c.translate(ox,oy);
 var power=smooth(index),i;
 glow(c,0,0,20+power*17,red?'rgba(255,72,89,.65)':'rgba(255,246,207,.55)');
 circle(c,0,0,3+power*4,red?'#ffe3dc':'#f7f9ff');
 for(i=0;i<13;i++){
   var a=i*2.4,rr=power*(9+(i%5)*5);
   var xx=Math.cos(a)*rr,yy=Math.sin(a)*rr;
   stroke(c,xx,yy,xx+Math.cos(a)*(2+power*7),yy+Math.sin(a)*(2+power*7),
     red?(i%3?'#da2741':'#f7b29c'):'#c2e3ff',i%3===0?2:1);
 }
 c.restore();
}
function swordPose(c,id,range,brace,thrust,pull){
 // This is an animated miniature of the Swordsman bracing his boots and shoulders,
 // then stabbing through the target and visibly pulling the weapon free.
 var right=range>0?1:-1;
 c.save();c.scale(right,1);
 oval(c,-33,15,23,4,'rgba(0,0,0,.42)');
 // boots plant wider during brace
 stroke(c,-40,6,-47,15,'#493a31',6);
 stroke(c,-30,6,-25-brace*5,15,'#6e5340',6);
 stroke(c,-47,15,-54,15,'#c9a36e',2);
 stroke(c,-26-brace*5,15,-20-brace*5,15,'#b58b59',2);
 // trailing short red cloak and leather-plate
 c.fillStyle='#6c2532';c.beginPath();c.moveTo(-37,-27);
 c.lineTo(-58-brace*7,-23);c.lineTo(-62+thrust*8,8);
 c.lineTo(-35,3);c.closePath();c.fill();
 oval(c,-34-thrust*6,-6,10,18,'#38454a');
 oval(c,-34-thrust*6,-10,9,13,'#79858c');
 stroke(c,-40-thrust*6,-17,-33-thrust*6,0,'#c0b9ab',2);
 circle(c,-37-thrust*6,-30,7,'#d4ac87');
 // deliberate backwards lean, then forward driving shoulder
 stroke(c,-35-thrust*6,-23,-22+thrust*18-pull*3,-15,'#8c9091',7);
 oval(c,-22+thrust*18-pull*3,-15,5.4,4.8,'#d6b38e');
 // Blade is visibly sheathed BACK in brace, thrust INTO enemy, and withdrawn.
 var bladeBase=-16+thrust*19-pull*14,bladeEnd=bladeBase+24+thrust*25-pull*18;
 stroke(c,bladeBase,-14,bladeEnd,-14,'#455664',5);
 stroke(c,bladeBase+4,-15,bladeEnd,-15,'#f3f5e7',2.5);
 stroke(c,bladeBase+1,-20,bladeBase+1,-8,'#dbb579',3);
 c.restore();
}
function swordsman(c,o,t){
 var phase=t<.12?'brace':t<.29?'stab':t<.37?'lodged':t<.54?'withdraw':'fade';
 var brace=smooth(t/.12),thrust=smooth((t-.12)/.16);
 var pull=smooth((t-.37)/.16);
 var dir=Math.cos(o.angle)>=0?1:-1;
 c.save();c.rotate(o.angle);
 // Hero leans in from the source side, zoom stays centered on the enemy itself.
 swordPose(c,'swordsman',dir,brace,thrust,pull);
 if(t>.15&&t<.57){
   var penetration=clamp((t-.15)/.14,0,1)*(1-smooth((t-.4)/.14));
   stroke(c,-14,-4,19+penetration*12,-4,'#e8e0d1',2.5);
   stroke(c,-12,-2,12+penetration*8,-2,'#9b112c',4);
   if(t>.185&&t<.34)hitBurst(c,6,0,(t-.185)/.085,true);
   if(t>.415&&t<.57)hitBurst(c,-3,-1,(t-.415)/.085,true);
   for(var i=0;i<12;i++){
     var age=t-.20-i*.012,prog=clamp(age/.35,0,1);
     if(age<0)continue;
     circle(c,Math.sin(i*11.7)*13+prog*(i-6)*2,
       Math.cos(i*7.5)*3+prog*prog*(12+i),1+(i%3)*.45,
       i%3===0?'#eb5164':'#8a1128');
   }
 }
 // hit #1 at penetration, hit #2 on withdrawal: PURE PRESENTATION.
 c.restore();
}
function thief(c,o,t){
 c.save();
 var offsets=[-.92,.64,-.33],centers=[.15,.25,.35],angles=[-.82,.80,-.26];
 for(var i=0;i<3;i++){
   var age=t-centers[i],duration=.18,progress=clamp(age/duration,0,1);
   if(age<-.045||age>.24)continue;
   var fade=smooth((age+.045)/.06)*smooth((duration-age)/.09);
   c.save();c.rotate(o.angle+angles[i]);
   c.globalAlpha=fade;
   var x1=-30+progress*25,x2=28+progress*9,oy=(i-1)*4;
   c.shadowColor='#d31b34';c.shadowBlur=9;
   stroke(c,x1,oy-14,x2,oy+13,'#861127',7);
   stroke(c,x1-2,oy-17,x2+1,oy+10,'#f44355',3);
   c.shadowBlur=0;
   stroke(c,x1-3,oy-19,x2+2,oy+8,'#ffd5d7',1.2);
   c.restore();
   if(age>.025&&age<.15)hitBurst(c,(i-1)*5,(i-1)*4,(age-.025)/.055,true);
 }
 // nimble, semi-transparent thief afterimages dash through the target
 for(var j=0;j<3;j++){
   var pos=smooth((t-(.09+j*.065))/.14);
   if(t<.07+j*.065||t>.38+j*.065)continue;
   c.save();c.globalAlpha=(1-pos)*.35;c.translate(-29+pos*54,(j-1)*9);
   c.fillStyle='#401829';c.beginPath();c.moveTo(-7,-7);
   c.lineTo(0,-21);c.lineTo(8,-8);c.lineTo(5,13);c.lineTo(-7,10);c.fill();
   c.fillStyle='#f04459';c.fillRect(0,-11,3,2);
   c.restore();
 }
 c.restore();
}
function lightning(c,cx,cy,r,progress){
 c.save();c.lineCap='round';
 for(var j=0;j<9;j++){
   var a=j*TAU/9+progress*.25,prevX=cx,prevY=cy;
   for(var seg=1;seg<=4;seg++){
     var rr=r*(seg/4)*(0.65+progress*.56),off=Math.sin(seg*11.8+j*9)*r*.08;
     var xx=cx+Math.cos(a)*rr+Math.cos(a+TAU/4)*off;
     var yy=cy+Math.sin(a)*rr+Math.sin(a+TAU/4)*off;
     stroke(c,prevX,prevY,xx,yy,'#2488ff',3);
     stroke(c,prevX,prevY,xx,yy,j%3?'#b9efff':'#ffffff',1.15);
     prevX=xx;prevY=yy;
   }
 }
 c.restore();
}
function wizard(c,o,t){
 var power=smooth((t-.13)/.24),ret=smooth((o.duration-t)/.2);
 c.save();
 // A bloom of cool arcane blue, shock rings and crackling radial lightning.
 glow(c,0,0,25+power*65,'rgba(48,153,255,.66)');
 glow(c,0,0,10+power*27,'rgba(225,252,255,.86)');
 if(t<.22){
   for(var k=0;k<5;k++){var a=k*TAU/5+t*7;
     diamond(c,Math.cos(a)*17,Math.sin(a)*17,2.6,'#9beaff');
   }
 }
 c.globalAlpha=ret;
 if(t>.15){
   arc(c,0,0,14+power*71,0,TAU,'#70d6ff',3*(1-power)+.8);
   arc(c,0,0,8+power*47,0,TAU,'rgba(225,251,255,.7)',1.2);
   lightning(c,0,0,14+power*72,power);
   for(k=0;k<24;k++){
     var th=k*2.4,rv=power*(21+(k%7)*7);
     circle(c,Math.cos(th)*rv,Math.sin(th)*rv,1.2+k%3*.5,
       k%3===0?'#f5ffff':k%2?'#9bdcf8':'#397df5');
   }
 }
 c.restore();
}
function skull(c,x,y,s){
 c.save();c.translate(x,y);c.scale(s,s);
 oval(c,0,0,8,9,'#a9f0be');
 oval(c,-3,-1,2.3,3,'#190e2e');oval(c,3,-1,2.3,3,'#190e2e');
 c.fillStyle='#bcf6ce';c.fillRect(-4,5,8,3);
 stroke(c,-3,7,-3,9,'#1f2330',1);
 stroke(c,0,7,0,9,'#1f2330',1);
 stroke(c,3,7,3,9,'#1f2330',1);
 c.restore();
}
function necromancer(c,o,t){
 var shock=smooth((t-.15)/.33),ret=smooth((o.duration-t)/.23);
 c.save();
 glow(c,0,0,29+shock*66,'rgba(129,53,202,.67)');
 glow(c,0,0,11+shock*33,'rgba(164,237,165,.45)');
 c.globalAlpha=ret;
 if(t>.10){
   // A rune ring turns backward; pale souls spin outward then pull toward center.
   for(var k=0;k<8;k++){
     var th=k*TAU/8-t*5,r=12+shock*52,xx=Math.cos(th)*r,yy=Math.sin(th)*r;
     diamond(c,xx,yy,4+shock*2,k%2?'#83eba1':'#b779f5');
   }
   arc(c,0,0,13+shock*58,0,TAU,'#b879f2',2.5);
   arc(c,0,0,5+shock*44,0,TAU,'rgba(136,234,172,.78)',1.3);
   for(k=0;k<5;k++){
     var wa=k*TAU/5+t*6;
     var distance=(1-shock)*29+shock*46;
     var px=Math.cos(wa)*distance,py=Math.sin(wa)*distance*.78;
     c.globalAlpha=ret*(.5+.4*Math.sin(t*12+k)*Math.sin(t*12+k));
     skull(c,px,py,.45+shock*.35);
     stroke(c,px,py,px-9+Math.sin(t*12+k)*8,py-11,'#83e8af',1.4);
   }
   c.globalAlpha=ret;
 }
 // Cracked curse seal at point of impact, unlike Wizard's electricity.
 if(t>.20)for(k=0;k<9;k++){
   var a=k*2.399;var length=shock*(24+k%4*10);
   stroke(c,Math.cos(a)*6,Math.sin(a)*6,
     Math.cos(a)*length,Math.sin(a)*length,'#4f1a81',4);
   stroke(c,Math.cos(a)*7,Math.sin(a)*7,
     Math.cos(a)*length,Math.sin(a)*length,k%2?'#d68bfa':'#81f1a5',1.4);
 }
 c.restore();
}
function drawWorld(c,cam){
 if(!active)return;
 var o=active,t=now,fade=smooth(t/.055)*smooth((o.duration-t)/.12);
 if(fade<.003)return;
 var x=o.x-cam.x,y=o.y-cam.y;
 c.save();c.translate(x,y);c.globalAlpha=fade;
 if(o.heroClass==='swordsman')swordsman(c,o,t);
 else if(o.heroClass==='thief')thief(c,o,t);
 else if(o.heroClass==='necromancer')necromancer(c,o,t);
 else wizard(c,o,t);
 c.restore();
}
function drawScreen(c,W,H){
 if(!active)return;
 var e=envelope(),t=now,fade=smooth(t/.11)*smooth((active.duration-t)/.20);
 if(fade<.003)return;
 c.save();
 c.globalAlpha=reduced?.08*fade:.11*e;
 c.fillStyle=active.kind==='slash'?'#a52a42':'#193e68';
 c.fillRect(0,0,W,H);
 if(!reduced){
   var h=11*e;
   c.globalAlpha=.64*e;c.fillStyle='#05050a';
   c.fillRect(0,0,W,h);c.fillRect(0,H-h,W,h);
 }
 // Red, clear and readable over every class's impact. Not gold or yellow.
 var scale=Math.min(1,W/340),textY=Math.max(42,H*.19);
 c.globalAlpha=fade;
 c.textAlign='center';c.textBaseline='middle';
 c.font='bold '+Math.round(22*scale)+'px Georgia,serif';
 c.shadowColor='#27020b';c.shadowBlur=10;
 c.lineWidth=3.8;c.strokeStyle='#2a0712';
 c.strokeText('CRITICAL HIT',W/2,textY);
 c.fillStyle='#ff334e';c.fillText('CRITICAL HIT',W/2,textY);
 c.shadowBlur=0;
 c.restore();
}
// Projectile render is called before impact. Glowing ground pool moves with the orb.
function drawProjectile(c,s,cam){
 if(!s||!s.preRolledCrit)return;
 var x=s.x-cam.x,y=s.y-cam.y,age=s.critAge||0,ang=s.a||0;
 var necro=s.critHero==='necromancer',glowColor=necro?'#ad70ff':'#5bcaff',
   highlight=necro?'#94f0aa':'#e9fdff';
 c.save();
 // Light pools below the shot, tightly following its shadow on the terrain.
 var floorY=y+10;
 var gr=c.createRadialGradient(x,floorY,0,x,floorY,29);
 gr.addColorStop(0,necro?'rgba(153,82,238,.42)':'rgba(55,172,255,.48)');
 gr.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=gr;c.beginPath();c.ellipse(x,floorY,29,11,0,0,TAU);c.fill();
 c.shadowColor=glowColor;c.shadowBlur=12+Math.sin(age*23)*3;
 glow(c,x,y,24,necro?'rgba(172,91,243,.56)':'rgba(76,180,255,.65)');
 for(var i=5;i>=1;i--){
   var tx=x-Math.cos(ang)*i*7,ty=y-Math.sin(ang)*i*7,
       rr=(6-i)*.9;
   c.globalAlpha=(6-i)*.12;
   circle(c,tx+Math.sin(age*13+i)*2,ty+Math.cos(age*12+i)*2,Math.max(1,rr),
     necro?i%2?'#bd8ffb':'#85e3a0':'#79b9ff');
 }
 c.globalAlpha=1;
 if(necro){
   skull(c,x,y,.57+Math.sin(age*20)*.045);
   for(i=0;i<4;i++){
     var a=age*9+i*TAU/4;
     circle(c,x+Math.cos(a)*8,y+Math.sin(a)*6,1.6,i%2?'#a6f6a6':'#d28bff');
   }
 }else{
   circle(c,x,y,5.2,'#58b4ff');circle(c,x,y,2.9,'#ffffff');
   for(i=0;i<3;i++){
     var a=age*15+i*TAU/3,px=x+Math.cos(a)*7,py=y+Math.sin(a)*7;
     stroke(c,px,py,px+Math.cos(a+.7)*5,py+Math.sin(a+.7)*5,'#c6efff',1.3);
   }
 }
 c.restore();
}
CC.CriticalScene={
 trigger:trigger,update:update,reset:reset,view:view,rate:rate,
 drawWorld:drawWorld,drawScreen:drawScreen,drawProjectile:drawProjectile,
 status:function(){return {active:!!active,kind:active&&active.kind,
  heroClass:active&&active.heroClass,queued:queue.length,time:now,duration:L()};}
};
})(window);