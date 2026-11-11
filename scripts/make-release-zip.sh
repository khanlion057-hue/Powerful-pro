#!/usr/bin/env bash
# Powerful PRO — FINAL ZIP yaratish (v24.5; v23.10.2 skriptidan). Faqat Git'dagi commit qilingan fayllar (`git archive`):
# node_modules/, .git/, .env*, *.log, logs/, backups/, dist/ ZIP'ga tushmaydi (qo'shimcha tekshiriladi — topilsa rad).
# ZIP — BITTA root papka (standart `powerful-pro-v24.5/`): ochilgach shu papka ICHIDAN CLI bilan deploy qilinadi
# (scripts/deploy-netlify.sh). ZIP'ni yoki papkani Netlify'ga sudrab tashlash TAQIQLANADI (funksiyalar chiqmaydi, "/" 404).
# Ichida: RELEASE (commit, sana — export-subst) va RELEASE-MANIFEST.sha256 (har fayl xeshi) — git'siz papkadan deploy
# qilinganda deploy skripti fayllar o'zgarmaganini shu bilan tekshiradi. ZIP yonida: <zip>.sha256.
#   scripts/make-release-zip.sh <chiqish.zip>
#   FW_ZIP_ROOT=boshqa-nom scripts/make-release-zip.sh <chiqish.zip>   # root papka nomi ([A-Za-z0-9._-])
set -euo pipefail
cd "$(dirname "$0")/.."
[ -n "${1:-}" ] || { echo "⛔ chiqish .zip yo'li kerak"; exit 2; }
OUT="$1"
ROOTDIR="${FW_ZIP_ROOT:-powerful-pro-v24.5}"
case "$ROOTDIR" in ''|.|..|*[!A-Za-z0-9._-]*) echo "⛔ FW_ZIP_ROOT noto'g'ri"; exit 2;; esac
command -v zip >/dev/null || { echo "⛔ zip topilmadi"; exit 2; }
[ -z "$(git status --porcelain)" ] || { echo "⛔ commit qilinmagan o'zgarishlar bor"; exit 2; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir "$TMP/$ROOTDIR"; R="$TMP/$ROOTDIR"
git archive --format=tar HEAD | tar -x -C "$R"
grep -q '^commit=[0-9a-f]\{7,\}$' "$R/RELEASE" || { echo "⛔ RELEASE to'ldirilmadi (.gitattributes export-subst)"; exit 2; }
[ -f "$R/index.html" ] && [ -f "$R/404.html" ] && [ -f "$R/netlify.toml" ] || { echo "⛔ index.html / 404.html / netlify.toml root papkada emas"; exit 2; }
BAD=$(cd "$R" && find . \( -name node_modules -o -name .git -o -name logs -o -name backups -o -name dist -o -name '.env*' -o -name '*.log' \) ! -name .env.example -print | head -5)
[ -z "$BAD" ] || { echo "⛔ relizga tushmasligi kerak bo'lgan fayl Git'da: $BAD"; exit 2; }
(cd "$R" && find . -type f ! -name RELEASE-MANIFEST.sha256 | sed 's|^\./||' | LC_ALL=C sort | xargs -d '\n' sha256sum > RELEASE-MANIFEST.sha256)
INFO="$(tr '\n' ' ' < "$R/RELEASE")— $(wc -l < "$R/RELEASE-MANIFEST.sha256") fayl manifestda, $(ls "$R"/netlify/functions/*.js | wc -l) funksiya, root papka: $ROOTDIR/"
rm -f "$OUT" "$OUT.sha256"; OUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
(cd "$TMP" && zip -q -r -X "$OUT_ABS" "$ROOTDIR")
(cd "$(dirname "$OUT_ABS")" && sha256sum "$(basename "$OUT_ABS")" > "$(basename "$OUT_ABS").sha256")
echo "✅ $OUT — $INFO; sha256: $(cut -c1-16 "$OUT_ABS.sha256")…"
