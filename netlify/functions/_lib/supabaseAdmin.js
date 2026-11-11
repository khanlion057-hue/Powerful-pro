// ════════════════════════════════════════════════════════════
// UMUMIY YADRO — barcha Netlify Functions shu yerdan foydalanadi.
// Maqsad: SUPABASE_SERVICE_ROLE_KEY faqat BITTA joyda o'qiladi,
// takrorlanmaydi, va hech qachon brauzerga chiqmaydi.
//
// Kelajakda Telegram bot / AI / boshqa tashqi xizmat funksiyasi
// yozilganda — shu faylni import qiling, boshqa hech narsa kerak emas:
//   const { admin, json, requireEnv } = require('./_lib/supabaseAdmin');
// ════════════════════════════════════════════════════════════
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dzzxrxudsejhdrbpiifc.supabase.co';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Server sozlanmagan: ${name} Netlify muhit o'zgaruvchisida topilmadi`);
  return v;
}

// v24.5 (v23.10.2 dan): server funksiyalari realtime (WebSocket) ishlatmaydi. supabase-js 2.117 Node 20 da
// native WebSocket topolmasa createClient xato tashlaydi (login 500). Transport bo'sh klass — faqat chaqirilganda xato.
class NoRealtimeTransport {
  constructor() { throw new Error('Server funksiyalarida realtime ishlatilmaydi'); }
}

// Har chaqiriqda yangi client — Lambda konteynerlari orasida holat sizib chiqmasligi uchun
function getAdminClient() {
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: NoRealtimeTransport } });
}

function json(obj, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}

function methodGuard(event, allowed) {
  if (!allowed.includes(event.httpMethod)) {
    return json({ error: `Faqat ${allowed.join('/')} so'rovlar qabul qilinadi` }, 405);
  }
  return null;
}

// ════════════════════════════════════════════════════════════
// XAVFSIZ XATO JAVOBI (OWASP A10). Postgres/Supabase'ning xom xato matni
// (jadval/ustun/constraint nomlari) klientga CHIQARILMAYDI — faqat server
// logiga (Netlify Functions log) yoziladi. ISTISNO: ataylab biznes-xabar
// sifatida ko'tarilgan xatolar (plpgsql RAISE EXCEPTION -> SQLSTATE "P0xxx",
// masalan "Omborda yetarli qoldiq yo'q") — foydalanuvchiga kerak, qaytariladi.
// ════════════════════════════════════════════════════════════
function isBusinessError(e) {
  return !!(e && typeof e.code === 'string' && /^P0\d{3}$/.test(e.code));
}
function serverError(e, context, fallback = "Server xatosi — birozdan so'ng qayta urinib ko'ring", status = 500) {
  try { console.error(`[${context || 'function'}]`, e && (e.stack || e.message || e)); } catch (_) {}
  const msg = isBusinessError(e) ? e.message : fallback;
  return json({ error: msg }, status);
}

// ════════════════════════════════════════════════════════════
// XAVFSIZLIK HODISALARI JURNALI (OWASP A09). Ruxsat rad etilishi va
// bloklangan xavfli urinishlar staff_audit_log'ga yoziladi (faqat
// service_role o'qiy/yoza oladi — klient bu jurnalni o'chira olmaydi).
// Jurnal yozuvi ikkinchi darajali: xato bo'lsa asosiy javob to'xtamaydi.
// ════════════════════════════════════════════════════════════
async function logSecurityEvent(admin, staff, action, details) {
  try {
    await admin.from('staff_audit_log').insert({
      staff_id: staff?.id ?? null, staff_name: staff?.name ?? null, filial: staff?.filial ?? null,
      action, details: details ?? null
    });
  } catch (_) { /* jurnal ikkinchi darajali */ }
}

function parseBody(event) {
  try { return JSON.parse(event.body || '{}'); }
  catch { return null; }
}

