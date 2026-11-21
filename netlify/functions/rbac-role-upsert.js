// Netlify Function — rol yaratish yoki tahrirlash (nomi/izohi).
// Himoyalangan: faqat "rollar.manage" ruxsati bor xodim (yoki admin).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { id, name, description } = body;
  if (!name || !String(name).trim()) return json({ error: 'Rol nomini kiriting' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'rbac-role-upsert', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'rollar.manage' });
  if (!auth.ok) return auth.response;

  if (String(name).length > 80 || (description && String(description).length > 300)) {
    return json({ error: 'Nom yoki tavsif juda uzun' }, 400);
  }

  try {
    if (id) {
      // v10 (F9): tizim rolini faqat admin qayta nomlaydi
      if (!auth.isAdmin) {
        const { data: role } = await admin.from('roles').select('is_system').eq('id', id).maybeSingle();
        if (!role) return json({ error: 'Rol topilmadi' }, 404);
        if (role.is_system) return json({ error: "Tizim rolini faqat administrator o'zgartira oladi" }, 403);
      }
      const { data, error } = await admin.from('roles')
        .update({ name: name.trim(), description: description || null })
        .eq('id', id).select().single();
      if (error) throw error;
      return json({ role: data }, 200);
    } else {
      const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '_' + Date.now().toString(36).slice(-4);
      const { data, error } = await admin.from('roles')
        .insert({ key, name: name.trim(), description: description || null, is_system: false })
        .select().single();
      if (error) throw error;
      return json({ role: data }, 200);
    }
  } catch (e) {
    return json({ error: "Saqlashda xatolik" }, 500);
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('rbac-role-upsert', exports.handler);
