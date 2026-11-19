/* Emberdeep: KILL SHOT finishers (perfect criticals).
 * A critical blow on a monster at or below 1/3 health has a 1-in-10 chance to be a
 * perfect critical. critical_scene.js hands the doomed monster to this module, which
 * snapshots its REAL sprite and then:
 *   Swordsman  - one freeze-frame slice: the monster is cut in half, organs and blood
 *                show, the halves stand a moment, then fall apart.
 *   Thief      - a cross slash: cut in an X, four wedges slide apart and fall.
 *   Wizard     - a giant glowing blue hole is punched through it; glowing blue pieces fly apart.
 *   Necromancer- the same in green, with soul wisps.
 * Everything is a pure function of the scene clock `t`, so it never touches gameplay state.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{},TAU=Math.PI*2,S=3,N=128,HALF=N/2;
var LEN={swordsman:3.1,thief:3.0,wizard:2.9,necromancer:2.9};
var TITLE={swordsman:'PERFECT SLICE',thief:'CROSS SLASH',wizard:'ARCANE RUPTURE',necromancer:'SOUL RUPTURE'};
var BASE=1,FS=1,T_CUT=.46,T_A=.36,T_B=.6,T_HOLE=.45,T_BURST=1.3;
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t);}
function easeOut(t){t=clamp(t,0,1);return 1-Math.pow(1-t,3);}
function easeIn(t){t=clamp(t,0,1);return t*t;}
function H(i,k){var s=Math.sin(i*127.1+k*311.7)*43758.5453;return s-Math.floor(s);}
function stroke(c,x1,y1,x2,y2,col,w){c.strokeStyle=col;c.lineWidth=w;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
function dot(c,x,y,r,col){c.fillStyle=col;c.beginPath();c.arc(x,y,Math.max(.05,r),0,TAU);c.fill();}
function ell(c,x,y,rx,ry,rot,col){c.fillStyle=col;c.beginPath();c.ellipse(x,y,Math.max(.05,rx),Math.max(.05,ry),rot||0,0,TAU);c.fill();}
function glow(c,x,y,r,col){
 var g=c.createRadialGradient(x,y,0,x,y,Math.max(2,r));
 g.addColorStop(0,col);g.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
}

/* ---------- sprite snapshot ---------- */
function build(o){
 if(o.fx)return o.fx;
 var fx={ok:false};o.fx=fx;
 var E=CC.Enemies,v=null,i;
 for(i=0;i<o.targets.length;i++)if(o.targets[i].id===o.fin.id)v=o.targets[i];
 if(!v||!E||!E.drawSprite)return fx;
 var disp=Object.assign({},v,{dead:false,deadT:0,hp:Math.max(1,v.hp||1),flash:0,_cine:true,
   state:'idle',tele:null,hidden:false});
 var cv=document.createElement('canvas');cv.width=cv.height=N*S;
 var g=cv.getContext('2d');g.scale(S,S);
 try{E.drawSprite(g,disp,HALF,HALF);}catch(err){return fx;}
 var W=N*S,d=g.getImageData(0,0,W,W).data,x0=W,y0=W,x1=-1,y1=-1,x,y;
 for(y=0;y<W;y+=2)for(x=0;x<W;x+=2)if(d[(y*W+x)*4+3]>40){
   if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
 }
 if(x1<0)return fx;
 fx.ok=true;fx.img=cv;fx.data=d;fx.W=W;
 fx.cx=(x0+x1)/2/S-HALF;fx.cy=(y0+y1)/2/S-HALF;
 fx.w=Math.max(8,(x1-x0)/S);fx.h=Math.max(8,(y1-y0)/S);
 fx.r=Math.max(fx.w,fx.h)/2;
 fx.top=y0/S-HALF;fx.bottom=y1/S-HALF;fx.left=x0/S-HALF;fx.right=x1/S-HALF;
 fx.facing=Math.cos(o.angle||0)>=0?1:-1;
 return fx;
}
function alphaAt(fx,x,y){
 var px=Math.round((HALF+x)*S),py=Math.round((HALF+y)*S);
 if(px<0||py<0||px>=fx.W||py>=fx.W)return 0;
 return fx.data[(py*fx.W+px)*4+3];
}
function lineSpec(fx,phi){
 var L={phi:phi,u:[Math.cos(phi),Math.sin(phi)],n:[-Math.sin(phi),Math.cos(phi)],px:fx.cx,py:fx.cy};
 var lo=null,hi=null,s;
 for(s=-HALF;s<=HALF;s+=.5)if(alphaAt(fx,L.px+L.u[0]*s,L.py+L.u[1]*s)>30){if(lo===null)lo=s;hi=s;}
 if(lo===null){lo=-fx.w/2;hi=fx.w/2;}
 L.lo=lo;L.hi=hi;
 return L;
}
function clipHalf(c,L,sg){
 var u=L.u,n=L.n,B=300;
 c.beginPath();
 c.moveTo(L.px-u[0]*B,L.py-u[1]*B);c.lineTo(L.px+u[0]*B,L.py+u[1]*B);
 c.lineTo(L.px+u[0]*B+sg*n[0]*B,L.py+u[1]*B+sg*n[1]*B);
 c.lineTo(L.px-u[0]*B+sg*n[0]*B,L.py-u[1]*B+sg*n[1]*B);
 c.closePath();c.clip();
}

