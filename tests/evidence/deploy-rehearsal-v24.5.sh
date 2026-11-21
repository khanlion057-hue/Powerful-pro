#!/usr/bin/env bash
# DALIL (LOKAL PostgreSQL, npm test'ga kirmaydi): v24.5 deploy skriptlari bilan to'liq mashq —
#   nusxa (SRC_DB'dan template) → scripts/backup-before-deploy.sh → himoyalar (rad etilishi kerak) →
#   scripts/migrate-v24.5.sh --check/--apply (24→34 bitta tranzaksiya + verify) → atomarlik mutatsiyasi (35 o'rniga xato fayl) →
#   scripts/rollback-from-backup.sh migratsiyalangan nusxaga → barmoq izi SRC_DB bilan solishtirish.
# Production'ga ULANMAYDI: faqat Unix-soket orqali lokal klaster; SRC_DB faqat o'qiladi va template sifatida ishlatiladi.
# Yaratiladigan bazalar — faqat ${PREFIX}* (oxirida o'chiriladi).
#   PGBIN=/var/tmp/pg17cli/bin PGSOCK=/var/tmp/pg17run PGPORT=5517 SRC_DB=fw_prod17 PREFIX=wtdeploy_ \
#     bash tests/evidence/deploy-rehearsal-v24.5.sh
set -uo pipefail
B="${PGBIN:?PGBIN kerak}"; H="${PGSOCK:?PGSOCK kerak}"; P="${PGPORT:-5432}"; SRC="${SRC_DB:-fw_prod17}"; PFX="${PREFIX:-wtdeploy_}"
[ -d "$H" ] || { echo "⛔ PGSOCK — lokal soket papkasi bo'lishi kerak"; exit 2; }
case "$PFX" in wtdeploy_*|fwreh_*) ;; *) echo "⛔ PREFIX faqat sinov bazalari uchun"; exit 2;; esac
cd "$(dirname "$0")/../.."
export PATH="$B:$PATH"
unset DATABASE_URL VERIFY_URL PGHOST PGDATABASE PGPASSWORD FW_BACKUP_FILE FW_MIGRATE_CONFIRM FW_ROLLBACK_CONFIRM FW_RESTORE_TARGET_DB FW_RESTORE_PROD_CONFIRM
REH="${PFX}rehearsal"; RES="${PFX}restored"; VER="${PFX}verify"; ATO="${PFX}atomic"
url() { echo "postgresql://postgres@/$1?host=$H&port=$P"; }
q() { psql -h "$H" -p "$P" -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
fp() { q -tA -F' ' -f tests/evidence/schema-fingerprint.sql -d "$1"; }
rc() { echo "→ chiqish kodi: $1 (kutilgan $2) $([ "$1" = "$2" ] && echo OK || echo XATO)"; [ "$1" = "$2" ] || FAILS=$((FAILS + 1)); }
FAILS=0
W=$(mktemp -d); BK="backups/rehearsal-$$"; mkdir -p "$BK"
dropdbs() { for d in "$REH" "$RES" "$VER" "$ATO"; do q -d postgres -c "drop database if exists $d" >/dev/null 2>&1; done; }
cleanup() { dropdbs; rm -rf "$W" "$BK"; }
trap cleanup EXIT

echo "### $(date -u +%FT%TZ) $(q -d postgres -tAc 'select version()')"
echo "### psql/pg_dump: $(pg_dump --version); git: $(git rev-parse --short HEAD 2>/dev/null) ($(git rev-parse --abbrev-ref HEAD 2>/dev/null)), ishchi daraxt o'zgarishlari: $(git status --porcelain 2>/dev/null | wc -l)"
dropdbs
echo "== 0. Nusxa: createdb -T $SRC $REH (manba faqat template — o'zgarmaydi)"
q -d postgres -c "create database $REH template $SRC" && q -d postgres -c "create database $VER"
fp "$SRC" > "$W/fp-src.txt"; echo "-- $SRC barmoq izi:"; cat "$W/fp-src.txt"
[ "$(grep -c . "$W/fp-src.txt")" -eq 18 ] || { echo "❌ barmoq izi SQL ishlamadi (18 qator kutilgan)"; exit 1; }
fp "$REH" > "$W/fp-reh0.txt"; diff -q "$W/fp-src.txt" "$W/fp-reh0.txt" >/dev/null && echo "✅ $REH = $SRC (18/18)" || { echo "❌ nusxa farq qiladi"; FAILS=$((FAILS + 1)); }

echo; echo "== 1. BACKUP: scripts/backup-before-deploy.sh (+ VERIFY_URL — bo'sh lokal bazaga tiklash sinovi)"
DATABASE_URL="$(url "$REH")" VERIFY_URL="$(url "$VER")" FW_BACKUP_DIR="$BK" bash scripts/backup-before-deploy.sh | grep -v '^jadval:'; rc "${PIPESTATUS[0]}" 0
DUMP=$(ls -t "$BK"/powerful-pro-v24.5-*.dump | head -1)
echo "-- fayllar: $(cd "$BK" && ls | tr '\n' ' ')"
echo "-- sha256 tekshiruvi: $(cd "$BK" && sha256sum -c "$(basename "$DUMP").sha256")"

echo; echo "== 2. VALIDATE / himoyalar (hammasi rad etilishi kerak; bazaga hech narsa yozilmaydi)"
echo "-- migrate: tasdiqsiz"; DATABASE_URL="$(url "$REH")" FW_BACKUP_FILE="$DUMP" bash scripts/migrate-v24.5.sh --apply 2>&1 | grep '⛔'; rc "${PIPESTATUS[0]}" 2
echo "-- migrate: zaxirasiz"; DATABASE_URL="$(url "$REH")" FW_MIGRATE_CONFIRM=HA-QOLLAYMAN-V24.5 bash scripts/migrate-v24.5.sh --apply 2>&1 | grep '⛔'; rc "${PIPESTATUS[0]}" 2
cp "$DUMP" "$W/buzuq.dump"; for s in sha256 manifest fingerprint summary; do cp "$DUMP.$s" "$W/buzuq.dump.$s"; done
sed -i "s/$(basename "$DUMP")/buzuq.dump/" "$W/buzuq.dump.sha256"; printf 'x' >> "$W/buzuq.dump"
echo "-- migrate: buzilgan zaxira"; DATABASE_URL="$(url "$REH")" FW_MIGRATE_CONFIRM=HA-QOLLAYMAN-V24.5 FW_BACKUP_FILE="$W/buzuq.dump" bash scripts/migrate-v24.5.sh --apply 2>&1 | grep '⛔'; rc "${PIPESTATUS[0]}" 2
echo "-- migrate: eski zaxira (FW_BACKUP_MAX_AGE_MIN=0, 2 daqiqa oldingi fayl vaqti)"
cp -p "$DUMP" "$W/eski.dump"; for s in sha256 manifest fingerprint summary; do cp "$DUMP.$s" "$W/eski.dump.$s"; done; sed -i "s/$(basename "$DUMP")/eski.dump/" "$W/eski.dump.sha256"; touch -d '-2 minutes' "$W/eski.dump"
DATABASE_URL="$(url "$REH")" FW_MIGRATE_CONFIRM=HA-QOLLAYMAN-V24.5 FW_BACKUP_FILE="$W/eski.dump" FW_BACKUP_MAX_AGE_MIN=0 bash scripts/migrate-v24.5.sh --apply 2>&1 | grep '⛔'; rc "${PIPESTATUS[0]}" 2
echo "-- migrate: boshqa bazaning zaxirasi ($VER ga $REH zaxirasi bilan)"; DATABASE_URL="$(url "$VER")" FW_MIGRATE_CONFIRM=HA-QOLLAYMAN-V24.5 FW_BACKUP_FILE="$DUMP" bash scripts/migrate-v24.5.sh --apply 2>&1 | grep '⛔'; rc "${PIPESTATUS[0]}" 2
echo "-- rollback: production'ga o'xshagan maqsad ($SRC — nomida 'prod'), alohida tasdiqsiz — YOZISHDAN OLDIN rad"
DATABASE_URL="$(url "$SRC")" FW_RESTORE_TARGET_DB="$SRC" FW_ROLLBACK_CONFIRM=HA-TIKLAYMAN FW_BACKUP_FILE="$DUMP" bash scripts/rollback-from-backup.sh 2>&1 | grep '⛔'; rc "${PIPESTATUS[0]}" 2
echo "-- rollback: FW_RESTORE_TARGET_DB ulanishdagi bazaga mos emas"
DATABASE_URL="$(url "$REH")" FW_RESTORE_TARGET_DB="${PFX}boshqa" FW_ROLLBACK_CONFIRM=HA-TIKLAYMAN FW_BACKUP_FILE="$DUMP" bash scripts/rollback-from-backup.sh 2>&1 | grep '⛔'; rc "${PIPESTATUS[0]}" 2
echo "-- rollback: buzilgan zaxira"; DATABASE_URL="$(url "$REH")" FW_RESTORE_TARGET_DB="$REH" FW_ROLLBACK_CONFIRM=HA-TIKLAYMAN FW_BACKUP_FILE="$W/buzuq.dump" bash scripts/rollback-from-backup.sh 2>&1 | grep '⛔'; rc "${PIPESTATUS[0]}" 2
fp "$SRC" | diff -q "$W/fp-src.txt" - >/dev/null && echo "✅ $SRC o'zgarmagan (himoya sinovlaridan keyin barmoq izi bir xil)" || { echo "❌ $SRC O'ZGARGAN"; FAILS=$((FAILS + 1)); }
fp "$REH" | diff -q "$W/fp-src.txt" - >/dev/null && echo "✅ $REH o'zgarmagan (rad etilgan urinishlar hech narsa yozmadi)" || { echo "❌ $REH o'zgargan"; FAILS=$((FAILS + 1)); }

echo; echo "== 3. PRECHECK: scripts/migrate-v24.5.sh --check (faqat o'qiydi)"
DATABASE_URL="$(url "$REH")" bash scripts/migrate-v24.5.sh --check; rc "$?" 0

echo; echo "== 4. MIGRATE + TEST: scripts/migrate-v24.5.sh --apply (24→34 bitta tranzaksiya, verify, barmoq izi oldin/keyin)"
T0=$(date +%s)
DATABASE_URL="$(url "$REH")" FW_MIGRATE_CONFIRM=HA-QOLLAYMAN-V24.5 FW_BACKUP_FILE="$DUMP" bash scripts/migrate-v24.5.sh --apply > "$W/migrate.out" 2>&1; MRC=$?
grep -vE '\|t\|' "$W/migrate.out"; rc "$MRC" 0
echo "-- verify qatorlari (ok=t): $(grep -cE '\|t\|' "$W/migrate.out"); vaqt: $(( $(date +%s) - T0 )) s"
fp "$REH" > "$W/fp-reh-after.txt"

echo; echo "== 5. Atomarlik mutatsiyasi: zanjir oxiriga xato fayl (35-o'rnida 'select 1/0') — HAMMASI orqaga qaytishi kerak"
q -d postgres -c "create database $ATO template $SRC"
M="$W/mut"; mkdir -p "$M/scripts/lib" "$M/tests/evidence" "$M/backups"
cp scripts/migrate-v24.5.sh scripts/backup-before-deploy.sh "$M/scripts/"; cp scripts/lib/migratsiya-darajasi.sql "$M/scripts/lib/"
cp tests/evidence/schema-fingerprint.sql "$M/tests/evidence/"; cp supabase-migration-2[4-9]-*.sql supabase-migration-3[0-4]-*.sql "$M/"   # 25-verify ham shu glob ichida
printf -- "-- MUTATSIYA (faqat mashq): ataylab xato\nselect 1/0;\n" > "$M/supabase-migration-35-diller-ombor-atomik.sql"
DATABASE_URL="$(url "$ATO")" FW_BACKUP_DIR="$M/backups" bash "$M/scripts/backup-before-deploy.sh" > /dev/null 2>&1; echo "mutatsiya bazasi zaxirasi: kod $?"
MD=$(ls "$M"/backups/*.dump | head -1)
DATABASE_URL="$(url "$ATO")" FW_MIGRATE_CONFIRM=HA-QOLLAYMAN-V24.5 FW_BACKUP_FILE="$MD" bash "$M/scripts/migrate-v24.5.sh" --apply 2>&1 | grep -E '35-diller|zanjir:|ERROR|division|⛔|==.*BITTA'; MRC2=${PIPESTATUS[0]}
echo "→ chiqish kodi: $MRC2 (kutilgan: 0 emas) $([ "$MRC2" != 0 ] && echo OK || { echo XATO; FAILS=$((FAILS + 1)); })"
fp "$ATO" | diff -q "$W/fp-src.txt" - >/dev/null && echo "✅ xato fayldan keyin $ATO barmoq izi = $SRC (24…34 dan hech narsa qolmadi — bitta tranzaksiya)" || { echo "❌ yarim holat qoldi"; FAILS=$((FAILS + 1)); }
q -tA -F' ' -f scripts/lib/migratsiya-darajasi.sql -d "$ATO" | tr '\n' ';' | sed 's/;$/\n/'

echo; echo "== 6. ROLLBACK: migratsiyalangan nusxa → $RES (createdb -T $REH), so'ng scripts/rollback-from-backup.sh zaxiradan"
q -d postgres -c "create database $RES template $REH"
fp "$RES" | diff -q "$W/fp-reh-after.txt" - >/dev/null && echo "$RES = migratsiyadan keyingi holat (34)"
echo "-- tasdiqsiz:"; DATABASE_URL="$(url "$RES")" FW_RESTORE_TARGET_DB="$RES" FW_BACKUP_FILE="$DUMP" bash scripts/rollback-from-backup.sh 2>&1 | grep '⛔'; rc "${PIPESTATUS[0]}" 2
DATABASE_URL="$(url "$RES")" FW_RESTORE_TARGET_DB="$RES" FW_ROLLBACK_CONFIRM=HA-TIKLAYMAN FW_BACKUP_FILE="$DUMP" bash scripts/rollback-from-backup.sh 2>&1 | grep -vE '^(NOTICE|DETAIL|drop cascades|and [0-9]+ other)'; rc "${PIPESTATUS[0]}" 0

echo; echo "== 7. Barmoq izi: $SRC ↔ $RES (tests/evidence/schema-fingerprint.sql, 18 bo'lim)"
fp "$RES" > "$W/fp-res.txt"; cat "$W/fp-res.txt"
if diff "$W/fp-src.txt" "$W/fp-res.txt"; then echo "✅ $SRC va $RES barmoq izi AYNAN bir xil (18/18)"; else echo "❌ barmoq izi FARQ qiladi"; FAILS=$((FAILS + 1)); fi
echo "-- migratsiyadan keyingi holat bilan farq qilgan bo'limlar (rollback ularni qaytardi): $(diff "$W/fp-src.txt" "$W/fp-reh-after.txt" | sed -n 's/^> \([^ ]*\) .*/\1/p' | tr '\n' ' ')"
SUMMARY_SQL=$(sed -n '/^SUMMARY_SQL="/,/^rollback;"/p' scripts/backup-before-deploy.sh | sed '1s/^SUMMARY_SQL="//; $s/"$//')
diff <(q -tA -d "$SRC" -c "$SUMMARY_SQL") <(q -tA -d "$RES" -c "$SUMMARY_SQL") >/dev/null && echo "✅ ma'lumot xulosasi (jadval qatorlari, app_data md5, kassa, diller qarzi): $SRC = $RES" || { echo "❌ ma'lumot farq qiladi"; FAILS=$((FAILS + 1)); }
q -tAc "select 'auth_jadval=' || count(*) from pg_tables where schemaname='auth' union all select 'storage_siyosat=' || count(*) from pg_policies where schemaname='storage'" -d "$RES" | tr '\n' ' '; echo

echo; echo "== 8. Tozalash: ${PFX}* bazalar o'chiriladi, lokal zaxira fayllari o'chiriladi"
cleanup
echo "qolgan ${PFX}* bazalar: $(q -d postgres -tAc "select count(*) from pg_database where datname like '${PFX}%'")"
echo "### NATIJA: $([ "$FAILS" = 0 ] && echo "✅ hammasi kutilgandek" || echo "❌ $FAILS ta farq") ($(date -u +%FT%TZ))"
exit $([ "$FAILS" = 0 ] && echo 0 || echo 1)
