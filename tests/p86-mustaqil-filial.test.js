// P86 — v25 (46-migratsiya, egasi qarori 2026-11-10): FILIAL IKKI XIL — «Filial» (qaramog'idagi) va «Mustaqil».
//  • Mustaqil: o'z narxi (chakana/optom ustama %, maks. chegirma %) — ilovada ham, serverdagi chegirma chegarasida ham.
//  • Qaramog'idagi filial — umumiy narx (o'zgarmagan). Jo'natma: mustaqilga — standart «Qarzga».
//  • Baza: mustaqil filialning savdosi/ombori — ko'rinmaydi (faqat qarz); bosh sahifada — alohida «hamkor».
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { openPage } = require('./p4-responsive.test.js')._helpers;
const { discountViolation, branchOwn } = require('../netlify/functions/_lib/pricing');
const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');

async function db() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE); await pg.exec(SCHEMA);
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`, [JSON.stringify({ settings: { usdUzs: 12000, maxDiscountPct: 10 }, products: [{ id: 101, name: 'Drel', markupPct: 25 }] })]);
  await pg.query(`select stock_debt_op('f729', 'seed-m1', 'batches_create', $1::jsonb)`, [JSON.stringify({ reason: 'opening', batches: [{ localId: 'm1', pid: 101, qty: 5, costUsd: 10, meta: {} }] })]);
  return pg;
}
// Faqat chegirma chegarasi: DISCOUNT_LIMIT bo'lsa — matn; o'tsa (keyingi bosqich boshqa sabab bilan to'xtashi mumkin) — null
async function floorErr(pg, sell, key) {
  try { await pg.query(`select public.sale_checkout_v37('f729', $1, $2::jsonb, '[]'::jsonb, 7, 'S', 'seller', false, null, 0, 'retail')`,
    [key, JSON.stringify({ items: [{ pid: 101, qty: 1, sellUsd: sell }], discPct: 0 })]); return null; }
  catch (e) { return /DISCOUNT_LIMIT/.test(e.message) ? e.message : null; }
}

module.exports = {
  name: 'P86 — 46-migratsiya: mustaqil filial — oʻz narxi (server ham), Bazada faqat qarz',
  cases: [
    { name: 'server: chegirma chegarasi mustaqil filialning oʻz ustamasi va maks. chegirmasidan (SQL + JS bir xil)', async run() {
      const pg = await db();
      try {
        // qaramog'idagi: chakana round(10 × 1.25) = 13, 10% → eng past 11.7
        assert.equal(await floorErr(pg, 12, 'mf-1'), null);
        assert.match(await floorErr(pg, 11, 'mf-2'), /DISCOUNT_LIMIT/);
        // mustaqil: o'z ustamasi 50% (15), maks. chegirma 0% → 14 ham rad, 15 — o'tadi
        await pg.query(`update app_data set data = jsonb_set(data, '{settings,branchCfg}', $1::jsonb) where id='main'`, [JSON.stringify({ f729: { type: 'mustaqil', own: { r: 50, max: 0 } } })]);
        assert.match(await floorErr(pg, 14, 'mf-3'), /DISCOUNT_LIMIT/);
        assert.equal(await floorErr(pg, 15, 'mf-4'), null);
        // «Filial» turiga qaytsa — o'z narxi e'tiborsiz
        await pg.query(`update app_data set data = jsonb_set(data, '{settings,branchCfg,f729,type}', '"filial"') where id='main'`);
        assert.equal(await floorErr(pg, 12, 'mf-5'), null);
      } finally { await pg.close(); }
      // JS (37 qo'llanmagan baza uchun) — o'sha qoida
      const settings = { maxDiscountPct: 10, branchCfg: { f729: { type: 'mustaqil', own: { r: 50, max: 0 } } } };
      const args = { products: [{ id: 101, markupPct: 25 }], settings, discPct: 0, mode: 'retail', costMap: new Map([['101', 10]]) };
      assert.ok(discountViolation({ ...args, items: [{ pid: 101, sellUsd: 14 }], filial: 'f729' }));
      assert.equal(discountViolation({ ...args, items: [{ pid: 101, sellUsd: 15 }], filial: 'f729' }), null);
      assert.equal(discountViolation({ ...args, items: [{ pid: 101, sellUsd: 12 }], filial: 'baza' }), null, 'boshqa filial — umumiy narx');
      assert.equal(branchOwn({ branchCfg: { f2: { type: 'filial', own: { r: 50 } } } }, 'f2'), null, 'qaramogʻidagi filialda oʻz narxi yoʻq');
    } },
    { name: 'brauzer: sozlamada tur va oʻz narxi; mustaqilga joʻnatma — «Qarzga»; Bazada faqat qarz; bosh sahifada hamkor', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async () => {
          S._store = S._store || {}; const L = S._store.f729 = S._store.f729 || {}; const p = S.products[0], t = td();
          L.batches = [{ id: 1, pid: p.id, qty: 10, sold: 3, costUsd: 5, status: 'active' }];
          L.sales = [{ id: 9, inv: 'F-001', date: t, totalUsd: 30, items: [{ pid: p.id, qty: 3, sellUsd: 10 }] }];
          S.branchDebt = { f729: 27 }; save = async () => true;
          const before = (() => { const w = S.branch; S.branch = 'f729'; const v = sellPrice(p, 10); S.branch = w; return v; })();
          flSettings('f729'); document.querySelector('#fl-type button:nth-child(2)').click();
          document.getElementById('fl-own-r').value = '40'; document.getElementById('fl-own-max').value = '5'; flSettingsSave('f729');
          const w = S.branch; S.branch = 'f729'; const own = sellPrice(p, 10); S.branch = w;
          FR.list = []; frShipForm(null, 'f729'); const mode = FR.form && FR.form.mode; closeSheet();
          go('filiallar'); const card = document.getElementById('fl-tab-body').innerText;
          flSetTab('sale'); const sale = document.getElementById('fl-tab-body').innerText;
          go('dashboard'); const home = document.getElementById('pg-dashboard').innerText;
          return { cfg: S.settings.branchCfg.f729, before, own, mode, card, sale, home };
        });
        assert.equal(r.cfg.type, 'mustaqil'); assert.deepEqual(r.cfg.own, { r: 40, o: null, max: 5 });
        assert.equal(r.before, 12.5); assert.equal(r.own, 14, 'mustaqil filialda oʻz ustamasi (40%)');
        assert.equal(r.mode, 'debt', 'mustaqilga joʻnatma — standart «Qarzga»');
        assert.match(r.card, /Mustaqil \(hamkor\)/); assert.match(r.card, /Faqat qarz/); assert.doesNotMatch(r.card, /Shu oy sotdi/);
        assert.match(r.sale, /faqat qarzini koʻradi/);
        assert.match(r.home, /mustaqil \(hamkor\)/);
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
