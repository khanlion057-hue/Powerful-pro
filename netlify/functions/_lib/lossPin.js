// v25.7 (egasi, 57-migratsiya): ZIYON PAROLI — serverda tekshiriladi.
// Parol OCHIQ HOLDA hech qayerga yozilmaydi: shu yerda SHA-256 xeshga aylantiriladi, bazaga faqat xesh boradi
// (public.fw_loss_pin_check / fw_loss_pin_set — faqat service_role). Logga ham parol tushmaydi.
const crypto = require('crypto');

const sha256Hex = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;

// Kim urinayapti — noto'g'ri urinishlar shu kalit bo'yicha sanaladi (15 daqiqada 5 ta — qulf)
function lossPinActor(auth) {
  if (auth && auth.staff && auth.staff.id != null) return 'staff:' + auth.staff.id;
  if (auth && auth.user && auth.user.id) return 'user:' + String(auth.user.id).slice(0, 64);
  return 'admin';
}

// 57-migratsiya qo'llanmaganmi (funksiya yo'q)?
const missingFn = (error) => !!error && (error.code === 'PGRST202' || error.code === '42883' || /fw_loss_pin_(check|set)/.test(String(error.message || '')) && /not find|does not exist|could not find/i.test(String(error.message || '')));

// Natija: { ok, status: 'ok' | 'wrong' | 'locked' | 'empty' | 'legacy' }
//  legacy — 57-migratsiya hali qo'llanmagan: avvalgi tartib (faqat klient tekshiruvi) saqlanadi
async function checkLossPin(admin, pin, actor) {
  const p = typeof pin === 'string' ? pin.trim() : '';
  // parol bo'sh bo'lsa ham baza so'raladi (bo'sh xesh — urinish emas): 57 yo'q bo'lsa — avvalgi tartib (legacy)
  const { data, error } = await admin.rpc('fw_loss_pin_check', { p_hash: p && p.length <= 64 ? sha256Hex(p) : '', p_actor: actor });
  if (error) {
    if (missingFn(error)) return { ok: true, status: 'legacy' };
    throw error;
  }
  return { ok: !!(data && data.ok), status: (data && data.status) || 'wrong' };
}

// Sozlamalar: eski va yangi parol XESHLARI keladi (brauzer xeshlaydi) — bu yerda faqat format tekshiriladi
async function setLossPin(admin, oldHash, newHash, actor) {
  const o = String(oldHash || '').toLowerCase(), n = String(newHash || '').toLowerCase();
  if (!HEX64.test(o) || !HEX64.test(n)) return { ok: false, status: 'bad' };
  const { data, error } = await admin.rpc('fw_loss_pin_set', { p_old_hash: o, p_new_hash: n, p_actor: actor });
  if (error) {
    if (missingFn(error)) return { ok: false, status: 'legacy' };
    throw error;
  }
  return { ok: !!(data && data.ok), status: (data && data.status) || 'wrong' };
}

const LOSS_PIN_MSG = {
  wrong: 'Ziyon paroli notoʻgʻri',
  locked: 'Ziyon paroli 5 marta notoʻgʻri kiritildi — 15 daqiqa kuting',
  empty: 'Ziyon paroli kiritilmagan',
};

module.exports = { sha256Hex, lossPinActor, checkLossPin, setLossPin, LOSS_PIN_MSG };
