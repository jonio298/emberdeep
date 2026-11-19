/* Emberdeep: four class-specific critical cinematics and charged projectiles.
 * Visual multi-hit beats NEVER reapply gameplay damage. All camera/HUD transforms
 * remain controlled by main.js; this module only paints and reports smooth zoom.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{}, TAU=Math.PI*2, now=0, active=null, queue=[], held=false;
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
function snapshot(enemy){
 if(!enemy)return null;
 // Preserve original monster art, dismemberment and damage, even if the
 // physical actor dies while the slowed cinematic is playing.
 var o=Object.assign({},enemy);
 o.dead=false;o.deadT=0;o.hidden=false;o.hp=Math.max(1,o.hp||0);
 return o;
}
function appendTargets(scene,list){
 if(!scene||!Array.isArray(list))return;
 for(var j=0;j<list.length;j++){
   var e=list[j];if(!e)continue;
   var id=e.id;
   var shot=snapshot(e);
   if(!shot)continue;
   var existing=scene.targets.find(function(t){return t.id===id;});
   if(existing)Object.assign(existing,shot);
   else scene.targets.push(shot);
 }
}
function addTargets(list){if(active)appendTargets(active,list);}
function trigger(hit){
 if(!hit||!isFinite(hit.x)||!isFinite(hit.y)||['slash','projectile'].indexOf(hit.kind)<0)return false;
 if(!(CC.state&&CC.state.mode==='dungeon'))return false;
 var id=heroKind(hit),o={
   kind:hit.kind,heroClass:id,
   x:hit.x,y:hit.y,sourceX:Number.isFinite(hit.sourceX)?hit.sourceX:hit.x-30,
   sourceY:Number.isFinite(hit.sourceY)?hit.sourceY:hit.y,
   angle:hit.angle||0,r:clamp(hit.r||10,5,30),
   color:hit.color||'#f0e0d2',damage:hit.damage||0,duration:LENGTHS[id],
   radius:hit.radius||44,targets:[]
 };
 appendTargets(o,hit.targets);
 if(!o.targets.length)appendTargets(o,[{id:-1,x:o.x,y:o.y,r:o.r,anim:0,dead:false,face:1,
   type:'ghoul',color:'#917578',hp:1,maxHp:1}]);
 if(hit.finisher!=null&&CC.Finisher){
   o.fin={id:hit.finisher,sx:0,sy:0};o.duration=CC.Finisher.LEN[id];
 }
 if(!active){active=o;now=0;}
 else if(queue.length<5)queue.push(o);
 return true;
}
// Kill shots only play inside the dungeon, where the cinematic stage exists.
function canFinish(){return !!(CC.Finisher&&CC.state&&CC.state.mode==='dungeon');}
// A swipe's cinematic may already be running when a second target is perfectly killed.
function finish(enemy){
 if(!active||!enemy||!CC.Finisher||active.fin)return false;
 active.fin={id:enemy.id,sx:0,sy:0};active.duration=CC.Finisher.LEN[active.heroClass]||2.8;now=0;
 return true;
}
function update(dt){
 if(!active||held)return;
 now+=clamp(dt||0,0,.12);
 if(now>=active.duration){active=queue.shift()||null;now=0;}
}
function reset(){active=null;queue.length=0;now=0;}
function view(w,h){
 if(!active)return null;
 var k=reduced?0:envelope();
 var o=active,minX=o.sourceX,maxX=o.sourceX,minY=o.sourceY,maxY=o.sourceY;
 for(var i=0;i<o.targets.length;i++){
   var q=o.targets[i];minX=Math.min(minX,q.x);maxX=Math.max(maxX,q.x);
   minY=Math.min(minY,q.y);maxY=Math.max(maxY,q.y);
 }
 var desired=1+(o.fin?.62:.47)*k,zoom=desired;
 // Preserve the dramatic zoom but frame ALL actual participants, not just
 // the primary target. Avoid cropping the hero out on longer blade reaches.
 if(w&&h&&k>0){
   var maxScale=Math.min(w/(maxX-minX+72),h/(maxY-minY+84));
   zoom=1+(Math.min(desired,Math.max(1,maxScale))-1)*k;
 }
 // Tiny camera compression at the two steel impacts, without harsh shakes.
 var impulse=o.heroClass==='swordsman'&&!o.fin?
    Math.exp(-Math.pow((now-.23)/.042,2))*.04+
    Math.exp(-Math.pow((now-.46)/.044,2))*.035:0;
 return {x:(minX+maxX)/2,y:(minY+maxY)/2,
   scale:zoom+impulse*k,blend:k};
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
function swordsman(c,o,t){
 // The actual character and blue blade are drawn by Classes.drawCriticalHero.
 // This overlay contains only the synchronized blade trail and TWO hit beats.
 // 0-.13 kneel; .13-.28 stab; .28-.37 hold; .37-.54 yank; .54-.73 reset.
 c.save();c.rotate(o.angle);
 var drive=smooth((t-.13)/.14),pull=smooth((t-.375)/.155);
 if(t>.12&&t<.57){
   var speed=smooth((t-.12)/.11)*(1-smooth((t-.49)/.09));
   c.shadowColor='#239bff';c.shadowBlur=12*speed;
   stroke(c,-26-drive*10+pull*9,-3,
     17+drive*22-pull*13,-3,'#194fba',6);
   stroke(c,-26-drive*10+pull*9,-5,
     17+drive*22-pull*13,-5,'#7adeff',2.6);
   stroke(c,-20-drive*10+pull*9,-6,
     17+drive*22-pull*13,-6,'rgba(236,251,255,.9)',1.4);
   c.shadowBlur=0;
 }
 // First impact: blade penetrates. Second: the withdrawal tears it loose.
 if(t>.185&&t<.32)hitBurst(c,0,0,(t-.185)/.095,true);
 if(t>.405&&t<.57)hitBurst(c,-4,1,(t-.405)/.11,true);
 for(var i=0;i<15;i++){
   var age=t-.205-i*.011,prog=clamp(age/.38,0,1);
   if(age<0||age>.44)continue;
   var a=i*2.39996+o.angle,vel=12+(i%5)*4;
   circle(c,Math.cos(a)*vel*prog+Math.sin(i*9)*5,
     Math.sin(a)*vel*prog+prog*prog*(7+i%4*5),1+(i%3)*.45,
     i%3?'#99152c':'#f15c69');
 }
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
 var o=active,t=now,fade=smooth(t/.095)*smooth((o.duration-t)/.18);
 var fin=!!(o.fin&&CC.Finisher&&CC.Finisher.build(o).ok);
 if(fade<.001)return;
 c.save();
 // Hide all other combatants and terrain under a true black cinematic veil.
 // Smooth opacity eases in and out instead of flashing instant black.
 c.globalAlpha=.995*fade;c.fillStyle='#000005';
 c.fillRect(0,0,cam.w,cam.h);
 c.globalAlpha=fade;
 // Only participants actually struck by the crit, plus our original hero.
 var E=CC.Enemies;
 var others=o.targets,victim=null;
 if(fin){
   others=o.targets.filter(function(q){if(q.id===o.fin.id){victim=q;return false;}return true;});
   if(victim){o.fin.sx=victim.x-cam.x;o.fin.sy=victim.y-cam.y;}
 }
 if(E&&E.drawCriticalTargets)E.drawCriticalTargets(c,cam,others,o,t);
 var cp={
   heroClass:o.heroClass,sourceX:o.sourceX,sourceY:o.sourceY,
   angle:o.angle,distance:Math.hypot(o.x-o.sourceX,o.y-o.sourceY),
   kneel:smooth(t/.125)*(1-smooth((t-.54)/.15)),
   drive:smooth((t-.13)/.145)*(1-smooth((t-.38)/.16)),
   withdraw:smooth((t-.38)/.15)
 };
 if(fin){var hp=CC.Finisher.heroPose(o,t);cp.kneel=hp.kneel;cp.drive=hp.drive;cp.withdraw=hp.withdraw;}
 if(CC.Classes&&CC.Classes.drawCriticalHero)CC.Classes.drawCriticalHero(c,cam,cp);
 if(fin&&victim){CC.Finisher.drawVictim(c,o,t);c.restore();return;}
 // Primary impact: sharp, hero-specific signature animation.
 c.save();c.translate(o.x-cam.x,o.y-cam.y);c.globalAlpha=fade;
 if(o.heroClass==='swordsman')swordsman(c,o,t);
 else if(o.heroClass==='thief')thief(c,o,t);
 else if(o.heroClass==='necromancer')necromancer(c,o,t);
 else wizard(c,o,t);
 c.restore();
 // Every nearby target that was actually hit gets a synced shock/impact flash,
 // while all unrelated monsters remain completely hidden.
 for(var j=0;j<o.targets.length;j++){
   var q=o.targets[j];
   if(Math.hypot(q.x-o.x,q.y-o.y)<2)continue;
   var age=o.kind==='slash'? t-.20 : t-.22;
   if(age<0||age>.24)continue;
   c.save();c.translate(q.x-cam.x,q.y-cam.y);
   c.globalAlpha=fade;
   var power=smooth(age/.13)*smooth((.24-age)/.12);
   glow(c,0,0,13+power*25,o.kind==='slash'?'rgba(248,67,83,.58)':
     o.heroClass==='necromancer'?'rgba(169,79,231,.55)':'rgba(70,181,255,.6)');
   arc(c,0,0,7+power*23,0,TAU,o.kind==='slash'?'#e8324c':
     o.heroClass==='necromancer'?'#ae77ed':'#8ddfff',2.5*(1-power)+.7);
   c.restore();
 }
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
 var fin=!!(active.fin&&active.fx&&active.fx.ok&&CC.Finisher);
 if(fin){ // brief white flash on the instant of the perfect blow
   var fl=CC.Finisher.flash(active.heroClass,t);
   if(fl>.01&&!reduced){c.globalAlpha=Math.min(.75,fl*.7);c.fillStyle='#ffffff';c.fillRect(0,0,W,H);}
 }
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
 var label=fin?CC.Finisher.TITLE[active.heroClass]:'CRITICAL HIT';
 c.strokeText(label,W/2,textY);
 c.fillStyle=fin?CC.Finisher.colors(active.heroClass):'#ff334e';c.fillText(label,W/2,textY);
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
 trigger:trigger,canFinish:canFinish,finish:finish,addTargets:addTargets,update:update,reset:reset,view:view,rate:rate,
 isActive:function(){return !!active;},
 debugSeek:function(t,hold){now=t;held=!!hold;},
 drawWorld:drawWorld,drawScreen:drawScreen,drawProjectile:drawProjectile,
 status:function(){return {active:!!active,kind:active&&active.kind,
  heroClass:active&&active.heroClass,queued:queue.length,time:now,
  duration:L(),targets:active?active.targets.length:0};}
};
})(window);