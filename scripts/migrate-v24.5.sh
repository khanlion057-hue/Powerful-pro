#!/usr/bin/env bash
# Powerful PRO — v24.5 migratsiyalarini XAVFSIZ qo'llash: 24 → 34 (+ 35, fayl mavjud bo'lsa). v23.10.2 migrate-24-31.sh dan.
#
#   DATABASE_URL=postgres://... scripts/migrate-v24.5.sh --check     # FAQAT O'QIYDI: daraja, zanjir, barmoq izi
#   DATABASE_URL=postgres://... FW_MIGRATE_CONFIRM=HA-QOLLAYMAN-V24.5 \
#     FW_BACKUP_FILE=backups/powerful-pro-v24.5-<vaqt>.dump scripts/migrate-v24.5.sh --apply
#
# --apply: zanjirdagi BARCHA fayllar BITTA tranzaksiyada (psql -1 -v ON_ERROR_STOP=1). Istalgan joyda xato — HAMMASI
#   orqaga qaytadi (oraliq holat qolmaydi). Oldin: tasdiq tokeni; YANGI zaxira (scripts/backup-before-deploy.sh) — .sha256
#   mos, .manifest shu baza va v24.5 uchun, zaxiradagi sxema barmoq izi = hozirgi (zaxiradan keyin sxema o'zgarmagan),
#   FW_BACKUP_MAX_AGE_MIN (standart 120) daqiqadan yangi. So'ng supabase-migration-25-verify.sql (faqat o'qiydi) —
#   biror qator ok <> t bo'lsa chiqish kodi 3. Sxema barmoq izi oldin/keyin chiqariladi.
# Standart baza manzili YO'Q (DATABASE_URL majburiy); DATABASE_URL hech qachon chiqarilmaydi.
# Fayllarda BEGIN/COMMIT yo'q — ularni tranzaksiyasiz (psql -1 siz) ishlatmang.
set -euo pipefail
cd "$(dirname "$0")/.."

# ── Migratsiya zanjiri — YAGONA ro'yxat. Yangi migratsiya — shu massiv oxiriga qo'shiladi.
#    "?" bilan boshlangan yozuv — IXTIYORIY: fayl bo'lsa zanjirga qo'shiladi, bo'lmasa o'tkaziladi (ikkalasi ham logda).
MIGRATIONS=(
  supabase-migration-24-v11-cash-authority.sql
  supabase-migration-25-v23-hardening.sql
  supabase-migration-26-expense-categories.sql
  supabase-migration-27-f4b-ledger-authority.sql
  supabase-migration-28-firma-kassa-asosiy.sql
  supabase-migration-29-hisobdan-chiqarish-b2b.sql
  supabase-migration-30-diller-tolov-xabarnomasi.sql
  supabase-migration-31-tahrir-muddati-audit-bildirishnoma.sql
  supabase-migration-32-reviziya-tasdiq-direct-sale.sql
  supabase-migration-33-taminotchi-zaklad.sql
  supabase-migration-34-mijoz-haqi.sql
  "?supabase-migration-35-diller-ombor-atomik.sql"
  "?supabase-migration-36-filial-otkazma.sql"
  "?supabase-migration-37-maxfiylik-chegirma-versiya.sql"
  "?supabase-migration-38-parol-tiklash.sql"
  "?supabase-migration-39-toshkent-vaqti.sql"
  "?supabase-migration-40-filial-qarzga-jonatma.sql"
  "?supabase-migration-41-som-tannarx.sql"
  "?supabase-migration-42-diller-qarzga-jonatma.sql"
  "?supabase-migration-43-filial-qarz-valyuta.sql"
  "?supabase-migration-44-taminotchi-valyuta.sql"
  "?supabase-migration-45-zaklad-valyuta.sql"
  "?supabase-migration-46-mustaqil-narx.sql"
)
VERIFY_SQL=supabase-migration-25-verify.sql
FP_SQL=tests/evidence/schema-fingerprint.sql
LVL_SQL=scripts/lib/migratsiya-darajasi.sql
CONFIRM_TOKEN="HA-QOLLAYMAN-V24.5"

MODE="${1:-}"
case "$MODE" in --check|--apply) ;; *) sed -n '2,15p' "$0"; exit 2 ;; esac
[ -n "${DATABASE_URL:-}" ] || { echo "⛔ DATABASE_URL kerak (standart manzil YO'Q — ataylab)"; exit 2; }
command -v psql >/dev/null || { echo "⛔ psql topilmadi"; exit 2; }

echo "== Migratsiya zanjiri"
FILES=()
for m in "${MIGRATIONS[@]}"; do
  f="${m#\?}"
  if [ -f "$f" ]; then FILES+=("$f"); echo "  + $f"
  elif [ "$f" != "$m" ]; then echo "  - $f — IXTIYORIY, fayl yo'q: zanjirga QO'SHILMADI"
  else echo "⛔ $f yo'q"; exit 2; fi
done
for f in "$VERIFY_SQL" "$FP_SQL" "$LVL_SQL"; do [ -s "$f" ] || { echo "⛔ $f yo'q"; exit 2; }; done
for f in "${FILES[@]}"; do
  ! grep -qiE '^[[:space:]]*(begin|commit|rollback|start[[:space:]]+transaction)[[:space:]]*;' "$f" || { echo "⛔ $f ichida BEGIN/COMMIT bor — bitta tranzaksiya kafolati buziladi"; exit 2; }
