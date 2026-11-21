#!/usr/bin/env bash
# Powerful PRO — ZAXIRADAN TIKLASH / ROLLBACK (v24.5; v23.10.2 skriptidan): `public` sxemasini
# scripts/backup-before-deploy.sh olgan nusxa holatiga qaytaradi. Faqat favqulodda (27 dan keyin eski kodga qaytish yo'q).
#
#   DATABASE_URL=postgres://.../<baza> FW_RESTORE_TARGET_DB=<baza> FW_ROLLBACK_CONFIRM=HA-TIKLAYMAN \
#     FW_BACKUP_FILE=backups/powerful-pro-v24.5-<vaqt>.dump scripts/rollback-from-backup.sh
#
# • Maqsad baza nomi ATAYLAB ikki marta beriladi: FW_RESTORE_TARGET_DB ulanishdagi current_database() bilan aynan
#   bir xil bo'lmasa — rad. Production'ga o'xshagan maqsad (supabase.co/supabase.com/pooler manzili, "postgres" nomi
#   yoki nomida prod/production) — qo'shimcha FW_RESTORE_PROD_CONFIRM=HA-PRODUCTION-BAZASINI-TIKLAYMAN bo'lmasa rad.
# • Tiklashdan OLDIN: .sha256 tekshiriladi, .manifest (version=24.5, dump_sha256) mos bo'lishi shart.
# • BITTA tranzaksiyada (psql -1): drop schema public cascade → sxema Supabase boshlang'ich holatida (egasi
#   pg_database_owner, PUBLIC usage) → zaxiradagi public (jadvallar, ma'lumot, funksiyalar, RLS, GRANT'lar, sxema ACL)
#   → public event trigger'lar. Istalgan xatoda — HECH NARSA o'zgarmaydi. auth/storage/private'ga tegmaydi.
# • Maqsad bazada `auth` sxemasi bo'lishi shart (Supabase asosi; public jadvallar auth.users'ga bog'langan).
# • Zaxiradan keyingi barcha amallar (savdo, kassa) yo'qoladi — oldin xodimlar ishini to'xtating.
# • So'ng: ma'lumot xulosasi = .summary; sxema barmoq izi = .fingerprint; anon/authenticated/service_role sxemaga kiradi.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -n "${DATABASE_URL:-}" ] || { echo "⛔ DATABASE_URL kerak (standart manzil YO'Q)"; exit 2; }
TARGET="${FW_RESTORE_TARGET_DB:-}"
[ -n "$TARGET" ] || { echo "⛔ FW_RESTORE_TARGET_DB=<maqsad baza nomi> kerak (ataylab)"; exit 2; }
[ "${FW_ROLLBACK_CONFIRM:-}" = "HA-TIKLAYMAN" ] || { echo "⛔ FW_ROLLBACK_CONFIRM=HA-TIKLAYMAN kerak (ataylab)"; exit 2; }
F="${FW_BACKUP_FILE:-}"
[ -n "$F" ] && [ -s "$F" ] && [ -s "$F.sha256" ] && [ -s "$F.summary" ] && [ -s "$F.manifest" ] && [ -s "$F.fingerprint" ] \
  || { echo "⛔ FW_BACKUP_FILE (.dump + .sha256 + .summary + .manifest + .fingerprint) kerak"; exit 2; }
(cd "$(dirname "$F")" && sha256sum -c --status "$(basename "$F").sha256") || { echo "⛔ zaxira sha256 bilan mos emas"; exit 2; }
[ "$(sed -n 's/^dump_sha256=//p' "$F.manifest")" = "$(cut -d' ' -f1 "$F.sha256")" ] || { echo "⛔ manifestdagi sha256 mos emas"; exit 2; }
grep -qx 'version=24.5' "$F.manifest" || { echo "⛔ zaxira manifesti v24.5 uchun emas"; exit 2; }
echo "zaxira: $(basename "$F") — sha256 mos; manifest: $(grep -E '^(created_utc|database|migration_level)=' "$F.manifest" | tr '\n' ' ')"

PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)
CUR=$("${PSQL[@]}" -tA -c "select current_database()")
[ "$CUR" = "$TARGET" ] || { echo "⛔ ulanish bazasi '$CUR' ≠ FW_RESTORE_TARGET_DB '$TARGET' — to'xtatildi"; exit 2; }
PRODLIKE=0
case "$DATABASE_URL" in *supabase.co*|*supabase.com*|*pooler*) PRODLIKE=1 ;; esac
case "$CUR" in postgres|*prod*|*PROD*|*production*) PRODLIKE=1 ;; esac
if [ "$PRODLIKE" = 1 ]; then
  [ "${FW_RESTORE_PROD_CONFIRM:-}" = "HA-PRODUCTION-BAZASINI-TIKLAYMAN" ] || { echo "⛔ '$CUR' production'ga o'xshaydi — FW_RESTORE_PROD_CONFIRM=HA-PRODUCTION-BAZASINI-TIKLAYMAN kerak (alohida, ataylab)"; exit 2; }
  echo "⚠️ production'ga o'xshagan maqsad — alohida tasdiq berilgan"
