// P82 — v25 (43-migratsiya, egasi qarori 2026-11-10): FILIALNING BAZAGA QARZI $ yoki SO'MDA — har filialga alohida sozlama.
// HAQIQIY server funksiyalari (firma-kassa, app-data-load) + HAQIQIY PostgreSQL (PGlite) + brauzer.
//  • settings.branchCfg[filial].debtCur = 'UZS' — sotuvdagi qarz o'sha kungi kursda so'mda yoziladi (kurs o'zgarsa ham o'zgarmaydi);
//    belgilanmagan filial — avvalgidek $ da (app_data.branchDebt).
//  • To'lov: so'm kassadan so'mma-so'm, $ kassadan bugungi kurs bo'yicha; qarzdan ortiq — rad; takror so'rov ikki marta yozilmaydi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;
const { makePgSupabase } = require('./helpers/pg-supabase');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');
const { openPage } = require('./p4-responsive.test.js')._helpers;

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG43 = fs.readFileSync(path.join(ROOT, 'supabase-migration-43-filial-qarz-valyuta.sql'), 'utf8');
const PG_TABLES = ['app_data', 'app_data_branches', 'cashbox_balances', 'cashbox_ledger', 'firma_kassa_balance', 'firma_kassa_ledger',
  'branch_debt_cur', 'branch_debt_cur_ledger', 'idempotency_keys', 'ledger_ops'];
const PERMS = ['kassalar.transact', 'kassalar.view'];
const ADMIN = { id: 1, auth_user_id: 'u-1', role: 'admin', active: true, filial: 'baza', name: 'Admin', login: 'admin' };
const BOXES = [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 0 }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 0 }];

async function world() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  await pg.exec(SCHEMA);
  await pg.query(`update app_data set data = data || $1::jsonb where id='main'`,
    [JSON.stringify({ settings: { usdUzs: 12000, branchCfg: { f729: { debtCur: 'UZS' } } }, branchDebt: { f2: 50 }, branchStore: { f729: { cashboxes: BOXES }, f2: { cashboxes: BOXES } } })]);
  await pg.query(`insert into app_data_branches (branch_key, data) values ('f729', $1::jsonb), ('f2', $1::jsonb)`, [JSON.stringify({ cashboxes: BOXES, cashTxns: [] })]);
  await pg.exec(MIG43);   // takror — xavfsiz
  await pg.query(`select cashbox_apply_ops('f729','seed-cash','manual_in','[{"box":1,"currency":"UZS","dir":"in","amount":50000000},{"box":3,"currency":"USD","dir":"in","amount":5000}]'::jsonb)`);
  await pg.query(`select cashbox_apply_ops('f2','seed-cash2','manual_in','[{"box":3,"currency":"USD","dir":"in","amount":5000}]'::jsonb)`);
  const st = (id, filial) => ({ id, auth_user_id: 'u-' + id, role: 'sotuvchi', active: true, filial, name: 'Kassir ' + id, login: 'k' + id });
  const memTables = {
    staff: [ADMIN, st(7, 'f729'), st(8, 'f2')],
    staff_roles: [{ staff_id: 7, role_id: 'r' }, { staff_id: 8, role_id: 'r' }],
    role_permissions: PERMS.map(k => ({ role_id: 'r', permission_id: k, permissions: { key: k } })),
    staff_audit_log: [], security_events: [],
  };
  require('../netlify/functions/_lib/ledgerAuthority')._resetLedgerAuthorityCache();
  require('../netlify/functions/_lib/cashAuthority')._resetCashAuthorityCache();
  return { pg, client: makePgSupabase(pg, { pgTables: PG_TABLES, memTables, users: { 't-1': { id: 'u-1' }, 't-7': { id: 'u-7' }, 't-8': { id: 'u-8' } } }) };
}
async function withWorld(fn) { const w = await world(); try { await fn(w); } finally { unloadFunctions(); await w.pg.close(); } }
const body = (r) => JSON.parse(r.body);
const box = async (pg, f, b) => +(await pg.query(`select balance v from cashbox_balances where filial=$1 and box_local_id=$2`, [f, b])).rows[0].v;
const uzs = async (pg, f) => +((await pg.query(`select debt_uzs v from branch_debt_cur where filial=$1`, [f])).rows[0] || { v: 0 }).v;
const usdDebt = async (pg, f) => +((await pg.query(`select data->'branchDebt'->>$1 v from app_data where id='main'`, [f])).rows[0].v || 0);
const setRate = (pg, r) => pg.query(`update app_data set data = jsonb_set(data, '{settings,usdUzs}', to_jsonb($1::numeric)) where id='main'`, [r]);
const pay = (fk, tok, f, boxId, currency, amount, key, debtCur) => fk(post({ action: 'branch_pay', filial: f, boxId, currency, amount, idemKey: key, ...(debtCur ? { debtCur } : {}) }, tok));

