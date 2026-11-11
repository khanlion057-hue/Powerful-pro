// Netlify Function — xodim (admin/sotuvchi) hisobini server tomonidan yaratadi.
// Himoyalangan: faqat "sotuvchilar.manage" ruxsati bor xodim (yoki admin).
// Filial — chaqiruvchining o'z filialiga majburan bog'lanadi (admin bo'lmasa).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, escapeLike, serverError } = require('./_lib/supabaseAdmin');

const STAFF_EMAIL_DOMAIN = 'staff.biznespro.local';

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'create-staff', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'sotuvchilar.manage', filialField: 'filial', body });
  if (!auth.ok) return auth.response;

  const { login, password, name, role } = body;
  if (!login || !password || !name) {
    return json({ error: 'Ism, login va parol majburiy' }, 400);
  }
  if (String(password).length < 6) {
    return json({ error: "Parol kamida 6 belgi bo'lishi kerak" }, 400);
  }
  const validRoles = ['admin', 'sotuvchi'];
  const finalRole = validRoles.includes(role) ? role : 'sotuvchi';
  // Faqat admin boshqa xodimga 'admin' roli bera oladi
  if (finalRole === 'admin' && !auth.isAdmin) {
    return json({ error: "Faqat administrator 'admin' roli bera oladi" }, 403);
  }
  const finalFilial = body.filial || auth.filial;

  const cleanLogin = String(login).trim();
  const email = cleanLogin.toLowerCase().replace(/\s+/g, '') + '@' + STAFF_EMAIL_DOMAIN;

  try {
    const { data: existing } = await admin.from('staff').select('id').ilike('login', escapeLike(cleanLogin)).maybeSingle();
    if (existing) return json({ error: 'Bu login allaqachon band' }, 409);

    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (userErr) throw userErr;

    const { data: staffRow, error: staffErr } = await admin.from('staff').insert({
      auth_user_id: userData.user.id, login: cleanLogin, name, role: finalRole, filial: finalFilial
    }).select().single();
    if (staffErr) {
      await admin.auth.admin.deleteUser(userData.user.id).catch(() => {});
      throw staffErr;
    }

    return json({ staff: staffRow }, 200);
  } catch (e) {
    return json({ error: "Xodim yaratishda xatolik" }, 500);
  }
};
