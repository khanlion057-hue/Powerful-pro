// k6 yuklama testlari — umumiy qism (docs/YUKLAMA-TESTI.md).
// XAVFSIZLIK: testlar haqiqiy savdo yozadi va so'rovlar cheklovini ishga tushiradi — ISHLAYOTGAN SAYTDA ISHLATILMAYDI.
// BASE_URL — sinov nusxasi (Netlify deploy preview + alohida sinov Supabase loyihasi).
import http from 'k6/http';
import { fail } from 'k6';

export const BASE = String(__ENV.BASE_URL || '').replace(/\/+$/, '');
const PROD = ['powerful-pro.netlify.app'];

export function guard() {
  if (!/^https?:\/\//.test(BASE)) fail('BASE_URL kerak: masalan BASE_URL=https://deploy-preview-12--powerful-pro.netlify.app');
  const host = BASE.replace(/^https?:\/\//, '').split('/')[0];
  if (PROD.includes(host) || __ENV.FW_PROD_HOST === host) fail(`ISHLAYOTGAN SAYT (${host}) — yuklama testi bu yerda taqiqlangan. Sinov nusxasini ishlating.`);
}

export const fn = (name) => `${BASE}/.netlify/functions/${name}`;
export const JSON_H = { 'Content-Type': 'application/json' };

// Sinov xodimi bilan kirish (LOGIN/PASSWORD — sinov bazasidagi xodim). setup() ichida bir marta chaqiriladi.
export function login() {
  const r = http.post(fn('staff-login'), JSON.stringify({ login: __ENV.LOGIN, password: __ENV.PASSWORD, kind: 'staff' }), { headers: JSON_H });
  if (r.status !== 200) fail(`Kirish bo'lmadi (${r.status}): ${String(r.body).slice(0, 200)}`);
  const s = r.json('session');
  return { token: s.access_token };
}
export const auth = (token) => ({ headers: Object.assign({ Authorization: `Bearer ${token}` }, JSON_H) });
