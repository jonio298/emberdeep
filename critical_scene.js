/* Emberdeep: brief critical impact cinematics for basic slashes and projectiles.
 * Real-time animation, slowed GAMEPLAY only, camera eases in/out without moving HUD.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{}, T=0.54, now=0, active=null, waiting=[];
var reduced=!!(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches);
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function ease(x){x=clamp(x,0,1);return x*x*(3-2*x);}
function envelope(){return active?ease(now/.13)*ease((T-now)/.23):0;}
function add(hit){
  if(!hit||!isFinite(hit.x)||!isFinite(hit.y)||!['slash','projectile'].includes(hit.kind))return false;
  if(!(CC.state&&CC.state.mode==='dungeon'))return false;
  var q={kind:hit.kind,x:hit.x,y:hit.y,angle:hit.angle||0,
    r:clamp(hit.r||10,5,27),color:hit.color||'#e1e5f4',n:hit.damage||0};
  if(!active){active=q;now=0;}
  else if(waiting.length<12)waiting.push(q);
  return true;
}
function update(dt){
  if(!active)return;
  now+=Math.max(0,Math.min(.12,dt||0));
  if(now>=T){active=waiting.shift()||null;now=0;}
}
function reset(){active=null;waiting.length=0;now=0;}
function view(){
  if(!active)return null;
  var k=reduced?0:envelope();
  return {x:active.x,y:active.y,scale:1+.46*k,blend:k};
}
function rate(){return active&&!reduced?1-.79*envelope():1;}
function seg(c,x,y,x2,y2,col,w){
  c.strokeStyle=col;c.lineWidth=w;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();
}
function circ(c,x,y,r,col){
  c.fillStyle=col;c.beginPath();c.arc(x,y,Math.max(.1,r),0,Math.PI*2);c.fill();
}
function drawWorld(c,cam){
  if(!active)return;
  var o=active,x=o.x-cam.x,y=o.y-cam.y,
      a=now,fade=ease(a/.075)*ease((T-a)/.17);
  if(fade<.005)return;
  c.save();c.translate(x,y);c.globalAlpha=fade;
  if(o.kind==='slash'){
    c.rotate(o.angle+.88);
    var len=o.r*1.9+19,half=len/2,blade=ease((a-.055)/.22)*len-half;
    c.lineCap='round';
    c.shadowColor='#a10e22';c.shadowBlur=12;
    seg(c,-half,-3,half,3,'#430810',7);
    c.shadowBlur=0;
    seg(c,-half,-3,half,3,'#c9223d',3.5);
    seg(c,-half,-5,half,1,'#fff0d3',1.4);
    if(a<.37){
      c.shadowColor='#fff0d4';c.shadowBlur=10;
      seg(c,blade-13,-13,blade+12,9,'#fff5e9',4);
      seg(c,blade-17,-13,blade+10,5,'#de9c91',1.4);
      c.shadowBlur=0;
    }
    for(var i=0;i<17;i++){
      var spread=ease((a-.12)/.3),vx=Math.sin(i*39.31+1)*(.5+i*.28),
          vy=Math.cos(i*9.81)*(.2+i*.1)+spread*spread*13;
      c.globalAlpha=fade*(.4+(i%4)*.13);
      circ(c,Math.sin(i*4.6)*len*.3+vx*spread*19,vy*spread,1+i%3*.4,
        i%3===0?'#f25570':'#850b22');
    }
    c.globalAlpha=fade*.65;seg(c,-half*1.22,-10,half*1.14,9,'#ffd1b9',1);
  }else{
    var charge=ease(a/.15),boom=ease((a-.145)/.24);
    var rad=o.r*(1+charge*1.5)+3;
    var g=c.createRadialGradient(0,0,.5,0,0,rad*3.5);
    g.addColorStop(0,'rgba(255,255,255,.9)');
    g.addColorStop(.28,o.color);
    g.addColorStop(1,'rgba(25,20,40,0)');
    c.fillStyle=g;c.globalAlpha=fade*(1-boom*.65);
    c.beginPath();c.arc(0,0,rad*3.5,0,Math.PI*2);c.fill();
    c.shadowColor=o.color;c.shadowBlur=15;
    circ(c,0,0,rad*(1-boom*.8),'#fff6f1');
    c.shadowBlur=0;
    if(a>.145){
      c.globalAlpha=fade*(1-boom*.28);
      c.strokeStyle=o.color;c.lineWidth=2.8*(1-boom)+.6;
      c.beginPath();c.arc(0,0,rad*.45+boom*(o.r*4.5+23),0,Math.PI*2);c.stroke();
      for(var j=0;j<19;j++){
        var th=j*2.39996+o.angle,dist=boom*(17+o.r*3.4)*(0.5+(j%5)*.15);
        var px=Math.cos(th)*dist,py=Math.sin(th)*dist;
        seg(c,px,py,px+Math.cos(th)*(4+boom*9),py+Math.sin(th)*(4+boom*9),
          j%3===0?'#ffffff':o.color,1.2+j%2);
      }
    }
  }
  c.restore();
}
function drawScreen(c,W,H){
  if(!active)return;
  var e=envelope(),a=reduced?.07:e;
  if(a<.005)return;
  c.save();
  c.globalAlpha=.15*a;c.fillStyle=active.kind==='slash'?'#a52a42':'#cfbaff';
  c.fillRect(0,0,W,H);
  if(!reduced){
    var h=12*a;
    c.globalAlpha=.65*a;c.fillStyle='#05050a';
    c.fillRect(0,0,W,h);c.fillRect(0,H-h,W,h);
  }
  c.restore();
}
CC.CriticalScene={trigger:add,update:update,reset:reset,view:view,rate:rate,
  drawWorld:drawWorld,drawScreen:drawScreen,status:function(){return {active:!!active,kind:active&&active.kind,queued:waiting.length,time:now};}};
})(window);