// Diller autentifikatsiyasi (o'z tokeni — dealers.auth_user_id). v23.8 dealer-pay.js'dan ajratildi (v24) —
// endi bildirishnomalar va diller reviziyasi ham shu bitta tekshiruvdan foydalanadi.
const { json } = require('./supabaseAdmin');

async function dealerAuth(event, admin) {
  const token = String(event.headers?.authorization || event.headers?.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, response: json({ error: 'Avtorizatsiya talab qilinadi' }, 401) };
  const { data: u, error } = await admin.auth.getUser(token);
  if (error || !u?.user) return { ok: false, response: json({ error: 'Sessiya yaroqsiz — qayta kiring' }, 401) };
  const { data: d } = await admin.from('dealers').select('id,name,filial,active').eq('auth_user_id', u.user.id).maybeSingle();
  if (!d) return { ok: false, response: json({ error: 'Diller topilmadi' }, 403) };
  if (d.active === false) return { ok: false, response: json({ error: 'Hisobingiz faol emas' }, 403) };
  return { ok: true, dealer: d };
}

module.exports = { dealerAuth };