/* ---------- gore: cut faces, organs, spurts ---------- */
function organ(c,kind,x,y,u,rev,seed){
 var s=rev*FS,ang=Math.atan2(u[1],u[0]);
 if(kind===0){ // intestine loops
  c.lineCap='round';c.lineJoin='round';
  c.strokeStyle='#8f2a3d';c.lineWidth=2.5*s;
  c.beginPath();c.moveTo(x-3*u[0],y-3*u[1]);
  for(var k=0;k<3;k++)c.quadraticCurveTo(x+u[0]*(k*2-2)+(k%2?-1.6:1.6)*u[1],y+u[1]*(k*2-2)-(k%2?-1.6:1.6)*u[0],x+u[0]*(k*2-1),y+u[1]*(k*2-1));
  c.stroke();
  c.strokeStyle='#e58b9a';c.lineWidth=1.3*s;c.stroke();
 }else if(kind===1){ // heart / stomach
  ell(c,x,y,2.5*s,1.9*s,ang,'#a6122a');
  ell(c,x-.5,y-.5,1.1*s,.7*s,ang,'#ee5a70');
 }else if(kind===2){ // liver
  ell(c,x,y,3.1*s,1.9*s,ang+.3,'#4a0e1f');
  ell(c,x-.7,y-.4,1.3*s,.6*s,ang+.3,'#7a2036');
 }else if(kind===3){ // pale lung
  ell(c,x,y,2.6*s,2*s,ang,'#d99aa9');
  ell(c,x+.4,y+.3,1.4*s,1*s,ang,'#f1c3cc');
 }else{ // bone
  dot(c,x,y,1.5*s,'#efe6d0');dot(c,x,y,.6*s,'#9d8e72');
 }
}
function face(c,L,sg,s1,s2,rev,seed){
 if(s2-s1<2||rev<=.02)return;
 var u=L.u,n=L.n,dx=sg*n[0],dy=sg*n[1],th=4.2*rev*FS;
 c.save();c.lineCap='butt';
 c.fillStyle='#600a17';c.beginPath();
 c.moveTo(L.px+u[0]*s1,L.py+u[1]*s1);c.lineTo(L.px+u[0]*s2,L.py+u[1]*s2);
 c.lineTo(L.px+u[0]*s2+dx*th,L.py+u[1]*s2+dy*th);
 c.lineTo(L.px+u[0]*s1+dx*th,L.py+u[1]*s1+dy*th);c.closePath();c.fill();
 var len=s2-s1,count=Math.max(2,Math.round(len/5.5)),k;
 for(k=0;k<count;k++){
   var s=s1+len*(k+.5)/count,kind=Math.floor(H(seed,k)*5),depth=th*(.42+.22*H(seed,k+9));
   organ(c,kind,L.px+u[0]*s+dx*depth,L.py+u[1]*s+dy*depth,u,rev,seed+k);
 }
 // wet bright rim along the very edge
 stroke(c,L.px+u[0]*s1,L.py+u[1]*s1,L.px+u[0]*s2,L.py+u[1]*s2,'#ff3550',1.3);
 stroke(c,L.px+u[0]*(s1+len*.2),L.py+u[1]*(s1+len*.2)+dy*.4,
        L.px+u[0]*(s1+len*.55),L.py+u[1]*(s1+len*.55)+dy*.4,'rgba(255,225,228,.85)',.6);
 c.restore();
}
// blood squirting from a seam; drawn in victim space, independent of piece motion
function spurts(c,tc,L,sg,s1,s2,seed,count,t0,t1,power){
 var u=L.u,n=L.n;
 for(var i=0;i<count;i++){
   var born=t0+(t1-t0)*H(seed,i),age=tc-born;
   if(age<0||age>1.1)continue;
   var s=s1+(s2-s1)*H(seed,i+50),sp=(34+H(seed,i+90)*95)*power,sp2=(H(seed,i+7)-.5)*.9;
   var ca=Math.cos(sp2),sa=Math.sin(sp2),dx=sg*n[0],dy=sg*n[1];
   var vx=(dx*ca-dy*sa)*sp,vy=(dx*sa+dy*ca)*sp,bx=L.px+u[0]*s,by=L.py+u[1]*s;
   var x=bx+vx*age,y=by+vy*age+130*age*age;
   var px=bx+vx*(age-.035),py=by+vy*(age-.035)+130*(age-.035)*(age-.035);
   var fade=1-Math.pow(clamp(age/1.1,0,1),3),r=(.5+H(seed,i+20)*.9)*FS;
   c.globalAlpha=BASE*(fade);
   stroke(c,px,py,x,y,i%3?'#b3122a':'#e8334a',r*1.5);
   dot(c,x,y,r,i%4?'#8a0b1c':'#f0485d');
 }
 c.globalAlpha=BASE*(1);
}
function pool(c,fx,tc,t0,gy){
 var k=easeOut((tc-t0)/1.7);
 if(k<=0)return;
 c.save();c.globalAlpha=BASE*(.85);
 ell(c,fx.cx,gy,fx.w*.62*k+1,fx.h*.14*k+.5,0,'#5c0814');
 ell(c,fx.cx+fx.w*.08*k,gy,fx.w*.42*k,fx.h*.09*k,0,'#7f0c1c');
 ell(c,fx.cx-fx.w*.1*k,gy-.4,fx.w*.2*k,fx.h*.04*k,0,'rgba(255,90,100,.3)');
 c.restore();
}
function ground(c,fx,a){
 c.save();c.globalAlpha=BASE*(a);
 ell(c,fx.cx,fx.bottom-1,fx.w*.5,fx.h*.1,0,'rgba(0,0,0,.45)');
 c.restore();
}

