// P120 — v25.6.10: so'rov botini ulash — bitta tugma (t.me havola), ulangan holat, sozlanmagan holat
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;
const SHOT = process.env.P120_SHOT || '';
async function run() {
  const { browser, page, errors } = await openPage('index.html', { width: 390, height: 844, mobile: true, admin: true });
  try {
    await page.evaluate(() => { window.__mode = 'new'; tgqCall = async (b) => {
      if (b.action === 'status') return { ok: true, set: true, bot: 'PowerfulGroup_sorov_bot', links: 3 };
      if (__mode === 'off') throw new Error('Bot hali sozlanmagan — administratorga ayting');
      return { ok: true, code: '12345678', bot: 'PowerfulGroup_sorov_bot', link: 'https://t.me/PowerfulGroup_sorov_bot?start=12345678', linked: __mode === 'linked', minutes: 15 };
    }; });
    await page.evaluate(() => tgqOpen());
    await page.waitForSelector('#tgq-box a[href^="https://t.me/"]');
    assert.equal(await page.getAttribute('#tgq-box a.bs-btn', 'href'), 'https://t.me/PowerfulGroup_sorov_bot?start=12345678');
    assert.match(await page.textContent('#tgq-box'), /Telegramda ulash[\s\S]*Start/);
    if (SHOT) await page.screenshot({ path: SHOT + '-1.png' });
    await page.evaluate(() => { __mode = 'linked'; tgqOpen(); });
    await page.waitForFunction(() => /Telegram ulangan/.test(document.getElementById('tgq-box')?.textContent || ''));
    if (SHOT) await page.screenshot({ path: SHOT + '-2.png' });
    await page.evaluate(() => { __mode = 'off'; tgqOpen(); });
    await page.waitForSelector('#tgq-token');
    assert.match(await page.textContent('#tgq-box'), /Bot hali sozlanmagan/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
module.exports = { name: 'P120 — Soʻrov botini ulash (bir tugma)', cases: [{ name: 'Telegramda ulash havolasi, ulangan holat, sozlanmagan holat', run }] };
