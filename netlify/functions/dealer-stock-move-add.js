// Netlify Function — diller ombor harakati tarixiga yozuv qo'shadi (send/return).
// Himoyalangan: "dillerlar.manage" ruxsati (yoki admin), faqat O'Z filialidagi dillerga.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, serverError } = require('./_lib/supabaseAdmin');
const { legacyDealerBlocked } = require('./_lib/dealerAtomic');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { dealerId, type, pid, sku, name, qty, costUsd, reason, condition } = body;
  if (!dealerId || !type || !pid) return json({ error: 'dealerId, type va pid majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-stock-move-add', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'dillerlar.manage' });
  if (!auth.ok) return auth.response;
  try { const blocked = await legacyDealerBlocked(admin, 'dealer-stock-move-add'); if (blocked) return blocked; }
  catch (e) { return serverError(e, 'dealer-stock-move-add', 'Server xatosi'); }

  const filialCheck = await assertOwnFilial(admin, 'dealers', dealerId, auth);
  if (!filialCheck.ok) return filialCheck.response;

  // ── P3-1: SERVER-TOMON VALIDATSIYA ──
  const qtyNum = Number(qty);
  const costNum = Number(costUsd || 0);
  if (!(qtyNum > 0)) return json({ error: "Miqdor musbat bo'lishi kerak" }, 400);
  if (costNum < 0) return json({ error: "Tannarx manfiy bo'lishi mumkin emas" }, 400);
  if (type !== 'send' && type !== 'return') return json({ error: "type faqat 'send' yoki 'return' bo'lishi mumkin" }, 400);

  // "return" — dillerdan omborga qaytarish — diller ombiridagi qoldiqdan oshmasligi kerak.
  // "send" (ombordan dillerga yuborish) uchun bunday tekshiruv shart emas.
  if (type === 'return') {
    const { data: stockRow, error: stErr } = await admin.from('dealer_stock')
      .select('qty').eq('dealer_id', dealerId).eq('pid', pid).maybeSingle();
    if (stErr) return json({ error: "Ombor qoldig'ini tekshirishda xatolik" }, 500);
    const avail = Number(stockRow?.qty) || 0;
    if (qtyNum > avail) {
      return json({ error: `Dillerda faqat ${avail} dona bor, ${qtyNum} qaytarib bo'lmaydi` }, 400);
    }
  }

  try {
    const { error } = await admin.from('dealer_stock_moves').insert({
      dealer_id: dealerId, type, pid, sku, name, qty: qtyNum, cost_usd: costNum,
      reason: reason || null, condition: condition || null
    });
    if (error) throw error;
    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: "Yozishda xatolik" }, 500);
  }
};
