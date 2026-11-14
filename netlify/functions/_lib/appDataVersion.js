// v24.8 (37-migratsiya): app_data / app_data_branches — OPTIMISTIK QULF («version» ustuni).
// Har yozuvda version +1 (bazadagi trigger). Server o'qigan versiyasi bilan yozadi (app_data_save_cas):
// orada boshqa yozuv bo'lgan bo'lsa — FW_VERSION_CONFLICT → funksiya 409 qaytaradi, brauzer yangi
// holatni olib, o'z o'zgarishini ustiga qo'yib qayta urinadi (foydalanuvchi o'zgarishi yo'qolmaydi).
// Brauzer o'zi bilgan versiyani (baseVersion) yuborsa va u eskirgan bo'lsa — darhol 409.
// 37 qo'llanmagan bazada — avvalgi yo'l (versiyasiz), hech narsa buzilmaydi.
const TTL_MS = 60 * 1000;
let _st = { on: null, at: 0 };

function _isMissingColumn(err) {
  const m = String((err && (err.message || err.details || err.hint)) || '');
  return (err && (err.code === '42703' || err.code === 'PGRST204')) || /column .*version.* does not exist|could not find the 'version' column/i.test(m);
}

// 37 bormi: ustun VA yozish funksiyasi (bo'sh chaqiruv — hech narsa yozmaydi). Funksiya yo'q — avvalgi yo'l.
function _isMissingFn(err) {
  const m = String((err && (err.message || err.details || err.hint)) || '');
  return (err && (err.code === '42883' || err.code === 'PGRST202')) || /app_data_save_cas|function .* does not exist|could not find the function/i.test(m);
}
async function versionOn(admin) {
  if (_st.on !== null && Date.now() - _st.at < TTL_MS) return _st.on;
  let on = false;
  if (admin && typeof admin.rpc === 'function') {
    const { error } = await admin.from('app_data').select('version').limit(1);
    if (error && !_isMissingColumn(error)) throw error;
    if (!error) {
      const r = await admin.rpc('app_data_save_cas', { p_main: null, p_main_base: null, p_branches: [], p_keep_branch_debt: true });
      if (r && r.error && !_isMissingFn(r.error)) throw r.error;
      on = !!r && !r.error;
    }
  }
  _st = { on, at: Date.now() };
  return _st.on;
}
function _resetVersionCache() { _st = { on: null, at: 0 }; }

// FW_VERSION_CONFLICT|<qator>|<joriy versiya> → { row, current }
function parseConflict(err) {
  const m = /FW_VERSION_CONFLICT\|([a-z0-9_]+)\|(-?\d+)/.exec(String((err && (err.message || err.details)) || ''));
  return m ? { row: m[1], current: Number(m[2]) } : null;
}

const asVersion = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);

module.exports = { versionOn, _resetVersionCache, parseConflict, asVersion };
