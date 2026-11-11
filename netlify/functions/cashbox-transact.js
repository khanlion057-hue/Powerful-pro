// Netlify Function — P3-7: Kassa kirim/chiqim — server-tomon BLOKLOVCHI
// validatsiya + doimiy ledger. RBAC (kassalar.transact), filial-server
// tomonidan aniqlanadi (client aytganiga ishonilmaydi), idempotency-key bilan
// himoyalangan.
const { legacyCashBlocked } = require('./_lib/cashAuthority');
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError } = require('./_lib/supabaseAdmin');
const { claimIdempotent, completeIdempotent, releaseIdempotent, claimResponse } = require('./_lib/idempotency');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);
  const { boxId, boxName, type, amount, desc, currentBal, idemKey } = body;

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'cashbox-transact', 'Server sozlanmagan — administratorga murojaat qiling'); }

  // P3-13: server-tomon RBAC — mavjud "kassalar.transact" ruxsati ishlatiladi
  const auth = await requireStaffAuth(event, admin, { permission: 'kassalar.transact' });
  if (!auth.ok) return auth.response;

  // v23: 24-migratsiyadan keyin pul harakati faqat cashbox-ops orqali (kassa + yozuv bitta
  // tranzaksiyada). Bu eski yo'l moliyaviy yozuvni rad etadi — jimgina "yarim" yozuv bo'lmasin.
  const blocked = await legacyCashBlocked(admin, 'cashbox-transact');
  if (blocked) return blocked;

  // ── SERVER-TOMON VALIDATSIYA (BLOKLOVCHI) ──
  const amt = Number(amount);
  if (!(amt > 0) || !Number.isFinite(amt) || amt > 1e12) return json({ error: "Summa musbat bo'lishi kerak" }, 400);
  if (type !== 'in' && type !== 'out') return json({ error: "type faqat 'in' yoki 'out' bo'lishi mumkin" }, 400);
  if (!Number.isSafeInteger(Number(boxId)) || String(desc || '').length > 500 || String(boxName || '').length > 100) return json({ error: "So'rov maydonlari noto'g'ri" }, 400);
  if (type === 'out' && currentBal != null && amt > Number(currentBal) + 0.01) {
    return json({ error: `Chiqim summasi (${amt}) kassa qoldig'idan (${currentBal}) oshib ketdi` }, 400);
  }

  // v10 (F5): kalit avval band qilinadi — parallel takroriy so'rov ikkinchi yozuv yaratmaydi
  const claim = await claimIdempotent(admin, idemKey, 'cashbox-transact');
  const early = claimResponse(claim, json);
  if (early) return early;

  // P3-14: filial — CLIENT yubormaydi, server auth orqali aniqlaydi (o'zgartirib bo'lmaydi)
  const filial = resolveFilial(auth, body.filial); // P3-14 + v10 (B9): xodim — o'z filiali; admin — joriy (tanlangan) filiali

  try {
    const { error } = await admin.from('cashbox_transactions').insert({
      filial, box_local_id: boxId, box_name: boxName || null, type, amount: amt,
      desc_text: desc || null, staff_id: auth.isAdmin ? null : auth.staff?.id,
      staff_name: auth.staff?.name || (auth.isAdmin ? 'Admin' : null), idem_key: idemKey || null
    });
    if (error) throw error;
    const response = { ok: true, filial, amount: amt };
    await completeIdempotent(admin, claim, response);
    return json(response, 200);
  } catch (e) {
    await releaseIdempotent(admin, claim);
    return serverError(e, 'cashbox-transact', "Yozishda xatolik");
  }
};
