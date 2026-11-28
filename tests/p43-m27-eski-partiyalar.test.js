// P43 — v24.5 (v23.10.2 P32 dan): 27-migratsiya va eski SQL partiyalar (production'dagi 5 ta / 41 dona holatining nusxasi).
//  A) omborda YO'Q: 27 asl qatorni arxivga to'liq yozadi (o'chirmaydi), FIFO'dan chiqaradi — sotib bo'lmaydi, ilova ko'rmaydi;
//     egasi 'confirmed_absent' belgilaydi.
//  B) omborda BOR: supabase-owner-27-tiklash.sql — boshlang'ich qoldiq (asl tannarx, asl sana), ombor jurnali, ilova JSON;
//     takror ishga tushirish — dublikat yo'q; tiklangan partiyadan FIFO sotuv asl tannarx bilan; jurnal = qoldiq.
//  Haqiqiy PostgreSQL (PGlite) + haqiqiy `app-data-load` va `sale-checkout-atomic`.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeWorld, makeClient, schemaParts } = require('./helpers/f4b-world');
const { loadFunction, unloadFunctions, post } = require('./helpers/mem-supabase');

const ROOT = path.join(__dirname, '..');   // loyiha ildizi
const RESTORE = fs.readFileSync(path.join(ROOT, 'supabase-owner-27-tiklash.sql'), 'utf8');
const REPORT = fs.readFileSync(path.join(ROOT, 'supabase-owner-27-eski-partiyalar.sql'), 'utf8');
// production'dagi 5 ta eski partiya (2026-08-20) — aynan o'sha miqdor va tannarx
const STALE = [[1, '1787241153655013', 1786272054019126, 2, 25.021158820854644], [2, '1787241153655014', 1786272054021249, 5, 34.92268585720393],
  [3, '1787241153655015', 1786272054021261, 9, 54.72573992990251], [22, '1787241298259012', 1786272054022306, 10, 8.375950609403269],
  [23, '1787241298260013', 1786272054019117, 15, 15.017732077489278]];

async function world() {
  const pg = await makeWorld({ baza: { batches: [] } }, { apply27: false });
  for (const [id, lid, pid, qty, cost] of STALE) {
    await pg.query(`insert into batches (id, local_id, filial, pid, qty, sold, cost_usd, status, consignment, batch_date) overriding system value values ($1, $2, 'baza', $3, $4, 0, $5, 'active', false, '2026-08-20')`, [id, lid, pid, qty, cost]);
  }
  await pg.exec(`select setval(pg_get_serial_sequence('public.batches', 'id'), 100)`);   // production'dagi kabi: sequence mavjud ID'lardan oldinda
  await pg.exec(schemaParts().mig27);
  return pg;
}
const rows = async (pg, sql, p) => (await pg.query(sql, p)).rows;
const one = async (pg, sql, p) => (await rows(pg, sql, p))[0];

async function testOptionA() {
  const pg = await world();
  const client = makeClient(pg);
  try {
    const arch = await one(pg, `select count(*)::int n, sum(qty - sold)::int q, round(sum((qty - sold) * cost_usd), 2)::text v, string_agg(distinct decision, ',') d from m27_stale_batches_archive`);
    assert.deepEqual(arch, { n: 5, q: 41, v: '1026.21', d: 'pending' }, '5 ta, 41 dona, $1 026.21 — arxivda, qaror kutilmoqda');
    assert.deepEqual(await one(pg, `select count(*)::int n, string_agg(distinct status, ',') s, sum(qty)::int q from batches`), { n: 5, s: 'deleted', q: 41 }, "qatorlar O'CHIRILMADI, miqdor saqlandi, FIFO'dan chiqdi");
    assert.equal((await one(pg, `select count(*)::int n from stock_ledger where op_kind = 'archive'`)).n, 5);
    assert.equal((await one(pg, `select (original->>'qty')::numeric q from m27_stale_batches_archive where batch_id = 23`)).q, '15', 'asl qator to\'liq');
    // FIFO: arxivlangan partiyadan sotib bo'lmaydi
    await assert.rejects(pg.query(`select stock_debt_op('baza', 'a-out-1', 'stock_out', $1::jsonb)`, [JSON.stringify({ reason: 'dealer', dealerId: '1', items: [{ pid: 1786272054019117, qty: 1 }] })]), /yetarli|qoldiq/i);
    // ilova — ko'rmaydi
    const d = JSON.parse((await loadFunction('app-data-load', client)(post({}, 't-admin'))).body);
    assert.equal((d.data.branchStore.baza.batches || []).length, 0);
    // egasi hisoboti ishlaydi (faqat o'qiydi)
    assert.equal((await rows(pg, REPORT)).length, 5);
    // A: egasi tasdiqlaydi
    await pg.exec(`update m27_stale_batches_archive set decision = 'confirmed_absent', decided_at = now(), decided_by = 'Egasi'`);
    await pg.exec(RESTORE);   // A dan keyin tiklash — hech narsa qilmaydi
    assert.equal((await one(pg, `select count(*)::int n from batches where local_id like 'm27r-%'`)).n, 0, "confirmed_absent — tiklanmaydi");
  } finally { unloadFunctions(); await pg.close(); }
}