fi
[ "$("${PSQL[@]}" -tA -c "select to_regnamespace('auth') is not null")" = t ] || { echo "⛔ maqsad bazada auth sxemasi yo'q (Supabase asosi kerak)"; exit 2; }
SRV=$("${PSQL[@]}" -tA -c "show server_version_num" | tr -d ' ')
CLI=$(pg_restore --version | grep -oE '[0-9]+' | head -1)
[ "$CLI" -ge $((SRV / 10000)) ] || { echo "⛔ pg_restore $CLI < server $((SRV / 10000))"; exit 2; }
LIST=$(pg_restore --list "$F")
[ "$(echo "$LIST" | grep -c 'TABLE DATA public' || true)" -gt 0 ] || { echo "⛔ zaxirada public ma'lumoti yo'q"; exit 2; }

# `--schema=public` bilan tiklashda ikki narsa chiqmaydi — alohida qaytariladi (PG17.6 da sinalgan):
#  1) public sxemasining o'z GRANT/COMMENT'lari (anon/authenticated/service_role USAGE) — zaxiraning to'liq ro'yxatidan;
#  2) funksiyasi public'da bo'lgan event trigger'lar (Supabase `ensure_rls`): `drop schema public cascade` ularni ham
#     o'chiradi — joriy bazadagi ta'rifi bo'yicha qayta yaratiladi.
SCHEMA_ACL=$(pg_restore -f - "$F" | grep -E '^(GRANT|REVOKE) [A-Z, ]+ ON SCHEMA public (TO|FROM) |^COMMENT ON SCHEMA public ' || true)
EVT=$("${PSQL[@]}" -tA -c "select format('create event trigger %I on %s%s execute function public.%I();', e.evtname, e.evtevent,
         case when e.evttags is null then '' else ' when tag in (' || (select string_agg(quote_literal(t), ', ') from unnest(e.evttags) t) || ')' end, p.proname)
       || case e.evtenabled when 'D' then format(' alter event trigger %I disable;', e.evtname) when 'R' then format(' alter event trigger %I enable replica;', e.evtname)
               when 'A' then format(' alter event trigger %I enable always;', e.evtname) else '' end
  from pg_event_trigger e join pg_proc p on p.oid = e.evtfoid where p.pronamespace = 'public'::regnamespace order by e.evtname")
echo "sxema ruxsatlari: $(echo "$SCHEMA_ACL" | grep -c . || true) ta; public event trigger: $(echo "$EVT" | grep -c . || true) ta"

echo "== Rollback (bitta tranzaksiya) → $CUR: $(basename "$F")"
{
  echo "set lock_timeout = '10s';"
  echo "drop schema public cascade;"
  echo "create schema public authorization pg_database_owner;"
  echo "grant usage on schema public to public;"
  pg_restore --no-owner --schema=public -f - "$F"
  echo "$SCHEMA_ACL"
  echo "$EVT"
} | psql "$DATABASE_URL" -X -q -1 -v ON_ERROR_STOP=1 > /dev/null

echo "== Tekshiruv"
FAIL=0
SUMMARY_SQL=$(sed -n '/^SUMMARY_SQL="/,/^rollback;"/p' scripts/backup-before-deploy.sh | sed '1s/^SUMMARY_SQL="//; $s/"$//')
NOW=$("${PSQL[@]}" -tA -c "$SUMMARY_SQL")
if diff <(grep -v '^$' "$F.summary") <(echo "$NOW" | grep -v '^$') >/dev/null; then echo "✅ ma'lumot = zaxira paytidagi holat"
else echo "⛔ ma'lumot FARQ:"; diff <(grep -v '^$' "$F.summary") <(echo "$NOW" | grep -v '^$') | head -20; FAIL=1; fi
FP_NOW=$("${PSQL[@]}" -tA -F' ' -f tests/evidence/schema-fingerprint.sql)
if diff "$F.fingerprint" <(echo "$FP_NOW") >/dev/null; then echo "✅ sxema barmoq izi = zaxira paytidagi ($(grep -c . "$F.fingerprint") bo'lim)"
else echo "⛔ barmoq izi FARQ: $(diff "$F.fingerprint" <(echo "$FP_NOW") | sed -n 's/^> \([^ ]*\) .*/\1/p' | tr '\n' ' ')"; FAIL=1; fi
ACL=$("${PSQL[@]}" -tA -c "select bool_and(has_schema_privilege(r, 'public', 'usage')) from unnest(array['anon','authenticated','service_role']) r where exists (select 1 from pg_roles where rolname = r)")
[ "$ACL" = t ] && echo "✅ anon/authenticated/service_role — public sxemaga kira oladi" || { echo "⛔ sxema ruxsatlari tiklanmadi"; FAIL=1; }
NEVT=$("${PSQL[@]}" -tA -c "select count(*) from pg_event_trigger e join pg_proc p on p.oid = e.evtfoid where p.pronamespace = 'public'::regnamespace")
[ "$NEVT" = "$(echo "$EVT" | grep -c . || true)" ] && echo "✅ event trigger'lar ($NEVT) qayta yaratildi" || { echo "⛔ event trigger soni mos emas"; FAIL=1; }
[ "$FAIL" = 0 ] || exit 3
echo "Tayyor. Kodni ham zaxira darajasiga mos deploy'ga qaytaring (Netlify → Deploys → oldingi deploy → Publish)."
echo "Drag-and-drop deployga QAYTMANG (unda 0 funksiya). Xodimlar F5."
