// Netlify Function — xodim ma'lumotini (ism/login/parol) server tomonidan yangilaydi.
// Himoyalangan: "sotuvchilar.manage" ruxsati bor xodim (yoki admin) BOSHQA xodimni,
// yoki har qanday xodim FAQAT O'ZINI tahrirlashi mumkin. Filial chegarasi saqlanadi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, assertCanManageStaff, escapeLike, serverError } = require('./_lib/supabaseAdmin');

const STAFF_EMAIL_DOMAIN = 'staff.biznespro.local';

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { staffId, name, login, password } = body;
  if (!staffId || !name || !login) {
    return json({ error: 'staffId, ism va login majburiy' }, 400);
  }
  if (password && String(password).length < 6) {
    return json({ error: "Parol kamida 6 belgi bo'lishi kerak" }, 400);
  }

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'update-staff', 'Server sozlanmagan — administratorga murojaat qiling'); }

  // Avval token/xodim tekshiruvi (ruxsatsiz), keyin "o'ziniki yoki boshqasi" mantig'i
  const authBase = await requireStaffAuth(event, admin);
  if (!authBase.ok) return authBase.response;

  const isSelf = Number(staffId) === Number(authBase.staff.id);
  if (!isSelf && !authBase.isAdmin) {
    const auth2 = await requireStaffAuth(event, admin, { permission: 'sotuvchilar.manage' });
    if (!auth2.ok) return auth2.response;
  }
  if (!isSelf) {
    const filialCheck = await assertOwnFilial(admin, 'staff', staffId, authBase);
    if (!filialCheck.ok) return filialCheck.response;
    // v10 (F1): admin/egasi hisobini (parol, login) faqat admin o'zgartiradi
    const privCheck = await assertCanManageStaff(admin, staffId, authBase);
    if (!privCheck.ok) return privCheck.response;
  }

  const cleanLogin = String(login).trim();

  try {
    const { data: staffRow, error: fetchErr } = await admin.from('staff').select('*').eq('id', staffId).single();
    if (fetchErr || !staffRow) throw new Error('Xodim topilmadi');

    if (cleanLogin.toLowerCase() !== (staffRow.login || '').toLowerCase()) {
      const { data: existing } = await admin.from('staff').select('id').ilike('login', escapeLike(cleanLogin)).neq('id', staffId).maybeSingle();
      if (existing) throw new Error('Bu login allaqachon band');
    }

    if (staffRow.auth_user_id) {
      const updates = {};
      if (cleanLogin.toLowerCase() !== (staffRow.login || '').toLowerCase()) {
        updates.email = cleanLogin.toLowerCase().replace(/\s+/g, '') + '@' + STAFF_EMAIL_DOMAIN;
        updates.email_confirm = true;
      }
      // v24.9 (38): boshqa xodimga parol qo'yilsa — u kirganda o'zi yangisini qo'yishga majbur, eski seanslari yopiladi
      if (password) { updates.password = password; updates.app_metadata = { must_change_pw: !isSelf }; }
      if (Object.keys(updates).length) {
        const { error: authErr } = await admin.auth.admin.updateUserById(staffRow.auth_user_id, updates);
        if (authErr) throw authErr;
      }
      if (password && !isSelf) { try { await admin.rpc('fw_revoke_sessions', { p_uid: staffRow.auth_user_id }); } catch (_) { /* 38 yo'q — token muddati tugaguncha */ } }
    }

    const { data: updatedRow, error: updErr } = await admin.from('staff')
      .update({ name, login: cleanLogin })
      .eq('id', staffId).select().single();
    if (updErr) throw updErr;

    return json({ staff: updatedRow }, 200);
  } catch (e) {
    return json({ error: e.message === 'Bu login allaqachon band' || e.message === 'Xodim topilmadi' ? e.message : "Yangilashda xatolik" }, 500);
  }
};
