// P55 — v24.5: pastki menyu o'rtasida savat o'rniga QR skaner tugmasi (admin, sotuvchi, diller).
//  • Uchala sahifada markaziy tugma QR belgisi bilan va skaner funksiyasini chaqiradi (savat belgisi yo'q).
//  • Egasi talabi: tugma FAQAT Savdo/Sotuv oynasini ochadi (kamera avtomatik ochilmaydi; skaner — oyna ichidagi tugmada).
//  • Diller: skanerlangan kod (SKU / shtrix-kod) faqat diller omboridagi mahsulotga moslanadi; topilmasa — xato xabari.
//  • Admin: Savdo ruxsati bo'lmasa — skaner ochilmaydi.
const assert = require('node:assert/strict');
const path = require('path'); const fs = require('fs'); const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
function fnSrc(file, name) {
  const s = read(file), i = s.indexOf(`function ${name}(`); assert.ok(i >= 0, `${file}: ${name} bor`);
  let d = 0; for (let k = s.indexOf('{', i); k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}' && !--d) return s.slice(i, k + 1); }
}
const CART_PATH = 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22';
module.exports = {
  name: 'P55 — pastki menyu: o\'rtada QR skaner',
  cases: [
    { name: 'uchala sahifada markaziy tugma — QR belgisi va skaner funksiyasi', run() {
      for (const [f, h] of [['index.html', 'navScanSale()'], ['sotuvchi.html', 'svNavScan()'], ['diller.html', 'dlNavScan()']]) {
        const nav = read(f).match(/<nav class="m-bottomnav[^"]*" id="[^"]+">([\s\S]*?)<\/nav>/)[1];
        const fab = nav.match(/<button class="m-bn-item m-bn-fab"[\s\S]*?<\/button>/)[0];
        assert.ok(fab.includes(`onclick="${h}"`), `${f}: ${h}`);
        assert.ok(/<rect /.test(fab) && /aria-label="QR — (Savdo|Sotuv) oynasini ochish"/.test(fab), `${f}: QR belgisi va nomi`);
        assert.ok(!fab.includes(CART_PATH) && !fab.includes('data-icf="cart"'), `${f}: savat belgisi yo'q`);
      }
      // v25.9 (PageSpeed 2-band): zaxira skaner kutubxonasi — skaner ochilganda fwLib orqali (SRI bilan; P42 xeshni tekshiradi)
      assert.ok(/<script src="js\/shared\.js">/.test(read('diller.html')), 'diller: shared.js (fwLib) ulangan');
      assert.ok(/'html5-qrcode': \{ url: 'https:\/\/cdn\.jsdelivr\.net\/npm\/html5-qrcode@2\.3\.8\/[^']+', sri: 'sha384-/.test(read('js/shared.js')), 'diller: iPhone uchun zaxira skaner kutubxonasi (SRI bilan)');
      assert.ok(/await fwLib\('html5-qrcode'\)[\s\S]{0,120}typeof Html5Qrcode === 'undefined'/.test(read('js/shared.js')), 'skaner kutubxonani kutib, keyin ishlatadi');
    } },
    { name: 'admin: faqat Savdo oynasi (kamera yo\'q); ruxsatsiz — ochilmaydi', run() {
      const mk = (mode, perm) => { const log = []; const c = { S: { page: 'dashboard' }, PAGE_VIEW_PERMISSION: { savdo: 'savdo.view' }, hasPerm: () => perm,
        go: (p) => { log.push('go:' + p); c.S.page = p; }, savdoScanQr: () => log.push('scan'), fwScanMode: () => mode, toast: (m) => log.push('toast') };
        vm.createContext(c); vm.runInContext(fnSrc('js/main.js', 'navScanSale') + ';navScanSale()', c); return log; };
      assert.deepEqual(mk('camera', true), ['go:savdo']);
      assert.deepEqual(mk('usb', true), ['go:savdo']);
      assert.deepEqual(mk('camera', false), ['toast']);
    } },
    { name: 'sotuvchi: faqat Savdo bo\'limi (kamera yo\'q)', run() {
      const log = []; const c = { ACTIVE_TAB: 'debt', svAllowedTabs: () => ['sale', 'debt'], svSwitchTab: (t) => { log.push('tab:' + t); c.ACTIVE_TAB = t; },
        posScan: () => log.push('scan'), fwScanMode: () => 'camera' };
      vm.createContext(c); vm.runInContext(fnSrc('js/sotuvchi.js', 'svNavScan') + ';svNavScan()', c);
      assert.deepEqual(log, ['tab:sale']);
    } },
    { name: 'diller: kod faqat o\'z omboridagi mahsulotga moslanadi', run() {
      const log = []; let onCode = null;
      const c = { ACTIVE_TAB: 'stock', STOCK: [{ pid: 7, sku: 'ABC-1', name: 'Kran', qty: 3 }, { pid: 9, sku: 'Z9', name: 'Truba', qty: 1 }],
        dlSwitchTab: (t) => { log.push('tab:' + t); c.ACTIVE_TAB = t; }, fwScanMode: () => 'camera', fwScan: (cb) => { onCode = cb; log.push('scan'); },
        dlSaleAdd: (pid, d) => log.push(`add:${pid}:${d}`), toast: (m, t) => log.push('toast:' + t), fwBarcodes: () => [] };
      vm.createContext(c);
      vm.runInContext(fnSrc('js/shared.js', 'fwResolveCode') + ';' + fnSrc('js/diller.js', 'dlNavScan') + ';' + fnSrc('js/diller.js', 'dlSaleScan') + ';dlNavScan()', c);
      assert.deepEqual(log, ['tab:sale'], 'menyu tugmasi faqat Sotuv oynasini ochadi');
      vm.runInContext('dlSaleScan()', c);
      onCode('abc-1'); onCode('YOQ-123');
      assert.deepEqual(log, ['tab:sale', 'scan', 'add:7:1', 'toast:error']);
      assert.ok(/onclick="dlSaleScan\(\)"/.test(read('js/diller.js')), 'Sotuv oynasida skaner tugmasi bor');
    } },
  ],
};
