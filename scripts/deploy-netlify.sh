#!/usr/bin/env bash
# Powerful PRO — Netlify'ga deploy FAQAT Git/CLI orqali (v24.5; v23.10.2 skriptidan). Drag-and-drop ISHLATILMAYDI va
# QO'LLAB-QUVVATLANMAYDI: drag-and-drop'da `netlify/functions` yig'ilmaydi (production'da 0 funksiya — 2026-10-08 holati),
# ZIP papkasi tashlansa "/" 404.
#
#   scripts/deploy-netlify.sh --dry-run [--prod]    # faqat tekshiruvlar; Netlify'ga HECH NARSA yubormaydi
#   FW_DEPLOY_CONFIRM=HA-PREVIEW scripts/deploy-netlify.sh            # PREVIEW (sinov havolasi) — production'ga tegmaydi
#   FW_DEPLOY_CONFIRM=HA-PRODUCTION FW_BACKUP_FILE=backups/powerful-pro-v24.5-<vaqt>.dump \
#     NL_TOOLS=/yo'l/node_modules scripts/deploy-netlify.sh --prod    # PRODUCTION
#
# Talablar: `netlify-cli` (npx, versiya qat'iy), NETLIFY_AUTH_TOKEN va NETLIFY_SITE_ID muhitda yoki `netlify link`.
# Tekshiruvlar: Git daraxti toza (yoki reliz ZIP manifesti), netlify.toml (NODE_VERSION 22, publish=dist), 61 funksiya,
# `npm run check`, `npm test`, build, dist/ (index.html + 404.html ildizda, ichki fayl yo'q), artefakt tekshiruvi
# (scripts/verify-netlify-artifact.mjs, NL_TOOLS). Deploydan keyin: 61 funksiya, health ok, xavfsizlik sarlavhalari.
# Migratsiya bu skriptda YO'Q — alohida: scripts/migrate-v24.5.sh (DEPLOY.md). Hech qanday secret qiymati chiqarilmaydi.
set -euo pipefail
cd "$(dirname "$0")/.."

PROD=0; DRY=0
for a in "$@"; do
  case "$a" in
    --prod) PROD=1 ;;
    --dry-run) DRY=1 ;;
    *) sed -n '2,16p' "$0"; exit 2 ;;
  esac
done
NETLIFY=(npx --yes netlify-cli@17.38.1)
EXPECTED=63   # v25: B2B olib tashlandi (b2b, b2b-inbound) — 65 − 2
step() { echo "== $*"; }
die() { echo "⛔ $*"; exit 2; }

[ -f index.html ] && [ -f netlify.toml ] && [ -f 404.html ] || die "index.html / 404.html / netlify.toml shu papkada yo'q — skriptni loyiha ILDIZIDAN ishga tushiring (ZIP'ning tashqi papkasidan emas). Drag-and-drop deploy QILINMAYDI."
if command -v git >/dev/null && git rev-parse --git-dir >/dev/null 2>&1; then
  step "1. Git daraxti"
  [ -z "$(git status --porcelain)" ] || die "commit qilinmagan o'zgarishlar bor — deploy aynan commit bo'lishi kerak"
  SHA=$(git rev-parse --short HEAD)
  echo "commit $SHA ($(git rev-parse --abbrev-ref HEAD))"
  [ ! -e .env ] || git check-ignore -q .env || die ".env Git'da kuzatilmoqda"
else
  # FINAL ZIP'dan ochilgan papka (git yo'q) — RELEASE + RELEASE-MANIFEST.sha256 bo'yicha: har fayl aynan reliz
  step "1. Reliz papkasi (git'siz): manifest tekshiruvi"
  [ -s RELEASE ] && [ -s RELEASE-MANIFEST.sha256 ] || die "Git ham, RELEASE-MANIFEST.sha256 ham yo'q — faqat Git yoki scripts/make-release-zip.sh ZIP'idan deploy"
  SHA=$(sed -n 's/^commit=\([0-9a-f]\{7,\}\)$/\1/p' RELEASE)
  [ -n "$SHA" ] || die "RELEASE'da commit yo'q"
  sha256sum -c --quiet --strict RELEASE-MANIFEST.sha256 || die "reliz fayllari o'zgargan (manifest bilan mos emas)"
  N_EXTRA=$(comm -13 <(cut -c67- RELEASE-MANIFEST.sha256 | LC_ALL=C sort) <(find . -type f ! -path './node_modules/*' ! -path './dist/*' ! -path './backups/*' ! -path './.netlify/*' ! -name RELEASE-MANIFEST.sha256 | sed 's|^\./||' | LC_ALL=C sort) | grep -cv '^\.env' || true)
  [ "$N_EXTRA" = 0 ] || die "relizda yo'q $N_EXTRA ta qo'shimcha fayl bor (faqat node_modules/dist/backups/.netlify/.env ruxsat)"
  echo "reliz commit $SHA — $(wc -l < RELEASE-MANIFEST.sha256) fayl mos"
fi

