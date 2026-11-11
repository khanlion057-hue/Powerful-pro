// Netlify Function — P3-8: "Uyga berish / Egasi pul olishi" — server-tomon
// BLOKLOVCHI validatsiya + doimiy ledger. P2'da frontendda qo'shilgan RBAC
// (kassalar.transact) endi SERVERDA ham majburiy.
const { legacyCashBlocked } = require('./_lib/cashAuthority');
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, resolveFilial, serverError } = require('./_lib/supabaseAdmin');
const { claimIdempotent, completeIdempotent, releaseIdempotent, claimResponse } = require('./_lib/idempotency');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body || !Array.isArray(body.entries) || !body.entries.length) {
    return json({ error: "entries majburiy (array)" }, 400);
  }
  const { entries, note, idemKey } = body;

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'home-withdrawal-add', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'kassalar.transact' });
  if (!auth.ok) return auth.response;

  // v23: 24-migratsiyadan keyin pul harakati faqat cashbox-ops orqali (kassa + yozuv bitta
  // tranzaksiyada). Bu eski yo'l moliyaviy yozuvni rad etadi — jimgina "yarim" yozuv bo'lmasin.
  const blocked = await legacyCashBlocked(admin, 'home-withdrawal-add');
  if (blocked) return blocked;

  // ── VALIDATSIYA ──
  if (entries.length > 20 || (note != null && String(note).length > 500)) return json({ error: "So'rov juda katta" }, 400);
  for (const e of entries) {
    if (!e || typeof e !== 'object') return json({ error: "Noto'g'ri yozuv" }, 400);
    const a = Number(e.amount);
    if (!(a > 0) || !Number.isFinite(a) || a > 1e12) return json({ error: `Noto'g'ri summa: ${e.amount}` }, 400);
    if (e.currentBal != null && Number(e.amount) > Number(e.currentBal) + 0.01) {
      return json({ error: `"${e.boxName || e.boxId}" — summa (${e.amount}) qoldiqdan (${e.currentBal}) oshib ketdi` }, 400);
    }
  }

  // v10 (F5): kalit avval band qilinadi — parallel takroriy so'rov ikkinchi yozuv yaratmaydi
  const claim = await claimIdempotent(admin, idemKey, 'home-withdrawal-add');
  const early = claimResponse(claim, json);
  if (early) return early;

  const filial = resolveFilial(auth, body.filial); // P3-14 + v10 (B9): xodim — o'z filiali; admin — joriy (tanlangan) filiali

  try {
    const { error } = await admin.from('home_withdrawals').insert({
      filial, entries, note: note || null,
      staff_id: auth.isAdmin ? null : auth.staff?.id,
      staff_name: auth.staff?.name || (auth.isAdmin ? 'Admin' : null),
      idem_key: idemKey || null
    });
    if (error) throw error;
    const response = { ok: true, filial };
    await completeIdempotent(admin, claim, response);
    return json(response, 200);
  } catch (e) {
    await releaseIdempotent(admin, claim);
    return serverError(e, 'home-withdrawal-add', "Yozishda xatolik");
  }
};
