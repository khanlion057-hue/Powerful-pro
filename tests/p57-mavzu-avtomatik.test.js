// P57 — v24.6 (egasi talabi): kun/tun mavzusi tizim foniga avtomatik ergashadi.
//  • Eski kun/tun tugmasi qotirgan «light»/«dark» — bir marta «system» ga qaytadi; Qorongʻi/Monoxrom saqlanadi.
//  • Tizim foni o'zgarsa (change) yoki ilovaga qaytilsa — mavzu darhol almashadi.
//  • toggleTheme tizimga mos holatga qaytsa — yana «system» (qotib qolmaydi).
const assert = require('node:assert/strict');
const path = require('path'); const fs = require('fs'); const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'shared.js'), 'utf8');
const THEME = SRC.slice(SRC.indexOf('// ── Kunduzgi/Tungi'), SRC.indexOf('// ── Noyob ID'));
function boot(stored, sysDark) {
  const store = new Map(Object.entries(stored)), attrs = new Map(), listeners = {}, docL = {}, winL = {};
  const mq = { get matches() { return sysDark.v; }, addEventListener: (e, f) => { listeners[e] = f; } };
  const c = {
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) },
    document: { hidden: false, documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.has(k) ? attrs.get(k) : null, style: {} },
      querySelector: () => null, querySelectorAll: () => [], addEventListener: (e, f) => { docL[e] = f; } },
  };
  c.window = { matchMedia: () => mq, addEventListener: (e, f) => { winL[e] = f; } }; c.matchMedia = c.window.matchMedia;
  vm.createContext(c); vm.runInContext(THEME, c);
  return { c, store, dark: () => attrs.get('data-theme') === 'dark', fire: () => listeners.change(), back: () => docL.visibilitychange() };
}
module.exports = {
  name: 'P57 — kun/tun mavzusi tizim foniga avtomatik',
  cases: [
    { name: "qotib qolgan light/dark — bir marta «system»; Qorongʻi saqlanadi; ikkinchi marta tegilmaydi", run() {
      for (const m of ['light', 'dark']) { const b = boot({ koma_theme: m }, { v: true }); assert.equal(b.store.get('koma_theme'), 'system', m); assert.equal(b.dark(), true); }
      const o = boot({ koma_theme: 'oled' }, { v: false }); assert.equal(o.store.get('koma_theme'), 'oled');
      const n = boot({ koma_theme: 'light', koma_theme_v: '2' }, { v: true }); assert.equal(n.store.get('koma_theme'), 'light', 'migratsiyadan keyingi ongli tanlov saqlanadi');
    } },
    { name: 'tizim foni o\'zgarsa yoki ilovaga qaytilsa — mavzu darhol almashadi', run() {
      const sys = { v: false }, b = boot({}, sys);
      assert.equal(b.dark(), false); sys.v = true; b.fire(); assert.equal(b.dark(), true, 'change');
      sys.v = false; b.back(); assert.equal(b.dark(), false, 'ilovaga qaytganda');
    } },
    { name: 'toggleTheme tizim holatiga qaytsa — yana «system»', run() {
      const sys = { v: false }, b = boot({}, sys);
      vm.runInContext('toggleTheme()', b.c); assert.equal(b.store.get('koma_theme'), 'dark');
      vm.runInContext('toggleTheme()', b.c); assert.equal(b.store.get('koma_theme'), 'system');
    } },
  ],
};
