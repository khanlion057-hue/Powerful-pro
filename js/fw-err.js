// v25.2 — BRAUZER XATOLARINI KUZATISH: sahifada kutilmagan xato bo'lsa, serverga (client-error) qisqa xabar yuboriladi,
// egasi Telegram'da biladi. Shaxsiy ma'lumot yuborilmaydi: faqat xato matni, fayl:qator, sahifa nomi va versiya.
// Bitta sahifa ochilishida ko'pi bilan 5 ta xabar; lokal (localhost/127.0.0.1/file:) — yuborilmaydi.
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  var h = location.hostname;
  if (location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '') return;
  var sent = 0, seen = {};
  var page = (location.pathname.split('/').pop() || 'index.html') + (location.hash ? location.hash.split('?')[0].slice(0, 20) : '');
  function send(msg, src, line, col, stack) {
    try {
      msg = String(msg || '').slice(0, 300);
      if (!msg || sent >= 5) return;
      var k = msg + '|' + src + '|' + line; if (seen[k]) return; seen[k] = 1; sent++;
      var ver = (typeof FW_RELEASE !== 'undefined' && FW_RELEASE) || (window.FW_RELEASE || '');
      var body = JSON.stringify({ msg: msg, src: String(src || '').slice(0, 160), line: line || 0, col: col || 0,
        stack: String(stack || '').slice(0, 300), page: page, ver: String(ver).slice(0, 12) });
      var url = '/.netlify/functions/client-error';
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) return;
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (_) {}
  }
  window.addEventListener('error', function (e) {
    if (!e || (e.target && e.target !== window && !e.error)) return;   // rasm/skript yuklanmadi — tarmoq, xato emas
    send(e.message || (e.error && e.error.message), e.filename, e.lineno, e.colno, e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason; if (!r) return;
    send('Promise: ' + (r.message || String(r)), '', 0, 0, r.stack);
  });
})();
