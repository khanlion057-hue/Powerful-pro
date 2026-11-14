// Netlify Function — login vaqtida chaqiriladi: brauzerdan kelgan Supabase
// access_token'ni SERVER TOMONDA tekshiradi (admin.auth.getUser), keyin shu
// tasdiqlangan foydalanuvchiga tegishli staff qatorini qaytaradi.
// Bu — token soxtalashtirib boshqa birovning staff qatorini so'rash imkonini yopadi.
//
// Token — boshqa barcha Function'lar bilan bir xil uslubda, "Authorization: Bearer <token>"
// headeridan olinadi (avval body.accessToken orqali edi — arxitektura mosligi uchun tuzatildi).
const { getAdminClient, json, methodGuard, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) return json({ error: 'Avtorizatsiya talab qilinadi' }, 401);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'staff-whoami', 'Server sozlanmagan — administratorga murojaat qiling'); }

  try {
    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user) return json({ error: "Sessiya yaroqsiz" }, 401);

    const { data: staffRow, error } = await admin.from('staff').select('*').eq('auth_user_id', userData.user.id).maybeSingle();
    if (error) throw error;
    if (!staffRow) return json({ staff: null }, 200);
    // v24.6 (tez kirish): rollar ham shu javobda — login bitta so'rov kam (avval alohida rbac-staff-roles-get)
    let roleKeys = null;
    try {
      const { data: rr, error: re } = await admin.from('staff_roles').select('roles(key)').eq('staff_id', staffRow.id);
      if (!re) roleKeys = (rr || []).map(x => x && x.roles && x.roles.key).filter(Boolean);
    } catch (_) { /* RBAC jadvali yo'q — eski xatti-harakat */ }
    // v24.9 (38): admin parolni tiklagan bo'lsa — brauzer avval yangi parol so'raydi (server ham boshqa amallarni rad etadi)
    const mustChangePw = !!(userData.user.app_metadata && userData.user.app_metadata.must_change_pw === true);
    return json({ staff: staffRow, roleKeys, mustChangePw }, 200);
  } catch (e) {
    return serverError(e, 'staff-whoami', "Noma'lum xatolik");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('staff-whoami', exports.handler);
