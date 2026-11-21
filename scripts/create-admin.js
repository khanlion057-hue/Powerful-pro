#!/usr/bin/env node
// Foydalanish:
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//   npm run create-admin -- --login admin --name "Azimsher"
// Parol so'raladi (ekranda ko'rinmaydi) yoki ADMIN_PASSWORD muhit o'zgaruvchisidan olinadi.
// service_role kaliti faqat shu buyruq uchun terminalda ishlatiladi — faylga yozilmaydi.
'use strict';
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
const { createAdmin } = require('./lib/create-admin');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }
function askHidden(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

(async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('❌ SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY muhit o\'zgaruvchilari kerak'); process.exit(1); }
  const login = arg('login'), name = arg('name'), filial = arg('filial', 'baza');
  if (!login || !name) { console.error('❌ Misol: npm run create-admin -- --login admin --name "Ism Familiya"'); process.exit(1); }
  const password = process.env.ADMIN_PASSWORD || await askHidden('Parol (kamida 8 belgi): ');
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const r = await createAdmin(admin, { login, password, name, filial });
    console.log(`✅ Administrator yaratildi: login "${r.login}", filial "${r.filial}"${r.ownerRole ? ', rol: Korxona egasi' : ''}`);
    console.log('Endi saytga shu login va parol bilan kiring.');
  } catch (e) { console.error('❌ ' + e.message); process.exit(1); }
})();
