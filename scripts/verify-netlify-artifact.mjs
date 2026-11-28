#!/usr/bin/env node
// Powerful PRO — Netlify deploy artefaktini LOKAL tekshirish (v24.5; v23.10.1/2 dan ko'chirilgan). Deploy QILMAYDI, tarmoqqa chiqmaydi.
// Netlify'ning o'z vositalari bilan: @netlify/config (netlify.toml → build, functions, headers, schedule) va
// @netlify/zip-it-and-ship-it (funksiyalarni esbuild bilan Netlify kabi yig'adi). Natija: har funksiya zip'i, handler,
// env nomlari, frontend chaqiradigan endpointlar mavjudligi, xavfsizlik sarlavhalari.
//   NL_TOOLS=/yo'l/node_modules node scripts/verify-netlify-artifact.mjs
// (NL_TOOLS — `npm i @netlify/zip-it-and-ship-it @netlify/config` o'rnatilgan papkaning node_modules'i; loyiha
//  bog'liqligiga qo'shilmagan — faqat tekshiruv vositasi)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = process.env.NL_TOOLS;
if (!TOOLS) { console.error('NL_TOOLS kerak'); process.exit(2); }
const req = createRequire(path.join(TOOLS, 'x.js'));
const { zipFunctions } = await import(req.resolve('@netlify/zip-it-and-ship-it'));
const { resolveConfig } = await import(req.resolve('@netlify/config'));
const FW_EXPECTED_FUNCS = 62; // v24.5 (61 + dealer-ops; scripts/deploy-netlify.sh EXPECTED bilan bir xil). Yangi funksiya — ikkalasini yangilang
const EXPECTED = fs.readdirSync(path.join(ROOT, 'netlify', 'functions')).filter(f => f.endsWith('.js')).length;
const results = []; let failed = 0;
const ok = (n, d) => { results.push(`✅ ${n} — ${d}`); console.log(`✅ ${n} — ${d}`); };
const bad = (n, d) => { failed++; results.push(`❌ ${n} — ${d}`); console.log(`❌ ${n} — ${d}`); };

// 1) netlify.toml — Netlify parseri
const cfg = await resolveConfig({ repositoryRoot: ROOT, cwd: ROOT, offline: true, context: 'production' });
const c = cfg.config;
(c.build.publish.endsWith('/dist') && c.build.command === 'node scripts/build.js' && c.build.functions.endsWith('netlify/functions'))
  ? ok('netlify.toml (build)', `command="${c.build.command}", publish=dist, functions=netlify/functions, node_bundler=${c.functions['*']?.node_bundler}`)
  : bad('netlify.toml (build)', JSON.stringify(c.build));
const H = (c.headers || []).find(h => h.for === '/*');
const NEED = ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security', 'Content-Security-Policy'];
const missing = NEED.filter(k => !H || !(k in H.values));
missing.length ? bad('Xavfsizlik sarlavhalari', `yo'q: ${missing.join(', ')}`) : ok('Xavfsizlik sarlavhalari', NEED.map(k => `${k}`).join(', '));
const sched = c.functions['telegram-daily-report']?.schedule, sched2 = c.functions['backup-daily']?.schedule;
(sched === '5 * * * *' && sched2 === '35 * * * *') ? ok('Jadval funksiyalari', `telegram-daily-report — "${sched}", backup-daily — "${sched2}"`) : bad('Jadval funksiyalari', `${sched} / ${sched2}`);
// v24.5: Node 22 (supabase-js 2.117 Node 20 da createClient'da yiqiladi — login 500)
const env = c.build.environment || {};
(String(env.NODE_VERSION) === '22' && env.AWS_LAMBDA_JS_RUNTIME === 'nodejs22.x') ? ok('Node versiyasi', 'NODE_VERSION=22, AWS_LAMBDA_JS_RUNTIME=nodejs22.x') : bad('Node versiyasi', `NODE_VERSION=${env.NODE_VERSION}, runtime=${env.AWS_LAMBDA_JS_RUNTIME}`);

