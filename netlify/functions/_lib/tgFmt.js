// v25.6.9 — Telegram xabarlari uchun YAGONA ustun uslubi: chapda nomi, o'ngda qiymat, <pre> ichida (monoshrift, faqat ASCII).
'use strict';
const W = 30;
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ESC[c]);
const asc = (t) => String(t).replace(/[ʻʼ‘’ʹ]/g, "'").replace(/−/g, '-').replace(/×/g, 'x').replace(/…/g, '.').replace(/[^\x20-\x7E\n]/g, '?');
const sp = (n, d = 0) => {
  const v = Math.round(num(n) * 10 ** d) / 10 ** d;
  const [i, f] = Math.abs(v).toFixed(d).split('.');
  return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f && +f ? '.' + f : '');
};
const usd = (n) => '$' + sp(n, Math.abs(num(n)) >= 1000 ? 0 : 2);
const uzs = (n) => sp(n) + " so'm";
const cut = (s, n) => { s = asc(s || ''); return s.length > n ? s.slice(0, n - 1) + '.' : s; };
function row(l, v) {
  l = asc(l); v = asc(v);
  if (l.length + 1 + v.length <= W) return l + ' '.repeat(W - l.length - v.length) + v;
  return l + '\n' + ' '.repeat(Math.max(0, W - v.length)) + v;
}
const LINE = '-'.repeat(W);
const pre = (rows) => '<pre>' + rows.map((r) => esc(r)).join('\n') + '</pre>';
module.exports = { W, num, esc, asc, sp, usd, uzs, cut, row, LINE, pre };
