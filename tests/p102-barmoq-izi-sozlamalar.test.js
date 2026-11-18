// P102 — v25.6.8: BARMOQ IZI. Ilova — TWA (Chrome), unda Android ko'prigi `window.FwBio` yo'q edi → barmoq izi hech qachon taklif qilinmasdi.
// Endi brauzerning o'z imkoniyati: WebAuthn (platforma autentifikatori — qurilmaning barmoq izi / ekran qulfi). Mahalliy qulf (PIN bilan bir xil ishonch darajasi:
// server sessiyasi o'zgarmaydi). Sozlamalarda «Tez kirish» bo'limi: barmoq izini yoqish/o'chirish, PIN o'rnatish/o'chirish.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

async function withApp(fn) {
  const { browser, page, consoleErrors } = await loadApp({});
  try {
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div id="pg-sozlamalar"></div><div id="bs-ov" hidden></div><div id="modal-ov"></div>');
      localStorage.clear(); delete window.FwBio; confirm = () => true;
      window.__wa = { create: 0, get: 0, lastCreate: null, lastGet: null, mode: 'ok' };
      const bytes = (n) => new Uint8Array(n).map((_, i) => i + 1).buffer;
      window.PublicKeyCredential = { isUserVerifyingPlatformAuthenticatorAvailable: async () => true };
      Object.defineProperty(navigator, 'credentials', { configurable: true, value: {
        create: async (o) => { __wa.create++; __wa.lastCreate = o; if (__wa.mode === 'cancel') { const e = new Error('cancel'); e.name = 'NotAllowedError'; throw e; } return { rawId: bytes(16), id: 'AQIDBAUGBwgJCgsMDQ4PEA', type: 'public-key' }; },
        get: async (o) => { __wa.get++; __wa.lastGet = o; if (__wa.mode === 'cancel') { const e = new Error('cancel'); e.name = 'NotAllowedError'; throw e; } return { id: 'x', type: 'public-key' }; } } });
    });
    await fn(page);
    assert.deepEqual(consoleErrors, [], "sahifada JS xatosi yo'q");
  } finally { await browser.close(); }
}

async function testAvail() {
  await withApp(async (page) => {
    const r = await page.evaluate(async () => {
      const before = fwBioAvail();                    // zond hali ishlamagan
      await fwBioProbe(); const probed = fwBioAvail();
      window.__wa.mode = 'ok'; window.PublicKeyCredential = undefined; await fwBioProbe(); const none = fwBioAvail();
      window.FwBio = { available: () => true, authenticate: (cb) => window[cb](true) }; const native = fwBioAvail(); const nativeOk = await fwBioAuth();
      return { before, probed, none, native, nativeOk, wa: { c: __wa.create, g: __wa.get } };
    });
    assert.equal(r.probed, true, 'WebAuthn platforma autentifikatori bor → barmoq izi mavjud');
    assert.equal(r.none, false, "WebAuthn ham, ko'prik ham yo'q → mavjud emas");
    assert.equal(r.native, true); assert.equal(r.nativeOk, true, "Android ko'prigi bo'lsa — u ishlatiladi (avvalgidek)"); assert.deepEqual(r.wa, { c: 0, g: 0 });
  });
}

async function testWebAuthnFlow() {
  await withApp(async (page) => {
    const r = await page.evaluate(async () => {
      await fwBioProbe();
      const first = await fwBioAuth();                                   // 1-marta: ro'yxatdan o'tkazadi (barmoq izi so'raladi)
      const stored = localStorage.getItem('fw_bio_cred'); const cr = __wa.lastCreate && __wa.lastCreate.publicKey;
      const second = await fwBioAuth();                                  // keyin: tasdiqlaydi
      const gt = __wa.lastGet && __wa.lastGet.publicKey;
      __wa.mode = 'cancel'; const cancelled = await fwBioAuth();         // foydalanuvchi bekor qildi
      localStorage.removeItem('fw_bio_cred'); const cancelCreate = await fwBioAuth(); const none = localStorage.getItem('fw_bio_cred');
      return { first, stored, second, cancelled, cancelCreate, none, calls: { c: __wa.create, g: __wa.get },
        cr: cr && { att: cr.authenticatorSelection.authenticatorAttachment, uv: cr.authenticatorSelection.userVerification, rp: cr.rp.id, ch: cr.challenge.byteLength, alg: cr.pubKeyCredParams.map((p) => p.alg) },
        gt: gt && { uv: gt.userVerification, allow: gt.allowCredentials.length, ch: gt.challenge.byteLength } };
    });
    assert.equal(r.first, true); assert.ok(r.stored && r.stored.length > 8, 'credential id saqlandi');
    assert.deepEqual(r.cr, { att: 'platform', uv: 'required', rp: r.cr.rp, ch: 32, alg: [-7, -257] }, 'faqat qurilmaning oʻz barmoq izi/ekran qulfi, majburiy tasdiq');
    assert.equal(r.second, true); assert.deepEqual(r.gt, { uv: 'required', allow: 1, ch: 32 });
    assert.equal(r.cancelled, false, 'bekor qilindi — kirish yoʻq'); assert.equal(r.cancelCreate, false); assert.equal(r.none, null, "bekor qilingan ro'yxatdan o'tish — saqlanmaydi");
  });
}