/* ---------- slicing (swordsman / thief) ---------- */
function drawPiece(c,fx,lines,sigmas,xf,facers){
 c.save();
 c.translate(xf.dx,xf.dy);
 if(xf.rot){c.translate(xf.px,xf.py);c.rotate(xf.rot);c.translate(-xf.px,-xf.py);}
 c.save();
 for(var i=0;i<lines.length;i++)clipHalf(c,lines[i],sigmas[i]);
 c.drawImage(fx.img,-HALF,-HALF,N,N);
 c.restore();
 // cut faces are clipped to the same wedge so organs can't spill over a neighbor
 c.save();
 for(i=0;i<lines.length;i++)clipHalf(c,lines[i],sigmas[i]);
 if(facers)facers(c);
 c.restore();
 c.restore();
}
function slashStreak(c,L,t,start,dur,a,colors,wide){
 var k=(t-start)/dur;if(k<0||k>1.9)return;
 var head=k<=1?easeOut(k):1,tail=k<=1?0:easeOut(k-1);
 var sa=a>0?L.lo:L.hi,sb=a>0?L.hi:L.lo,ext=18;
 var s0=sa+(sb-sa)*tail,s1=sa+(sb-sa)*head;
 var u=L.u,x0=L.px+u[0]*(s0-Math.sign(sb-sa)*ext*(tail>0?0:1)),y0=L.py+u[1]*(s0-Math.sign(sb-sa)*ext*(tail>0?0:1)),
     x1=L.px+u[0]*(s1+Math.sign(sb-sa)*ext*.4),y1=L.py+u[1]*(s1+Math.sign(sb-sa)*ext*.4);
 var fade=1-smooth((k-1)/.9);
 c.save();c.lineCap='round';c.globalAlpha=BASE*(fade);
 c.shadowColor=colors[0];c.shadowBlur=14;
 stroke(c,x0,y0,x1,y1,colors[1],wide*1.9);
 c.shadowBlur=0;
 stroke(c,x0,y0,x1,y1,colors[2],wide*.95);
 stroke(c,x0,y0,x1,y1,'#ffffff',wide*.4);
 c.restore();
}
function sparks(c,x,y,t,start,col,n,seed){
 var age=t-start;if(age<0||age>.7)return;
 for(var i=0;i<n;i++){
   var a=H(seed,i)*TAU,v=40+H(seed,i+5)*110,r=v*easeOut(age/.5)*.55;
   c.globalAlpha=BASE*(1-age/.7);
   stroke(c,x+Math.cos(a)*r*.6,y+Math.sin(a)*r*.6,x+Math.cos(a)*r,y+Math.sin(a)*r,col,1.2);
 }
 c.globalAlpha=BASE*(1);
}

