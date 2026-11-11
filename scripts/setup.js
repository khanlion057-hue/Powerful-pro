#!/usr/bin/env node
// Foydalanish:  SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=eyJ... npm run setup
// js/config.js faylini yozadi (brauzer qaysi Supabase loyihaga ulanishini belgilaydi).
'use strict';
const fs = require('fs');
const path = require('path');
const { buildConfigJs } = require('./lib/config');

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
try {
  const text = buildConfigJs({ url, anonKey });
  const out = path.join(__dirname, '..', 'js', 'config.js');
  fs.writeFileSync(out, text);
  console.log(`✅ js/config.js yozildi → ${String(url).trim()}`);
  console.log('Keyingi qadam: npm run create-admin (birinchi administrator)');
} catch (e) {
  console.error('❌ ' + e.message);
  console.error("Misol: SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=<anon public kalit> npm run setup");
  process.exit(1);
}
