// P66 — v24.8 (S5): STANDART PAROL ('1212') OLIB TASHLANDI.
//  • js/main.js'da APP_PIN / BRANCH_PIN_DEFAULT va '1212' qiymati yo'q; o'rnatilmagan parol — bo'sh.
//  • Parol o'rnatilmagan filialga o'tish — o'tmaydi, avval «yangi parol o'rnating» oynasi (joriy parol so'ralmaydi).
//  • Yangi parol 4–10 belgi va ikki marta bir xil; o'rnatilgach — bulut sozlamasi va qurilma keshiga.
//  • Kirish ekranida (ma'lumot yuklanishidan oldin) o'rnatilgan parol — yuklangach bulutga yoziladi,
//    lekin bulutda allaqachon parol bo'lsa (boshqa qurilma o'rnatgan) — ustidan yozilmaydi.
//  • Bo'sh parol bilan kirib bo'lmaydi (bo'sh qator «to'g'ri parol» emas).
const assert = require('node:assert/strict');
const path = require('path'); const fs = require('fs'); const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
function fnSrc(name) {
  const i = SRC.search(new RegExp(`(async )?function ${name}\\(`)); assert.ok(i >= 0, name);
  let d = 0; for (let k = SRC.indexOf('{', i); k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}' && !--d) return SRC.slice(i, k + 1); }
}
function ctx(extra) {
  const ls = {}, ss = {}, log = [];
  const c = {
    localStorage: { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = String(v); } },
    sessionStorage: { getItem: k => ss[k] ?? null, setItem: (k, v) => { ss[k] = String(v); }, removeItem: k => { delete ss[k]; } },
    toast: (m, t) => log.push(['toast', m, t]), auditLog: (m) => log.push(['audit', m]), save: () => log.push(['save']),
    closeModal() {}, branchName: k => k, BRANCHES: { baza: { name: 'Baza', icon: '🏢' }, f729: { name: '729', icon: '🏬' } },
    esc: (x) => String(x), modal: (h) => log.push(['modal', h]), setTimeout: () => 0, openBranchSwitch: () => log.push(['switchList']), isBranchActive: () => true,
    ...extra,
  };
  vm.createContext(c);
  vm.runInContext(['fwPinValid', 'getAppPin', 'getBranchPin', 'getBranchPinCached', 'fwSetPendingBranchPin', 'fwApplyPendingBranchPins',
    'openChangeBranchPin', 'saveBranchPin', 'promptBranchSwitch', 'confirmBranchSwitch'].map(fnSrc).join('\n'), c);
  return { c, ls, ss, log };
}

