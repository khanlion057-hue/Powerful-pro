// v25.6.9 — Telegram xabarlari uchun YAGONA ustun uslubi: chapda nomi, o'ngda qiymat, <pre> ichida (monoshrift, faqat ASCII).
// v25.6.10 (egasi talabi): kenglik 34; har ma'lumot O'Z USTUNIDA (table), birlik sarlavhada — qatorda takrorlanmaydi;
// JAMI shu jadval ichida; nom uzun bo'lsa — qisqartiriladi (qiymat keyingi qatorga TUSHMAYDI); kirill harflari lotinga.
'use strict';
const W = 34;
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ESC[c]);
const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h', і: 'i', ї: 'i', є: 'e' };
const translit = (t) => String(t).replace(/[Ѐ-ӿ]/g, (c) => { const l = c.toLowerCase(), r = CYR[l]; if (r == null) return '?'; return c === l ? r : (r.charAt(0).toUpperCase() + r.slice(1)); });
const asc = (t) => translit(String(t == null ? '' : t)).replace(/[ʻʼ‘’ʹ`]/g, "'").replace(/[−–—]/g, '-').replace(/×/g, 'x').replace(/…/g, '.').replace(/№/g, 'N')
  .replace(/[«»“”„]/g, '"').replace(/[^\x20-\x7E\n]/g, '?');
// Raqamlar: sp — minglik bo'shliq; m2 — doim 2 kasr (pul $); q — miqdor (keraksiz nollarsiz)
const sp = (n, d = 0) => {
  const v = Math.round(num(n) * 10 ** d) / 10 ** d;
  const [i, f] = Math.abs(v).toFixed(d).split('.');
  return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f && +f ? '.' + f : '');
};
const m2 = (n) => { const v = Math.round(num(n) * 100) / 100; const [i, f] = Math.abs(v).toFixed(2).split('.'); return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + f; };
const q = (n) => { const v = Math.round(num(n) * 1000) / 1000; return Number.isInteger(v) ? sp(v) : String(v); };
const usd = (n) => '$' + m2(n);
const uzs = (n) => sp(n) + " so'm";
const cut = (s, n) => { s = asc(s || ''); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '.' : s; };
// Ikki ustun: chapda nom, o'ngda qiymat. Sig'masa — nom qisqartiriladi (qiymat hech qachon keyingi qatorga tushmaydi)
function row(l, v) {
  l = asc(l); v = asc(v);
  if (l.length + 1 + v.length > W) l = cut(l, Math.max(4, W - 1 - v.length));
  return l + ' '.repeat(Math.max(1, W - l.length - v.length)) + v;
}
const LINE = '-'.repeat(W);
const pre = (rows) => '<pre>' + rows.map((r) => esc(r)).join('\n') + '</pre>';
// Jadval: cols = [{ h: 'Sarlavha', w: kenglik, r: true (o'ngga) }]; birinchi ustun kengligi — qolgan joy (w: 0).
// rows: massiv (katakchalar) yoki satr ('[Filial]' kabi bo'lim sarlavhasi); foot: JAMI qatorlari (chiziqdan keyin).
function table(cols, rows, foot) {
  const fixed = cols.reduce((t, c, i) => t + (i ? c.w : 0), 0);
  const ws = cols.map((c, i) => (i ? c.w : Math.max(4, W - fixed)));
  // Bo'sh katak joyi keyingi (o'ngga tekislangan) qiymatga beriladi; RAQAM HECH QACHON QIRQILMAYDI (avval «1 080 000» → «080 000»)
  const line = (r) => {
    if (typeof r === 'string') return cut(r, W).replace(/\s+$/, '');
    let out = '', carry = 0;
    cols.forEach((c, i) => {
      const w = ws[i], t = asc(r[i] == null ? '' : r[i]);
      if (!t) { carry += w; return; }
      if (c.r) {
        let over = t.length - (w + carry);
        if (over > 0) { const m = out.match(/ +$/); const take = Math.min(over, m ? Math.max(0, m[0].length - 1) : 0); out = out.slice(0, out.length - take); over -= take; }
        out += t.padStart(w + carry); carry = 0; return;
      }
      out += ' '.repeat(carry) + cut(t, w).padEnd(w); carry = 0;
    });
    return out.replace(/\s+$/, '');
  };
  const out = [line(cols.map((c) => c.h)), LINE, ...rows.map(line)];
  if (foot && foot.length) out.push(LINE, ...foot.map(line));
  return pre(out);
}
module.exports = { W, num, esc, asc, translit, sp, m2, q, usd, uzs, cut, row, LINE, pre, table };
