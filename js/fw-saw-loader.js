// POWERFUL GROUP — YUKLANISH ANIMATSIYASI (egasi namunasi, 2026-11): format-kesish stanoki yon tomondan — 4 qavat plita,
// ustidan siquvchi bosadi, ostidan karetkadagi kichik (skorlovchi) va katta arra chapga yurib kesadi. Yorug' sahna.
// Admin (#bp-loading), sotuvchi va diller (#fw-splash) yuklanish oynalarida avtomatik ishga tushadi.
// Faqat oyna KO'RINIB turganda chiziladi (kirib bo'lgach — to'xtaydi, protsessor/batareya band qilinmaydi).
// «Kamroq harakat» (prefers-reduced-motion) yoqilgan qurilmada — chizilmaydi (oddiy arra tig'i qoladi).
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.requestAnimationFrame) return;
  try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}

var WH=250,BR=68,PH=62,PY=156,TS=22;
function rnd(a,b){return a+Math.random()*(b-a)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function ease(q){q=clamp(q,0,1);return q<.5?2*q*q:1-Math.pow(-2*q+2,2)/2}

/* ---------- arra diski (bir marta) ---------- */
/* ---------- arra diski (egasi namunasi: mayda o'tkir tishlar, kumush disk, qizil to'lqinsimon kesiklar) ---------- */
var BK=3;
function makeBlade(N,big,rev){
  var sz=Math.ceil((BR*2+8)*BK),c=document.createElement('canvas');c.width=c.height=sz;
  var x=c.getContext('2d');x.translate(sz/2,sz/2);x.scale(BK,BK);
  var Rt=BR,Rg=BR-(big?5.5:9),i;          // tish uchi va tish tubi radiusi
  function P(a,r){return [Math.cos(a)*r,Math.sin(a)*r]}
  // tishlar: oldinga egilgan o'tkir uchburchak (namunadagidek arra tishi)
  var step=Math.PI*2/N;
  x.beginPath();
  for(i=0;i<N;i++){
    var a=i*step,sg=rev?-1:1,g0=P(a*sg,Rg),tip=P((a+step*.78)*sg,Rt),g1=P((a+step*.86)*sg,Rg+.6);
    i?x.lineTo(g0[0],g0[1]):x.moveTo(g0[0],g0[1]);x.lineTo(tip[0],tip[1]);x.lineTo(g1[0],g1[1]);
  }
  x.closePath();
  var tg=x.createRadialGradient(0,0,Rg-4,0,0,Rt);tg.addColorStop(0,'#9aa0a7');tg.addColorStop(1,'#5f656c');
  x.fillStyle=tg;x.fill();x.strokeStyle='rgba(40,44,50,.55)';x.lineWidth=.35;x.stroke();
  // disk tanasi — kumush
  x.beginPath();x.arc(0,0,Rg-.3,0,6.283);
  var bg=x.createRadialGradient(-Rg*.35,-Rg*.4,Rg*.1,0,0,Rg);
  bg.addColorStop(0,'#f4f5f6');bg.addColorStop(.55,'#d3d6da');bg.addColorStop(1,'#b4b9bf');
  x.fillStyle=bg;x.fill();
  // ichki (to'qroq) doira va gupchak
  x.beginPath();x.arc(0,0,Rg*.44,0,6.283);
  var ig=x.createRadialGradient(-6,-6,2,0,0,Rg*.44);ig.addColorStop(0,'#c9ccd0');ig.addColorStop(1,'#a2a7ad');
  x.fillStyle=ig;x.fill();x.strokeStyle='rgba(60,64,70,.35)';x.lineWidth=.6;x.stroke();
  x.beginPath();x.arc(0,0,Rg*.2,0,6.283);x.fillStyle='#8e9399';x.fill();
  x.beginPath();x.arc(0,0,Rg*.11,0,6.283);x.fillStyle='#16181b';x.fill();
  // gardishdagi kalitsimon tirqishlar (issiqlik kengayishi uchun)
  var ns=big?6:4;
  for(i=0;i<ns;i++){
    var a2=i*Math.PI*2/ns+.2,p1=P(a2,Rg+.5),p2=P(a2+.05,Rg-(big?9:7)),p3=P(a2+.05,Rg-(big?10.5:8.2));
    x.beginPath();x.moveTo(p1[0],p1[1]);x.lineTo(p2[0],p2[1]);x.strokeStyle='#4a4f56';x.lineWidth=.9;x.stroke();
    x.beginPath();x.arc(p3[0],p3[1],big?1.5:1.3,0,6.283);x.fillStyle='#4a4f56';x.fill();
  }
  // qizil to'lqinsimon (shovqinni pasaytiruvchi) lazer kesiklari
  if(big){
    for(i=0;i<6;i++){
      var a3=i*Math.PI/3+.72,cx=Math.cos(a3)*Rg*.7,cy=Math.sin(a3)*Rg*.7;
      x.save();x.translate(cx,cy);x.rotate(a3);
      x.beginPath();
      for(var k=0;k<=16;k++){var tt=k/16,yy=(tt-.5)*12,xx=Math.sin(tt*Math.PI*3)*2.2;k?x.lineTo(xx,yy):x.moveTo(xx,yy)}
      x.strokeStyle='#d0312d';x.lineWidth=1.25;x.lineCap='round';x.stroke();x.restore();
    }
    // yozuv: POWERFUL PRO
    x.save();x.font='900 5.6px Arial';x.textAlign='center';x.textBaseline='middle';
    var txt='POWERFUL PRO',R0=Rg*.31,ws=[],tot=0;
    for(i=0;i<txt.length;i++){ws[i]=x.measureText(txt[i]).width+.5;tot+=ws[i]}
    var aa=-Math.PI/2-tot/R0/2;
    for(i=0;i<txt.length;i++){var da=ws[i]/R0,mid=aa+da/2;
      x.save();x.translate(Math.cos(mid)*R0,Math.sin(mid)*R0);x.rotate(mid+Math.PI/2);
      x.fillStyle=i>=9?'#c2720c':'#2f343b';x.fillText(txt[i],0,0);x.restore();aa+=da}
    x.restore();
  }
  // yaltiroq
  x.beginPath();x.arc(0,0,Rg-.3,0,6.283);
  var sh=x.createLinearGradient(-Rg,-Rg,Rg,Rg);sh.addColorStop(0,'rgba(255,255,255,.28)');sh.addColorStop(.5,'rgba(255,255,255,0)');sh.addColorStop(1,'rgba(0,0,0,.08)');
  x.fillStyle=sh;x.fill();
  return c;
}
var blade=makeBlade(96,true,true),bladeS=makeBlade(26,false,false);   // katta — soat millariga teskari, kichik — soat bo'yicha

/* ---------- yog'och taxta (usti, uzunasiga tolali) ---------- */
function makeTop(L,Hh,k){
  // Tabiiy yog'och taxta (egasi talabi: plitka/HPL emas — yog'och): issiq jigarrang, uzunasiga tolalar, yillik halqalar
  var c=document.createElement('canvas');c.width=Math.ceil(L*k);c.height=Math.ceil(Hh*k);
  var x=c.getContext('2d');x.scale(k,k);
  var g=x.createLinearGradient(0,0,0,Hh);g.addColorStop(0,'#c99560');g.addColorStop(.5,'#b98349');g.addColorStop(1,'#c48f58');
  x.fillStyle=g;x.fillRect(0,0,L,Hh);
  var i,j;
  for(i=0;i<Hh*1.6;i++){ // uzunasiga ingichka tolalar
    var y0=rnd(0,Hh),amp=rnd(.3,1.6),fr=rnd(.004,.02),ph=rnd(0,6.28);
    x.beginPath();
    for(var px=0;px<=L;px+=6){var yy=y0+Math.sin(px*fr+ph)*amp;px?x.lineTo(px,yy):x.moveTo(px,yy)}
    x.lineWidth=rnd(.25,.9);x.globalAlpha=rnd(.08,.28);x.strokeStyle=Math.random()<.7?'#6e4320':'#e0b07a';x.stroke();
  }
  x.globalAlpha=1;
  for(i=0;i<5;i++){ // yillik halqalar (cho'zilgan ellips yoylari)
    var cx=rnd(0,L),cy=rnd(-Hh*.5,Hh*1.5),rx=rnd(L*.15,L*.45),ry=rnd(Hh*.6,Hh*1.8);
    for(j=0;j<7;j++){
      x.beginPath();x.ellipse(cx,cy,rx*(1-j*.09),ry*(1-j*.11),0,0,6.283);
      x.lineWidth=rnd(.4,1.1);x.globalAlpha=rnd(.10,.22);x.strokeStyle='#5c3618';x.stroke();
    }
  }
  x.globalAlpha=1;
  for(i=0;i<3;i++){ // kichik shoxcha izlari (sulcha)
    var kx=rnd(L*.1,L*.9),ky=rnd(0,Hh),kr=rnd(1.4,3);
    var kg=x.createRadialGradient(kx,ky,0,kx,ky,kr*2.2);kg.addColorStop(0,'rgba(70,40,16,.75)');kg.addColorStop(.5,'rgba(110,66,30,.35)');kg.addColorStop(1,'rgba(110,66,30,0)');
    x.fillStyle=kg;x.beginPath();x.ellipse(kx,ky,kr*2.4,kr,0,0,6.283);x.fill();
  }
  var h=x.createLinearGradient(0,0,0,Hh);h.addColorStop(0,'rgba(255,240,215,.22)');h.addColorStop(.12,'rgba(255,240,215,0)');
  x.fillStyle=h;x.fillRect(0,0,L,Hh);
  return c;
}

/* ---------- DSP (qirindili plita) qirqimi — egasi namunasi ---------- */
function makeChip(L,Hh,k){
  var c=document.createElement('canvas');c.width=Math.ceil(L*k);c.height=Math.ceil(Hh*k);
  var x=c.getContext('2d');x.scale(k,k);
  var g=x.createLinearGradient(0,0,0,Hh);g.addColorStop(0,'#e2c27e');g.addColorStop(.5,'#d4ae66');g.addColorStop(1,'#dcb872');
  x.fillStyle=g;x.fillRect(0,0,L,Hh);
  var n=Math.round(L*Hh*.9),i,cols=['#b8873e','#f0d79a','#a8762f','#e8c985','#c99a4e','#8f6327'];
  for(i=0;i<n;i++){
    var yy=rnd(0,Hh),edge=Math.min(yy,Hh-yy)<Hh*.22;      // chetlarida mayda, o'rtasida yirikroq qirindi
    var w=edge?rnd(.6,1.6):rnd(1,3.4),h=edge?rnd(.3,.7):rnd(.4,1.1);
    x.globalAlpha=rnd(.35,.85);x.fillStyle=cols[(Math.random()*cols.length)|0];
    x.save();x.translate(rnd(0,L),yy);x.rotate(rnd(-.5,.5));x.fillRect(-w/2,-h/2,w,h);x.restore();
  }
  x.globalAlpha=1;return c;
}

/* ---------- bitta yuklanish ekrani (egasi namunasi: format-kesish stanoki, yon tomondan) ---------- */
// 4 qavat plita taxlami; ustidan ikki ustunli siquvchi (prijim) tushib bosadi; ostidan karetka chapga yuradi —
// oldinda kichik (skorlovchi) arra, orqasida katta arra. Har o'tish — 25%. Stanokdagi yozuv — faqat «POWERFUL PRO».
var NB=4,DOWN=450,PASS=2600,UP=400,CYC=DOWN+PASS+UP,HOLD=700,NL=4,LH=13,LG=2.2;
var RED='#d6332b';
function Loader(frame,getScale){
  var self=this;
  var cv=frame.querySelector('canvas'),pct=frame.querySelector('.pct'),ctx=cv.getContext('2d');
  var W=380,s=1,res=1,TOP=78,BOT=78+NL*LH+(NL-1)*LG,R1=96,R2=34,DX=R1+R2+46,tex=[],parts=[],angle=0,t0=null;
  function setup(){
    var cw=cv.clientWidth,ch=cv.clientHeight;if(!cw||!ch)return;
    var sc=getScale();res=clamp((window.devicePixelRatio||1)*sc,.7,2.6);
    cv.width=Math.round(cw*res);cv.height=Math.round(ch*res);
    s=ch/WH;W=cw/s;tex=[];
    for(var i=0;i<NL;i++)tex.push(makeChip(W,LH,res*s*1.1));
  }
  self.setup=setup;
  var ro=window.ResizeObserver?new ResizeObserver(setup):null;if(ro)ro.observe(cv);
  setup();

  function arrowDown(x,y,len){
    ctx.strokeStyle=RED;ctx.lineWidth=4;ctx.lineCap='butt';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+len-8);ctx.stroke();
    ctx.fillStyle=RED;ctx.beginPath();ctx.moveTo(x,y+len);ctx.lineTo(x-7,y+len-10);ctx.lineTo(x+7,y+len-10);ctx.fill();
  }
  function arrowLeft(x,y,len){
    ctx.strokeStyle=RED;ctx.lineWidth=4.5;ctx.beginPath();ctx.moveTo(x+len,y);ctx.lineTo(x+9,y);ctx.stroke();
    ctx.fillStyle=RED;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+12,y-7.5);ctx.lineTo(x+12,y+7.5);ctx.fill();
  }
  function arcArrow(cx,cy,r,a0,a1){
    ctx.strokeStyle=RED;ctx.lineWidth=4;ctx.lineCap='butt';
    ctx.beginPath();ctx.arc(cx,cy,r,a0,a1,a1<a0);ctx.stroke();
    var e=a1,dir=a1>a0?1:-1,tx=-Math.sin(e)*dir,ty=Math.cos(e)*dir,px=cx+Math.cos(e)*r,py=cy+Math.sin(e)*r;
    ctx.fillStyle=RED;ctx.beginPath();
    ctx.moveTo(px+tx*9,py+ty*9);ctx.lineTo(px-ty*7,py+tx*7);ctx.lineTo(px+ty*7,py-tx*7);ctx.fill();
  }
  function steel(x,y,w,h){
    var g=ctx.createLinearGradient(x,y,x+w,y+h);
    g.addColorStop(0,'#aeb9b6');g.addColorStop(.35,'#e9eeec');g.addColorStop(.6,'#c3ccc9');g.addColorStop(1,'#93a09c');
    ctx.fillStyle=g;ctx.fillRect(x,y,w,h);ctx.strokeStyle='rgba(50,60,58,.5)';ctx.lineWidth=.8;ctx.strokeRect(x+.4,y+.4,w-.8,h-.8);
  }
  function disc(cx,cy,R,a,img,flip){
    ctx.save();ctx.translate(cx,cy);ctx.rotate(a);if(flip)ctx.scale(1,-1);
    var d=2*(BR+4)*R/BR;ctx.drawImage(img,-d/2,-d/2,d,d);ctx.restore();
  }
  function plate(){
    var w=104,h=22,x=12,y=12;
    ctx.fillStyle='#1f2227';ctx.fillRect(x,y,w,h);
    ctx.fillStyle='#e0a030';ctx.fillRect(x,y,3,h);
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.font='900 11px Arial';
    ctx.fillStyle='#f3f4f6';ctx.fillText('POWERFUL',x+10,y+h/2+.5);
    var pw=ctx.measureText('POWERFUL ').width;ctx.fillStyle='#e0a030';ctx.fillText('PRO',x+10+pw,y+h/2+.5);
    ctx.textBaseline='alphabetic';
  }
  function dust(x,y,n,dir){for(var i=0;i<n;i++){var pl=Math.random();
    parts.push({x:x,y:y+rnd(-3,3),vx:dir*rnd(.8,3.8),vy:rnd(-2.6,1),life:1,dec:rnd(.02,.045),s:rnd(.9,2.2),
      c:pl<.5?'214,176,104':pl<.8?'184,135,62':'240,215,154'})}}

  self.frame=function(ts,dt){
    if(!tex.length)return;
    if(!t0)t0=ts;
    var t=ts-t0;if(t>NB*CYC+HOLD){t0=ts;t=0;parts.length=0}
    var k=Math.min(Math.floor(t/CYC),NB),lt=t-k*CYC;
    var bd=0,q=0;                                   // bd: siquvchi pastga (0..1), q: karetka yo'li (0..1)
    if(k<NB){
      if(lt<DOWN)bd=ease(lt/DOWN);
      else if(lt<DOWN+PASS){bd=1;q=(lt-DOWN)/PASS}
      else{bd=1-ease((lt-DOWN-PASS)/UP);q=1}
    }
    pct.textContent=Math.round((k<NB?(k+q)/NB:1)*100)+'%';
    angle+=.13*dt/16;

    ctx.setTransform(res*s,0,0,res*s,0,0);ctx.clearRect(0,0,W,WH+2);
    var g=ctx.createLinearGradient(0,0,0,WH);g.addColorStop(0,'#ffffff');g.addColorStop(1,'#eef0f2');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,WH+2);

    // karetka: katta arra o'ngdan chapga yuradi, kichik arra oldinda (chapda)
    // ikkala arra doim ko'rinib turadi: karetka o'ngdan chapga kesib o'tadi, siquvchi ko'tarilganda qaytadi
    var xR=W-R1-6,xL=Math.max(DX+R2+16,W*.40),BX;
    if(k>=NB||lt<DOWN)BX=xR;
    else if(lt<DOWN+PASS)BX=xR-(q*.75+ease(q)*.25)*(xR-xL);
    else BX=xL+ease((lt-DOWN-PASS)/UP)*(xR-xL);
    var SX=BX-DX;
    var c1y=TOP+R1-4,c2y=BOT-7+R2;
    // karetka plitasi (ikki arra orasida)
    steel(SX+R2*.3,BOT+18,DX-R2*.3,58);
    disc(SX,c2y,R2,angle*1.9,bladeS,false);       // kichik arra (soat yo'nalishida)
    // plita taxlami (4 qavat)
    for(var i=0;i<NL;i++){
      var y=TOP+i*(LH+LG);
      ctx.drawImage(tex[i],0,0,tex[i].width,tex[i].height,0,y,W,LH);
      ctx.strokeStyle='rgba(60,50,30,.6)';ctx.lineWidth=.7;ctx.strokeRect(-1,y+.35,W+2,LH-.7);
    }
    // katta arra — taxlam oldida (namunadagidek), plitani butun qalinligi bo'yicha kesadi
    disc(BX,c1y,R1,-angle,blade,false);
    // siquvchi (prijim) va ustunlar
    var bx0=W*.12,bx1=W*.80,by=TOP-16-(1-bd)*12;
    steel(bx0+30,0,7,by);steel(bx1-37,0,7,by);
    steel(bx0,by,bx1-bx0,14);
    if(bd>.05){ctx.globalAlpha=Math.min(1,bd*1.4);arrowDown(bx0-12,by-44,40);arrowDown(bx1+12,by-44,40);ctx.globalAlpha=1}
    // aylanish va yurish strelkalari
    if(BX<W+R1&&BX>-R1){
      arcArrow(BX,c1y,R1*.62,Math.PI*.32,-Math.PI*.12);
      arrowLeft(SX+R2+14,BOT+48,Math.min(70,DX-R2-30));
    }
    if(SX<W+R2&&SX>-R2){
      arcArrow(SX,c2y,R2+12,Math.PI*.85,Math.PI*1.3);
    }
    // qirindi
    if(bd===1&&q>0&&q<1)dust(BX-R1*.62,TOP+4,3,-1);
    if(bd===1&&q>0&&q<1)dust(SX-R2*.5,BOT-2,1,-1);
    for(var p2=parts.length-1;p2>=0;p2--){
      var p=parts[p2];p.x+=p.vx;p.y+=p.vy;p.vy+=.08;p.vx*=.97;p.life-=p.dec;
      if(p.life<=0){parts.splice(p2,1);continue}
      ctx.fillStyle='rgba('+p.c+','+(p.life*.9)+')';ctx.fillRect(p.x,p.y,p.s,p.s*.8);
    }
    plate();
  };
}


  // ── Ilovaga ulash: har bir yuklanish oynasiga canvas va foiz ──
  var loaders = [];
  function attach() {
    var boxes = document.querySelectorAll('.fw-load .fw-load-in');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i]; if (box.getAttribute('data-saw')) continue;
      box.setAttribute('data-saw', '1'); box.classList.add('has-saw');
      var cv = document.createElement('canvas'); cv.className = 'fw-saw'; cv.setAttribute('aria-hidden', 'true');
      var pc = document.createElement('div'); pc.className = 'pct fw-saw-pct'; pc.textContent = '0%';
      var bar = box.querySelector('.fw-load-bar');
      if (bar && bar.parentNode) bar.parentNode.insertBefore(cv, bar); else box.appendChild(cv);
      box.appendChild(pc);
      loaders.push({ box: box, L: null, cv: cv, pc: pc });
    }
  }
  function visible(el) { return !!(el && el.offsetParent !== null && el.getClientRects().length); }
  var lastTs = 0, running = false;
  function loop(ts) {
    var dt = Math.min(ts - (lastTs || ts), 40); lastTs = ts;
    var any = false;
    for (var i = 0; i < loaders.length; i++) {
      var o = loaders[i];
      if (!visible(o.box)) continue;
      any = true;
      if (!o.L) { try { o.L = new Loader({ querySelector: function (s) { return s === 'canvas' ? o.cv : o.pc; } }, function () { return 1; }); } catch (e) { continue; } }
      o.L.frame(ts, dt);
    }
    if (any) requestAnimationFrame(loop);
    else { running = false; setTimeout(kick, 400); }   // yashirin — sekin tekshiruv (oyna qayta ochilsa davom etadi)
  }
  function kick() { attach(); if (!running) { running = true; lastTs = 0; requestAnimationFrame(loop); } }
  window.fwSawLoaderKick = kick;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kick); else kick();
})();
