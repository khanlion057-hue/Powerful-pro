// P51 — v24.5 audit: ZAXIRA NUSXA YAXLITLIGI VA XAVFSIZ TIKLASH.
//  • Server zaxirasi: sha256 (main+branches+ledger), versiya, migratsiya darajasi; maxfiy kalitlar yo'q.
//  • Brauzer: server va qurilma zaxirasining sha256'i AYNAN bir xil qoida bilan tekshiriladi (Node ↔ Web Crypto).
//  • Buzilgan / qo'lda o'zgartirilgan fayl — rad (tiklash tugmasi o'chiq); yangiroq versiya — rad; eski fayl — ogohlantirish.
//  • Sozlamalar farqi: qo'shiladi / o'zgaradi / yo'qoladi / turi mos emas / maxfiy (e'tiborsiz).
//  • Tiklash: fayldagi token/PIN olinmaydi — joriy qiymat qoladi; tiklashdan oldin joriy holat zaxiraga olinadi.
// Haqiqiy server kodi (_lib/backupBuild.js) + haqiqiy brauzer kodi (js/main.js, Chromium). Tarmoqqa chiqilmaydi.
const assert = require('node:assert/strict');
const path = require('path');
const { loadApp } = require('./helpers/load-app');
const L = (f) => require(path.join(__dirname, '..', 'netlify', 'functions', '_lib', f));

function fakeAdmin(tables) {
  return { from: (t) => { const rows = tables[t]; const res = rows ? { data: rows, error: null } : { data: null, error: { code: '42P01', message: `relation "${t}" does not exist` } };
    const o = { select: () => o, eq: () => o, limit: () => o, range: async () => res, maybeSingle: async () => ({ data: rows && rows[0], error: null }), then: (r, j) => Promise.resolve(res).then(r, j) }; return o; } };
}
const TABLES = {
  app_data: [{ id: 'main', data: { settings: { company: 'A', usdUzs: 12500, tgBotToken: '123:SECRET', appPin: '1111' }, products: [{ id: 1, name: 'Drel', price: 10.5 }] } }],
  app_data_branches: [{ branch_key: 'baza', data: { sales: [{ id: 1, totalUsd: 0.1 + 0.2 }], customers: [{ id: 1, name: 'Ali ʻ ʼ' }] } }],
  cashbox_balances: [{ filial: 'baza', box_local_id: 1, balance: 1250000.55 }],
  stock_ledger: [], customer_credit_balances: [],
};

async function testServerIntegrity() {
  const { buildBackup, backupFile, payloadSha256 } = L('backupBuild.js');
  const bk = await buildBackup(fakeAdmin(TABLES));
  assert.equal(bk.version, '24.5'); assert.equal(bk.app, 'Powerful PRO');
  assert.equal(bk.schema.migrationLevel, 34, "migratsiya darajasi (jadval belgilari bo'yicha)");
  assert.equal(bk.integrity.alg, 'sha256');
  assert.equal(bk.integrity.value, payloadSha256({ main: bk.main, branches: bk.branches, ledger: bk.ledger }));
  const txt = backupFile(bk, false).toString();
  assert.doesNotMatch(txt, /SECRET|tgBotToken|appPin/, "maxfiy kalitlar yo'q");
  // faylni o'qib qayta hisoblash (tiklash qiladigani) — bir xil
  const back = JSON.parse(txt);
  assert.equal(payloadSha256({ main: back.main, branches: back.branches, ledger: back.ledger }), bk.integrity.value, 'JSON aylanishidan keyin ham bir xil');
}

