// Birinchi administratorni yaratish (yangi o'rnatishda — tizimga kira oladigan hech kim
// yo'q paytda). Netlify'dagi create-staff funksiyasi bilan bir xil tartib: Supabase Auth
// foydalanuvchisi + staff qatori (role='admin'); RBAC "owner" roli ham biriktiriladi.
// Parol hech qayerga yozilmaydi va log qilinmaydi.
'use strict';
const STAFF_EMAIL_DOMAIN = 'staff.biznespro.local';

function validate({ login, password, name, filial }) {
  const l = String(login || '').trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(l)) return "Login 3–32 belgi: harf, raqam, nuqta, chiziqcha";
  if (String(password || '').length < 8) return "Parol kamida 8 belgi bo'lishi kerak";
  if (!String(name || '').trim()) return 'Ism majburiy';
  if (filial && !/^[a-z0-9_]{2,20}$/.test(filial)) return "Filial kaliti noto'g'ri";
  return null;
}

async function createAdmin(admin, { login, password, name, filial = 'baza' }) {
  const err = validate({ login, password, name, filial });
  if (err) throw new Error(err);
  const cleanLogin = String(login).trim();
  const email = cleanLogin.toLowerCase() + '@' + STAFF_EMAIL_DOMAIN;

  const { data: existing, error: exErr } = await admin.from('staff').select('id').ilike('login', cleanLogin).maybeSingle();
  if (exErr) throw new Error("Bazaga ulanib bo'lmadi yoki sxema o'rnatilmagan (supabase/schema.sql): " + exErr.message);
  if (existing) throw new Error(`"${cleanLogin}" logini allaqachon band`);

  const { data: userData, error: userErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (userErr) throw new Error('Auth foydalanuvchisini yaratib bo\'lmadi: ' + userErr.message);

  const { data: staffRow, error: staffErr } = await admin.from('staff')
    .insert({ auth_user_id: userData.user.id, login: cleanLogin, name: String(name).trim(), role: 'admin', filial })
    .select().single();
  if (staffErr) {
    await admin.auth.admin.deleteUser(userData.user.id).catch(() => {});
    throw new Error('Xodim qatorini yozib bo\'lmadi: ' + staffErr.message);
  }

  let ownerRole = false;
  const { data: role } = await admin.from('roles').select('id').eq('key', 'owner').maybeSingle();
  if (role && role.id) {
    const { error: srErr } = await admin.from('staff_roles').insert({ staff_id: staffRow.id, role_id: role.id });
    ownerRole = !srErr;
  }
  return { staffId: staffRow.id, login: cleanLogin, filial, ownerRole };
}

module.exports = { createAdmin, validate, STAFF_EMAIL_DOMAIN };
