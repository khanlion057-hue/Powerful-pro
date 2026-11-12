/* POWERFUL — Service Worker (v25: oflayn ishlash)
   • Sahifa va o'z fayllarimiz (html/js/css/rasm) — avval tarmoq (yangi versiya darhol keladi), tarmoq 4 soniyada
     javob bermasa yoki internet yo'q bo'lsa — keshdan (ilova oflayn ochiladi va sekin internetda kutib qolmaydi).
   • CDN kutubxonalari (versiyasi qat'iy, SRI bilan) va shriftlar — keshdan darhol (tez ochilish); yo'q bo'lsa tarmoqdan.
   • Server funksiyalari (/.netlify/functions), Supabase va boshqa so'rovlar — HECH QACHON keshlanmaydi (pul va qoldiq
     ma'lumoti faqat serverdan; oflayn savdolar ilovaning o'z navbatida turadi va internet qaytganda yuboriladi). */
const CACHE = 'powerful-v25-12';
const SHELL = [
  './', './index.html', './sotuvchi.html', './diller.html', './manifest.json',
  './css/style.css', './css/design-system.css',
  './js/config.js', './js/brand.js', './js/fw-saw-loader.js', './js/fw-round.js', './js/shared.js', './js/pos.js', './js/main.js', './js/sotuvchi.js', './js/diller.js',
  './js/firma-kassa.js', './js/dokon.js', './js/writeoff.js', './js/dealer-pay.js', './js/notifications.js', './js/zaklad.js', './js/shell.js',
  './assets/brand-logo.png', './assets/brand-logo-dark.png', './assets/brand-mark.png', './assets/chek/pg-mark.png', './assets/chek/pg-mark-bw.png', './assets/chek/banner-top.jpg', './assets/chek/banner-bottom.jpg', './assets/saw-blade.svg', './assets/tile-pattern.svg', './icon-192.png', './icon-180.png',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const NET_TIMEOUT_MS = 4000;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Har bir fayl alohida — bittasi topilmasa ham qolganlari keshga tushadi
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
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
function networkFirst(req, fallbackHtml) {
  return caches.open(CACHE).then(cache => new Promise((resolve) => {
    let done = false;
    const fromCache = () => cache.match(req, { ignoreSearch: true }).then(r => r || (fallbackHtml ? cache.match(fallbackHtml) : null));
    const net = fetch(req).then(res => { putCache(req, res); return res; });
    const timer = setTimeout(() => {
      fromCache().then(r => { if (r && !done) { done = true; resolve(r); } });
    }, NET_TIMEOUT_MS);
    net.then(res => { clearTimeout(timer); if (!done) { done = true; resolve(res); } })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then(r => { if (!done) { done = true; resolve(r || Response.error()); } });
      });
  }));
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
  const isPage = req.mode === 'navigate';
  const page = /\/sotuvchi(\.html)?$/.test(url.pathname) ? './sotuvchi.html' : /\/diller(\.html)?$/.test(url.pathname) ? './diller.html' : './index.html';
  e.respondWith(networkFirst(req, isPage ? page : null));
});