async function testBrowserCheckAndRestore() {
  const { buildBackup } = L('backupBuild.js');
  const good = JSON.parse(JSON.stringify(await buildBackup(fakeAdmin(TABLES))));
  const tampered = JSON.parse(JSON.stringify(good)); tampered.ledger.cashbox_balances[0].balance = 99999999;
  const newer = { ...JSON.parse(JSON.stringify(good)), version: '25.1' };
  const old = { products: [{ id: 1 }], settings: { company: 'Eski' } };
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(async ([good, tampered, newer, old]) => {
      const out = {};
      out.good = await _fwBackupCheck(good);
      out.tampered = await _fwBackupCheck(tampered);
      out.newer = await _fwBackupCheck(newer);
      out.old = await _fwBackupCheck(old);
      out.noSum = await _fwBackupCheck({ ...good, integrity: undefined });
      // Qurilma zaxirasi — o'zi yaratgan faylni o'zi tasdiqlaydi; o'zgartirilsa — rad
      Object.assign(S, { settings: { company: 'Joriy', usdUzs: 12600, tgBotToken: 'JORIY-TOKEN', appPin: '9999', oldKey: 1, theme: 'dark' }, products: [{ id: 7 }] });
      const loc = JSON.parse(JSON.stringify(await _fwLocalBackup()));
      out.localSecret = JSON.stringify(loc).includes('JORIY-TOKEN') || JSON.stringify(loc).includes('9999');
      out.local = await _fwBackupCheck(loc);
      loc.data.products[0].id = 8; out.localTampered = await _fwBackupCheck(loc);
      // Sozlamalar farqi
      out.diff = _fwSettingsDiff(S.settings, { company: 'Fayl', usdUzs: '12500', newKey: true, tgBotToken: 'FAYL-TOKEN', appPin: '0000', theme: 'dark' });
      // Tiklash oynasi: buzilgan fayl — tugma o'chiq
      const file = (o, n) => ({ files: [new File([JSON.stringify(o)], n || 'z.json', { type: 'application/json' })] });
      if (!document.getElementById('modal-ov')) document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div>');
      await importBackup(file(tampered));
      const btn = [...document.querySelectorAll('.modal-footer button')].find(b => /Tiklash/.test(b.textContent));
      out.tamperedBtnDisabled = !!(btn && btn.disabled); out.tamperedRestoreState = FW_RESTORE === null;
      out.tamperedMsg = (document.querySelector('.pos-msg.err') || {}).textContent || '';
      closeModal();
      // To'g'ri fayl (token va PIN bilan) — tiklash: maxfiylar fayldan olinmaydi, oldin zaxira olinadi
      const withSecrets = { ...JSON.parse(JSON.stringify(good)) };
      withSecrets.main.settings.tgBotToken = 'FAYL-TOKEN'; withSecrets.main.settings.appPin = '0000';
      withSecrets.integrity = { alg: 'sha256', of: 'main+branches+ledger', value: await _fwSha256Hex(JSON.stringify({ main: withSecrets.main, branches: withSecrets.branches, ledger: withSecrets.ledger })) };
      await importBackup(file(withSecrets));
      out.okBtnDisabled = !![...document.querySelectorAll('.modal-footer button')].find(b => /Tiklash/.test(b.textContent)).disabled;
      let exported = 0; exportBackup = async () => { exported++; return true; };
      fwOwnerConfirm = async () => true; _cloudEnabled = false; save = () => {}; go = () => {}; updateSidebarUser = () => {};
      await restoreBackupRun();
      out.afterRestore = { company: S.settings.company, token: S.settings.tgBotToken, pin: S.settings.appPin, exported };
      return out;
    }, [good, tampered, newer, old]);
    assert.deepEqual(r.good.errors, [], 'toʻgʻri server zaxirasi — xatosiz: ' + JSON.stringify(r.good));
    assert.match(r.tampered.errors.join(' '), /sha256 mos emas/, "o'zgartirilgan fayl — rad");
    assert.match(r.newer.errors.join(' '), /yangiroq versiya/, 'yangiroq versiya — rad');
    assert.equal(r.old.errors.length, 0); assert.match(r.old.warnings.join(' '), /Eski formatdagi/);
    assert.match(r.noSum.warnings.join(' '), /yaxlitlik summasi/);
    assert.equal(r.localSecret, false, "qurilma zaxirasida token/PIN yo'q");
    assert.deepEqual(r.local.errors, [], 'qurilma zaxirasi — xatosiz');
    assert.match(r.localTampered.errors.join(' '), /sha256 mos emas/);
    assert.deepEqual(r.diff, { added: ['newKey'], changed: ['company'], dropped: ['oldKey'], incompatible: ['usdUzs'], secret: ['tgBotToken', 'appPin'] });
    assert.equal(r.tamperedBtnDisabled, true, "buzilgan fayl — Tiklash tugmasi o'chiq"); assert.equal(r.tamperedRestoreState, true);
    assert.match(r.tamperedMsg, /buzilgan/);
    assert.equal(r.okBtnDisabled, false);
    assert.deepEqual(r.afterRestore, { company: 'A', token: 'JORIY-TOKEN', pin: '9999', exported: 1 }, "maxfiylar fayldan olinmadi; oldin zaxira olindi");
  } finally { await browser.close(); }
}

