// v25.3 — HISOBOT WIDGETI UCHUN DAVR KO'RSATKICHLARI (so'mda). Telegram API'ga bog'liq emas — widget ham, matnli
// hisobot ham, testlar ham shu yerdan foydalanadi.
//
// Davrlar (Toshkent sanasi bo'yicha, savdoning `date` maydoni 'YYYY-MM-DD'):
//   d — bugun;  w — shu hafta (dushanbadan bugungacha);  m — shu oy (1-sanadan bugungacha)
// Ko'rsatkichlar (barcha filiallar bo'yicha, butun so'm):
//   Savdo  — sotilgan jami (UZS savdoda — to'langan/yaxlitlangan jami; USD savdoda — savdo kunidagi kurs bo'yicha)
//   Naqd   — naqd so'm + naqd dollar (so'mga aylantirilgan) + aralash to'lovning naqd kassalarga tushgan qismi
//   Karta  — karta + aralash to'lovning karta kassasiga tushgan qismi
//   Qarz   — shu davrda qarzga sotilgan (to'lanmagan) qism
//   Cheklar soni — savdolar soni
// Hisobga OLINMAYDI: bekor qilingan/o'chirilgan savdolar va filiallararo jo'natma (isFilialTransfer — ichki hisob, savdo emas).
// Qarzdorlar — davrga bog'liq emas: hozir qarzi bor mijozlar soni va jami qarzi (mijoz qarzi so'mda saqlanadi).
'use strict';

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const KINDS = ['d', 'w', 'm'];
const LABELS = { d: 'Bugun', w: 'Hafta', m: 'Oy' };

// 18450000 → "18 450 000" (butun so'm, oddiy bo'sh joy bilan; manfiy — «−»)
function fmtSom(n) {
  const v = Math.round(num(n));
  return (v < 0 ? '−' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
// Toshkent (UTC+5, yozgi vaqt yo'q) bo'yicha bugungi sana
function tashkentToday(now = new Date()) { return ymd(new Date(now.getTime() + 5 * 3600e3)); }

// { kind, from, to, label } — from/to — 'YYYY-MM-DD' (ikkalasi ham kiradi)
function periodRange(kind, today) {
  if (!KINDS.includes(kind)) throw new Error("Noma'lum davr: " + kind);
  const t = new Date(String(today) + 'T12:00:00Z');
  if (Number.isNaN(t.getTime())) throw new Error("Noto'g'ri sana: " + today);
  let from = ymd(t);
  if (kind === 'w') { const dow = (t.getUTCDay() + 6) % 7; from = ymd(new Date(t.getTime() - dow * 864e5)); }   // dushanba = 0
  if (kind === 'm') from = ymd(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)));
  return { kind, from, to: ymd(t), label: LABELS[kind] };
}

function isCounted(s) {
  return !!s && s.status !== 'cancelled' && s.status !== 'void' && s.status !== 'voided' && !s.isFilialTransfer;
}

// Bitta savdo → so'mdagi qismlar { total, cash, card, debt }
function saleSom(s, boxes, fallbackRate) {
  const rate = num(s.rateUsdUzs) > 0 ? num(s.rateUsdUzs) : num(fallbackRate);
  const toSom = (usd) => Math.round(num(usd) * rate);
  let total;
  if (s.cur !== 'USD' && num(s.tolangan_jami) > 0) total = Math.round(num(s.tolangan_jami));
  else if (s.cur !== 'USD' && num(s.roundedTotalUzs) > 0) total = Math.round(num(s.roundedTotalUzs));
  else total = toSom(s.totalUsd);
  const debt = Math.min(total, Math.max(0, toSom(s.debtUsd)));
  // To'langan qism: qarz bo'lmasa — jami (yaxlitlashda tiyin farqi chiqmasin), aks holda jami − qarz
  const paid = Math.max(0, total - debt);
  let cash = 0, card = 0;
  if (s.payType === 'card') card = paid;
  else if (s.payType === 'cash_uzs' || s.payType === 'usd') cash = paid;
  else if (s.payType === 'mixed' && Array.isArray(s.mixedRows) && s.mixedRows.length) {
    let c = 0, k = 0;
    for (const r of s.mixedRows) {
      const box = (boxes || []).find((b) => b && String(b.id) === String(r && r.boxId));
      const amt = box && box.cur === 'USD' ? toSom(r.amount) : Math.round(num(r && r.amount));
      if (box && box.type === 'card') k += amt; else c += amt;
    }
    // kassalar yig'indisi to'langan qismdan farq qilsa (qaytim, yaxlitlash) — mutanosib moslanadi
    const sum = c + k;
    if (sum > 0) { card = Math.round(paid * (k / sum)); cash = paid - card; } else cash = paid;
  } else if (s.payType !== 'debt') cash = paid;   // eski yozuvlar (payType yo'q) — naqd
  return { total, cash, card, debt };
}

// data — app_data (filial nusxalari bilan, loadAll natijasi); kind — d|w|m; today — 'YYYY-MM-DD'
function periodStats(data, kind, today) {
  const range = periodRange(kind, today);
  const st = (data && data.settings) || {};
  const rate = num(st.usdUzs);
  const store = (data && data.branchStore) || {};
  const out = { period: range, sales: 0, cash: 0, card: 0, debt: 0, checks: 0, top: [], debtors: { count: 0, sum: 0 } };
  const prod = new Map();
  for (const key of Object.keys(store)) {
    const b = store[key] || {};
    for (const s of b.sales || []) {
      if (!isCounted(s)) continue;
      const d = String(s.date || '').slice(0, 10);
      if (d < range.from || d > range.to) continue;
      const v = saleSom(s, b.cashboxes, rate);
      out.sales += v.total; out.cash += v.cash; out.card += v.card; out.debt += v.debt; out.checks += 1;
      // top tovar — miqdor bo'yicha; summa — savdo jamisiga mutanosib (chegirma hisobga olinadi)
      const lines = (s.items || []).filter((i) => i && num(i.qty) > 0);
      const gross = lines.reduce((a, i) => a + num(i.qty) * num(i.sellUsd), 0);
      for (const i of lines) {
        const id = i.pid != null ? 'p' + i.pid : 'n' + String(i.name || i.sku || '');
        const p = prod.get(id) || { name: String(i.name || i.sku || ('#' + i.pid)), qty: 0, sum: 0 };
        p.qty += num(i.qty);
        p.sum += gross > 0 ? v.total * (num(i.qty) * num(i.sellUsd)) / gross : 0;
        prod.set(id, p);
      }
    }
    for (const c of b.customers || []) {
      const debt = num(c && c.debt);
      if (debt > 0) { out.debtors.count += 1; out.debtors.sum += Math.round(debt); }
    }
  }
  out.top = [...prod.values()].sort((a, z) => z.qty - a.qty || z.sum - a.sum || a.name.localeCompare(z.name)).slice(0, 3)
    .map((p) => ({ name: p.name.slice(0, 60), qty: Math.round(p.qty * 1000) / 1000, sum: Math.round(p.sum) }));
  for (const k of ['sales', 'cash', 'card', 'debt']) out[k] = Math.round(out[k]);
  return out;
}

module.exports = { KINDS, LABELS, fmtSom, tashkentToday, periodRange, saleSom, periodStats };
