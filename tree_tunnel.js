/* Emberdeep - living tree passage between the Giant Forest and Rolling Plains.
 * Self-contained winding map, unique fauna, destructible shrubs and root reliquaries,
 * guarded exit, and atmospheric hand-drawn root/moss/fungus environment.
 */
(function () {
  'use strict';
  var CC = window.CC = window.CC || {};
  var T = CC.TILE || 32, W = 67, H = 17, TWO = Math.PI * 2;
  var B = CC.TreeTunnel = {};
  var map = null, boss = null, elapsed = 0, cache = null, dust = [];
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function rand(seed){var t=Math.sin(seed*78.233+74.53)*18234.73;return t-Math.floor(t);}
  function center(x){return Math.round(8 + Math.sin(x*.13)*1.1 + Math.sin(x*.06+1)*1.3);}
  function idx(x,y){return y*W+x;}
  function point(x,y){return {x:(x+.5)*T,y:(y+.5)*T,tx:x,ty:y};}
  function fx(n,x,y,col,size){if(CC.fx && CC.fx[n]) CC.fx[n](x,y,col,size);}
  function plot(c,x,y,w,h,col){c.fillStyle=col;c.fillRect(x,y,w,h);}
  function ellipse(c,x,y,rx,ry,col){c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TWO);c.fill();}
  function curve(c,pts,col,width){c.strokeStyle=col;c.lineWidth=width;c.lineCap='round';c.beginPath();c.moveTo(pts[0],pts[1]);for(var i=2;i<pts.length;i+=2)c.lineTo(pts[i],pts[i+1]);c.stroke();}
  function mushroom(c,x,y,s,glow){
    c.save();c.translate(x,y);c.scale(s,s);
    if(glow){c.shadowColor='#c1eb92';c.shadowBlur=11;}
    plot(c,-2,0,4,9,'#c8b59a');ellipse(c,0,0,12,5,glow?'#a1c971':'#7d664e');
    ellipse(c,-3,-1,2.5,1.5,'#e6dec2');ellipse(c,5,0,2,1,'#e6dec2');
    c.restore();
  }
  function drawBark(c,wx,wy,id){
    plot(c,wx,wy,T,T,'#241c1b');
    for(var k=0;k<4;k++){
      var u=wx+rand(id*11+k)*T;
      curve(c,[u,wy-2,u-3,wy+T*.32,u+2,wy+T*.68,u+Math.sin(k)*3,wy+T+2],
        k%2?'#49372a':'#614636',k%2?2:3.2);
    }
    curve(c,[wx,wy+T*.7,wx+T*.26,wy+T*.42,wx+T*.7,wy+T*.56,wx+T,wy+T*.25],
      '#382b26',4);
    if(rand(id+12)>.65){
      ellipse(c,wx+rand(id+8)*T,wy+rand(id+9)*T,9,4,'#2c452e');
      plot(c,wx+rand(id+8)*T,wy+rand(id+9)*T,6,2,'#527148');
    }
  }
  function drawFloor(c,wx,wy,id){
    plot(c,wx,wy,T,T,id%3===0?'#302923':'#352d23');
    for(var j=0;j<6;j++){
      var px=wx+rand(id*6+j)*T, py=wy+rand(id*7+j+9)*T;
      plot(c,px,py,1+(j%3),1,j%2?'#5b4a33':'#4e5c37');
    }
    if(id%9===0)curve(c,[wx-2,wy+T*.3,wx+T*.3,wy+T*.49,wx+T*.68,wy+T*.26,wx+T+2,wy+T*.57],
      '#4e3c2e',3.2);
    if(id%7===0){
      ellipse(c,wx+rand(id+77)*T,wy+rand(id+88)*T,12,6,'rgba(48,83,43,.34)');
      curve(c,[wx+8,wy+T*.8,wx+14,wy+T*.7,wx+19,wy+T*.76],'#76905a',1.1);
    }
    if(id%23===0)mushroom(c,wx+19,wy+15,.44,id%46===0);
    if(id%11===0) {
      curve(c,[wx+T*.12,wy+T*.94,wx+T*.2,wy+T*.62,wx+T*.16,wy+T*.34],'#57764b',2);
      curve(c,[wx+T*.18,wy+T*.87,wx+T*.34,wy+T*.69],'#607f4c',1.5);
    }
  }
  function bgCanvas() {
    if(cache || !map || typeof document==='undefined') return;
    var el=document.createElement('canvas');el.width=W*T;el.height=H*T;
    var c=el.getContext('2d');if(!c)return;
    plot(c,0,0,el.width,el.height,'#11150e');
    for(var y=0;y<H;y++)for(var x=0;x<W;x++){
      var id=idx(x,y),wx=x*T,wy=y*T;
      if(map.tiles[id])drawBark(c,wx,wy,id);
      else drawFloor(c,wx,wy,id);
    }
    // Bending roots vault the walkable length into a cramped, living passage.
    for(x=2;x<W;x+=5){
      var yc=center(x),xx=(x+.5)*T, yy=yc*T;
      curve(c,[xx-16,yy-97,xx-6,yy-54,xx+17,yy-26,xx+36,yy-15],
        '#51382a',8+rand(x)*5);
      curve(c,[xx-14,yy-97,xx-5,yy-50,xx+17,yy-27],
        '#a0784e',2);
      if(x%2===0) {
        for(var t=0;t<4;t++)mushroom(c,xx+(t-1.5)*11,yy-66+rand(t+x)*16,.65+t*.05,t%3===0);
      }
    }
    cache=el;
  }
  function drawProps(c,cam){
    if(!map)return;
    var xlo=cam.x-40,xhi=cam.x+cam.w+40,ylo=cam.y-40,yhi=cam.y+cam.h+40;
    for(var i=0;i<map.breakables.length;i++){
      var q=map.breakables[i],xx=q.x-cam.x,yy=q.y-cam.y;
      if(xx< -35||xx>cam.w+35||yy< -35||yy>cam.h+35)continue;
      c.save();
      if(q.dead){
        if(q.fade<=0) {c.restore();continue;}
        c.globalAlpha=Math.min(.48,q.fade/1.5);
        ellipse(c,xx,yy,11,5,'#6b5735');c.restore();continue;
      }
      ellipse(c,xx,yy+5,12,6,'rgba(0,0,0,.33)');
      if(q.kind==='fungus'){
        mushroom(c,xx,yy-5,.83+Math.sin(elapsed*2+i)*.04,false);
        mushroom(c,xx+8,yy+3,.52,false);
      }else if(q.kind==='roots'){
        for(var j=0;j<4;j++)curve(c,[xx,yy+6,xx+(j-1.5)*5,yy-8,xx+(j-1.5)*7,yy-17],
          j%2?'#705135':'#967047',3);
        ellipse(c,xx,yy+3,11,6,'#58432f');
      }else{
        ellipse(c,xx,yy,12,9,'#345134');ellipse(c,xx-8,yy-4,7,9,'#54734a');
        ellipse(c,xx+8,yy-5,7,8,'#456a43');ellipse(c,xx+1,yy-9,8,6,'#698451');
      }
      c.restore();
    }
    for(i=dust.length-1;i>=0;i--){
      var d=dust[i];if(d.x<xlo||d.x>xhi||d.y<ylo||d.y>yhi)continue;
      c.globalAlpha=Math.max(0,d.life/.65);
      ellipse(c,d.x-cam.x,d.y-cam.y,d.r,d.r*.7,d.c);
    }
    c.globalAlpha=1;
  }
  function build(){
    var tiles=new Uint8Array(W*H).fill(1),explored=new Uint8Array(W*H),vis=new Uint8Array(W*H),things=[];
    for(var x=2;x<W-2;x++){
      var cy=center(x),room=(x>12&&x<18)||(x>27&&x<34)||(x>45&&x<51)||(x>56&&x<65)?3:2;
      for(var y=cy-room;y<=cy+room;y++)
        if(y>=2&&y<H-2)tiles[idx(x,y)]=0;
    }
    // Last chamber and exit are guaranteed navigable, with a clear boss arena.
    var endY=center(W-4);
    for(x=W-9;x<W-1;x++)for(y=endY-3;y<=endY+3;y++)if(y>=2&&y<H-2)tiles[idx(x,y)]=0;
    for(x=6;x<W-7;x++){
      if(x%4!==0 && x%7!==0)continue;
      var cy0=center(x),sgn=(x%3===0?-1:1),yy=cy0+sgn*2;
      if(tiles[idx(x,yy)]===0)things.push({x:(x+.5)*T,y:(yy+.5)*T,
        kind:x%3===0?'fungus':x%2===0?'bush':'roots',hp:x%5===0?2:1,dead:false,fade:0});
    }
    map={
      treeTunnel:true,realm:true,name:'Hollow Tree Passage',w:W,h:H,tiles:tiles,
      kind:new Uint8Array(W*H),explored:explored,vis:vis,
      spawn:point(3,center(3)),stairs:point(W-3,endY),
      chests:[],enemySpawns:[],breakables:things,
      isSolidTile:function(tx,ty){
        tx=Math.floor(tx);ty=Math.floor(ty);
        if(tx<0||ty<0||tx>=W||ty>=H)return true;
        return this.tiles[idx(tx,ty)]!==0;
      },
      isSolid:function(x,y){
        if(!isFinite(x)||!isFinite(y))return true;
        return this.isSolidTile(Math.floor(x/T),Math.floor(y/T));
      },
      isVisible:function(x,y){
        var p=CC.state&&CC.state.player;
        return !p||Math.hypot(x-p.x,y-p.y)<365;
      },
      drawFront:function(c,cam){
        // Hanging moss and roots at the top of the corridor overlap actors lightly.
        for(var tx=Math.max(0,Math.floor(cam.x/T)-1);tx<Math.min(W,Math.ceil((cam.x+cam.w)/T)+2);tx++){
          if(tx%3!==0)continue;
          var px=(tx+.3)*T-cam.x,py=(center(tx)-2.2)*T-cam.y;
          c.strokeStyle='rgba(91,119,64,.63)';c.lineWidth=1.5;
          for(var i=0;i<4;i++){
            var hx=px+(i-2)*8;c.beginPath();c.moveTo(hx,py-12);
            c.quadraticCurveTo(hx+3,py+7,hx+Math.sin(elapsed*1.8+i)*4,py+14+(i%3)*9);c.stroke();
          }
        }
      },
      drawLighting:function(c,cam){
        var p=CC.state&&CC.state.player;if(!p)return;
        var x=p.x-cam.x,y=p.y-cam.y;
        var g=c.createRadialGradient(x,y,35,x,y,240);
        g.addColorStop(0,'rgba(4,9,5,0.07)');g.addColorStop(.6,'rgba(6,12,5,0.31)');
        g.addColorStop(1,'rgba(3,6,5,0.79)');
        plot(c,0,0,cam.w,cam.h,g);
      }
    };
    cache=null;dust.length=0;bgCanvas();elapsed=0;boss=null;
    return map;
  }
  B.generate=function(){return build();};
  B.map=function(){return map;};
  B.populate=function(floor){
    if(!map||!CC.Enemies)return;
    var E=CC.Enemies;
    for(var x=10;x<54;x+=6){
      var cy=center(x),ty=x%4===0?'bat':x%3===0?'sporeling':x%2===0?'rootling':'mosslurker';
      E.spawn(ty,(x+.5)*T,(cy+.5)*T,floor||1,{awake:false});
      if(x%3===1)E.spawn('bat',(x+1.5)*T,(cy-1.2)*T,floor||1,{awake:false});
    }
    for(x=19;x<56;x+=12)E.spawn('mosslurker',(x+.5)*T,(center(x)+1.5)*T,floor||1,{awake:false});
    var pos=point(W-8,center(W-8));
    boss=E.spawn('heartroot',pos.x,pos.y,floor||1,{awake:false});
    boss.miniboss=true;boss.maxHp=Math.round(boss.maxHp*1.7);boss.hp=boss.maxHp;
    boss.dmg=Math.round(boss.dmg*1.2);boss.xp=90;boss.r=19;
    boss.asleep=true;boss.heartTimer=2;boss.heartPhase=1;
  };
  B.canExit=function(){return !!(boss&&boss.dead);};
  B.update=function(dt){
    if(!map)return;
    elapsed+=dt;
    var p=CC.state&&CC.state.player;
    if(p){
      var tx=Math.floor(p.x/T),ty=Math.floor(p.y/T);
      for(var y=Math.max(0,ty-9);y<=Math.min(H-1,ty+9);y++)
        for(var x=Math.max(0,tx-10);x<=Math.min(W-1,tx+10);x++)
          if(Math.hypot(x-tx,y-ty)<=10&&!map.tiles[idx(x,y)]){
            map.explored[idx(x,y)]=1;
            map.vis[idx(x,y)]=Math.hypot(x-tx,y-ty)<8?1:0;
          }
    }
    for(var i=dust.length-1;i>=0;i--){
      var d=dust[i];d.life-=dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.vx*=.92;d.vy*=.92;
      if(d.life<=0)dust.splice(i,1);
    }
    for(i=0;i<map.breakables.length;i++)if(map.breakables[i].dead&&map.breakables[i].fade>0)
      map.breakables[i].fade-=dt;
  };
  B.hitBreakables=function(p,dir,range,half){
    if(!map||!CC.state||CC.state.area!=='tree-tunnel')return 0;
    var hits=0;
    for(var i=0;i<map.breakables.length;i++){
      var b=map.breakables[i];if(b.dead)continue;
      var dx=b.x-p.x,dy=b.y-p.y,dist=Math.hypot(dx,dy);
      if(dist>range+10)continue;
      if(dist>8&&Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-dir.a),
          Math.cos(Math.atan2(dy,dx)-dir.a)))>half)continue;
      b.hp--;hits++;
      if(b.hp<=0){
        b.dead=true;b.fade=1.8;
        for(var q=0;q<10;q++){
          var a=rand(i*30+q)*TWO,v=20+rand(i*31+q)*65;
          dust.push({x:b.x,y:b.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.4+rand(q)*.25,
            r:1+rand(i+q)*2,c:q%3===0?'#a6bf85':'#795333'});
        }
        if(CC.fx&&CC.fx.burst)CC.fx.burst(b.x,b.y,'#7ca054',7,55);
        var roll=Math.random(),L=CC.Loot,extra,drop=null;
        if(L&&L._spawn){
          // Each destroyed object rolls once: 18% potion, 5% gear, 0.5% rare gear.
          if(roll<.005&&L.rollItem){
            extra=L.rollItem(CC.state.floor||1,0,2);
            drop=L._spawn('item',b.x,b.y,{item:extra,rarity:extra.rarity,color:extra.color});
          }else if(roll<.055&&L.rollItem){
            extra=L.rollItem(CC.state.floor||1,0,0);
            drop=L._spawn('item',b.x,b.y,{item:extra,rarity:extra.rarity,color:extra.color});
          }else if(roll<.235){
            drop=L._spawn('potion',b.x,b.y,{color:'#ed4557'});
          }
          if(drop)L.drops.push(drop);
        }
      }
    }
    return hits;
  };
  function bossAI(e,dt,p,d,a,f){
    e.cd-=dt;e.dangerous=false;
    var phase=e.hp<e.maxHp*.47?2:1,s=e.spd*f*dt;
    if(phase!==e.heartPhase){
      e.heartPhase=phase;
      if(CC.fx&&CC.fx.shake)CC.fx.shake(5);
      if(CC.fx&&CC.fx.text)CC.fx.text(e.x,e.y-35,'THE HEART AWAKENS','#d6e396',12);
    }
    if(e.state==='idle'){
      if(d>44)CC.Dungeon.moveWithCollision?CC.Dungeon.moveWithCollision(e,Math.cos(a)*s,Math.sin(a)*s):
        (e.x+=Math.cos(a)*s,e.y+=Math.sin(a)*s);
      if(e.cd<=0&&d<280){
        e.state='telegraph';e.t=phase===2?.6:.85;
        e.atk=e.heartTimer++%3===0?'spores':'slam';
        e.tele={kind:'circle',rad:e.atk==='slam'?68:42,max:e.t};
      }
    }else if(e.state==='telegraph'){
      e.t-=dt;
      if(e.t<=0){
        if(e.atk==='slam'){if(CC.Enemies._blast)CC.Enemies._blast(e.x,e.y,69,e.dmg*1.05);}
        else for(var i=-2;i<=2;i++)CC.Enemies._shoot(e,a+i*.26,115,e.dmg*.65,'#b6ca73','spore',2.4);
        if(phase===2&&Math.random()<.26&&CC.Enemies.list.filter(function(v){return v.type==='rootling'&&!v.dead;}).length<7){
          CC.Enemies.spawn('rootling',e.x+28,e.y+14,e.floor,{awake:true});
        }
        if(CC.fx&&CC.fx.shake)CC.fx.shake(4);
        e.tele=null;e.state='recover';e.t=.6;
      }
    }else if(e.state==='recover'){e.t-=dt;if(e.t<=0){e.state='idle';e.cd=phase===2?.7:1.2;}}
  }
  function smallAI(e,dt,p,d,a,f){
    e.cd-=dt;e.dangerous=false;
    var sp=e.spd*f*dt,m=CC.Dungeon;
    function mv(dx,dy){if(m&&m.moveWithCollision)m.moveWithCollision(e,dx,dy);else{e.x+=dx;e.y+=dy;}}
    if(e.state==='idle'){
      if(e.type==='sporeling'){
        if(d<70)mv(-Math.cos(a)*sp,-Math.sin(a)*sp);
        else if(d>150)mv(Math.cos(a)*sp,Math.sin(a)*sp);
        if(d<240&&e.cd<=0)CC.Enemies._tele(e,'spit',.5,a);
      }else{
        if(d>22)mv(Math.cos(a+Math.sin(e.anim*(e.type==='rootling'?7:3))*.16)*sp,
          Math.sin(a+Math.sin(e.anim*5)*.16)*sp);
        if(e.cd<=0&&d<110)CC.Enemies._tele(e,'lunge',.48,a);
      }
    }else if(e.state==='telegraph'){
      if((e.t-=dt)<=0){
        if(e.type==='sporeling'){
          for(var j=-1;j<=1;j++)CC.Enemies._shoot(e,e.ang+j*.23,110,e.dmg*.6,'#a9d080','spore',2.2);
          e.cd=1.7;
        }else{
          e.state='act';e.t=.2;
        }
        e.tele=null;
        if(e.type==='sporeling')e.state='idle';
      }
    }else if(e.state==='act'){
      e.dangerous=true;
      mv(Math.cos(e.ang)*e.spd*2.7*dt,Math.sin(e.ang)*e.spd*2.7*dt);
      if((e.t-=dt)<=0){e.state='recover';e.t=.5;}
    }else if(e.state==='recover'){
      if((e.t-=dt)<=0){e.state='idle';e.cd=1.0;}
    }
  }
  B.drawMonster=function(c,e,r,col,dark,t){
    if(!e||!['rootling','sporeling','mosslurker','heartroot'].includes(e.type))return false;
    var beat=Math.sin(e.anim*(e.type==='sporeling'?5:8))*2;
    c.save();
    if(e.type==='sporeling'){
      c.strokeStyle='#b5bb81';c.lineWidth=2;
      for(var i=0;i<4;i++){c.beginPath();c.moveTo(0,3);c.lineTo((i-1.5)*6,10+beat);c.stroke();}
      plot(c,-3,-1,6,10,'#d7c9a0');ellipse(c,0,-4,r*1.25,r*.75,col);
      ellipse(c,-5,-6,3,2,'#d8eba1');ellipse(c,5,-3,3,2,'#e8e7b0');
      plot(c,-3,0,2,2,'#13200e');plot(c,3,0,2,2,'#13200e');
    }else if(e.type==='rootling'){
      c.strokeStyle='#5f422f';c.lineWidth=3;
      for(i=0;i<4;i++){c.beginPath();c.moveTo((i-1.5)*4,0);c.lineTo((i-2)*5,9+beat*(i%2?1:-1));c.stroke();}
      ellipse(c,0,-3,r*.8,r*.9,'#62422d');
      ellipse(c,0,-7,r*.7,r*.6,col);
      c.strokeStyle='#6a9654';c.lineWidth=2;c.beginPath();c.moveTo(-4,-7);c.lineTo(-10,-15);c.moveTo(3,-8);c.lineTo(8,-16);c.stroke();
      plot(c,-4,-6,2.4,3,'#e6df91');plot(c,2,-6,2.4,3,'#e6df91');
    }else if(e.type==='mosslurker'){
      c.strokeStyle='#332d25';c.lineWidth=3;
      for(i=0;i<6;i++){c.beginPath();c.moveTo((i%3-1)*r*.5,0);
        c.lineTo((i%2?-1:1)*r*1.15,r*.8+beat);c.stroke();}
      ellipse(c,0,0,r*1.15,r*.8,'#435036');
      for(i=0;i<5;i++)ellipse(c,(i-2)*4,-4+(i%2)*2,5,4,i%2?'#5c7444':'#789a50');
      plot(c,-4,0,2,2,'#ff6a58');plot(c,3,0,2,2,'#ff6a58');
    }else{
      c.shadowColor='#a0d15c';c.shadowBlur=7+Math.abs(beat)*2;
      c.strokeStyle='#6c4730';c.lineWidth=5;
      for(i=0;i<6;i++){c.beginPath();c.moveTo((i-2.5)*5,1);
        c.quadraticCurveTo((i-2.5)*11,-15,(i-2.5)*8,-25+beat*(i%2?1:-1));c.stroke();}
      ellipse(c,0,0,r*.9,r,'#4a382a');
      ellipse(c,0,-3,r*.68,r*.73,col);ellipse(c,0,-3,r*.37,r*.43,'#9bbc63');
      ellipse(c,0,-3,r*.23+Math.sin(e.anim*5)*1.2,r*.28,'#e6efa5');
      c.shadowBlur=0;
      c.strokeStyle='#b8a475';c.lineWidth=1.4;c.beginPath();c.arc(0,-3,r*.48,0,TWO);c.stroke();
    }
    c.restore();return true;
  };
  B.draw=function(c,cam){
    if(!map)return;
    bgCanvas();
    if(cache){
      var sx=clamp(Math.floor(cam.x),0,cache.width-1);
      var sy=clamp(Math.floor(cam.y),0,cache.height-1);
      var sw=Math.min(cam.w,cache.width-sx),sh=Math.min(cam.h,cache.height-sy);
      if(sw>0&&sh>0)c.drawImage(cache,sx,sy,sw,sh,sx-cam.x,sy-cam.y,sw,sh);
    }
    drawProps(c,cam);
    var x=map.stairs.x-cam.x,y=map.stairs.y-cam.y,open=B.canExit();
    c.save();c.translate(x,y);c.globalAlpha=.85;
    if(!open) {
      c.strokeStyle='#bc9b51';c.lineWidth=3;
      c.beginPath();c.arc(0,0,23,0,TWO);c.stroke();
      for(var i=0;i<9;i++)curve(c,[Math.sin(i*2.2)*22,-25,Math.cos(i*3.1)*15,0,Math.sin(i*4.5)*19,23],
        '#6c4b30',2.5);
    }else{
      var g=c.createRadialGradient(0,0,3,0,0,46);g.addColorStop(0,'rgba(255,231,151,.8)');
      g.addColorStop(1,'rgba(161,224,99,0)');
      plot(c,-50,-50,100,100,g);
      c.fillStyle='#9fd56c';c.fillRect(-4,-15,8,30);
    }
    c.restore();
  };
  B.drawHud=function(c,Wd,Hd){
    if(!map)return;
    var p=CC.state&&CC.state.player;if(!p)return;
    var open=B.canExit(),d=Math.hypot(p.x-map.stairs.x,p.y-map.stairs.y);
    c.save();c.textAlign='center';c.font='bold 12px Georgia';
    c.fillStyle='rgba(11,13,9,.8)';c.fillRect(Wd/2-130,42,260,25);
    c.fillStyle=open?'#d6f1a4':'#ddc289';
    c.fillText(open?'THE PLAINS EXIT IS OPEN':'DEFEAT THE HEARTROOT GUARDIAN',Wd/2,59);
    if(d<95){
      c.fillStyle='rgba(14,17,10,.85)';c.fillRect(Wd/2-120,Hd*.26,240,27);
      c.fillStyle=open?'#d8eea9':'#f4be85';
      c.fillText(open?'ENTER THE LIGHT TO LEAVE':'THE ROOT GATE IS SEALED',Wd/2,Hd*.26+18);
    }
    c.restore();
  };
  B.boss=function(){return boss;};
  // Zero-weight types: these only occur in the Hollow Tree Passage.
  var E=CC.Enemies;
  if(E&&E.TYPES){
    E.TYPES.rootling={name:'Rootling',hp:23,spd:88,dmg:7,r:9,xp:13,color:'#866244',w:0,blood:'#6a5735'};
    E.TYPES.sporeling={name:'Sporecap Shambler',hp:20,spd:65,dmg:7,r:9,xp:14,color:'#94bd71',w:0,poison:true,blood:'#69814d'};
    E.TYPES.mosslurker={name:'Moss Lurker',hp:43,spd:66,dmg:11,r:11,xp:20,color:'#5a7c48',w:0,blood:'#425c36'};
    E.TYPES.heartroot={name:'Heartroot Guardian',hp:154,spd:44,dmg:13,r:16,xp:90,color:'#8b6b46',w:0,bone:true,blood:'#42502d'};
    var oldThink=E._think;
    E._think=function(e,dt,p,d,a,f){
      if(e.type==='heartroot')return bossAI(e,dt,p,d,a,f);
      if(e.type==='rootling'||e.type==='sporeling'||e.type==='mosslurker')return smallAI(e,dt,p,d,a,f);
      return oldThink.apply(this,arguments);
    };
    var oldKill=E._kill;
    E._kill=function(e){
      if(e&&e.type==='heartroot'&&!e.dead){
        var out=oldKill.apply(this,arguments);
        var L=CC.Loot;
        if(L&&L.rollItem&&L._spawn){
          var it=L.rollItem(e.floor||1,3,2);
          L.drops.push(L._spawn('item',e.x,e.y,{item:it,rarity:it.rarity,color:it.color}));
          L.drops.push(L._spawn('potion',e.x+12,e.y,{color:'#e34c61'}));
        }
        if(CC.fx&&CC.fx.text)CC.fx.text(e.x,e.y-40,'THE ROOT GATE OPENS','#d9f19e',14);
        if(CC.fx&&CC.fx.shake)CC.fx.shake(8);
        return out;
      }
      return oldKill.apply(this,arguments);
    };
  }
})();
