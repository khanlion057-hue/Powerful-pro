// Netlify Function — diller o'z omboridan sotgan mahsulotlarni dealer_sales'ga yozadi.
// Himoyalangan: "dillerlar.manage" ruxsati (yoki admin), faqat O'Z filialidagi dillerga.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, serverError } = require('./_lib/supabaseAdmin');
const { legacyDealerBlocked } = require('./_lib/dealerAtomic');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { dealerId, items, saleDate } = body;
  if (!dealerId || !Array.isArray(items) || !items.length) {
    return json({ error: 'dealerId va items majburiy' }, 400);
  }

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-sale-add', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'dillerlar.manage' });
  if (!auth.ok) return auth.response;
  try { const blocked = await legacyDealerBlocked(admin, 'dealer-sale-add'); if (blocked) return blocked; }
  catch (e) { return serverError(e, 'dealer-sale-add', 'Server xatosi'); }

  const filialCheck = await assertOwnFilial(admin, 'dealers', dealerId, auth);
  if (!filialCheck.ok) return filialCheck.response;

  // ── P3-1: SERVER-TOMON VALIDATSIYA (client natijasiga ko'r-ko'rona ishonilmaydi) ──
  for (const i of items) {
    if (!i.pid || !(i.qty > 0) || !(i.sellUsd >= 0)) {
      return json({ error: `Noto'g'ri qiymat: pid=${i.pid}, qty=${i.qty}, sellUsd=${i.sellUsd}` }, 400);
    }
  }
  // Diller ombor qoldig'ini serverdan o'qib, sotilayotgan miqdor oshmasligini tekshiramiz
  const pids = items.map(i => i.pid);
  const { data: stockRows, error: stockErr } = await admin.from('dealer_stock')
    .select('pid,qty').eq('dealer_id', dealerId).in('pid', pids);
  if (stockErr) return json({ error: "Ombor qoldig'ini tekshirishda xatolik" }, 500);
  const stockMap = {};
  (stockRows || []).forEach(r => { stockMap[r.pid] = Number(r.qty) || 0; });
  for (const i of items) {
    const avail = stockMap[i.pid] || 0;
    if (i.qty > avail) {
      return json({ error: `"${i.name || i.sku || i.pid}" — dillerda faqat ${avail} dona bor, ${i.qty} sotib bo'lmaydi` }, 400);
    }
  }

  // Idempotency: bir xil diller uchun so'nggi 5 soniyada AYNAN bir xil (mahsulot+miqdor+narx)
  // savdo yozuvi topilsa — bu tarmoq-retry (takroriy so'rov) deb hisoblanadi va qayta yozilmaydi
  const fiveSecAgo = new Date(Date.now() - 5000).toISOString();
  const { data: recentSales } = await admin.from('dealer_sales')
    .select('pid,qty,sell_usd,created_at').eq('dealer_id', dealerId).gte('created_at', fiveSecAgo);
  if (recentSales && recentSales.length === items.length) {
    const isDuplicate = items.every(i => recentSales.some(r =>
      r.pid === i.pid && Number(r.qty) === Number(i.qty) && Number(r.sell_usd) === Number(i.sellUsd)
    ));
    if (isDuplicate) {
      return json({ ok: true, duplicate: true }, 200); // muvaffaqiyatli deb qaytariladi, qayta yozilmaydi
    }
  }

  try {
    const rows = items.map(i => ({
      dealer_id: dealerId, pid: i.pid, sku: i.sku, name: i.name,
      qty: i.qty, sell_usd: i.sellUsd, total_usd: +(i.qty * i.sellUsd).toFixed(2), sale_date: saleDate
    }));
    const { error } = await admin.from('dealer_sales').insert(rows);
    if (error) throw error;
    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: "Yozishda xatolik" }, 500);
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('dealer-sale-add', exports.handler);
