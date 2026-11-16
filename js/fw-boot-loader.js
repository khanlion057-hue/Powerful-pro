// v25.3 — ILOVA YUKLANISHIDA ZARRALI EKRAN (js/fw-particle-loader.js ulagichi). Admin (#bp-loading) va sotuvchi/diller
// (#fw-splash, html.fw-booting) yuklanish oynalari ko'ringanda — logotip oltin-oq zarralardan yig'iladi.
// Foiz — haqiqiy kutish vaqtiga qarab (orqaga qaytmaydi, 92% da kutadi); ilova tayyor bo'lishi bilan darhol 100%, «Tayyor!»,
// 0,5 s va so'nadi (ilovani ushlab turmaydi — u ostida allaqachon ochilgan).
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.FWParticleLoader) return;
  var L = null, t0 = 0, timer = 0;
  function shown(el) { return !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0; }
  function box() { var a = document.getElementById('bp-loading'); if (shown(a)) return a; var b = document.getElementById('fw-splash'); return shown(b) ? b : null; }
  function label(b) { var s = b && b.querySelector('.fw-load-s'); return s ? String(s.textContent || '').trim().toUpperCase() : 'BOSHQARUV PANELI'; }
  function check() {
    var b = box();
    if (b && !L) {
      t0 = Date.now();
      L = window.FWParticleLoader.mount(document.body, { src: 'assets/logo.png', progress: 2, label: label(b), holdMs: 500, onDone: function () { L = null; setTimeout(check, 0); } });   // yopilayotganda oyna qayta ochilgan bo'lsa — yangidan
      clearInterval(timer);
      timer = setInterval(function () {
        if (!L) { clearInterval(timer); return; }
        var p = 92 * (1 - Math.exp(-(Date.now() - t0) / 2400));
        if (!L.doneAt) L.setProgress(Math.max(2, Math.round(p)));
      }, 150);
    } else if (!b && L && !L.doneAt) {
      L.complete(); clearInterval(timer);
    }
  }
  window.fwBootLoaderCheck = check;
  window.fwBootLoaderState = function () { return L ? { doneAt: !!L.doneAt, closed: !!L.closed, destroyed: !!L.destroyed } : null; };
  var mo = new MutationObserver(check);
  function start() {
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    ['bp-loading', 'fw-splash'].forEach(function (id) { var el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] }); });
    check();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
