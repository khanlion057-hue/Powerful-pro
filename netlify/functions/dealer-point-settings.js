// Netlify Function — diller portaliga FAQAT ball hisoblash sozlamalarini
// (pointUsdValue, pointRoundStep) qaytaradi. Diller uchun app_data'ning
// TO'LIQ mazmuni kerak emas — shuning uchun eng kichik, maxsus (least-privilege)
// Function sifatida yaratildi.
//
// Himoya: chaqiruvchi TOKENI tekshiriladi va "dealers" jadvalida shu tokenga
// mos yozuv borligi tasdiqlanadi (requireStaffAuth BU YERDA ishlatilmaydi,
// chunki diller "staff" jadvalida emas — alohida tekshiruv kerak).
const { getAdminClient, json, methodGuard, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Avtorizatsiya talab qilinadi' }, 401);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-point-settings', 'Server sozlanmagan — administratorga murojaat qiling'); }

  try {
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: 'Sessiya yaroqsiz' }, 401);

    const { data: dealerRow } = await admin.from('dealers').select('id').eq('auth_user_id', userData.user.id).maybeSingle();
    if (!dealerRow) return json({ error: 'Diller topilmadi' }, 403);

    const { data: row } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
    const s = row?.data?.settings || {};
    return json({
      pointUsdValue: s.pointUsdValue != null ? s.pointUsdValue : 2,
      pointRoundStep: s.pointRoundStep != null ? s.pointRoundStep : 1
    }, 200);
  } catch (e) {
    return json({ error: "Ma'lumot yuklashda xatolik" }, 500);
  }
};
