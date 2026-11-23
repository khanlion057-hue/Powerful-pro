// Netlify Function — v25.7 (egasi, 57-migratsiya): ZIYON PAROLINI O'ZGARTIRISH (Sozlamalar → «Ziyon paroli»).
// Faqat ADMINISTRATOR. Brauzer parolni o'zi SHA-256 bilan xeshlaydi — bu yerga faqat eski va yangi XESH keladi
// (ochiq parol tarmoqda ham, bazada ham, logda ham yo'q). Bazada eski xesh tekshiriladi (5 xato — 15 daqiqa qulf),
// keyin public.fw_settings.loss_pin_hash yangilanadi va auditga yoziladi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');
const { setLossPin, lossPinActor, LOSS_PIN_MSG } = require('./_lib/lossPin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event) || {};

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'loss-pin', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { requireAdmin: true });
  if (!auth.ok) return auth.response;

  try {
    const r = await setLossPin(admin, body.oldHash, body.newHash, lossPinActor(auth) + ':' + String((auth.staff && auth.staff.name) || 'Admin').slice(0, 60));
    if (r.ok) return json({ ok: true }, 200);
    if (r.status === 'legacy') return json({ error: "Bazaga 57-migratsiya qo'llanmagan — parol faqat shu qurilmada o'zgardi", code: 'MIGRATION57_PENDING' }, 409);
    if (r.status === 'bad' || r.status === 'bad_new') return json({ error: "Parol xeshi noto'g'ri" }, 400);
    return json({ error: r.status === 'locked' ? LOSS_PIN_MSG.locked : "Hozirgi parol noto'g'ri", code: r.status === 'locked' ? 'LOSS_PIN_LOCKED' : 'LOSS_PIN_WRONG' }, 403);
  } catch (e) {
    return serverError(e, 'loss-pin', "Parolni saqlab bo'lmadi");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('loss-pin', exports.handler);
