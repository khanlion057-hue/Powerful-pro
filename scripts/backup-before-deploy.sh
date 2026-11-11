#!/usr/bin/env bash
# Powerful PRO — deploy/migratsiyadan OLDIN zaxira nusxa (v24.5; v23.10.2 skriptidan ko'chirilgan).
# Bazaga HECH NARSA yozmaydi (pg_dump va so'rovlar — faqat o'qish). Supabase FREE tarifida PITR yo'q — bu nusxa MAJBURIY.
#
#   DATABASE_URL='postgresql://...' scripts/backup-before-deploy.sh
#   (ixtiyoriy) FW_BACKUP_DIR=backups      — natija papkasi (standart: backups/, .gitignore'da)
#   (ixtiyoriy) VERIFY_URL='postgresql://...LOKAL bo'sh baza...' — nusxani u yerga tiklab, ma'lumot xulosasini solishtiradi
#
# Natija (hammasi bir xil nomli): <nom>.dump (pg_dump custom format, ruxsatlar BILAN) + .sha256 + .summary (jadval qatorlari,
# kassa/qarz yig'indilari) + .fingerprint (sxema barmoq izi: tests/evidence/schema-fingerprint.sql) + .manifest
# (versiya 24.5, UTC vaqt, migratsiya darajasi, sha256, server/pg_dump versiyasi). DATABASE_URL hech qayerga yozilmaydi.
# Nusxani Git'ga, chatga yoki ochiq joyga qo'ymang (mijoz va pul ma'lumoti).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -n "${DATABASE_URL:-}" ] || { echo "⛔ DATABASE_URL kerak (standart manzil YO'Q — ataylab)"; exit 2; }
command -v pg_dump >/dev/null && command -v psql >/dev/null || { echo "⛔ pg_dump/psql topilmadi"; exit 2; }
FP_SQL=tests/evidence/schema-fingerprint.sql
LVL_SQL=scripts/lib/migratsiya-darajasi.sql
for f in "$FP_SQL" "$LVL_SQL"; do [ -s "$f" ] || { echo "⛔ $f yo'q"; exit 2; }; done
PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)
# pg_dump versiyasi server versiyasidan past bo'lmasligi shart (production — PostgreSQL 17: pg_dump 17+ kerak)
SRV=$("${PSQL[@]}" -tA -c "show server_version_num" | tr -d ' ')
CLI=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
[ -n "$SRV" ] || { echo "⛔ bazaga ulanib bo'lmadi"; exit 2; }
[ "$CLI" -ge $((SRV / 10000)) ] || { echo "⛔ pg_dump $CLI < server $((SRV / 10000)) — pg_dump $((SRV / 10000))+ kerak (PATH)"; exit 2; }
DBNAME=$("${PSQL[@]}" -tA -c "select current_database()")
echo "server $((SRV / 10000)), pg_dump $CLI, baza: $DBNAME"
DIR="${FW_BACKUP_DIR:-backups}"
mkdir -p "$DIR"
TS=$(date -u +%Y%m%d-%H%M%S)
OUT="$DIR/powerful-pro-v24.5-$TS.dump"

SUMMARY_SQL="begin read only;
select 'jadval:' || c.relname || '=' || (xpath('/row/n/text()', query_to_xml('select count(*) n from public.' || quote_ident(c.relname), false, true, '')))[1]::text
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by c.relname;
select 'app_data_md5=' || md5(data::text) from public.app_data where id = 'main';
select 'app_data_branches_md5=' || coalesce(md5(string_agg(branch_key || data::text, '#' order by branch_key)), '-') from public.app_data_branches;
select 'firma_kassa=' || coalesce(string_agg(currency || ':' || balance, ',' order by currency), '-') from public.firma_kassa_balance;
select 'dealers_debt=' || coalesce(sum(debt_usd), 0) from public.dealers;
rollback;"

