#!/usr/bin/env node
// Netlify uchun nashr papkasini (dist/) tayyorlaydi: FAQAT saytning o'zi.
// Testlar, SQL migratsiyalar, ichki hujjatlar, skriptlar internetga chiqmaydi.
// Shuningdek: barcha lokal havolalar mavjudligi va js/config.js'da maxfiy kalit
// yo'qligi tekshiriladi — xato bo'lsa build TO'XTAYDI (sayt chiqmaydi).
'use strict';
const fs = require('fs');
const path = require('path');
const { checkAnonKey, checkUrl, parseConfigJs } = require('./lib/config');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = ['index.html', 'sotuvchi.html', 'diller.html', '404.html', 'manifest.json', 'sw.js', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'assets', 'css', 'js', '.well-known'];

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dst, f)); }
  else fs.copyFileSync(src, dst);
}

// v25.2 (kesh): sahifalar ulagan JS/CSS'ning XESHLI nusxasi dist/h/ ga (masalan h/js.main.3f9a01bc.js) — netlify.toml'da
// /h/* «1 yil, o'zgarmas» keshlanadi: fayl o'zgarsa nomi ham o'zgaradi, eski nusxa qolib ketmaydi. HTML va sw.js shu
// nomlarga yo'naltiriladi. Asl js/ va css/ fayllar ham qoladi (no-cache — boshqa joydan havola bo'lsa ishlayveradi).
// h/ — js/ va css/ bilan bir chuqurlikda: CSS ichidagi «../assets/…» havolalari o'zgarmay ishlaydi.
function hashAssets() {
  const crypto = require('crypto');
  const PAGES = ['index.html', 'sotuvchi.html', 'diller.html'];
  const RE = /((?:src|href)=")((?:js|css)\/[A-Za-z0-9._-]+\.(?:js|css))(")/g;
  const refs = new Set();
  for (const h of PAGES) for (const m of fs.readFileSync(path.join(DIST, h), 'utf8').matchAll(RE)) refs.add(m[2]);
  const hashed = (rel, buf) => {
    const [dir, file] = rel.split('/'), ext = path.extname(file), base = file.slice(0, -ext.length);
    return `h/${dir}.${base}.${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10)}${ext}`;
  };
  const map = {};
  for (const r of refs) map[r] = hashed(r, fs.readFileSync(path.join(DIST, r)));
  // main.js kirish oynasida sotuvchi/diller skriptlarini oldindan yuklaydi (prefetch) — o'sha nomlar ham xeshli bo'lsin
  const contents = {};
  for (const r of refs) {
    let c = fs.readFileSync(path.join(DIST, r), 'utf8');
    if (r.endsWith('.js')) for (const [a, b] of Object.entries(map)) if (a !== r && a.endsWith('.js')) c = c.split(`'${a}'`).join(`'${b}'`);
    contents[r] = c;
    map[r] = hashed(r, Buffer.from(c, 'utf8'));
  }
  fs.mkdirSync(path.join(DIST, 'h'), { recursive: true });
  for (const r of refs) fs.writeFileSync(path.join(DIST, map[r]), contents[r]);
  for (const h of PAGES) {
    const f = path.join(DIST, h);
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(RE, (m0, a, rel, z) => a + (map[rel] || rel) + z));
  }
  const swf = path.join(DIST, 'sw.js');
  let sw = fs.readFileSync(swf, 'utf8');
  for (const [a, b] of Object.entries(map)) sw = sw.split(`'./${a}'`).join(`'./${b}'`);
  // Kesh nomi build bo'yicha — yangi deployda eski xeshli fayllar keshda to'planib qolmaydi (activate eskisini o'chiradi)
  const tag = crypto.createHash('sha256').update(Object.values(map).sort().join('|')).digest('hex').slice(0, 8);
  sw = sw.replace(/const CACHE = '([^']+)';/, (m0, c) => `const CACHE = '${c}-${tag}';`);
  fs.writeFileSync(swf, sw);
  return map;
}

function build() {
  const problems = [];
  const cfg = parseConfigJs(fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8'));
  const e = checkUrl(cfg.url) || checkAnonKey(cfg.anonKey);
  if (e) problems.push('js/config.js: ' + e);
  for (const f of SITE) if (!fs.existsSync(path.join(ROOT, f))) problems.push('Fayl topilmadi: ' + f);
  if (problems.length) return { ok: false, problems };

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  for (const f of SITE) copy(path.join(ROOT, f), path.join(DIST, f));
  hashAssets();

  // HTML ichidagi lokal havolalar dist'da mavjudmi
  for (const h of ['index.html', 'sotuvchi.html', 'diller.html']) {
    const s = fs.readFileSync(path.join(DIST, h), 'utf8');
    for (const m of s.matchAll(/(?:src|href)="([^"#:]+?)"/g)) {
      const u = m[1].split('?')[0];
      if (!u || /^(data|https?|mailto|tel)/.test(u)) continue;
      if (!fs.existsSync(path.join(DIST, u))) problems.push(`${h}: havola topilmadi → ${u}`);
    }
    for (const m of s.matchAll(/<script[^>]+src="https:[^"]+"[^>]*>/g)) if (!/integrity="sha384-/.test(m[0])) problems.push(`${h}: CDN skriptida SRI yo'q`);
  }
  let count = 0; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : count++; } })(DIST);
  return { ok: problems.length === 0, problems, files: count };
}

if (require.main === module) {
  const r = build();
  if (!r.ok) { r.problems.forEach(p => console.error('❌ ' + p)); process.exit(1); }
  console.log(`✅ dist/ tayyor — ${r.files} ta fayl (faqat sayt)`);
}
module.exports = { build, SITE, hashAssets };
