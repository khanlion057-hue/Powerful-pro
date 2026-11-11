# POWERFUL GROUP — Android ilova (APK)

Bu — saytni (https://powerful-pro.netlify.app) to'liq ekranda ochadigan Android ilova (Trusted Web Activity).
Ilova ichida sayt Chrome orqali ishlaydi: barcha yangilanishlar saytga deploy qilingan zahoti ilovada ham bo'ladi —
APK'ni qayta o'rnatish shart emas. Chrome bo'lmagan telefonda ichki WebView bilan ochiladi.

## Yig'ish
```bash
export ANDROID_HOME=/path/to/android-sdk          # platforms;android-35, build-tools;35.0.0
export PG_KEYSTORE=/path/to/powerful-release.jks  # imzo kaliti (GitHub'da YO'Q — o'zingizda saqlang)
export PG_KEYSTORE_PASS=...                       # kalit paroli
cd android && gradle assembleRelease
# natija: app/build/outputs/apk/release/app-release.apk
```

## Muhim
- **Imzo kaliti (`powerful-release.jks`) va parolini yo'qotmang.** Ilovaning keyingi versiyalari faqat shu kalit bilan
  imzolansa, telefonlarda ustidan yangilanadi. Kalit GitHub'ga yuklanmaydi (`.gitignore`).
- Saytdagi `/.well-known/assetlinks.json` ilova bilan sayt bog'liqligini tasdiqlaydi (manzil satri ko'rinmaydi).
  Undagi `sha256_cert_fingerprints` — shu kalitning barmoq izi. Kalit almashsa, uni ham yangilang.
- Yangi versiya: `app/build.gradle` da `versionCode` ni 1 ga oshiring.
