# Firma kassasi — asosiy kassa (v23.4)

Holat: kod, 28-migratsiya va testlar tayyor. **Production'ga qo'llanmagan** (NOT VERIFIED — real bazada tekshirilmagan).

## Qaror (2026-10-06, egasi tasdiqlagan)
| Savol | Qaror |
|---|---|
| «Uyga berish» (kunlik yopish) | Pul tizimdan **chiqmaydi**: filial kassasidan **Firma kassasiga** o'tadi |
| Filial kassalari | Har filial o'z kassalariga ega; asosiy kassaga (Firma kassasi) pul yuboradi |
| Firma kassasidan to'lov | Xarajatlar, Kirim (import) to'lovi, ta'minotchi qarzi, hamkor/ta'sischiga to'lov |

## Pul yo'llari
| Amal | Avval | Endi |
|---|---|---|
| Kunlik yopish | filial kassasi → tizimdan tashqari («uyga») | filial kassasi → **Firma kassasi** (`firma-kassa: daily_close`, ikkala tomon bitta tranzaksiyada — `branch_firma_transfer`). Ruxsat: `kassalar.transact` yoki `firma_kassa.transact`, faqat o'z filiali |
| Xarajat | faqat filial kassasidan | filial kassasi **yoki Firma kassasi** (`expense`). Ruxsat: `firma_kassa.transact` + `xarajatlar.create`. Hamkor kirimi — Firma kassaga kirim |
| Xarajatni o'chirish | filial kassasiga qaytariladi | Firma kassadagi xarajat — `expense_reverse` (Firma kassaga qaytariladi). Umumiy «Bekor qilish» xarajatni rad etadi (xarajat yozuvi bilan nomuvofiqlik bo'lmasin) |
| Xarajatni tahrirlash | summa/kassa o'zgaradi | Firma kassadagi xarajat — faqat kategoriya/izoh; summani o'zgartirish uchun o'chirib qayta kiritiladi |
| Ta'minotchi qarzi | filial kassasidan | **Firma kassasidan ($ yoki so'm)** — `firma_supplier_pay`: kassa va qarz jurnali **bitta tranzaksiyada**; qarzdan ortiq yoki kassada yetmasa — rad; so'm — `settings.usdUzs` kursi bo'yicha. Ruxsat: `firma_kassa.transact` + (`taminotchilar.edit` yoki `kirim.create`) |
| Kirim (import) to'lovi | Firma kassasi bor edi | o'zgarmadi |
| Hamkorga to'lov | Firma kassa sahifasida bor edi | o'zgarmadi |

## Bosh sahifa — 4 kartochka
| Kartochka | Oyna |
|---|---|
| Qoldiq | Mahsulotlar: ombor tannarxda va sotuv narxida, Barcha / Kam / Mavjud emas, jami dona, Mahsulot qo'shish, QR, skaner, qidiruv, ro'yxat |
| Qarzlar | Umumiy qarz, qarzga sotuv / qarzdorlar / yopilgan, To'lash, Qarz, davr (Ochiq/Bugun/Kecha/Oy), Sotuvlar · Mijozlar · Yopilishlar |
| Tushumlar | Davr bo'yicha tushum, yozuvlar / bekor qilingan (qaytarish) / o'rtacha, Tushum qo'shish, Statistika, tarix |
| Xarajatlar | Davr xarajatlari, yozuvlar / bekor qilingan / o'rtacha, Firma kassadan qismi, Xarajat qo'shish, Kategoriyalar, tarix |

«Jami pul» oynasi (Kassalar → «Jami pul»): filial kassalari + Firma kassasi qoldig'i, «Kunlik yopish → Firma kassasi».

## Dalillar
- `tests/p21-firma-kassa-asosiy.test.js` (PGlite + haqiqiy server funksiyasi) — 4/4; mutatsiya nazorati (ruxsat va qarz rejimi buzilsa FAIL).
- `tests/evidence/firma-kassa-real-postgres.js` (PostgreSQL 16, parallel) — 11/11.
- `tests/evidence/migration-chain-rehearsal.js` — production nusxasi 24→28, verify 50/50.
- P16 — kunlik yopish testi yangi qoidaga moslandi (eski «home_withdrawal» yo'li endi ishlatilmasligi tekshiriladi).

## Ochiq qolgan
- Har filialdagi «Powerful kassa» (eski `qobiljon` turidagi kassa) **o'zgartirilmadi** — u filial kassasi sifatida qoladi. Uni olib tashlash yoki qoldig'ini Firma kassasiga ko'chirish — alohida qaror (mavjud funksiyani o'zgartiradi).
- Eski kunlik yopishlar (v23.4 gacha) tarixda «→ uyga (eski tartib)» deb ko'rsatiladi; ularning puli Firma kassasiga qayta yozilmaydi.
