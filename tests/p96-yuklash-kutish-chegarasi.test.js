// P96 — v25.6: kirishdan keyingi app-data-load: kutish chegarasi + bitta qayta urinish (osilib qolmasin), sekin bo'lsa xabar.
// Ma'lumotga tegilmaydi: faqat so'rov o'ralgan; muvaffaqiyatli javob avvalgidek qaytadi, xato — tarmoq xatosi (TypeError) sifatida,
// shunda mavjud zaxira yo'llari (qurilmadagi nusxa / eski o'qish) o'zgarishsiz ishlaydi.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

async function withApp(fn) {
  const { browser, page, consoleErrors } = await loadApp({});
  try { await fn(page); assert.deepEqual(consoleErrors, [], "sahifada JS xatosi yo'q"); } finally { await browser.close(); }
}
// soxta authFetch: AbortSignal ni hurmat qiladi
const STUB = () => {
  window.__n = 0; window.__sig = 0; window.__toasts = [];
  toast = (m) => { __toasts.push(String(m)); };
  window.__mode = (modes) => { window.__modes = modes; window.__n = 0; };
  authFetch = (url, o = {}) => new Promise((resolve, reject) => {
    const mode = __modes[Math.min(__n++, __modes.length - 1)]; if (o.signal) __sig++;
    if (mode === 'ok') return resolve({ ok: true, status: 200, json: async () => ({ data: { settings: {} }, version: 1 }) });
    if (mode === 'offline') return reject(new TypeError('Failed to fetch'));
    if (o.signal) o.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));   // 'hang'
  });
};

async function testRetryAfterTimeout() {
  await withApp(async (page) => {
    await page.evaluate(STUB);
    const r = await page.evaluate(async () => {
      __mode(['hang', 'ok']); const t0 = performance.now();
      const res = await fwLoadAppData({ timeouts: [80, 400], slowMs: 10000 });
      return { ok: res.ok, n: __n, sig: __sig, ms: Math.round(performance.now() - t0) };
    });
    assert.equal(r.ok, true, '1-urinish osilib qoldi → 2-urinish muvaffaqiyatli'); assert.equal(r.n, 2); assert.equal(r.sig, 2, 'har urinishda AbortSignal bor');
    assert.ok(r.ms >= 70 && r.ms < 1500, 'birinchi urinish chegarada uzildi: ' + r.ms);
  });
}
async function testBothHang() {
  await withApp(async (page) => {
    await page.evaluate(STUB);
    const r = await page.evaluate(async () => {
      __mode(['hang']); let err = null; const t0 = performance.now();
      try { await fwLoadAppData({ timeouts: [60, 60], slowMs: 10000 }); } catch (e) { err = { name: e.name, msg: e.message, net: fwIsNetErr(e) }; }
      return { err, n: __n, ms: Math.round(performance.now() - t0) };
    });
    assert.equal(r.n, 2, "faqat 2 urinish (cheksiz emas)"); assert.ok(r.err, 'ikkalasi ham osilsa — xato');
    assert.equal(r.err.net, true, "xato tarmoq xatosi sifatida tan olinadi (mavjud zaxira yo'llari ishlaydi)");
    assert.ok(r.ms < 1500);
  });
}
async function testOfflineAndOk() {
  await withApp(async (page) => {
    await page.evaluate(STUB);
    const r = await page.evaluate(async () => {
      __mode(['ok']); const a = await fwLoadAppData({ timeouts: [500, 500] }); const na = __n;
      __mode(['offline', 'ok']); const b = await fwLoadAppData({ timeouts: [500, 500] }); const nb = __n;
      __mode(['offline']); let e3 = null; try { await fwLoadAppData({ timeouts: [500, 500] }); } catch (e) { e3 = e.name; }
      return { a: a.ok, na, b: b.ok, nb, e3, n3: __n };
    });
    assert.deepEqual(r, { a: true, na: 1, b: true, nb: 2, e3: 'TypeError', n3: 2 }, "muvaffaqiyat — 1 so'rov; tarmoq xatosida bir marta qayta urinadi; ikkalasi xato — TypeError");
  });
}
async function testSlowHint() {
  await withApp(async (page) => {
    await page.evaluate(STUB);
    const r = await page.evaluate(async () => {
      __mode(['hang', 'ok']);
      await fwLoadAppData({ timeouts: [150, 400], slowMs: 50 });
      const slow = __toasts.slice(); __toasts.length = 0;
      __mode(['ok']); await fwLoadAppData({ timeouts: [150, 400], slowMs: 50 });
      return { slow, fast: __toasts.slice() };
    });
    assert.equal(r.slow.length, 1); assert.match(r.slow[0], /sekin/i);
    assert.deepEqual(r.fast, [], "tez javobda xabar yo'q");
  });
}
async function testWired() {
  const fs = require('fs'), path = require('path');
  const m = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8'), s = fs.readFileSync(path.join(__dirname, '..', 'js', 'sotuvchi.js'), 'utf8');
  assert.match(m, /async function _cloudLoad\(\)[\s\S]*?fwLoadAppData\(\)/, 'admin yuklashi o\'ralgan');
  assert.match(s, /if \(!loaded\) try \{\s*const res = await fwLoadAppData\(\)/, 'sotuvchi yuklashi o\'ralgan');
}
module.exports = { name: "P96 — kirishdan keyingi ma'lumot yuklash: kutish chegarasi va qayta urinish (v25.6)", cases: [
  { name: "1-urinish osilib qolsa — chegarada uziladi va qayta uriniladi", run: testRetryAfterTimeout },
  { name: "ikkalasi ham osilsa — cheksiz emas: tarmoq xatosi (TypeError) bilan tugaydi", run: testBothHang },
  { name: "muvaffaqiyat — 1 so'rov; tarmoq xatosida bir marta qayta urinadi", run: testOfflineAndOk },
  { name: "sekin bo'lsa — foydalanuvchiga bir marta xabar; tez bo'lsa — yo'q", run: testSlowHint },
  { name: "admin va sotuvchi yuklashi shu yordamchidan foydalanadi", run: testWired },
] };
