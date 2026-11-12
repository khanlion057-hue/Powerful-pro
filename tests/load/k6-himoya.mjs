// 3-ssenariy: HIMOYA ISHLAYDIMI — bitta IP'dan ko'p so'rov (bot hujumi). Kutilgan natija: chegaradan keyin 429.
//   k6 run -e BASE_URL=... tests/load/k6-himoya.mjs
// health: 1 daqiqada 30 tadan keyin 429; staff-login: 5 daqiqada 40 tadan keyin 429 (noto'g'ri parol bilan — sinov loginida).
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { guard, fn, JSON_H } from './_common.mjs';

const limited = new Counter('cheklangan_429');

export const options = {
  scenarios: {
    health: { executor: 'shared-iterations', vus: 5, iterations: 60, exec: 'health' },
    login: { executor: 'shared-iterations', vus: 5, iterations: 60, exec: 'badLogin', startTime: '5s' },
  },
  thresholds: { cheklangan_429: ['count>0'] },   // himoya ishlamasa — test yiqiladi
};

export function setup() { guard(); }

export function health() {
  const r = http.get(fn('health'));
  if (r.status === 429) limited.add(1, { fn: 'health' });
  check(r, { '200 yoki 429': (x) => x.status === 200 || x.status === 429, 'Retry-After bor (429 da)': (x) => x.status !== 429 || !!x.headers['Retry-After'] });
}

export function badLogin() {
  const r = http.post(fn('staff-login'), JSON.stringify({ login: 'k6-yoq-login', password: 'notogri-' + __ITER, kind: 'staff' }), { headers: JSON_H });
  if (r.status === 429) limited.add(1, { fn: 'staff-login' });
  check(r, { '5xx emas': (x) => x.status < 500 });
}
