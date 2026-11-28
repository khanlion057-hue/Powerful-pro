// P73 — v25: TENG TAQSIMOT va SOTUVCHIDA «TANNARX» TUGMASI.
//  • Tugma/karta setkasida oxirgi qator yarim bo'sh qolmaydi: 5 ta element 3 ustunda → 3 + 2 (ikkalasi teng, qator to'liq).
//  • Ekran kengligi o'zgarsa qayta hisoblanadi; teng bo'linadigan holatga tegilmaydi.
//  • Sotuvchi: «Tannarx» tugmasi faqat «tannarx.view» ruxsati bilan; bosilsa 5 soniya tannarx ko'rinadi va o'zi yopiladi.
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

module.exports = {
  name: 'P73 — teng taqsimot (oxirgi qator to\'liq) va sotuvchida «Tannarx» 5 soniya',
  cases: [
    { name: 'setka: 5 ta / 3 ustun → 3 + 2 to\'liq; 6 ta — o\'zgarmaydi; kenglik o\'zgarsa qayta', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 1280, height: 900, admin: true });
      try {
        const r = await page.evaluate(async () => {
          const mk = (n) => { const g = document.createElement('div'); g.className = 'p73-g'; g.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;width:600px';
            for (let i = 0; i < n; i++) { const b = document.createElement('button'); b.textContent = 'T' + i; g.appendChild(b); } document.body.appendChild(g); return g; };
          const rows = (g) => { const m = new Map(); [...g.children].forEach(k => { const r = k.getBoundingClientRect(); const t = Math.round(r.top); m.set(t, (m.get(t) || []).concat(Math.round(r.width))); }); return [...m.values()]; };
          const a = mk(5), b = mk(6); fwBalanceGrid(a); fwBalanceGrid(b);
          const out = { a: rows(a), b: rows(b), bBal: !!b.dataset.fwBal };
          a.style.gridTemplateColumns = 'repeat(4,minmax(0,1fr))'; delete a.dataset.fwBal; [...a.children].forEach(k => k.style.gridColumn = ''); fwBalanceGrid(a);
          out.a4 = rows(a);
          return out;
        });
        assert.deepEqual(r.a, [[200, 200, 200], [300, 300]], '5 ta / 3 ustun: oxirgi qator to\'liq va teng');
        assert.deepEqual(r.b, [[200, 200, 200], [200, 200, 200]]); assert.equal(r.bBal, false, 'teng bo\'linsa tegilmaydi');
        assert.deepEqual(r.a4, [[150, 150, 150, 150], [600]], '4 ustunda — oxirgi bitta butun qator');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
    { name: 'sotuvchi: «Tannarx» — ruxsat bo\'lsa ko\'rinadi, 5 soniya yonadi va o\'zi yopiladi; ruxsatsiz — yo\'q', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async () => {
          S.products = [{ id: 1, sku: 'A', name: 'Drel', markupPct: 25, unit: 'dona' }];
          S.batches = [{ id: 11, pid: 1, qty: 5, sold: 0, costUsd: 40, status: 'active', date: td() }]; CUR.usdUzs = 12500;
          go('savdo'); POS.cur = 'UZS';
          const adminBtn = !!document.getElementById('pos-cost-btn');
          let can = true; POS.a = Object.assign({}, POS.a, { costView: () => can, full: () => false }); posRender();
          const btn = !!document.getElementById('pos-cost-btn');
          const before = document.getElementById('pos-list').textContent.includes('Tannarx');
          posCostFlash();
          const on = { cls: document.getElementById('pos-cost-btn').classList.contains('on'), txt: /Tannarx: 500 000 soʻm/.test(document.getElementById('pos-list').textContent) };
          await new Promise(r => setTimeout(r, 5300));
          const off = { cls: document.getElementById('pos-cost-btn').classList.contains('on'), txt: document.getElementById('pos-list').textContent.includes('Tannarx:') };
          can = false; POS.costOn = false; posRender(); const noPerm = !!document.getElementById('pos-cost-btn');
          return { adminBtn, btn, before, on, off, noPerm };
        });
        assert.equal(r.adminBtn, false, 'admin oynasida tugma yo\'q (admin foydani ko\'radi)');
        assert.equal(r.btn, true); assert.equal(r.before, false, 'bosilmaguncha tannarx yashirin');
        assert.deepEqual(r.on, { cls: true, txt: true }, 'bosildi — tannarx ko\'rinadi');
        assert.deepEqual(r.off, { cls: false, txt: false }, '5 soniyadan keyin o\'zi yopildi');
        assert.equal(r.noPerm, false, 'ruxsatsiz — tugma yo\'q');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