// Sozlamalar eksport/import: maxfiylarsiz, sha256, oldindan ko'rish, faqat qo'shish/yangilash; buzilgan — rad
async function testSettingsExportImport() {
  const { browser, page } = await loadApp({});
  try {
    const r = await page.evaluate(async () => {
      if (!document.getElementById('modal-ov')) document.body.insertAdjacentHTML('beforeend', '<div id="modal-ov"></div>');
      let saved = []; _fwSaveFile = (name, text) => saved.push({ name, text });
      save = () => {}; fwOwnerConfirm = async () => true; auditLog = () => {};
      Object.assign(S, { settings: { company: 'Eski', usdUzs: 12600, tgBotToken: 'JORIY', appPin: '9999', branchPin: '1', receiptWidth: 72, keepMe: 'x' } });
      await exportSettingsFile(true);
      const pack = JSON.parse(saved[0].text);
      const out = { packHasSecret: /JORIY|9999|"appPin"|"tgBotToken"|"branchPin"/.test(saved[0].text), packFormat: pack.format, hasSum: !!(pack.integrity && pack.integrity.value) };
      const file = (o) => ({ files: [new File([JSON.stringify(o)], 's.json', { type: 'application/json' })] });
      // buzilgan
      const bad = JSON.parse(JSON.stringify(pack)); bad.settings.company = 'Hack';
      await importSettingsFile(file(bad)); out.badDisabled = [...document.querySelectorAll('.modal-footer button')].find(b => /Qoʻllash/.test(b.textContent)).disabled; out.badState = FW_SETIMP === null; closeModal();
      // to'g'ri: boshqa qurilma sozlamalari (yangi kalit + o'zgargan + turi mos emas + maxfiy)
      const inc = { company: 'Yangi', usdUzs: '12500', receiptWidth: 58, newKey: true, tgBotToken: 'FAYL', appPin: '0000' };
      const good = { format: 'powerful-pro-settings', version: '24.5', settings: inc, integrity: { alg: 'sha256', of: 'settings', value: await _fwSha256Hex(JSON.stringify(inc)) } };
      await importSettingsFile(file(good));
      out.preview = document.querySelector('#modal-ov .modal-body').textContent.replace(/\s+/g, ' ');
      saved = [];
      await importSettingsRun();
      out.after = { ...S.settings }; out.backupBeforeImport = saved.length === 1 && /sozlamalar_/.test(saved[0].name);
      // yangiroq versiya — rad
      await importSettingsFile(file({ ...good, version: '25.0' })); out.newerDisabled = FW_SETIMP === null; closeModal();
      return out;
    });
    assert.equal(r.packHasSecret, false, "eksportda token/PIN yo'q"); assert.equal(r.packFormat, 'powerful-pro-settings'); assert.equal(r.hasSum, true);
    assert.equal(r.badDisabled, true, "buzilgan fayl — Qo'llash o'chiq"); assert.equal(r.badState, true);
    assert.match(r.preview, /Qoʻshiladi: newKey/); assert.match(r.preview, /Oʻzgaradi: company, receiptWidth/);
    assert.match(r.preview, /Turi mos emas \(olinmaydi\): usdUzs/); assert.match(r.preview, /Maxfiy \(olinmaydi, joriysi qoladi\): tgBotToken, appPin/);
    assert.deepEqual(r.after, { company: 'Yangi', usdUzs: 12600, tgBotToken: 'JORIY', appPin: '9999', branchPin: '1', receiptWidth: 58, keepMe: 'x', newKey: true },
      "faqat qo'shildi/o'zgardi; turi mos emas va maxfiy olinmadi; faylda yo'q kalit o'chirilmadi");
    assert.equal(r.backupBeforeImport, true, 'importdan oldin joriy sozlamalar faylga saqlandi');
    assert.equal(r.newerDisabled, true, 'yangiroq versiya — rad');
  } finally { await browser.close(); }
}

module.exports = {
  name: "P51 — v24.5 audit: zaxira yaxlitligi (sha256), versiya mosligi, sozlamalar farqi, maxfiylarsiz tiklash",
  cases: [
    { name: 'Server zaxirasi: sha256, versiya, migratsiya darajasi; maxfiy kalit yo\'q; JSON aylanishidan keyin summa bir xil', run: testServerIntegrity },
    { name: "Sozlamalar eksport/import: maxfiylarsiz, sha256, farq ko'rinadi, faqat qo'shish/yangilash, oldin zaxira; buzilgan/yangiroq — rad", run: testSettingsExportImport },
    { name: "Brauzer: to'g'ri — o'tadi; o'zgartirilgan/yangiroq — rad (tugma o'chiq); eski — ogohlantirish; sozlamalar farqi; token/PIN fayldan olinmaydi", run: testBrowserCheckAndRestore },
  ],
};
