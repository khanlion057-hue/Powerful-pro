// POWERFUL GROUP — OMMAVIY VITRINA (dokon.html). Ma'lumot: /.netlify/functions/shop-public (narx va qoldiq — serverda).
// Xaridor: qidiradi, filtrlaydi (kategoriya, brend, arra tanlash yordamchisi), sevimlilarga qo'shadi, savatga soladi,
// buyurtma beradi va holatini kuzatadi. Savat, sevimlilar, buyurtmalar — shu qurilmada (localStorage, xato bo'lsa — xotirada).
(function () {
  'use strict';
  var API = '/.netlify/functions/shop-public';
  var SLUG = (new URLSearchParams(location.search).get('s') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  var D = null, PR = [], BYID = {};
  var ST = { cat: '', br: '', sort: 'def', q: '', fav: false, mat: '', dia: '', tooth: '' };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ── qurilma xotirasi (xato bo'lsa — faqat xotirada) ──
  var MEM = {};
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return MEM[k] != null ? MEM[k] : d; } }
  function lsSet(k, v) { MEM[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var key = function (n) { return 'vt_' + n + '_' + (SLUG || 'main'); };
  var CART = lsGet(key('cart'), {}), FAV = lsGet(key('fav'), []), ORD = lsGet(key('orders'), []), RECENT = lsGet(key('recent'), []);

  // ── pul ──
  function money(n) {
    if (!D) return '';
    if (D.shop.cur === 'USD') return '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' soʻm';
  }

  // ── arra tig'i belgilari (nomdan): diametr, tish soni, material ──
  function sawInfo(p) {
    var s = (p.name + ' ' + (p.specs || []).join(' ') + ' ' + p.cat).toLowerCase();
    var d = /ø\s?(\d{2,3})/.exec(s) || /(\d{3})\s?(?:mm|мм)\b/.exec(s) || /\b(\d{3})\s?[x×*]/.exec(s);
    var t = /\b(\d{2,3})\s?(?:t|т|z)\b/.exec(s);
    var mat = /alyumin|alumin|алюмин/.test(s) ? 'Alyuminiy' : /laminat|ldsp|dsp|лдсп|дсп|mdf|мдф/.test(s) ? 'Laminat / DSP' : /yog.?och|wood|дерев|древ/.test(s) ? 'Yogʻoch' : '';
    return { dia: d ? +d[1] : null, tooth: t ? +t[1] : null, mat: mat };
  }
  // Rasmsiz mahsulot — arra tig'i rasmi (Ø va tish soni bilan)
  function sawSvg(p) {
    var si = sawInfo(p), n = Math.max(16, Math.min(60, si.tooth || 36)), pts = [], i;
    for (i = 0; i < n; i++) { var a = i / n * 6.2832, b = (i + .55) / n * 6.2832; pts.push((50 + 44 * Math.cos(a)).toFixed(1) + ',' + (50 + 44 * Math.sin(a)).toFixed(1), (50 + 48 * Math.cos(b)).toFixed(1) + ',' + (50 + 48 * Math.sin(b)).toFixed(1)); }
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="' + pts.join(' ') + '" fill="#c7cbd1" stroke="#8d939b" stroke-width=".6"/>'
      + '<circle cx="50" cy="50" r="40" fill="#e3e6ea"/><circle cx="50" cy="50" r="28" fill="none" stroke="#b8bdc4" stroke-width=".8"/>'
      + '<circle cx="50" cy="50" r="9" fill="#2a2c31"/><path d="M50 14a36 36 0 0 1 30 16" fill="none" stroke="#e8961e" stroke-width="3" stroke-linecap="round"/>'
      + '<text x="50" y="72" text-anchor="middle" font-family="Arial" font-size="9" font-weight="800" fill="#3b3e45">' + (si.dia ? 'Ø' + si.dia : 'POWERFUL') + (si.tooth ? ' · ' + si.tooth + 'T' : '') + '</text></svg>';
  }
  function pic(p, cls) { return p.img && p.img.length ? '<img src="' + esc(p.img[0]) + '" alt="' + esc(p.name) + '" loading="lazy"' + (cls ? ' class="' + cls + '"' : '') + '>' : sawSvg(p); }

  // ── yuklash ──
  function skeleton() { var h = ''; for (var i = 0; i < 8; i++) h += '<div class="vt-sk"></div>'; $('vt-grid').innerHTML = h; }
  function load() {
    skeleton();
    fetch(API + (SLUG ? '?s=' + encodeURIComponent(SLUG) : ''), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) return closed(x.j && x.j.error);
        D = x.j; PR = D.products || []; BYID = {}; PR.forEach(function (p) { BYID[String(p.id)] = p; });
        // savatni hozirgi qoldiqqa moslash
        Object.keys(CART).forEach(function (id) { var p = BYID[id]; if (!p) delete CART[id]; else if (CART[id] > p.stock) CART[id] = p.stock; });
        lsSet(key('cart'), CART);
        document.title = D.shop.name + ' — onlayn doʻkon';
        $('vt-name').textContent = D.shop.name;
        hero(); perks(); filters(); finder(); footer(); render(); cartUi(); recent();
        var m = /#p=([\w-]+)/.exec(location.hash); if (m && BYID[m[1]]) openProduct(m[1]);
      })
      .catch(function () { closed(navigator.onLine === false ? 'Internet yoʻq — ulanishni tekshiring' : 'Doʻkon vaqtincha ochilmadi'); });
  }
  function closed(msg) {
    $('vt-grid').innerHTML = '<div class="vt-empty"><b>' + esc(msg || 'Doʻkon hozircha yopiq') + '</b>Birozdan soʻng qayta urinib koʻring.<br><br><button class="vt-cta" onclick="location.reload()">Qayta yuklash</button></div>';
    // v25.6.9: xato holatida qarama-qarshi «Tez orada ochilamiz» bannerini ko'rsatmaymiz
    $('vt-hero').innerHTML = ''; $('vt-hero').style.display = 'none';
  }

  // ── slayder ──
  var SLIDE = 0, SLT = null;
  var SAW_BIG = '<svg class="vt-saw" viewBox="0 0 100 100" aria-hidden="true">' + (function () { var p = [], i; for (i = 0; i < 40; i++) { var a = i / 40 * 6.2832, b = (i + .55) / 40 * 6.2832; p.push((50 + 44 * Math.cos(a)).toFixed(1) + ',' + (50 + 44 * Math.sin(a)).toFixed(1), (50 + 49 * Math.cos(b)).toFixed(1) + ',' + (50 + 49 * Math.sin(b)).toFixed(1)); } return '<polygon points="' + p.join(' ') + '" fill="#d5d8dd"/>'; })() + '<circle cx="50" cy="50" r="40" fill="#eceef1"/><circle cx="50" cy="50" r="30" fill="none" stroke="#c3c7cd"/><circle cx="50" cy="50" r="9" fill="#15161a"/><text x="50" y="74" text-anchor="middle" font-family="Arial" font-size="7.5" font-weight="900" fill="#c9780f">POWERFUL PRO</text></svg>';
  function slideHtml(i, h, p, btn) { return '<div class="vt-slide vt-s' + (i % 3) + '">' + SAW_BIG + '<div style="position:relative;z-index:1"><h2>' + esc(h) + '</h2><p>' + esc(p) + '</p>' + (btn ? '<button class="vt-cta" data-go="' + esc(btn[1]) + '">' + esc(btn[0]) + '</button>' : '') + '</div></div>'; }
  function hero() {
    var s = [], cats = catList();
    (D.banners || []).forEach(function (b) { s.push('<div class="vt-slide img"><img src="' + esc(b.url) + '" alt="' + esc(b.title || D.shop.name) + '"></div>'); });
    s.push(slideHtml(0, 'Professional arra tigʻlari', 'Rover va formatli stanoklar uchun — original, kafolatli', ['Katalogni koʻrish', 'grid']));
    if (D.shop.delivery) s.push(slideHtml(1, D.shop.freeMin > 0 ? money(D.shop.freeMin) + ' dan — bepul yetkazish' : 'Yetkazib berish xizmati', 'Buyurtmani onlayn bering — doʻkon tasdiqlab, yetkazib beradi', ['Savatni ochish', 'cart']));
    if (cats.length > 1) s.push(slideHtml(2, cats.length + ' ta kategoriya', cats.slice(0, 4).join(' · '), ['Tigʻ tanlash', 'finder']));
    var dots = s.length > 1 ? '<div class="vt-dots">' + s.map(function (_, i) { return '<button aria-label="' + (i + 1) + '-slayd"></button>'; }).join('') + '</div>' : '';
    $('vt-hero').innerHTML = s.join('') + dots;
    show(0);
    clearInterval(SLT); if (s.length > 1) SLT = setInterval(function () { show(SLIDE + 1); }, 5500);
  }
  function show(i) {
    var sl = $('vt-hero').querySelectorAll('.vt-slide'), dt = $('vt-hero').querySelectorAll('.vt-dots button');
    if (!sl.length) return; SLIDE = (i + sl.length) % sl.length;
    for (var k = 0; k < sl.length; k++) { sl[k].classList.toggle('on', k === SLIDE); if (dt[k]) dt[k].classList.toggle('on', k === SLIDE); }
  }

  function perks() {
    var sh = D.shop, P = [];
    P.push(['🚚', sh.delivery ? 'Yetkazib berish' : 'Olib ketish', sh.delivery ? (sh.freeMin > 0 ? money(sh.freeMin) + ' dan bepul' + (sh.fee > 0 ? ', aks holda ' + money(sh.fee) : '') : (sh.fee > 0 ? money(sh.fee) : 'Bepul')) : (sh.address || 'Doʻkondan')]);
    P.push(['✅', 'Original mahsulot', PR.length + ' ta mahsulot sotuvda']);
    if (sh.tg || sh.wa || sh.phone) P.push(['💬', 'Tezkor maslahat', sh.tg ? 'Telegram @' + sh.tg : (sh.phone || 'WhatsApp')]);
    $('vt-perks').innerHTML = P.map(function (x) { return '<div class="vt-perk"><i>' + x[0] + '</i><div><b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span></div></div>'; }).join('');
  }

  // ── filtrlar ──
  function catList() { var m = {}; PR.forEach(function (p) { if (p.cat) m[p.cat] = (m[p.cat] || 0) + 1; }); return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }); }
  function filters() {
    var cats = catList();
    $('vt-chips').innerHTML = ['<button class="vt-chip" data-cat="">Hammasi</button>', '<button class="vt-chip" data-fav="1">♥ Sevimlilar</button>']
      .concat(cats.map(function (c) { return '<button class="vt-chip" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; })).join('');
    var brs = {}; PR.forEach(function (p) { if (p.brand) brs[p.brand] = 1; });
    var bl = Object.keys(brs).sort();
    $('vt-brand').innerHTML = '<option value="">Barcha brendlar</option>' + bl.map(function (b) { return '<option>' + esc(b) + '</option>'; }).join('');
    $('vt-brand').hidden = bl.length < 2;
    chips();
  }
  function chips() { var c = $('vt-chips').children; for (var i = 0; i < c.length; i++) c[i].classList.toggle('on', ST.fav ? c[i].dataset.fav === '1' : (c[i].dataset.cat === ST.cat && !c[i].dataset.fav)); }

  // ── arra tanlash yordamchisi ──
  function finder() {
    var sw = PR.map(function (p) { return { p: p, s: sawInfo(p) }; }).filter(function (x) { return x.s.dia; });
    if (sw.length < 3) { $('vt-finder').hidden = true; return; }
    $('vt-finder').hidden = false;
    var uniq = function (f) { var m = {}; sw.forEach(function (x) { var v = f(x.s); if (v) m[v] = 1; }); return Object.keys(m); };
    var mats = uniq(function (s) { return s.mat; }), dias = uniq(function (s) { return s.dia; }).map(Number).sort(function (a, b) { return a - b; });
    var teeth = uniq(function (s) { return s.tooth; }).map(Number).sort(function (a, b) { return a - b; });
    var seg = function (el, list, k, fmt) { $(el).innerHTML = '<button data-k="' + k + '" data-v="">Hammasi</button>' + list.map(function (v) { return '<button data-k="' + k + '" data-v="' + esc(v) + '">' + esc(fmt ? fmt(v) : v) + '</button>'; }).join(''); };
    seg('vt-fmat', mats, 'mat'); seg('vt-fdia', dias, 'dia', function (v) { return 'Ø' + v; }); seg('vt-ftooth', teeth, 'tooth', function (v) { return v + 'T'; });
    finderUi();
  }
  function finderUi() {
    ['vt-fmat', 'vt-fdia', 'vt-ftooth'].forEach(function (id) { var b = $(id).children; for (var i = 0; i < b.length; i++) b[i].classList.toggle('on', String(ST[b[i].dataset.k]) === b[i].dataset.v); });
    var tip = '';
    if (ST.tooth) { var t = +ST.tooth; tip = t >= 80 ? 'Koʻp tish — toza, silliq kesim (laminat, DSP, ishlov berilgan yogʻoch).' : t >= 48 ? 'Universal — koʻndalang va boʻylama kesish uchun.' : 'Kam tish — tez boʻylama kesish (massiv yogʻoch).'; }
    else if (ST.mat === 'Alyuminiy') tip = 'Alyuminiy uchun manfiy burchakli, koʻp tishli (TCG) tigʻ tanlang.';
    $('vt-fhint').textContent = tip;
  }

  // ── ro'yxat ──
  function list() {
    var q = ST.q.toLowerCase().trim(), words = q ? q.split(/\s+/) : [];
    var out = PR.filter(function (p) {
      if (ST.fav && FAV.indexOf(String(p.id)) < 0) return false;
      if (ST.cat && p.cat !== ST.cat) return false;
      if (ST.br && p.brand !== ST.br) return false;
      if (ST.mat || ST.dia || ST.tooth) { var s = sawInfo(p); if (ST.mat && s.mat !== ST.mat) return false; if (ST.dia && s.dia !== +ST.dia) return false; if (ST.tooth && s.tooth !== +ST.tooth) return false; }
      if (words.length) { var hay = (p.name + ' ' + p.sku + ' ' + p.brand + ' ' + p.cat + ' ' + (p.specs || []).join(' ')).toLowerCase().replace(/ø/g, 'ø'); for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false; }
      return true;
    });
    var by = { lo: function (a, b) { return a.price - b.price; }, hi: function (a, b) { return b.price - a.price; }, az: function (a, b) { return a.name.localeCompare(b.name); },
      disc: function (a, b) { return (b.old ? 1 : 0) - (a.old ? 1 : 0); } }[ST.sort];
    if (ST.sort === 'disc') out = out.filter(function (p) { return p.old; });
    return by ? out.slice().sort(by) : out;
  }
  function card(p) {
    var inCart = CART[p.id] || 0, fav = FAV.indexOf(String(p.id)) >= 0;
    var pct = p.old ? Math.round((1 - p.price / p.old) * 100) : 0;
    return '<article class="vt-pc"><button class="vt-pic' + (p.img && p.img.length ? ' has' : '') + (p.img && p.img.length > 1 ? ' multi' : '') + '" data-open="' + esc(p.id) + '" aria-label="' + esc(p.name) + '">' + pic(p)
      + (p.img && p.img.length > 1 ? '<span class="vt-dots">' + p.img.slice(0, 6).map(function (_, i) { return '<i data-dot="' + i + '"' + (i ? '' : ' class="on"') + '></i>'; }).join('') + '</span>' : '')
      + (pct > 0 ? '<span class="vt-tag">−' + pct + '%</span>' : '') + (p.stock <= 3 ? '<span class="vt-low">' + p.stock + ' ta qoldi</span>' : '') + '</button>'
      + '<button class="vt-fav' + (fav ? ' on' : '') + '" data-fav="' + esc(p.id) + '" aria-label="Sevimlilarga" aria-pressed="' + fav + '"><svg viewBox="0 0 24 24"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6C19 16.5 12 21 12 21z"/></svg></button>'
      + '<div class="vt-pb">' + (p.brand ? '<span class="vt-br">' + esc(p.brand) + '</span>' : '') + '<button class="vt-nm" data-open="' + esc(p.id) + '">' + esc(p.name) + '</button>'
      + '<div class="vt-pr"><b>' + money(p.price) + '</b>' + (p.old ? '<s>' + money(p.old) + '</s>' : '') + '</div>'
      + (inCart ? '<div class="vt-stp"><button data-dec="' + esc(p.id) + '" aria-label="Kamaytirish">−</button><span>' + inCart + ' ta</span><button data-inc="' + esc(p.id) + '" aria-label="Koʻpaytirish">+</button></div>'
        : '<button class="vt-add" data-inc="' + esc(p.id) + '">Savatga</button>') + '</div></article>';
  }
  function render() {
    var L = list();
    $('vt-count').textContent = PR.length ? L.length + ' ta mahsulot' + (L.length !== PR.length ? ' (jami ' + PR.length + ')' : '') : '';
    $('vt-grid').innerHTML = L.length ? L.map(card).join('') : '<div class="vt-empty"><b>' + (PR.length ? 'Hech narsa topilmadi' : 'Hozircha mahsulot yoʻq') + '</b>'
      + (PR.length ? 'Filtrni oʻzgartirib koʻring' + (ST.q ? ' yoki qidiruvni qisqartiring' : '') + '.<br><br><button class="vt-cta" data-reset="1">Filtrni tozalash</button>' : 'Tez orada yangi mahsulotlar qoʻshiladi.') + '</div>';
    favUi();
  }

  // ── savat ──
  function cartCount() { var n = 0; Object.keys(CART).forEach(function (k) { n += CART[k]; }); return n; }
  function cartSum() { var s = 0; Object.keys(CART).forEach(function (k) { var p = BYID[k]; if (p) s += p.price * CART[k]; }); return s; }
  function setQty(id, q, src) {
    var p = BYID[id]; if (!p) return;
    q = Math.max(0, Math.min(p.stock, q));
    if (q > 0 && CART[id] && q === CART[id] && q === p.stock) toast('Omborda faqat ' + p.stock + ' ta bor');
    if (q) CART[id] = q; else delete CART[id];
    lsSet(key('cart'), CART); cartUi(); render();
    if (src === 'add') { var b = $('vt-cartb'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  }
  function cartUi() {
    var n = cartCount(); $('vt-cartc').textContent = n;
    $('vt-cartbar').hidden = !n || !$('vt-ov').hidden;
    $('vt-cbt').innerHTML = n ? '<b>' + n + ' ta</b> · ' + money(cartSum()) : '';
  }
  function favUi() { $('vt-favc').textContent = FAV.length; $('vt-favc').hidden = !FAV.length; }
  function toggleFav(id) {
    id = String(id); var i = FAV.indexOf(id);
    if (i >= 0) FAV.splice(i, 1); else { FAV.unshift(id); toast('Sevimlilarga qoʻshildi ♥'); }
    lsSet(key('fav'), FAV.slice(0, 200)); render();
  }

  // ── oyna ──
  var LAST_FOCUS = null;
  function sheet(html) {
    LAST_FOCUS = document.activeElement;
    $('vt-sheet').innerHTML = '<button class="vt-x" data-close="1" aria-label="Yopish">×</button>' + html;
    $('vt-ov').hidden = false; document.body.style.overflow = 'hidden'; $('vt-cartbar').hidden = true;
    setTimeout(function () { var f = $('vt-sheet').querySelector('input,button:not(.vt-x)'); if (f) f.focus({ preventScroll: true }); }, 60);
  }
  function closeSheet() {
    $('vt-ov').hidden = true; document.body.style.overflow = ''; cartUi();
    if (/#p=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    if (LAST_FOCUS && LAST_FOCUS.focus) LAST_FOCUS.focus({ preventScroll: true });
  }

  // Kartochkadagi rasm: nuqtani bosish yoki surish — keyingi rasm (mahsulot oynasi ochilmaydi)
  function cardImg(picEl, k) {
    var p = BYID[picEl.getAttribute('data-open')]; if (!p || !p.img || p.img.length < 2) return;
    var n = Math.min(6, p.img.length); k = (k + n) % n;
    var im = picEl.querySelector('img'); if (im) im.src = p.img[k];
    picEl.setAttribute('data-k', k);
    [].forEach.call(picEl.querySelectorAll('.vt-dots i'), function (d, i) { d.classList.toggle('on', i === k); });
  }
  document.addEventListener('click', function (e) {
    var dot = e.target.closest && e.target.closest('.vt-dots i'); if (!dot) return;
    e.preventDefault(); e.stopPropagation(); cardImg(dot.closest('.vt-pic'), +dot.getAttribute('data-dot'));
  }, true);
  var SW = null;
  document.addEventListener('touchstart', function (e) { var el = e.target.closest && e.target.closest('.vt-pic.multi'); SW = el ? { el: el, x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!SW) return; var t = e.changedTouches[0], dx = t.clientX - SW.x, dy = t.clientY - SW.y, el = SW.el; SW = null;
    if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    cardImg(el, (+el.getAttribute('data-k') || 0) + (dx < 0 ? 1 : -1));
    el.setAttribute('data-swiped', Date.now());
  }, { passive: true });
  document.addEventListener('click', function (e) {   // surishdan keyingi «bosish» — oynani ochmasin
    var el = e.target.closest && e.target.closest('.vt-pic.multi');
    if (el && Date.now() - (+el.getAttribute('data-swiped') || 0) < 400) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  function openProduct(id) {
    var p = BYID[id]; if (!p) return;
    RECENT = [String(id)].concat(RECENT.filter(function (x) { return x !== String(id); })).slice(0, 12); lsSet(key('recent'), RECENT); recent();
    history.replaceState(null, '', '#p=' + id);
    var q = Math.max(1, CART[id] || 1), imgs = p.img || [];
    var si = sawInfo(p), meta = [p.sku && 'Kod: ' + p.sku, p.brand, si.dia && 'Ø' + si.dia + ' mm', si.tooth && si.tooth + ' tish', si.mat].filter(Boolean).concat(p.specs || []);
    var ask = D.shop.tg ? 'https://t.me/' + encodeURIComponent(D.shop.tg) : D.shop.wa ? 'https://wa.me/' + D.shop.wa.replace(/\D/g, '') + '?text=' + encodeURIComponent(p.name + ' (' + p.sku + ') haqida') : '';
    sheet('<div class="vt-hero' + (imgs.length ? ' has' : '') + '"><div class="vt-big" id="vt-bigimg">' + pic(p) + '</div>'
      + (imgs.length > 1 ? '<div class="vt-thumbs">' + imgs.map(function (u, i) { return '<button data-img="' + i + '" class="' + (i ? '' : 'on') + '" aria-label="Rasm ' + (i + 1) + '"><img src="' + esc(u) + '" alt=""></button>'; }).join('') + '</div>' : '') + '</div>'
      + '<h2>' + esc(p.name) + '</h2><p class="vt-sub">' + esc([p.brand, p.cat, p.sku].filter(Boolean).join(' · ')) + '</p>'
      + '<div class="vt-pr"><b style="font-size:22px">' + money(p.price) + '</b>' + (p.old ? '<s>' + money(p.old) + '</s>' : '') + '</div>'
      + '<div class="vt-meta">' + meta.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '<span style="color:' + (p.stock <= 3 ? '#8a5a00' : '#13805b') + '">' + (p.stock <= 3 ? 'Kam qoldi: ' + p.stock + ' ta' : 'Omborda bor') + '</span></div>'
      + (p.desc ? '<p style="color:#555;font-size:14px">' + esc(p.desc) + '</p>' : '')
      + '<div class="vt-line" style="margin:12px 0"><div class="vt-qty"><button data-pq="-1" aria-label="Kamaytirish">−</button><span id="vt-pq">' + q + '</span><button data-pq="1" aria-label="Koʻpaytirish">+</button></div>'
      + '<button class="vt-prim" data-addp="' + esc(p.id) + '">' + (CART[id] ? 'Savatni yangilash' : 'Savatga qoʻshish') + '</button></div>'
      + '<div class="vt-line">' + (ask ? '<a class="vt-sec" href="' + esc(ask) + '" target="_blank" rel="noopener">💬 Savol berish</a>' : '') + '<button class="vt-sec" data-share="' + esc(p.id) + '">↗ Ulashish</button></div>');
  }

  function openCart() {
    var ids = Object.keys(CART).filter(function (k) { return BYID[k]; });
    if (!ids.length) { sheet('<h2>Savat</h2><div class="vt-empty"><b>Savat boʻsh</b>Mahsulot tanlab «Savatga» tugmasini bosing.</div>'); return; }
    var sh = D.shop, sum = cartSum();
    var dlv = CHK.delivery === 'courier' && sh.delivery ? 'courier' : 'pickup';
    var fee = dlv === 'courier' && sh.fee > 0 && !(sh.freeMin > 0 && sum >= sh.freeMin) ? sh.fee : 0;
    var free = sh.delivery && sh.freeMin > 0 ? (sum >= sh.freeMin ? '<div class="vt-free">🎉 Yetkazib berish <b>bepul</b><i style="--w:100%"></i></div>'
      : '<div class="vt-free">Yana <b>' + money(sh.freeMin - sum) + '</b> lik mahsulot qoʻshsangiz — yetkazish bepul<i style="--w:' + Math.round(sum / sh.freeMin * 100) + '%"></i></div>') : '';
    sheet('<h2>Savat</h2>' + ids.map(function (id) { var p = BYID[id];
      return '<div class="vt-ci"><div class="t">' + pic(p) + '</div><div class="i">' + esc(p.name) + '<small>' + money(p.price) + ' × ' + CART[id] + ' = <b>' + money(p.price * CART[id]) + '</b></small></div>'
        + '<div class="vt-qty"><button data-cdec="' + esc(id) + '" aria-label="Kamaytirish">−</button><span>' + CART[id] + '</span><button data-cinc="' + esc(id) + '" aria-label="Koʻpaytirish">+</button></div></div>'; }).join('')
      + free
      + '<div class="vt-seg2"><button data-dlv="pickup" class="' + (dlv === 'pickup' ? 'on' : '') + '">🏬 Olib ketaman</button><button data-dlv="courier" class="' + (dlv === 'courier' ? 'on' : '') + '"' + (sh.delivery ? '' : ' disabled title="Bu doʻkonda yetkazib berish yoʻq"') + '>🚚 Yetkazib bering</button></div>'
      + '<div class="vt-tot"><span>Mahsulotlar</span><span>' + money(sum) + '</span></div>'
      + (dlv === 'courier' ? '<div class="vt-tot"><span>Yetkazib berish</span><span>' + (fee ? money(fee) : 'bepul') + '</span></div>' : '')
      + '<div class="vt-tot f"><span>Jami</span><span>' + money(sum + fee) + '</span></div>'
      + '<form id="vt-form" novalidate><label class="vt-fld"><span>Ismingiz</span><input name="name" autocomplete="name" maxlength="80" required value="' + esc(CHK.name || '') + '"></label>'
      + '<label class="vt-fld"><span>Telefon</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+998 90 123 45 67" required value="' + esc(CHK.phone || '+998 ') + '"></label>'
      + (dlv === 'courier' ? '<label class="vt-fld"><span>Manzil (shahar, koʻcha, uy)</span><input name="address" autocomplete="street-address" maxlength="160" required value="' + esc(CHK.address || '') + '"></label>' : '')
      + '<label class="vt-fld"><span>Izoh (ixtiyoriy)</span><textarea name="note" rows="2" maxlength="200"></textarea></label>'
      + '<label class="vt-hp" aria-hidden="true">Bu maydonni boʻsh qoldiring<input name="hp" tabindex="-1" autocomplete="off"></label>'
      + '<div class="vt-err" id="vt-err" role="alert"></div><button class="vt-prim" type="submit" id="vt-send">Buyurtma berish · ' + money(sum + fee) + '</button>'
      + '<p style="font-size:12px;color:#8a8d95;text-align:center">Toʻlov — mahsulotni olganda. Doʻkon buyurtmani telefon orqali tasdiqlaydi.</p></form>');
  }
  var CHK = lsGet(key('chk'), { delivery: 'pickup' });
  function fmtPhone(v) {
    var d = String(v).replace(/\D/g, ''); if (d.indexOf('998') !== 0) d = '998' + d.replace(/^998/, ''); d = d.slice(0, 12);
    var p = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean);
    return '+' + p.join(' ');
  }
  function submit(f) {
    var err = $('vt-err'), btn = $('vt-send');
    var body = { a: 'order', s: D.shop.slug, name: f.name.value.trim(), phone: f.phone.value, address: f.address ? f.address.value.trim() : '', note: f.note.value.trim(),
      delivery: CHK.delivery === 'courier' && D.shop.delivery ? 'courier' : 'pickup', hp: f.hp.value,
      items: Object.keys(CART).filter(function (k) { return BYID[k]; }).map(function (k) { return { pid: BYID[k].id, qty: CART[k] }; }) };
    if (body.name.length < 2) { err.textContent = 'Ismingizni yozing'; f.name.focus(); return; }
    if (String(body.phone).replace(/\D/g, '').length !== 12) { err.textContent = 'Telefon raqamni toʻliq yozing'; f.phone.focus(); return; }
    if (body.delivery === 'courier' && body.address.length < 5) { err.textContent = 'Manzilni yozing'; f.address.focus(); return; }
    CHK = { delivery: CHK.delivery, name: body.name, phone: f.phone.value, address: body.address }; lsSet(key('chk'), CHK);
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Yuborilmoqda…';
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || !x.j.ok) { err.textContent = (x.j && x.j.error) || 'Yuborilmadi — qayta urinib koʻring'; btn.disabled = false; btn.textContent = 'Qayta yuborish'; if (x.j && x.j.pid) load(); return; }
        ORD.unshift({ id: x.j.id, tk: x.j.tk, no: x.j.no, at: new Date().toISOString(), total: x.j.total }); lsSet(key('orders'), ORD.slice(0, 30));
        CART = {}; lsSet(key('cart'), CART); cartUi(); render();
        sheet('<div class="vt-ok"><i>✅</i><h2 style="padding:0">Buyurtma #' + x.j.no + ' qabul qilindi</h2><p>Jami: <b>' + money(x.j.total) + '</b></p><p style="color:#666">Doʻkon tez orada <b>' + esc(body.phone) + '</b> raqamiga qoʻngʻiroq qilib tasdiqlaydi.</p>'
          + '<button class="vt-prim" data-orders="1">Buyurtmalarim</button><br><br><button class="vt-sec" data-close="1">Xaridni davom ettirish</button></div>');
      })
      .catch(function () { err.textContent = navigator.onLine === false ? 'Internet yoʻq — ulanib, qayta yuboring' : 'Server javob bermadi — qayta urinib koʻring'; btn.disabled = false; btn.textContent = 'Qayta yuborish'; });
  }

  function openOrders() {
    if (!ORD.length) { sheet('<h2>Buyurtmalarim</h2><div class="vt-empty"><b>Hali buyurtma yoʻq</b>Shu qurilmadan berilgan buyurtmalar shu yerda koʻrinadi.</div>'); return; }
    sheet('<h2>Buyurtmalarim</h2><div id="vt-ol">' + ORD.map(function (o) { return '<div class="vt-ord"><b>#' + o.no + '</b> · ' + money(o.total) + '<br><small style="color:#888">' + new Date(o.at).toLocaleString('uz-UZ') + '</small><div class="vt-st"><i></i><i></i><i></i><i></i></div></div>'; }).join('') + '</div>');
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 'status', s: D.shop.slug, list: ORD.slice(0, 20).map(function (o) { return { id: o.id, tk: o.tk }; }) }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.orders || $('vt-ov').hidden) return;
        var STEP = { new: 1, preparing: 2, ready: 3, done: 4 };
        var m = {}; j.orders.forEach(function (o) { m[o.id] = o; });
        $('vt-ol').innerHTML = ORD.map(function (o) { var s = m[o.id]; var n = s ? (STEP[s.status] || 0) : 0;
          return '<div class="vt-ord"><b>#' + o.no + '</b> · ' + money(s ? s.total : o.total) + ' ' + (s ? '<span class="vt-badge' + (s.status === 'cancelled' ? ' x' : '') + '">' + esc(s.label) + '</span>' : '<span class="vt-badge x">topilmadi</span>')
            + '<br><small style="color:#888">' + new Date(o.at).toLocaleString('uz-UZ') + (s ? ' · ' + s.items + ' ta mahsulot · ' + (s.delivery === 'courier' ? 'yetkazib berish' : 'olib ketish') : '') + '</small>'
            + '<div class="vt-st">' + [1, 2, 3, 4].map(function (k) { return '<i class="' + (k <= n ? 'on' : '') + '"></i>'; }).join('') + '</div></div>'; }).join('');
      }).catch(function () {});
  }

  function recent() {
    var r = RECENT.map(function (id) { return BYID[id]; }).filter(Boolean).slice(0, 8);
    $('vt-recentw').hidden = r.length < 2;
    $('vt-recent').innerHTML = r.map(card).join('');
  }
  function footer() {
    var sh = D.shop, map = sh.lat != null && sh.lng != null ? 'https://maps.google.com/?q=' + sh.lat + ',' + sh.lng : (sh.address ? 'https://maps.google.com/?q=' + encodeURIComponent(sh.address) : '');
    $('vt-ft').innerHTML = '<div><b>' + esc(sh.name) + '</b>' + esc(sh.about || 'Arra tigʻlari, frezalar va asboblar.') + '</div>'
      + (sh.address ? '<div><b>Manzil</b>' + esc(sh.address) + (map ? '<br><a href="' + esc(map) + '" target="_blank" rel="noopener">Xaritada ochish</a>' : '') + '</div>' : '')
      + '<div><b>Aloqa</b>' + (sh.phone ? '<a href="tel:' + esc(sh.phone.replace(/[^\d+]/g, '')) + '">' + esc(sh.phone) + '</a><br>' : '')
      + [sh.wa ? '<a href="https://wa.me/' + esc(sh.wa.replace(/\D/g, '')) + '" target="_blank" rel="noopener">WhatsApp</a>' : '', sh.tg ? '<a href="https://t.me/' + esc(sh.tg) + '" target="_blank" rel="noopener">@' + esc(sh.tg) + '</a>' : ''].filter(Boolean).join(' · ') + '</div>';
  }

  var TT = null;
  function toast(t) { var e = $('vt-toast'); e.textContent = t; e.classList.add('on'); clearTimeout(TT); TT = setTimeout(function () { e.classList.remove('on'); }, 1900); }
  window.vtHome = function () { ST = { cat: '', br: '', sort: 'def', q: '', fav: false, mat: '', dia: '', tooth: '' }; $('vt-q').value = ''; $('vt-sort').value = 'def'; $('vt-brand').value = ''; if (D) { chips(); finderUi(); render(); } window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // ── hodisalar (bitta joyda) ──
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button,a,[data-close]'); if (!t) { if (e.target === $('vt-ov')) closeSheet(); return; }
    var d = t.dataset;
    if (d.close) return closeSheet();
    if (d.open) return openProduct(d.open);
    if (d.fav && t.classList.contains('vt-fav')) return toggleFav(d.fav);
    if (d.inc) return setQty(d.inc, (CART[d.inc] || 0) + 1, 'add');
    if (d.dec) return setQty(d.dec, (CART[d.dec] || 0) - 1);
    if (d.cinc) { setQty(d.cinc, (CART[d.cinc] || 0) + 1); return openCart(); }
    if (d.cdec) { setQty(d.cdec, (CART[d.cdec] || 0) - 1); return openCart(); }
    if (d.dlv) { CHK.delivery = d.dlv; lsSet(key('chk'), CHK); return openCart(); }
    if (d.pq) { var el = $('vt-pq'), id = (location.hash.match(/#p=([\w-]+)/) || [])[1], mx = BYID[id] ? BYID[id].stock : 99; el.textContent = Math.max(1, Math.min(mx, +el.textContent + +d.pq)); return; }
    if (d.addp) { setQty(d.addp, +$('vt-pq').textContent, 'add'); toast('Savatga qoʻshildi'); return closeSheet(); }
    if (d.img != null && d.img !== undefined && t.closest('.vt-thumbs')) { var p = BYID[(location.hash.match(/#p=([\w-]+)/) || [])[1]]; if (p) { $('vt-bigimg').innerHTML = '<img src="' + esc(p.img[+d.img]) + '" alt="">'; [].forEach.call(t.parentNode.children, function (b) { b.classList.toggle('on', b === t); }); } return; }
    if (d.share) { var u = location.origin + location.pathname + location.search + '#p=' + d.share, nm = BYID[d.share] ? BYID[d.share].name : '';
      if (navigator.share) navigator.share({ title: nm, url: u }).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { toast('Havola nusxalandi'); }); return; }
    if (d.orders) return openOrders();
    if (d.reset) return window.vtHome();
    if (d.go) { if (d.go === 'cart') return openCart(); var el2 = $(d.go === 'finder' ? 'vt-finder' : 'vt-grid'); if (el2 && !el2.hidden) el2.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('vt-dots')) { show([].indexOf.call(t.parentNode.children, t)); clearInterval(SLT); return; }
    if (d.k) { ST[d.k] = d.v; finderUi(); render(); return; }
    if (t.classList.contains('vt-chip')) { ST.fav = d.fav === '1'; ST.cat = ST.fav ? '' : (d.cat || ''); chips(); render(); return; }
  });
  document.addEventListener('submit', function (e) { if (e.target.id === 'vt-form') { e.preventDefault(); submit(e.target); } });
  document.addEventListener('input', function (e) { if (e.target.name === 'phone' && e.target.closest('#vt-form')) { var c = e.target.value.length; e.target.value = fmtPhone(e.target.value); if (c < 5 && e.target.value === '+998') e.target.value = '+998 '; } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('vt-ov').hidden) closeSheet(); });
  var QT = null;
  $('vt-q').addEventListener('input', function () { clearTimeout(QT); var v = this.value; QT = setTimeout(function () { ST.q = v; render(); }, 160); });
  $('vt-sort').addEventListener('change', function () { ST.sort = this.value; render(); });
  $('vt-brand').addEventListener('change', function () { ST.br = this.value; render(); });
  $('vt-cartb').addEventListener('click', openCart);
  $('vt-cbgo').addEventListener('click', openCart);
  $('vt-favb').addEventListener('click', function () { ST.fav = !ST.fav; ST.cat = ''; chips(); render(); $('vt-grid').scrollIntoView({ behavior: 'smooth' }); });
  $('vt-ordb').addEventListener('click', openOrders);
  window.addEventListener('online', function () { if (!D) load(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) clearInterval(SLT); else if (D && $('vt-hero').querySelectorAll('.vt-slide').length > 1) { clearInterval(SLT); SLT = setInterval(function () { show(SLIDE + 1); }, 5500); } });
  load();
})();