// 2) Build (dist)
execFileSync('node', ['scripts/build.js'], { cwd: ROOT, stdio: 'pipe' });
const dist = fs.readdirSync(path.join(ROOT, 'dist'), { recursive: true }).filter(f => fs.statSync(path.join(ROOT, 'dist', f)).isFile());
const leaks = dist.filter(f => /\.(sql|md|log)$|^tests|^scripts|^supabase|netlify\/|\.env/.test(f));
leaks.length ? bad('dist/', `ichki fayl: ${leaks.join(', ')}`) : ok('dist/ (sayt)', `${dist.length} fayl; SQL/test/hujjat/funksiya kodi yo'q`);
['index.html', '404.html', 'sotuvchi.html', 'diller.html'].every(f => dist.includes(f)) ? ok('publish ildizi', "dist/index.html, 404.html, sotuvchi.html, diller.html — ILDIZDA (papka ichida emas)") : bad('publish ildizi', "dist/ ildizida index.html yo'q");

// 3) Funksiyalar — Netlify bundler
const src = path.join(ROOT, 'netlify', 'functions');
const expected = fs.readdirSync(src).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, '')).sort();
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-zisi-'));
const zipped = await zipFunctions([src], out, { basePath: ROOT, config: { '*': { nodeBundler: 'esbuild' } }, repositoryRoot: ROOT });
const names = zipped.map(z => z.name).sort();
const diff = expected.filter(n => !names.includes(n)).concat(names.filter(n => !expected.includes(n)));
(names.length === EXPECTED && EXPECTED === FW_EXPECTED_FUNCS && !diff.length) ? ok('Funksiyalar (Netlify bundler)', `${names.length} ta zip, kutilgan ro'yxat bilan aynan bir xil`) : bad('Funksiyalar', `${names.length} ta (kutilgan ${FW_EXPECTED_FUNCS}); farq: ${diff.join(', ')}`);
// har bir zip — ichidagi kirish fayli handler eksport qiladimi (bundle'ni ochib yuklaymiz; tarmoq/kalit kerak emas)
const unz = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-unz-'));
let handlers = 0; const noHandler = [];
for (const z of zipped) {
  const d = path.join(unz, z.name); fs.mkdirSync(d);
  execFileSync('unzip', ['-q', z.path, '-d', d]);
  const entry = fs.readdirSync(d).find(f => f === `${z.name}.js` || f === `${z.name}.mjs`) || fs.readdirSync(d).find(f => f.startsWith('___netlify-entry-point') || f.endsWith('.js'));
  try { const m = createRequire(path.join(d, 'x.js'))(path.join(d, entry)); if (typeof (m.handler || (m.default && m.default.handler)) === 'function') handlers++; else noHandler.push(z.name); }
  catch (e) { noHandler.push(`${z.name} (${e.message.slice(0, 60)})`); }
}
noHandler.length ? bad('Kirish nuqtalari', `handler yo'q: ${noHandler.join(', ')}`) : ok('Kirish nuqtalari', `${handlers}/${names.length} bundle yuklanadi va exports.handler — funksiya`);

// 4) Env nomlari (kod o'qiydiganlar)
const envNames = new Set();
for (const f of fs.readdirSync(src, { recursive: true }).filter(f => f.endsWith('.js'))) {
  for (const m of fs.readFileSync(path.join(src, f), 'utf8').matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)|requireEnv\('([A-Z_]+)'\)/g)) envNames.add(m[1] || m[2]);
}
ok('Env nomlari', [...envNames].sort().join(', ') + " (qiymatlar o'qilmadi)");

