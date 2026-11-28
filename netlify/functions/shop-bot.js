// Netlify Function — ONLAYN-DO'KON Telegram boti (ulash / holat).
// v25.9: YAGONA BOT — xaridorlar ham ASOSIY botda (settings.tgBotToken). Quyidagi eski izoh — tarix uchun:
//
// Token — do'kon botining kaliti. U brauzerga HECH QACHON qaytarilmaydi:
//  • saqlash: brauzer tokenni bir marta app_data.settings.shopBotToken sifatida yuboradi,
//    server uni saqlaydi va yuklashda olib tashlaydi (faqat `shopBotTokenSet` belgisi);
//  • bu funksiya Telegram API'ga SERVERDAN murojaat qiladi va javobga tokenni qo'shmaydi.
//
// v25.9: POST { action:'status' } — asosiy bot (nomi; eski do'kon tokeni saqlanganmi — legacy)
//        POST { action:'setup' }  — «Botni sozlash» (_lib/botSetup: webhook, menyu/tavsif uz+ru, tekshiruv) — faqat administrator
//        POST { action:'check' }  — eski: rad (alohida token kerak emas)
// Ruxsat: administrator yoki `sozlamalar.edit`.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');
const SETUP = require('./_lib/botSetup');
const { brandOf } = require('./_lib/tgEvents');

const ACTIONS = ['check', 'setup', 'status'];

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const body = parseBody(event);
  if (!body || typeof body !== 'object' || !ACTIONS.includes(body.action)) return json({ error: "Noto'g'ri so'rov" }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'shop-bot', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'sozlamalar.edit', fn: 'shop-bot' });
  if (!auth.ok) return auth.response;

  try {
    // v25.9: YAGONA BOT — do'kon (xaridorlar) vazifasi asosiy botda. Alohida do'kon boti tokeni endi kerak emas.
    if (body.action === 'check') return json({ ok: false, merged: true, error: "Doʻkon boti asosiy botga birlashtirildi — alohida token kerak emas" }, 400);
    const { data: row, error } = await admin.from('app_data').select('data').eq('id', 'main').maybeSingle();
    if (error) throw error;
    const st = (row && row.data && row.data.settings) || {};
    const legacy = !!st.shopBotToken;   // eski do'kon boti tokeni hali saqlangan (ishlatilmaydi)
    if (body.action === 'status') {
      const b = await SETUP.botInfo(st.tgBotToken);
      return b.ok ? json({ ok: true, merged: true, legacy, bot: { username: b.username, name: b.name } }, 200) : json({ ok: false, merged: true, legacy, error: b.error }, 200);
    }
    // setup — webhook'ni ham o'zgartiradi: faqat administrator
    if (!auth.isAdmin) return json({ error: "«Botni sozlash» — faqat administrator" }, 403);
    const r = await SETUP.setup(admin, st.tgBotToken, brandOf(st));
    return json({ ...r, merged: true, legacy }, 200);
  } catch (e) {
    return serverError(e, 'shop-bot', "Telegramga ulanib bo'lmadi");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('shop-bot', exports.handler);