function swordsman(c,o,fx,t){
 var tc=t-T_CUT,right=fx.facing>0;
 var phi=right?-.3:Math.PI+.3,L=lineSpec(fx,phi);
 var upper=L.n[1]<0?1:-1,lower=-upper,rd=right?1:-1;
 ground(c,fx,.5);
 var seamA=1-smooth((tc-.1)/.6);
 if(tc<.05){
   c.drawImage(fx.img,-HALF,-HALF,N,N);
 }else{
   var slide=easeOut((tc-.04)/1.15)*9,tf=tc-1.15;
   var uxf={dx:L.u[0]*slide*.92,dy:L.u[1]*slide*.92,rot:0,px:0,py:0},
       lxf={dx:0,dy:0,rot:0,px:0,py:0};
   if(tf>0){
     var gdrop=fx.h*.34;
     var fall=Math.min(1,tf/.85),bounce=tf>.85?Math.exp(-7*(tf-.85))*Math.sin((tf-.85)*16)*.07:0;
     uxf.px=L.px+L.u[0]*L.hi;uxf.py=L.py+L.u[1]*L.hi;
     uxf.rot=rd*(1.5*easeIn(fall)+bounce*3);
     uxf.dx+=rd*10*easeIn(fall);uxf.dy+=gdrop*easeIn(fall)+(bounce>0?-bounce*10:0);
     var lf=Math.min(1,Math.max(0,tf-.22)/.95),lb=tf>1.17?Math.exp(-6*(tf-1.17))*Math.sin((tf-1.17)*14)*.05:0;
     lxf.px=fx.cx-rd*fx.w/2;lxf.py=fx.bottom;
     lxf.rot=-rd*(.9*easeIn(lf)+lb*3);lxf.dx=-rd*5*easeIn(lf);lxf.dy=fx.h*.05*easeIn(lf);
   }else{ // standing, swaying faintly with the shock
     uxf.dy+=Math.sin(tc*9)*.35*Math.exp(-tc*2);
   }
   var rev=smooth((tc-.02)/.35),seed=Math.floor(fx.w*7+fx.h);
   pool(c,fx,tc,.6,fx.bottom-1);
   drawPiece(c,fx,[L],[lower],lxf,function(g){face(g,L,upper,L.lo,L.hi,rev,seed);});
   drawPiece(c,fx,[L],[upper],uxf,function(g){face(g,L,lower,L.lo,L.hi,rev,seed+31);});
   // blood: shoots from both faces, then runs and pools
   spurts(c,tc,L,upper,L.lo,L.hi,seed,26,.02,1.15,1);
   spurts(c,tc,L,lower,L.lo,L.hi,seed+77,22,.02,1.0,.75);
   if(tc>.2&&tf<.3){ // thick drips off the lower stump
     for(var d=0;d<6;d++){
       var dx=L.px+L.u[0]*(L.lo+(L.hi-L.lo)*(d+.5)/6),dy=L.py+L.u[1]*(L.lo+(L.hi-L.lo)*(d+.5)/6);
       var len=Math.min(4+H(seed,d)*3,(tc-.2)*(2+H(seed,d)*3));
       stroke(c,dx,dy+1,dx,dy+1+len,'#8a0b1c',.7);
     }
   }
 }
 // seam glow & the slash itself (freeze frame: a bright line hangs on the body)
 var u=L.u,ax=L.px+u[0]*L.lo,ay=L.py+u[1]*L.lo,bx=L.px+u[0]*L.hi,by=L.py+u[1]*L.hi;
 if(tc>-.2&&tc<.7){
   c.save();c.lineCap='round';c.globalAlpha=BASE*(clamp(seamA,0,1));
   c.shadowColor='#5ac8ff';c.shadowBlur=12;
   stroke(c,ax-u[0]*10,ay-u[1]*10,bx+u[0]*10,by+u[1]*10,'#8fe4ff',2.2);
   c.shadowBlur=0;stroke(c,ax,ay,bx,by,'#ffffff',1);
   c.restore();
 }
 slashStreak(c,L,t,T_CUT-.15,.17,1,['#35a8ff','#2f7dff','#bff0ff'],4.2);
 var flash=Math.exp(-Math.pow((tc)/.055,2));
 if(flash>.02){glow(c,L.px,L.py,fx.r*2.3,'rgba(210,240,255,'+(.85*flash)+')');}
 sparks(c,L.px,L.py,t,T_CUT,'#cfeeff',16,3);
}

