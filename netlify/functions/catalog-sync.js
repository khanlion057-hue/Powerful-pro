// Netlify Function — diller portalida ko'rinadigan "xavfsiz" mahsulot katalogini
// (narx/qoldiq, FIFO tannarx kabi maxfiy tafsilotlarsiz) yozadi.
// Himoyalangan: "mahsulotlar.edit" ruxsati (yoki admin).
// ESLATMA: bu funksiya ATAYLAB barcha filiallar uchun katalogni bir yo'la
// yozadi (dizayn talabi — diller portali barcha filiallar katalogini ko'radi),
// shuning uchun filial-chegarasi bu yerga qo'llanilmaydi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { rows } = body;
  if (!Array.isArray(rows) || !rows.length) return json({ error: 'rows majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'catalog-sync', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'mahsulotlar.edit' });
  if (!auth.ok) return auth.response;

  // v10 (F12): avval klient yuborgan qatorlar O'ZGARISHSIZ yozilardi — istalgan filial
  // va istalgan ustun. Endi: faqat ruxsat etilgan ustunlar, raqamlar tekshiriladi,
  // admin bo'lmagan xodim faqat O'Z filialiga yozadi.
  if (rows.length > 20000) return json({ error: "Juda ko'p qator" }, 400);
  const clean = [];
  for (const r of rows) {
    const o = (r && typeof r === 'object') ? r : {};
    const id = Number(o.id), qty = Number(o.qty ?? 0), pct = Number(o.point_pct ?? 0), price = Number(o.optim_price ?? 0);
    if (!Number.isSafeInteger(id) || id <= 0 || ![qty, pct, price].every(Number.isFinite) || qty < 0 || pct < 0 || pct > 100 || price < 0) {
      return json({ error: `Noto'g'ri qator: id=${o.id}` }, 400);
    }
    const filial = auth.isAdmin ? String(o.filial || auth.filial) : auth.filial;
    const image = typeof o.image === 'string' && /^https:\/\//i.test(o.image) && o.image.length <= 1000 ? o.image : undefined;
    const row = { id, filial, sku: String(o.sku || '').slice(0, 80), name: String(o.name || '').slice(0, 300), qty, point_pct: pct, optim_price: price, updated_at: new Date().toISOString() };
    if (image) row.image = image;
    clean.push(row);
  }

  try {
    const CHUNK = 150;
    for (let i = 0; i < clean.length; i += CHUNK) {
      const slice = clean.slice(i, i + CHUNK);
      const { error } = await admin.from('catalog_products').upsert(slice, { onConflict: 'id,filial' });
      if (error) throw error;
    }
    return json({ ok: true, count: clean.length }, 200);
  } catch (e) {
    return serverError(e, 'catalog-sync', "Sinxronlashda xatolik");
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('catalog-sync', exports.handler);