step "2. netlify.toml va funksiyalar"
grep -qE '^[[:space:]]*NODE_VERSION[[:space:]]*=[[:space:]]*"22"' netlify.toml || die "netlify.toml: NODE_VERSION = \"22\" yo'q (Node 20 da login yiqiladi)"
grep -qE '^[[:space:]]*publish[[:space:]]*=[[:space:]]*"dist"' netlify.toml || die "netlify.toml: publish = \"dist\" yo'q"
N_FUNCS=$(ls netlify/functions/*.js 2>/dev/null | wc -l | tr -d ' ')
[ "$N_FUNCS" = "$EXPECTED" ] || die "netlify/functions: $N_FUNCS ta ($EXPECTED kutilgan)"
echo "NODE_VERSION 22, publish=dist, funksiyalar: $N_FUNCS"

if [ "$PROD" = 1 ]; then
  step "3. Production ruxsati va zaxira"
  [ "${FW_DEPLOY_CONFIRM:-}" = "HA-PRODUCTION" ] || die "FW_DEPLOY_CONFIRM=HA-PRODUCTION kerak (ataylab)"
  F="${FW_BACKUP_FILE:-}"
  [ -n "$F" ] && [ -s "$F" ] || die "FW_BACKUP_FILE — scripts/backup-before-deploy.sh yaratgan .dump fayl kerak"
  [ -s "$F.sha256" ] || die "$F.sha256 yo'q"
  (cd "$(dirname "$F")" && sha256sum -c --status "$(basename "$F").sha256") || die "zaxira fayli sha256 bilan mos emas"
  AGE=$(( $(date +%s) - $(stat -c %Y "$F") ))
  [ "$AGE" -le 86400 ] || die "zaxira 24 soatdan eski — yangisini oling"
  echo "zaxira: $(basename "$F") — sha256 mos, $((AGE / 60)) daqiqa oldin"
elif [ "$DRY" = 0 ]; then
  [ "${FW_DEPLOY_CONFIRM:-}" = "HA-PREVIEW" ] || [ "${FW_DEPLOY_CONFIRM:-}" = "HA-PRODUCTION" ] || die "FW_DEPLOY_CONFIRM=HA-PREVIEW kerak (preview ham Netlify'ga yuboriladi — ataylab)"
fi

step "4. Statik tekshiruv, testlar, build, artefakt"
if [ "$DRY" = 1 ]; then
  echo "(dry-run) npm run check && npm test && npm run build && node scripts/verify-netlify-artifact.mjs"
else
  npm run check
  npm test
  npm run build
  [ -f dist/index.html ] && [ -f dist/404.html ] || die "dist/ ildizida index.html / 404.html yo'q"
  LEAK=$(cd dist && find . -type f \( -name '*.sql' -o -name '*.md' -o -name '*.log' -o -name '.env*' \) | head -5)
  [ -z "$LEAK" ] || die "dist/ ichida ichki fayl: $LEAK"
  [ -n "${NL_TOOLS:-}" ] || die "NL_TOOLS kerak (@netlify/zip-it-and-ship-it + @netlify/config node_modules) — artefakt tekshiruvisiz deploy yo'q"
  node scripts/verify-netlify-artifact.mjs || die "artefakt tekshiruvi o'tmadi"
fi

step "5. Netlify CLI deploy ($([ "$PROD" = 1 ] && echo PRODUCTION || echo preview))"
ARGS=(deploy --build --json --message "powerful-pro-v24.5 $SHA")
[ "$PROD" = 1 ] && ARGS+=(--prod)
if [ "$DRY" = 1 ]; then echo "(dry-run) netlify ${ARGS[*]}"; echo "dry-run: barcha tekshiruvlar o'tdi"; exit 0; fi
OUT=$("${NETLIFY[@]}" "${ARGS[@]}")
# --build loglari JSON'dan oldin chiqishi mumkin — oxirgi JSON obyekt olinadi
read -r DEPLOY_ID URL < <(node -e 'const s=process.argv[1];const i=s.lastIndexOf("\n{");const j=JSON.parse(i>=0?s.slice(i+1):s);console.log(j.deploy_id, process.argv[2]==="1"&&j.url?j.url:j.deploy_url)' "$OUT" "$PROD")
[ -n "${DEPLOY_ID:-}" ] && [ -n "${URL:-}" ] || die "Netlify javobidan deploy_id/URL olinmadi"
echo "deploy $DEPLOY_ID → $URL"

step "6. Deploydan keyin tekshiruv"
FAIL=0
N=$("${NETLIFY[@]}" api getDeploy --data "{\"deploy_id\":\"$DEPLOY_ID\"}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log((j.available_functions||[]).length)})')
[ "$N" = "$EXPECTED" ] && echo "✅ funksiyalar: $N" || { echo "❌ funksiyalar: $N (kutilgan $EXPECTED)"; FAIL=1; }
H=$(curl -fsS "$URL/.netlify/functions/health" || true)
echo "$H" | grep -q '"ok":true' && echo "✅ health: ok" || { echo "❌ health: $H"; FAIL=1; }
HDR=$(curl -fsSI "$URL/" | tr -d '\r')
for k in Content-Security-Policy Strict-Transport-Security X-Frame-Options X-Content-Type-Options Referrer-Policy Permissions-Policy; do
  echo "$HDR" | grep -qi "^$k:" && echo "✅ $k" || { echo "❌ $k yo'q"; FAIL=1; }
done
NF=$(curl -s -o /dev/null -w '%{http_code}' "$URL/yoq-sahifa-$$" || true)
[ "$NF" = 404 ] && echo "✅ yo'q manzil → 404" || { echo "❌ yo'q manzil → $NF"; FAIL=1; }
[ "$FAIL" = 0 ] || { echo "⛔ deploydan keyingi tekshiruv o'tmadi — $([ "$PROD" = 1 ] && echo 'Netlify → Deploys → oldingi deploy → Publish (rollback), migratsiyani BOSHLAMANG' || echo 'production deploy qilmang')"; exit 3; }
[ "$PROD" = 1 ] && echo "Keyingi qadam (darhol): scripts/migrate-v24.5.sh --check, so'ng --apply (DEPLOY.md)"
echo "✅ deploy tekshiruvi o'tdi"
