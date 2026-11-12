// POWERFUL GROUP — YUKLANISH ANIMATSIYASI (egasi namunasi, 2026-11): stanok yon/ostdan — yog'och taxta stanok ustida
// o'ngdan chapga yuradi, ostida katta arra va kronshteynli kichik (skorlovchi) arra kesadi. Yorug' sahna; 4 taxta = 100%.
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
function makeBlade(N,big){
  // Haqiqiy POWERFUL PRO arrasi (egasi surati): ko'zgudek tashqi halqa, cho'tkalangan kumush markaz,
  // karbid plastinkali tishlar, ilgaksimon kengayish tirqishlari, markazda to'g'ri yozuv.
  var sz=Math.ceil((BR*2+8)*BK),c=document.createElement('canvas');c.width=c.height=sz;
  var x=c.getContext('2d');x.translate(sz/2,sz/2);x.scale(BK,BK);
  var Rt=BR,Rg=BR-(big?6.5:10),Rb=Rg-2.2,Rc=BR*(big?.70:.62),i;
  function P(a,r){return [Math.cos(a)*r,Math.sin(a)*r]}
  function conic(st,rot){
    if(!x.createConicGradient){var r=x.createRadialGradient(-20,-20,5,0,0,BR);r.addColorStop(0,st[0]);r.addColorStop(1,st[1]);return r}
    var g=x.createConicGradient(rot,0,0);for(var k=0;k<=st.length;k++)g.addColorStop(k/st.length,st[k%st.length]);return g;
  }
  // 1) tishli plastinka (tashqi halqa) — ko'zgudek to'q po'lat
  var step=Math.PI*2/N;
  x.beginPath();
  for(i=0;i<N;i++){
    var a=i*step,s0=P(a,Rg-.4),cb=P(a+step*.45,Rt-2.2),tip=P(a+step*.80,Rt-1.2),
        f1=P(a+step*.82,Rg+(Rt-Rg)*.25),gc=P(a+step*.93,Rb-1.6),e0=P(a+step,Rg-.4);
    i?x.lineTo(s0[0],s0[1]):x.moveTo(s0[0],s0[1]);
    x.quadraticCurveTo(cb[0],cb[1],tip[0],tip[1]);x.lineTo(f1[0],f1[1]);x.quadraticCurveTo(gc[0],gc[1],e0[0],e0[1]);
  }
  x.closePath();
  x.fillStyle=conic(['#3a3f45','#8d949c','#2b2f34','#5d646c','#c7ccd1','#3d4248','#70777f','#24282c'],.3);x.fill();
  x.strokeStyle='rgba(10,12,14,.6)';x.lineWidth=.35;x.stroke();
  // 2) karbid plastinkalar — tish yuzida yaltiroq kumush to'rtburchak
  var th=Math.min(4.2,(Rt-Rg)*.75);
  for(i=0;i<N;i++){
    var a1=i*step,t1=P(a1+step*.80,Rt),t2=P(a1+step*.84,Rt-th),t3=P(a1+step*.70,Rt-th),t4=P(a1+step*.68,Rt-.4);
    x.beginPath();x.moveTo(t1[0],t1[1]);x.lineTo(t2[0],t2[1]);x.lineTo(t3[0],t3[1]);x.lineTo(t4[0],t4[1]);x.closePath();
    var cg=x.createLinearGradient(t4[0],t4[1],t2[0],t2[1]);cg.addColorStop(0,'#fbfcfd');cg.addColorStop(1,'#a9afb6');
    x.fillStyle=cg;x.fill();x.strokeStyle='rgba(20,22,26,.7)';x.lineWidth=.3;x.stroke();
  }
  // 3) ilgaksimon kengayish tirqishlari (gardishdan ichkariga, uchi buralgan)
  var ns=big?4:3;
  for(i=0;i<ns;i++){
    var a2=i*Math.PI*2/ns+.55,p1=P(a2,Rg-.5),p2=P(a2+.02,Rc+3),cx=P(a2+.06,Rc+1.2);
    x.beginPath();x.moveTo(p1[0],p1[1]);x.lineTo(p2[0],p2[1]);
    x.arc(cx[0],cx[1],1.8,a2+Math.PI*.9,a2+Math.PI*2.4);
    x.strokeStyle='#0d0f11';x.lineWidth=big?.8:.7;x.lineCap='round';x.stroke();
  }
  // 4) markaz — cho'tkalangan kumush (yorug' nur chiziqlari bilan)
  x.beginPath();x.arc(0,0,Rc,0,6.283);
  x.fillStyle=conic(['#c3c8cd','#eef1f3','#aeb4ba','#dfe3e6','#b5bbc1','#f7f8f9','#a7adb4','#d6dade'],1.1);x.fill();
  x.save();x.clip();
  for(i=0;i<70;i++){var ra=Math.random()*6.283;x.beginPath();x.moveTo(0,0);x.lineTo(Math.cos(ra)*Rc,Math.sin(ra)*Rc);
    x.strokeStyle='rgba(255,255,255,'+rnd(.05,.18)+')';x.lineWidth=rnd(.3,1.4);x.stroke()}
  var hl=x.createRadialGradient(0,-Rc*.35,0,0,-Rc*.35,Rc*.9);hl.addColorStop(0,'rgba(255,255,255,.35)');hl.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=hl;x.fillRect(-Rc,-Rc,Rc*2,Rc*2);
  x.restore();
  x.beginPath();x.arc(0,0,Rc,0,6.283);x.strokeStyle='rgba(30,34,38,.35)';x.lineWidth=.5;x.stroke();
  // 5) yozuv (o'yib yozilgandek): Powerful Pro / FOR WOOD / o'lcham
  if(big){
    x.textAlign='center';x.textBaseline='middle';
    x.font='300 9.5px "Segoe UI",Arial,sans-serif';x.lineWidth=.35;
    x.strokeStyle='rgba(60,64,70,.85)';x.strokeText('Powerful Pro',0,-Rc*.48);
    x.font='bold 3.6px Arial';x.fillStyle='rgba(70,74,80,.85)';x.fillText('FOR  WOOD',0,-Rc*.30);
    x.font='bold 3.2px Arial';x.fillText('200x1.7x32x48T',0,-Rc*.19);
  }
  // 6) teshik (o'q) va gardish
  x.beginPath();x.arc(0,0,BR*.2,0,6.283);x.fillStyle='#9aa0a7';x.fill();
  x.beginPath();x.arc(0,0,BR*.2,0,6.283);x.strokeStyle='rgba(30,34,38,.5)';x.lineWidth=.5;x.stroke();
  x.beginPath();x.arc(0,0,BR*.13,0,6.283);x.fillStyle='#121417';x.fill();
  return c;
}
// Katta asosiy arra — haqiqiy Rover tig'i (egasi surati): butun disk cho'tkalangan kumush, ingichka o'yilgan aylana,
// 96 karbid tish, mis tiqinli kengayish tirqishlari, radius bo'ylab yozuv.
function makeRover(N){
  var sz=Math.ceil((BR*2+8)*BK),c=document.createElement('canvas');c.width=c.height=sz;
  var x=c.getContext('2d');x.translate(sz/2,sz/2);x.scale(BK,BK);
  var Rt=BR,Rg=BR-4.6,Rb=Rg-1.6,i;
  function P(a,r){return [Math.cos(a)*r,Math.sin(a)*r]}
  function conic(st,rot){
    if(!x.createConicGradient){var r=x.createRadialGradient(-20,-20,5,0,0,BR);r.addColorStop(0,st[0]);r.addColorStop(1,st[1]);return r}
    var g=x.createConicGradient(rot,0,0);for(var k=0;k<=st.length;k++)g.addColorStop(k/st.length,st[k%st.length]);return g;
  }
  var step=Math.PI*2/N;
  // tishli disk (tor, chuqur tublar)
  x.beginPath();
  for(i=0;i<N;i++){
    var a=i*step,s0=P(a,Rg-.2),cb=P(a+step*.4,Rt-1.4),tip=P(a+step*.74,Rt-.6),
        f1=P(a+step*.76,Rb+.6),gc=P(a+step*.88,Rb-1.4),e0=P(a+step,Rg-.2);
    i?x.lineTo(s0[0],s0[1]):x.moveTo(s0[0],s0[1]);
    x.quadraticCurveTo(cb[0],cb[1],tip[0],tip[1]);x.lineTo(f1[0],f1[1]);x.quadraticCurveTo(gc[0],gc[1],e0[0],e0[1]);
  }
  x.closePath();
  x.fillStyle=conic(['#9ea4ab','#e6e9ec','#8a9098','#c9cdd2','#f4f6f7','#959ba2','#d7dbdf','#7f858c'],.5);x.fill();
  x.strokeStyle='rgba(20,22,26,.45)';x.lineWidth=.25;x.stroke();
  // cho'tkalangan iz va yaltiroq nurlar
  x.save();x.beginPath();x.arc(0,0,Rg,0,6.283);x.clip();
  for(i=0;i<120;i++){var rr=rnd(BR*.2,Rg);x.beginPath();x.arc(0,0,rr,0,6.283);
    x.strokeStyle='rgba('+(Math.random()<.5?'255,255,255':'60,64,70')+','+rnd(.03,.09)+')';x.lineWidth=rnd(.2,.6);x.stroke()}
  [[-.9,.30],[1.9,.22],[3.5,.16]].forEach(function(b){
    var g=x.createLinearGradient(Math.cos(b[0])*-BR,Math.sin(b[0])*-BR,Math.cos(b[0])*BR,Math.sin(b[0])*BR);
    g.addColorStop(.42,'rgba(255,255,255,0)');g.addColorStop(.5,'rgba(255,255,255,'+b[1]+')');g.addColorStop(.58,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(-BR,-BR,BR*2,BR*2)});
  x.restore();
  // karbid uchliklar (yaltiroq, biroz kamalakrang)
  var th=3.2;
  for(i=0;i<N;i++){
    var a1=i*step,t1=P(a1+step*.74,Rt),t2=P(a1+step*.77,Rt-th),t3=P(a1+step*.56,Rt-th),t4=P(a1+step*.55,Rt-.5);
    x.beginPath();x.moveTo(t1[0],t1[1]);x.lineTo(t2[0],t2[1]);x.lineTo(t3[0],t3[1]);x.lineTo(t4[0],t4[1]);x.closePath();
    var cg=x.createLinearGradient(t4[0],t4[1],t2[0],t2[1]);cg.addColorStop(0,'#ffffff');cg.addColorStop(.5,'#d8dde3');cg.addColorStop(1,'#8f969e');
    x.fillStyle=cg;x.fill();x.strokeStyle='rgba(20,22,26,.6)';x.lineWidth=.22;x.stroke();
  }
  // o'yilgan aylana chiziq
  x.beginPath();x.arc(0,0,BR*.79,0,6.283);x.strokeStyle='rgba(50,54,60,.45)';x.lineWidth=.4;x.stroke();
  x.beginPath();x.arc(0,0,BR*.79+.5,0,6.283);x.strokeStyle='rgba(255,255,255,.5)';x.lineWidth=.3;x.stroke();
  // kengayish tirqishlari — uchida mis tiqin
  for(i=0;i<4;i++){
    var a2=i*Math.PI/2+.3,p1=P(a2,Rb),p2=P(a2-.03,BR*.83);
    x.beginPath();x.moveTo(p1[0],p1[1]);x.lineTo(p2[0],p2[1]);x.strokeStyle='#15171a';x.lineWidth=.55;x.stroke();
    x.beginPath();x.arc(p2[0],p2[1],1.7,0,6.283);x.fillStyle='#b8693c';x.fill();
    x.strokeStyle='rgba(255,255,255,.7)';x.lineWidth=.35;x.stroke();
  }
  // yozuv — radius bo'ylab (suratdagidek)
  x.save();x.rotate(-Math.PI*.30);
  x.textAlign='left';x.textBaseline='middle';
  x.font='bold 8.5px Arial,sans-serif';x.fillStyle='rgba(55,58,64,.85)';x.fillText('Powerful',BR*.24,0);
  x.font='bold 2.7px Arial';x.fillStyle='rgba(55,58,64,.85)';
  x.fillText('CAB01 300X96TX3.2/2.2X30-TP',BR*.24,6.4);
  x.fillText('MAX.6000.RPM',BR*.34,9.6);
  x.fillText('5102-080521001-03',BR*.30,12.8);
  x.restore();
  // o'q teshigi va gardish
  x.beginPath();x.arc(0,0,BR*.2,0,6.283);x.fillStyle=conic(['#c4c9ce','#8f959c','#e3e6e9','#9da3aa'],0);x.fill();
  x.strokeStyle='rgba(30,34,38,.45)';x.lineWidth=.45;x.stroke();
  x.beginPath();x.arc(0,0,BR*.12,0,6.283);x.fillStyle='#121417';x.fill();
  return c;
}
var blade=makeRover(96),bladeS=makeBlade(48,false);

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

/* ---------- bitta yuklanish ekrani (yon/ost tomondan ko'rinish — egasi namunasi) ---------- */
// Taxta stanok ustida o'ngdan chapga suriladi; ostida katta (asosiy) arra va o'ng tomonda kronshteynli kichik
// (skorlovchi) arra. Sahna yorug' (ochiq) — arralar orasi aniq ko'rinadi. Stanokdagi yozuv — faqat «POWERFUL PRO».
var NB=4,PASS=2300,PAUSE=350,HOLD=900;
function Loader(frame,getScale){
  var self=this;
  var cv=frame.querySelector('canvas'),pct=frame.querySelector('.pct'),ctx=cv.getContext('2d');
  var W=380,s=1,res=1,L=200,TY=78,TH=20,BX=160,SX=290,R1=82,R2=30,tex=null,parts=[],angle=0,t0=null;
  function setup(){
    var cw=cv.clientWidth,ch=cv.clientHeight;if(!cw||!ch)return;
    var sc=getScale();res=clamp((window.devicePixelRatio||1)*sc,.7,2.6);
    cv.width=Math.round(cw*res);cv.height=Math.round(ch*res);
    s=ch/WH;W=cw/s;
    BX=clamp(W*.40,120,W*.5);SX=BX+R1+46;L=clamp(W*.46,150,440);
    tex=makeTop(L,TH,res*s*1.1);
  }
  self.setup=setup;
  var ro=window.ResizeObserver?new ResizeObserver(setup):null;if(ro)ro.observe(cv);
  setup();

  function scene(){
    var g=ctx.createLinearGradient(0,0,0,WH);
    g.addColorStop(0,'#fbfbfc');g.addColorStop(1,'#e9ecf0');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,WH+2);
    // stanok stoli (taxta ustida yuradi), arralar uchun ochiq tirqish
    var gx0=BX-R1-6,gx1=SX+R2+8;
    ctx.fillStyle='#cfd3d9';ctx.fillRect(0,TY,gx0,6);ctx.fillRect(gx1,TY,W-gx1,6);
    ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(0,TY+6,gx0,1.5);ctx.fillRect(gx1,TY+6,W-gx1,1.5);
  }
  function bracket(){
    // kichik arra kronshteyni (namunadagidek: katta arra o'qidan o'ngga chiqqan plita)
    var x0=BX+12,y0=TY+16,x1=SX+6,y1=TY+58;
    var g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,'#dfe2e6');g.addColorStop(1,'#b9bec5');
    ctx.fillStyle=g;ctx.fillRect(x0,y0,x1-x0,y1-y0);
    ctx.strokeStyle='rgba(60,66,74,.35)';ctx.lineWidth=.8;ctx.strokeRect(x0,y0,x1-x0,y1-y0);
    // balandlik sozlash belgisi ↕
    var ax=SX-R2-14,ay=(y0+y1)/2;
    ctx.strokeStyle='#d98a12';ctx.lineWidth=1.6;ctx.setLineDash([2.5,2]);
    ctx.beginPath();ctx.moveTo(ax,ay-13);ctx.lineTo(ax,ay+13);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#d98a12';
    ctx.beginPath();ctx.moveTo(ax,ay-17);ctx.lineTo(ax-4,ay-11);ctx.lineTo(ax+4,ay-11);ctx.fill();
    ctx.beginPath();ctx.moveTo(ax,ay+17);ctx.lineTo(ax-4,ay+11);ctx.lineTo(ax+4,ay+11);ctx.fill();
  }
  function disc(cx,cy,R,a,img){
    ctx.save();ctx.translate(cx,cy);ctx.rotate(a);
    ctx.shadowColor='rgba(0,0,0,.22)';ctx.shadowBlur=8;ctx.shadowOffsetY=3;
    var d=2*(BR+4)*R/BR;if(img===bladeS)ctx.scale(1,-1);ctx.drawImage(img||blade,-d/2,-d/2,d,d);ctx.restore();
  }
  function arcArrow(cx,cy,r,a0,a1){
    ctx.strokeStyle='#d98a12';ctx.lineWidth=2.4;ctx.lineCap='round';
    ctx.beginPath();ctx.arc(cx,cy,r,a0,a1,a1<a0);ctx.stroke();
    var e=a1,dir=a1>a0?1:-1,tx=-Math.sin(e)*dir,ty=Math.cos(e)*dir,px=cx+Math.cos(e)*r,py=cy+Math.sin(e)*r;
    ctx.fillStyle='#d98a12';ctx.beginPath();
    ctx.moveTo(px+tx*6,py+ty*6);ctx.lineTo(px-ty*4.5,py+tx*4.5);ctx.lineTo(px+ty*4.5,py-tx*4.5);ctx.fill();
  }
  function board(x,cutTo,scoreTo){
    if(x>W||x+L<0)return;
    var y=TY-TH;
    ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(x+2,y+3,L,TH);
    ctx.drawImage(tex,0,0,tex.width,tex.height,x,y,L,TH);
    ctx.strokeStyle='rgba(90,58,26,.55)';ctx.lineWidth=.8;ctx.strokeRect(x+.4,y+.4,L-.8,TH-.8);
    // kesilgan qism: ostida skorlovchi ariqcha, kesim chizig'i (yangi yog'och — ochroq)
    var c1=Math.min(x+L,scoreTo);
    if(c1>x){ctx.fillStyle='rgba(40,26,12,.55)';ctx.fillRect(x,TY-2.2,c1-x,1.4);}
    var c2=Math.min(x+L,cutTo);
    if(c2>x){ctx.fillStyle='rgba(255,236,200,.35)';ctx.fillRect(x,y,c2-x,TH);
      ctx.fillStyle='rgba(60,36,14,.5)';ctx.fillRect(x,y+TH*.5-.4,c2-x,.8);}
  }
  function plate(){
    // stanokdagi yozuv — faqat «POWERFUL PRO»
    var w=104,h=22,x=W-w-12,y=WH-h-12;
    ctx.fillStyle='#1f2227';ctx.fillRect(x,y,w,h);
    ctx.fillStyle='#e0a030';ctx.fillRect(x,y,3,h);
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.font='900 11px Arial';
    ctx.fillStyle='#f3f4f6';ctx.fillText('POWERFUL',x+10,y+h/2+.5);
    var pw=ctx.measureText('POWERFUL ').width;ctx.fillStyle='#e0a030';ctx.fillText('PRO',x+10+pw,y+h/2+.5);
    ctx.textBaseline='alphabetic';
  }
  function dust(x,y,n,dir){for(var i=0;i<n;i++){var pl=Math.random();
    parts.push({x:x,y:y+rnd(-2,2),vx:dir*rnd(.8,3.6),vy:rnd(-2.4,1.2),life:1,dec:rnd(.02,.045),s:rnd(.9,2.2),
      c:pl<.5?'196,150,96':pl<.8?'170,122,72':'225,190,140'})}}

  self.frame=function(ts,dt){
    if(!tex)return;
    if(!t0)t0=ts;
    var cyc=NB*(PASS+PAUSE),t=ts-t0;if(t>cyc+HOLD){t0=ts;t=0;parts.length=0}
    var k=Math.min(Math.floor(t/(PASS+PAUSE)),NB),lt=t-k*(PASS+PAUSE),q=k<NB?clamp(lt/PASS,0,1):1;
    pct.textContent=Math.round((k<NB?(k+q)/NB:1)*100)+'%';
    angle+=.12*dt/16;

    ctx.setTransform(res*s,0,0,res*s,0,0);ctx.clearRect(0,0,W,WH+2);
    scene();
    var c1y=TY-TH+R1-3,c2y=TY-6+R2;
    bracket();
    disc(BX,c1y,R1,angle);          // katta arra (soat yo'nalishida)
    disc(SX,c2y,R2,-angle*1.9,bladeS);     // kichik arra (teskari)
    arcArrow(BX,c1y,R1+9,Math.PI*.62,Math.PI*.95);
    arcArrow(SX,c2y,R2+8,Math.PI*-.05,Math.PI*-.4);

    var xB=k<NB?(W+12)-ease(q)*(W+12+L+12)*.15-q*(W+12+L+12)*.85:-L-20;
    board(xB,BX,SX);
    // surish yo'nalishi ←
    if(k<NB&&xB<W&&xB+L>0){
      var ax=clamp(xB+L*.55,30,W-30),ay=TY-TH-9;
      ctx.strokeStyle='#d98a12';ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(ax+16,ay);ctx.lineTo(ax-8,ay);ctx.stroke();
      ctx.fillStyle='#d98a12';ctx.beginPath();ctx.moveTo(ax-14,ay);ctx.lineTo(ax-6,ay-5);ctx.lineTo(ax-6,ay+5);ctx.fill();
    }
    if(xB<BX+8&&xB+L>BX-8)dust(BX+6,TY-4,3,1);
    if(xB<SX&&xB+L>SX)dust(SX-4,TY-1,1,-1);
    for(var i=parts.length-1;i>=0;i--){
      var p=parts[i];p.x+=p.vx;p.y+=p.vy;p.vy+=.08;p.vx*=.97;p.life-=p.dec;
      if(p.life<=0){parts.splice(i,1);continue}
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
