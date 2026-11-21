// Netlify Function — rolni o'chiradi (tizim rollari o'chirilmaydi).
// Himoyalangan: faqat "rollar.manage" ruxsati bor xodim (yoki admin).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { id } = body;
  if (!id) return json({ error: 'Rol id majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'rbac-role-delete', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'rollar.manage' });
  if (!auth.ok) return auth.response;

  try {
    const { data: role, error: fetchErr } = await admin.from('roles').select('is_system').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!role) return json({ error: 'Rol topilmadi' }, 404);
    if (role.is_system) return json({ error: "Tizim rolini o'chirib bo'lmaydi" }, 403);

    const { error } = await admin.from('roles').delete().eq('id', id);
    if (error) throw error;
    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: "O'chirishda xatolik" }, 500);
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('rbac-role-delete', exports.handler);