module.exports = {
  name: "P66 — v24.8: standart parol yo'q, birinchi kirishda majburiy yangi parol",
  cases: [
    { name: "manba: '1212', APP_PIN va BRANCH_PIN_DEFAULT yo'q", run() {
      const code = SRC.replace(/\/\/[^\n]*/g, '').replace(/\+998 ?91 ?367 ?12 ?12|\+998913671212/g, '');
      assert.doesNotMatch(code, /'1212'|"1212"|<b>1212<\/b>/, "kodda standart parol qolmagan");
      assert.doesNotMatch(SRC, /\bAPP_PIN\b|\bBRANCH_PIN_DEFAULT\b/);
      const { c } = ctx({ S: { settings: {} } });
      assert.equal(c.getAppPin(), ''); assert.equal(c.getBranchPin('f729'), ''); assert.equal(c.getBranchPinCached('f729'), '');
    } },
    { name: "parol o'rnatilmagan filial: o'tilmaydi — yangi parol oynasi (joriy parol so'ralmaydi)", async run() {
      const { c, log } = ctx({ S: { settings: {}, branch: 'baza' }, CURRENT_USER: { kind: 'owner' }, document: { getElementById: () => ({ value: '' }) } });
      await c.confirmBranchSwitch('f729');
      assert.equal(c.S.branch, 'baza', "bo'sh parol bilan o'tib bo'lmaydi");
      const m = log.filter(x => x[0] === 'modal').pop();
      assert.ok(m && /yangi parol oʻrnating/.test(m[1]), 'yangi parol oynasi ochildi');
      assert.ok(!/id="bp-old"/.test(m[1]), "joriy parol so'ralmaydi");
      log.length = 0; c.promptBranchSwitch('f729');
      assert.ok(/yangi parol oʻrnating/.test(log.filter(x => x[0] === 'modal').pop()[1]), "o'tish tugmasi ham avval parol so'raydi");
    } },
    { name: "yangi parol: 4–10 belgi, ikki marta bir xil; bulut va keshga yoziladi", run() {
      const vals = {};
      const { c, ls, log } = ctx({ S: { settings: {} }, document: { getElementById: (id) => ({ value: vals[id] || '' }) } });
      Object.assign(vals, { 'bp-new': '12', 'bp-new2': '12' }); c.saveBranchPin('f729');
      assert.equal(c.S.settings.branchPin, undefined, 'qisqa parol rad');
      Object.assign(vals, { 'bp-new': '5544', 'bp-new2': '5545' }); c.saveBranchPin('f729');
      assert.equal(c.S.settings.branchPin, undefined, 'mos kelmagan parol rad');
      Object.assign(vals, { 'bp-new': '5544', 'bp-new2': '5544' }); c.saveBranchPin('f729');
      assert.equal(c.S.settings.branchPin.f729, '5544'); assert.equal(ls['bp_branch_pin_f729'], '5544');
      assert.ok(log.some(x => x[0] === 'save') && log.some(x => x[0] === 'audit' && /oʻrnatildi/.test(x[1])));
      // Endi o'zgartirish — joriy parol shart
      Object.assign(vals, { 'bp-old': '0000', 'bp-new': '7777', 'bp-new2': '7777' }); c.saveBranchPin('f729');
      assert.equal(c.S.settings.branchPin.f729, '5544', "noto'g'ri joriy parol bilan o'zgarmaydi");
      Object.assign(vals, { 'bp-old': '5544' }); c.saveBranchPin('f729');
      assert.equal(c.S.settings.branchPin.f729, '7777');
    } },
    { name: "kirish ekranida o'rnatilgan parol — yuklangach bulutga (bulutdagisi ustidan yozilmaydi)", run() {
      const { c, ss } = ctx({ S: { settings: { branchPin: { baza: '9090' } } } });
      c.fwSetPendingBranchPin('f729', '4321'); c.fwSetPendingBranchPin('baza', '1111');
      assert.equal(c.fwApplyPendingBranchPins(), true);
      assert.deepEqual({ ...c.S.settings.branchPin }, { baza: '9090', f729: '4321' }, "bulutdagi Baza paroli saqlandi, yangi filialga o'rnatildi");
      assert.equal(ss['bp_pin_pending'], undefined, 'navbat tozalandi');
      assert.equal(c.fwApplyPendingBranchPins(), false, 'ikkinchi marta hech narsa yozilmaydi');
    } },
    { name: "kirish ekrani: parol keshda bo'lmasa bulutdan olinadi, u yerda ham bo'lmasa — yangi parol bosqichi", run() {
      const scr = fnSrc('showBranchScreen');
      assert.match(scr, /if \(!getBranchPinCached\(key\)\) \{[\s\S]*_cloudLoad\(\)[\s\S]*return renderSetStep\(key\)/);
      assert.match(scr, /fwSetPendingBranchPin\(key, a\)/);
      assert.match(scr, /if \(!fwPinValid\(a\)\)/);
      const pin = fnSrc('showPinScreen');
      assert.match(pin, /let setMode = !getAppPin\(\)/, "admin PIN o'rnatilmagan bo'lsa — majburan yangi PIN");
    } },
  ],
};
