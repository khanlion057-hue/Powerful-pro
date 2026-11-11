#!/usr/bin/env node
// Vercel uchun: netlify/functions/*.js ro'yxatidan api/_registry.js yaratadi (STATIK require — Vercel paketlovchisi
// barcha funksiyalarni va ularning bog'liqliklarini topishi uchun). Build paytida avtomatik ishga tushadi.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const dir = path.join(ROOT, 'netlify', 'functions');
const names = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort();
const body = '// AVTOMATIK YARATILADI (scripts/gen-vercel-api.js) — qo\'lda o\'zgartirmang.\n'
  + "'use strict';\nmodule.exports = {\n"
  + names.map(n => `  '${n}': () => require('../netlify/functions/${n}.js'),`).join('\n') + '\n};\n';
const out = path.join(ROOT, 'api', '_registry.js');
if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== body) fs.writeFileSync(out, body);
if (require.main === module) console.log(`✅ api/_registry.js — ${names.length} ta funksiya`);
module.exports = { names };
