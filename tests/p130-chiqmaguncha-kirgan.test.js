// P130 — v25.6.10 (egasi: «har ekran ochib-yopganda qayta kiryapti; Chiqish bosilmaguncha qayta yuklab kirmasin»):
//  • Kirgan foydalanuvchi qurilmada eslab qolinadi (maxfiy emas: yo'nalish, filial, uid). Ilova qayta ochilganda server
//    sessiyasi shu uid bilan tirik bo'lsa — PIN/parolsiz, bitta yuklanish bilan ichkariga (1 soat, 1 kun keyin ham).
//  • Boshqa foydalanuvchi sessiyasi — eslab qolingani ishlatilmaydi; sessiya yo'q — login oynasi.
//  • Fonda uzoq turib qaytganda (ekran o'chib-yonishi) — PIN so'ralmaydi, sahifa qayta yuklanmaydi.
//  • «Chiqish» — eslab qolish o'chadi, keyingi ochilishda login.
const assert = require('node:assert/strict');
const { openPage, BP_DATA } = require('./p4-responsive.test.js')._helpers;

async function reopen(page, { uid = 'u1', agoMs = 0, remember = true, quick = false }) {
  await page.evaluate(({ uid, agoMs, remember, quick, data }) => {
    sessionStorage.clear();
    localStorage.setItem('bp_data', JSON.stringify(data));
    localStorage.setItem('bp_cur', JSON.stringify({ usdUzs: 12650, usdCny: 7.1, lastRateDate: new Date().toISOString().slice(0, 10) }));
    localStorage.removeItem('fw_remember_v1'); localStorage.removeItem('fw_quick_v1');
    if (remember) localStorage.setItem('fw_remember_v1', JSON.stringify({ info: { dest: 'admin', branch: 'baza', uid, name: 'Egasi' }, uid, t: Date.now() - agoMs }));
    if (quick) localStorage.setItem('fw_quick_v1', JSON.stringify({ salt: 'c2FsdA==', hash: 'x', uid, info: { dest: 'admin', branch: 'baza', uid, name: 'Egasi' }, fails: 0, t: Date.now() }));
    const back = () => localStorage.setItem('fw_last_active', String(Date.now() - agoMs));
    back(); window.addEventListener('pagehide', back); document.addEventListener('visibilitychange', back);
  }, { uid, agoMs, remember, quick, data: BP_DATA });
  let navs = 0; const onNav = () => { navs++; };
  page.on('domcontentloaded', onNav);
  await page.reload(); await page.waitForTimeout(2200);
  page.off('domcontentloaded', onNav);
  const st = await page.evaluate(() => ({
    pin: !!document.getElementById('fw-pin-ov'), login: !!document.getElementById('ul-login'), auth: sessionStorage.getItem('bp_auth_ok'),
    app: !!document.querySelector('.app-layout') && getComputedStyle(document.getElementById('main-content-area')).display !== 'none',
  }));
  return { ...st, navs };
}

async function reopenStaysIn() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, loggedIn: true });
  try {
    for (const agoMs of [10 * 60e3, 26 * 3600e3]) {   // 10 daqiqa va 1 kundan keyin — PIN o'rnatilgan bo'lsa ham
      const r = await reopen(page, { agoMs, quick: true });
      assert.equal(r.pin, false, `PIN so'ralmaydi (${agoMs / 60e3} daq)`); assert.equal(r.login, false);
      assert.equal(r.auth, '1'); assert.equal(r.app, true, 'panel ochildi'); assert.equal(r.navs, 1, 'qayta yuklanmadi');
    }
    const other = await reopen(page, { uid: 'u-boshqa' });
    assert.equal(other.auth, null, 'boshqa foydalanuvchi — eslab qolingani ishlatilmaydi');
    // fonda uzoq turib qaytish — hech narsa so'ralmaydi, sahifa qayta yuklanmaydi
    await reopen(page, {});
    let navs = 0; page.on('domcontentloaded', () => { navs++; });
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'));
      sessionStorage.setItem('fw_hid_at', String(Date.now() - 3 * 3600e3));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => !!document.getElementById('fw-pin-ov')), false, 'qaytganda PIN yo\'q');
    assert.equal(navs, 0, 'qaytganda sahifa qayta yuklanmadi');
    assert.deepEqual(errors.filter((e) => !/supabase|createClient/i.test(e)), []);
  } finally { await browser.close(); }
}

async function noSessionOrLogout() {
  const { browser, page } = await openPage('index.html', { width: 390, height: 844, mobile: true, loggedIn: false });
  try {
    const r = await reopen(page, {});
    assert.equal(r.auth, null); assert.equal(r.login, true, 'server sessiyasi yo\'q — login oynasi');
  } finally { await browser.close(); }
  const b = await openPage('index.html', { width: 390, height: 844, mobile: true, loggedIn: true });
  try {
    await reopen(b.page, {});
    await b.page.evaluate(() => { window.confirm = () => true; window.location.replace = () => {}; appLogout(); });
    await b.page.waitForTimeout(600);
    assert.equal(await b.page.evaluate(() => localStorage.getItem('fw_remember_v1')), null, 'Chiqishda eslab qolish o\'chdi');
  } finally { await b.browser.close(); }
}

async function loginRemembers() {
  const { browser, page } = await openPage('index.html', { width: 390, height: 844, mobile: true });
  try {
    const r = await page.evaluate(async () => {
      localStorage.removeItem('fw_remember_v1');
      await fwOffAuthSave('admin', 'parol123', { dest: 'admin', branch: 'baza', uid: 'u7', name: 'X' });
      const a = JSON.parse(localStorage.getItem('fw_remember_v1') || 'null');
      fwEnterWithInfo({ dest: 'admin', branch: 'f729', uid: 'u8', name: 'Y' }, true);
      const b = JSON.parse(localStorage.getItem('fw_remember_v1') || 'null');
      return { a: a && a.uid, aBranch: a && a.info.branch, b: b && b.info.branch, noPass: !/parol123/.test(localStorage.getItem('fw_remember_v1')) };
    });
    assert.deepEqual(r, { a: 'u7', aBranch: 'baza', b: 'f729', noPass: true });
  } finally { await browser.close(); }
}

module.exports = { name: "P130 — Chiqish bosilmaguncha ichkarida (qayta kirish va qayta yuklash yo'q)", cases: [
  { name: 'qayta ochilganda (10 daqiqa, 1 kun) — PINsiz, bitta yuklanish; boshqa foydalanuvchi — yoʻq; fondan qaytishda — hech narsa', run: reopenStaysIn },
  { name: 'server sessiyasi yoʻq — login; Chiqish — eslab qolish oʻchadi', run: noSessionOrLogout },
  { name: 'parol yoki PIN bilan kirganda eslab qolinadi (parol saqlanmaydi)', run: loginRemembers },
] };