function thief(c,o,fx,t){
 var tc=t-T_B,right=fx.facing>0;
 var LA=lineSpec(fx,Math.PI/4),LB=lineSpec(fx,-Math.PI/4),lines=[LA,LB];
 ground(c,fx,.5);
 var specs=[ // sigmas relative to (LA,LB), outward direction, spin, pivot, rest drop
  {sg:[-1,-1],dir:[0,-1],spin:right?.85:-.85,piv:[fx.cx,fx.cy-fx.h*.3],drop:fx.h*.36},   // top
  {sg:[1,1],dir:[0,1],spin:right?-.3:.3,piv:[fx.cx,fx.cy+fx.h*.3],drop:fx.h*.04},          // bottom
  {sg:[1,-1],dir:[-1,0],spin:-1.15,piv:[fx.cx-fx.w*.3,fx.cy],drop:fx.h*.3},                // left
  {sg:[-1,1],dir:[1,0],spin:1.15,piv:[fx.cx+fx.w*.3,fx.cy],drop:fx.h*.3}                   // right
 ];
 var cutsA=smooth((t-T_A+.1)/.1),cutsB=smooth((t-T_B+.1)/.1);
 if(tc<.05){
   c.drawImage(fx.img,-HALF,-HALF,N,N);
 }else{
   var sep=easeOut((tc-.05)/1.05),tf=tc-1.0,seed=Math.floor(fx.w*5+fx.h);
   pool(c,fx,tc,.75,fx.bottom-1);
   for(var i=0;i<4;i++){
     var sp=specs[i],xf={dx:sp.dir[0]*sep*8,dy:sp.dir[1]*sep*8,rot:0,px:sp.piv[0],py:sp.piv[1]};
     if(tf>0){
       var f=Math.min(1,tf/.85),delay=(i%2)*.08,ff=Math.min(1,Math.max(0,tf-delay)/.85);
       xf.rot=sp.spin*easeIn(ff);
       xf.dx+=sp.dir[0]*12*easeOut(ff)+(sp.spin>0?5:-5)*easeIn(ff);
       xf.dy+=sp.drop*easeIn(ff)*(sp.dir[1]<0?1:.9);
       if(tf>.85)xf.dy-=Math.exp(-8*(tf-.85))*Math.abs(Math.sin((tf-.85)*17))*3;
     }
     var rev=smooth((tc-.02)/.35),idx=i;
     drawPiece(c,fx,lines,sp.sg,xf,function(g){
       for(var j=0;j<2;j++){
         var Lj=lines[j],o2=lines[1-j],sgj=sp.sg[j],sgo=sp.sg[1-j];
         var tot=Math.sign(Lj.u[0]*o2.n[0]+Lj.u[1]*o2.n[1])*sgo,s1,s2;
         if(tot>0){s1=0;s2=Lj.hi;}else{s1=Lj.lo;s2=0;}
         face(g,Lj,sgj,s1,s2,rev,seed+idx*13+j*5);
       }
     });
   }
   spurts(c,tc,LA,1,LA.lo*.5,LA.hi*.5,seed,22,.02,.9,.9);
   spurts(c,tc,LB,1,LB.lo*.5,LB.hi*.5,seed+40,22,.02,.9,.9);
   spurts(c,tc,LA,-1,LA.lo*.5,LA.hi*.5,seed+80,18,.02,.9,.9);
   spurts(c,tc,LB,-1,LB.lo*.5,LB.hi*.5,seed+120,18,.02,.9,.9);
 }
 // two glowing cuts hang in the air until the body parts, plus the slash streaks
 var colors=['#e2243f','#c0142e','#ff6b7e'];
 [[LA,T_A,cutsA,1],[LB,T_B,cutsB,-1]].forEach(function(q){
   var L=q[0],u=L.u,age=t-q[1];
   if(age>-.05&&age<.8){
     c.save();c.lineCap='round';c.globalAlpha=BASE*(clamp(1-age/.8,0,1)*smooth((age+.05)/.06));
     c.shadowColor='#ff3a56';c.shadowBlur=12;
     stroke(c,L.px+u[0]*L.lo,L.py+u[1]*L.lo,L.px+u[0]*L.hi,L.py+u[1]*L.hi,'#ff8091',2);
     c.shadowBlur=0;
     stroke(c,L.px+u[0]*L.lo,L.py+u[1]*L.lo,L.px+u[0]*L.hi,L.py+u[1]*L.hi,'#fff',.9);
     c.restore();
   }
   slashStreak(c,L,t,q[1]-.12,.13,q[3],colors,3.8);
   sparks(c,L.px,L.py,t,q[1],'#ffd2d8',12,q[3]>0?5:9);
 });
 var f2=Math.exp(-Math.pow(tc/.06,2));
 if(f2>.02)glow(c,fx.cx,fx.cy,fx.r*2.1,'rgba(255,200,205,'+(.8*f2)+')');
}

