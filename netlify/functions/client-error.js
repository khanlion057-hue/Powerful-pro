// Netlify Function — v25.2: BRAUZERDAGI XATOLAR (js/fw-err.js yuboradi). Xodim telefoni yoki kompyuterida sahifa
// xato bersa — egasi Telegram'da biladi (bir xil xato 30 daqiqada ko'pi bilan bir marta), jurnal — ops_events.
//   POST { msg, src, line, col, stack, page, ver } → 204
// Ochiq (kirishsiz ham — kirish oynasidagi xato ham kerak): IP bo'yicha 5 daqiqada 20 ta (monitor.js), matnlar qisqartiriladi,
// hech narsa brauzerga qaytarilmaydi. Shovqin (brauzer kengaytmalari, «Script error.», ResizeObserver) — e'tiborsiz.
'use strict';
const crypto = require('crypto');
const { methodGuard, parseBody } = require('./_lib/supabaseAdmin');
const ops = require('./_lib/opsGuard');

const NOISE = /ResizeObserver loop|^Script error\.?$|chrome-extension:|moz-extension:|safari-extension:|Non-Error promise rejection|AbortError|The user aborted|Load failed$|NetworkError when attempting|Failed to fetch$/i;
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').slice(0, n);

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;
  const b = parseBody(event) || {};
  const msg = clip(b.msg, 300).trim();
  if (!msg || NOISE.test(msg) || NOISE.test(String(b.src || ''))) return { statusCode: 204, body: '' };
  if (!ops.opsOn()) return { statusCode: 204, body: '' };
  const page = clip(b.page, 40).replace(/[^a-z0-9._#/-]/gi, '');
  const src = clip(b.src, 160).replace(/^https?:\/\/[^/]+/, '');
  const where = src ? `${src}:${Number(b.line) || 0}:${Number(b.col) || 0}` : '';
  const key = 'client:' + crypto.createHash('sha1').update(msg + '|' + src).digest('hex').slice(0, 16);
  let admin;
  try { admin = ops.getAdminClient(); } catch (_) { return { statusCode: 204, body: '' }; }
  await ops.report(admin, { kind: 'client', fn: page || 'brauzer', key, windowSec: 1800, title: 'Ilovada xato (brauzer)',
    detail: [msg, where, clip(b.stack, 300), b.ver ? 'versiya ' + clip(b.ver, 12) : ''].filter(Boolean).join('\n') });
  return { statusCode: 204, body: '' };
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('client-error', exports.handler);
