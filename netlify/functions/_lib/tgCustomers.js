// v25.1 — MIJOZNI TELEGRAM BOTGA ULASH VA SHAXSIY ESLATMALAR (egasi talabi).
//
// Telegram boti telefon raqam bo'yicha xabar yubora olmaydi — mijoz botni o'zi ochishi shart. Shuning uchun:
//   1) xodim mijoz kartasida shaxsiy havola yaratadi (t.me/<bot>?start=cus<kod>) va uni mijoz RAQAMIGA SMS yoki
//      Telegram orqali yuboradi;
//   2) mijoz havolani ochib «Start» bosadi → bot uni shu mijozga bog'laydi (har soatda va «Tekshirish»da);
//   3) keyin mijozga FAQAT o'zining nasiya, to'lov va qaytarish kuni xabarlari keladi.
// Bot webhook ishlatmaydi (boshqa funksiyalar getUpdates'ga tayanadi) — getUpdates OFFSETSIZ o'qiladi (boshqalarning
// yangilanishlari o'chmaydi). Bog'lanishlar app_data 'tg_customer_links' qatorida (faqat server; ilova yozuvlari bilan
// to'qnashmaydi). Kod — 12 belgili tasodifiy, taxmin qilib bo'lmaydi; bitta kod faqat bitta mijozga.
'use strict';
const crypto = require('crypto');
const { TOKEN_RE } = require('./dailyReportRun');

const ROW_ID = 'tg_customer_links';
const CODE_RE = /^cus[A-Za-z0-9]{12}$/;
const ALPH = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const sp = (n) => Math.round(num(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const uzs = (n) => sp(n) + " so'm";
const fmtDate = (d) => String(d || '').slice(0, 10).split('-').reverse().join('.');
const key = (filial, custId) => `${filial}:${Number(custId)}`;

async function tgApi(token, method, payload) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify(payload || {}) });
    return await r.json().catch(() => ({ ok: false }));
  } catch (e) { return { ok: false, description: e && e.name === 'AbortError' ? 'timeout' : 'network' }; }
  finally { clearTimeout(t); }
}

