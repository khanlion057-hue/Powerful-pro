// P132 — v25.6.10 (egasi: «kirishda barmoq izi so'rash mayli, faqat yuklash oynasi chiqib jonga tegadi»):
//  • Qurilmada nusxa bor — «Yuklanmoqda» oynasi CHIQMAYDI, panel darhol ko'rinadi; bulut javobi kelguncha amallar yopiq
//    (shaffof qatlam + «Yangilanmoqda…»), kelgach yangi ma'lumot bilan qayta chiziladi va qatlam yo'qoladi.
//  • Eslab qolingan foydalanuvchi, barmoq izi yoqilgan — ilova ochilganda barmoq izi so'raladi; tasdiq — kiradi, rad — login.
const assert = require('node:assert/strict');
const { openPage, BP_DATA } = require('./p4-responsive.test.js')._helpers;

async function fastOpen() {
  const { browser, page, errors } = await openPage('index.html', { width: 1280, height: 800, admin: true, loggedIn: true });
  try {
    const cloud = JSON.parse(JSON.stringify(BP_DATA));
    cloud.products[0].name = 'BULUTDAN-YANGI';
    await page.route('**/.netlify/functions/app-data-load', async (route) => {
      await new Promise((r) => setTimeout(r, 1800));
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: cloud }) });
    });
    await page.reload(); await page.waitForTimeout(700);
    const a = await page.evaluate(() => ({
      loader: getComputedStyle(document.getElementById('bp-loading')).display,
      main: getComputedStyle(document.getElementById('main-content-area')).display,
      busy: !!document.getElementById('fw-boot-busy'), name: S.products[0] && S.products[0].name, page: S.page,
    }));
    assert.equal(a.loader, 'none', 'yuklash oynasi chiqmadi');
    assert.notEqual(a.main, 'none', 'panel darhol ko\'rindi');
    assert.equal(a.busy, true, 'bulut kelguncha amallar yopiq');
    assert.notEqual(a.name, 'BULUTDAN-YANGI', 'hozircha qurilmadagi nusxa');
    // yopiq qatlam bosishni o'tkazmaydi
    const blocked = await page.evaluate(() => { let hit = false; const b = document.querySelector('.sidebar a, .sidebar button, nav button'); if (b) b.addEventListener('click', () => { hit = true; }, { once: true });
      const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return el && el.id === 'fw-boot-busy'; });
    assert.equal(blocked, true, 'ekran markazi — yopiq qatlam');
    await page.waitForTimeout(2200);
    const b = await page.evaluate(() => ({ busy: !!document.getElementById('fw-boot-busy'), name: S.products[0].name,
      html: document.getElementById('main-content-area').innerHTML.length }));
    assert.equal(b.busy, false, 'bulut keldi — qatlam yo\'qoldi');
    assert.equal(b.name, 'BULUTDAN-YANGI', 'bulutdagi yangi ma\'lumot qo\'llandi');
    assert.ok(b.html > 1000, 'sahifa qayta chizildi');
    assert.deepEqual(errors.filter((e) => !/supabase|createClient/i.test(e)), []);
  } finally { await browser.close(); }
}

async function bioOnOpen() {
  const { browser, page } = await openPage('index.html', { width: 390, height: 844, mobile: true, loggedIn: true });
  try {
    const open = async (answer) => {
      await page.evaluate(({ answer, data }) => {
        sessionStorage.clear();
        localStorage.setItem('bp_data', JSON.stringify(data));
        localStorage.setItem('fw_remember_v1', JSON.stringify({ info: { dest: 'admin', branch: 'baza', uid: 'u1', name: 'Egasi' }, uid: 'u1', t: Date.now() }));
        localStorage.setItem('fw_quick_v1', JSON.stringify({ bioOnly: true, bio: true, uid: 'u1', info: { dest: 'admin', branch: 'baza', uid: 'u1', name: 'Egasi' }, fails: 0, t: Date.now() }));
        localStorage.setItem('fw_test_bio', answer ? '1' : '0');
      }, { answer, data: BP_DATA });
      await page.reload(); await page.waitForTimeout(2500);
      return page.evaluate(() => ({ auth: sessionStorage.getItem('bp_auth_ok'), login: !!document.getElementById('ul-login'), calls: window.__bioCalls || 0 }));
    };
    await page.addInitScript(() => { window.__bioCalls = 0; window.FwBio = { available: () => true, authenticate: (cb) => { window.__bioCalls++; setTimeout(() => window[cb](localStorage.getItem('fw_test_bio') === '1'), 30); } }; });
    const ok = await open(true);
    assert.equal(ok.calls, 1, 'ochilganda barmoq izi so\'raldi'); assert.equal(ok.auth, '1', 'tasdiq — ichkarida');
    const no = await open(false);
    assert.ok(no.calls >= 1); assert.equal(no.auth, null, 'rad — ichkariga kirmadi');
  } finally { await browser.close(); }
}

module.exports = { name: 'P132 — Tez ochilish (yuklash oynasisiz) va ochilishda barmoq izi', cases: [
  { name: "qurilmada nusxa — yuklash oynasi yoʻq, panel darhol; bulut kelguncha amallar yopiq; kelgach yangilanadi", run: fastOpen },
  { name: 'barmoq izi yoqilgan — ilova ochilganda soʻraladi; tasdiq — kiradi, rad — kirmaydi', run: bioOnOpen },
] };
