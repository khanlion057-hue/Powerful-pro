// Netlify Function — diller ombori qoldig'ini yozadi (upsert, dealer_id+pid bo'yicha).
// Himoyalangan: "dillerlar.manage" ruxsati (yoki admin), faqat O'Z filialidagi dillerga.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, serverError } = require('./_lib/supabaseAdmin');
const { legacyDealerBlocked } = require('./_lib/dealerAtomic');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { dealerId, pid, sku, name, qty, avgCostUsd } = body;
  if (!dealerId || !pid) return json({ error: 'dealerId va pid majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-stock-upsert', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'dillerlar.manage' });
  if (!auth.ok) return auth.response;
  try { const blocked = await legacyDealerBlocked(admin, 'dealer-stock-upsert'); if (blocked) return blocked; }
  catch (e) { return serverError(e, 'dealer-stock-upsert', 'Server xatosi'); }

  const filialCheck = await assertOwnFilial(admin, 'dealers', dealerId, auth);
  if (!filialCheck.ok) return filialCheck.response;

  // ── P3-1: SERVER-TOMON VALIDATSIYA ──
  // Bu funksiya "to'liq qiymatni yozish" (upsert) sifatida ishlaydi — ortirish
  // (send) ham, kamaytirish (sale/return) ham shu orqali o'tadi, shuning uchun
  // "diller qoldig'idan oshmasin" tekshiruvi BU YERDA emas (niyat noma'lum),
  // balki harakat ma'lumoti bor dealer-sale-add.js/dealer-stock-move-add.js'da.
  // Bu yerda faqat qiymatlarning o'zi mantiqan to'g'ri (manfiy emas) ekanligi tekshiriladi.
  const qtyNum = Number(qty || 0);
  const costNum = Number(avgCostUsd || 0);
  if (qtyNum < 0) return json({ error: "Qoldiq manfiy bo'lishi mumkin emas" }, 400);
  if (costNum < 0) return json({ error: "Tannarx manfiy bo'lishi mumkin emas" }, 400);

  try {
    const { error } = await admin.from('dealer_stock').upsert(
      { dealer_id: dealerId, pid, sku, name, qty: qtyNum, avg_cost_usd: costNum, updated_at: new Date().toISOString() },
      { onConflict: 'dealer_id,pid' }
    );
    if (error) throw error;
    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: "Yozishda xatolik" }, 500);
  }
};
