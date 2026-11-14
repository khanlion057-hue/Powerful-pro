// Netlify Function — dillerni server tomonidan yaratadi.
// Himoyalangan: "dillerlar.manage" ruxsati (yoki admin). Filial — chaqiruvchining
// o'z filialiga majburan bog'lanadi (admin bo'lmasa).
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, escapeLike, serverError } = require('./_lib/supabaseAdmin');

const DEALER_EMAIL_DOMAIN = 'dillers.biznespro.local';

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'create-dealer', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'dillerlar.manage', filialField: 'filial', body });
  if (!auth.ok) return auth.response;

  const { login, password, name, phone, region, commissionPct } = body;
  if (!login || !password || !name) {
    return json({ error: 'Ism, login va parol majburiy' }, 400);
  }
  if (String(password).length < 6) {
    return json({ error: "Parol kamida 6 belgi bo'lishi kerak" }, 400);
  }
  const finalFilial = body.filial || auth.filial;

  const cleanLogin = String(login).trim();
  const email = cleanLogin.toLowerCase().replace(/\s+/g, '') + '@' + DEALER_EMAIL_DOMAIN;

  try {
    const { data: existing } = await admin.from('dealers').select('id').ilike('login', escapeLike(cleanLogin)).maybeSingle();
    if (existing) return json({ error: 'Bu login allaqachon band' }, 409);

    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (userErr) throw userErr;

    const av = String(name).trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'D';
    const { data: dealerRow, error: dealerErr } = await admin.from('dealers').insert({
      auth_user_id: userData.user.id, login: cleanLogin, name, phone: phone || '', region: region || '', av,
      commission_pct: parseFloat(commissionPct) || 0, filial: finalFilial
    }).select().single();
    if (dealerErr) {
      await admin.auth.admin.deleteUser(userData.user.id).catch(() => {});
      throw dealerErr;
    }

    return json({ dealer: dealerRow }, 200);
  } catch (e) {
    return json({ error: "Diller yaratishda xatolik" }, 500);
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('create-dealer', exports.handler);
