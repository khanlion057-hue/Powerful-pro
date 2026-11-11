// Netlify Function — P3-10: Mijoz qarz to'lovi — server-tomon BLOKLOVCHI
// validatsiya. "mijozlar.debt_payment" ruxsati — sotuvchi ham foydalana oladi
// (mavjud RBAC katalogidan, yangisi yaratilmadi).
const { legacyCashBlocked, bigIdColumn } = require('./_lib/cashAuthority');
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError } = require('./_lib/supabaseAdmin');
const { claimIdempotent, completeIdempotent, releaseIdempotent, claimResponse } = require('./_lib/idempotency');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body || !body.customerLocalId || !(body.amountUzs > 0)) {
    return json({ error: 'customerLocalId va amountUzs (musbat) majburiy' }, 400);
  }
  const { customerLocalId, customerName, amountUzs, boxId, debtBeforePaymentUzs, idemKey } = body;

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'customer-debt-payment-add', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'mijozlar.debt_payment' });
  if (!auth.ok) return auth.response;

  // v23: 24-migratsiyadan keyin pul harakati faqat cashbox-ops orqali (kassa + yozuv bitta
  // tranzaksiyada). Bu eski yo'l moliyaviy yozuvni rad etadi — jimgina "yarim" yozuv bo'lmasin.
  const blocked = await legacyCashBlocked(admin, 'customer-debt-payment-add');
  if (blocked) return blocked;

  // Eski sxemada customer_local_id — integer; ilova ID'lari (uid) undan katta. 25-migratsiya
  // ustunni bigint qiladi. Unga qadar yozuv yiqilmasin deb jim o'tkazib yubormaymiz — aniq rad.
  if (!Number.isSafeInteger(Number(customerLocalId)) || Number(customerLocalId) <= 0) return json({ error: 'Mijoz ID noto\'g\'ri' }, 400);
  if (Number(customerLocalId) > 2147483647 && !(await bigIdColumn(admin, 'customer_debt_payments', 'customer_local_id'))) {
    return json({ error: "Mijoz to'lovini yozish uchun 25-migratsiya qo'llanishi kerak (administratorga murojaat qiling)", migrationPending: true }, 409);
  }

  const amt = Number(amountUzs);
  if (!(amt > 0) || !Number.isFinite(amt) || amt > 1e12) return json({ error: "Summa musbat bo'lishi kerak" }, 400);
  if (debtBeforePaymentUzs != null && amt > Number(debtBeforePaymentUzs) + 1) {
    return json({ error: `To'lov summasi (${amt}) mijoz qarzidan (${debtBeforePaymentUzs}) oshib ketdi` }, 400);
  }

  // v10 (F5): kalit avval band qilinadi — parallel takroriy so'rov ikkinchi yozuv yaratmaydi
  const claim = await claimIdempotent(admin, idemKey, 'customer-debt-payment-add');
  const early = claimResponse(claim, json);
  if (early) return early;

  const filial = resolveFilial(auth, body.filial); // P3-14 + v10 (B9): xodim — o'z filiali; admin — joriy (tanlangan) filiali

  try {
    const { error } = await admin.from('customer_debt_payments').insert({
      filial, customer_local_id: customerLocalId, customer_name: customerName || null,
      amount_uzs: amt, box_local_id: boxId || null,
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
    return serverError(e, 'customer-debt-payment-add', "Yozishda xatolik");
  }
};
