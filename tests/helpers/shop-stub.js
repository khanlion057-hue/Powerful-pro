// Vitrina sinovi uchun: haqiqiy netlify/functions/shop-public.js — xotiradagi soxta Supabase bilan, lokal HTTP serverda.
// Namuna ma'lumot: arra tig'lari (Ø, tish soni, material) va asboblar; Baza filialida do'kon yoqilgan.
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');

function fixture() {
  const products = [], batches = [];
  const blades = [[110, 30, 'Yogʻoch', 1.6], [125, 40, 'Yogʻoch', 1.6], [180, 40, 'Yogʻoch', 1.8], [200, 60, 'Yogʻoch', 2], [250, 60, 'Yogʻoch', 2.4], [250, 80, 'Laminat / DSP', 3.2],
    [300, 96, 'Laminat / DSP', 3.2], [300, 72, 'Yogʻoch', 3.0], [250, 100, 'Alyuminiy', 2.8], [350, 120, 'Alyuminiy', 3.0], [120, 24, 'Laminat / DSP', 3.0], [400, 80, 'Yogʻoch', 3.0]];
  blades.forEach(([d, t, m, k], i) => {
    const mat = m === 'Yogʻoch' ? "yog'och" : m === 'Alyuminiy' ? 'alyuminiy' : 'laminat/DSP';
    products.push({ id: i + 1, name: `Arra tigʻi Ø${d} ×${k}×30 ${t}T — ${mat} kesish`, sku: 'PWR' + String(d) + t, brand: i % 3 ? 'POWERFUL' : 'TCC', cat: 'Arra tigʻlari', markupPct: 25, param1: `Tashqi Ø: ${d} mm`, param2: `Tish soni: ${t}` });
    batches.push({ id: i + 1, pid: i + 1, qty: [14, 27, 26, 16, 11, 2, 23, 7, 21, 18, 3, 9][i], sold: 0, costUsd: 10 + d / 10 + t / 10, status: 'active', date: '2026-10-0' + (1 + (i % 8)) });
  });
  const tools = [['AGH 1100-125 burchakli silliqlash mashinasi', 'Burchakli silliqlash', 'ALTECO', 55], ['TM 500 kromka frezeri', 'Yogʻochga ishlov berish', 'ALTECO', 70], ['Freza toʻplami 12 dona, 8 mm', 'Frezalar', 'POWERFUL', 22], ['Spiral freza Ø6 × 22 mm', 'Frezalar', 'POWERFUL', 6]];
  tools.forEach(([n, c, b, cost], j) => { const id = 100 + j; products.push({ id, name: n, sku: 'T' + id, brand: b, cat: c, markupPct: 30 }); batches.push({ id: 100 + j, pid: id, qty: 8 + j, sold: 0, costUsd: cost, status: 'active', date: '2026-10-05' }); });
  products.push({ id: 200, name: 'Arxivdagi mahsulot', sku: 'OLD', archived: true }); batches.push({ id: 200, pid: 200, qty: 5, sold: 0, costUsd: 5, status: 'active' });
  products.push({ id: 201, name: 'Tugagan mahsulot', sku: 'ZERO', cat: 'Frezalar' }); batches.push({ id: 201, pid: 201, qty: 3, sold: 3, costUsd: 5, status: 'active' });
  const shop = { settings: { enabled: true, name: 'Powerful Group', slug: 'powerful', about: 'Arra tigʻlari, frezalar va professional asboblar — Rover va formatli stanoklar uchun.', phone: '+998 90 123 45 67',
    address: 'Toshkent, Chilonzor tumani', tg: 'powerful_tools', wa: '+998901234567', currency: 'UZS', delivery: true, feeUzs: 30000, freeMinUzs: 3000000, lat: 41.2856, lng: 69.2044 },
  banners: [], discounts: [{ pid: 7, priceUsd: 40 }], orders: [], reviews: [], seq: 41 };
  return { main: { settings: { usdUzs: 12650, company: 'POWERFUL GROUP' }, products, branchStore: { baza: {} } }, branch: { batches, customers: [], sales: [], shop } };
}

function fakeAdmin(fx) {
  const db = { main: fx.main, rows: { baza: { data: fx.branch, version: 7 } }, casCalls: 0, conflictOnce: false };
  const ok = (data) => Promise.resolve({ data, error: null });
  const missing = () => Promise.resolve({ data: null, error: { code: '42P01', message: 'relation does not exist' } });
  function q(table) {
    const st = { table, single: false };
    const res = () => {
      if (table === 'app_data') return st.single ? ok({ data: db.main, version: 3 }) : ok([{ version: 3 }]);
      if (table === 'app_data_branches') return ok(Object.entries(db.rows).map(([k, r]) => ({ branch_key: k, data: r.data, version: r.version })));
      return missing();
    };
    const c = new Proxy({}, { get(_, p) {
      if (p === 'then') return (a, b) => res().then(a, b);
      if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return res(); };
      return () => c;
    } });
    return c;
  }
  const admin = { db, from: q,
    rpc(name, a) {
      if (name !== 'app_data_save_cas') return Promise.resolve({ data: null, error: { code: '42883', message: 'function does not exist' } });
      for (const b of a.p_branches || []) {
        db.casCalls++;
        const row = db.rows[b.key];
        if (db.conflictOnce) { db.conflictOnce = false; row.version++; return Promise.resolve({ data: null, error: { code: 'P0001', message: `FW_VERSION_CONFLICT|${b.key}|${row.version}` } }); }
        if (row && row.version !== b.base) return Promise.resolve({ data: null, error: { code: 'P0001', message: `FW_VERSION_CONFLICT|${b.key}|${row.version}` } });
        db.rows[b.key] = { data: b.data, version: (row ? row.version : 0) + 1 };
      }
      return ok({});
    } };
  return admin;
}

// Lokal server: sayt fayllari + /.netlify/functions/shop-public (haqiqiy funksiya)
async function startShop(fx = fixture()) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test';
  const sa = require(path.join(ROOT, 'netlify/functions/_lib/supabaseAdmin'));
  const admin = fakeAdmin(fx);
  const orig = sa.getAdminClient;
  sa.getAdminClient = () => admin;
  delete require.cache[require.resolve(path.join(ROOT, 'netlify/functions/shop-public.js'))];
  const fn = require(path.join(ROOT, 'netlify/functions/shop-public.js')).handler;
  const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/.netlify/functions/shop-public') {
        const r = await fn({ httpMethod: req.method, body, headers: {}, queryStringParameters: Object.fromEntries(u.searchParams) }, {});
        res.writeHead(r.statusCode, r.headers || {}); res.end(r.body || ''); return;
      }
      if (u.pathname.startsWith('/.netlify/functions/')) { res.writeHead(204); res.end(); return; }
      const f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/dokon.html' : u.pathname));
      fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { port: srv.address().port, admin, fn, close: () => { srv.close(); sa.getAdminClient = orig; } };
}

module.exports = { fixture, fakeAdmin, startShop };
