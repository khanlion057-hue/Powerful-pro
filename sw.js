/* POWERFUL — Service Worker (v25: oflayn ishlash)
   • Sahifa va o'z fayllarimiz (html/js/css/rasm) — avval tarmoq (yangi versiya darhol keladi), tarmoq 4 soniyada
     javob bermasa yoki internet yo'q bo'lsa — keshdan (ilova oflayn ochiladi va sekin internetda kutib qolmaydi).
   • CDN kutubxonalari (versiyasi qat'iy, SRI bilan) va shriftlar — keshdan darhol (tez ochilish); yo'q bo'lsa tarmoqdan.
   • Server funksiyalari (/.netlify/functions), Supabase va boshqa so'rovlar — HECH QACHON keshlanmaydi (pul va qoldiq
     ma'lumoti faqat serverdan; oflayn savdolar ilovaning o'z navbatida turadi va internet qaytganda yuboriladi). */
const CACHE = 'powerful-v25-27';
const SHELL = [
  './', './index.html', './sotuvchi.html', './diller.html', './dokon.html', './manifest.json',
  './css/style.css', './css/design-system.css', './css/vitrina.css',
  './js/config.js', './js/brand.js', './js/fw-err.js', './js/fw-particle-loader.js', './js/fw-boot-loader.js', './js/fw-round.js', './js/shared.js', './js/pos.js', './js/main.js', './js/sotuvchi.js', './js/diller.js',
  './js/firma-kassa.js', './js/dokon.js', './js/ai-reklama-shablonlar.js', './js/ai-reklama.js', './js/writeoff.js', './js/dealer-pay.js', './js/notifications.js', './js/zaklad.js', './js/shell.js', './js/vitrina.js',
  './assets/brand-logo.png', './assets/brand-logo.webp', './assets/logo.png', './assets/logo-92.webp', './assets/logo-184.webp', './assets/logo-276.webp', './assets/brand-logo-dark.png', './assets/brand-mark.png', './assets/chek/pg-mark.png', './assets/chek/pg-mark-bw.png', './assets/chek/banner-top.jpg', './assets/chek/banner-bottom.jpg', './assets/saw-blade.svg', './assets/tile-pattern.svg', './icon-192.png', './icon-180.png',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const NET_TIMEOUT_MS = 4000;
const NAV_TIMEOUT_MS = 1500;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Har bir fayl alohida — bittasi topilmasa ham qolganlari keshga tushadi.
  // v25.9: xeshli fayllar (./h/…) o'zgarmaydi — eski keshda bo'lsa o'shandan olinadi (qayta yuklanmaydi). Sekin internetda
  // yangi versiya bir necha soniyada o'rnatiladi; avval hammasi qayta yuklangani uchun ilova yopilsa o'rnatish uzilib, telefon
  // eski versiyada qolib ketardi.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => {
    const hashed = u.indexOf('./h/') === 0;
    return (hashed ? caches.match(u) : Promise.resolve(null))
      .then(hit => (hit ? c.put(u, hit) : c.add(new Request(u, { cache: hashed ? 'default' : 'reload' }))))
      .catch(() => {});
  }))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function putCache(req, res) {
  if (!res || !(res.ok || res.type === 'opaque')) return;
  const copy = res.clone();
  caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
}

// Avval tarmoq; NET_TIMEOUT_MS ichida javob bo'lmasa yoki xato bo'lsa — kesh (keshda ham yo'q bo'lsa tarmoqni kutadi)
function networkFirst(req, fallbackHtml, waitMs) {
  return caches.open(CACHE).then(cache => new Promise((resolve) => {
    let done = false;
    const fromCache = () => cache.match(req, { ignoreSearch: true }).then(r => r || (fallbackHtml ? cache.match(fallbackHtml) : null));
    const net = fetch(req).then(res => { putCache(req, res); return res; });
    const timer = setTimeout(() => {
      fromCache().then(r => { if (r && !done) { done = true; resolve(r); } });
    }, waitMs || NET_TIMEOUT_MS);
    net.then(res => { clearTimeout(timer); if (!done) { done = true; resolve(res); } })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then(r => { if (!done) { done = true; resolve(r || Response.error()); } });
      });
  }));
}

// v25.9: sahifa (navigatsiya) — networkFirst bilan bir xil, lekin keshdagi sahifa berilgan bo'lsa tarmoq javobi fonda kutiladi
// (e.waitUntil — SW o'chib qolmaydi): keshga yoziladi va sahifa versiyasi o'zgargan bo'lsa ochiq oynaga «yangi versiya» xabari.
function pageFirst(e, req, fallbackHtml) {
  const wait = caches.open(CACHE).then(cache => new Promise((resolve) => {
    let done = false, fromCacheText = null;
    const fromCache = () => cache.match(req, { ignoreSearch: true }).then(r => r || cache.match(fallbackHtml));
    const net = fetch(req);
    const timer = setTimeout(() => {
      fromCache().then(r => { if (r && !done) { done = true; resolve(r); r.clone().text().then(t => { fromCacheText = t; }).catch(() => {}); } });
    }, NAV_TIMEOUT_MS);
    const bg = net.then(res => {
      clearTimeout(timer);
      if (!done) { done = true; putCache(req, res); resolve(res); return null; }
      if (!res || !res.ok) return null;
      return res.clone().text().then(t => {
        putCache(req, res);
        const ver = (x) => { const m = /js\.main\.([0-9a-f]+)\.js/.exec(x || ''); return m ? m[1] : x; };
        if (fromCacheText !== null && ver(t) !== ver(fromCacheText)) {
          return self.clients.matchAll({ type: 'window' }).then(cs => cs.forEach(c => c.postMessage({ type: 'FW_NEW_VERSION' })));
        }
        return null;
      });
    }).catch(() => {
      clearTimeout(timer);
      return fromCache().then(r => { if (!done) { done = true; resolve(r || Response.error()); } });
    });
    e.waitUntil(bg.catch(() => {}));
  }));
  return wait;
}

// Avval kesh (versiyali CDN fayllari o'zgarmaydi)
function cacheFirst(req) {
  return caches.match(req).then(r => r || fetch(req).then(res => { putCache(req, res); return res; }));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (CDN_HOSTS.includes(url.hostname)) { e.respondWith(cacheFirst(req)); return; }
  if (url.origin !== location.origin) return;                         // Supabase va boshqalar — to'g'ridan-to'g'ri
  if (url.pathname.startsWith('/.netlify/')) return;                  // server funksiyalari — hech qachon keshlanmaydi
  // v25.3: xeshli nusxalar (build → /h/) — nomi mazmunga bog'liq, hech qachon o'zgarmaydi: avval kesh (tarmoq kutilmaydi)
  if (url.pathname.startsWith('/h/')) { e.respondWith(cacheFirst(req)); return; }
  const isPage = req.mode === 'navigate';
  const page = /\/sotuvchi(\.html)?$/.test(url.pathname) ? './sotuvchi.html' : /\/diller(\.html)?$/.test(url.pathname) ? './diller.html' : /\/dokon(\.html)?$/.test(url.pathname) ? './dokon.html' : './index.html';
  // v25.3: sahifa — tarmoq 1,5 soniyada javob bermasa keshdagisi ochiladi (sekin internetda ilova tez ochiladi; yangisi fonda keshga tushadi)
  e.respondWith(isPage ? pageFirst(e, req, page) : networkFirst(req, null, 0));
});
