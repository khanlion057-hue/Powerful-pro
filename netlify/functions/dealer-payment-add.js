// Netlify Function — dillerdan qabul qilingan to'lovni yozadi.
// Himoyalangan: "dillerlar.manage" ruxsati (yoki admin), faqat O'Z filialidagi dillerga.
const { legacyCashBlocked } = require('./_lib/cashAuthority');
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, serverError } = require('./_lib/supabaseAdmin');
const { claimIdempotent, completeIdempotent, releaseIdempotent, claimResponse } = require('./_lib/idempotency');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { dealerId, amountUsd, note } = body;
  if (!dealerId || !amountUsd) return json({ error: 'dealerId va amountUsd majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-payment-add', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'dillerlar.manage' });
  if (!auth.ok) return auth.response;

  // v23: 24-migratsiyadan keyin pul harakati faqat cashbox-ops orqali (kassa + yozuv bitta
  // tranzaksiyada). Bu eski yo'l moliyaviy yozuvni rad etadi — jimgina "yarim" yozuv bo'lmasin.
  const blocked = await legacyCashBlocked(admin, 'dealer-payment-add');
  if (blocked) return blocked;

  const filialCheck = await assertOwnFilial(admin, 'dealers', dealerId, auth);
  if (!filialCheck.ok) return filialCheck.response;

  // ── P3-1: SERVER-TOMON VALIDATSIYA ──
  const amt = Number(amountUsd);
  if (!(amt > 0) || !Number.isFinite(amt) || amt > 1e9) return json({ error: "To'lov summasi musbat bo'lishi kerak" }, 400);

  // v10 (F6): ustun nomi `debt_usd` — avval `debt` so'ralardi, PostgREST xato
  // qaytarib, HAR BIR diller to'lovi "Diller topilmadi" bilan rad etilardi.
  const { data: dealerRow, error: dErr } = await admin.from('dealers').select('debt_usd').eq('id', dealerId).maybeSingle();
  if (dErr || !dealerRow) return json({ error: 'Diller topilmadi' }, 404);
  const debt = Number(dealerRow.debt_usd) || 0;
  if (amt > debt + 0.01) { // 0.01 — kasr yaxlitlashdagi mayda farqlarga tolerantlik
    return json({ error: `To'lov summasi (${amt}) diller qarzidan (${debt}) oshib ketdi` }, 400);
  }

  // v10: klient idemKey yuborsa — ishonchli idempotency (band qilish); aks holda eski
  // "5 soniyada aynan bir xil summa" evristikasi (orqaga moslik)
  const claim = await claimIdempotent(admin, body.idemKey, 'dealer-payment-add');
  const early = claimResponse(claim, json);
  if (early) return early;

  if (!claim.claimed) {
  // Idempotency: so'nggi 5 soniyada AYNAN bir xil summa bilan yozilgan to'lov bo'lsa — takroriy deb hisoblanadi
  const fiveSecAgo = new Date(Date.now() - 5000).toISOString();
  const { data: recentPay } = await admin.from('dealer_payments')
    .select('amount_usd,created_at').eq('dealer_id', dealerId).gte('created_at', fiveSecAgo);
  if (recentPay && recentPay.some(r => Math.abs(Number(r.amount_usd) - amt) < 0.001)) {
    return json({ ok: true, duplicate: true }, 200);
  }
  }

  try {
    const { error } = await admin.from('dealer_payments').insert({
      dealer_id: dealerId, amount_usd: amt, note: String(note || '').slice(0, 300)
    });
    if (error) throw error;
    await completeIdempotent(admin, claim, { ok: true });
    return json({ ok: true }, 200);
  } catch (e) {
    await releaseIdempotent(admin, claim);
    return serverError(e, 'dealer-payment-add', "Yozishda xatolik");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('dealer-payment-add', exports.handler);
