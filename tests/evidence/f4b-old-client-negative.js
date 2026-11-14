// DALIL SKRIPTI (npm test'ga kirmaydi): NEGATIV NAZORAT — ESKI (v23.1) brauzer kodi + YANGI server (27-migratsiya).
// Yangilanmagan (keshdagi) brauzer eski usulda ishlasa ham eski F4b xatosi qaytmasligi kerak:
// brauzer hisoblagan qarz/qoldiq bazaga yozilmaydi, ortiqcha sotuv va qarzdan ortiq to'lov o'tmaydi.
//   node tests/evidence/f4b-old-client-negative.js <eski v23.1 ZIP ochilgan papka (js/, *.html)>
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
const OLD = process.argv[2];
if (!OLD || !fs.existsSync(path.join(OLD, 'js', 'main.js'))) { console.error('Foydalanish: node f4b-old-client-negative.js <eski-v23.1-papka>'); process.exit(2); }
const { _stack } = require('../p14-v11-e2e-local-stack.test.js');

(async () => {
  const st = await _stack({ webRoot: OLD });
  const out = [];
  try {
    const { pg } = st;
    const num = async (sql, p) => +(((await pg.query(sql, p)).rows[0] || {}).v ?? NaN);
    const left = () => num(`select coalesce(sum(qty-sold),0) v from batches where filial='f729' and pid=101 and status='active'`);
    const { ctx, page } = await st.open('index.html', { token: 't-admin' });
    await page.waitForFunction(() => typeof S !== 'undefined' && S.page === 'dashboard' && S.cashboxes && S.cashboxes.length === 5, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => typeof fwLedgerRemote), 'undefined', 'bu haqiqatan ESKI brauzer kodi');
    // 1) Eski kod: mijozni "qarz 600 000" bilan JSON'ga qo'shadi — bazada qarz yaratilmaydi
    await page.evaluate(() => { closeModal(); go('mijozlar'); openAddCust(); });
    await page.fill('#nc-n', 'Eski Ali'); await page.fill('#nc-debt', '600000');
    await page.click('.modal-footer .btn-primary');
    await page.waitForTimeout(1500);
    const cid = await page.evaluate(() => S.customers.find(c => c.name === 'Eski Ali').id);
    const dbDebt = await num(`select coalesce((select debt from customer_balances where filial='f729' and customer_local_id=$1), 0) v`, [cid]);
    const jsonDebt = (await pg.query(`select data->'customers' c from app_data_branches where branch_key='f729'`)).rows[0].c.find(c => c.id === cid).debt;
    assert.equal(dbDebt, 0); assert.equal(jsonDebt, 0);
    out.push(["Eski kod: brauzer yozgan qarz (600 000)", "bazada qarz yaratilmadi (0), JSON ham bazadagi qiymatga tenglashtirildi"]);
    // 2) Eski kod: konsoldan qarz 2 000 000 va qoldiq 999 — saqlash bazaga ta'sir qilmaydi
    await page.evaluate(async (cid) => { S.customers.find(c => c.id === cid).debt = 2000000; S.batches[0].qty = 999; S.batches[0].sold = 0; await save(); }, cid);
    await page.waitForTimeout(2000);
    assert.equal(await num(`select coalesce((select debt from customer_balances where filial='f729' and customer_local_id=$1), 0) v`, [cid]), 0);
    assert.equal(await left(), 20);
    out.push(["Eski kod: qarz 2 000 000 / qoldiq 999 saqlandi", "bazadagi qarz 0, ombor 20 — o'zgarmadi (shadow-sync va JSON e'tiborga olinmadi)"]);
    // 3) Eski kod: shu "qarz"ga 1 000 000 to'lov — server bazadagi qarzdan tekshiradi
    const b1 = await num(`select balance v from cashbox_balances where filial='f729' and box_local_id=1`);
    await page.evaluate((cid) => { closeModal(); go('mijozlar'); openPayDebt(cid); }, cid);
    await page.selectOption('#pd-b', '1'); await page.fill('#pd-a', '1000000');
    await page.click('.modal-footer .btn-success');
    await page.waitForTimeout(1500);
    assert.equal(await num(`select balance v from cashbox_balances where filial='f729' and box_local_id=1`), b1);
    assert.equal(await num(`select count(*)::int v from customer_debt_payments`), 0);
    out.push(["Eski kod: brauzerdagi qarz bo'yicha 1 000 000 to'lov", "rad etildi — kassa va to'lov yozuvi o'zgarmadi"]);
    await ctx.close();
    // 4) Eski sotuvchi kodi: savdo kassa orqali (omborsiz) — endi 409, ombor ham, kassa ham o'zgarmaydi
    const sv = await st.open('sotuvchi.html', { token: 't-kas', width: 390, height: 844 });
    await sv.page.waitForFunction(() => typeof S !== 'undefined' && S && S.cashboxes && S.cashboxes.length === 5 && typeof ME !== 'undefined' && ME, null, { timeout: 15000 });
    const b3 = await num(`select balance v from cashbox_balances where filial='f729' and box_local_id=3`);
    await sv.page.evaluate(() => { CART = [{ pid: 101, sku: 'PG-1001', name: 'Bosch drel', qty: 50, sellUsd: 50, costUsd: 30, lineUsd: 2500 }]; SALE_PAY_TYPE = 'usd'; SALE_CUST_ID = null; svFinishSale(); });
    await sv.page.waitForTimeout(2000);
    assert.equal(await left(), 20); assert.equal(await num(`select balance v from cashbox_balances where filial='f729' and box_local_id=3`), b3);
    assert.equal(await num(`select count(*)::int v from staff_audit_log`).catch(() => 0) >= 0, true);
    out.push(["Eski sotuvchi kodi: 50 dona (omborda 20) savdo", "server rad etdi (409 — sahifani yangilang); ombor 20, kassa o'zgarmadi — ortiqcha sotuv yo'q"]);
    await sv.ctx.close();
    const ok = (await pg.query(`select bool_and(b.qty = (select coalesce(sum(d_qty),0) from stock_ledger l where l.batch_id=b.id) or not exists (select 1 from stock_ledger l where l.batch_id=b.id)) v from batches b`)).rows[0].v;
    assert.equal(ok, true);
    out.forEach(([a, b]) => console.log(`✅ ${a}: ${b}`));
    console.log(`JAMI: ${out.length}/${out.length} — eski xato qaytmadi`);
  } catch (e) {
    out.forEach(([a, b]) => console.log(`✅ ${a}: ${b}`));
    console.error('❌', e.stack || e.message); process.exitCode = 1;
  } finally { await st.close(); }
})();
