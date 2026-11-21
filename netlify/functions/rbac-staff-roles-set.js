// Netlify Function — bitta xodimga bir nechta rolni biriktiradi (eskilarini almashtiradi).
// Himoyalangan: faqat "rollar.manage" ruxsati bor xodim (yoki admin), va faqat
// O'Z filialidagi xodimga.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, assertCanManageStaff, PRIVILEGED_ROLE_KEYS, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { staffId, roleIds } = body;
  if (!staffId) return json({ error: 'staffId majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'rbac-staff-roles-set', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'rollar.manage' });
  if (!auth.ok) return auth.response;

  const filialCheck = await assertOwnFilial(admin, 'staff', staffId, auth);
  if (!filialCheck.ok) return filialCheck.response;

  if (roleIds != null && (!Array.isArray(roleIds) || roleIds.some(r => typeof r !== 'string' || r.length > 64))) {
    return json({ error: "roleIds noto'g'ri" }, 400);
  }
  // v10 (F9): admin bo'lmagan xodim — o'ziga rol bera olmaydi, admin/egasining rolini
  // o'zgartira olmaydi va hech kimga "owner"/"administrator" rolini bera olmaydi
  if (!auth.isAdmin) {
    if (Number(staffId) === Number(auth.staff.id)) return json({ error: "O'zingizga rol bera olmaysiz" }, 403);
    const privCheck = await assertCanManageStaff(admin, staffId, auth);
    if (!privCheck.ok) return privCheck.response;
    if (Array.isArray(roleIds) && roleIds.length) {
      const { data: rs, error: rErr } = await admin.from('roles').select('id,key').in('id', roleIds);
      if (rErr || !rs || rs.length !== new Set(roleIds).size) return json({ error: 'Rol topilmadi' }, 400);
      if (rs.some(r => PRIVILEGED_ROLE_KEYS.includes(r.key))) return json({ error: "Bu rolni faqat administrator bera oladi" }, 403);
    }
  }

  try {
    const { error: delErr } = await admin.from('staff_roles').delete().eq('staff_id', staffId);
    if (delErr) throw delErr;
    if (Array.isArray(roleIds) && roleIds.length) {
      const { error: insErr } = await admin.from('staff_roles').insert(roleIds.map(role_id => ({ staff_id: staffId, role_id })));
      if (insErr) throw insErr;
    }
    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: "Saqlashda xatolik" }, 500);
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('rbac-staff-roles-set', exports.handler);
