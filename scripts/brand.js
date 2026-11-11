#!/usr/bin/env node
// KO'CHIRMA (white-label): shu nusxani boshqa firma nomi va logotipi bilan ishga tushirish.
//
//   npm run brand -- --name "Sharq Savdo" --slogan "Sifat va ishonch" --logo ./logo.png
//
// Nima qiladi:
//   1) js/brand.js — firma nomi, shior va logotip yo'li (ilova, kirish oynasi, chek, portallar shu yerdan oladi);
//   2) assets/brand-logo.jpg — logotip (PNG/JPG, ≤ 2 MB) shu nom bilan nusxalanadi;
//   3) manifest.json — ilova nomi (telefonga o'rnatilganda);
//   4) eski brend qoldiqlarini tekshiradi (kod ichida firma nomi qattiq yozilmagan bo'lishi kerak).
// Ma'lumotlar (mahsulot, mijoz, kassa) — har bir nusxaning O'Z Supabase bazasida; ko'chirmaga hech narsa o'tmaydi.
// Ilova ichida ham o'zgartirish mumkin: Sozlamalar → «Brend va profil» (u ustun turadi).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function arg(k) { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; }
function fail(m) { console.error('⛔ ' + m); process.exit(1); }

const name = String(arg('name') || '').replace(/\s+/g, ' ').trim();
const slogan = String(arg('slogan') || '').replace(/\s+/g, ' ').trim();
const logo = arg('logo');
if (!name) fail('Firma nomi kerak: --name "Firma nomi"');
if (name.length > 60 || /[<>"'`\\]/.test(name)) fail("Nom 60 belgidan oshmasin va < > \" ' ` \\ belgilarisiz bo'lsin");
if (slogan.length > 80 || /[<>"'`\\]/.test(slogan)) fail("Shior 80 belgidan oshmasin va maxsus belgilarsiz bo'lsin");

if (logo) {
  const src = path.resolve(logo);
  if (!fs.existsSync(src)) fail('Logotip fayli topilmadi: ' + src);
  const buf = fs.readFileSync(src);
  if (buf.length > 2 * 1024 * 1024) fail('Logotip 2 MB dan katta');
  const png = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = buf[0] === 0xff && buf[1] === 0xd8;
  if (!png && !jpg) fail('Logotip PNG yoki JPG boʻlishi kerak');
  fs.writeFileSync(path.join(ROOT, 'assets', 'brand-logo.jpg'), buf);   // nom bir xil — barcha sahifalar shu faylni oladi
  console.log('✅ assets/brand-logo.jpg yangilandi');
}

fs.writeFileSync(path.join(ROOT, 'js', 'brand.js'), `// BREND (white-label) — shu nusxa qaysi firma nomi bilan ishlashi.
// Loyihani boshqa firma uchun ko'chirganda FAQAT shu faylni va assets/brand-logo.jpg ni almashtiring
// (\`npm run brand -- --name "..." --logo ./logo.png\` yoki ilovada: Sozlamalar → «Brend va profil»). Ilovadagi sozlama ustun turadi.
window.FW_BRAND = {
  name: ${JSON.stringify(name)},
  slogan: ${JSON.stringify(slogan)},
  logo: 'assets/brand-logo.jpg'
};
`);
console.log('✅ js/brand.js yangilandi');

const mp = path.join(ROOT, 'manifest.json');
const man = JSON.parse(fs.readFileSync(mp, 'utf8'));
man.name = name; man.short_name = name.slice(0, 12);
fs.writeFileSync(mp, JSON.stringify(man, null, 2) + '\n');
console.log('✅ manifest.json yangilandi');

// Kodda firma nomi qattiq yozilmaganini tekshirish (izohlar hisobga olinmaydi)
const files = ['index.html', 'sotuvchi.html', 'diller.html', ...fs.readdirSync(path.join(ROOT, 'js')).map(f => 'js/' + f)];
const old = (arg('old') || '').trim();
if (old) {
  const hits = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    lines.forEach((l, i) => { if (l.includes(old) && !/^\s*(\/\/|<!--|\*)/.test(l)) hits.push(`${f}:${i + 1}`); });
  }
  if (hits.length) { console.log(`⚠️ «${old}» hali quyidagi joylarda bor:\n  ` + hits.join('\n  ')); process.exitCode = 2; }
  else console.log(`✅ Kodda «${old}» qolmadi`);
}
console.log('\nKeyingi qadam: yangi Supabase loyihasi (supabase/schema.sql), `npm run setup`, Netlify muhit oʻzgaruvchilari — docs/KOCHIRMA.md');
