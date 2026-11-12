// Netlify Function — P3-9: Ta'minotchiga to'lov — server-tomon BLOKLOVCHI
// validatsiya. Bu — dealer_payments'dan FARQLI: S.suppliers (admin savdo
// bo'limidagi ta'minotchi) — hozircha alohida SQL jadval emas, shuning uchun
// qarz miqdorini CLIENT yuboradi (debtBeforePayment) — bu, keyingi bosqichda
// suppliers SQL jadvalga ko'chirilsa, to'liq server-tomon tekshiruvga aylanadi.
// Hozircha — kamida "manfiy/mantiqsiz qiymat" va "idempotency" himoyalangan.
const { legacyCashBlocked, bigIdColumn } = require('./_lib/cashAuthority');
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError } = require('./_lib/supabaseAdmin');
const { claimIdempotent, completeIdempotent, releaseIdempotent, claimResponse } = require('./_lib/idempotency');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body || !body.supplierLocalId || !(body.amountUsd > 0)) {
    return json({ error: 'supplierLocalId va amountUsd (musbat) majburiy' }, 400);
  }
  const { supplierLocalId, supplierName, amountUsd, boxId, debtBeforePayment, idemKey } = body;

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'supplier-payment-add', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'taminotchilar.edit', fn: 'supplier-payment-add' } /* 2026-09-28: avval .view (ko'rish) huquqi bilan pul yozuvi qilinardi — OWASP A01 */);
  if (!auth.ok) return auth.response;

  // v23: 24-migratsiyadan keyin pul harakati faqat cashbox-ops orqali (kassa + yozuv bitta
  // tranzaksiyada). Bu eski yo'l moliyaviy yozuvni rad etadi — jimgina "yarim" yozuv bo'lmasin.
  const blocked = await legacyCashBlocked(admin, 'supplier-payment-add');
  if (blocked) return blocked;

  // Eski sxemada supplier_local_id — integer; ilova ID'lari (uid) undan katta (25-migratsiya → bigint).
  if (!Number.isSafeInteger(Number(supplierLocalId)) || Number(supplierLocalId) <= 0) return json({ error: "Ta'minotchi ID noto'g'ri" }, 400);
  if (Number(supplierLocalId) > 2147483647 && !(await bigIdColumn(admin, 'supplier_payments', 'supplier_local_id'))) {
    return json({ error: "Ta'minotchi to'lovini yozish uchun 25-migratsiya qo'llanishi kerak (administratorga murojaat qiling)", migrationPending: true }, 409);
  }

  // ── VALIDATSIYA ──
  const amt = Number(amountUsd);
  if (!(amt > 0) || !Number.isFinite(amt) || amt > 1e12) return json({ error: "Summa musbat bo'lishi kerak" }, 400);
  // Qarzdan oshgan to'lov — RAD ETILADI (P3-1'dagi diller-to'lov bilan bir xil qoida)
  if (debtBeforePayment != null && amt > Number(debtBeforePayment) + 0.01) {
    return json({ error: `To'lov summasi (${amt}) ta'minotchi qarzidan (${debtBeforePayment}) oshib ketdi` }, 400);
  }

  // v10 (F5): kalit avval band qilinadi — parallel takroriy so'rov ikkinchi yozuv yaratmaydi
  const claim = await claimIdempotent(admin, idemKey, 'supplier-payment-add');
  const early = claimResponse(claim, json);
  if (early) return early;

  const filial = resolveFilial(auth, body.filial); // P3-14 + v10 (B9): xodim — o'z filiali; admin — joriy (tanlangan) filiali

  try {
    const { error } = await admin.from('supplier_payments').insert({
      filial, supplier_local_id: supplierLocalId, supplier_name: supplierName || null,
      amount_usd: amt, box_local_id: boxId || null,
      staff_id: auth.isAdmin ? null : auth.staff?.id,
      staff_name: auth.staff?.name || (auth.isAdmin ? 'Admin' : null),
      idem_key: idemKey || null
    });
    if (error) throw error;
    const response = { ok: true, filial, amount: amt };
    await completeIdempotent(admin, claim, response);
    return json(response, 200);
  } catch (e) {
    await releaseIdempotent(admin, claim);
    return serverError(e, 'supplier-payment-add', "Yozishda xatolik");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('supplier-payment-add', exports.handler);
