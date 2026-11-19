/* Emberdeep anatomical wounds: jagged, species-specific severed silhouettes.
 * No rectangular sprite erasure; torn fur, flesh, ivory bone and blood drip on living foes.
 */
(function(root){
'use strict';
var CC=root.CC=root.CC||{}, E=CC.Enemies, PI=Math.PI, TAU=PI*2;
function rand(i,n){var v=Math.sin(i*73.341+n*17.139+1.25)*35931.13;return v-Math.floor(v);}
function outline(c,pts){
  c.moveTo(pts[0][0],pts[0][1]);for(var i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);c.closePath();
}
function profile(e,slot,r){
  // Bounds are intentionally asymmetrical, irregular and anatomy-relative.
  var bear=e.type==='bear',x=0,y=0,sx=1,sy=1,base=slot;
  if(slot==='legLeft'){x=bear?-.76*r:-.43*r;y=bear?.64*r:.76*r;sx=bear?.61: .42;sy=bear?.8:.72;}
  else if(slot==='legRight'){x=bear?.66*r:.45*r;y=bear?.57*r:.7*r;sx=bear?.57:.42;sy=bear?.81:.62;}
  else if(slot==='armLeft'){x=bear?-.99*r:-.83*r;y=bear?-.04*r:.1*r;sx=bear?.60:.55;sy=bear?.65:.7;}
  else if(slot==='armRight'){x=bear?1.05*r:.83*r;y=bear?.03*r:.1*r;sx=bear?.62:.55;sy=bear?.65:.7;}
  else if(slot==='head'){x=bear?.87*r:0;y=bear?-.3*r:-.8*r;sx=bear?.77:.67;sy=bear?.68:.70;}
  else if(slot.indexOf('horn')===0){x=(slot==='hornLeft'?-1:1)*r*.61;y=-r*.93;sx=.35;sy=.44;}
  else if(slot==='tail'){x=-1.1*r;y=r*.22;sx=.6;sy=.46;}
  else {x=-.3*r;y=.2*r;sx=.4;sy=.5;}
  // Distinct per-monster bite of the silhouette: crook of a scorpion / hollow scarecrow etc.
  if(e.type==='scarecrow')sx*=1.22;
  if(e.type==='horror')sy*=1.2;
  return {x:x,y:y,rx:r*sx,ry:r*sy,slot:base};
}
function tearPoints(p,r,slot){
  var x=p.x,y=p.y,a=p.rx,b=p.ry;
  // Closed wound is hand-shaped; uneven notches, dangling ragged tips. Never a rectangle.
  return [[x-a*.82,y-b*.24],[x-a*.96,y-b*.63],[x-a*.58,y-b*.48],
    [x-a*.31,y-b*.95],[x-a*.13,y-b*.67],[x+a*.22,y-b*.91],
    [x+a*.35,y-b*.58],[x+a*.79,y-b*.89],[x+a*.62,y-b*.40],
    [x+a*1.02,y-b*.06],[x+a*.66,y+b*.19],[x+a*.88,y+b*.57],
    [x+a*.46,y+b*.5],[x+a*.15,y+b*1.09],
    [x-a*.06,y+b*.71],[x-a*.45,y+b*.96],
    [x-a*.55,y+b*.52],[x-a*1.07,y+b*.45],[x-a*.71,y+b*.07]];
}
function clip(c,e,look,r){
  var missing=e.missing||{},names=Object.keys(missing).filter(function(k){return missing[k];});
  if(!names.length)return;
  c.beginPath();c.rect(-r*5,-r*5,r*10,r*10);
  for(var i=0;i<names.length;i++){
    if(names[i]==='chunk')continue;
    var p=profile(e,names[i],r);
    var pts=tearPoints(p,r,names[i]);
    outline(c,pts);
  }
  c.clip('evenodd');
}
function stroke(c,x,y,x2,y2,col,w){
 c.strokeStyle=col;c.lineWidth=w;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();
}
function dot(c,x,y,rx,ry,col){
 c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();
}
function drawWound(c,e,p,r,slot,t,i){
  var bear=e.type==='bear',bone=e.type==='skeleton' || e.type==='archer',
    scarecrow=e.type==='scarecrow',horror=e.type==='horror';
  var x=p.x,y=p.y,rx=p.rx,ry=p.ry,blood=e.type==='horror'?'#7a1952':bone?'#6e473f':scarecrow?'#a88a42':'#a7112b';
  var onLeft=x<0, edgeX=x+(onLeft?rx*.44:-rx*.44),edgeY=y-ry*.1;
  // Deep velvet-dark wound base with lacerated red muscular fibers.
  c.save();c.shadowColor=blood;c.shadowBlur=2;
  dot(c,edgeX,edgeY,Math.max(2,rx*.43),Math.max(2,ry*.44),bone?'#30251d':scarecrow?'#38281d':'#32070e');
  c.shadowBlur=0;
  if(bear){
    // Flayed irregular fur and wound rim with dark subcutaneous fat.
    for(var k=0;k<7;k++){
      var a=(k/7)*TAU,xx=edgeX+Math.cos(a)*rx*.40,yy=edgeY+Math.sin(a)*ry*.45;
      stroke(c,xx,yy,xx+Math.cos(a)*rx*.32,yy+Math.sin(a)*ry*.34,
        k%2?'#62402c':'#221511',1.3+(k%3)*.35);
    }
    dot(c,edgeX+2,edgeY,rx*.29,ry*.31,'#7c1724');
    // Exposed tibia/fibula on severed legs, bright fractured marrow at splintered tips.
    if(slot.indexOf('leg')===0||slot.indexOf('arm')===0){
      var side=x<0?-1:1;
      stroke(c,edgeX,edgeY+ry*.09,edgeX+side*rx*.60,edgeY+ry*.64,'#69423a',5);
      stroke(c,edgeX,edgeY-ry*.04,edgeX+side*rx*.67,edgeY+ry*.55,'#e8d8b4',3.4);
      stroke(c,edgeX+1,edgeY-ry*.10,edgeX+side*rx*.59,edgeY+ry*.49,'#fff1cd',1.2);
      c.fillStyle='#f6e8c2';c.beginPath();
      c.moveTo(edgeX+side*rx*.56,edgeY+ry*.4);
      c.lineTo(edgeX+side*rx*.87,edgeY+ry*.47);
      c.lineTo(edgeX+side*rx*.64,edgeY+ry*.65);
      c.fill();
    }
    // Separated skin and tendon strands; subtle movement with wounded gait.
    for(k=0;k<4;k++){
      var xx=edgeX+(k-1.5)*rx*.19,yy=edgeY+ry*.24;
      c.beginPath();c.strokeStyle=k%2?'#a33742':'#d16b64';c.lineWidth=1.6;
      c.moveTo(xx,yy);c.quadraticCurveTo(xx+Math.sin(t*4+k)*2,yy+ry*.42,xx+(k-2)*1.7,yy+ry*.70);c.stroke();
    }
  }else if(scarecrow){
    // Straw bursts from pitch-black sleeves, spilling old bird feathers.
    for(k=0;k<8;k++){
      var ang=k*2.399,ex=edgeX+Math.cos(ang)*rx*.61,ey=edgeY+Math.sin(ang)*ry*.45;
      stroke(c,edgeX,edgeY,ex,ey,k%2?'#e8ca79':'#73502e',1.3);
    }
  }else{
    for(k=0;k<5;k++){
      var a=k*2.399,ex=edgeX+Math.cos(a)*rx*.41,ey=edgeY+Math.sin(a)*ry*.52;
      stroke(c,edgeX,edgeY,ex,ey,bone?'#a99e90':horror?'#a35bba':'#b73340',1.3);
    }
    // Scorpion-like cuticle shards or fragments of dark sinew.
    if(e.type==='scorpion'||e.type==='spider'){
      c.fillStyle='#b6a07d';c.beginPath();c.moveTo(edgeX-3,edgeY);
      c.lineTo(edgeX+2,edgeY-5);c.lineTo(edgeX+5,edgeY+2);c.fill();
    }
  }
  // Blood runs continuously down the cut, heavier in first 3 s after severance.
  if(!bone&&!scarecrow){
    var age=0;if(e.nubs)for(k=0;k<e.nubs.length;k++)if(e.nubs[k].slot===slot){age=e.nubs[k].t;break;}
    var pressure=age<3?1:.46,travel=ry*(.43+.23*Math.sin(t*8+i));
    for(k=0;k<(bear?5:3);k++){
      var xx=edgeX+(k-2)*rx*.12,flow=travel+(k%2)*ry*.28;
      c.lineWidth=(k%2?1.2:2)*pressure;c.strokeStyle=k%2?'#ed344b':blood;
      c.beginPath();c.moveTo(xx,edgeY+ry*.18);c.bezierCurveTo(xx-3,edgeY+ry*.35,xx+2,edgeY+ry*.57,xx-1,edgeY+flow);c.stroke();
      if(age<3){
        var fall=(t*(12+k*3)+i*7+k*3)%(ry*1.4+15);
        dot(c,xx-1,edgeY+flow+fall,1.0+((k+1)%2)*.6,1.9,blood);
      }
    }
  }
  c.restore();
}
function paint(c,e,look,r,t){
  if(!e||e.dead||e.collapsed||!e.nubs)return;
  var saw={};
  for(var i=0;i<e.nubs.length;i++){
    var slot=e.nubs[i].slot;if(saw[slot])continue;saw[slot]=true;
    var p=profile(e,slot,r);
    drawWound(c,e,p,r,slot,t,i);
  }
  if(e.type==='bear'&&e.missing&&(e.missing.legLeft||e.missing.legRight||e.missing.armLeft||e.missing.armRight)){
    // An actual open flank with exposed rib cage under shredded fur.
    dot(c,-r*.28,r*.04,r*.49,r*.45,'#320d13');
    dot(c,-r*.23,r*.02,r*.34,r*.34,'#8c2634');
    for(var j=0;j<5;j++){
      var xx=-r*.67+j*r*.18;
      c.lineWidth=2.1;c.strokeStyle=j%2?'#e1d4b5':'#f4e7c9';
      c.beginPath();c.moveTo(xx,-r*.23);c.quadraticCurveTo(xx+r*.06,r*.08,xx+r*.14,r*.26);c.stroke();
      stroke(c,xx,-r*.25,xx-r*.08,-r*.30,'#5a3029',1);
    }
    for(j=0;j<4;j++){
      var cx=-r*.45+j*r*.22,cy=r*.29+Math.sin(t*6+j)*2;
      stroke(c,cx,cy,cx-1.2,cy+6+(j%2)*4,'#9c1028',1.7);
    }
  }
}
function flying(c,q,x,y){
  if(!q||!['limb','head','horn','hoof','chunk'].includes(q.kind))return false;
  var s=q.s||1;
  c.save();c.translate(x,y);c.rotate(q.rot||0);
  var length=q.kind==='limb'?6.7*s:4.3*s,wide=q.kind==='head'?3.8*s:2.8*s;
  if(q.kind==='head'){
    dot(c,0,0,4*s,3.6*s,q.col);
    dot(c,-1*s,-.7*s,.8*s,.7*s,'#280a10');dot(c,1.2*s,-.7*s,.8*s,.7*s,'#280a10');
  }else{
    c.fillStyle=q.col;c.beginPath();
    c.moveTo(-length,-wide);c.lineTo(-length*.5,-wide*1.3);
    c.lineTo(-length*.16,-wide*.56);c.lineTo(length*.27,-wide*1.2);
    c.lineTo(length,0);c.lineTo(length*.38,wide*.75);
    c.lineTo(0,wide*1.3);c.lineTo(-length*.6,wide*.65);c.closePath();c.fill();
    if(q.kind==='limb'){
      stroke(c,-length*.7,0,length*.65,0,'#e9dbc0',1.8*s);
      dot(c,-length,0,wide*.63,wide*.5,'#811527');
    }
  }
  if(q.kind==='chunk'||q.kind==='limb'){
    dot(c,-length*.36,wide*.2,2*s,1.1*s,'#9a172a');
    stroke(c,-length*.28,wide*.4,-length*.39,wide*1.25,'#bc233b',1);
  }
  c.restore();return true;
}
function drawMonster(c,e,r){
  if(e.type!=='horrorHead')return false;
  c.save();c.translate(0,-3+Math.sin(e.anim*6)*2);
  c.shadowColor='#ad4dec';c.shadowBlur=7+(e.headSpark||0)*6;
  dot(c,0,0,r*1.08,r*.93,'#59405d');dot(c,0,-r*.2,r*.75,r*.7,'#967c9e');
  c.shadowBlur=0;dot(c,-r*.33,-r*.3,r*.29,r*.26,'#2b133d');
  dot(c,r*.33,-r*.3,r*.29,r*.26,'#2b133d');
  dot(c,-r*.33,-r*.3,r*.15,r*.14,'#d991ff');
  dot(c,r*.33,-r*.3,r*.15,r*.14,'#d991ff');
  dot(c,0,r*.28,r*.29,r*.19,'#2e0929');
  for(var j=0;j<4;j++)stroke(c,-r*.27+j*r*.18,r*.35,-r*.27+j*r*.18,r*.5,'#ead7cf',1);
  stroke(c,0,r*.73,Math.sin(e.anim*7)*2,r*1.5,'#ead4d5',1.6);
  c.restore();return true;
}
if(E){
  var origDetach=E._detach,origLand=E._land,origThink=E._think;
  E._detach=function(e,slot){
    var start=this.gore.length,result=origDetach.apply(this,arguments);
    for(var i=start;i<this.gore.length;i++){
      var q=this.gore[i];if(q.kind==='blood')continue;
      q.source=e.type;q.partSlot=slot;q.floor=e.floor;
      if(q.kind==='head'&&e.type==='horror')q.reanimateHead=Math.random()<.34;
    }
    if(e.type==='bear'&&(slot.indexOf('leg')===0||slot.indexOf('arm')===0)){
      for(var i=0;i<6;i++){
        var ang=Math.random()*TAU,vel=55+Math.random()*105;
        var part=this._gorePart(e.x,e.y,Math.cos(ang)*vel,Math.sin(ang)*vel,
          60+Math.random()*70,i%3===0?'bone':'chunk',i%3===0?'#eadaba':'#8f2537',.6+Math.random()*.85,0);
        if(part){part.source='bear';part.partSlot=slot;part.nopile=true;}
      }
    }
    if(e.type==='scarecrow'&&(slot==='armLeft'||slot==='armRight')){
      var birds=this.list.filter(function(x){return !x.dead&&x.type==='crow';}).length;
      if(birds<10&&this.TYPES.crow)for(var b=0;b<2;b++){
        var crow=this.spawn('crow',e.x+(b?13:-13),e.y-9,e.floor||1,{awake:true});
        if(crow){crow.asleep=false;crow.cd=.3+b*.2;}
      }
      e.crowBurst=.8;
      if(CC.fx&&CC.fx.burst)CC.fx.burst(e.x,e.y-8,'#bc9b64',16,90);
    }
    return result;
  };
  E.TYPES.horrorHead={name:'Reanimated Horror Head',hp:16,spd:73,dmg:7,
    r:6,xp:12,color:'#8a67a8',w:0,blood:'#64265a'};
  E._land=function(q){
    var result=origLand.apply(this,arguments);
    if(q.reanimateHead){
      var alive=this.list.filter(function(v){return !v.dead&&v.type==='horrorHead';}).length;
      if(alive<3){
        var e=this.spawn('horrorHead',q.x,q.y,q.floor||1,{awake:true});
        if(e){e.asleep=false;e.cd=.8;e.headSpark=2;
          if(CC.fx&&CC.fx.burst)CC.fx.burst(e.x,e.y,'#af62e7',15,90);
          if(CC.fx&&CC.fx.text)CC.fx.text(e.x,e.y-22,'THE HEAD AWAKENS','#d18aff',10);
        }
      }
    }
    return result;
  };
  E._think=function(e,dt,p,d,ang,f){
    if(e.type!=='horrorHead')return origThink.apply(this,arguments);
    e.cd-=dt;e.dangerous=false;
    var sp=e.spd*f*dt,ca=Math.cos(ang),sa=Math.sin(ang);
    e.headSpark=Math.max(0,(e.headSpark||0)-dt);
    if(e.state==='idle'){
      if(d<80){e.x-=ca*sp;e.y-=sa*sp;}
      else if(d>145){e.x+=ca*sp;e.y+=sa*sp;}
      else{e.x-=sa*sp*.7;e.y+=ca*sp*.7;}
      if(e.cd<=0&&d<260){
        e.state='telegraph';e.t=.55;e.ang=ang;
        e.tele={kind:'line',ang:ang,len:140,max:.55};
      }
      e.phaseBlink=(e.phaseBlink||3.4)-dt;
      if(e.phaseBlink<=0){
        e.phaseBlink=3.5+Math.random()*2;
        var nx=e.x+(Math.random()-.5)*75,ny=e.y+(Math.random()-.5)*75;
        if(!CC.Dungeon||!CC.Dungeon.isSolid||!CC.Dungeon.isSolid(nx,ny)){
          e.x=nx;e.y=ny;e.headSpark=.65;
        }
      }
    }else if(e.state==='telegraph'&&(e.t-=dt)<=0){
      this._shoot(e,e.ang-.16,155,e.dmg*.9,'#bd75ff','curse',2.6);
      this._shoot(e,e.ang+.16,155,e.dmg*.9,'#bd75ff','curse',2.6);
      e.state='idle';e.cd=1.8;e.tele=null;
    }
  };
}
CC.WoundArt={clip:clip,paint:paint,flying:flying,drawMonster:drawMonster};
})(window);