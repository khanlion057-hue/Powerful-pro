// P56 — Filialga o'tish: o'tish darhol (ro'yxatlar orqada yuklanadi).
//  • v24.8: standart parol (1212) YO'Q — saqlangan parol bo'lmasa bo'sh (birinchi kirishda o'rnatiladi, p66); saqlangani bo'lsa — o'sha.
//  • To'g'ri parol: yangi filial sahifasi diller/xodim yuklanishini KUTMASDAN chiziladi;
//    buyurtmalar dillerlardan keyin, xodimlar parallel; yuklangach sahifa yangilanadi.
//  • Noto'g'ri parol — filial o'zgarmaydi.
const assert = require('node:assert/strict');
const path = require('path'); const fs = require('fs'); const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
function fnSrc(name) {
  const i = SRC.search(new RegExp(`(async )?function ${name}\\(`)); assert.ok(i >= 0, name);
  let d = 0; for (let k = SRC.indexOf('{', i); k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}' && !--d) return SRC.slice(i, k + 1); }
}
function ctx(extra) {
  const ls = {}; const c = { localStorage: { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); } }, ...extra };
  vm.createContext(c); vm.runInContext(fnSrc('getBranchPin') + fnSrc('getBranchPinCached'), c); return { c, ls };
}
module.exports = {
  name: 'P56 — filialga o\'tish: saqlangan parol, tez o\'tish',
  cases: [
    { name: 'standart parol yo\'q (bo\'sh); saqlangan parol ustun', run() {
      const { c, ls } = ctx({ S: { settings: {} } });
      assert.equal(c.getBranchPin('f729'), ''); assert.equal(c.getBranchPinCached('f729'), '');
      c.S.settings.branchPin = { f729: '9999' }; ls['bp_branch_pin_f729'] = '9999';
      assert.equal(c.getBranchPin('f729'), '9999'); assert.equal(c.getBranchPinCached('f729'), '9999');
      assert.ok(!/<b>1234<\/b>/.test(SRC), "UI matnlarida eski 1234 qolmagan");
    } },
    { name: 'o\'tish darhol chiziladi, ro\'yxatlar orqada (diller → buyurtma, xodim parallel)', async run() {
      const log = []; const rel = {};
      const pending = (n) => () => { log.push('start:' + n); return new Promise(r => { rel[n] = () => { log.push('done:' + n); r(); }; }); };
      const { c } = ctx({
        CURRENT_USER: { kind: 'owner' }, S: { settings: { branchPin: { f729: '1212' } }, branch: 'baza', page: 'dashboard', _store: {} },
        document: { getElementById: () => ({ value: '1212' }) }, sessionStorage: { setItem() {} },
        BRANCHES: { f729: { icon: '🏬' } }, branchName: k => k, toast: () => log.push('toast'), closeModal() {}, save() {}, renderBranchBadge() {}, auditLog() {},
        _snapshotBranch: () => ({}), _emptyBranchDefaults: () => ({}), _applyBranchSnapshot() {}, _numericBaselineSnapshot: () => ({}),
        go: (p) => log.push('go'), dlLoadDealerData: pending('dealers'), dlLoadOrders: pending('orders'), dlLoadStaff: pending('staff'), console,
      });
      vm.runInContext(fnSrc('confirmBranchSwitch'), c);
      const p = c.confirmBranchSwitch('f729');
      await new Promise(r => setImmediate(r));
      assert.equal(c.S.branch, 'f729');
      assert.deepEqual(log.slice(0, 2), ['go', 'toast'], 'sahifa yuklanishni kutmasdan chiziladi');
      assert.ok(log.includes('start:dealers') && log.includes('start:staff') && !log.includes('start:orders'), 'diller va xodim parallel, buyurtma kutadi');
      rel.dealers(); await new Promise(r => setImmediate(r));
      assert.ok(log.includes('start:orders'), 'buyurtmalar dillerlardan keyin');
      rel.orders(); rel.staff(); await p;
      assert.equal(log[log.length - 1], 'go', 'yuklangach sahifa yangilanadi');
    } },
    { name: 'noto\'g\'ri parol — filial o\'zgarmaydi', async run() {
      const { c } = ctx({ CURRENT_USER: { kind: 'owner' }, S: { settings: { branchPin: { f729: '1212' } }, branch: 'baza' }, document: { getElementById: () => ({ value: '0000' }) },
        toast() {}, closeModal() {} });
      vm.runInContext(fnSrc('confirmBranchSwitch'), c);
      await c.confirmBranchSwitch('f729');
      assert.equal(c.S.branch, 'baza');
    } },
  ],
};