/* ---------- rupture (wizard / necromancer) ---------- */
var THEMES={
 wizard:{main:[64,168,255],light:'#d6f3ff',mid:'#5cc8ff',deep:'#1741c8',dark:'#050c2a',tint:'rgba(70,170,255,'},
 necromancer:{main:[70,230,120],light:'#d4ffd9',mid:'#5ee889',deep:'#16803a',dark:'#02140a',tint:'rgba(70,230,130,'}
};
function rgba(a,al){return 'rgba('+a[0]+','+a[1]+','+a[2]+','+al+')';}
function ragged(g,R,seed,wob){
 var n=24;g.beginPath();
 for(var i=0;i<n;i++){
   var a=i/n*TAU,r=R*(.84+.3*H(seed,i)+(wob?Math.sin(wob*6+i)*.03:0));
   if(i)g.lineTo(Math.cos(a)*r,Math.sin(a)*r);else g.moveTo(Math.cos(a)*r,Math.sin(a)*r);
 }
 g.closePath();
}
function holeImage(fx,th,R,tint,crack,pulse){
 if(!fx.tmp){fx.tmp=document.createElement('canvas');fx.tmp.width=fx.tmp.height=fx.W;}
 var g=fx.tmp.getContext('2d'),hx=(HALF+fx.cx)*S,hy=(HALF+fx.cy)*S;
 g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.globalAlpha=1;
 g.clearRect(0,0,fx.W,fx.W);
 g.drawImage(fx.img,0,0);
 g.globalCompositeOperation='source-atop';
 g.fillStyle=th.tint+(.7*tint)+')';g.fillRect(0,0,fx.W,fx.W);
 if(R>0){
   var gr=g.createRadialGradient(hx,hy,R*S*.75,hx,hy,R*S*2.1);
   gr.addColorStop(0,'rgba(255,255,255,'+(.95*pulse)+')');
   gr.addColorStop(.18,rgba(th.main,.95*pulse));
   gr.addColorStop(.55,rgba(th.main,.4*pulse));
   gr.addColorStop(1,rgba(th.main,0));
   g.fillStyle=gr;g.fillRect(0,0,fx.W,fx.W);
   // radial fracture lines of light spreading through the body
   if(crack>0){
     g.save();g.translate(hx,hy);g.scale(S,S);g.lineCap='round';
     for(var i=0;i<11;i++){
       var a=i*TAU/11+H(i,3)*.5,len=(R*1.1+H(i,8)*fx.r*.9)*crack,px=Math.cos(a)*R*.9,py=Math.sin(a)*R*.9;
       g.beginPath();g.moveTo(px,py);
       for(var k=1;k<=4;k++){
         var rr=R*.9+(len-R*.9)*k/4,aa=a+(H(i,k+20)-.5)*.35;
         g.lineTo(Math.cos(aa)*rr,Math.sin(aa)*rr);
       }
       g.strokeStyle=rgba(th.main,.95);g.lineWidth=1.8;g.stroke();
       g.strokeStyle='#fff';g.lineWidth=.6;g.stroke();
     }
     g.restore();
   }
   g.globalCompositeOperation='destination-out';
   g.save();g.translate(hx,hy);g.scale(S,S);ragged(g,R,Math.floor(fx.w+fx.h),0);g.fillStyle='#000';g.fill();g.restore();
 }
 g.globalCompositeOperation='source-over';
 return fx.tmp;
}
function rupture(c,o,fx,t,necro){
 var th=necro?THEMES.necromancer:THEMES.wizard;
 var hx=fx.cx,hy=fx.cy,Rmax=Math.max(7,(fx.w+fx.h)*.165);
 var charge=smooth(t/T_HOLE),open=easeOut((t-T_HOLE)/.55),R=Rmax*open;
 var burst=t-T_BURST,pulse=.78+.22*Math.sin(t*17);
 var i,a;
 ground(c,fx,burst<0?.5:clamp(.5-burst*.4,0,.5));
 // inbound energy gathering at the point of impact
 if(t<T_HOLE+.1){
   var side=o.sourceX<o.x?-1:1;
   glow(c,hx,hy,fx.r*(.5+charge*1.1),rgba(th.main,.5*charge));
   for(i=0;i<16;i++){
     var ph=(t*1.6+H(i,1))%1,ang=H(i,2)*TAU,dist=fx.r*2.6*(1-ph);
     var px=hx+Math.cos(ang)*dist,py=hy+Math.sin(ang)*dist*.8;
     c.globalAlpha=BASE*(Math.sin(ph*Math.PI)*charge);
     stroke(c,px,py,hx+Math.cos(ang)*(dist-6),hy+Math.sin(ang)*(dist-6)*.8,th.light,1.4);
   }
   c.globalAlpha=BASE*(1);
   if(side&&t<T_HOLE){ // the bolt itself driving in from the hero's side
     var bt=easeIn(t/T_HOLE),bx=hx+side*fx.r*3.2*(1-bt),by=hy-fx.r*.4*(1-bt);
     glow(c,bx,by,18,rgba(th.main,.9));dot(c,bx,by,4,'#fff');
   }
 }
 if(burst<0){
   var shake=t>T_HOLE&&t<T_HOLE+.18?Math.sin(t*140)*1.5*(1-(t-T_HOLE)/.18):0;
   c.save();c.translate(shake,0);
   var crack=smooth((t-(T_HOLE+.3))/.4);
   var img=holeImage(fx,th,R,smooth(t/(T_BURST*.8))*(necro?.55:.7)+.1*charge,crack,pulse);
   c.save();
   c.shadowColor=rgba(th.main,1);c.shadowBlur=10+8*pulse;
   c.drawImage(img,-HALF,-HALF,N,N);
   c.restore();
   if(R>1){
     // the hole: black void rimmed with fire, swirling energy inside
     c.save();c.translate(hx,hy);
     ragged(c,R*.96,Math.floor(fx.w+fx.h),0);
     c.fillStyle=th.dark;c.fill();c.save();c.clip();
     var g2=c.createRadialGradient(0,0,0,0,0,R);
     g2.addColorStop(0,rgba(th.main,.0));g2.addColorStop(.6,rgba(th.main,.12));g2.addColorStop(1,rgba(th.main,.7));
     c.fillStyle=g2;c.fillRect(-R,-R,R*2,R*2);
     for(i=0;i<5;i++){
       var a0=i*TAU/5+t*(necro?-3:4);
       c.strokeStyle=rgba(th.main,.7);c.lineWidth=1.2;c.beginPath();
       for(var k=0;k<=14;k++){
         var rr=R*(.12+k/14*.88),aa=a0+k*.22*(necro?-1:1);
         if(k)c.lineTo(Math.cos(aa)*rr,Math.sin(aa)*rr);else c.moveTo(Math.cos(aa)*rr,Math.sin(aa)*rr);
       }
       c.stroke();
     }
     glow(c,0,0,R*.5,'rgba(255,255,255,'+(.45*pulse)+')');
     c.restore();
     c.shadowColor=rgba(th.main,1);c.shadowBlur=16;
     ragged(c,R*.98,Math.floor(fx.w+fx.h),t);c.strokeStyle=th.light;c.lineWidth=1.6;c.stroke();
     c.shadowBlur=0;ragged(c,R*1.04,Math.floor(fx.w+fx.h),t);c.strokeStyle=rgba(th.main,.9);c.lineWidth=2.4;c.stroke();
     // sparks leaping from the rim
     for(i=0;i<18;i++){
       var s0=(t*1.3+H(i,5))%1,ga=H(i,6)*TAU,rr2=R*(1+s0*1.1);
       c.globalAlpha=BASE*((1-s0)*.9);
       if(necro)dot(c,Math.cos(ga)*rr2,Math.sin(ga)*rr2-s0*8,1.3,i%2?th.light:th.mid);
       else{var sx=Math.cos(ga)*rr2,sy=Math.sin(ga)*rr2;stroke(c,sx,sy,sx+Math.cos(ga)*5,sy+Math.sin(ga)*5,th.light,1.2);}
     }
     c.globalAlpha=BASE*(1);
     c.restore();
   }
   c.restore();
   // impact flash
   var fl=Math.exp(-Math.pow((t-T_HOLE-.03)/.07,2));
   if(fl>.02)glow(c,hx,hy,fx.r*2.6,'rgba(255,255,255,'+(.9*fl)+')');
   if(t>T_HOLE&&t<T_HOLE+.7){
     var rk=(t-T_HOLE)/.7;c.globalAlpha=BASE*(1-rk);
     c.strokeStyle=th.light;c.lineWidth=3*(1-rk)+.6;c.beginPath();c.arc(hx,hy,fx.r*(.3+rk*2.4),0,TAU);c.stroke();
     c.globalAlpha=BASE*(1);
   }
   // the freeze: the whole body hums with light, rune ring turning around it
   if(t>.95){
     var hum=smooth((t-.95)/.2);
     c.save();c.translate(hx,hy);c.globalAlpha=BASE*(hum*.9);
     c.strokeStyle=rgba(th.main,.8);c.lineWidth=1.2;c.setLineDash([3,4]);
     c.rotate(t*(necro?-2:3));c.beginPath();c.arc(0,0,fx.r*1.55,0,TAU);c.stroke();c.setLineDash([]);
     for(i=0;i<8;i++){var ra=i*TAU/8;dot(c,Math.cos(ra)*fx.r*1.55,Math.sin(ra)*fx.r*1.55,1.6,th.light);}
     c.restore();
   }
 }else{
   // BURST: glowing fragments tear free of the hole and fly apart
   var src=fx.frozen||(fx.frozen=(function(){
     var im=holeImage(fx,th,Rmax,.85,1,1);
     var cp=document.createElement('canvas');cp.width=cp.height=fx.W;cp.getContext('2d').drawImage(im,0,0);return cp;})());
   var bands=[0,Rmax*1.3,Rmax*2.1,400],wedges=8,id=0,age=burst;
   var fade=1-smooth((age-1.0)/.55);
   var shock=easeOut(age/.55);
   if(age<.6){
     c.globalAlpha=BASE*(1-age/.6);c.strokeStyle=th.light;c.lineWidth=4*(1-age/.6)+.8;
     c.beginPath();c.arc(hx,hy,Rmax*(1+shock*4.5),0,TAU);c.stroke();
     c.strokeStyle=rgba(th.main,.9);c.lineWidth=2;c.beginPath();c.arc(hx,hy,Rmax*(.8+shock*3.2),0,TAU);c.stroke();
     c.globalAlpha=BASE*(1);
     glow(c,hx,hy,Rmax*(2+shock*3),rgba(th.main,.6*(1-age/.6)));
     glow(c,hx,hy,Rmax*1.8,'rgba(255,255,255,'+(.9*Math.exp(-age*9))+')');
   }
   if(fade>.01){
     for(var b=0;b<3;b++)for(var w=0;w<wedges;w++,id++){
       var a0=w/wedges*TAU+H(b,w)*.2,a1=(w+1)/wedges*TAU+H(b,w+1)*.2;
       var am=(a0+a1)/2,rmid=Math.min(bands[b]+(bands[b+1]-bands[b])*.5,Rmax*3.3);
       var dirx=Math.cos(am),diry=Math.sin(am);
       var speed=(5+H(id,1)*9)*(.8+b*.4),mv=easeOut(age/1.5)*speed*2.6;
       var delay=H(id,4)*.08,lt=clamp((age-delay)/1.3,0,1);
       var cxp=hx+dirx*rmid,cyp=hy+diry*rmid*.9;
       var dx=dirx*mv,dy=diry*mv*.9-(necro?easeIn(age/1.6)*10:0)+(necro?0:easeIn(age/2)*7);
       var rot=(H(id,2)-.5)*3.2*easeOut(age/1.4),sc=1-.35*smooth((age-.7)/.8);
       c.save();
       c.globalAlpha=BASE*(fade);
       c.translate(cxp+dx,cyp+dy);c.rotate(rot);c.scale(sc,sc);c.translate(-cxp,-cyp);
       c.shadowColor=rgba(th.main,1);c.shadowBlur=9;
       c.save();
       c.translate(hx,hy);c.beginPath();
       c.arc(0,0,bands[b+1],a0,a1);c.arc(0,0,bands[b],a1,a0,true);c.closePath();c.clip();
       c.translate(-hx,-hy);
       c.drawImage(src,-HALF,-HALF,N,N);
       c.globalCompositeOperation='lighter';c.globalAlpha=BASE*(fade*.5*(1-smooth(age/1.3)));
       c.drawImage(src,-HALF,-HALF,N,N);
       c.restore();
       // glowing broken edges
       c.shadowBlur=0;c.globalAlpha=BASE*(fade*(1-smooth(age/1.2))*.9);
       c.strokeStyle=th.light;c.lineWidth=1.1;
       c.beginPath();c.moveTo(hx+Math.cos(a0)*Math.max(R*.9,bands[b]),hy+Math.sin(a0)*Math.max(R*.9,bands[b]));
       c.lineTo(hx+Math.cos(a0)*Math.min(bands[b+1],Rmax*5),hy+Math.sin(a0)*Math.min(bands[b+1],Rmax*5));c.stroke();
       c.restore();
       // trailing motes behind each flying chunk
       if(age<1.4&&b<2){
         c.globalAlpha=BASE*(fade*.7*(1-lt));
         for(var m=1;m<=3;m++){
           var back=m*.045,mvb=easeOut(Math.max(0,age-back)/1.5)*speed*2.6;
           dot(c,cxp+dirx*mvb,cyp+diry*mvb*.9,1.8-m*.35,m%2?th.light:th.mid);
         }
         c.globalAlpha=BASE*(1);
       }
     }
   }
   // motes, shards / soul wisps
   for(i=0;i<46;i++){
     var ma=H(i,1)*TAU,mv2=(28+H(i,2)*100)*easeOut(age/1.8),life=.9+H(i,3)*1.3;
     if(age>life)continue;
     var mx=hx+Math.cos(ma)*mv2,my=hy+Math.sin(ma)*mv2*.85-(necro?age*age*16:-age*age*10);
     c.globalAlpha=BASE*(1-age/life);
     if(necro){
       dot(c,mx,my,1+H(i,4)*1.4,i%3?th.mid:th.light);
       if(i%9===0){ // little ghostly skulls drifting up
         c.save();c.translate(mx,my-age*8);c.scale(.5,.5);
         ell(c,0,0,5,6,0,th.light);dot(c,-2,-1,1.4,th.dark);dot(c,2,-1,1.4,th.dark);
         c.restore();
       }
     }else{
       c.save();c.translate(mx,my);c.rotate(age*4+i);
       c.fillStyle=i%3?th.mid:th.light;c.beginPath();c.moveTo(0,-3);c.lineTo(1.5,0);c.lineTo(0,3);c.lineTo(-1.5,0);c.closePath();c.fill();
       c.restore();
     }
   }
   c.globalAlpha=BASE*(1);
   if(necro&&age>.3){ // rising green smoke from where the body was
     for(i=0;i<7;i++){
       var sa2=clamp((age-.3-i*.05)/1.4,0,1);if(sa2<=0)continue;
       c.globalAlpha=BASE*((1-sa2)*.35);
       glow(c,hx+Math.sin(i*2.3+age*3)*8,hy-sa2*36-i*2,10+sa2*14,rgba(th.main,.8));
     }
     c.globalAlpha=BASE*(1);
   }
 }
}

