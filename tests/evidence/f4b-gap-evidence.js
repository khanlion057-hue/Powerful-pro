// DALIL SKRIPTI (npm test'ga KIRMAYDI): F4b — final gate'da topilgan 4 ta kamchilik (A–D) HAQIQIY server
// funksiyalari va PostgreSQL (PGlite) bilan tekshiriladi.
//   node tests/evidence/f4b-gap-evidence.js          — joriy kod + 27-migratsiya (kutilgan: 4/4 TUZATILGAN)
//   node tests/evidence/f4b-gap-evidence.js --old    — 27-migratsiyasiz baza (negativ nazorat: kamchilik ko'rinadi)
// Bu skript natijani "PASS" deb yashirmaydi: har bir band bazadagi haqiqiy qiymat bilan chiqariladi.
const { makeWorld, makeClient } = require('../helpers/f4b-world');
const { loadFunction, unloadFunctions, post } = require('../helpers/mem-supabase');

const OLD = process.argv.includes('--old');
const BR = {
  f729: {
    customers: [{ id: 5001, name: 'Ali', debt: 600000 }],
    suppliers: [{ id: 7001, name: 'X', debt: 100, paid: 0 }],
    batches: [{ id: 11, pid: 101, qty: 3, sold: 0, costUsd: 5, date: '2026-09-01', status: 'active' }],
  },
};

