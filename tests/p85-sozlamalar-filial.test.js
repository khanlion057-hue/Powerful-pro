// P85 — v25.1 (egasi talabi): har filial (asosiy filial ham) faqat O'ZIGA tegishli sozlamalarni ko'radi va o'zgartiradi;
// umumiy (butun firma) sozlamalari — faqat egasi. Bir filial boshqasining sozlamalarini buza olmasligi kerak.
const assert = require('node:assert/strict');
const g = require('../netlify/functions/_lib/appDataGuard');

const EX = { settings: { company: 'POWERFUL GROUP', maxDiscountPct: 10, roundingEnabled: true, receipt: 'Rahmat', receiptWidth: 72,
  usdUzs: 12000, tgBotToken: '123456789:SECRET_token_value_xxxxxx', tgChatId: '-1001', branchNames: { baza: 'Asosiy', f729: 'Chilonzor' } } };
const CHANGE = { company: 'BUZILDI', maxDiscountPct: 90, roundingEnabled: false, receipt: 'x', receiptWidth: 58, usdUzs: 12100,
  tgChatId: '-1009', branchNames: { baza: 'X', f729: 'Y' } };

async function testStaffCannotChangeGlobal() {
  for (const [who, filial] of [['asosiy filial menejeri', 'baza'], ['boshqa filial menejeri', 'f729']]) {
    const r = g.filterTopLevelChanges({ existing: EX, incoming: { settings: { ...EX.settings, ...CHANGE } }, permKeys: new Set(['sozlamalar.edit', 'savdo.create']), isAdmin: false, filial });
    const st = r.allowed.settings;
    assert.ok(st, who + ': kurs oʻzgarishi qabul qilinadi');
    assert.equal(st.usdUzs, 12100, who + ': kunlik kurs — ruxsat (±15%)');
    for (const k of ['company', 'maxDiscountPct', 'roundingEnabled', 'receipt', 'receiptWidth', 'tgChatId']) assert.deepEqual(st[k], EX.settings[k], `${who}: «${k}» oʻzgarmaydi`);
    assert.deepEqual(st.branchNames, EX.settings.branchNames, who + ': filial nomlari (boshqa filialniki ham) oʻzgarmaydi');
    assert.equal(st.tgBotToken, EX.settings.tgBotToken, who + ': bot tokeni saqlanadi');
  }
}

async function testOwnerChangesGlobal() {
  for (const ctx of [{ isAdmin: true, permKeys: new Set() }, { isAdmin: false, permKeys: new Set(['rollar.manage', 'sozlamalar.edit']) }]) {
    const r = g.filterTopLevelChanges({ existing: EX, incoming: { settings: { ...EX.settings, ...CHANGE } }, filial: 'baza', ...ctx });
    assert.equal(r.allowed.settings.company, 'BUZILDI'); assert.equal(r.allowed.settings.maxDiscountPct, 90); assert.equal(r.allowed.settings.receiptWidth, 58);
  }
}

async function testRateBand() {
  const r = g.filterTopLevelChanges({ existing: EX, incoming: { settings: { ...EX.settings, usdUzs: 30000 } }, permKeys: new Set(['sozlamalar.edit']), isAdmin: false, filial: 'f729' });
  assert.equal((r.allowed.settings || EX.settings).usdUzs, 12000, 'kurs ±15% dan ortiq — rad');
}

async function testClientScoping() {
  // Chop etish — filial sozlamasi: filial qiymati ustun, bo'lmasa umumiy (eski o'rnatish)
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'main.js'), 'utf8');
  assert.match(src, /function fwPrintCfg\(k\) \{ const bs = S\.branchSettings \|\| \{\}; return bs\[k\] !== undefined \? bs\[k\] : \(S\.settings \|\| \{\}\)\[k\]; \}/);
  assert.match(src, /function stSetWidth\(v\)\{ stSetBranch\('receiptWidth', v\)/, 'chek oʻlchami — filialga yoziladi');
  assert.doesNotMatch(src, /stSet\('autoPrint'|stSet\('printerName'/, 'printer — umumiy sozlamaga yozilmaydi');
  assert.match(src, /const ro = \(o\) => own \? row\(o\) : static_\(o\);/, 'umumiy sozlama — faqat egasi tahrirlaydi');
}

module.exports = {
  name: 'P85 — Sozlamalar: har filial faqat oʻziniki, umumiy — faqat egasi',
  cases: [
    { name: 'Filial menejeri (asosiy filial ham, sozlamalar.edit bilan): umumiy sozlamalar, filial nomlari, bot — oʻzgarmaydi; kurs — ha', run: testStaffCannotChangeGlobal },
    { name: 'Egasi (admin yoki rollar.manage) — umumiy sozlamalarni oʻzgartiradi', run: testOwnerChangesGlobal },
    { name: 'Kurs: ±15% dan ortiq oʻzgarish rad', run: testRateBand },
    { name: 'Ilova: chop etish — filial sozlamasi; umumiy qatorlar faqat egasiga', run: testClientScoping },
  ],
};
