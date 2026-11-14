// P90 — v25.3 (egasi: «APK sekin, qayta kirsa yana kod so'raydi va qayta yuklaydi»):
//  • Oxirgi faollik qurilmada (localStorage) — Android ilovani yopib yuborsa ham saqlanadi: 5 daqiqa ichida qayta ochilsa
//    PIN SO'RALMAYDI; 5 daqiqadan keyin — PIN (xavfsizlik avvalgidek).
//  • Admin: PIN/qayta kirishdan keyin sahifa QAYTA YUKLANMAYDI (avval location.reload — ikki marta yuklanardi).
//  • Boshqa foydalanuvchi sessiyasi — PINsiz kirish yo'q; chiqishda faollik belgisi ham o'chadi.
//  • Xodim ruxsatlari ma'lumot bilan parallel so'raladi; service worker: /h/ — keshdan, sahifa — 1,5 s kutish.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { openPage, BP_DATA } = require('./p4-responsive.test.js')._helpers;
const ROOT = path.join(__dirname, '..');

// Kirish oynasidagi sahifaga tez kirish yozuvi va oxirgi faollikni qo'yib, «ilovani qayta ochish» (sessiya xotirasisiz)
async function reopen(page, { agoMs, uid = null, dest = 'admin' }) {
  await page.evaluate(({ agoMs, uid, dest, data }) => {
    sessionStorage.clear();
    localStorage.setItem('bp_data', JSON.stringify(data));
    localStorage.setItem('bp_cur', JSON.stringify({ usdUzs: 12650, usdCny: 7.1, lastRateDate: new Date().toISOString().slice(0, 10) }));
    localStorage.setItem('fw_quick_v1', JSON.stringify({ salt: 'c2FsdA==', hash: 'x', uid, info: { dest, branch: 'baza', uid, name: 'Egasi' }, fails: 0, t: Date.now() }));
    localStorage.setItem('fw_last_active', String(Date.now() - agoMs));
    // yopilishda ilova o'zi «hozir» deb yozadi (to'g'ri xulq) — sinov uchun undan keyin kerakli vaqt qaytariladi
    const back = () => localStorage.setItem('fw_last_active', String(Date.now() - agoMs));
    window.addEventListener('pagehide', back); document.addEventListener('visibilitychange', back); window.addEventListener('unload', back);
  }, { agoMs, uid, dest, data: BP_DATA });
  // haqiqiy sahifa yuklanishlari (manzildagi #bo'lim o'zgarishi hisoblanmaydi)
  let navs = 0; const onNav = () => { navs++; };
  page.on('domcontentloaded', onNav);
  await page.reload(); await page.waitForTimeout(2200);
  page.off('domcontentloaded', onNav);
  const st = await page.evaluate(() => ({
    pin: !!document.getElementById('fw-pin-ov'), login: !!document.getElementById('ul-login'),
    auth: sessionStorage.getItem('bp_auth_ok'), app: !!document.querySelector('.app-layout') && getComputedStyle(document.getElementById('main-content-area')).display !== 'none',
  }));
  return { ...st, navs };
}

async function testRecentNoPin() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, loggedIn: true });
  try {
    // 1) 1 daqiqa oldin ishlagan — PIN yo'q, ilova darhol, bitta yuklanish
    const a = await reopen(page, { agoMs: 60e3 });
    assert.equal(a.pin, false, '5 daqiqa ichida — PIN soʻralmaydi'); assert.equal(a.login, false);
    assert.equal(a.auth, '1'); assert.equal(a.app, true, 'panel ochildi');
    assert.equal(a.navs, 1, 'sahifa qayta yuklanmadi (faqat ochilishning oʻzi)');
    // 2) 10 daqiqa oldin — PIN so'raladi
    const b = await reopen(page, { agoMs: 10 * 60e3 });
    assert.equal(b.pin, true, '5 daqiqadan keyin — PIN'); assert.equal(b.auth, null);
    // 3) Boshqa foydalanuvchining yozuvi (sessiya u1, yozuv u-boshqa) — PINsiz kirish yo'q
    const c = await reopen(page, { agoMs: 60e3, uid: 'u-boshqa' });
    assert.equal(c.auth, null, 'boshqa foydalanuvchi — PINsiz kirmaydi');
    // 4) Kelajakdagi vaqt (soat buzilgan / soxta) — yaqinda deb hisoblanmaydi
    const d = await reopen(page, { agoMs: -60e3 });
    assert.equal(d.pin, true, 'kelajakdagi vaqt — PIN');
    assert.deepEqual(errors.filter((e) => !/supabase|createClient/i.test(e)), []);
  } finally { await browser.close(); }
}

async function testCodeGuards() {
  const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const shared = fs.readFileSync(path.join(ROOT, 'js', 'shared.js'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  // Chiqishda faollik belgisi o'chadi
  assert.match(shared, /localStorage\.removeItem\('fw_quick_v1'\); localStorage\.removeItem\('fw_last_active'\);/);
  // Login/PIN oynasida faollik yozilmaydi (begona odam ekranni ochiq qoldirib vaqtni uzaytira olmaydi)
  assert.match(shared, /function fwTouchActive\(\) \{ try \{ if \(fwQuickGet\(\) && !_fwOnLoginScreen\(\)\)/);
  // Admin — joyida davom etadi (qayta yuklanmaydi); sotuvchi — o'z sahifasiga
  assert.match(main, /fwEnterWithInfo\(info, true\) !== 'here'/);
  assert.match(main, /if \(inPlace\) return 'here';/);
  // Ruxsatlar parallel
  assert.ok(main.indexOf('const _permPre') < main.indexOf('await initData();'), 'ruxsatlar soʻrovi maʼlumotdan oldin boshlanadi');
  // Service worker: /h/ — keshdan, sahifa — 1,5 s
  assert.match(sw, /url\.pathname\.startsWith\('\/h\/'\)\) \{ e\.respondWith\(cacheFirst\(req\)\)/);
  assert.match(sw, /const NAV_TIMEOUT_MS = 1500;/);
  // health — mintaqa ko'rinadi
  assert.match(fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'health.js'), 'utf8'), /region: process\.env\.AWS_REGION/);
}

module.exports = {
  name: 'P90 — tez qayta kirish: 5 daqiqa ichida PINsiz, qayta yuklanmaydi',
  cases: [
    { name: "Qayta ochish: 1 daqiqa — PINsiz, bitta yuklanish; 10 daqiqa — PIN; boshqa foydalanuvchi — yo'q; kelajak vaqti — PIN", run: testRecentNoPin },
    { name: 'Himoyalar: chiqishda o\'chadi, login oynasida yozilmaydi; ruxsatlar parallel; SW /h/ keshdan, sahifa 1,5 s; health — mintaqa', run: testCodeGuards },
  ],
};