echo "== Migratsiya darajasi (faqat o'qish)"
LVL_OUT=$("${PSQL[@]}" -tA -F' ' -f "$LVL_SQL")
echo "$LVL_OUT"
# daraja — 23 dan boshlab UZLUKSIZ qo'llangan oxirgi migratsiya (oraliq bo'shliq bo'lsa — o'sha joyda to'xtaydi)
LEVEL=$(echo "$LVL_OUT" | awk 'BEGIN{l="<23"; ok=1} NF>=3 { if (ok && $NF=="t") l=$1; else ok=0 } END{print l}')
PRESENT=$(echo "$LVL_OUT" | awk 'NF>=3 && $NF=="t"{printf "%s%s", s, $1; s=","}')
echo "daraja: $LEVEL (bor: ${PRESENT:--})"

echo "== Holat (faqat o'qish)"
"${PSQL[@]}" -tA -c "$SUMMARY_SQL" > "$OUT.summary"
head -60 "$OUT.summary"
echo "== Sxema barmoq izi"
"${PSQL[@]}" -tA -F' ' -f "$FP_SQL" > "$OUT.fingerprint"
cat "$OUT.fingerprint"
[ "$(grep -c . "$OUT.fingerprint")" -ge 18 ] || { echo "⛔ barmoq izi to'liq emas"; exit 2; }

echo "== pg_dump → $OUT"
# ruxsatlar (GRANT/REVOKE, RLS siyosatlari) dump ichida QOLADI — tiklashda anon/authenticated huquqlari asl holicha qaytadi
pg_dump "$DATABASE_URL" --format=custom --schema=public --schema=private --schema=auth --schema=storage --file="$OUT"
(cd "$DIR" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256")   # tekshirish: cd backups && sha256sum -c <fayl>.sha256
NDATA=$(pg_restore --list "$OUT" | grep -c 'TABLE DATA' || true)
[ "$NDATA" -gt 0 ] || { echo "⛔ arxivda jadval ma'lumoti yo'q"; exit 2; }
echo "✅ arxiv o'qiladi: $NDATA ta jadval ma'lumoti"
SHA=$(cut -d' ' -f1 "$OUT.sha256")
{
  echo "app=powerful-pro"
  echo "version=24.5"
  echo "created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "database=$DBNAME"
  echo "server_version_num=$SRV"
  echo "pg_dump=$(pg_dump --version)"
  echo "migration_level=$LEVEL"
  echo "migrations_present=${PRESENT:--}"
  echo "dump_file=$(basename "$OUT")"
  echo "dump_sha256=$SHA"
  echo "dump_bytes=$(stat -c %s "$OUT")"
  echo "table_data=$NDATA"
  echo "schemas=public,private,auth,storage"
  echo "fingerprint_md5=$(md5sum < "$OUT.fingerprint" | cut -d' ' -f1)"
  echo "summary_md5=$(md5sum < "$OUT.summary" | cut -d' ' -f1)"
} > "$OUT.manifest"
echo "== Manifest ($OUT.manifest)"; cat "$OUT.manifest"

if [ -n "${VERIFY_URL:-}" ]; then
  case "$VERIFY_URL" in *supabase.co*|*supabase.com*|*pooler*) echo "⛔ VERIFY_URL — faqat lokal/bo'sh sinov bazasi"; exit 2;; esac
  echo "== Tiklash sinovi (lokal) → solishtirish"
  pg_restore --no-owner --no-privileges --schema=public -d "$VERIFY_URL" "$OUT" 2> "$OUT.restore.log" || true
  # public sxemasigina tiklanadi: auth/storage'ga bog'liq FK/siyosat xatolari kutiladi — soni ko'rsatiladi, ma'lumot pastda solishtiriladi
  echo "pg_restore ogohlantirish/xatolari: $(grep -c 'error:' "$OUT.restore.log" || true) (to'liq: $OUT.restore.log)"
  psql "$VERIFY_URL" -X -q -tA -c "$SUMMARY_SQL" > "$OUT.verify"
  if diff -q <(grep -v '^$' "$OUT.summary") <(grep -v '^$' "$OUT.verify") >/dev/null; then echo "✅ tiklangan nusxa = asl (jadval qatorlari, JSON md5, kassa, diller qarzi)"
  else echo "⛔ FARQ:"; diff <(grep -v '^$' "$OUT.summary") <(grep -v '^$' "$OUT.verify") | head -20; exit 3; fi
fi
echo "Tayyor: $OUT"