module.exports = {
  name: 'P82 — 43-migratsiya: filialning Bazaga qarzi $ yoki soʻmda (server + PostgreSQL + brauzer)',
  cases: [
    { name: 'soʻmda hisoblashuvchi filial: qarz sotuv kunidagi kursda soʻmda; soʻm / $ kassadan toʻlov; ortiqcha va takror — xavfsiz', async run() {
      await withWorld(async ({ pg, client }) => {
        const fk = loadFunction('firma-kassa', client);
        // sotuv: 200 $ × 12 000 = 2 400 000 so'm; $ qarz o'zgarmaydi
        await pg.query(`select _branch_debt_add('f729', 200)`);
        assert.equal(await uzs(pg, 'f729'), 2400000);
        assert.equal(await usdDebt(pg, 'f729'), 0, '$ qarz yozilmadi');
        // kurs o'zgardi — avvalgi qarz o'zgarmaydi, yangi sotuv yangi kursda
        await setRate(pg, 12500);
        assert.equal(await uzs(pg, 'f729'), 2400000);
        await pg.query(`select _branch_debt_add('f729', 100)`);
        assert.equal(await uzs(pg, 'f729'), 3650000);
        // bekor qilish (manfiy) — bugungi kurs bilan kamayadi
        await pg.query(`select _branch_debt_add('f729', -10)`);
        assert.equal(await uzs(pg, 'f729'), 3525000);
        // belgilanmagan filial — avvalgidek $ da
        await pg.query(`select _branch_debt_add('f2', 30)`);
        assert.equal(await usdDebt(pg, 'f2'), 80); assert.equal(await uzs(pg, 'f2'), 0);

        // so'm kassadan 1 525 000 so'm
        let r = await pay(fk, 't-7', 'f729', 1, 'UZS', 1525000, 'bp-uzs-0001', 'UZS');
        assert.equal(r.statusCode, 200, r.body);
        assert.equal(body(r).transfer.debtUzsAfter, 2000000);
        assert.equal(await box(pg, 'f729', 1), 50000000 - 1525000);
        assert.equal(+(await pg.query(`select balance v from firma_kassa_balance where currency='UZS'`)).rows[0].v, 1525000);
        // takror — ikki marta yozilmaydi
        r = await pay(fk, 't-7', 'f729', 1, 'UZS', 1525000, 'bp-uzs-0001', 'UZS');
        assert.equal(r.statusCode, 200); assert.equal(body(r).duplicate, true);
        assert.equal(await uzs(pg, 'f729'), 2000000); assert.equal(await box(pg, 'f729', 1), 50000000 - 1525000);
        // $ kassadan: 100 $ × 12 500 = 1 250 000 so'm
        r = await pay(fk, 't-7', 'f729', 3, 'USD', 100, 'bp-usd-0001', 'UZS');
        assert.equal(r.statusCode, 200, r.body);
        assert.equal(await uzs(pg, 'f729'), 750000); assert.equal(await box(pg, 'f729', 3), 4900);
        // qarzdan ortiq — rad, hech narsa o'zgarmaydi
        r = await pay(fk, 't-7', 'f729', 1, 'UZS', 800000, 'bp-uzs-0002', 'UZS');
        assert.equal(r.statusCode, 400); assert.match(body(r).error, /oshib ketdi/);
        assert.equal(await uzs(pg, 'f729'), 750000);
        // to'liq yopish
        r = await pay(fk, 't-7', 'f729', 1, 'UZS', 750000, 'bp-uzs-0003', 'UZS');
        assert.equal(r.statusCode, 200, r.body); assert.equal(await uzs(pg, 'f729'), 0);
        r = await pay(fk, 't-7', 'f729', 1, 'UZS', 1000, 'bp-uzs-0004', 'UZS');
        assert.equal(r.statusCode, 400); assert.match(body(r).error, /qarzi yo/);
        // jurnal = qoldiq
        const j = (await pg.query(`select coalesce(sum(native_delta),0)::float8 s from branch_debt_cur_ledger where filial='f729'`)).rows[0].s;
        assert.equal(j, 0);
        // $ qarzli filial — avvalgi yo'l o'zgarmagan
        r = await pay(fk, 't-8', 'f2', 3, 'USD', 30, 'bp-f2-0001');
        assert.equal(r.statusCode, 200, r.body); assert.equal(await usdDebt(pg, 'f2'), 50);
        // yuklash: so'mdagi qarz brauzerga jadvaldan; xodim faqat o'z filialini ko'radi
        await pg.query(`select _branch_debt_add('f729', 1)`);
        const ld = loadFunction('app-data-load', client);
        r = await ld(post({}, 't-1'));
        assert.equal(r.statusCode, 200, r.body); assert.deepEqual(body(r).data.branchDebtUzs, { f729: 12500 });
        r = await ld(post({}, 't-8'));
        assert.equal(r.statusCode, 200, r.body); assert.deepEqual(body(r).data.branchDebtUzs, {});
      });
    } },
    { name: 'brauzer: kassalarda «Bazaga qarz» $ + soʻm; toʻlovda qarz valyutasi tanlanadi; filial sozlamasida valyuta', async run() {
      const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
      try {
        const r = await page.evaluate(async () => {
          closeModal(); CUR.usdUzs = 12000; save = async () => true;
          S.settings.branchCfg = { f729: { debtCur: 'UZS' } }; S.branch = 'f729';
          S.branchDebt = { f729: 40 }; S.branchDebtUzs = { f729: 2400000 };
          S.cashboxes = [{ id: 1, name: "Naqd So'm", cur: 'UZS', type: 'cash', bal: 5000000, icon: '💵' }, { id: 3, name: 'Dollar', cur: 'USD', type: 'usd', bal: 900, icon: '💲' }];
          const out = { text: flDebtTxt('f729'), usdEq: Math.round(flDebtUsdEq('f729')) };
          pgKassalar(); out.hero = document.querySelector('#pg-kassalar .fw-hero-note')?.textContent.replace(/\s+/g, ' ').trim();
          openPay729Baza(); await new Promise(r => setTimeout(r, 50));
          out.tabs = [...document.querySelectorAll('.modal-body .bs-seg button')].map(b => b.textContent);
          out.def = [_p729Cur, document.getElementById('p729-box').value, document.getElementById('p729-amt').value];
          document.getElementById('p729-box').value = '3'; p729BoxChange(); out.defUsd = document.getElementById('p729-amt').value;
          document.getElementById('p729-box').value = '1'; p729BoxChange();
          document.getElementById('p729-amt').value = '1000000';
          _cloudEnabled = true; let sent = null;
          authFetch = async (u, o) => { const b = JSON.parse(o.body || '{}'); if (b.action === 'branch_pay') sent = b; return { ok: true, status: 200, json: async () => ({ ok: true, transfer: { branchBalance: 4000000, debtUzsAfter: 1400000, debtAfter: 40 } }) }; };
          await confirmPay729Baza();
          out.sent = sent && { action: sent.action, currency: sent.currency, amount: sent.amount, debtCur: sent.debtCur };
          out.after = [S.branchDebtUzs.f729, S.branchDebt.f729];
          // $ qarz tanlansa — debtCur yuborilmaydi
          openPay729Baza('USD'); await new Promise(r => setTimeout(r, 50)); out.usdCur = _p729Cur;
          await confirmPay729Baza(); out.sentUsd = sent && sent.debtCur; closeModal();
          // filial sozlamasi: qarz valyutasi
          S.branch = 'baza'; flSettings('f729'); out.dcur = document.getElementById('fl-dcur').dataset.v;
          document.querySelector('#fl-dcur button').click(); flSettingsSave('f729'); out.saved = flDebtCur('f729');
          return out;
        });
        assert.match(r.text, /^\$40\.00 \+ 2.400.000/);
        assert.equal(r.usdEq, 240);
        assert.match(r.hero, /Bazaga qarz: \$40\.00 \+ 2.400.000/);
        assert.deepEqual(r.tabs, ['$ dagi qarz', 'Soʻmdagi qarz']);
        assert.deepEqual(r.def, ['UZS', '1', '2400000'], 'filial soʻmda — soʻm qarz oldindan tanlangan, soʻm kassa');
        assert.equal(r.defUsd, '200.00');
        assert.deepEqual(r.sent, { action: 'branch_pay', currency: 'UZS', amount: 1000000, debtCur: 'UZS' });
        assert.deepEqual(r.after, [1400000, 40]);
        assert.equal(r.usdCur, 'USD'); assert.equal(r.sentUsd, undefined);
        assert.equal(r.dcur, 'UZS'); assert.equal(r.saved, 'USD');
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    } },
  ],
};
