// Vercel ↔ Netlify Functions adapteri.
// Brauzer hamon /.netlify/functions/<nom> ga murojaat qiladi — vercel.json bu manzilni /api/fn?__fn=<nom> ga yo'naltiradi.
// Bu yerda Vercel so'rovi Netlify «event» ko'rinishiga keltiriladi va netlify/functions/<nom>.js dagi handler chaqiriladi —
// funksiyalar kodi o'zgarmaydi (Netlify'da ham, Vercel'da ham bir xil ishlaydi).
// Vercel bepul tarifida bitta deployda 12 tadan ortiq funksiya bo'lmaydi — shuning uchun 63 ta funksiya bitta kirish nuqtasida.
'use strict';
const REGISTRY = require('./_registry');

// Jadval (cron) funksiyalari: faqat CRON_SECRET bilan (Supabase pg_cron yoki Vercel Cron chaqiradi).
// Netlify'dagidek tanada `next_run` bilan POST hosil qilinadi — funksiya ichidagi himoya (scheduledGuard) o'zgarmaydi.
const SCHEDULED = new Set(['telegram-daily-report', 'backup-daily']);
const MAX_BODY = 12 * 1024 * 1024; // 12 MB (Excel kirim va rasmlar uchun yetarli; Vercel chegarasi ~4.5 MB baribir oldinroq)

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, headers) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers || {})) if (v != null) res.setHeader(k, v);
  res.end(body == null ? '' : body);
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const name = url.searchParams.get('__fn') || '';
  if (!/^[a-z0-9-]{2,64}$/.test(name) || !Object.prototype.hasOwnProperty.call(REGISTRY, name)) {
    return send(res, 404, JSON.stringify({ error: 'Not found' }), { 'Content-Type': 'application/json' });
  }

  let body = '';
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try { body = await readRaw(req); } catch (e) { return send(res, e.code === 413 ? 413 : 400, JSON.stringify({ error: 'Bad request body' }), { 'Content-Type': 'application/json' }); }
  }
  let httpMethod = req.method;

  if (SCHEDULED.has(name)) {
    const secret = process.env.CRON_SECRET || '';
    const auth = String(req.headers.authorization || '');
    if (!secret || auth !== 'Bearer ' + secret) return send(res, 404, JSON.stringify({ error: 'Not found' }), { 'Content-Type': 'application/json' });
    httpMethod = 'POST'; body = JSON.stringify({ next_run: new Date().toISOString() });
  }

  url.searchParams.delete('__fn');
  const qs = Object.fromEntries(url.searchParams.entries());
  const event = {
    httpMethod,
    headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(', ') : String(v)])),
    body: body || null,
    isBase64Encoded: false,
    path: '/.netlify/functions/' + name,
    rawQuery: url.searchParams.toString(),
    queryStringParameters: qs,
  };

  let out;
  try { out = await REGISTRY[name]().handler(event, {}); }
  catch (e) {
    console.error(`[${name}]`, e && e.stack || e);
    return send(res, 500, JSON.stringify({ error: 'Server xatosi' }), { 'Content-Type': 'application/json' });
  }
  out = out || {};
  const headers = Object.assign({}, out.headers || {});
  let payload = out.body == null ? '' : out.body;
  if (out.isBase64Encoded && typeof payload === 'string') payload = Buffer.from(payload, 'base64');
  return send(res, out.statusCode || 200, payload, headers);
};

// Vercel tanani o'zi o'qimasin — xom matn kerak (Netlify'dagidek event.body = satr)
module.exports.config = { api: { bodyParser: false } };
