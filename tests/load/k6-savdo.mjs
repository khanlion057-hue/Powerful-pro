// 2-ssenariy: KASSA ENG BAND PAYT — bir vaqtda ko'p savdo (yozish yuklamasi, atomik checkout).
//   k6 run -e BASE_URL=... -e LOGIN=... -e PASSWORD=... -e PID=<sinov mahsuloti id> -e SELL_USD=10 tests/load/k6-savdo.mjs
// Sinov bazasida PID mahsulotining qoldig'i yetarli bo'lsin (masalan 10 000 dona). Har so'rov — yangi idemKey.
// Tekshiradi: ombor qoldig'i to'g'ri kamayadimi (testdan keyin bazada sanang: savdolar soni = muvaffaqiyatli so'rovlar),
// takroriy yozuv yo'qmi, 409/429 ulushi, javob vaqti.
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Counter } from 'k6/metrics';
import { guard, login, fn, auth } from './_common.mjs';

const ok = new Counter('savdo_ok');
const rejected = new Counter('savdo_rad');

export const options = {
  scenarios: {
    kassa: {
      executor: 'ramping-arrival-rate', startRate: 1, timeUnit: '1s', preAllocatedVUs: 50, maxVUs: 200,
      stages: [
        { duration: '1m', target: 2 },    // 20 xodim uchun odatiy eng band payt — soniyasiga ~2 savdo
        { duration: '2m', target: 5 },
        { duration: '2m', target: 10 },
        { duration: '2m', target: 20 },   // 10 baravar zaxira
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: { http_req_failed: ['rate<0.02'], http_req_duration: ['p(95)<2000'] },
};

export function setup() {
  guard();
  if (!__ENV.PID) fail('PID kerak (sinov mahsuloti id)');
  return login();
}

export default function (s) {
  const body = {
    items: [{ pid: isNaN(+__ENV.PID) ? __ENV.PID : +__ENV.PID, qty: 1, sellUsd: +(__ENV.SELL_USD || 10) }],
    discPct: 0, paidUsd: +(__ENV.SELL_USD || 10), payType: 'naqd',
    idemKey: `k6-${__VU}-${__ITER}-${Date.now()}`, inv: `K6-${__VU}-${__ITER}`,
  };
  const r = http.post(fn('sale-checkout-atomic'), JSON.stringify(body), Object.assign({ tags: { fn: 'checkout' } }, auth(s.token)));
  if (r.status === 200) ok.add(1); else rejected.add(1, { status: String(r.status) });
  check(r, { 'savdo 200': (x) => x.status === 200, '5xx emas': (x) => x.status < 500 });
  sleep(0.2);
}
