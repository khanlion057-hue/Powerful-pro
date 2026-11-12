// Netlify Function — dillerni o'chiradi (cascade: stock/sales/payments/moves ham o'chadi)
// va uning Supabase Auth hisobini ham tozalaydi.
// Himoyalangan: "dillerlar.manage" ruxsati (yoki admin), faqat O'Z filialidagi dillerga.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { id } = body;
  if (!id) return json({ error: 'id majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'dealer-delete', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'dillerlar.manage' });
  if (!auth.ok) return auth.response;

  const filialCheck = await assertOwnFilial(admin, 'dealers', id, auth);
  if (!filialCheck.ok) return filialCheck.response;

  try {
    const { data: dealerRow } = await admin.from('dealers').select('auth_user_id').eq('id', id).maybeSingle();

    const { error: delErr } = await admin.from('dealers').delete().eq('id', id);
    if (delErr) throw delErr;

    if (dealerRow?.auth_user_id) {
      await admin.auth.admin.deleteUser(dealerRow.auth_user_id).catch(() => {});
    }

    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: "O'chirishda xatolik" }, 500);
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('dealer-delete', exports.handler);
