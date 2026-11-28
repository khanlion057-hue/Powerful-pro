// P3-11 — Umumiy, barqaror idempotency mexanizmi.
//
// v10 (audit F5): avvalgi "tekshir → bajar → saqla" tartibi parallel so'rovlarda
// (ikki marta bosish, tarmoq qayta urinishi) IKKALASINI ham o'tkazib yuborardi —
// tekshiruv paytida hali hech narsa saqlanmagan bo'ladi. Endi pul harakatlari
// uchun "avval BAND QIL (claim) → bajar → natijani yoz (complete)" tartibi:
//   1) claimIdempotent() — `idem_key` UNIQUE cheklovi orqali kalitni atomik band
//      qiladi. Kalit band bo'lsa: natija tayyor → o'sha natija qaytadi;
//      hali bajarilmoqda → 409 (ikkinchi nusxa BAJARILMAYDI).
//   2) completeIdempotent() — muvaffaqiyatli natijani band qilingan qatorga yozadi.
//   3) releaseIdempotent() — amal bajarilmasa (xato), bandlik bo'shatiladi —
//      shunda xuddi shu kalit bilan qayta urinish mumkin.
// Kalitlar endpoint bo'yicha ajratiladi (bir endpoint kaliti boshqasining keshli
// javobini qaytarib yubormasligi uchun).
//
// checkIdempotent()/saveIdempotent() — eski API (orqaga moslik uchun saqlangan).

function scopedKey(endpoint, idemKey) {
  return `${endpoint}:${String(idemKey).slice(0, 200)}`;
}

async function claimIdempotent(admin, idemKey, endpoint) {
  if (!idemKey) return { claimed: false, skip: true };
  const key = scopedKey(endpoint, idemKey);
  const { error } = await admin.from('idempotency_keys').insert({ idem_key: key, endpoint, response: null });
  if (!error) return { claimed: true, key };
  if (error.code !== '23505') return { claimed: false, failed: true, error }; // boshqa xato — fail-closed
  const { data } = await admin.from('idempotency_keys').select('response').eq('idem_key', key).maybeSingle();
  if (data && data.response != null) return { claimed: false, isDuplicate: true, cachedResponse: data.response };
  return { claimed: false, inProgress: true };
}

async function completeIdempotent(admin, claim, response) {
  if (!claim || !claim.claimed) return;
  try { await admin.from('idempotency_keys').update({ response }).eq('idem_key', claim.key); } catch (_) { /* natija baribir qaytariladi */ }
}

async function releaseIdempotent(admin, claim) {
  if (!claim || !claim.claimed) return;
  try { await admin.from('idempotency_keys').delete().eq('idem_key', claim.key).is('response', null); } catch (_) { /* eskirgan bandlik — keyingi urinish 409 oladi */ }
}

// claim natijasini HTTP javobga aylantiradi (agar so'rov davom etmasligi kerak bo'lsa)
function claimResponse(claim, json) {
  if (claim.isDuplicate) return json({ ...claim.cachedResponse, duplicate: true }, 200);
  if (claim.inProgress) return json({ error: "Bu amal hozir bajarilmoqda — bir oz kutib, natijani tekshiring" }, 409);
  if (claim.failed) return json({ error: "Takroriy so'rov tekshiruvi ishlamadi — qayta urinib ko'ring" }, 503);
  return null;
}

async function checkIdempotent(admin, idemKey, endpoint) {
  if (!idemKey) return { isDuplicate: false };
  const { data } = await admin.from('idempotency_keys').select('response').eq('idem_key', idemKey).maybeSingle();
  if (data) return { isDuplicate: true, cachedResponse: data.response };
  return { isDuplicate: false };
}

async function saveIdempotent(admin, idemKey, endpoint, response) {
  if (!idemKey) return;
  try {
    await admin.from('idempotency_keys').insert({ idem_key: idemKey, endpoint, response });
  } catch (e) { /* unique constraint — boshqa parallel so'rov allaqachon yozgan bo'lishi mumkin */ }
}

module.exports = { claimIdempotent, completeIdempotent, releaseIdempotent, claimResponse, checkIdempotent, saveIdempotent, scopedKey };
