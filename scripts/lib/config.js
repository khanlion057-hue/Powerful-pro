// js/config.js faylini yaratish va tekshirish (brauzer uchun OCHIQ sozlamalar).
// Xavfsizlik: faqat "anon" kalit qabul qilinadi — service_role kaliti brauzerga
// tushib qolsa, istalgan odam bazani to'liq boshqara oladi. Shuning uchun bu yerda
// kalitning ichidagi "role" tekshiriladi va service_role RAD etiladi.
'use strict';

function decodeJwtRole(key) {
  const parts = String(key || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload && payload.role ? String(payload.role) : null;
  } catch (e) { return null; }
}

// Yangi Supabase "publishable" kaliti (sb_publishable_...) ham brauzer uchun ochiq —
// "secret" (sb_secret_...) esa yo'q.
function checkAnonKey(key) {
  const k = String(key || '').trim();
  if (!k) return 'SUPABASE_ANON_KEY berilmagan';
  if (/^sb_secret_/i.test(k)) return "Bu MAXFIY (secret) kalit — brauzerga qo'yib bo'lmaydi. Supabase → Settings → API → \"anon public\" (yoki publishable) kalitini oling.";
  if (/^sb_publishable_/i.test(k)) return null;
  const role = decodeJwtRole(k);
  if (!role) return "Kalit formati noto'g'ri (JWT yoki sb_publishable_ kutilgan)";
  if (role !== 'anon') return `Bu "${role}" kaliti — brauzerga faqat "anon public" kaliti qo'yiladi. service_role kalitini hech qachon ishlatmang!`;
  return null;
}

function checkUrl(url) {
  const u = String(url || '').trim();
  if (!u) return 'SUPABASE_URL berilmagan';
  if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+\/?$/i.test(u)) return "SUPABASE_URL noto'g'ri (masalan: https://abcd1234.supabase.co)";
  return null;
}

function buildConfigJs({ url, anonKey }) {
  const e = checkUrl(url) || checkAnonKey(anonKey);
  if (e) throw new Error(e);
  const u = String(url).trim().replace(/\/$/, ''), k = String(anonKey).trim();
  return `// Loyiha sozlamalari (brauzer uchun OCHIQ qiymatlar).
// Bu faylni \`npm run setup\` yozadi. Bu yerga FAQAT Supabase "anon public" kaliti qo'yiladi —
// service_role kaliti hech qachon bu faylga (va umuman brauzerga) tushmasligi kerak.
window.FW_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(u)},
  SUPABASE_ANON_KEY: ${JSON.stringify(k)}
};
`;
}

// Mavjud js/config.js ichidagi qiymatlarni o'qish (build tekshiruvi uchun)
function parseConfigJs(text) {
  const url = /SUPABASE_URL:\s*["']([^"']+)["']/.exec(text || '');
  const key = /SUPABASE_ANON_KEY:\s*["']([^"']+)["']/.exec(text || '');
  return { url: url && url[1], anonKey: key && key[1] };
}

module.exports = { decodeJwtRole, checkAnonKey, checkUrl, buildConfigJs, parseConfigJs };
