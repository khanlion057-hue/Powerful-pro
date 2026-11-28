// P116 — v25.6.9: oflayn navbat — boshqa xodim kiritgan savdo joriy xodim nomidan yuborilmaydi; chiqishda ogohlantirish
const assert = require('node:assert/strict');
const { openPage } = require('./p4-responsive.test.js')._helpers;
async function run() {
  const { browser, page, errors } = await openPage('sotuvchi.html', { width: 390, height: 844, mobile: true, loggedIn: true });
  try {
    const r = await page.evaluate(async () => {
      const sent = []; window.authFetch = async (url, o) => { sent.push(JSON.parse(o.body).k); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
      localStorage.setItem('fw_outbox_v1', JSON.stringify([
        { id: 'a', kind: 'x', url: '/u', body: { k: 'begona' }, state: 'pending', who: 's999' },
        { id: 'b', kind: 'x', url: '/u', body: { k: 'meniki' }, state: 'pending', who: 's' + ME.id },
        { id: 'c', kind: 'x', url: '/u', body: { k: 'eski' }, state: 'pending' } ]));
      await fwqFlush();
      const left = fwqPending().map((e) => e.id);
      fwqAdd({ id: 'd', kind: 'x', url: '/u', body: { k: 'yangi' } }); const who = fwqList().find((e) => e.id === 'd').who;
      let asked = ''; window.confirm = (m) => { asked = m; return false; };
      const ok = fwqLogoutOk();
      return { sent, left, who, me: 's' + ME.id, ok, asked };
    });
    assert.deepEqual(r.sent.sort(), ['eski', 'meniki'], 'faqat o\'zi (va egasi noma\'lum eski) yuboriladi');
    assert.deepEqual(r.left, ['a'], 'begona xodimniki navbatda qoladi');
    assert.equal(r.who, r.me); assert.equal(r.ok, false); assert.match(r.asked, /oflayn savdo/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
module.exports = { name: 'P116 — Oflayn navbat xodimga bogʻliq', cases: [{ name: 'boshqa xodim savdosi yuborilmaydi; yangi yozuvda xodim; chiqishda ogohlantirish', run }] };
