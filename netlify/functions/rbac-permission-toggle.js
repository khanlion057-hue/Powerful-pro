// Netlify Function — rolga ruxsat qo'shadi yoki olib tashlaydi.
// Himoyalangan: faqat "rollar.manage" ruxsati bor xodim (yoki admin).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError, logSecurityEvent } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { roleId, permissionId, enabled } = body;
  if (!roleId || !permissionId) return json({ error: 'roleId va permissionId majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'rbac-permission-toggle', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'rollar.manage' });
  if (!auth.ok) return auth.response;

  // v10 (F9): tizim rollarining (owner, administrator, dealer...) ruxsatlarini faqat admin o'zgartiradi
  if (!auth.isAdmin) {
    const { data: role, error: rErr } = await admin.from('roles').select('is_system').eq('id', roleId).maybeSingle();
    if (rErr || !role) return json({ error: 'Rol topilmadi' }, 404);
    if (role.is_system) return json({ error: "Tizim rolini faqat administrator o'zgartira oladi" }, 403);
  }

  // v24.5 audit (P1): o'z-o'zini kuchaytirish yopildi. Admin bo'lmagan «rollar.manage» egasi:
  //  • o'zi a'zo bo'lgan rolga ruxsat QO'SHA olmaydi (o'ziga yangi huquq bera olmaydi);
  //  • o'zida yo'q ruxsatni boshqa rolga ham bera olmaydi (o'zidan yuqori huquqli rol yarata olmaydi).
  // Olib tashlash (enabled=false) avvalgidek.
  if (!auth.isAdmin && enabled) {
    const { data: own, error: oErr } = await admin.from('staff_roles').select('role_id').eq('staff_id', auth.staff.id).eq('role_id', roleId);
    if (oErr) return serverError(oErr, 'rbac-permission-toggle', 'Server xatosi');
    if (Array.isArray(own) && own.length) {
      await logSecurityEvent(admin, auth.staff, 'rbac_self_escalation_blocked', { roleId, permissionId });
      return json({ error: "Oʻzingiz aʼzo boʻlgan rolga ruxsat qoʻsha olmaysiz — administratorga murojaat qiling" }, 403);
    }
    const { data: perm, error: pErr } = await admin.from('permissions').select('key').eq('id', permissionId).maybeSingle();
    if (pErr) return serverError(pErr, 'rbac-permission-toggle', 'Server xatosi');
    if (!perm || !perm.key) return json({ error: 'Ruxsat topilmadi' }, 404);
    if (!auth.permKeys.has(perm.key)) {
      await logSecurityEvent(admin, auth.staff, 'rbac_grant_above_own_blocked', { roleId, permission: perm.key });
      return json({ error: "Oʻzingizda yoʻq ruxsatni bera olmaysiz — administratorga murojaat qiling" }, 403);
    }
  }

  try {
    if (enabled) {
      const { error } = await admin.from('role_permissions').upsert({ role_id: roleId, permission_id: permissionId });
      if (error) throw error;
    } else {
      const { error } = await admin.from('role_permissions').delete().eq('role_id', roleId).eq('permission_id', permissionId);
      if (error) throw error;
    }
    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: "Saqlashda xatolik" }, 500);
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('rbac-permission-toggle', exports.handler);
