// Testlar uchun Chromium yo'li: PLAYWRIGHT_CHROMIUM_PATH → oldindan o'rnatilgan /opt/pw-browsers/chromium (agar bor bo'lsa) →
// undefined (Playwright'ning o'z Chromium'i — CI'da `npx playwright install chromium` qo'yadi). load-app.js bilan bir xil qoida.
'use strict';
const fs = require('fs');
const PRE = '/opt/pw-browsers/chromium';
module.exports = { CHROMIUM_PATH: process.env.PLAYWRIGHT_CHROMIUM_PATH || (fs.existsSync(PRE) ? PRE : undefined) };
