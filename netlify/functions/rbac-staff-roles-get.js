// Netlify Function — bitta yoki bir nechta xodimning biriktirilgan rollarini qaytaradi.
// Himoyalangan: faqat "rollar.manage" ruxsati bor xodim (yoki admin).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'rbac-staff-roles-get', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'rollar.manage' });
  if (!auth.ok) return auth.response;

  try {
    if (body.staffId) {
      const { data, error } = await admin.from('staff_roles').select('roles(id,key,name)').eq('staff_id', body.staffId);
      if (error) throw error;
      return json({ roles: (data || []).map(r => r.roles).filter(Boolean) }, 200);
    }
    if (Array.isArray(body.staffIds) && body.staffIds.length) {
      const { data, error } = await admin.from('staff_roles')
        .select('staff_id, roles(id,key,name)')
        .in('staff_id', body.staffIds);
      if (error) throw error;
      const byStaff = {};
      (data || []).forEach(r => { (byStaff[r.staff_id] = byStaff[r.staff_id] || []).push(r.roles); });
      return json({ byStaff }, 200);
    }
    return json({ error: 'staffId yoki staffIds kerak' }, 400);
  } catch (e) {
    return json({ error: "Ma'lumot yuklashda xatolik" }, 500);
  }
};
