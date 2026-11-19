/* Emberdeep original illustrated character portraits: all art is drawn in-game, no external files. */
(function (root) {
 'use strict';
 var CC=root.CC=root.CC||{}, portraits={}, W=144,H=154,PI=Math.PI,TAU=2*PI;
 function poly(c,pts,color){c.fillStyle=color;c.beginPath();c.moveTo(pts[0],pts[1]);for(var i=2;i<pts.length;i+=2)c.lineTo(pts[i],pts[i+1]);c.closePath();c.fill();}
 function line(c,pts,col,w){c.strokeStyle=col;c.lineWidth=w||1;c.lineJoin='round';c.lineCap='round';c.beginPath();c.moveTo(pts[0],pts[1]);for(var i=2;i<pts.length;i+=2)c.lineTo(pts[i],pts[i+1]);c.stroke();}
 function ellipse(c,x,y,rx,ry,col){c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
 function disk(c,x,y,r,col){c.fillStyle=col;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();}
 function rr(c,x,y,w,h,r,col){c.fillStyle=col;c.beginPath();if(c.roundRect)c.roundRect(x,y,w,h,r);else c.rect(x,y,w,h);c.fill();}
 function glow(c,x,y,r,inner){var g=c.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,inner);g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r);}
 function portrait(c,id){
   c.save();c.clearRect(0,0,W,H);
   var theme=id==='swordsman'?'#bd7540':id==='wizard'?'#6bbbe4':id==='necromancer'?'#ad83f0':'#73c6a2';
   var g=c.createLinearGradient(0,0,W,H);
   g.addColorStop(0,id==='swordsman'?'#392823':id==='wizard'?'#111f34':id==='necromancer'?'#2b1c35':'#14252b');
   g.addColorStop(1,'#080c14');rr(c,1,1,W-2,H-2,13,g);
   glow(c,80,60,77,id==='swordsman'?'rgba(255,133,45,.35)':id==='wizard'?'rgba(49,154,255,.32)':id==='necromancer'?'rgba(140,68,230,.42)':'rgba(54,192,142,.25)');
   // distant masonry and rune-like insets
   for(var k=0;k<6;k++) {
     c.globalAlpha=.12+(k%2)*.08;
     line(c,[10+k*26,0,4+k*26,50,15+k*26,87],'#d9c4a9',1);
   }
   c.globalAlpha=1;
   ellipse(c,73,141,76,16,'rgba(0,0,0,.48)');
   if(id==='swordsman'){
     // crimson cape, full plate torso, amber pauldron with raised rivets
     poly(c,[12,153,24,88,48,76,97,82,120,99,139,153],'#5d2730');
     poly(c,[18,153,35,99,56,80,99,84,128,153],'#242d36');
     poly(c,[46,88,66,101,99,87,112,153,26,153],'#626d72');
     poly(c,[53,109,73,116,98,109,93,153,52,153],'#343e48');
     line(c,[55,118,94,118,89,147],'#9babb1',3);
     for(k=0;k<3;k++){rr(c,57,121+k*11,34,3,1,'#9b9c99');}
     ellipse(c,34,98,23,19,'#a9a9a3');ellipse(c,105,98,22,19,'#b8aa8e');
     poly(c,[14,103,26,82,43,80,51,103,41,115,17,112],'#687078');
     poly(c,[88,96,95,77,120,84,132,110,102,115],'#777578');
     for(k=0;k<4;k++){disk(c,18+k*6,94+(k%2)*5,1.8,'#f4d58e');}
     // helm face and strong nose, prominent dark brows
     poly(c,[48,83,51,47,61,35,85,35,96,49,99,81,83,95,66,91],'#b98a65');
     ellipse(c,73,69,23,28,'#cda078');
     poly(c,[66,58,77,59,69,78],'#a16f58');
     line(c,[56,63,66,60],'#3a2c2b',3);line(c,[79,61,90,63],'#3a2c2b',3);
     disk(c,62,65,2,'#253943');disk(c,84,66,2,'#253943');
     line(c,[72,80,83,80],'#754639',2);
     line(c,[84,68,89,80,86,84],'#a94948',2);
     // textured hair and a high steel crown
     poly(c,[46,58,49,39,63,24,87,26,102,39,99,58,90,46,76,42,57,49],'#30251f');
     for(k=0;k<7;k++)line(c,[50+k*7,42,53+k*6,32,57+k*7,37],'#574236',2);
     poly(c,[48,47,53,35,67,28,86,28,97,35,101,47,93,44,77,37,61,43],'#7a888d');
     line(c,[54,39,67,31,83,32,95,40],'#cbd3d2',2);
     // upright sword at edge of portrait
     poly(c,[116,146,118,44,121,12,124,44,126,146],'#d7e5e5');
     line(c,[121,24,121,124],'#8aadb2',1.5);
     rr(c,105,105,32,5,1,'#d7ab64');rr(c,119,110,5,35,1,'#5a321f');
     for(k=0;k<5;k++)line(c,[119,116+k*5,124,112+k*5],'#e4b66d',1);
   }else if(id==='wizard'){
     // deep midnight blue cloak, mage robe and tall cowl
     poly(c,[10,153,31,93,38,57,52,16,85,13,110,52,121,97,138,153],'#17446d');
     poly(c,[21,153,43,85,57,51,95,47,111,94,123,153],'#225b89');
     poly(c,[55,100,75,115,97,100,104,153,40,153],'#153247');
     line(c,[50,103,74,114,98,103],'#97cade',2.5);
     for(k=0;k<5;k++){disk(c,44+k*13,127+(k%2)*7,1.4,'#e0d0ac');}
     // detailed hood with folded rim, glowing face framed beneath
     poly(c,[33,80,37,46,48,24,71,9,97,23,113,46,111,89,95,102,50,99],'#1a4e7a');
     poly(c,[43,73,46,42,60,26,83,24,100,41,99,83,73,95,50,87],'#09243e');
     ellipse(c,73,64,19,27,'#ac9c8b');
     poly(c,[54,80,60,85,73,101,86,85,91,80,80,94,64,94],'#c6b6a5');
     disk(c,65,64,3,'#7dd9ff');disk(c,82,64,3,'#7dd9ff');
     line(c,[58,52,69,50],'#354752',3);line(c,[77,50,91,52],'#354752',3);
     line(c,[72,67,70,76,76,78],'#8e7c79',2);
     poly(c,[43,56,53,38,73,26,94,39,104,56,90,45,74,41,55,47],'#286b94');
     line(c,[40,70,43,40,58,23,78,17,95,28],'#7bcde8',3);
     // outstretched staff and blazing icy orb
     line(c,[116,151,110,62,116,39],'#7a6148',7);
     line(c,[117,151,111,61],'#d1a56e',2);
     glow(c,116,36,35,'rgba(87,200,255,.78)');
     disk(c,116,36,13,'#53aadb');disk(c,116,36,7,'#dcf8ff');
     for(k=0;k<7;k++){var a=k*TAU/7;line(c,[116+Math.cos(a)*16,36+Math.sin(a)*16,
       116+Math.cos(a)*23,36+Math.sin(a)*23],'#b2edff',2);}
     disk(c,48,113,5,'#a6eaff');
   }else if(id==='necromancer'){
     // dark violet bone-lined cloak with skull-mask and articulated pauldrons
     poly(c,[12,153,24,82,42,37,71,13,100,34,122,79,138,153],'#312344');
     poly(c,[25,153,38,89,48,57,72,41,99,58,111,95,126,153],'#5a3d70');
     poly(c,[37,153,48,98,73,117,95,98,104,153],'#1e172d');
     line(c,[48,103,73,117,97,102],'#b8a8c8',2);
     for(k=0;k<3;k++)poly(c,[34+k*22,99,40+k*22,89,47+k*22,100,43+k*22,109],'#c0b7bb');
     // violet ritual crest and jagged crown
     for(k=0;k<5;k++)poly(c,[41+k*14,55,44+k*14,18+(k%2)*10,50+k*14,53],'#aea3bd');
     ellipse(c,73,67,22,27,'#c4b9ad');
     poly(c,[53,73,65,66,81,66,94,76,90,96,77,103,60,94],'#6f6676');
     // skull eye sockets and violet soul-fires
     ellipse(c,62,63,8,7,'#24182d');ellipse(c,85,63,8,7,'#24182d');
     glow(c,62,63,16,'rgba(155,78,255,.6)');glow(c,85,63,16,'rgba(155,78,255,.6)');
     disk(c,63,64,3.3,'#dcacff');disk(c,84,64,3.3,'#dcacff');
     poly(c,[73,70,68,83,77,83],'#3a2b40');
     rr(c,60,88,27,4,1,'#dfc6bf');
     for(k=0;k<6;k++)line(c,[61+k*4,88,61+k*4,94],'#5b4e57',1.5);
     line(c,[50,83,52,93,63,103],'#9d83ad',2);
     // one bony hand holds a black staff with a magic skull
     line(c,[121,154,114,56,112,24],'#4b384f',7);
     line(c,[121,154,114,56],'#b49cb1',2);
     glow(c,113,26,34,'rgba(164,88,255,.68)');
     ellipse(c,113,26,14,17,'#ddd0cd');
     ellipse(c,107,25,5,6,'#301c3b');ellipse(c,119,25,5,6,'#301c3b');
     poly(c,[113,29,109,37,118,37],'#55405d');
     for(k=0;k<3;k++){disk(c,105+k*8,60+(k%2)*4,2,'#c9a3ff');}
   }else if(id==='thief'){
     // angular green-black leather jerkin with straps and a dark scarf
     poly(c,[13,153,27,93,41,59,65,30,90,42,112,88,132,153],'#142c2b');
     poly(c,[27,153,40,91,61,80,97,87,118,153],'#2b5042');
     poly(c,[46,107,67,119,94,109,87,153,48,153],'#1c292b');
     line(c,[48,105,91,149],'#b28d64',5);line(c,[45,104,88,149],'#403124',1.6);
     for(k=0;k<4;k++)rr(c,54+k*9,134,4,5,1,'#b9a070');
     // hood and mask, green eyes barely visible
     poly(c,[37,94,28,67,44,30,64,15,83,20,110,48,112,91,94,102],'#173d35');
     poly(c,[42,79,41,54,58,35,82,34,97,54,96,86,74,94,54,91],'#112c2a');
     ellipse(c,71,73,22,21,'#c49d79');
     poly(c,[44,70,97,70,93,96,53,96],'#233b35');
     line(c,[48,78,91,78],'#587765',2);
     poly(c,[52,49,65,32,91,44,103,59,84,53,66,53],'#326950');
     line(c,[47,67,51,44,65,32,81,37],'#75b18a',2.6);
     disk(c,63,68,3,'#9cf9b9');disk(c,84,68,3,'#9cf9b9');
     line(c,[69,71,76,73],'#536257',1.5);
     // twin polished daggers, crossing at lower corners
     poly(c,[15,145,32,105,38,97,34,131,24,150],'#bed9ce');
     line(c,[22,141,35,109],'#f7fff0',2);
     rr(c,22,127,22,5,1,'#ad945c');
     poly(c,[125,144,109,108,103,97,106,133,114,152],'#a9c4b8');
     line(c,[117,140,106,106],'#f0fff6',2);
     rr(c,101,128,20,4,1,'#bc9b69');
     // hood clasp
     disk(c,48,104,5,'#cebb8b');
   }
   c.save();c.strokeStyle=theme;c.lineWidth=2;c.strokeRect(2,2,W-4,H-4);
   var veil=c.createLinearGradient(0,80,0,H);veil.addColorStop(0,'rgba(1,2,8,0)');veil.addColorStop(1,'rgba(3,4,10,.52)');
   c.fillStyle=veil;c.fillRect(3,78,W-6,H-81);
   c.restore();c.restore();
 }
 function sprite(id) {
   if(portraits[id])return portraits[id];
   if(typeof document==='undefined'||!document.createElement)return null;
   var el=document.createElement('canvas');el.width=W;el.height=H;
   var c=el.getContext('2d');if(!c)return null;
   portrait(c,id);portraits[id]=el;return el;
 }
 CC.HeroPortraits={
   draw:function(ctx,id,x,y,w,h){
     var img=sprite(id);
     if(img){ctx.save();ctx.imageSmoothingEnabled=true;ctx.drawImage(img,x,y,w,h);ctx.restore();}
   },
   render:portrait,
   clear:function(){portraits={};}
 };
})(window);
