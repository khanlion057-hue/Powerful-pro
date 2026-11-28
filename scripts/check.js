#!/usr/bin/env node
// Tezkor statik tekshiruv (brauzersiz, ~5 soniya): JS sintaksis, funksiyalardagi require
// yo'llari (katta-kichik harf — Linux serverda muhim!), HTML havolalari va SRI, JSON,
// har bir Netlify funksiyasi yuklanishi, js/config.js'da maxfiy kalit yo'qligi.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { checkAnonKey, checkUrl, parseConfigJs } = require('./lib/config');
const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', 'dist', '.netlify', '.git']);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => SKIP.has(e.name) || e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(ROOT), out = []; let bad = 0;
const fail = m => { bad++; out.push('❌ ' + m); };

const js = files.filter(f => f.endsWith('.js'));
let syn = 0; for (const f of js) { try { cp.execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); syn++; } catch (e) { fail('Sintaksis: ' + path.relative(ROOT, f)); } }
out.push(`JS sintaksis: ${syn}/${js.length}`);

let req = 0;
for (const f of js.filter(f => f.includes(path.join('netlify', 'functions')))) {
  const s = fs.readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  for (const m of s.matchAll(/require\(['"](\.{1,2}\/[^'"]+)['"]\)/g)) {
    req++; let p = path.resolve(path.dirname(f), m[1]); if (!p.endsWith('.js')) p += '.js';
    if (!fs.existsSync(path.dirname(p)) || !fs.readdirSync(path.dirname(p)).includes(path.basename(p))) fail(`require topilmadi (harf farqi?): ${path.relative(ROOT, f)} → ${m[1]}`);
  }
}
out.push(`Funksiyalardagi lokal require: ${req}`);

for (const h of ['index.html', 'sotuvchi.html', 'diller.html']) {
  const s = fs.readFileSync(path.join(ROOT, h), 'utf8');
  for (const m of s.matchAll(/(?:src|href)="([^"#:]+?)"/g)) { const u = m[1].split('?')[0]; if (u && !/^(data|https?|mailto|tel)/.test(u) && !fs.existsSync(path.join(ROOT, u))) fail(`${h}: havola yo'q → ${u}`); }
  for (const m of s.matchAll(/<script[^>]+src="https:[^"]+"[^>]*>/g)) if (!/integrity="sha384-/.test(m[0])) fail(`${h}: CDN skriptida SRI yo'q`);
  if (!s.includes('src="js/config.js"')) fail(`${h}: js/config.js ulanmagan`);
}
for (const f of files.filter(f => f.endsWith('.json'))) { try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { fail('JSON xato: ' + path.relative(ROOT, f)); } }

const cfg = parseConfigJs(fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8'));
const ce = checkUrl(cfg.url) || checkAnonKey(cfg.anonKey); if (ce) fail('js/config.js: ' + ce); else out.push('js/config.js: faqat ochiq (anon) kalit');

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'check-dummy';
const fns = fs.readdirSync(path.join(ROOT, 'netlify', 'functions')).filter(f => f.endsWith('.js'));
let fnOk = 0; for (const f of fns) { try { const m = require(path.join(ROOT, 'netlify', 'functions', f)); if (typeof m.handler !== 'function') throw new Error("handler yo'q"); fnOk++; } catch (e) { fail(`Funksiya yuklanmadi: ${f} — ${e.message.split('\n')[0]}`); } }
out.push(`Netlify funksiyalari: ${fnOk}/${fns.length}`);

console.log(out.join('\n'));
console.log(bad ? `\n❌ ${bad} ta muammo` : "\n✅ Statik tekshiruv: muammo yo'q");
process.exit(bad ? 1 : 0);
