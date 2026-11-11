// Netlify Function — filial bo'yicha xodimlar ro'yxatini qaytaradi.
// Himoyalangan: faqat "sotuvchilar.view" ruxsati bor xodim (yoki admin) chaqira oladi.
// Filial — chaqiruvchining o'z filialiga majburan bog'lanadi (boshqa filialni so'rab bo'lmaydi).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'staff-list', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'sotuvchilar.view', filialField: 'filial', body });
  if (!auth.ok) return auth.response;

  const { filial } = body;
  if (!filial) return json({ error: 'filial majburiy' }, 400);

  try {
    const { data, error } = await admin.from('staff').select('*').eq('filial', filial).order('id');
    if (error) throw error;
    return json({ staff: data || [] }, 200);
  } catch (e) {
    return json({ error: "Ma'lumot yuklashda xatolik" }, 500);
  }
};