(async () => {
  const pg = await makeWorld(BR, { apply27: !OLD });
  if (OLD) {
    // 27-migratsiyasiz: avvalgi holat — partiya SQL'da "soya" sifatida (shadow-sync orqali yozilardi)
    await pg.exec(`insert into batches (local_id, filial, pid, qty, sold, cost_usd, batch_date, status) values ('11','f729',101,3,0,5,'2026-09-01','active')`);
  }
  const client = makeClient(pg);
  const one = async (sql) => (await pg.query(sql)).rows[0];
  const out = [];
  try {
    const sale = loadFunction('sale-checkout-atomic', client);
    const sync = loadFunction('batches-shadow-sync', client);
    const save = loadFunction('app-data-branch-save', client);
    const ops = loadFunction('cashbox-ops', client);

    // A) Ombor: savdo 2 dona → eski brauzer nusxasi (sold=0) yuboriladi → keyin 3 dona savdo
    let r = await sale(post({ filial: 'f729', saleLocalId: '9001', items: [{ pid: 101, qty: 2, sellUsd: 10, costUsd: 5 }], paidUsd: 20, boxPayments: [{ box_id: 3, amount_native: 20 }], inv: 'INV-1', idemKey: 'ck-a1' }, 't-kas'));
    const soldAfterSale = Number((await one(`select sold from batches where local_id='11'`)).sold);
    await sync(post({ localId: '11', filial: 'f729', pid: 101, qty: 3, sold: 0, costUsd: 5, status: 'active' }, 't-kas'));
    await save(post({ branchKey: 'f729', data: { ...BR.f729, cashboxes: [{ id: 1, name: 'Naqd', cur: 'UZS', bal: 5000000 }, { id: 3, name: 'Dollar', cur: 'USD', bal: 1000 }],
      batches: [{ id: 11, pid: 101, qty: 3, sold: 0, costUsd: 5, date: '2026-09-01', status: 'active' }] } }, 't-kas'));
    let directWrite = 'ruxsat etildi';
    try { await pg.query(`update batches set sold = 0 where local_id = '11'`); } catch (e) { directWrite = 'rad etildi (trigger)'; }
    const soldAfterStale = Number((await one(`select sold from batches where local_id='11'`)).sold);
    r = await sale(post({ filial: 'f729', saleLocalId: '9002', items: [{ pid: 101, qty: 3, sellUsd: 10, costUsd: 5 }], paidUsd: 30, boxPayments: [{ box_id: 3, amount_native: 30 }], inv: 'INV-2', idemKey: 'ck-a2' }, 't-kas'));
    const oversold = r.statusCode === 200;
    const soldFinal = Number((await one(`select sold from batches where local_id='11'`)).sold);
    out.push(['A. Ombor (sold/qty): eski brauzer nusxasi',
      `savdodan keyin sold=${soldAfterSale}; eski nusxa (shadow-sync + JSON saqlash, sold=0) → sold=${soldAfterStale}; to'g'ridan-to'g'ri SQL UPDATE — ${directWrite}; ` +
      `keyin 3 dona savdo — ${oversold ? "O'TDI (ortiqcha sotuv)" : 'RAD ETILDI (' + (JSON.parse(r.body).error || '').slice(0, 60) + ')'}; yakuniy sold=${soldFinal} (partiya 3)`,
      oversold || soldAfterStale < soldAfterSale || soldFinal > 3]);

    // B) Mijoz qarzi 600 000: ikki qurilmadan 2×400 000 (turli kalit)
    const pay = (key, amt, tok) => ops(post({ filial: 'f729', key, kind: 'cust_debt_pay', ops: [{ box: 1, dir: 'in', amount: amt }], record: { customerId: 5001 } }, tok));
    const cash0 = Number((await one(`select balance from cashbox_balances where filial='f729' and box_local_id=1`)).balance);
    const [p1, p2] = [await pay('cp-bbbb1', 400000, 't-kas'), await pay('cp-bbbb2', 400000, 't-kas2')];
    const cash1 = Number((await one(`select balance from cashbox_balances where filial='f729' and box_local_id=1`)).balance);
    const recs = Number((await one(`select count(*)::int n from customer_debt_payments`)).n);
    const both = p1.statusCode === 200 && p2.statusCode === 200;
    out.push(['B. Mijoz qarzi: qarz 600 000, 2×400 000',
      `1-to'lov ${p1.statusCode}, 2-to'lov ${p2.statusCode}${p2.statusCode !== 200 ? ' (' + (JSON.parse(p2.body).error || '').slice(0, 70) + ')' : ''}; kassaga +${cash1 - cash0}; to'lov yozuvlari ${recs}`,
      both || cash1 - cash0 > 400000]);

    // B2) Eski brauzer qarzni 2 000 000 deb yuboradi — server buni qabul qilmaydi
    await save(post({ branchKey: 'f729', data: { customers: [{ id: 5001, name: 'Ali', debt: 2000000 }] } }, 't-kas'));
    const p3 = await pay('cp-bbbb3', 1000000, 't-kas');
    const custDebt = Number((await one(`select coalesce((select debt from customer_balances where filial='f729' and customer_local_id=5001), -1) d`)).d);
    const jsonDebt = Number((await one(`select (c->>'debt')::numeric d from app_data_branches, jsonb_array_elements(data->'customers') c where branch_key='f729' and c->>'id'='5001'`)).d);
    out.push(["B2. Brauzer yuborgan qarz (2 000 000) — server ishonadimi",
      `JSON'ga yozilgan qarz=${jsonDebt}; bazadagi qarz=${custDebt}; 1 000 000 to'lov — ${p3.statusCode === 200 ? "O'TDI" : 'RAD ETILDI'}`,
      p3.statusCode === 200 || jsonDebt === 2000000]);

    // C) Ta'minotchi qarzi 100$: 2×80$
    const spay = (key, tok) => ops(post({ filial: 'f729', key, kind: 'supp_pay', ops: [{ box: 3, dir: 'out', amount: 80 }], record: { supplierId: 7001 } }, tok));
    const usd0 = Number((await one(`select balance from cashbox_balances where filial='f729' and box_local_id=3`)).balance);
    const [s1, s2] = [await spay('sp-cccc1', 't-man'), await spay('sp-cccc2', 't-man')];
    const usd1 = Number((await one(`select balance from cashbox_balances where filial='f729' and box_local_id=3`)).balance);
    const sboth = s1.statusCode === 200 && s2.statusCode === 200;
    out.push(["C. Ta'minotchi qarzi: qarz 100$, 2×80$", `1-to'lov ${s1.statusCode}, 2-to'lov ${s2.statusCode}; kassadan −${usd0 - usd1}$`, sboth || usd0 - usd1 > 80]);

    // D) SQL qoldiq jadvallari to'lovlardan keyin
    const cb = await one(`select coalesce((select debt::text from customer_balances where filial='f729' and customer_local_id=5001), 'yo''q') d`);
    const sb = await one(`select coalesce((select debt::text from supplier_balances where filial='f729' and supplier_local_id=7001), 'yo''q') d`);
    const dOk = Number(cb.d) === 200000 && Number(sb.d) === 20;
    out.push(['D. customer_balances / supplier_balances', `mijoz: ${cb.d} (kutilgan 200000); ta'minotchi: ${sb.d} (kutilgan 20)`, !dOk]);
  } finally { unloadFunctions(); await pg.close(); }
  console.log(`F4b — ${OLD ? "27-MIGRATSIYASIZ (negativ nazorat)" : '27-migratsiya bilan'} (HAQIQIY server funksiyalari + PostgreSQL):`);
  out.forEach(([a, b, bad]) => console.log(`${bad ? '❌ QAYTA HOSIL QILINDI' : '✅ TUZATILGAN'} — ${a}: ${b}`));
  const bad = out.filter(x => x[2]).length;
  console.log(`JAMI: ${out.length - bad}/${out.length} tuzatilgan`);
  process.exit(OLD ? 0 : (bad ? 1 : 0));
})().catch((e) => { console.error('❌', e); process.exit(1); });