// ════════════════════════════════════════════════════════════
// AUTENTIFIKATSIYA VA RUXSAT TEKSHIRUVI (server tomonda, HAR bir
// himoyalangan Function uchun majburiy)
// ════════════════════════════════════════════════════════════
// Frontend har bir himoyalangan Function'ga so'rov yuborganda
// "Authorization: Bearer <access_token>" header'ini qo'shishi shart
// (bu — joriy Supabase Auth sessiyasining tokeni, PIN emas).
//
// requireStaffAuth(event, admin, { permission, requireAdmin, filialField, body }):
//   1) Header'dagi tokenni SERVER TOMONDA tasdiqlaydi (admin.auth.getUser)
//   2) Shu tokenga tegishli "staff" qatorini topadi
//   3) role='admin' bo'lsa — to'liq huquqli (eski, mavjud arxitekturaga mos)
//   4) Aks holda — RBAC orqali (staff_roles -> role_permissions) kerakli
//      "permission" kalitiga ega ekanini tekshiradi
//   5) filialField berilgan bo'lsa — so'rovdagi filial qiymatini CHAQIRUVCHINING
//      O'Z FILIALIGA majburan almashtiradi (admin bo'lmasa) — boshqa filial
//      ma'lumotini so'rab bo'lmasligini kafolatlaydi
//
// Natija: { ok:true, staff, isAdmin, permKeys, filial } yoki { ok:false, response }
// (response — to'g'ridan-to'g'ri qaytariladigan xato javobi, 401/403)
async function requireStaffAuth(event, admin, opts = {}) {
  const { permission, requireAdmin, filialField, body, loadPermissions } = opts;

  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { ok: false, response: json({ error: 'Avtorizatsiya talab qilinadi (tizimga kirilmagan)' }, 401) };
  }

  let userData;
  try {
    const res = await admin.auth.getUser(token);
    if (res.error || !res.data?.user) {
      return { ok: false, response: json({ error: 'Sessiya yaroqsiz yoki muddati o\'tgan — qayta kiring' }, 401) };
    }
    userData = res.data.user;
  } catch (e) {
    return { ok: false, response: json({ error: 'Sessiyani tekshirib bo\'lmadi' }, 401) };
  }

  const { data: staff, error: staffErr } = await admin.from('staff').select('*').eq('auth_user_id', userData.id).maybeSingle();
  if (staffErr || !staff) {
    return { ok: false, response: json({ error: 'Xodim topilmadi yoki hisobingiz faol emas' }, 403) };
  }
  if (staff.active === false) {
    return { ok: false, response: json({ error: 'Hisobingiz faol emas' }, 403) };
  }

  const isAdmin = staff.role === 'admin';
  // v24.9 (38): admin parolni tiklagan — xodim yangi parol qo'ymaguncha boshqa amal yo'q (belgi app_metadata'da,
  // brauzer o'zgartira olmaydi). Faqat staff-whoami va pw-reset (allowPwChange) ishlaydi.
  const mustChangePw = !!(userData.app_metadata && userData.app_metadata.must_change_pw === true);
  if (mustChangePw && !opts.allowPwChange) {
    return { ok: false, response: json({ error: 'Avval yangi parol qoʻying (administrator parolingizni tikladi)', code: 'PW_CHANGE_REQUIRED' }, 403) };
  }

  if (requireAdmin && !isAdmin) {
    await logSecurityEvent(admin, staff, 'permission_denied', { need: 'admin', fn: opts.fn || null });
    return { ok: false, response: json({ error: 'Bu amal faqat administrator uchun ruxsat etilgan' }, 403) };
  }

  let permKeys = new Set();
  // `permission` — bitta aniq kalitni MAJBURIY qilib tekshiradi (mos kelmasa 403).
  // `loadPermissions` — hech narsani majburlamasdan, faqat permKeys ro'yxatini
  // yuklab beradi (chaqiruvchi o'zi, so'rov ichidagi bir nechta turli kalitga
  // qarab, o'z holida tekshiradi — masalan app-data-save.js'dagi kabi).
  if (!isAdmin && (permission || loadPermissions)) {
    try {
      const { data: roleLinks } = await admin.from('staff_roles').select('role_id').eq('staff_id', staff.id);
      const roleIds = (roleLinks || []).map(r => r.role_id);
      if (roleIds.length) {
        const { data: rp } = await admin.from('role_permissions').select('permission_id, permissions(key)').in('role_id', roleIds);
        permKeys = new Set((rp || []).map(x => x.permissions?.key).filter(Boolean));
      }
    } catch (e) {
      return { ok: false, response: json({ error: 'Ruxsatlarni tekshirib bo\'lmadi' }, 500) };
    }
    if (permission && !permKeys.has(permission)) {
      await logSecurityEvent(admin, staff, 'permission_denied', { need: permission, fn: opts.fn || null });
      return { ok: false, response: json({ error: 'Bu amal uchun ruxsatingiz yo\'q' }, 403) };
    }
  }

  // Filial izolyatsiyasi: admin bo'lmagan xodim faqat O'Z filialiga tegishli
  // ma'lumotni so'rashi mumkin — so'rovdagi qiymat e'tiborsiz qoldirilib,
  // chaqiruvchining haqiqiy filiali majburan qo'llaniladi.
  if (filialField && body && !isAdmin) {
    body[filialField] = staff.filial;
  }

  return { ok: true, staff, isAdmin, permKeys, filial: staff.filial, user: userData, mustChangePw };
}

