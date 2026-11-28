// P144 — v25.8 (egasi talabi): yon menyuda va telefondagi «Tezkor amallar»da (Xarajatlar o'rnida) «AI-reklama» bandi.
//  • Haqiqiy index.html (barcha skriptlar). Egasi — band ko'rinadi; bosilsa Onlayn-do'kon → AI-reklama ochiladi, menyuda shu band belgilanadi.
//  • Xodim: reklama.view yo'q — band yo'q; reklama.view bor — bor; server administratori — bor (bo'limning o'zidagi qoida bilan bir xil).
//  • Do'koni yoqilmagan filialda — aniq xabar (yolg'on bo'sh sahifa emas).
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;

module.exports = {
  name: 'P144 — AI-reklama: yon menyu va Tezkor amallar bandi (ruxsatga qarab)',
  cases: [
    { name: 'egasi: yon menyuda bor, bosilsa AI-reklama ochiladi; xodim ruxsatsiz — yo\'q, reklama.view / server admin — bor; do\'kon o\'chiq — xabar', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 1280, height: 800, admin: true });
      try {
        const r = await page.evaluate(async () => {
          const acts = () => shellMenuItems().map((x) => x[3]);
          const vis = () => { const n = document.querySelector('.sidebar [data-nav="aireklama"]'); return !!n && n.style.display !== 'none'; };
          const out = {};
          shopData().settings.enabled = true;
          applyMenuPermissions();
          out.owner = { vis: vis(), act: acts().includes('AI-reklama'), label: document.querySelector('.sidebar [data-nav="aireklama"]').textContent.trim() };
          goAiReklama();
          await new Promise((res) => setTimeout(res, 50));
          out.open = { page: S.page, tab: S.dkTab, aiVis: !!document.querySelector('#dk-body .air-hero'),
            activeAi: document.querySelector('.sidebar [data-nav="aireklama"]').classList.contains('active'),
            activeShop: document.querySelector('.sidebar .nav-item[data-page="dokon"]').classList.contains('active') };
          // xodim: ruxsatsiz
          CURRENT_USER = { kind: 'staff', staffId: 7, name: 'X', roles: [], perms: new Set(['savdo.view']), isAdmin: false };
          applyMenuPermissions(); out.staffNo = { vis: vis(), act: acts().includes('AI-reklama') };
          CURRENT_USER = { kind: 'staff', staffId: 7, name: 'X', roles: [], perms: new Set(['savdo.view', 'reklama.view']), isAdmin: false };
          applyMenuPermissions(); out.staffYes = { vis: vis(), act: acts().includes('AI-reklama') };
          CURRENT_USER = { kind: 'staff', staffId: 7, name: 'X', roles: [], perms: new Set(['savdo.view']), isAdmin: true };
          applyMenuPermissions(); out.serverAdmin = vis();
          // do'kon o'chiq filial
          CURRENT_USER = { kind: 'owner', staffId: null, name: 'Egasi', roles: [], perms: new Set() }; applyMenuPermissions();
          shopData().settings.enabled = false; window.__toasts = []; const t0 = [];
          const ot = window.toast; window.toast = (m) => { t0.push(String(m)); };
          goAiReklama(); window.toast = ot;
          out.off = { msg: t0.join(' | '), page: S.page, tab: S.dkTab };
          return out;
        });
        assert.deepEqual(r.owner, { vis: true, act: true, label: 'AI-reklama' }, 'egasi: yon menyu va tezkor amallarda bor');
        assert.deepEqual(r.open, { page: 'dokon', tab: 'ai', aiVis: true, activeAi: true, activeShop: false }, 'bosilsa — AI-reklama ochiladi va belgilanadi');
        assert.deepEqual(r.staffNo, { vis: false, act: false }, 'reklama.view yoʻq — band yoʻq');
        assert.deepEqual(r.staffYes, { vis: true, act: true }, 'reklama.view bor — band bor');
        assert.equal(r.serverAdmin, true, 'server administratori — band bor');
        assert.match(r.off.msg, /onlayn-doʻkon yoqilmagan/); assert.equal(r.off.page, 'dokon'); assert.equal(r.off.tab, 'orders', 'yolgʻon boʻsh AI sahifasi emas');
        assert.deepEqual(errors, [], 'sahifada JS xatosi yoʻq');
      } finally { await browser.close(); }
    } },
  ],
};
