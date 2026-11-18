// v25.6.7 — xodim/diller hisobi yaratilmaganda xatoning HAQIQIY sababi (qisqartirilgan) va ma'lum holatlar uchun yo'l-yo'riq.
// Avval faqat «... yaratishda xatolik» qaytarilar, sabab yashirin qolardi (prod: auth.users dagi begona trigger 9 marta 500 bergan).
// Qaytarilgan matn faqat tizimga kirgan, ruxsati bor xodimga ko'rinadi (create-staff / create-dealer himoyalangan).
'use strict';
function authFailText(e, base) {
  const msg = String((e && e.message) || e || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!msg) return base;
  const hint = /database error creating new user|\btrigger\b|does not exist|full_name/i.test(msg)
    ? " — bazadagi auth.users triggeri xato beryapti (Supabase → Database → Triggers; administratorga murojaat qiling)" : '';
  return `${base}: ${msg}${hint}`;
}
module.exports = { authFailText };
