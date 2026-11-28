// P145 — v25.9 (yagona bot, 1-bosqich): 59-migratsiya — tg_inbox (bot qabul qilgan xabarlar qutisi).
// HAQIQIY PostgreSQL (PGlite): schema.sql + 59-fayl ikki marta (takror xavfsiz), tekshiruv SELECT'i — hammasi true.
//  • Shaxsiy chatda faqat «/start <kod>»; boshqa matn — rad (maxfiylik). Guruh/kanalda matn yo'q.
//  • (bot_id, update_id) noyob — Telegram qayta yuborsa ikkinchi yozuv yo'q.
//  • Brauzer (anon/authenticated) jadvalni ko'rmaydi; ops_cleanup 48 soatdan eskini o'chiradi, 58-qatorni saqlaydi.
//  • Fayl — faqat ASCII; 48/58 qo'llanmagan bazada — aniq xato.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;

const ROOT = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const MIG59 = fs.readFileSync(path.join(ROOT, 'supabase-migration-59-bot-inbox.sql'), 'utf8');
const VERIFY = fs.readFileSync(path.join(ROOT, 'supabase-migration-59-verify.sql'), 'utf8');

async function db() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await pg.exec(PRELUDE);
  return pg;
}
const rows = async (pg, sql, p) => (await pg.query(sql, p)).rows;
const ins = (pg, o) => pg.query(`insert into tg_inbox (bot_id, update_id, kind, chat_id, chat_type, text, chat_title, at)
  values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()))`, [o.bot || 1, o.u, o.kind || 'message', o.chat || 10, o.type || 'private', o.text || null, o.title || null, o.at || null]);

module.exports = {
  name: 'P145 — 59-migratsiya: tg_inbox (yagona bot xabarlar qutisi)',
  cases: [
    { name: 'fayl ASCII; schema.sql + 59 ikki marta; tekshiruv SELECT — hammasi true', async run() {
      for (const [n, s] of [['59', MIG59], ['59-verify', VERIFY]]) assert.ok([...s].every((ch) => ch.charCodeAt(0) < 128), n + ': faqat ASCII');
      assert.ok(SCHEMA.includes('-- 59-MIGRATSIYA'), 'schema.sql da 59 bo\'limi bor');
      const pg = await db();
      await pg.exec(SCHEMA); await pg.exec(MIG59); await pg.exec(MIG59);
      const [v] = await rows(pg, VERIFY);
      assert.equal(v.natija, '59: tekshiruv');
      for (const k of Object.keys(v).filter((x) => x !== 'natija')) assert.equal(v[k], true, 'tekshiruv: ' + k);
      const out = await pg.exec(MIG59); const last = out[out.length - 1].rows[0];
      assert.equal(last.natija, '59: tayyor'); assert.ok(Object.entries(last).every(([k, x]) => k === 'natija' || x === true), 'migratsiya oxiridagi SELECT ham true');
      await pg.close();
    } },
    { name: 'maxfiylik: shaxsiy chatda faqat /start kodi; takror update_id; brauzer ko\'rmaydi; 48 soatlik tozalash', async run() {
      const pg = await db(); await pg.exec(SCHEMA);
      await ins(pg, { u: 1, text: '/start cusAbCdEf123456' });
      await ins(pg, { u: 2, text: '/start pw0123abcd' });
      await assert.rejects(ins(pg, { u: 3, text: 'salom, mening telefonim 901234567' }), /tg_inbox_text_chk/, 'oddiy shaxsiy matn saqlanmaydi');
      await assert.rejects(ins(pg, { u: 4, type: 'group', chat: -5, text: '/start x1' }), /tg_inbox_text_chk/, 'guruh matni saqlanmaydi');
      await ins(pg, { u: 5, type: 'supergroup', chat: -100, title: 'Filial guruhi', kind: 'my_chat_member' });
      await assert.rejects(ins(pg, { u: 1, text: '/start cusAbCdEf123456' }), /tg_inbox_pkey|duplicate/, 'bir update ikki marta yozilmaydi');
      await ins(pg, { bot: 2, u: 1, text: '/start inv12345678' });   // boshqa bot — alohida
      await assert.rejects(ins(pg, { u: 6, kind: 'callback' }), /tg_inbox_kind_chk/);
      const [g] = await rows(pg, `select has_table_privilege('anon','public.tg_inbox','select') a, has_table_privilege('authenticated','public.tg_inbox','insert') b,
        has_table_privilege('service_role','public.tg_inbox','insert') s`);
      assert.deepEqual(g, { a: false, b: false, s: true });
      await ins(pg, { u: 7, text: '/start eski1', at: new Date(Date.now() - 49 * 3600e3).toISOString() });
      await pg.query(`insert into ai_ad_posts (branch_id, product_id, status, created_at) values ('baza', 1, 'sent', now() - interval '91 days'), ('baza', 2, 'sent', now())`);
      await pg.query('select ops_cleanup()');
      assert.deepEqual((await rows(pg, 'select bot_id, update_id from tg_inbox order by 1, 2')).map((r) => r.bot_id + ':' + r.update_id), ['1:1', '1:2', '1:5', '2:1'], '48 soatdan eskisi o\'chdi');
      assert.equal((await rows(pg, 'select count(*)::int n from ai_ad_posts'))[0].n, 1, '58-tozalash ham ishlaydi');
      await pg.close();
    } },
    { name: '48 yoki 58 qo\'llanmagan bazada — aniq xato', async run() {
      const pg = await db();
      await pg.exec(`create table public.ops_events (id int)`);
      await assert.rejects(pg.exec(MIG59), /avval 58-migratsiya/);
      await pg.close();
      const pg2 = await db();
      await assert.rejects(pg2.exec(MIG59), /avval 48-migratsiya/);
      await pg2.close();
    } },
  ],
};
