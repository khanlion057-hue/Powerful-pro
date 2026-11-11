#!/usr/bin/env node
// Minimal test-runner — Powerful PRO uchun TEST ARCHITECTURE'ning 1-qadami
// (0-bosqich auditida "AUTOMATED TESTS = 0" deb topilgan bo'shliqni yopadi).
//
// Ataylab og'ir freymvork (Jest/Mocha) ishlatilmadi — loyihaning o'zi
// vanilla-stack falsafasiga sodiq: har bir *.test.js fayl { name, cases:[{name,run}] }
// eksport qiladi, `run` — Promise qaytaruvchi funksiya (ichida real
// Playwright orqali haqiqiy js/main.js'ni ishga tushiradi va assert qiladi).
//
// Ishga tushirish:  npm test   (yoki:  node tests/run.js)
const fs = require('fs');
const path = require('path');

async function main() {
  const testFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
  let totalPass = 0, totalFail = 0;
  const failures = [];

  for (const file of testFiles) {
    const mod = require(path.join(__dirname, file));
    console.log(`\n▶ ${mod.name}`);
    for (const c of mod.cases) {
      process.stdout.write(`  • ${c.name} ... `);
      try {
        await c.run();
        console.log('✅ PASS');
        totalPass++;
      } catch (e) {
        console.log('❌ FAIL');
        console.log(`    ${e.message}`);
        totalFail++;
        failures.push({ suite: mod.name, case: c.name, error: e.message });
      }
    }
  }

  console.log(`\n──────────────────────────────`);
  console.log(`JAMI: ${totalPass + totalFail} ta test — ✅ ${totalPass} PASS, ❌ ${totalFail} FAIL`);
  if (failures.length) {
    console.log('\nMuvaffaqiyatsiz testlar:');
    failures.forEach(f => console.log(`  - [${f.suite}] ${f.case}: ${f.error}`));
  }
  // Test harness ichida ochilgan lokal statik server Node jarayonini
  // abadiy tirik ushlab turadi — shuning uchun natijadan keyin ANIQ
  // chiqamiz (aks holda `npm test` hech qachon tugamaydi).
  process.exit(failures.length ? 1 : 0);
}

main().catch(e => { console.error('Test runner ichki xatosi:', e); process.exit(1); });
