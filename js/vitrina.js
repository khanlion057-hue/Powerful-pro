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
    // egasi: materiallar — Yog'och | Laminat, MDF, HPL | Temir | Alyuminiy (bitta tig' bir nechtasiga mos bo'lishi mumkin)
    var mats = [];
    if (/yog.?och|wood|дерев|древ|derev|drev|construction/.test(s)) mats.push('Yogʻoch');
    if (/laminat|ламинат|ldsp|лдсп|\bdsp\b|дсп|\bmdf\b|\bhdf\b|мдф|хдф|dvp|двп|\bhpl\b|пластик|plastik/.test(s)) mats.push('Laminat, MDF, HPL');
    if (/temir|metal|металл|stal|сталь|steel|\biron\b|черн/.test(s)) mats.push('Temir');
    if (/alyumin|alumin|алюмин|цветн/.test(s)) mats.push('Alyuminiy');
    return { dia: d ? +d[1] : null, tooth: t ? +t[1] : null, mat: mats[0] || '', mats: mats };
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
  // v25.6.10: rasmsiz mahsulot — HAMMA JOYDA BIR XIL o'rinbosar (kulrang quti belgisi); rasm — oq fonda, markazda, kvadrat
  var NOIMG = '<svg class="vt-noimg" viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="16" width="44" height="34" rx="6" fill="none" stroke="#cbd5e1" stroke-width="3"/><circle cx="24" cy="29" r="5" fill="#cbd5e1"/><path d="M14 46l12-11 9 8 7-6 10 9" fill="none" stroke="#cbd5e1" stroke-width="3" stroke-linejoin="round"/></svg>';
  function pic(p, cls) { return p.img && p.img.length ? '<img src="' + esc(p.img[0]) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async"' + (cls ? ' class="' + cls + '"' : '') + '>' : NOIMG; }
  // rasm yuklanguncha — skelet (miltillovchi fon); yuklanmasa — o'sha bir xil o'rinbosar
  document.addEventListener('load', function (e) { var t = e.target; if (t && t.tagName === 'IMG') t.classList.add('ld'); }, true);
  document.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && t.closest && t.closest('.vt-pic,.vt-big,.vt-ci .t,.vt-cat i')) { var w = t.parentNode; if (w) { w.classList.remove('has'); t.outerHTML = NOIMG; } } }, true);
  // v25.6.10: KAFOLAT — 3 / 6 / 12 oy; hamma joyda bir xil belgi
  var SHIELD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>';
  function war(p, big) { return p && p.warranty ? '<span class="vt-war' + (big ? ' big' : '') + '">' + SHIELD + 'Kafolat: ' + p.warranty + ' oy</span>' : ''; }
  var WAR_TEXT = 'Toʻliq texnik kafolat: nosozlik boʻlsa bepul taʼmirlanadi, kerakli ehtiyot qismlar ham kafolat ichida. Kafolat chek / buyurtma raqami boʻyicha amal qiladi.';
  // v25.6.10: telefon — +998 XX XXX XX XX; bo'sh ikkinchi raqam ko'rinmaydi
  function tel(ph) { return 'tel:' + String(ph || '').replace(/[^\d+]/g, ''); }
  function phones() { var sh = D.shop; return [sh.phone, sh.phone2].filter(function (x, i, a) { return x && a.indexOf(x) === i; }); }

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
        hero(); perks(); catCards(); filters(); finder(); footer(); render(); cartUi(); recent(); navUi();
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
    if (!s.length) { $('vt-hero').innerHTML = ''; $('vt-hero').hidden = true; clearInterval(SLT); return; }
    $('vt-hero').hidden = false;
    if (0) s.push(slideHtml(0, 'Professional arra tigʻlari', 'Rover va formatli stanoklar uchun — original, kafolatli', ['Katalogni koʻrish', 'grid']));
    if (0) s.push(slideHtml(1, D.shop.freeMin > 0 ? money(D.shop.freeMin) + ' dan — bepul yetkazish' : 'Yetkazib berish xizmati', 'Buyurtmani onlayn bering — doʻkon tasdiqlab, yetkazib beradi', ['Savatni ochish', 'cart']));
    if (0) s.push(slideHtml(2, cats.length + ' ta kategoriya', cats.slice(0, 4).join(' · '), ['Tigʻ tanlash', 'finder']));
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

  function perks() { $('vt-perks').innerHTML = ''; $('vt-perks').hidden = true; }
  function perksOld() {
    var sh = D.shop, P = [];
    P.push(['🚚', sh.delivery ? 'Yetkazib berish' : 'Olib ketish', sh.delivery ? (sh.freeMin > 0 ? money(sh.freeMin) + ' dan bepul' + (sh.fee > 0 ? ', aks holda ' + money(sh.fee) : '') : (sh.fee > 0 ? money(sh.fee) : 'Bepul')) : (sh.address || 'Doʻkondan')]);
    P.push(['✅', 'Original mahsulot', PR.length + ' ta mahsulot sotuvda']);
    var ws = PR.map(function (p) { return p.warranty; }).filter(Boolean);
    if (ws.length) P.push([SHIELD, 'Rasmiy kafolat', (Math.min.apply(null, ws) === Math.max.apply(null, ws) ? ws[0] : Math.min.apply(null, ws) + '–' + Math.max.apply(null, ws)) + ' oy · taʼmirlash va ehtiyot qismlar', 'warranty']);
    if (sh.tg || sh.wa || sh.phone) P.push(['📞', 'Tez aloqa', phones()[0] || (sh.tg ? 'Telegram @' + sh.tg : 'WhatsApp'), 'contact']);
    $('vt-perks').innerHTML = P.map(function (x) { return (x[3] ? '<button type="button" class="vt-perk" data-perk="' + x[3] + '">' : '<div class="vt-perk">') + '<i>' + x[0] + '</i><div><b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span></div>' + (x[3] ? '</button>' : '</div>'); }).join('');
  }

  // v25.6.10: KATEGORIYA KARTALARI — hammasi bir xil o'lcham (4:3), rasmsiz kategoriyada bir xil belgi
  var CATIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>';
  function catCards() {
    var cats = catList(), im = D.cats || {}, n = {}; PR.forEach(function (p) { if (p.cat) n[p.cat] = (n[p.cat] || 0) + 1; });
    $('vt-catsw').hidden = cats.length < 2;
    $('vt-cats').innerHTML = cats.map(function (c) {
      return '<button type="button" class="vt-cat' + (ST.cat === c ? ' on' : '') + '" data-catc="' + esc(c) + '"><i class="' + (im[c] ? 'has' : '') + '">' + (im[c] ? '<img src="' + esc(im[c]) + '" alt="" loading="lazy" decoding="async">' : CATIC) + '</i>'
        + '<b>' + esc(c) + '</b><small>' + n[c] + ' ta mahsulot</small></button>'; }).join('');
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
  function chips() { var c = $('vt-chips').children; for (var i = 0; i < c.length; i++) c[i].classList.toggle('on', ST.fav ? c[i].dataset.fav === '1' : (c[i].dataset.cat === ST.cat && !c[i].dataset.fav));
    [].forEach.call(document.querySelectorAll('.vt-cat'), function (b) { b.classList.toggle('on', !ST.fav && b.dataset.catc === ST.cat); });
    if (D) finderVis(); }

  // ── arra tanlash yordamchisi ──
  function finder() {
    // variantlar — faqat ochiq bo'limdagi tig'lardan (boshqa bo'lim o'lchamlari aralashmaydi)
    var src = ST.cat ? PR.filter(function (p) { return p.cat === ST.cat; }) : PR;
    var sw = src.map(function (p) { return { p: p, s: sawInfo(p) }; }).filter(function (x) { return x.s.dia; });
    if (sw.length < 3) { $('vt-finder').hidden = true; return; }
    if (!FBUSY) finderVis();
    var uniq = function (f) { var m = {}; sw.forEach(function (x) { var v = f(x.s); if (v) m[v] = 1; }); return Object.keys(m); };
    var MATS = ['Yogʻoch', 'Laminat, MDF, HPL', 'Temir', 'Alyuminiy'], has = {};
    sw.forEach(function (x) { x.s.mats.forEach(function (m) { has[m] = 1; }); });
    var mats = MATS.filter(function (m) { return has[m]; }), dias = uniq(function (s) { return s.dia; }).map(Number).sort(function (a, b) { return a - b; });
    var teeth = uniq(function (s) { return s.tooth; }).map(Number).sort(function (a, b) { return a - b; });
    var seg = function (el, list, k, fmt) { $(el).innerHTML = '<button data-k="' + k + '" data-v="">Hammasi</button>' + list.map(function (v) { return '<button data-k="' + k + '" data-v="' + esc(v) + '">' + esc(fmt ? fmt(v) : v) + '</button>'; }).join(''); };
    seg('vt-fmat', mats, 'mat'); seg('vt-fdia', dias, 'dia', function (v) { return 'Ø' + v; }); seg('vt-ftooth', teeth, 'tooth', function (v) { return v + 'T'; });
    finderUi();
  }
  // egasi: yordamchi faqat arra tig'lari bo'limi ochilganda (shu bo'limdagi mahsulotlarning ko'pi arra tig'i bo'lsa)
  function finderVis() {
    var inCat = ST.cat ? PR.filter(function (p) { return p.cat === ST.cat; }) : [];
    var saws = inCat.filter(function (p) { return sawInfo(p).dia; }).length;
    var blade = /tig|disk|диск|полотн|polotn|blade/i.test(ST.cat || '');
    var on = !ST.fav && blade && inCat.length > 0 && saws >= 3 && saws >= inCat.length / 2;
    if (!on && (ST.mat || ST.dia || ST.tooth)) { ST.mat = ST.dia = ST.tooth = ''; finderUi(); }
    if (on && FCAT !== ST.cat) { FCAT = ST.cat; FBUSY = true; finder(); FBUSY = false; }
    $('vt-finder').hidden = !on;
  }
  var FCAT = null, FBUSY = false;
  function finderUi() {
    ['vt-fmat', 'vt-fdia', 'vt-ftooth'].forEach(function (id) { var b = $(id).children; for (var i = 0; i < b.length; i++) b[i].classList.toggle('on', String(ST[b[i].dataset.k]) === b[i].dataset.v); });
    var tip = '';
    if (ST.tooth) { var t = +ST.tooth; tip = t >= 80 ? 'Koʻp tish — toza, silliq kesim (laminat, DSP, ishlov berilgan yogʻoch).' : t >= 48 ? 'Universal — koʻndalang va boʻylama kesish uchun.' : 'Kam tish — tez boʻylama kesish (massiv yogʻoch).'; }
    else if (ST.mat === 'Temir') tip = 'Temir uchun koʻp tishli, metall kesishga moʻljallangan (Cermet) tigʻ tanlang.';
    else if (ST.mat === 'Laminat, MDF, HPL') tip = 'Laminat, MDF va HPL uchun koʻp tishli (60T+) tigʻ — chetlari uchmaydi.';
    else if (ST.mat === 'Alyuminiy') tip = 'Alyuminiy uchun manfiy burchakli, koʻp tishli (TCG) tigʻ tanlang.';
    $('vt-fhint').textContent = tip;
  }

  // v25.6.10: qidiruv me'yori — o'lcham va tish yozilishining har xil shakllari bir xil topiladi
  function norm(t) {
    return String(t || '').toLowerCase()
      .replace(/[ʻʼ'`’‘]/g, '')
      .replace(/(^|[^a-zа-я])(?:ø|ф|d|д)\s?(\d)/g, '$1$2')       // Ø250, ф250, d250 → 250
      .replace(/(\d)\s*[x×х*]\s*/g, '$1x')               // 250 x 30, 250*30, 250×30 → 250x30
      .replace(/(\d)\s*(?:tish|t|т|z)(?![a-zа-я])/g, '$1t')                  // 80 T, 80т, 80z → 80t
      .replace(/(\d)\s*(?:mm|мм)(?![a-zа-я])/g, '$1')                        // 250mm → 250
      .replace(/[,;()]/g, ' ');
  }
  // ── ro'yxat ──
  function list() {
    var q = norm(ST.q).trim(), words = q ? q.split(/\s+/).filter(Boolean) : [];
    var out = PR.filter(function (p) {
      if (ST.fav && FAV.indexOf(String(p.id)) < 0) return false;
      if (ST.cat && p.cat !== ST.cat) return false;
      if (ST.br && p.brand !== ST.br) return false;
      if (ST.mat || ST.dia || ST.tooth) { var s = sawInfo(p); if (ST.mat && s.mats.indexOf(ST.mat) < 0) return false; if (ST.dia && s.dia !== +ST.dia) return false; if (ST.tooth && s.tooth !== +ST.tooth) return false; }
      if (words.length) { var hay = norm(p.name + ' ' + p.sku + ' ' + p.brand + ' ' + p.cat + ' ' + (p.specs || []).join(' ')), hc = hay.replace(/\s+/g, ''); for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0 && hc.indexOf(words[i]) < 0) return false; }
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
      + war(p)
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
    $('vt-cbt').innerHTML = n ? '<b>' + n + ' ta</b> · ' + money(cartSum()) : ''; navUi();
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
    var si = sawInfo(p), meta = [p.sku && 'Kod: ' + p.sku, p.brand, si.dia && 'Ø' + si.dia + ' mm', si.tooth && si.tooth + ' tish'].concat(si.mats).filter(Boolean).concat(p.specs || []);
    var ask = D.shop.tg ? 'https://t.me/' + encodeURIComponent(D.shop.tg) : D.shop.wa ? 'https://wa.me/' + D.shop.wa.replace(/\D/g, '') + '?text=' + encodeURIComponent(p.name + ' (' + p.sku + ') haqida') : '';
    sheet('<div class="vt-hero' + (imgs.length ? ' has' : '') + '"><div class="vt-big" id="vt-bigimg">' + pic(p) + '</div>'
      + (imgs.length > 1 ? '<div class="vt-thumbs">' + imgs.map(function (u, i) { return '<button data-img="' + i + '" class="' + (i ? '' : 'on') + '" aria-label="Rasm ' + (i + 1) + '"><img src="' + esc(u) + '" alt=""></button>'; }).join('') + '</div>' : '') + '</div>'
      + '<h2>' + esc(p.name) + '</h2><p class="vt-sub">' + esc([p.brand, p.cat, p.sku].filter(Boolean).join(' · ')) + '</p>'
      + '<div class="vt-pr"><b style="font-size:22px">' + money(p.price) + '</b>' + (p.old ? '<s>' + money(p.old) + '</s>' : '') + '</div>'
      + '<div class="vt-meta">' + meta.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '<span style="color:' + (p.stock <= 3 ? '#8a5a00' : '#13805b') + '">' + (p.stock <= 3 ? 'Kam qoldi: ' + p.stock + ' ta' : 'Omborda bor') + '</span></div>'
      + (p.warranty ? '<div class="vt-warbox"><div class="vt-warh"><span class="vt-wb">' + SHIELD + 'Rasmiy kafolat</span>' + war(p, true) + '</div><p>' + esc(WAR_TEXT) + '</p></div>' : '')
      + (p.desc ? '<p style="color:#555;font-size:14px">' + esc(p.desc) + '</p>' : '')
      + '<div class="vt-line" style="margin:12px 0"><div class="vt-qty"><button data-pq="-1" aria-label="Kamaytirish">−</button><span id="vt-pq">' + q + '</span><button data-pq="1" aria-label="Koʻpaytirish">+</button></div>'
      + '<button class="vt-prim" data-addp="' + esc(p.id) + '">' + (CART[id] ? 'Savatni yangilash' : 'Savatga qoʻshish') + '</button></div>'
      + '<div class="vt-line">' + (ask ? '<a class="vt-sec" href="' + esc(ask) + '" target="_blank" rel="noopener">💬 Savol berish</a>' : '') + '<button class="vt-sec" data-share="' + esc(p.id) + '">↗ Ulashish</button></div>');
  }

  // v25.6.10: savat qayta chizilganda (yetkazish turi, +/−) yozilgan ism, telefon, manzil va izoh o'chib ketmasin
  function keepForm() {
    var f = document.getElementById('vt-form'); if (!f) return;
    if (f.name) CHK.name = f.name.value; if (f.phone) CHK.phone = f.phone.value; if (f.phone2) CHK.phone2 = f.phone2.value; if (f.address) CHK.address = f.address.value; if (f.note) CHK.note = f.note.value;
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
      return '<div class="vt-ci"><div class="t">' + pic(p) + '</div><div class="i">' + esc(p.name) + '<small>' + money(p.price) + ' × ' + CART[id] + ' = <b>' + money(p.price * CART[id]) + '</b></small>' + war(p) + '</div>'
        + '<div class="vt-qty"><button data-cdec="' + esc(id) + '" aria-label="Kamaytirish">−</button><span>' + CART[id] + '</span><button data-cinc="' + esc(id) + '" aria-label="Koʻpaytirish">+</button></div></div>'; }).join('')
      + free
      + '<div class="vt-seg2"><button data-dlv="pickup" class="' + (dlv === 'pickup' ? 'on' : '') + '">🏬 Olib ketaman</button><button data-dlv="courier" class="' + (dlv === 'courier' ? 'on' : '') + '"' + (sh.delivery ? '' : ' disabled title="Bu doʻkonda yetkazib berish yoʻq"') + '>🚚 Yetkazib bering</button></div>'
      + '<div class="vt-tot"><span>Mahsulotlar</span><span>' + money(sum) + '</span></div>'
      + (dlv === 'courier' ? '<div class="vt-tot"><span>Yetkazib berish</span><span>' + (fee ? money(fee) : 'bepul') + '</span></div>' : '')
      + '<div class="vt-tot f"><span>Jami</span><span>' + money(sum + fee) + '</span></div>'
      + '<form id="vt-form" novalidate><label class="vt-fld"><span>Ismingiz</span><input name="name" autocomplete="name" maxlength="80" required value="' + esc(CHK.name || '') + '"></label>'
      + '<label class="vt-fld"><span>Telefon</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+998 90 123 45 67" required value="' + esc(CHK.phone || '+998 ') + '"></label>'
      + '<label class="vt-fld"><span>Qoʻshimcha telefon (ixtiyoriy)</span><input name="phone2" type="tel" inputmode="tel" autocomplete="tel" placeholder="+998 __ ___ __ __" value="' + esc(CHK.phone2 || '') + '"></label>'
      + (dlv === 'courier' ? '<label class="vt-fld"><span>Manzil (shahar, koʻcha, uy)</span><input name="address" autocomplete="street-address" maxlength="160" required value="' + esc(CHK.address || '') + '"></label>' : '')
      + '<label class="vt-fld"><span>Izoh (ixtiyoriy)</span><textarea name="note" rows="2" maxlength="200">' + esc(CHK.note || '') + '</textarea></label>'
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
  var PENDK = null;   // v25.6.10: yuborilayotgan buyurtma kaliti
  function submit(f) {
    var err = $('vt-err'), btn = $('vt-send');
    var body = { a: 'order', s: D.shop.slug, name: f.name.value.trim(), phone: f.phone.value, phone2: f.phone2 && f.phone2.value.replace(/\D/g, '').length > 3 ? f.phone2.value : '', address: f.address ? f.address.value.trim() : '', note: f.note.value.trim(),
      delivery: CHK.delivery === 'courier' && D.shop.delivery ? 'courier' : 'pickup', hp: f.hp.value,
      items: Object.keys(CART).filter(function (k) { return BYID[k]; }).map(function (k) { return { pid: BYID[k].id, qty: CART[k] }; }) };
    // v25.6.10: bir xil buyurtma qayta yuborilsa — o'sha kalit (server ikkinchi buyurtma yaratmaydi)
    var sig = JSON.stringify([body.name, body.phone, body.delivery, body.address, body.items]);
    if (!PENDK || PENDK.sig !== sig) PENDK = { sig: sig, k: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) };
    body.k = PENDK.k;
    if (body.name.length < 2) { err.textContent = 'Ismingizni yozing'; f.name.focus(); return; }
    if (String(body.phone).replace(/\D/g, '').length !== 12) { err.textContent = 'Telefon raqamni toʻliq yozing'; f.phone.focus(); return; }
    if (body.phone2 && String(body.phone2).replace(/\D/g, '').length !== 12) { err.textContent = 'Qoʻshimcha raqamni toʻliq yozing yoki boʻsh qoldiring'; f.phone2.focus(); return; }
    if (body.delivery === 'courier' && body.address.length < 5) { err.textContent = 'Manzilni yozing'; f.address.focus(); return; }
    CHK = { delivery: CHK.delivery, name: body.name, phone: f.phone.value, phone2: body.phone2, address: body.address }; lsSet(key('chk'), CHK);
    var WL = body.items.map(function (it) { var p = BYID[String(it.pid)]; return p && p.warranty ? '<div class="vt-tot"><span>' + esc(p.name) + '</span>' + war(p) + '</div>' : ''; }).join('');
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Yuborilmoqda…';
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || !x.j.ok) { err.textContent = (x.j && x.j.error) || 'Yuborilmadi — qayta urinib koʻring'; btn.disabled = false; btn.textContent = 'Qayta yuborish'; if (x.j && x.j.pid) load(); return; }
        PENDK = null;
        if (!ORD.some(function (o) { return o.id === x.j.id; })) ORD.unshift({ id: x.j.id, tk: x.j.tk, no: x.j.no, at: new Date().toISOString(), total: x.j.total }); lsSet(key('orders'), ORD.slice(0, 30));
        CART = {}; lsSet(key('cart'), CART); cartUi(); render();
        sheet('<div class="vt-ok"><i>✅</i><h2 style="padding:0">Buyurtma #' + x.j.no + ' qabul qilindi</h2><p>Jami: <b>' + money(x.j.total) + '</b></p><p style="color:#666">Doʻkon tez orada <b>' + esc(body.phone) + '</b> raqamiga qoʻngʻiroq qilib tasdiqlaydi.</p>'
          + (WL ? '<div class="vt-warbox" style="text-align:left"><div class="vt-warh"><span class="vt-wb">' + SHIELD + 'Rasmiy kafolat</span></div>' + WL + '<p>' + esc(WAR_TEXT) + '</p></div>' : '')
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

  // v25.6.10: TEZ ALOQA — ikkala raqam, har biriga alohida qo'ng'iroq tugmasi
  function callRow(ph, lbl) { return '<div class="vt-call"><div><small>' + esc(lbl) + '</small><b>' + esc(ph) + '</b></div><a class="vt-callb" href="' + esc(tel(ph)) + '">📞 Qoʻngʻiroq</a></div>'; }
  function openContact() {
    var sh = D.shop, ph = phones();
    sheet('<h2>Tez aloqa</h2><p class="vt-sub">Savol, buyurtma yoki kafolat boʻyicha — bizga qoʻngʻiroq qiling</p>'
      + (ph.length ? ph.map(function (x, i) { return callRow(x, i ? 'Qoʻshimcha raqam' : 'Asosiy raqam'); }).join('') : '<div class="vt-empty"><b>Raqam hali kiritilmagan</b></div>')
      + '<div class="vt-line" style="margin-top:10px">' + (sh.tg ? '<a class="vt-sec" href="https://t.me/' + esc(sh.tg) + '" target="_blank" rel="noopener">✈️ Telegram</a>' : '')
      + (sh.wa ? '<a class="vt-sec" href="https://wa.me/' + esc(sh.wa.replace(/\D/g, '')) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '') + '</div>');
  }
  // v25.6.10: DO'KON — olib ketish joylari (do'kon va filiallar): manzil, xarita, 2 ta raqam
  function mapUrl(x) { return x.lat != null && x.lng != null ? 'https://maps.google.com/?q=' + x.lat + ',' + x.lng : (x.address ? 'https://maps.google.com/?q=' + encodeURIComponent(x.address) : ''); }
  function openStore() {
    var sh = D.shop, pts = (D.points && D.points.length ? D.points : [{ main: true, name: sh.name, address: sh.address, phone: sh.phone, phone2: sh.phone2, lat: sh.lat, lng: sh.lng }]);
    sheet('<h2>' + esc(sh.name) + '</h2><p class="vt-sub">' + esc(sh.about || 'Arra tigʻlari, frezalar va asboblar.') + '</p>'
      + pts.map(function (x) { var m = mapUrl(x), ph = [x.phone, x.phone2].filter(function (v, i, a) { return v && a.indexOf(v) === i; });
        return '<div class="vt-pt"><div class="vt-pth"><b>' + esc(x.name) + '</b>' + (x.main ? '<span class="vt-badge">Asosiy</span>' : '<span class="vt-badge g">Filial</span>') + '</div>'
          + (x.address ? '<p>📍 ' + esc(x.address) + (m ? ' · <a href="' + esc(m) + '" target="_blank" rel="noopener">Xaritada</a>' : '') + '</p>' : '')
          + ph.map(function (v, i) { return callRow(v, i ? 'Qoʻshimcha raqam' : 'Telefon'); }).join('') + '</div>'; }).join(''));
  }
  function navUi() { var n = cartCount(), b = $('vt-navc'); if (b) { b.textContent = n; b.hidden = !n; } }

  function recent() {
    var r = RECENT.map(function (id) { return BYID[id]; }).filter(Boolean).slice(0, 8);
    $('vt-recentw').hidden = r.length < 2;
    $('vt-recent').innerHTML = r.map(card).join('');
  }
  function footer() {
    var sh = D.shop, map = sh.lat != null && sh.lng != null ? 'https://maps.google.com/?q=' + sh.lat + ',' + sh.lng : (sh.address ? 'https://maps.google.com/?q=' + encodeURIComponent(sh.address) : '');
    $('vt-ft').innerHTML = '<div><b>' + esc(sh.name) + '</b>' + esc(sh.about || 'Arra tigʻlari, frezalar va asboblar.') + '</div>'
      + (sh.address ? '<div><b>Manzil</b>' + esc(sh.address) + (map ? '<br><a href="' + esc(map) + '" target="_blank" rel="noopener">Xaritada ochish</a>' : '') + '</div>' : '')
      + '<div><b>Aloqa</b>' + phones().map(function (x) { return '<a href="' + esc(tel(x)) + '">' + esc(x) + '</a><br>'; }).join('')
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
    if (d.cinc) { keepForm(); setQty(d.cinc, (CART[d.cinc] || 0) + 1); return openCart(); }
    if (d.cdec) { keepForm(); setQty(d.cdec, (CART[d.cdec] || 0) - 1); return openCart(); }
    if (d.dlv) { keepForm(); CHK.delivery = d.dlv; lsSet(key('chk'), CHK); return openCart(); }
    if (d.pq) { var el = $('vt-pq'), id = (location.hash.match(/#p=([\w-]+)/) || [])[1], mx = BYID[id] ? BYID[id].stock : 99; el.textContent = Math.max(1, Math.min(mx, +el.textContent + +d.pq)); return; }
    if (d.addp) { setQty(d.addp, +$('vt-pq').textContent, 'add'); toast('Savatga qoʻshildi'); return closeSheet(); }
    if (d.img != null && d.img !== undefined && t.closest('.vt-thumbs')) { var p = BYID[(location.hash.match(/#p=([\w-]+)/) || [])[1]]; if (p) { $('vt-bigimg').innerHTML = '<img src="' + esc(p.img[+d.img]) + '" alt="">'; [].forEach.call(t.parentNode.children, function (b) { b.classList.toggle('on', b === t); }); } return; }
    if (d.share) { var u = location.origin + location.pathname + location.search + '#p=' + d.share, nm = BYID[d.share] ? BYID[d.share].name : '';
      if (navigator.share) navigator.share({ title: nm, url: u }).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { toast('Havola nusxalandi'); }); return; }
    if (d.orders) return openOrders();
    if (d.perk === 'contact' || d.nav === 'contact') return openContact();
    if (d.nav === 'store') return openStore();
    if (d.nav === 'cart') return openCart();
    if (d.nav === 'home') { if (!$('vt-ov').hidden) closeSheet(); return window.vtHome(); }
    if (d.nav === 'cats' || d.perk === 'warranty') { if (!$('vt-ov').hidden) closeSheet(); var cw = $(d.nav === 'cats' && !$('vt-catsw').hidden ? 'vt-catsw' : 'vt-grid'); cw.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (d.catc != null) { ST.fav = false; ST.cat = ST.cat === d.catc ? '' : d.catc; chips(); render(); $('vt-grid').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (d.reset) return window.vtHome();
    if (d.go) { if (d.go === 'cart') return openCart(); var el2 = $(d.go === 'finder' ? 'vt-finder' : 'vt-grid'); if (el2 && !el2.hidden) el2.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('vt-dots')) { show([].indexOf.call(t.parentNode.children, t)); clearInterval(SLT); return; }
    if (d.k) { ST[d.k] = d.v; finderUi(); render(); return; }
    if (t.classList.contains('vt-chip')) { ST.fav = d.fav === '1'; ST.cat = ST.fav ? '' : (d.cat || ''); chips(); render(); return; }
  });
  document.addEventListener('submit', function (e) { if (e.target.id === 'vt-form') { e.preventDefault(); submit(e.target); } });
  document.addEventListener('input', function (e) {
    if (e.target.name === 'phone' && e.target.closest('#vt-form')) { var c = e.target.value.length; e.target.value = fmtPhone(e.target.value); if (c < 5 && e.target.value === '+998') e.target.value = '+998 '; }
    // ikkinchi raqam — ixtiyoriy: hammasi o'chirilsa bo'sh qoladi
    if (e.target.name === 'phone2' && e.target.closest('#vt-form')) { var dg = e.target.value.replace(/\D/g, '').replace(/^998/, ''); e.target.value = dg ? fmtPhone(dg) : ''; }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('vt-ov').hidden) closeSheet(); });
  var QT = null;
  $('vt-q').addEventListener('input', function () { clearTimeout(QT); var v = this.value; QT = setTimeout(function () { ST.q = v; render(); }, 160); });
  $('vt-sort').addEventListener('change', function () { ST.sort = this.value; render(); });
  $('vt-brand').addEventListener('change', function () { ST.br = this.value; render(); });
  $('vt-cartb').addEventListener('click', openCart);
  $('vt-cbgo').addEventListener('click', openCart);
  $('vt-favb').addEventListener('click', function () { ST.fav = !ST.fav; ST.cat = ''; chips(); render(); $('vt-grid').scrollIntoView({ behavior: 'smooth' }); });
  $('vt-ordb').addEventListener('click', openOrders);
  $('vt-callb').addEventListener('click', function () { if (D) openContact(); });
  window.addEventListener('online', function () { if (!D) load(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) clearInterval(SLT); else if (D && $('vt-hero').querySelectorAll('.vt-slide').length > 1) { clearInterval(SLT); SLT = setInterval(function () { show(SLIDE + 1); }, 5500); } });
  load();
})();
