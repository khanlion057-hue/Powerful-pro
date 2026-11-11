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
const SITE = ['index.html', 'sotuvchi.html', 'diller.html', '404.html', 'manifest.json', 'sw.js', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'assets', 'css', 'js'];

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dst, f)); }
  else fs.copyFileSync(src, dst);
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
module.exports = { build, SITE };
