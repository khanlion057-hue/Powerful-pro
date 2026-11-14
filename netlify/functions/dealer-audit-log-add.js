// Netlify Function — diller bilan bog'liq amalni audit jurnaliga yozadi
// (kim, qachon, qaysi filialdan, eski/yangi qiymat).
// Himoyalangan: har qanday tasdiqlangan xodim yoza oladi (bu — boshqa allaqachon
// ruxsat tekshirilgan amalga hamroh yozuv), lekin "kim" — SERVER TOMONDAN
// aniqlangan haqiqiy xodim, klient yuborgan actorName/actorStaffId E'TIBORGA OLINMAYDI
// (soxta shaxs ko'rsatishning oldini olish uchun).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { dealerId, action, oldValue, newValue } = body;
  if (!dealerId || !action) return json({ error: 'dealerId va action majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-audit-log-add', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { loadPermissions: true });
  if (!auth.ok) return auth.response;
  // 2026-09-28: diller jurnaliga faqat diller bo'limiga huquqi bor xodim yozadi
  // (avval har qanday xodim istalgan diller uchun soxta yozuv qo'sha olardi).
  const DEALER_PERMS = ['dillerlar.manage', 'dillerlar.orders', 'dillerlar.view'];
  if (!auth.isAdmin && !DEALER_PERMS.some(k => auth.permKeys.has(k))) {
    return json({ error: "Bu amal uchun ruxsatingiz yo'q" }, 403);
  }
  if (typeof action !== 'string' || action.length > 200) return json({ error: "action noto'g'ri" }, 400);
  // v10 (F16): boshqa filial dilleriga soxta yozuv qo'shib bo'lmaydi; hajm cheklangan
  const filialCheck = await assertOwnFilial(admin, 'dealers', dealerId, auth);
  if (!filialCheck.ok) return filialCheck.response;
  if (JSON.stringify(oldValue ?? null).length > 10000 || JSON.stringify(newValue ?? null).length > 10000) {
    return json({ error: 'Yozuv juda katta' }, 400);
  }

  try {
    const { error } = await admin.from('dealer_audit_log').insert({
      dealer_id: dealerId, action,
      actor_kind: auth.isAdmin ? 'owner' : 'staff', actor_name: auth.staff.name, actor_staff_id: auth.staff.id,
      filial: auth.filial, old_value: oldValue ?? null, new_value: newValue ?? null
    });
    if (error) throw error;
    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: "Yozishda xatolik" }, 500);
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('dealer-audit-log-add', exports.handler);
