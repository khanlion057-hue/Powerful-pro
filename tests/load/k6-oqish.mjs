// 1-ssenariy: ERTALAB HAMMA BIR VAQTDA KIRADI — o'qish yuklamasi.
//   k6 run -e BASE_URL=... -e LOGIN=... -e PASSWORD=... tests/load/k6-oqish.mjs
// Bosqichlar: 20 (haqiqiy xodimlar soni) → 50 → 100 → 200 virtual foydalanuvchi. Har biri: ma'lumot yuklash + profil.
// Mezon: 95% so'rov 800 ms dan tez, xato 1% dan kam. Qayerda sinsa — o'sha bosqich «chegara».
import http from 'k6/http';
import { check, sleep } from 'k6';
import { guard, login, fn, auth } from './_common.mjs';

export const options = {
  scenarios: {
    ertalab: {
      executor: 'ramping-vus', startVUs: 0,
      stages: [
        { duration: '1m', target: 20 }, { duration: '2m', target: 20 },
        { duration: '1m', target: 50 }, { duration: '2m', target: 50 },
        { duration: '1m', target: 100 }, { duration: '2m', target: 100 },
        { duration: '1m', target: 200 }, { duration: '2m', target: 200 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
    'http_req_duration{fn:app-data-load}': ['p(95)<1500'],
  },
};

export function setup() { guard(); return login(); }

export default function (s) {
  const o = auth(s.token);
  const a = http.post(fn('app-data-load'), '{}', Object.assign({ tags: { fn: 'app-data-load' } }, o));
  check(a, { 'app-data-load 200': (r) => r.status === 200, 'cheklanmadi (429 emas)': (r) => r.status !== 429 });
  const w = http.post(fn('staff-whoami'), '{}', Object.assign({ tags: { fn: 'staff-whoami' } }, o));
  check(w, { 'staff-whoami 200': (r) => r.status === 200 });
  sleep(3 + Math.random() * 4);   // haqiqiy xodim — bir necha soniyada bitta amal
}
