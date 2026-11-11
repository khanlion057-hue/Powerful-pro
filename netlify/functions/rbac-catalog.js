// Netlify Function — RBAC katalogini (rollar + ruxsatlar + rol-ruxsat bog'lanishlari) qaytaradi.
// Himoyalangan: faqat "rollar.manage" ruxsati bor xodim (yoki admin).
const { getAdminClient, json, methodGuard, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'rbac-catalog', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'rollar.manage' });
  if (!auth.ok) return auth.response;

  try {
    const [{ data: roles, error: e1 }, { data: permissions, error: e2 }, { data: rolePermissions, error: e3 }] = await Promise.all([
      admin.from('roles').select('*').order('is_system', { ascending: false }).order('name'),
      admin.from('permissions').select('*').order('module'),
      admin.from('role_permissions').select('role_id, permission_id')
    ]);
    if (e1 || e2 || e3) throw (e1 || e2 || e3);
    // v25: B2B olib tashlandi — uning ruxsatlari rollar oynasida ko'rsatilmaydi (bazadagi yozuvlar o'zgarmaydi)
    const perms = (permissions || []).filter(p => !/^b2b\./.test(String(p && p.key || '')));
    const permIds = new Set(perms.map(p => p.id));
    return json({ roles: roles || [], permissions: perms, rolePermissions: (rolePermissions || []).filter(rp => permIds.has(rp.permission_id)) }, 200);
  } catch (e) {
    return json({ error: "Ma'lumot yuklashda xatolik" }, 500);
  }
};
