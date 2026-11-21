// P75 — v25 (39-migratsiya): SANA TOSHKENT VAQTI BO'YICHA. Haqiqiy PostgreSQL (PGlite), baza vaqt mintaqasi UTC.
//  • current_date ishlatadigan barcha public funksiyalarga timezone = Asia/Tashkent beriladi; tana o'zgarmaydi.
//  • UTC 20:30 (Toshkentda ertasi kun 01:30) — funksiya ichidagi sana Toshkent bo'yicha (ertasi kun).
//  • Takror ishga tushirish xavfsiz; keyin qo'shilgan funksiya qayta ishga tushirilganda qamrab olinadi.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PRELUDE } = require('./p8-noldan-ornatish.test.js')._helpers;

const ROOT = path.join(__dirname, '..');
const MIG39 = fs.readFileSync(path.join(ROOT, 'supabase-migration-39-toshkent-vaqti.sql'), 'utf8');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');

module.exports = {
  name: 'P75 — 39-migratsiya: sana Toshkent vaqti bo\'yicha (UTC bazada)',
  cases: [
    { name: 'schema.sql dagi barcha current_date funksiyalari — Asia/Tashkent; UTC 20:30 da sana Toshkentniki; takror xavfsiz', async run() {
      const { PGlite } = await import('@electric-sql/pglite');
      const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
      const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
      const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
      try {
        await pg.exec(`set timezone = 'UTC'`);
        await pg.exec(PRELUDE); await pg.exec(SCHEMA);
        const q = async (s, p) => (await pg.query(s, p)).rows;
        const left = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.prokind='f'
          and pg_get_functiondef(p.oid) ilike '%current_date%' and not coalesce(p.proconfig @> array['TimeZone=Asia/Tashkent'], false)`);
        const done = await q(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proconfig @> array['TimeZone=Asia/Tashkent']`);
        assert.deepEqual(left, [], 'Toshkent vaqtisiz current_date funksiyasi qolmadi');
        assert.ok(done[0].n >= 10, 'kamida 10 ta funksiya (savdo, ombor, diller…): ' + done[0].n);
        // Yangi funksiya: migratsiya qayta ishga tushirilsa — qamrab olinadi; sana Toshkent bo'yicha
        await pg.exec(`create or replace function public.t39_kun(p_at timestamptz) returns date language sql as $$ select (p_at at time zone current_setting('TimeZone'))::date where current_date is not null $$`);
        await pg.exec(MIG39); await pg.exec(MIG39);
        const r = await q(`select public.t39_kun('2026-11-08 20:30:00+00') kun, ('2026-11-08 20:30:00+00'::timestamptz at time zone 'UTC')::date utc_kun`);
        assert.equal(String(r[0].kun.toISOString ? r[0].kun.toISOString().slice(0, 10) : r[0].kun), '2026-11-09', 'Toshkentda 01:30 — ertasi kun');
        assert.equal(String(r[0].utc_kun.toISOString ? r[0].utc_kun.toISOString().slice(0, 10) : r[0].utc_kun), '2026-11-08', 'funksiyadan tashqarida — o\'zgarmagan (UTC)');
        assert.doesNotMatch(MIG39, /\b(drop|delete|truncate|grant)\b/i, '39: ma\'lumot o\'chirmaydi, ruxsat bermaydi');
      } finally { await pg.close(); }
    } },
  ],
};
