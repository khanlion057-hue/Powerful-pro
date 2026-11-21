// v25.3 — TELEGRAM HISOBOT WIDGETI: HTML, so'rov tahlili, admin tekshiruvi, env'dan token.
// Telegram Bot API'ning widget metodlariga (yuborish, holatni yangilash, kiruvchi so'rov) BOG'LIQ EMAS — ular rasmiy
// hujjat bo'yicha alohida ulanadi (`telegram-widget` funksiyasi). Bu yerda faqat API'siz qismlar.
//
// XAVFSIZLIK:
//   • Bot tokeni — faqat env: TG_BOT_TOKEN. Kodda ham, bazada ham yo'q (botToken()).
//   • Admin — faqat env: TG_ADMIN_IDS (Telegram foydalanuvchi id'lari, vergul bilan). Har so'rovda tekshiriladi;
//     widget faqat admin bilan SHAXSIY chatda (chat id = foydalanuvchi id) ishlaydi.
//   • So'rov — 64 baytgacha, qat'iy format: p=d|w|m  (ixtiyoriy: ;v=sum|top|debt). Boshqa har narsa rad etiladi.
'use strict';
const { fmtSom } = require('./reportPeriod');

const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;
const MAX_QUERY_BYTES = 64;
const QUERY_RE = /^p=(d|w|m)(?:;v=(sum|top|debt))?$/;

function botToken(env = process.env) {
  const t = String(env.TG_BOT_TOKEN || '').trim();
  if (!TOKEN_RE.test(t)) throw new Error("Server sozlanmagan: TG_BOT_TOKEN env o'zgaruvchisi yo'q yoki noto'g'ri");
  return t;
}

function adminIds(env = process.env) {
  return [...new Set(String(env.TG_ADMIN_IDS || '').split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^\d{3,20}$/.test(x)))];
}
// true — faqat env ro'yxatidagi admin, shaxsiy chatda (guruh/kanal — yo'q). Ro'yxat bo'sh bo'lsa — hech kim.
function isAdminPrivate({ userId, chatId, chatType } = {}, env = process.env) {
  const u = String(userId == null ? '' : userId);
  if (!/^\d{3,20}$/.test(u) || !adminIds(env).includes(u)) return false;
  if (chatType != null && chatType !== 'private') return false;
  if (chatId != null && String(chatId) !== u) return false;
  return true;
}

// '…' → { period: 'd'|'w'|'m', view: 'sum'|'top'|'debt' } yoki null (rad)
function parseQuery(q) {
  if (typeof q !== 'string' || !q || Buffer.byteLength(q, 'utf8') > MAX_QUERY_BYTES) return null;
  const m = QUERY_RE.exec(q);
  return m ? { period: m[1], view: m[2] || 'sum' } : null;
}
function makeQuery(period, view) {
  const q = 'p=' + period + (view && view !== 'sum' ? ';v=' + view : '');
  if (!parseQuery(q)) throw new Error("Noto'g'ri so'rov: " + q);
  return q;
}

// periodStats natijasi → widget holati (faqat ko'rsatish uchun kerakli maydonlar, matn tayyor formatda)
function widgetState(stats, view = 'sum') {
  const p = stats.period;
  const dd = (s) => s.split('-').reverse().join('.');
  return {
    p: p.kind, v: view,
    t: p.from === p.to ? dd(p.to) : `${dd(p.from)} – ${dd(p.to)}`,
    r: [['Savdo', fmtSom(stats.sales)], ['Naqd', fmtSom(stats.cash)], ['Karta', fmtSom(stats.card)], ['Qarz', fmtSom(stats.debt)], ['Cheklar soni', String(stats.checks)]],
    top: stats.top.map((x) => [x.name, String(x.qty), fmtSom(x.sum)]),
    dc: stats.debtors.count, ds: fmtSom(stats.debtors.sum),
  };
}

// Logotip — ichki SVG (tashqi rasm/shrift yo'q): arra tig'i ichida «PG»
const LOGO = '<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="16" fill="#E8961E"/>'
  + '<path d="M17 3l2 3 3-2 1 4 4-1-1 4 4 1-2 3 3 2-3 2 2 3-4 1 1 4-4-1-1 4-3-2-2 3-2-3-3 2-1-4-4 1 1-4-4-1 2-3-3-2 3-2-2-3 4-1-1-4 4 1 1-4 3 2z" fill="#1B1C1F" opacity=".18"/>'
  + '<text x="17" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#fff">PG</text></svg>';

