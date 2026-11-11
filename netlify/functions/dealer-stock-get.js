// Netlify Function — bitta dillerning bitta mahsulot bo'yicha ombor qoldig'ini qaytaradi.
// Himoyalangan: "dillerlar.view" ruxsati (yoki admin), faqat O'Z filialidagi dillerga.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { dealerId, pid } = body;
  if (!dealerId || !pid) return json({ error: 'dealerId va pid majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-stock-get', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'dillerlar.view' });
  if (!auth.ok) return auth.response;

  const filialCheck = await assertOwnFilial(admin, 'dealers', dealerId, auth);
  if (!filialCheck.ok) return filialCheck.response;

  try {
    const { data, error } = await admin.from('dealer_stock').select('*').eq('dealer_id', dealerId).eq('pid', pid).maybeSingle();
    if (error) throw error;
    return json({ row: data || null }, 200);
  } catch (e) {
    return json({ error: "Ma'lumot yuklashda xatolik" }, 500);
  }
};
