// Netlify Function — xodimni o'chiradi (staff qatori + Auth hisobi).
// Himoyalangan: faqat "sotuvchilar.manage" ruxsati bor xodim (yoki admin),
// va faqat O'Z filialidagi xodimni o'chira oladi.
const { getAdminClient, json, methodGuard, parseBody, requireStaffAuth, assertOwnFilial, assertCanManageStaff, serverError } = require('./_lib/supabaseAdmin');

exports.handler = async (event) => {
  const methodErr = methodGuard(event, ['POST']);
  if (methodErr) return methodErr;

  const body = parseBody(event);
  if (!body) return json({ error: "Noto'g'ri so'rov formati" }, 400);

  const { id } = body;
  if (!id) return json({ error: 'id majburiy' }, 400);

  let admin;
  try { admin = getAdminClient(); }
  catch (e) { return serverError(e, 'staff-delete', 'Server sozlanmagan — administratorga murojaat qiling'); }

  const auth = await requireStaffAuth(event, admin, { permission: 'sotuvchilar.manage' });
  if (!auth.ok) return auth.response;

  const filialCheck = await assertOwnFilial(admin, 'staff', id, auth);
  if (!filialCheck.ok) return filialCheck.response;

  if (Number(id) === Number(auth.staff.id)) {
    return json({ error: "O'zingizni o'chira olmaysiz" }, 400);
  }
  // v10 (F1): admin/egasini faqat admin o'chira oladi
  const privCheck = await assertCanManageStaff(admin, id, auth);
  if (!privCheck.ok) return privCheck.response;

  try {
    const { data: staffRow } = await admin.from('staff').select('auth_user_id').eq('id', id).maybeSingle();

    const { error: delErr } = await admin.from('staff').delete().eq('id', id);
    if (delErr) throw delErr;

    if (staffRow?.auth_user_id) {
      await admin.auth.admin.deleteUser(staffRow.auth_user_id).catch(() => {});
    }

    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: "O'chirishda xatolik" }, 500);
  }
};

// v25.2: kuzatuv — so'rovlar cheklovi, xato va sekinlik haqida egasiga xabar (_lib/monitor.js)
exports.handler = require('./_lib/monitor').wrap('staff-delete', exports.handler);