async function testOptionB() {
  const pg = await world();
  const client = makeClient(pg);
  try {
    // 1 tasi yo'q (egasi belgilaydi), 4 tasi bor
    await pg.exec(`update m27_stale_batches_archive set decision = 'confirmed_absent', decided_by = 'Egasi' where batch_id = 1`);
    await pg.exec(RESTORE);
    const b = await rows(pg, `select local_id, qty::int q, sold::int s, round(cost_usd, 6)::text c, status, batch_date::text d from batches where local_id like 'm27r-%' order by local_id`);
    assert.deepEqual(b.map(x => [x.local_id, x.q, x.s, x.status, x.d]), [['m27r-2', 5, 0, 'active', '2026-08-20'], ['m27r-22', 10, 0, 'active', '2026-08-20'], ['m27r-23', 15, 0, 'active', '2026-08-20'], ['m27r-3', 9, 0, 'active', '2026-08-20']]);
    assert.equal(b.find(x => x.local_id === 'm27r-23').c, '15.017732', 'asl tannarx');
    assert.equal((await one(pg, `select round(sum(qty * cost_usd), 2)::text v from batches where local_id like 'm27r-%'`)).v, '976.17', "ombor qiymati: 4 partiya (1-si tasdiqlangan yo'q: 2 × 25.02 = 50.04)");
    assert.deepEqual(await one(pg, `select string_agg(decision || ':' || batch_id, ',' order by batch_id) d from m27_stale_batches_archive`), { d: 'confirmed_absent:1,reentered:2,reentered:3,reentered:22,reentered:23' });
    assert.equal((await one(pg, `select count(*)::int n from stock_ledger l join batches b on b.id = l.batch_id where b.local_id like 'm27r-%' and l.op_kind = 'opening_stock'`)).n, 4, 'ombor jurnali');
    assert.equal((await one(pg, `select count(*)::int n from supplier_balances where debt <> 0`)).n, 0, "ta'minotchi qarziga tegilmadi");
    // takror — dublikat yo'q
    await pg.exec(RESTORE);
    assert.equal((await one(pg, `select count(*)::int n from batches where local_id like 'm27r-%'`)).n, 4);
    const j = (await one(pg, `select data from app_data_branches where branch_key = 'baza'`)).data;
    assert.equal(j.batches.filter(x => /^m27r-/.test(x.id)).length, 4, 'ilova JSON — 4 ta, takrorsiz');
    // ilova ko'radi — qoldiq bazadan
    const d = JSON.parse((await loadFunction('app-data-load', client)(post({}, 't-admin'))).body);
    const vis = (d.data.branchStore.baza.batches || []).filter(x => /^m27r-/.test(x.id)).map(x => [x.id, x.qty, x.sold, +(+x.costUsd).toFixed(4)]).sort();
    assert.deepEqual(vis, [['m27r-2', 5, 0, 34.9227], ['m27r-22', 10, 0, 8.376], ['m27r-23', 15, 0, 15.0177], ['m27r-3', 9, 0, 54.7257]]);
    // FIFO sotuv — tiklangan partiyadan, asl tannarx bilan
    const r = JSON.parse(JSON.stringify((await pg.query(`select stock_debt_op('baza', 'b-out-1', 'stock_out', $1::jsonb) r`, [JSON.stringify({ reason: 'dealer', dealerId: '1', items: [{ pid: 1786272054019117, qty: 3 }] })])).rows[0].r));
    assert.equal(+(+r.items[0].firstCost).toFixed(6), 15.017732, 'FIFO tannarxi — asl partiyaniki');
    assert.equal((await one(pg, `select sold::int s from batches where local_id = 'm27r-23'`)).s, 3);
    // izchillik: har partiya qty/sold = ombor jurnali yig'indisi
    assert.equal((await one(pg, `select bool_and(b.qty = l.q and b.sold = l.s) ok from batches b join (select batch_id, sum(d_qty) q, sum(d_sold) s from stock_ledger group by batch_id) l on l.batch_id = b.id`)).ok, true);
    // asl (deleted) qatorlar — o'zgarmagan
    assert.deepEqual(await one(pg, `select count(*)::int n, sum(qty)::int q from batches where status = 'deleted'`), { n: 5, q: 41 });
  } finally { unloadFunctions(); await pg.close(); }
}

module.exports = {
  name: "P43 — v24.5 (v23.10.2 P32 dan): 27-migratsiya va eski partiyalar (5 ta, 41 dona, $1 026.21): A — arxiv/FIFO'dan chiqadi, B — boshlang'ich qoldiq sifatida tiklash",
  cases: [
    { name: "A (omborda yo'q): arxivda to'liq, qatorlar o'chirilmaydi, sotib bo'lmaydi, ilova ko'rmaydi; confirmed_absent — tiklanmaydi", run: testOptionA },
    { name: "B (omborda bor): asl tannarx/sana bilan boshlang'ich qoldiq, jurnal, ilova JSON, takrorsiz, FIFO sotuv, qarzga tegmaydi", run: testOptionB },
  ],
};
