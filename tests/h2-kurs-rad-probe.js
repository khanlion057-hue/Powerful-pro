// H2 dalili: app-data-save — rolsiz va rolli xodim kurs (usdUzs) + yopiq sozlama yuborsa, HAQIQIY PostgreSQL'da (PGlite)
// nima yoziladi va javobdagi serverValues bazadagi qiymatga mosmi. Tarmoq yo'q.
const path = require('path'); const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { makeWorld } = require(path.join(ROOT, 'tests', 'helpers', 'f4b-world'));
const { makePgSupabase } = require(path.join(ROOT, 'tests', 'helpers', 'pg-supabase'));
const { loadFunction, unloadFunctions } = require(path.join(ROOT, 'tests', 'helpers', 'mem-supabase'));
(async () => {
  const out = {};
  for (const [who, roles, perms] of [['rolsiz', [], []], ['kassir (savdo.create)', [{ staff_id: 5, role_id: 'r' }], ['savdo.create']], ['sozlamalar.edit', [{ staff_id: 5, role_id: 'r' }], ['sozlamalar.edit']]]) {
    const pg = await makeWorld({ baza: {} });
    await pg.query(`update app_data set data = jsonb_set(data, '{settings}', $1::jsonb) where id='main'`, [JSON.stringify({ usdUzs: 12600, rateDate: '2026-10-13', company: 'A', appPin: 'PIN-1', tgBotToken: '123456789:FAKE_x' })]);
    const client = makePgSupabase(pg, { pgTables: ['app_data', 'app_data_branches', 'cashbox_balances', 'idempotency_keys', 'ledger_ops'],
      memTables: { staff: [{ id: 5, auth_user_id: 'u-s', role: 'sotuvchi', active: true, filial: 'baza', name: 'S', login: 's' }], staff_roles: roles,
        role_permissions: perms.map(k => ({ role_id: 'r', permission_id: k, permissions: { key: k } })), staff_audit_log: [] }, users: { 't-s': { id: 'u-s' } } });
    const h = loadFunction('app-data-save', client);
    const r = await h({ httpMethod: 'POST', headers: { authorization: 'Bearer t-s' }, body: JSON.stringify({ data: { settings: { usdUzs: 99999, rateDate: '2026-10-14', company: 'HACK', appPin: '0000' } } }) }, {});
    unloadFunctions();
    const db = (await pg.query(`select data->'settings' s from app_data where id='main'`)).rows[0].s;
    const b = JSON.parse(r.body);
    out[who] = { status: r.statusCode, ignoredKeys: b.ignoredKeys, javob_settings: b.serverValues && b.serverValues.settings,
      baza: { usdUzs: db.usdUzs, rateDate: db.rateDate, company: db.company, appPinOzgarmadi: db.appPin === 'PIN-1', tokenOzgarmadi: db.tgBotToken === '123456789:FAKE_x' },
      javob_baza_bilan_mos: !!(b.serverValues && b.serverValues.settings) ? (b.serverValues.settings.usdUzs === db.usdUzs && b.serverValues.settings.company === db.company) : 'serverValues yo\'q' };
    await pg.close();
  }
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
