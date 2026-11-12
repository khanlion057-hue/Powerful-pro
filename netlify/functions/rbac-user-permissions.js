// Netlify Function — login vaqtida chaqiriladi: xodimning ism/rollar/yig'ilgan
// ruxsatlar to'plamini bitta so'rovda qaytaradi. Frontend endi staff/staff_roles/
// role_permissions jadvallariga to'g'ridan-to'g'ri kirmaydi — hammasi shu yerdan.
//
// Himoyalangan: token tekshiriladi, va chaqiruvchi FAQAT O'ZINING permKeys'ini
// so'rashi mumkin (boshqa xodimning ruxsatlarini bu orqali bilib bo'lmaydi).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { staffId } = body;
  if (!staffId) return json({ error: 'staffId majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'rbac-user-permissions', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin);
  if (!auth.ok) return auth.response;

  if (Number(staffId) !== Number(auth.staff.id)) {
    return json({ error: "Faqat o'z ruxsatlaringizni so'rashingiz mumkin" }, 403);
  }

  try {
    const staff = auth.staff;
    const { data: roleLinks, error: rlErr } = await admin.from('staff_roles').select('role_id, roles(id,key,name)').eq('staff_id', staffId);
    if (rlErr) throw rlErr;
    const roles = (roleLinks || []).map(r => r.roles).filter(Boolean);
    const roleIds = roles.map(r => r.id);

    let permKeys = [];
    if (roleIds.length) {
      const { data: rp, error: rpErr } = await admin.from('role_permissions').select('permission_id, permissions(key)').in('role_id', roleIds);
      if (rpErr) throw rpErr;
      permKeys = [...new Set((rp || []).map(x => x.permissions?.key).filter(Boolean))];
    }

    return json({ name: staff.name, roles, permKeys }, 200);
  } catch (e) {
    return json({ error: "Ma'lumot yuklashda xatolik" }, 500);
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('rbac-user-permissions', exports.handler);