/* ---------- public ---------- */
function drawVictim(c,o,t){
 var fx=build(o);
 if(!fx.ok)return false;
 var k=o.heroClass;
 BASE=smooth((o.duration-t)/.45);FS=clamp(fx.r/12,.55,1.25);
 c.save();
 var scale=1.23;
 // victim sits at its world position, magnified like the other cinematic targets
 var q=null;for(var i=0;i<o.targets.length;i++)if(o.targets[i].id===o.fin.id)q=o.targets[i];
 c.translate(o.fin.sx,o.fin.sy);c.scale(scale,scale);
 if(k==='swordsman')swordsman(c,o,fx,t);
 else if(k==='thief')thief(c,o,fx,t);
 else rupture(c,o,fx,t,k==='necromancer');
 c.restore();
 return true;
}
function heroPose(o,t){
 // wind-up, then hold the follow-through while the freeze plays out, then recover
 var end=o.duration;
 var kneel=smooth(t/.32)*(1-smooth((t-(end-.7))/.5));
 var drive=smooth((t-.28)/.17)*(1-.7*smooth((t-.62)/.5))*(1-smooth((t-(end-.7))/.5));
 var wd=smooth((t-.62)/.5);
 return {kneel:kneel,drive:drive,withdraw:wd};
}
CC.Finisher={
 LEN:LEN,TITLE:TITLE,
 build:build,drawVictim:drawVictim,heroPose:heroPose,
 colors:function(k){return k==='necromancer'?'#52e88a':k==='wizard'?'#5cc8ff':'#ff334e';},
 // kill-shot flash timing used by the screen overlay (0..1)
 flash:function(k,t){
   if(k==='swordsman')return Math.exp(-Math.pow((t-T_CUT)/.05,2));
   if(k==='thief')return Math.max(Math.exp(-Math.pow((t-T_A)/.04,2))*.6,Math.exp(-Math.pow((t-T_B)/.05,2)));
   return Math.max(Math.exp(-Math.pow((t-T_HOLE-.03)/.06,2)),Math.exp(-Math.pow((t-T_BURST)/.07,2))*.8);
 }
};
})(window);