done
echo "zanjir: ${#FILES[@]} ta fayl"

PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)
level() { "${PSQL[@]}" -tA -F' ' -f "$LVL_SQL"; }
fingerprint() { "${PSQL[@]}" -tA -F' ' -f "$FP_SQL"; }

echo "== Baza: $("${PSQL[@]}" -tA -c "select current_database() || ' (PostgreSQL ' || current_setting('server_version') || ')'")"
echo "== Migratsiya darajasi (oldin)"; LVL_BEFORE=$(level); echo "$LVL_BEFORE"
FP_BEFORE=$(fingerprint)
echo "== Sxema barmoq izi (oldin)"; echo "$FP_BEFORE"
[ "$MODE" = --check ] && { echo "(--check: hech narsa yozilmadi)"; exit 0; }

# ── --apply himoyalari
[ "${FW_MIGRATE_CONFIRM:-}" = "$CONFIRM_TOKEN" ] || { echo "⛔ FW_MIGRATE_CONFIRM=$CONFIRM_TOKEN kerak (ataylab)"; exit 2; }
echo "$LVL_BEFORE" | grep -q '^23 .* t$' || { echo "⛔ 23-migratsiya yo'q (firma_kassa_ledger) — to'xtatildi"; exit 2; }
F="${FW_BACKUP_FILE:-}"
[ -n "$F" ] && [ -s "$F" ] || { echo "⛔ FW_BACKUP_FILE — scripts/backup-before-deploy.sh yaratgan .dump kerak (zaxirasiz migratsiya YO'Q)"; exit 2; }
for s in sha256 manifest fingerprint summary; do [ -s "$F.$s" ] || { echo "⛔ $F.$s yo'q"; exit 2; }; done
(cd "$(dirname "$F")" && sha256sum -c --status "$(basename "$F").sha256") || { echo "⛔ zaxira fayli sha256 bilan mos emas"; exit 2; }
MSHA=$(sed -n 's/^dump_sha256=//p' "$F.manifest")
[ "$MSHA" = "$(cut -d' ' -f1 "$F.sha256")" ] || { echo "⛔ manifestdagi sha256 .sha256 fayli bilan mos emas"; exit 2; }
grep -qx 'version=24.5' "$F.manifest" || { echo "⛔ zaxira manifesti v24.5 uchun emas"; exit 2; }
DBNAME=$("${PSQL[@]}" -tA -c "select current_database()")
[ "$(sed -n 's/^database=//p' "$F.manifest")" = "$DBNAME" ] || { echo "⛔ zaxira boshqa bazadan olingan (manifest: $(sed -n 's/^database=//p' "$F.manifest"), hozir: $DBNAME)"; exit 2; }
MAX_MIN="${FW_BACKUP_MAX_AGE_MIN:-120}"
AGE=$(( $(date +%s) - $(stat -c %Y "$F") ))
[ "$AGE" -le $((MAX_MIN * 60)) ] || { echo "⛔ zaxira $((AGE / 60)) daqiqa oldin olingan (> $MAX_MIN) — yangisini oling"; exit 2; }
diff -q <(echo "$FP_BEFORE") "$F.fingerprint" >/dev/null || { echo "⛔ zaxiradan keyin sxema o'zgargan (barmoq izi farq qiladi) — yangi zaxira oling:"; diff "$F.fingerprint" <(echo "$FP_BEFORE") | head -10; exit 2; }
echo "zaxira: $(basename "$F") — sha256 mos, manifest v24.5 / $DBNAME / daraja $(sed -n 's/^migration_level=//p' "$F.manifest"), $((AGE / 60)) daqiqa oldin, barmoq izi = hozirgi"

ARGS=(); for f in "${FILES[@]}"; do ARGS+=(-f "$f"); done
echo "== ${#FILES[@]} ta migratsiya BITTA tranzaksiyada (psql -1, ON_ERROR_STOP, lock_timeout 10s)"
T0=$(date +%s)
PGOPTIONS="-c lock_timeout=10s -c statement_timeout=0" "${PSQL[@]}" -1 "${ARGS[@]}" > /dev/null
echo "migratsiya: OK ($(( $(date +%s) - T0 )) s)"

echo "== Verify ($VERIFY_SQL, faqat o'qiydi)"
OUT=$("${PSQL[@]}" -tA -F'|' -f "$VERIFY_SQL")
echo "$OUT"
BAD=$(echo "$OUT" | awk -F'|' 'NF>=2 && $2!="t"' | wc -l)
TOTAL=$(echo "$OUT" | awk -F'|' 'NF>=2' | wc -l)
echo "verify: $((TOTAL - BAD))/$TOTAL ok"
echo "== Migratsiya darajasi (keyin)"; level
FP_AFTER=$(fingerprint)
echo "== Sxema barmoq izi (keyin)"; echo "$FP_AFTER"
echo "o'zgargan bo'limlar: $(diff <(echo "$FP_BEFORE") <(echo "$FP_AFTER") | sed -n 's/^> \([^ ]*\) .*/\1/p' | tr '\n' ' ')"
[ "$TOTAL" -gt 0 ] && [ "$BAD" -eq 0 ] || { echo "⛔ verify o'tmadi — rollback: scripts/rollback-from-backup.sh (DEPLOY.md)"; exit 3; }
echo "✅ migratsiya va verify o'tdi"
