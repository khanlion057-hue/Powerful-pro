// POWERFUL GROUP — ZARRALI YUKLANISH EKRANI (v25.3). Logotip oltin va oq zarralardan yig'iladi: foiz oshgan sari zarralar
// ekran chetidan spiral bo'ylab uchib kelib logotip shaklini oladi; 100% da yaltiroq nur, «Tayyor!», so'ng ilova ochiladi.
// Canvas 2D, tashqi kutubxonasiz. Ikki xil ishlatish:
//
//   1) JS API:
//        const ld = FWParticleLoader.mount(document.body, { src: 'assets/logo.png', onDone: () => openApp() });
//        ld.setProgress(35);      // 0..100 — haqiqiy yuklanish (berilmasa: 7 soniyada 0→100, takrorlanadi)
//        ld.destroy();            // animatsiya va barcha listenerlar tozalanadi
//
//   2) Web Component (React / Vue / Next ham ishlatadi):
//        <fw-particle-loader src="assets/logo.png" progress="35"></fw-particle-loader>
//        el.addEventListener('done', ...)   // 100% dan keyin (2,8 s ushlab, so'nib bo'lgach)
//        progress atributi yo'q bo'lsa — avtomatik rejim. Elementni olib tashlash — destroy.
//
// Ranglar — faqat logotip ranglari: oltin #f1b24a / #c9780f, oq #ffffff, qora fon.
(function (root) {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var DPR_MAX = 2.2, AUTO_MS = 7000, HOLD_MS = 2800, FADE_MS = 520, SHINE_MS = 1150;
  var GOLD = [241, 178, 74], WARM = [255, 236, 196];
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function reducedMotion() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }

  // Ekran maydoniga qarab zarralar chegarasi (o'rta telefonda ham 60 FPS)
  function particleBudget(w, h) {
    var a = w * h;
    if (a < 420000) return 2200;     // telefon
    if (a < 1100000) return 3400;    // planshet / kichik noutbuk
    return 5000;                     // kompyuter
  }

  function Loader(container, opts) {
    opts = opts || {};
    var self = this;
    this.opts = opts;
    this.reduced = opts.reducedMotion != null ? !!opts.reducedMotion : reducedMotion();
    this.target = opts.progress == null ? null : clamp(+opts.progress || 0, 0, 100);
    this.q = 0;                       // ko'rsatilayotgan progress (0..1), faqat oshadi
    this.auto = this.target == null;
    this.autoStart = 0;
    this.doneAt = 0; this.finished = false; this.destroyed = false;
    this.parts = null; this.dust = [];
    this.raf = 0; this.last = 0;

    var cv = this.cv = document.createElement('canvas');
    cv.className = 'fw-particle-loader';
    cv.setAttribute('role', 'progressbar'); cv.setAttribute('aria-valuemin', '0'); cv.setAttribute('aria-valuemax', '100');
    cv.setAttribute('aria-label', 'Yuklanmoqda');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block;z-index:2147483000;background:#08080a;transition:opacity ' + FADE_MS + 'ms ease';
    (container || document.body).appendChild(cv);
    this.ctx = cv.getContext('2d');

    this._onResize = function () { self.layout(); };
    this._onVis = function () { if (document.hidden) self.stop(); else self.start(); };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    document.addEventListener('visibilitychange', this._onVis);

    this.img = null;
    var img = new Image();
    img.decoding = 'async';
    img.onload = function () { if (self.destroyed) return; self.img = img; self.layout(); };
    img.onerror = function () { if (self.destroyed) return; self.img = null; self.layout(); };   // rasm bo'lmasa — yozuvdan zarralar
    img.src = opts.src || 'assets/logo.png';
    this.layout();
    this.start();
  }

  // Ilova tayyor — darhol 100% (qolgan zarralar joyiga tez o'tiradi), qisqa ushlab, so'nadi
  Loader.prototype.complete = function () {
    if (this.destroyed || this.doneAt) return;
    this.auto = false; this.target = 100; this.q = 1; this.doneAt = this.last || performance.now();
  };
  Loader.prototype.setProgress = function (p) {
    if (p == null || p === '') { this.auto = true; this.target = null; return; }
    this.auto = false; this.target = clamp(+p || 0, 0, 100);
  };

  // O'lchamlar, fon, logotip joyi va zarralar — har resize'da qayta
  Loader.prototype.layout = function () {
    if (this.destroyed) return;
    var cv = this.cv, w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    var dpr = Math.min(DPR_MAX, window.devicePixelRatio || 1);
    this.W = w; this.H = h; this.dpr = dpr;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    // ilova sahifaga CSS zoom qo'llaydi (masalan 90%) — canvas baribir butun ekranni qoplasin
    var z = 1; try { z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1; } catch (e) {}
    cv.style.width = (w / z) + 'px'; cv.style.height = (h / z) + 'px';
    var aspect = this.img ? this.img.naturalWidth / this.img.naturalHeight : 3.2;
    var lw;
    if (w >= h) lw = Math.min(w * 0.42, h * 0.5 * aspect);   // landshaft: kenglik 42% yoki balandlik 50% — kichigi
    else lw = Math.min(w * 0.8, h * 0.42 * aspect);           // portret: kenglik 80% (juda tor ekranda balandlik ham cheklanadi)
    var lh = lw / aspect;
    this.logo = { w: lw, h: lh, x: (w - lw) / 2, y: Math.max(h * 0.08, h * 0.44 - lh / 2) };
    this.unit = Math.min(w, h);
    this.bg = this.makeBg(w, h, dpr);
    this.logoGlow = this.makeLogoLayer(true);
    this.logoPlain = this.makeLogoLayer(false);
    if (!this.reduced) this.buildParticles();
    this.buildDust();
  };

  Loader.prototype.makeBg = function (w, h, dpr) {
    var c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    var x = c.getContext('2d'); x.scale(dpr, dpr);
    var g = x.createRadialGradient(w / 2, h * 0.44, 0, w / 2, h * 0.44, Math.hypot(w, h) * 0.62);
    g.addColorStop(0, '#2b2418'); g.addColorStop(0.55, '#14120e'); g.addColorStop(1, '#08080a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    return c;
  };

  // Logotip qatlami (yorug'lik bilan — oldindan bir marta chiziladi, har kadrda shadowBlur qimmat)
  Loader.prototype.makeLogoLayer = function (glow) {
    var L = this.logo, dpr = this.dpr, pad = glow ? Math.ceil(L.h * 0.35) : 0;
    var c = document.createElement('canvas');
    c.width = Math.ceil((L.w + pad * 2) * dpr); c.height = Math.ceil((L.h + pad * 2) * dpr);
    var x = c.getContext('2d'); x.scale(dpr, dpr);
    if (glow) { x.shadowColor = 'rgba(241,178,74,.75)'; x.shadowBlur = Math.max(10, L.h * 0.18); }
    this.drawLogoInto(x, pad, pad, L.w, L.h);
    c._pad = pad;
    return c;
  };
  Loader.prototype.drawLogoInto = function (x, px, py, w, h) {
    if (this.img) { x.drawImage(this.img, px, py, w, h); return; }
    // Rasm ochilmasa — nom yozuvi (oltin «PG» + oq «POWERFUL GROUP»)
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#f1b24a'; x.font = '900 ' + Math.round(h * 0.55) + 'px Arial,sans-serif'; x.fillText('PG', px + w / 2, py + h * 0.33);
    x.fillStyle = '#ffffff'; x.font = '800 ' + Math.round(h * 0.2) + 'px Arial,sans-serif'; x.fillText('POWERFUL GROUP', px + w / 2, py + h * 0.8);
  };

  // Logotip piksellaridan zarralar: alpha > 110, har s-pikselda bittasi; rangi — shu piksel
  Loader.prototype.buildParticles = function () {
    var L = this.logo, ow = Math.max(1, Math.round(L.w)), oh = Math.max(1, Math.round(L.h));
    var c = document.createElement('canvas'); c.width = ow; c.height = oh;
    var x = c.getContext('2d', { willReadFrequently: true });
    this.drawLogoInto(x, 0, 0, ow, oh);
    var px;
    try { px = x.getImageData(0, 0, ow, oh).data; } catch (e) { this.parts = []; return; }
    var budget = particleBudget(this.W, this.H), opaque = 0, i;
    for (i = 3; i < px.length; i += 4) if (px[i] > 110) opaque++;
    var step = 3; while (opaque / (step * step) > budget && step < 9) step++;
    var R = Math.max(this.W, this.H), parts = [];
    for (var yy = 0; yy < oh; yy += step) {
      for (var xx = 0; xx < ow; xx += step) {
        var o = (yy * ow + xx) * 4;
        if (px[o + 3] <= 110) continue;
        var ang = Math.random() * Math.PI * 2, rad = (0.5 + Math.random() * 0.65) * R;
        parts.push({
          tx: L.x + xx, ty: L.y + yy,
          sx: Math.cos(ang) * rad, sy: Math.sin(ang) * rad,
          // kechikish 0..0.8: tasodifiy + chapdan o'ngga biroz og'ish
          d: clamp(Math.random() * 0.62 + (xx / ow) * 0.18, 0, 0.8),
          r: px[o], g: px[o + 1], b: px[o + 2], c: 'rgb(' + px[o] + ',' + px[o + 1] + ',' + px[o + 2] + ')',
          s: Math.max(1.1, step * 0.62),
          j: Math.random() * Math.PI * 2,
        });
      }
    }
    this.parts = parts;
  };

  Loader.prototype.buildDust = function () {
    var d = [];
    for (var i = 0; i < 30; i++) d.push({ x: Math.random() * this.W, y: Math.random() * this.H, vx: (Math.random() - 0.5) * 6, vy: -(2 + Math.random() * 6), r: 0.6 + Math.random() * 1.6, p: Math.random() * 6.283 });
    this.dust = d;
  };

  Loader.prototype.start = function () {
    if (this.destroyed || this.raf || document.hidden) return;
    var self = this; this.last = 0;
    var tick = function (ts) { self.raf = 0; if (self.destroyed) return; self.frame(ts); if (!self.destroyed && !document.hidden && !self.closed) self.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  };
  Loader.prototype.stop = function () { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; };

  Loader.prototype.frame = function (ts) {
    var dt = this.last ? Math.min(0.05, (ts - this.last) / 1000) : 0.016; this.last = ts;
    // Progress: avtomatik — 7 soniyada 0→1; haqiqiy — nishonga silliq yaqinlashadi, hech qachon orqaga qaytmaydi
    if (!this.doneAt) {
      if (this.auto) { if (!this.autoStart) this.autoStart = ts; this.q = Math.max(this.q, clamp((ts - this.autoStart) / AUTO_MS, 0, 1)); }
      else { var tq = this.target / 100; if (tq > this.q) this.q = Math.min(tq, this.q + (tq - this.q) * Math.min(1, dt * 5) + dt * 0.02); }   // kichikroq qiymat — e'tiborsiz (orqaga qaytmaydi)
      if (this.q >= 1) { this.q = 1; this.doneAt = ts; }
    }
    this.draw(ts, dt);
    var pv = Math.round(this.q * 100); if (pv !== this._pv) { this._pv = pv; this.cv.setAttribute('aria-valuenow', String(pv)); }
    if (this.doneAt && !this.closed && ts - this.doneAt >= (this.opts.holdMs != null ? +this.opts.holdMs : HOLD_MS)) this.finish();
  };

  Loader.prototype.draw = function (ts, dt) {
    var x = this.ctx, W = this.W, H = this.H, dpr = this.dpr, q = this.q, L = this.logo, t = ts / 1000;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(this.bg, 0, 0);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Suzuvchi oltin changlar
    for (var i = 0; i < this.dust.length; i++) {
      var p = this.dust[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; } if (p.x < -4) p.x = W + 4; else if (p.x > W + 4) p.x = -4;
      x.globalAlpha = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t * 1.3 + p.p));
      x.fillStyle = '#f1b24a'; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.283); x.fill();
    }
    x.globalAlpha = 1;

    var logoA = clamp((q - 0.82) / 0.18, 0, 1);   // 82% dan logotip rasmi asta paydo bo'ladi
    if (this.reduced) logoA = clamp(q * 1.25, 0, 1);

    // Zarralar
    if (!this.reduced && this.parts) {
      var done = !!this.doneAt, shake = done ? Math.max(0, 1 - (ts - this.doneAt) / 900) : 0;
      var fade = 1 - logoA * 0.82;
      for (var k = 0; k < this.parts.length; k++) {
        var z = this.parts[k];
        var pp = clamp((q - z.d * 0.86) / 0.14, 0, 1), e = easeInOut(pp), m = 1 - e;
        var px, py, size, a;
        if (m > 0.0005) {
          var ang = m * 2.4, cs = Math.cos(ang), sn = Math.sin(ang), dx = z.sx * m, dy = z.sy * m;
          px = z.tx + dx * cs - dy * sn; py = z.ty + dx * sn + dy * cs;
          size = z.s * (1 + 0.9 * m);
          // uchayotganda — issiq oltin-oq tus, joyiga o'tirgach — o'z rangi
          var wr = Math.min(1, m * 1.4), r = z.r + (WARM[0] - z.r) * wr, g = z.g + (WARM[1] - z.g) * wr, b = z.b + (WARM[2] - z.b) * wr;
          x.fillStyle = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
          a = pp > 0 ? 0.45 + 0.55 * Math.min(1, pp * 3) : 0.22;
        } else {
          px = z.tx; py = z.ty; size = z.s;
          if (shake > 0) { px += Math.sin(t * 40 + z.j) * 0.9 * shake; py += Math.cos(t * 37 + z.j) * 0.9 * shake; }
          x.fillStyle = z.c;
          a = 1;
        }
        x.globalAlpha = a * fade;
        x.fillRect(px - size / 2, py - size / 2, size, size);
      }
      x.globalAlpha = 1;
    }

    // Logotip rasmi (oltin yorug'lik bilan)
    if (logoA > 0) {
      var G = this.logoGlow, pad = G._pad;
      x.globalAlpha = logoA;
      x.drawImage(G, L.x - pad, L.y - pad, G.width / dpr, G.height / dpr);
      x.globalAlpha = 1;
    }

    // 100%: logotip ustidan diagonal oq yaltiroq nur (faqat logotip shakli ustida — source-atop)
    if (this.doneAt && !this.reduced) {
      var st = (ts - this.doneAt) / SHINE_MS;
      if (st < 1) {
        var S = this.shineCv || (this.shineCv = document.createElement('canvas'));
        var P = this.logoPlain; S.width = P.width; S.height = P.height;
        var sx = S.getContext('2d'); sx.clearRect(0, 0, S.width, S.height); sx.drawImage(P, 0, 0);
        sx.globalCompositeOperation = 'source-atop';
        var span = S.width + S.height, cx = -S.height + span * easeInOut(st);
        var gr = sx.createLinearGradient(cx, 0, cx + S.height * 0.9, S.height);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        sx.fillStyle = gr; sx.fillRect(0, 0, S.width, S.height); sx.globalCompositeOperation = 'source-over';
        x.drawImage(S, L.x, L.y, L.w, L.h);
      }
    }

    this.drawText(x, W, H, q, t);
  };

  Loader.prototype.drawText = function (x, W, H, q, t) {
    var L = this.logo, u = this.unit, ready = !!this.doneAt;
    var top = Math.min(H - u * 0.3, L.y + L.h + Math.max(28, u * 0.07));
    var big = Math.round(clamp(u * 0.085, 30, 64));
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.fillStyle = '#ffffff'; x.font = '800 ' + big + 'px -apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    x.fillText(Math.round(q * 100) + '%', W / 2, top + big);
    var sm = Math.round(clamp(u * 0.032, 13, 18));
    x.fillStyle = ready ? '#f1b24a' : 'rgba(255,255,255,.78)'; x.font = (ready ? '700 ' : '500 ') + sm + 'px -apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    x.fillText(ready ? 'Tayyor!' : 'Yuklanmoqda...', W / 2, top + big + sm * 1.9);
    // Ingichka progress chizig'i (yorug'lik bilan)
    var bw = Math.min(W * 0.62, 440), bx = (W - bw) / 2, by = top + big + sm * 3.1, bh = Math.max(3, Math.round(u * 0.006));
    x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(bx, by, bw, bh);
    var fw = bw * q;
    if (fw > 0) {
      var g = x.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#c9780f'); g.addColorStop(0.6, '#f1b24a'); g.addColorStop(1, '#fff1c8');
      x.save(); x.shadowColor = 'rgba(241,178,74,.85)'; x.shadowBlur = 10; x.fillStyle = g; x.fillRect(bx, by, fw, bh); x.restore();
    }
    // Eng pastda — keng harf oralig'i bilan
    var lab = String(this.opts.label || 'BOSHQARUV PANELI'), ls = Math.round(clamp(u * 0.024, 11, 14));
    x.fillStyle = '#d7b878'; x.font = '600 ' + ls + 'px -apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    var gap = ls * 0.45, total = 0, i, ws = [];
    for (i = 0; i < lab.length; i++) { ws[i] = x.measureText(lab[i]).width; total += ws[i] + (i ? gap : 0); }
    var cx = W / 2 - total / 2, ly = Math.min(H - Math.max(22, H * 0.05), by + bh + ls * 3.2);
    x.textAlign = 'left';
    for (i = 0; i < lab.length; i++) { x.fillText(lab[i], cx, ly); cx += ws[i] + gap; }
    x.textAlign = 'center';
  };

  // 2,8 s ushlab turgach — so'nadi, keyin onDone. Avtomatik rejimda onDone bo'lmasa — qaytadan (namoyish).
  Loader.prototype.finish = function () {
    var self = this;
    if (this.auto && !this.opts.onDone && !this.opts.stopOnDone) { this.q = 0; this.doneAt = 0; this.autoStart = 0; return; }
    this.closed = true;
    this.cv.style.opacity = '0';
    setTimeout(function () {
      if (self.destroyed) return;
      self.finished = true;
      try { if (typeof self.opts.onDone === 'function') self.opts.onDone(); } catch (e) { setTimeout(function () { throw e; }); }
      if (self.opts.autoDestroy !== false) self.destroy();
    }, FADE_MS);
  };

  Loader.prototype.destroy = function () {
    if (this.destroyed) return;
    this.destroyed = true; this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    document.removeEventListener('visibilitychange', this._onVis);
    if (this.cv && this.cv.parentNode) this.cv.parentNode.removeChild(this.cv);
    this.parts = null; this.dust = []; this.bg = this.logoGlow = this.logoPlain = this.shineCv = null;
  };

  var API = {
    mount: function (container, opts) { return new Loader(container, opts); },
    particleBudget: particleBudget,
    _easeInOut: easeInOut,
  };
  root.FWParticleLoader = API;

  // Web Component: <fw-particle-loader src progress label> — 'done' hodisasi
  if (window.customElements && !window.customElements.get('fw-particle-loader')) {
    var Base = window.HTMLElement;
    var El = function () { return Reflect.construct(Base, [], El); };
    El.prototype = Object.create(Base.prototype); El.prototype.constructor = El;
    Object.setPrototypeOf(El, Base);
    Object.defineProperty(El, 'observedAttributes', { get: function () { return ['progress']; } });
    El.prototype.connectedCallback = function () {
      var el = this;
      if (this._ld) return;
      var p = this.getAttribute('progress');
      this._ld = API.mount(this, { src: this.getAttribute('src') || undefined, label: this.getAttribute('label') || undefined,
        progress: p == null ? null : +p, stopOnDone: true,
        onDone: function () { el._ld = null; el.dispatchEvent(new CustomEvent('done', { bubbles: true })); } });
    };
    El.prototype.disconnectedCallback = function () { if (this._ld) { this._ld.destroy(); this._ld = null; } };
    El.prototype.attributeChangedCallback = function (n, o, v) { if (n === 'progress' && this._ld) this._ld.setProgress(v == null ? null : +v); };
    window.customElements.define('fw-particle-loader', El);
  }
})(typeof window !== 'undefined' ? window : this);