// Widget HTML (bitta fayl, ichki CSS/JS). state — boshlang'ich holat (widgetState); JS'dagi send() — Telegram
// widget so'rovi uchun YAGONA ulash nuqtasi (rasmiy hujjat bo'yicha to'ldiriladi; hozir window.fwWidgetSend bo'lsa — o'sha).
function buildWidgetHtml(state) {
  const json = JSON.stringify(state || null).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>powerful-pro hisobot</title><style>
*{box-sizing:border-box}body{margin:0;font:14px/1.4 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#fff;color:#1c2433}
.w{max-width:420px;margin:0 auto;padding:12px}.h{display:flex;align-items:center;gap:10px;margin-bottom:10px}.h b{font-size:16px}.h small{display:block;color:#7a8494;font-size:12px}
.g{display:flex;gap:6px;margin:8px 0}.g button{flex:1;padding:9px 4px;border:1px solid #e1e6ed;border-radius:10px;background:#f7f8fa;color:#1c2433;font:inherit;font-weight:600;cursor:pointer}
.g button.on{background:#E8961E;border-color:#E8961E;color:#fff}table{width:100%;border-collapse:collapse;margin-top:4px}td{padding:8px 6px;border-bottom:1px solid #eef0f4}
td+td{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}tr.c td{color:#7a8494;font-size:12px}#m{min-height:18px;color:#7a8494;font-size:12px;margin-top:6px}
@media(prefers-color-scheme:dark){body{background:#17191c;color:#eceef1}.g button{background:#22252a;border-color:#30343a;color:#eceef1}td{border-color:#2a2e34}}
</style></head><body><div class="w">
<div class="h">${LOGO}<div><b>powerful-pro hisobot</b><small id="t"></small></div></div>
<div class="g" id="pg"><button data-p="d">Bugun</button><button data-p="w">Hafta</button><button data-p="m">Oy</button></div>
<table id="tb"></table>
<div class="g" id="vg"><button data-v="top">Top tovar</button><button data-v="debt">Qarzdorlar</button></div>
<div id="m"></div></div><script>
(function(){var S=${json},E=function(i){return document.getElementById(i)};
function x(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function row(a,b,c){return'<tr'+(c?' class="c"':'')+'><td>'+x(a)+'</td><td>'+x(b)+'</td></tr>'}
function send(q){if(q.length>64)return;try{if(window.fwWidgetSend){window.fwWidgetSend(q);E('m').textContent='Yangilanmoqda…'}else E('m').textContent='Ulanish yoʻq'}catch(e){E('m').textContent='Xato'}}
function draw(){if(!S){E('m').textContent='Maʼlumot yoʻq';return}E('t').textContent=S.t;E('m').textContent='';
[].forEach.call(E('pg').children,function(b){b.className=b.getAttribute('data-p')===S.p?'on':''});
[].forEach.call(E('vg').children,function(b){b.className=b.getAttribute('data-v')===S.v?'on':''});
var h='';if(S.v==='top'){h=row('Top tovar','Soni · Summa',1);S.top.forEach(function(r,i){h+=row((i+1)+'. '+r[0],r[1]+' · '+r[2])});if(!S.top.length)h+=row('Bu davrda savdo yoʻq','—')}
else if(S.v==='debt'){h=row('Qarzdorlar','',1)+row('Soni',S.dc)+row('Jami qarz (soʻm)',S.ds)}
else{h=row('Koʻrsatkich','Soʻm',1);S.r.forEach(function(r){h+=row(r[0],r[1])})}E('tb').innerHTML=h}
E('pg').onclick=function(e){var p=e.target.getAttribute('data-p');if(p)send('p='+p+(S&&S.v!=='sum'?';v='+S.v:''))};
E('vg').onclick=function(e){var v=e.target.getAttribute('data-v');if(!v||!S)return;S.v=S.v===v?'sum':v;draw()};
window.fwWidgetSet=function(s){S=s;draw()};draw()})();
</script></body></html>`;
}

module.exports = { TOKEN_RE, MAX_QUERY_BYTES, botToken, adminIds, isAdminPrivate, parseQuery, makeQuery, widgetState, buildWidgetHtml };