// Muayyan qatorning (masalan bitta xodim yoki diller) filiali chaqiruvchiga
// tegishli ekanini tekshiradi — id orqali so'ralgan amallar uchun (masalan
// staff-delete, dealer-update) qo'shimcha himoya qatlami.
async function assertOwnFilial(admin, table, id, authResult) {
  if (authResult.isAdmin) return { ok: true };
  const { data: row, error } = await admin.from(table).select('filial').eq('id', id).maybeSingle();
  if (error) return { ok: false, response: json({ error: "Ma'lumot topilmadi" }, 404) };
  if (!row) return { ok: false, response: json({ error: "Ma'lumot topilmadi" }, 404) };
  if (row.filial !== authResult.filial) {
    return { ok: false, response: json({ error: "Boshqa filial ma'lumotiga ruxsatingiz yo'q" }, 403) };
  }
  return { ok: true };
}

// v10 (B9): pul/ombor yozuvi qaysi filialga tegishli. Admin bir nechta filialda ishlaydi
// (filial almashtiradi) — u yuborgan filial qabul qilinadi (format tekshiriladi); boshqa
// xodim uchun — HAR DOIM o'z filiali (so'rovdagi qiymat e'tiborsiz).
function resolveFilial(authResult, requested) {
  if (authResult.isAdmin && typeof requested === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(requested)) return requested;
  return authResult.filial;
}

// ilike'da % va _ — joker belgilar; login kabi qiymatlar oddiy matn sifatida qidirilishi kerak (v10 F16)
function escapeLike(v) { return String(v).replace(/[\\%_]/g, (c) => '\\' + c); }

// ── Imtiyozli xodim himoyasi (v10 audit F1/F9) ──
// Admin (staff.role='admin') yoki "owner"/"administrator" RBAC roliga ega xodimni
// faqat ADMIN o'zgartira/o'chira/rolini almashtira oladi. Aks holda masalan filial
// menejeri (sotuvchilar.manage) admin parolini almashtirib, tizimni egallab olardi.
// Tekshiruvda xato bo'lsa — fail-closed (imtiyozli deb hisoblanadi).
const PRIVILEGED_ROLE_KEYS = ['owner', 'administrator'];
async function isPrivilegedStaff(admin, staffId) {
  const { data: row, error } = await admin.from('staff').select('id,role').eq('id', staffId).maybeSingle();
  if (error) return true;
  if (!row) return false;
  if (row.role === 'admin') return true;
  const { data: links, error: lErr } = await admin.from('staff_roles').select('roles(key)').eq('staff_id', staffId);
  if (lErr) return true;
  return (links || []).some(l => PRIVILEGED_ROLE_KEYS.includes(l && l.roles && l.roles.key));
}
async function assertCanManageStaff(admin, targetStaffId, authResult) {
  if (authResult.isAdmin) return { ok: true };
  if (await isPrivilegedStaff(admin, targetStaffId)) {
    await logSecurityEvent(admin, authResult.staff, 'permission_denied', { need: 'admin', target: targetStaffId, reason: 'privileged_target' });
    return { ok: false, response: json({ error: "Administrator hisobini faqat administrator o'zgartira oladi" }, 403) };
  }
  return { ok: true };
}

module.exports = { resolveFilial, escapeLike, isPrivilegedStaff, assertCanManageStaff, PRIVILEGED_ROLE_KEYS, getAdminClient, requireEnv, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, serverError, isBusinessError, logSecurityEvent, SUPABASE_URL };
