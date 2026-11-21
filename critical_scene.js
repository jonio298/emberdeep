/* Emberdeep: four class-specific critical cinematics and charged projectiles.
 * Visual multi-hit beats NEVER reapply gameplay damage. All camera/HUD transforms
 * remain controlled by main.js; this module only paints and reports smooth zoom.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{}, TAU=Math.PI*2, now=0, active=null, queue=[], held=false;
var reduced=!!(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches);
var LENGTHS={swordsman:1.18,thief:.90,wizard:.67,necromancer:.88};
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
 active.fin={id:enemy.id,sx:0,sy:0};active.duration=CC.Finisher.LEN[active.heroClass]||2.8;now=0;active.snd=0;
 return true;
}
// The sword crit plays to the sound swordcrit.mp3: its slice-in is at 0.08 s and its slice-out at 0.58 s, and the sound starts at scene time .32. So the
// stab (animation time .40) lands on .40 and the pull (animation .72) is stretched to land on .90; the scene runs 1.18 s. wt() maps scene time to animation time.
// Thief crit (thiefcrit.mp3: slices at .18 and .59): the first cut pair lands at .18, the finishing lines at .59. The perfect slices slow the clock a little
// between the cuts: the thief's cross slash runs .36 -> .60 of its animation across .36 -> .77, the swordsman's cut slows to half speed from .40 to .60.
function knots(){
 var o=active;if(!o)return null;
 if(o.fin){
   if(o.heroClass==='thief')return [[0,0],[.36,.36],[.77,.60]];
   if(o.heroClass==='swordsman')return [[0,0],[.40,.40],[.80,.60]];
   return null;
 }
 if(o.heroClass==='thief')return [[0,0],[.18,.13],[.59,.28]];
 return null;
}
function wt(){
 if(!active)return now;
 if(active.heroClass==='swordsman'&&!active.fin){
   if(now<=.40)return now;
   if(now<=.90)return .40+(now-.40)*(.32/.50);
   return .72+(now-.90);
 }
 var k=knots();if(!k)return now;
 for(var i=1;i<k.length;i++)if(now<=k[i][0])return k[i-1][1]+(now-k[i-1][0])*(k[i][1]-k[i-1][1])/(k[i][0]-k[i-1][0]);
 var l=k[k.length-1];return l[1]+(now-l[0]);
}
function cueSound(){
 if(!CC.Audio||active.snd)return;
 var h=active.heroClass,f=!!active.fin,name=null,rate=1;
 if(h==='swordsman'&&!f&&now>=.32){name='swordcrit';rate=1.2;}
 else if(h==='swordsman'&&f&&now>=.38)name='swordcrit';
 else if(h==='thief'&&!f&&now>=0)name='thiefcrit';
 else if(h==='thief'&&f&&now>=.18)name='thiefcrit';
 if(name){active.snd=1;CC.Audio.play(name,{vol:name==='swordcrit'?.6:1,gap:0,vary:0,rate:rate});}
}
function update(dt){
 if(!active||held)return;
 var spd=(active.heroClass==='swordsman'&&!active.fin)?1.2:1; // the sword crit plays 20% faster
 if(active.heroClass==='necromancer'&&!active.fin){for(var hs=0;hs<3;hs++)if(now>=NH[hs]&&now<NH[hs]+.08){spd=.22;break;}} // each necromancer hit freezes for a beat
 now+=clamp(dt||0,0,.12)*spd;
 cueSound();
 if(active.heroClass==='necromancer'&&!active.fin&&CC.Audio){active.nh=active.nh||0;while(active.nh<3&&now>=NH[active.nh]){var hi=active.nh;CC.Audio.fx('crunch',{vol:.6,gap:0});CC.Audio.fx('wet',{vol:.4,gap:0});CC.Audio.fx('plasma'+(hi+1),{vol:1,gap:0});if(hi===0)CC.Audio.play('necrocrithit',{vol:1,gap:0,vary:0});active.nh++;}}
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
 var nimp=0;if(o.heroClass==='necromancer'&&!o.fin)for(var ni=0;ni<3;ni++)nimp+=Math.exp(-Math.pow((now-NH[ni]-.03)/.05,2))*.16;
 var impulse=o.heroClass==='swordsman'&&!o.fin?
    Math.exp(-Math.pow((now-.40)/.05,2))*.06+
    Math.exp(-Math.pow((now-.90)/.05,2))*.05:0;
 return {x:(minX+maxX)/2,y:(minY+maxY)/2,
   scale:zoom+(impulse+nimp)*k,blend:k};
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
// ---- Swordsman critical: kneel, stab UP into the foe, blood, yank it out, more blood, hit, hit ----
// 0-.13 drop to a knee, blade drawn back | .13-.26 the stab drives up into the body | .26-.44 held in, blood pumping
// .44-.56 the blade is wrenched out | .56-.66 first slash | .70-.80 second slash | .80-1.08 recoil, drips, rise
var G=330; // blood gravity
function hash(i,s){var x=Math.sin(i*127.1+s*311.7)*43758.5453;return x-Math.floor(x);}
function ease(t){t=clamp(t,0,1);return t*t*(3-2*t);}
function quadPt(p0,p1,p2,u){var a=1-u;return {x:a*a*p0.x+2*a*u*p1.x+u*u*p2.x,y:a*a*p0.y+2*a*u*p1.y+u*u*p2.y};}
// A long, sharp, glowing blue sword. Drawn from the grip at (hx,hy) pointing along `ang`; `blood` (0..1) reddens the blade.
function blueSword(c,hx,hy,ang,L,glowAmt,blood,shake,scl){
 c.save();c.translate(hx,hy);c.rotate(ang);if(scl)c.scale(scl,scl);
 if(shake)c.translate(0,Math.sin(now*95)*shake);
 c.shadowColor='#2f9bff';c.shadowBlur=6+16*glowAmt;
 var g=c.createLinearGradient(0,-3.6,0,3.6);
 g.addColorStop(0,'#d8f8ff');g.addColorStop(.42,'#59bcff');g.addColorStop(.58,'#2f7fe0');g.addColorStop(1,'#163f9c');
 c.fillStyle=g;c.beginPath();
 c.moveTo(1,-3.6);c.lineTo(L*.86,-2.9);c.lineTo(L+3,0);c.lineTo(L*.86,2.9);c.lineTo(1,3.6);c.closePath();c.fill();
 c.shadowBlur=0;
 // fuller groove, bright edge, hairline highlight
 c.strokeStyle='#0f2f7a';c.lineWidth=1.1;c.beginPath();c.moveTo(5,.6);c.lineTo(L*.8,.3);c.stroke();
 c.strokeStyle='rgba(235,252,255,.95)';c.lineWidth=.9;c.beginPath();c.moveTo(3,-3);c.lineTo(L*.9,-2.1);c.stroke();
 c.strokeStyle='rgba(120,200,255,.7)';c.lineWidth=.7;c.beginPath();c.moveTo(4,2.6);c.lineTo(L*.88,1.9);c.stroke();
 // glinting tip
 var tw=.6+.4*Math.sin(now*40);
 c.fillStyle='rgba(255,255,255,'+(.55+.4*tw*glowAmt)+')';c.beginPath();c.moveTo(L+4,0);c.lineTo(L-3,-1.6);c.lineTo(L-3,1.6);c.closePath();c.fill();
 // blood coats the blade from the tip back
 if(blood>0){
  var bl=L*clamp(blood,0,1)*.92;
  var bg=c.createLinearGradient(L-bl,0,L+2,0);bg.addColorStop(0,'rgba(120,8,22,0)');bg.addColorStop(.35,'rgba(150,10,28,.85)');bg.addColorStop(1,'rgba(205,18,40,.95)');
  c.fillStyle=bg;c.beginPath();c.moveTo(L-bl,-3.1);c.lineTo(L*.86,-2.9);c.lineTo(L+3,0);c.lineTo(L*.86,2.9);c.lineTo(L-bl,3.1);c.closePath();c.fill();
  c.fillStyle='rgba(255,120,130,.55)';c.fillRect(L-bl*.8,-2.5,bl*.7,.8);
 }
 // gold cross-guard with a gem, wrapped grip, pommel
 c.fillStyle='#8b6a2a';c.fillRect(-1.5,-8.4,4.4,16.8);
 c.fillStyle='#f0cf72';c.fillRect(-.8,-8,3,16);
 c.fillStyle='#fff3b8';c.fillRect(-.8,-8,1,16);
 c.fillStyle='#f0cf72';c.beginPath();c.arc(.7,-8.4,2,0,TAU);c.arc(.7,8.4,2,0,TAU);c.fill();
 c.fillStyle='#9ef0ff';c.beginPath();c.arc(1.3,0,1.8,0,TAU);c.fill();
 c.fillStyle='#4a2c1c';c.fillRect(-10,-1.7,8.6,3.4);
 c.strokeStyle='#2a170c';c.lineWidth=.8;for(var i=0;i<4;i++){c.beginPath();c.moveTo(-9+i*2.2,-1.7);c.lineTo(-8+i*2.2,1.7);c.stroke();}
 c.fillStyle='#f0cf72';c.beginPath();c.arc(-11.3,0,2.4,0,TAU);c.fill();
 c.restore();
}
function flare(c,x,y,s,col,rot){
 c.save();c.translate(x,y);c.rotate(rot||0);c.fillStyle=col;
 c.beginPath();c.moveTo(0,-s);c.lineTo(s*.16,-s*.16);c.lineTo(s,0);c.lineTo(s*.16,s*.16);c.lineTo(0,s);c.lineTo(-s*.16,s*.16);c.lineTo(-s,0);c.lineTo(-s*.16,-s*.16);c.closePath();c.fill();
 c.restore();
}
// A spurt of blood: a thick opening jet, then droplets that fly, fall and fade, each with a streak behind it.
function bloodBurst(c,ox,oy,dir,spread,n,t0,t,seed,pw){
 var age=t-t0;if(age<0||age>.9)return;
 c.save();c.lineCap='round';
 if(age<.3){c.globalAlpha=1-age/.3;glow(c,ox,oy,12+pw*16,'rgba(255,36,64,.55)');c.globalAlpha=1;}
 if(age<.12){ // the jet
  var k=1-age/.12,jl=pw*(13+6*hash(1,seed))*(.45+.55*Math.min(1,age/.04));
  c.save();c.translate(ox,oy);c.rotate(dir);c.globalAlpha=Math.min(1,k*1.4);
  c.fillStyle='#d11a36';c.beginPath();c.moveTo(0,-2*pw);c.quadraticCurveTo(jl*.6,-3.4*pw,jl,0);c.quadraticCurveTo(jl*.6,3.4*pw,0,2*pw);c.closePath();c.fill();
  c.fillStyle='#ff6a76';c.beginPath();c.moveTo(0,-1);c.quadraticCurveTo(jl*.5,-2,jl*.9,0);c.quadraticCurveTo(jl*.5,2,0,1);c.closePath();c.fill();
  c.restore();
 }
 for(var i=0;i<n;i++){
  var life=.4+.45*hash(i,seed+2);if(age>life)continue;
  var a=dir+(hash(i,seed)-.5)*spread,sp=(46+120*hash(i,seed+1))*pw,vx=Math.cos(a)*sp,vy=Math.sin(a)*sp-26*pw;
  var x=ox+vx*age,y=oy+vy*age+.5*G*age*age,a0=Math.max(0,age-.04),px=ox+vx*a0,py=oy+vy*a0+.5*G*a0*a0,fade=1-age/life;
  c.globalAlpha=Math.min(1,fade*1.6);
  c.strokeStyle=i%3?'#b3122b':'#e8283f';c.lineWidth=(1.1+1.9*hash(i,seed+3))*(.5+.5*fade);
  c.beginPath();c.moveTo(px,py);c.lineTo(x,y);c.stroke();
  c.fillStyle=i%4?'#c8162f':'#ff5a66';c.beginPath();c.arc(x,y,(.9+1.5*hash(i,seed+4))*(.6+.4*fade),0,TAU);c.fill();
 }
 c.restore();
}
function bloodPool(c,x,y,rx,t,t0,seed){
 var u=ease((t-t0)/.45);if(u<=0)return;
 c.save();c.globalAlpha=.78*u;c.fillStyle='#5e0a16';c.beginPath();c.ellipse(x,y,rx*u,rx*.4*u,0,0,TAU);c.fill();
 c.fillStyle='#a8132a';c.beginPath();c.ellipse(x-rx*.1,y-1,rx*.62*u,rx*.24*u,0,0,TAU);c.fill();
 for(var i=0;i<5;i++){c.fillStyle='#9a1228';c.beginPath();c.ellipse(x+(hash(i,seed)-.5)*rx*1.9*u,y+(hash(i,seed+1)-.5)*rx*.7,1.2+hash(i,seed+2)*1.6,.8+hash(i,seed+3),0,0,TAU);c.fill();}
 c.restore();
}
function swordCrit(c,o,t){
 // 0-.2 drop to a knee, blade drawn back | .2-.46 the blade slides slowly up into the body | .46-.62 held in, blood pumping
 // .62-.9 the blade is drawn smoothly back out | .9-1 hold. The blade always points away from the hero, hilt toward him.
 var TI=.40,TP=.72;
 var f=Math.cos(o.angle)>=0?1:-1,sc=1.35,kneel=ease(t/.16)*(1-ease((t-.88)/.12)),low=kneel*5*sc;
 var S={x:o.sourceX-o.x,y:o.sourceY-o.y},P={x:0,y:-3};
 var rest={x:S.x+f*8*sc,y:S.y+1*sc+low*.55+15}; // the hand drops low at the knee, so the blade rises into the foe
 var vx=P.x-rest.x,vy=P.y-rest.y,dl=Math.hypot(vx,vy)||1;
 var ux=vx/dl,uy=vy/dl-.1,ul=Math.hypot(ux,uy)||1;ux/=ul;uy/=ul;
 var dirAng=Math.atan2(uy,ux),SW=.72,Ls=clamp(dl*.8,26,38),Lu=Ls/SW; // a smaller sword; Lu is its length before scaling
 var reachDot=vx*ux+vy*uy,extIn=reachDot+4-Ls,extOut=extIn-22;
 var stab=ease((t-.2)/.26),pull=ease((t-.62)/.28),windup=ease(t/.2);
 var ext=t<.2?extOut-6+6*windup:extOut+(extIn-extOut)*stab-(extIn-extOut)*pull;
 var hold=t>=.46&&t<.62;
 var bloodAmt=t<TI?0:t<.62?clamp((t-TI)/.2,0,1)*.75:Math.min(1,.75+(t-.62)*.9);
 var ang=dirAng,hx=rest.x+ux*ext,hy=rest.y+uy*ext;
 // arm
 c.save();c.lineCap='round';
 c.strokeStyle='#5f6b80';c.lineWidth=4.2;c.beginPath();c.moveTo(S.x+f*5*sc,S.y-3*sc+low);c.lineTo(hx,hy);c.stroke();
 c.strokeStyle='#9aa8be';c.lineWidth=2.6;c.beginPath();c.moveTo(S.x+f*5*sc,S.y-3*sc+low);c.lineTo(hx,hy);c.stroke();
 c.fillStyle='#d6ae7e';c.beginPath();c.arc(hx,hy,2.8,0,TAU);c.fill();
 c.restore();
 // a soft motion smear behind the moving blade
 var fast=(t>.26&&t<.46)?1-Math.abs((t-.36)/.1):(t>.64&&t<.9)?1-Math.abs((t-.77)/.13):0;
 if(fast>0){
  c.save();c.globalAlpha=.32*clamp(fast,0,1);c.lineCap='round';
  for(var k=1;k<=3;k++){var bk=ext+(t<.55?-k*4:k*4);
   c.strokeStyle=k%2?'#2f8bff':'#9fe5ff';c.lineWidth=3.6-k*.7;
   c.beginPath();c.moveTo(rest.x+ux*bk,rest.y+uy*bk);c.lineTo(rest.x+ux*bk+Math.cos(ang)*Ls,rest.y+uy*bk+Math.sin(ang)*Ls);c.stroke();}
  c.restore();
 }
 blueSword(c,hx,hy,ang,Lu,.55+.45*(hold?1:stab),bloodAmt,hold?.6:0,SW);
 // the wound: a dark gash and ragged red lips at the point of entry
 if(t>TI){
  c.save();c.globalAlpha=clamp((t-TI)/.05,0,1);c.strokeStyle='#3a040c';c.lineWidth=2.6;c.lineCap='round';
  var wx=P.x+ux*3,wy=P.y+uy*3;c.beginPath();c.moveTo(wx-ux*5+uy*2,wy-uy*5-ux*2);c.lineTo(wx+ux*4-uy*2,wy+uy*4+ux*2);c.stroke();
  c.strokeStyle='#d41a34';c.lineWidth=1.2;c.beginPath();c.moveTo(wx-ux*4+uy*2,wy-uy*4-ux*2);c.lineTo(wx+ux*3-uy*2,wy+uy*3+ux*2);c.stroke();
  c.restore();
 }
 // blood: a spurt as the blade goes in, pumping while it is held, a heavier gout and a flung spray as it comes out
 var r=o.r||9,wound={x:P.x+ux*2,y:P.y+uy*2};
 bloodBurst(c,wound.x,wound.y,dirAng-Math.PI+(f>0?-.5:.5),1.9,34,TI,t,11,1.05);
 bloodBurst(c,wound.x,wound.y-3,-Math.PI/2,1.3,16,TI+.09,t,12,.7);
 bloodBurst(c,wound.x,wound.y-3,-Math.PI/2+(f>0?.3:-.3),1.5,14,TI+.17,t,13,.6);
 bloodBurst(c,wound.x,wound.y,dirAng-Math.PI,1.7,48,TP,t,14,1.35);
 bloodBurst(c,wound.x+ux*8,wound.y+uy*8,dirAng-Math.PI*.5*f,1.2,22,TP+.03,t,15,1);
 bloodBurst(c,wound.x,wound.y-3,-Math.PI/2+(f>0?-.3:.3),1.4,16,TP+.12,t,16,.7);
 bloodPool(c,-2,r*.85,13,t,TI+.05,5);bloodPool(c,9,r*.95,11,t,TP+.04,6);
 // metal on bone: a spark flare at each of the two beats
 var beats=[[TI,7,'#c8f2ff'],[TP,6,'#ffd0d4']];
 for(var b=0;b<beats.length;b++){
  var ba=t-beats[b][0];if(ba<0||ba>.16)continue;
  var bu=1-ba/.16;c.save();c.globalAlpha=bu;
  flare(c,P.x,P.y,beats[b][1]*(.5+bu),beats[b][2],ba*6);flare(c,P.x,P.y,beats[b][1]*.55*(.5+bu),'#ffffff',-ba*4+.7);
  for(var sp=0;sp<9;sp++){var sa=hash(sp,b+20)*TAU,sr=ba*(120+hash(sp,b+30)*130);c.strokeStyle=sp%2?'#bfeaff':'#ffe9a8';c.lineWidth=1.1;
   c.beginPath();c.moveTo(P.x+Math.cos(sa)*sr*.6,P.y+Math.sin(sa)*sr*.6);c.lineTo(P.x+Math.cos(sa)*(sr+7),P.y+Math.sin(sa)*(sr+7));c.stroke();}
  c.restore();
 }
 if(t>TI&&t<TI+.1)hitBurst(c,P.x,P.y,(t-TI)/.1,true);if(t>TP&&t<TP+.1)hitBurst(c,P.x-3,P.y+1,(t-TP)/.1,true);
}
// a white flash on the stab and on the pull
function swordFlash(t){
 return {w:Math.max(.45*Math.exp(-Math.pow((t-.405)/.02,2)),.32*Math.exp(-Math.pow((t-.725)/.022,2))),r:0};
}
function taper(c,x1,y1,x2,y2,bend,w,col){ // a curved sliver: zero width at both ends, `w` wide in the middle
 var mx=(x1+x2)/2,my=(y1+y2)/2,dx=x2-x1,dy=y2-y1,l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l,cx=mx+nx*bend,cy=my+ny*bend;
 c.fillStyle=col;c.beginPath();c.moveTo(x1,y1);c.quadraticCurveTo(cx+nx*w,cy+ny*w,x2,y2);c.quadraticCurveTo(cx-nx*w,cy-ny*w,x1,y1);c.closePath();c.fill();
}
function thief(c,o,t){
 c.save();
 // five fine blade cuts: a crossing X first, then three quick finishing lines. Each is a tapered, slightly curved sliver (needle thin at both ends)
 var centers=[.1,.16,.22,.28,.33],angles=[-.82,.8,-.28,.38,-1.2],bends=[5,-5,4,-4,3],lens=[1,1,.85,.8,.7],n=5;
 for(var i=0;i<n;i++){
   var age=t-centers[i],duration=.17,progress=clamp(age/duration,0,1);
   if(age<-.04||age>.26)continue;
   var fade=smooth((age+.04)/.05)*smooth((duration+.05-age)/.1);
   c.save();c.rotate(o.angle+angles[i]);c.globalAlpha=fade;
   var L=lens[i],x1=-34*L+progress*22,x2=30*L+progress*10,oy=(i-2)*2.2,bend=bends[i];
   c.shadowColor='#d31b34';c.shadowBlur=7;
   taper(c,x1,oy-12,x2,oy+11,bend,3.4,'#8a1226');           // dark red body of the cut
   c.shadowBlur=0;
   taper(c,x1+2,oy-11.5,x2-1,oy+10.5,bend,1.9,'#f2394d');    // bright red edge
   taper(c,x1+4,oy-11,x2-3,oy+10,bend,.8,'#ffe3e5');         // hair-thin white core
   // a trailing wisp where the blade has already passed
   c.globalAlpha=fade*.45;stroke(c,x1-8,oy-15,x1+6,oy-9,'#ff7a86',.8);stroke(c,x1-12,oy-12,x1+2,oy-6,'#ff7a86',.6);
   c.restore();
   if(age>.02&&age<.16){hitBurst(c,(i-2)*3,(i-2)*2.5,(age-.02)/.06,true);
     c.save();c.globalAlpha=fade*.8; // thin blood threads and sparks flicked off the cut
     for(var k=0;k<4;k++){var a2=o.angle+angles[i]+1.57+(k-1.5)*.55,r0=8+progress*6,r1=r0+8+k*2;stroke(c,Math.cos(a2)*r0,Math.sin(a2)*r0,Math.cos(a2)*r1,Math.sin(a2)*r1,k%2?'#ff4a5c':'#a8162b',.9);}
     c.restore();}
 }
 // where the first two cuts cross, a brief thin red X mark glows on the target
 if(t>.22&&t<.5){var xm=smooth((t-.22)/.05)*smooth((.5-t)/.2);c.save();c.globalAlpha=xm*.8;c.rotate(o.angle);c.shadowColor='#ff2a44';c.shadowBlur=6;
   stroke(c,-9,-9,9,9,'#ff4a5c',1);stroke(c,-9,9,9,-9,'#ff4a5c',1);stroke(c,-5,-5,5,5,'#ffe3e5',.5);stroke(c,-5,5,5,-5,'#ffe3e5',.5);c.restore();}
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

// The necromancer's critical lands as THREE crunching hits (one critical's damage split in three, so the total is unchanged). Each hit tears a piece off the
// monster (a jagged notch is cut out of it, a chunk tumbles away) and pops its own damage number. Visual only: the real damage was dealt once, in full.
var NH=[.22,.38,.54],NPHI=[2.45,-.55,-2.1];
function necroHits(c,o,t,ret){
 var total=Math.max(0,Math.round(o.damage||0)),base=Math.floor(total/3),dm=[base,base,total-2*base];
 var v=(o.targets&&o.targets[0])||{},col=v.color||'#917578',TY=CC.Enemies&&CC.Enemies.TYPES&&CC.Enemies.TYPES[v.type];
 var blood=(TY&&TY.blood)||'#7a0f14',R=clamp(o.r||10,6,28),i,j,k;
 c.save();
 for(i=0;i<3;i++){
   var a=t-NH[i];if(a<0)continue;
   var phi=NPHI[i],nx=Math.cos(phi)*R*.5,ny=Math.sin(phi)*R*.5,ns=R*(.85+.1*i);
   // the missing piece: a jagged bite in the background colour with a raw dark rim
   c.save();c.translate(nx,ny);c.rotate(phi);c.globalAlpha=ret;
   c.beginPath();c.moveTo(-ns*.25,-ns*.75);c.lineTo(ns*.15,-ns*.45);c.lineTo(ns*.6,-ns*.7);c.lineTo(ns*.95,-ns*.15);c.lineTo(ns*.55,ns*.2);c.lineTo(ns*.85,ns*.6);c.lineTo(ns*.1,ns*.45);c.lineTo(-ns*.2,ns*.85);c.lineTo(-ns*.4,ns*.2);c.closePath();
   c.fillStyle='#000005';c.fill();c.lineWidth=1.8;c.strokeStyle=blood;c.stroke();c.lineWidth=.7;c.strokeStyle='#d8464f';c.stroke();
   c.restore();
   c.save();c.globalAlpha=ret*.9;for(k=0;k<6;k++){ // cracks spreading from the impact, left in the flesh
     var ca=phi+(k-2.5)*.55,cl=R*(.7+.5*((k*7+i*3)%4)/3)*smooth(a/.1),mx=nx+Math.cos(ca)*cl*.5+Math.sin(ca)*2,my=ny+Math.sin(ca)*cl*.5-Math.cos(ca)*2;
     c.strokeStyle=blood;c.lineWidth=1.6;c.beginPath();c.moveTo(nx,ny);c.lineTo(mx,my);c.lineTo(nx+Math.cos(ca)*cl,ny+Math.sin(ca)*cl);c.stroke();c.strokeStyle='rgba(255,230,230,.8)';c.lineWidth=.6;c.stroke();}c.restore();
   if(a<.2){var rk=a/.2;arc(c,nx,ny,rk*R*1.8,0,TAU,'rgba(255,250,255,'+(.85*(1-rk))+')',3.5*(1-rk)+.5);arc(c,nx,ny,rk*R*1.2,0,TAU,'rgba(150,255,190,'+(.7*(1-rk))+')',2);}
   if(a<.16){ // the crunch: a hard flash, jagged spikes and a snapping ring
     var kk=a/.16;glow(c,nx,ny,12+kk*26,'rgba(214,150,255,'+(.7*(1-kk))+')');
     for(k=0;k<9;k++){var aa=k*.7+i*1.3,l0=3+kk*5,l1=9+kk*(15+k%3*7);stroke(c,nx+Math.cos(aa)*l0,ny+Math.sin(aa)*l0,nx+Math.cos(aa)*l1,ny+Math.sin(aa)*l1,k%3===0?'#f4e8ff':k%3===1?'#86f2a8':'#ff6a8a',k%2?1.4:2.2);}
     arc(c,nx,ny,kk*22,0,TAU,'rgba(240,220,255,'+(.8*(1-kk))+')',2);
   }
   // chunks of the monster fly off, tumbling
   for(j=0;j<6;j++){
     var ang=phi+(j-2.5)*.5,sp=65+j*24+i*10,cx=nx+Math.cos(ang)*sp*a,cy=ny+Math.sin(ang)*sp*a*.8-70*a+150*a*a;
     var fa=ret*clamp(1-(a-.32)/.32,0,1);if(fa<=0)continue;
     c.save();c.translate(cx,cy);c.rotate(a*(7+j*3)*(j%2?1:-1)+j);c.globalAlpha=fa;
     var cs=R*(.3+.1*((j+i)%3)),bone=j%3===2;
     c.beginPath();c.moveTo(-cs,-cs*.6);c.lineTo(cs*.3,-cs);c.lineTo(cs,-cs*.1);c.lineTo(cs*.5,cs*.8);c.lineTo(-cs*.7,cs*.6);c.closePath();
     c.fillStyle=bone?'#d8d4c0':col;c.fill();c.lineWidth=1;c.strokeStyle=bone?'#8a8470':blood;c.stroke();
     c.fillStyle=blood;c.fillRect(-cs*.3,-cs*.2,cs*.7,cs*.5);
     c.restore();
   }
   if(a<.4){c.globalAlpha=ret*(1-a/.4);for(k=0;k<7;k++){ // blood flecks
     var ba=phi+(k-3)*.45,bd=a*(60+k*11);circle(c,nx+Math.cos(ba)*bd,ny+Math.sin(ba)*bd*.8+110*a*a,1.3,k%2?blood:'#b0182a');}c.globalAlpha=1;}
 }
 // the three damage counters, side by side above the monster
 c.textAlign='center';c.textBaseline='middle';
 for(i=0;i<3;i++){
   var a2=t-NH[i];if(a2<0)continue;
   var pop=1+(a2<.1?(1-a2/.1)*.8:0),rise=Math.min(a2,.5)*22,x=(i-1)*(R+26),y=-R-16-rise-(i===1?11:0);
   c.globalAlpha=ret;c.font='bold '+Math.round(24*pop)+'px Georgia,serif';c.lineWidth=4.5;c.strokeStyle='#14040c';c.strokeText(String(dm[i]),x,y);
   c.fillStyle=i===2?'#ff8a9a':'#ff4c64';c.fillText(String(dm[i]),x,y);
 }
 c.restore();
}
function necromancer(c,o,t){
 var shock=smooth((t-.15)/.33),ret=smooth((o.duration-t)/.23);
 c.save();
 c.save();c.scale(.55,.55); // the rune ring and seal stay small so the monster and its falling pieces stay in view
 glow(c,0,0,29+shock*66,'rgba(129,53,202,.22)');
 glow(c,0,0,11+shock*33,'rgba(164,237,165,.14)');
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
 if(!o.fin)necroHits(c,o,t,ret);
 c.restore();
}
function drawWorld(c,cam){
 if(!active)return;
 var o=active,t=wt(),fade=smooth(now/.095)*smooth((o.duration-now)/.18);
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
 else if(o.heroClass==='swordsman'){ // the knee-drop stab: the cinematic paints the arm and the blue blade itself
   cp.kneel=smooth(t/.16)*(1-smooth((t-.88)/.12));
   cp.drive=smooth((t-.2)/.26)*(1-smooth((t-.62)/.28));
   cp.withdraw=0;cp.noBlade=true;
 }
 if(CC.Classes&&CC.Classes.drawCriticalHero)CC.Classes.drawCriticalHero(c,cam,cp);
 if(fin&&victim){CC.Finisher.drawVictim(c,o,t);c.restore();return;}
 // Primary impact: sharp, hero-specific signature animation.
 c.save();c.translate(o.x-cam.x,o.y-cam.y);c.globalAlpha=fade;
 if(o.heroClass==='swordsman')swordCrit(c,o,t);
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
   var fl=CC.Finisher.flash(active.heroClass,wt());
   if(fl>.01&&!reduced){c.globalAlpha=Math.min(.75,fl*.7);c.fillStyle='#ffffff';c.fillRect(0,0,W,H);}
 }else if(active.heroClass==='swordsman'&&!reduced){ // steel flashes white on the stab and the pull, blood flashes red on the two slashes
   var sf=swordFlash(wt());
   if(sf.w>.01){c.globalAlpha=sf.w;c.fillStyle='#e8f6ff';c.fillRect(0,0,W,H);}
   if(sf.r>.01){c.globalAlpha=sf.r;c.fillStyle='#d0132e';c.fillRect(0,0,W,H);}
 }
 if(active.heroClass==='necromancer'&&!fin&&!reduced){ // a pale flash on each crunching hit
   var nf=0;for(var nj=0;nj<3;nj++)nf+=Math.exp(-Math.pow((now-NH[nj])/.035,2));
   if(nf>.02){c.globalAlpha=Math.min(.5,nf*.45);c.fillStyle='#e8d8ff';c.fillRect(0,0,W,H);}
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