async function loadLinks(admin) {
  const { data, error } = await admin.from('app_data').select('data').eq('id', ROW_ID).maybeSingle();
  if (error) throw error;
  const d = (data && data.data) || {};
  return { codes: d.codes && typeof d.codes === 'object' ? d.codes : {}, links: d.links && typeof d.links === 'object' ? d.links : {} };
}
async function saveLinks(admin, st) {
  const { error } = await admin.from('app_data').upsert({ id: ROW_ID, data: st, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw error;
}

function newCode() { const b = crypto.randomBytes(12); return 'cus' + Array.from(b, (x) => ALPH[x % ALPH.length]).join(''); }

// Mijoz uchun kod (bor bo'lsa — o'sha). Bitta mijozga bitta faol kod.
async function codeFor(admin, filial, custId) {
  const st = await loadLinks(admin);
  const k = key(filial, custId);
  let code = Object.keys(st.codes).find((c) => st.codes[c] && key(st.codes[c].filial, st.codes[c].custId) === k);
  if (!code) { code = newCode(); st.codes[code] = { filial, custId: Number(custId), createdAt: new Date().toISOString() }; await saveLinks(admin, st); }
  return { code, linked: st.links[k] || null };
}

async function unlink(admin, filial, custId) {
  const st = await loadLinks(admin); const k = key(filial, custId);
  delete st.links[k];
  for (const c of Object.keys(st.codes)) if (st.codes[c] && key(st.codes[c].filial, st.codes[c].custId) === k) delete st.codes[c];
  await saveLinks(admin, st);
}

// Botdagi «Start cus…» bosganlarni topib bog'laydi. Yangi bog'langanlarga tasdiq xabari. Natija — yangi bog'lanishlar soni.
async function sweep(admin, token, brand, customerName) {
  if (!TOKEN_RE.test(String(token || ''))) return 0;
  const st = await loadLinks(admin);
  // Kutilayotgan (hali bog'lanmagan) havola bo'lmasa — Telegram'ga umuman murojaat yo'q
  const linkedKeys = new Set(Object.keys(st.links));
  if (!Object.values(st.codes).some((c) => c && !linkedKeys.has(key(c.filial, c.custId)))) return 0;
  const up = await tgApi(token, 'getUpdates', { limit: 100, allowed_updates: ['message'] });
  if (!up || !up.ok || !Array.isArray(up.result)) return 0;
  let added = 0;
  for (const u of up.result) {
    const m = u && u.message; if (!m || !m.chat || m.chat.type !== 'private') continue;
    const mt = /^\/start\s+(cus[A-Za-z0-9]{12})$/.exec(String(m.text || '').trim()); if (!mt) continue;
    const c = st.codes[mt[1]]; if (!c) continue;
    const k = key(c.filial, c.custId);
    if (st.links[k] && String(st.links[k].chatId) === String(m.chat.id)) continue;   // allaqachon
    st.links[k] = { chatId: m.chat.id, name: [m.from && m.from.first_name, m.from && m.from.last_name].filter(Boolean).join(' ').slice(0, 80),
      username: m.from && m.from.username ? '@' + String(m.from.username).slice(0, 40) : null, linkedAt: new Date().toISOString() };
    added++;
    const nm = typeof customerName === 'function' ? await customerName(c.filial, c.custId) : null;
    await tgApi(token, 'sendMessage', { chat_id: m.chat.id, parse_mode: 'HTML',
      text: `✅ <b>${esc(brand || 'Doʻkon')}</b>\n${nm ? esc(nm) + ', s' : 'S'}iz mijozlar roʻyxatiga ulandingiz.\nNasiya xaridlaringiz, toʻlovlaringiz va qarzni qaytarish kuni haqidagi eslatmalar shu yerga keladi.` });
  }
  if (added) await saveLinks(admin, st);
  return added;
}

// Mijozning o'ziga xabar (bog'langan bo'lsa). Xato — faqat logga.
async function sendToCustomer(admin, token, filial, custId, text) {
  try {
    if (!TOKEN_RE.test(String(token || ''))) return false;
    const st = await loadLinks(admin); const l = st.links[key(filial, custId)]; if (!l) return false;
    const r = await tgApi(token, 'sendMessage', { chat_id: l.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
    if (!r.ok) console.warn('[tgCustomers] send', r.description);
    return !!r.ok;
  } catch (e) { console.warn('[tgCustomers]', e && e.message); return false; }
}

// ── Mijozga xabar matnlari (faqat o'z ma'lumoti) ──
function custCreditText({ brand, custName, items, discPct, debtUsd, rate, dueDate }) {
  const k = 1 - Math.min(100, Math.max(0, num(discPct))) / 100;
  const lines = (items || []).slice(0, 30).map((i) => `• ${esc(i.name || i.sku || '')} — ${+num(i.qty).toFixed(3)} dona`);
  const debtUzs = rate > 0 ? debtUsd * rate : null;
  return [`🧾 <b>${esc(brand)}</b> — nasiya xarid`, custName ? `Hurmatli ${esc(custName)}!` : '', ...lines,
    debtUzs != null ? `💰 Qarzga: <b>${esc(uzs(debtUzs))}</b>` : `💰 Qarzga: <b>$${debtUsd.toFixed(2)}</b>`,
    dueDate ? `📅 Qaytarish sanasi: <b>${fmtDate(dueDate)}</b>` : ''].filter(Boolean).join('\n') + (k < 1 ? '' : '');
}
function custPayText({ brand, amountText, debtAfterUzs }) {
  const full = debtAfterUzs != null && num(debtAfterUzs) <= 0.5;
  return [`💵 <b>${esc(brand)}</b> — toʻlovingiz qabul qilindi: <b>${esc(amountText)}</b>`,
    full ? '✅ Qarzingiz toʻliq yopildi. Rahmat!' : (debtAfterUzs != null ? `Qolgan qarz: <b>${esc(uzs(debtAfterUzs))}</b>` : '')].filter(Boolean).join('\n');
}
function custRemindText({ brand, custName, debtUzs, due, today }) {
  const late = due < today; const days = Math.round((Date.parse(today) - Date.parse(due)) / 864e5);
  return [`⏰ <b>${esc(brand)}</b> — eslatma`, custName ? `Hurmatli ${esc(custName)}!` : '',
    late ? `Qarzni qaytarish muddati <b>${fmtDate(due)}</b> edi (${days} kun oʻtdi).` : `Bugun (<b>${fmtDate(due)}</b>) qarzni qaytarish kuni.`,
    `Qarzingiz: <b>${esc(uzs(debtUzs))}</b>`].filter(Boolean).join('\n');
}

module.exports = { ROW_ID, CODE_RE, loadLinks, saveLinks, codeFor, unlink, sweep, sendToCustomer, custCreditText, custPayText, custRemindText, key, tgApi };
