// POWERFUL GROUP — YUKLANISH ANIMATSIYASI (egasi dizayni, 2026-11): formatli arra stanoki ustdan ko'rinishda —
// kichik (skorlovchi) va katta arra plitani UZUNASIGA to'g'ri kesadi: 4 ta kesim → 5 ta tor bo'lak (eniga torayadi).
// Admin (#bp-loading), sotuvchi va diller (#fw-splash) yuklanish oynalarida avtomatik ishga tushadi.
// Faqat oyna KO'RINIB turganda chiziladi (kirib bo'lgach — to'xtaydi, protsessor/batareya band qilinmaydi).
// «Kamroq harakat» (prefers-reduced-motion) yoqilgan qurilmada — chizilmaydi (oddiy arra tig'i qoladi).
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.requestAnimationFrame) return;
  try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}

var WH=250,BR=68,PH=62,PY=156,TS=22;
var INTRO=700,FEED=1400,SEP=450,STG=FEED+SEP,NS=4,NP=5,OUT=2400,TOTAL=INTRO+NS*STG+OUT,KY=104,SW=16,GAPS=3,SCX=70;
function rnd(a,b){return a+Math.random()*(b-a)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function ease(q){q=clamp(q,0,1);return q<.5?2*q*q:1-Math.pow(-2*q+2,2)/2}

/* ---------- arra diski (bir marta) ---------- */
var BK=3,blade=(function(){
  var sz=Math.ceil((BR*2+8)*BK),c=document.createElement('canvas');c.width=c.height=sz;
  var x=c.getContext('2d');x.translate(sz/2,sz/2);x.scale(BK,BK);
  function steel(){
    if(x.createConicGradient){
      var g=x.createConicGradient(.4,0,0),st=['#d9dde2','#8f959d','#eef0f2','#7f858d','#dfe3e7','#969ca4','#f2f4f5','#868c94'];
      for(var i=0;i<=8;i++)g.addColorStop(i/8,st[i%8]);return g;
    }
    var r=x.createRadialGradient(-20,-20,5,0,0,BR);r.addColorStop(0,'#f0f2f4');r.addColorStop(1,'#8a9098');return r;
  }
  var N=60,step=Math.PI*2/N,Rb=BR-5;
  function P(a,r){return [Math.cos(a)*r,Math.sin(a)*r]}
  x.fillStyle=steel();x.beginPath();
  for(var i=0;i<N;i++){
    var a=i*step,p0=P(a,Rb),p1=P(a+step*.18,BR-1.5),p2=P(a+step*.8,BR-1.5),p3=P(a+step,Rb);
    if(!i)x.moveTo(p0[0],p0[1]);else x.lineTo(p0[0],p0[1]);
    x.lineTo(p1[0],p1[1]);x.lineTo(p2[0],p2[1]);x.lineTo(p3[0],p3[1]);
  }
  x.closePath();x.fill();x.strokeStyle='rgba(30,34,40,.55)';x.lineWidth=.5;x.stroke();
  for(var j=0;j<N;j++){
    var b=j*step,q=[P(b+step*.12,BR-5),P(b+step*.2,BR+.6),P(b+step*.82,BR+.6),P(b+step*.78,BR-5)];
    x.beginPath();x.moveTo(q[0][0],q[0][1]);for(var m=1;m<4;m++)x.lineTo(q[m][0],q[m][1]);x.closePath();
    x.fillStyle='#f6f7f8';x.fill();x.strokeStyle='#4d535b';x.lineWidth=.55;x.stroke();
  }
  x.beginPath();x.arc(0,0,Rb-1,0,6.283);x.strokeStyle='rgba(20,24,30,.35)';x.lineWidth=1;x.stroke();
  x.beginPath();x.arc(0,0,BR*.52,0,6.283);x.strokeStyle='rgba(20,24,30,.28)';x.lineWidth=.9;x.stroke();
  x.beginPath();x.arc(0,0,BR*.52+1.2,0,6.283);x.strokeStyle='rgba(255,255,255,.35)';x.lineWidth=.7;x.stroke();
  for(var s=0;s<8;s++){
    var a0=s*Math.PI/4+.12;
    x.beginPath();x.arc(0,0,BR*.8,a0,a0+.5);x.strokeStyle='#3d424a';x.lineWidth=1.5;x.lineCap='round';x.stroke();
    var e1=P(a0,BR*.8),e2=P(a0+.5,BR*.8);x.fillStyle='#262a30';
    [e1,e2].forEach(function(e){x.beginPath();x.arc(e[0],e[1],2,0,6.283);x.fill()});
  }
  for(var d=0;d<8;d++){var pp=P(d*Math.PI/4+.4,BR*.64);x.beginPath();x.arc(pp[0],pp[1],1.3,0,6.283);x.fillStyle='#2e3238';x.fill()}
  function arcText(txt,R,center,font,top,colors){
    x.font=font;x.textAlign='center';x.textBaseline='middle';
    var sp=.9,ws=[],tot=0,i;
    for(i=0;i<txt.length;i++){ws[i]=x.measureText(txt[i]).width+sp;tot+=ws[i]}
    var ang=tot/R,a=top?center-ang/2:center+ang/2;
    for(i=0;i<txt.length;i++){
      var da=ws[i]/R,mid=top?a+da/2:a-da/2;
      x.save();x.translate(Math.cos(mid)*R,Math.sin(mid)*R);x.rotate(top?mid+Math.PI/2:mid-Math.PI/2);
      x.fillStyle='rgba(255,255,255,.55)';x.fillText(txt[i],0,.6);
      x.fillStyle=colors(i);x.fillText(txt[i],0,0);x.restore();
      a+=top?da:-da;
    }
  }
  arcText('POWERFUL GROUP',BR*.42,-Math.PI/2,'900 6.4px Arial',true,function(i){return i>=9?'#c2720c':'#2f343b'});
  arcText('PROFESSIONAL SAW',BR*.42,Math.PI/2,'bold 3.9px Arial',false,function(){return '#3e444c'});
  x.beginPath();x.arc(0,0,BR*.2,0,6.283);x.fillStyle='#b3b8be';x.fill();
  x.beginPath();x.arc(0,0,BR*.15,0,6.283);x.fillStyle='#0f1114';x.fill();
  x.fillStyle='#0f1114';[-1,1].forEach(function(s){x.beginPath();x.ellipse(s*BR*.27,0,4.2,2.6,0,0,6.283);x.fill()});
  return c;
})();

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

/* ---------- bitta yuklanish ekrani ---------- */
function Loader(frame,getScale){
  var self=this;
  var cv=frame.querySelector('canvas'),pct=frame.querySelector('.pct'),ctx=cv.getContext('2d');
  var W=380,s=1,res=1,pw=70,gap=6,xS=0,xE=0,L=160,bS=0,BX=190,tex=null,parts=[],angle=0,t0=null,last=0,spinStep=.3;
  function setup(){
    var cw=cv.clientWidth,ch=cv.clientHeight;if(!cw||!ch)return;
    var sc=getScale();res=clamp((window.devicePixelRatio||1)*sc,.7,2.6);
    cv.width=Math.round(cw*res);cv.height=Math.round(ch*res);
    s=ch/WH;W=cw/s;
    BX=W/2-20;bS=BX+SCX;L=clamp(W*.40,100,480);xS=bS+30;xE=BX-30-L;tex=makeTop(L,NP*SW,res*s*1.1);
  }
  self.setup=setup;
  var ro=window.ResizeObserver?new ResizeObserver(setup):null;if(ro)ro.observe(cv);
  setup();

  function spawn(x,y,n){for(var i=0;i<n;i++){var pl=Math.random();
    parts.push({x:x,y:y-rnd(0,2),vx:rnd(-3.4,1.2),vy:-rnd(1.4,4.4),life:1,dec:rnd(.012,.028),s:rnd(.9,2.5),
      c:pl<.5?'236,210,165':pl<.8?'214,178,126':'248,236,212'})}}

  function slotY(s){return KY+SW+GAPS+s*(SW+GAPS)}
  function stripY(o,r,sp){
    var n=NP-r,hi=NP-1-r;
    if(r<NS&&o===hi)return KY+(slotY(0)-KY)*sp;
    if(o>hi){var s0=r-1-(NP-1-o);return slotY(s0)+(SW+GAPS)*sp}
    return KY+SW-n*SW+o*SW+SW*sp;
  }
  function drawStrip(o,y,x){
    var kk=tex.width/L;
    if(x>W||x+L<0)return;
    ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(x+2,y+2.5,L,SW);
    ctx.drawImage(tex,0,o*SW*kk,L*kk,SW*kk,x,y,L,SW);
    // kesilgan chet — yangi kesilgan yog'och (ochroq)
    ctx.fillStyle='#e2b47c';ctx.fillRect(x,y,L,1.5);ctx.fillRect(x,y+SW-1.5,L,1.5);
    ctx.fillStyle='rgba(60,38,16,.35)';ctx.fillRect(x,y+1.5,L,.6);ctx.fillRect(x,y+SW-2.1,L,.6);
    ctx.fillStyle='#d9a86e';ctx.fillRect(x,y,1.5,SW);ctx.fillRect(x+L-1.5,y,1.5,SW);
  }
  function drawTable(fenceY){
    var g=ctx.createLinearGradient(0,0,W*.3,WH);
    g.addColorStop(0,'#40444c');g.addColorStop(.5,'#2f3238');g.addColorStop(1,'#3a3e45');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,WH+2);
    ctx.fillStyle='rgba(255,255,255,.035)';
    for(var yy=2;yy<WH;yy+=3)ctx.fillRect(0,yy,W,.7);
    // arra yoriqlari (kesish plitasi)
    var px=BX-64,pw2=SCX+64+44;
    ctx.fillStyle='#656b74';ctx.fillRect(px,KY-12,pw2,24);
    ctx.fillStyle='rgba(255,255,255,.22)';ctx.fillRect(px,KY-12,pw2,1);
    ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(px,KY+12,pw2,1.5);
    ctx.fillStyle='#050608';ctx.fillRect(px+6,KY-2.8,pw2-12,5.6);
    // tayanch chizigʻi (fence)
    var fg=ctx.createLinearGradient(0,fenceY,0,fenceY+7);
    fg.addColorStop(0,'#9aa1ab');fg.addColorStop(.4,'#6a707a');fg.addColorStop(1,'#3d4148');
    ctx.fillStyle=fg;ctx.fillRect(0,fenceY,W,7);
    ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(0,fenceY+7,W,2.5);
    ctx.fillStyle='#e0a030';ctx.fillRect(0,fenceY+1,W,.8);
  }
  // yuqoridan koʻrinish: arra faqat ingichka chiziq (chetidan) boʻlib koʻrinadi
  function topBlade(x,y,chord,dirS){
    var x1=x-chord/2,i;
    var fade=ctx.createLinearGradient(x1,0,x1+chord,0);
    fade.addColorStop(0,'rgba(215,220,226,0)');fade.addColorStop(.18,'rgba(215,220,226,1)');
    fade.addColorStop(.82,'rgba(215,220,226,1)');fade.addColorStop(1,'rgba(215,220,226,0)');
    var sh=ctx.createLinearGradient(x1,0,x1+chord,0);
    sh.addColorStop(0,'rgba(0,0,0,0)');sh.addColorStop(.2,'rgba(0,0,0,.4)');sh.addColorStop(.8,'rgba(0,0,0,.4)');sh.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=sh;ctx.fillRect(x1+2,y+1.8,chord,2.4);
    ctx.fillStyle=fade;ctx.fillRect(x1,y-1.3,chord,2.6);
    var ph=angle*14*dirS;
    for(i=0;i<chord/5+2;i++){
      var pos=(i*5+ph)%chord;if(pos<0)pos+=chord;
      var al=Math.sin(Math.PI*pos/chord);
      ctx.fillStyle='rgba(255,255,255,'+(al*.95)+')';ctx.fillRect(x1+pos-.7,y-2.5,1.4,5);
    }
  }
  function label(txt,x,yFrom,yTo){
    ctx.strokeStyle='rgba(224,160,48,.8)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x,yFrom);ctx.lineTo(x,yTo);ctx.stroke();
    ctx.beginPath();ctx.arc(x,yFrom,1.6,0,6.283);ctx.fillStyle='#e0a030';ctx.fill();
    ctx.font='bold 7.5px Arial';ctx.textAlign='center';ctx.fillStyle='#e8c27a';ctx.fillText(txt,x,yTo+9);
  }
  function slit(xa,xb,ly,deep){
    if(xb<=xa)return;
    if(!deep){ctx.fillStyle='rgba(50,52,58,.6)';ctx.fillRect(xa,ly-.6,xb-xa,1.2);return}
    var kg=ctx.createLinearGradient(0,ly-2,0,ly+2);kg.addColorStop(0,'#8a6a42');kg.addColorStop(.3,'#1a1410');kg.addColorStop(.5,'#050506');kg.addColorStop(.7,'#1a1410');kg.addColorStop(1,'#8a6a42');
    ctx.fillStyle=kg;ctx.fillRect(xa,ly-1.8,xb-xa,3.6);
  }
  function dust(x,y,n){for(var i=0;i<n;i++){var pl=Math.random();
    parts.push({x:x,y:y+rnd(-1.5,1.5),vx:-rnd(.8,4),vy:rnd(-2.6,2.6),life:1,dec:rnd(.02,.05),s:rnd(.9,2.3),
      c:pl<.5?'225,205,175':pl<.8?'196,170,135':'245,242,236'})}}

  self.frame=function(ts,dt){
    if(!tex)return;
    if(!t0){t0=ts;last=ts}
    var t=ts-t0;if(t>TOTAL){t0=ts-INTRO;t=INTRO;parts.length=0}
    spinStep=.34*dt/16;angle+=spinStep;

    var k=t<INTRO?-1:Math.min(Math.floor((t-INTRO)/STG),NS);
    var lt=k>=0?t-(INTRO+k*STG):0;
    var r=Math.max(k,0),sp=0,pq=0,feeding=false,xB=xS;
    if(k<0){xB=xS+(1-ease(t/INTRO))*(W+60)}
    else if(k<NS){
      if(lt<FEED){var q=lt/FEED;pq=q*.7+ease(q)*.3;xB=xS+pq*(xE-xS);feeding=true}
      else{pq=1;sp=ease((lt-FEED)/SEP);xB=(k<NS-1)?xE+(xS-xE)*sp:xE}
    }
    pct.textContent=Math.round((k<0?0:k<NS?(k+pq)/NS:1)*100)+'%';

    ctx.setTransform(res*s,0,0,res*s,0,0);ctx.clearRect(0,0,W,WH+2);

    var rr=k<NS?r:0,nn=NP-rr;
    drawTable(KY+SW-nn*SW-7+(k<NS?SW*sp:0));

    if(k<NS){
      var hi=NP-1-r,o;
      for(o=0;o<NP;o++){
        var x=o>hi?xE:(o===hi?(lt<FEED||k<0?xB:xE):xB);
        drawStrip(o,stripY(o,r,sp),x);
      }
      if(k>=0&&sp===0){
        slit(xB,Math.min(bS,xB+L),KY,false);       // skorlovchi arra izi (sayoz)
        slit(xB,Math.min(BX,xB+L),KY,true);        // asosiy arra izi (chuqur)
      }
    }else{
      var tOut=t-INTRO-NS*STG,e=ease((tOut-900)/900),o2;
      for(o2=0;o2<NP;o2++)drawStrip(o2,stripY(o2,NS,0),xE-e*(W+60));
      var xn=xS+(1-e)*(W+60);
      for(o2=0;o2<NP;o2++)drawStrip(o2,stripY(o2,0,0),xn);
    }

    // arralar: har bir kesim chizigʻida kichik skorlovchi (oldin) va katta asosiy arra
    topBlade(bS,KY,52,-1);   // kichik skorlovchi arra (teskari aylanadi)
    topBlade(BX,KY,100,1);   // katta asosiy arra

    // yozuvlar
    label('KATTA ARRA',BX,KY+14,KY+40);
    label('KICHIK ARRA',bS+4,KY+14,KY+40);
    // nom taxtachasi
    // stanok ustidagi nom taxtachasi: POWERFUL GROUP, ostida — POWERFUL PRO
    ctx.fillStyle='rgba(10,11,14,.85)';ctx.fillRect(W-150,WH-40,138,32);
    ctx.fillStyle='#e0a030';ctx.fillRect(W-150,WH-40,3,32);
    ctx.textAlign='left';ctx.font='900 10px Arial';ctx.fillStyle='#f1f1f1';ctx.fillText('POWERFUL',W-142,WH-26);
    var pw3=ctx.measureText('POWERFUL ').width;
    ctx.fillStyle='#e0a030';ctx.fillText('GROUP',W-142+pw3,WH-26);
    ctx.font='900 8px Arial';ctx.fillStyle='#c9ced6';ctx.fillText('POWERFUL',W-142,WH-14);
    var pw4=ctx.measureText('POWERFUL ').width;
    ctx.fillStyle='#e0a030';ctx.fillText('PRO',W-142+pw4,WH-14);

    // qirindi
    if(feeding&&xB<BX&&xB+L>BX){dust(BX-4,KY,3)}
    for(var q2=parts.length-1;q2>=0;q2--){
      var p=parts[q2];p.x+=p.vx;p.y+=p.vy;p.vx*=.96;p.vy*=.96;p.life-=p.dec;
      if(p.life<=0){parts.splice(q2,1);continue}
      ctx.fillStyle='rgba('+p.c+','+(p.life*.9)+')';ctx.fillRect(p.x,p.y,p.s,p.s*.8);
    }
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