// 5) Frontend → funksiya endpointlari
const fe = ['js', '.'].flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => /\.(js|html)$/.test(f)).map(f => fs.readFileSync(path.join(ROOT, d, f), 'utf8'))).join('\n');
const called = new Set([...fe.matchAll(/\.netlify\/functions\/([a-z0-9-]+)|fwLedgerCall\(['"]([a-z0-9-]+)/g)].map(m => m[1] || m[2]));
// v24.5: umumiy `'/.netlify/functions/' + fn` — fwLedgerCall('<nom>') orqali yuqorida ushlanadi (v23 dagi dealer-ops v24.5 da yo'q)
const unknown = [...called].filter(n => !names.includes(n));
unknown.length ? bad('Frontend → funksiya', `mavjud bo'lmagan endpoint: ${unknown.join(', ')}`) : ok('Frontend → funksiya', `${called.size} ta chaqiriladigan endpointning hammasi artefaktda bor`);
// 6) Netlify xizmat qilishini LOKAL emulyatsiya (v23.10.2 — "/" 404 ildiz sababi tekshiruvi): publish=dist, netlify.toml
//    redirect'lari (Netlify qoidasi: fayl bo'lsa — fayl, bo'lmasa redirect; topilmasa dist/404.html + 404), sarlavhalar,
//    /.netlify/functions/<nom> — yig'ilgan bundle handler'i. Haqiqiy Netlify emas — mantiqiy tekshiruv.
const http = await import('node:http');
const DIST = path.join(ROOT, 'dist');
const redirects = (c.redirects || []).map(r => ({ from: r.from, to: r.to, status: r.status || 301, force: !!r.force }));
const catchAll = redirects.filter(r => /\*/.test(r.from) && /index\.html/.test(r.to));
catchAll.length ? bad('Redirect qoidalari', `SPA catch-all bor (${catchAll.map(r => r.from).join(', ')}) — hash routing'da kerak emas va xatolarni yashiradi`)
  : ok('Redirect qoidalari', redirects.map(r => `${r.from}→${r.to} ${r.status}`).join(', ') + "; catch-all yo'q (hash routing)");
const fnDir = (n) => path.join(unz, n);
const handlerOf = (n) => { const d = fnDir(n); const e = fs.readdirSync(d).find(f => f === `${n}.js` || f === `${n}.mjs`) || fs.readdirSync(d).find(f => f.endsWith('.js')); const m = createRequire(path.join(d, 'x.js'))(path.join(d, e)); return m.handler || (m.default && m.default.handler); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const fileFor = (p) => { const f = path.join(DIST, decodeURIComponent(p)); if (!f.startsWith(DIST)) return null; if (fs.existsSync(f) && fs.statSync(f).isFile()) return f; const ix = path.join(f, 'index.html'); return fs.existsSync(ix) ? ix : null; };
const srv = http.createServer(async (q, s) => {
  const url = new URL(q.url, 'http://x'); let p = url.pathname;
  const send = (code, body, type, extra = {}) => { s.writeHead(code, { 'Content-Type': type, ...(H ? H.values : {}), ...extra }); s.end(body); };
  const fm = p.match(/^\/\.netlify\/functions\/([a-z0-9-]+)$/);
  if (fm) {
    if (!names.includes(fm[1])) return send(404, 'Function not found', 'text/plain');
    try { const r = await handlerOf(fm[1])({ httpMethod: q.method, path: p, headers: q.headers, queryStringParameters: Object.fromEntries(url.searchParams), body: null });
      return send(r.statusCode || 200, r.body || '', (r.headers && (r.headers['Content-Type'] || r.headers['content-type'])) || 'application/json'); }
    catch (e) { return send(500, String(e.message), 'text/plain'); }
  }
  let f = fileFor(p);
  if (!f) for (const r of redirects) { if (r.from === p) { if (r.status >= 300 && r.status < 400) return send(r.status, '', 'text/plain', { Location: r.to }); f = fileFor(r.to); break; } }
  if (!f) return send(404, fs.readFileSync(path.join(DIST, '404.html')), TYPES['.html']);
  send(200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream');
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
// global fetch emas — to'g'ridan-to'g'ri http.get (fetch boshqa kod tomonidan almashtirilgan bo'lishi mumkin; v23.10.2 P36 tuzatishi)
const get = (u) => new Promise((res, rej) => http.get(base + u, (r) => { let b = ''; r.setEncoding('utf8'); r.on('data', (x) => { b += x; }); r.on('end', () => res({ code: r.statusCode, type: r.headers['content-type'] || '', body: b, h: { get: (k) => r.headers[k.toLowerCase()] } })); }).on('error', rej));
try {
  const root = await get('/');
  (root.code === 200 && /<title[ >]/i.test(root.body) && root.body.includes('js/main.js')) ? ok('"/" (bosh sahifa)', `HTTP 200, index.html (${root.body.length} bayt)`) : bad('"/"', `HTTP ${root.code}`);
  const miss = NEED.filter(k => !root.h.get(k));
  miss.length ? bad('"/" sarlavhalari', `yo'q: ${miss.join(', ')}`) : ok('"/" sarlavhalari', '6/6 javobda bor');
  const assets = new Set();
  for (const pg of ['index.html', 'sotuvchi.html', 'diller.html', '404.html']) for (const m of fs.readFileSync(path.join(DIST, pg), 'utf8').matchAll(/(?:src|href)="([^"#:?]+)[^"]*"/g)) if (!/^(data|https?|mailto|tel)/.test(m[1])) assets.add('/' + m[1].replace(/^\.?\//, ''));
  const badA = [];
  for (const a of assets) { const r = await get(a); if (r.code !== 200 || (a.endsWith('.js') && !/javascript/.test(r.type)) || (a.endsWith('.css') && !/css/.test(r.type))) badA.push(`${a} ${r.code}`); }
  badA.length ? bad('JS/CSS/rasm assetlari', badA.join(', ')) : ok('JS/CSS/rasm assetlari', `${assets.size} ta lokal havola — hammasi 200, to'g'ri turi bilan`);
  const pages = [['/sotuvchi.html', 'sotuvchi'], ['/sotuvchi', 'sotuvchi'], ['/diller.html', 'diller'], ['/diller', 'diller'], ['/index.html', 'main.js']];
  const badP = []; for (const [u, mark] of pages) { const r = await get(u); if (r.code !== 200 || !r.body.includes(mark)) badP.push(`${u} ${r.code}`); }
  badP.length ? bad('Sahifalar', badP.join(', ')) : ok('Sahifalar', pages.map(x => x[0]).join(', ') + ' — 200');
  const nf = await get('/yoq-sahifa-xyz');
  (nf.code === 404 && nf.body.includes('Sahifa topilmadi')) ? ok('Yo\'q manzil', '404 + dist/404.html (bosh sahifaga havola)') : bad('Yo\'q manzil', `HTTP ${nf.code}`);
  const hl = await get('/.netlify/functions/health');
  let hj = null; try { hj = JSON.parse(hl.body); } catch {}
  (hj && typeof hj.ok === 'boolean' && hj.checks && [200, 503].includes(hl.code)) ? ok('/.netlify/functions/health', `HTTP ${hl.code} JSON (env yo'q — kutilgan 503; marshrut va handler ishlaydi)`) : bad('/.netlify/functions/health', `HTTP ${hl.code} ${hl.body.slice(0, 80)}`);
  const badF = []; for (const n of names) { const r = await get(`/.netlify/functions/${n}`); if (r.code === 404 || r.code >= 500 && !/./.test(r.body)) badF.push(`${n} ${r.code}`); }
  badF.length ? bad(`${EXPECTED} funksiya HTTP marshruti`, badF.join(', ')) : ok(`${EXPECTED} funksiya HTTP marshruti`, `${names.length}/${EXPECTED} javob beradi (404 yo'q)`);
  const nofn = await get('/.netlify/functions/yoq-funksiya');
  (nofn.code === 404 && !/<html/i.test(nofn.body)) ? ok("Yo'q funksiya", "404 (index.html emas)") : bad("Yo'q funksiya", `HTTP ${nofn.code}`);
} finally { srv.close(); }
fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(unz, { recursive: true, force: true });
console.log(`\nJAMI: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