async function testSettingsSection() {
  await withApp(async (page) => {
    const r = await page.evaluate(async () => {
      await fwBioProbe();
      const none = fwQuickSectionHtml({ canSetPin: true });
      await fwQuickSet('1234', { dest: 'admin', uid: 'u1', name: 'Admin' }, false);
      const pinOnly = fwQuickSectionHtml({});
      await fwQuickAction('bio-on'); const on = fwQuickGet().bio === true && !!localStorage.getItem('fw_bio_cred'); const htmlOn = fwQuickSectionHtml({});
      await fwQuickAction('bio-off'); const off = fwQuickGet().bio === false && localStorage.getItem('fw_bio_cred') === null;
      __wa.mode = 'cancel'; await fwQuickAction('bio-on'); const stillOff = fwQuickGet().bio === false;
      await fwQuickAction('pin-off'); const gone = fwQuickGet() === null;
      return { none, pinOnly, htmlOn, on, off, stillOff, gone };
    });
    assert.match(r.none, /PIN o.rnatilmagan/); assert.match(r.none, /fwQuickAction\('pin-set'\)/);
    assert.match(r.pinOnly, /PIN yoqilgan/); assert.match(r.pinOnly, /Barmoq izini yoqish/); assert.match(r.pinOnly, /fwQuickAction\('bio-on'\)/);
    assert.equal(r.on, true, 'barmoq izi yoqildi'); assert.match(r.htmlOn, /Barmoq izi yoqilgan/); assert.match(r.htmlOn, /fwQuickAction\('bio-off'\)/);
    assert.equal(r.off, true, "o'chirilganda credential ham o'chadi"); assert.equal(r.stillOff, true, 'bekor qilinsa yoqilmaydi'); assert.equal(r.gone, true, 'PIN oʻchirildi → tez kirish tozalandi');
  });
}

async function testAdminSettingsRow() {
  await withApp(async (page) => {
    const r = await page.evaluate(async () => {
      await fwBioProbe(); await fwQuickSet('1234', { dest: 'admin', uid: 'u1', name: 'Admin' }, false);
      Object.assign(S, { settings: {}, branch: 'baza' });
      pgSozlamalar();
      const row = [...document.querySelectorAll('#pg-sozlamalar .st-row')].find((b) => /Tez kirish/.test(b.innerText));
      const txt = row ? row.innerText.replace(/\s+/g, ' ') : null;
      stQuickSheet(); const sheet = (document.querySelector('.bs-box') || document.body).innerText;
      return { txt, sheet };
    });
    assert.ok(r.txt, "Sozlamalarda «Tez kirish» qatori bor"); assert.match(r.txt, /PIN/);
    assert.match(r.sheet, /Barmoq izi/); assert.match(r.sheet, /Barmoq izini yoqish/);
  });
}

async function testPortalSettings() {
  await withApp(async (page) => {
    const r = await page.evaluate(async () => {
      await fwBioProbe();
      ptSettingsOpen({ who: 'Sotuvchi', quickInfo: async () => ({ dest: 'seller', uid: 'u2', name: 'S' }) });
      const a = document.getElementById('pts-ov').innerText; const hasPinBtn = /PINni? o.rnatish|PIN o.rnatish/.test(a);
      await fwQuickSet('4321', { dest: 'seller', uid: 'u2', name: 'S' }, false); ptSettingsOpen({ who: 'Sotuvchi' });
      const b = document.getElementById('pts-ov').innerText;
      ptSettingsOpen({ who: 'Diller', quick: false }); const c = document.getElementById('pts-ov').innerText;
      return { a, hasPinBtn, b, c };
    });
    assert.match(r.a, /TEZ KIRISH/); assert.ok(r.hasPinBtn, "PIN yo'q — «PIN o'rnatish» (ma'lumot beruvchi bor)");
    assert.match(r.b, /Barmoq izini yoqish/, 'PIN bor — barmoq izini yoqish');
    assert.doesNotMatch(r.c, /TEZ KIRISH/, 'diller portalida bo\u02bblim yo\u02bbq');
  });
}

module.exports = { name: "P102 — barmoq izi (WebAuthn) va Sozlamalardagi «Tez kirish» (v25.6.8)", cases: [
  { name: "mavjudlik: WebAuthn platforma autentifikatori yoki Android ko'prigi; ikkalasi yo'q — yo'q", run: testAvail },
  { name: "WebAuthn oqimi: ro'yxatdan o'tkazish (platforma, majburiy tasdiq), keyin tasdiqlash, bekor qilish", run: testWebAuthnFlow },
  { name: "Sozlamalar bo'limi: PIN holati, barmoq izini yoqish/o'chirish, PIN o'chirish", run: testSettingsSection },
  { name: "Portal (sotuvchi) sozlamalarida «Tez kirish»; diller portalida yo'q", run: testPortalSettings },
  { name: "Admin Sozlamalar sahifasida «Tez kirish» qatori va oyna", run: testAdminSettingsRow },
] };
