# Kichik oynalar 2.0 va yozuvlar 90% (v23.5)

Holat: kod va testlar tayyor. Baza, server va biznes qoidalari **o'zgarmagan** (migratsiya yo'q). Production'ga deploy qilinmagan.

## Nima o'zgardi
| Qism | Endi |
|---|---|
| Matn o'lchami | Standart **90%** (html zoom). Sozlamalar → «Matn o'lchami»: 80/90/100/110/120/130%. Tanlov qurilmada saqlanadi. Admin, sotuvchi, diller — bir xil |
| Kichik oynalar (barcha `modal()`) | Telefonda pastdan chiquvchi varaq, kompyuterda markazda; sarlavha va tugmalar yopishqoq; sarlavhada rangli ikonka; bo'lim rangi (`data-pg` → `--acc`); belgilash — kalitli kartochka; yozuvlar KATTA HARF emas |
| Bo'lim ranglari | Mijozlar ko'k · Ta'minotchilar to'q sariq · Hamkorlar binafsha · Dillerlar havorang · Sotuvchilar indigo · Rollar pushti · Kassalar/Savdo yashil · Firma kassasi qum · Xarajatlar qizil · Mahsulot/Ombor binafsha · Kirim/Hisobot havorang · Do'kon pushti |
| Qo'shish/tahrirlash | Mijoz, ta'minotchi, hamkor, diller, xodim — shaxs kartasi (qarz, «To'lov», «Tarix»), bo'limlar, «Qarz tuzatish» alohida va izohli |
| To'lov oynalari | Mijoz / ta'minotchi / diller: kassa — qoldig'i ko'rinadigan kartochkalar (+ Firma kassasi), «Hammasi/50%/25%», to'lovdan keyingi qarz, ortiqcha — ogohlantirish; **valyuta almashsa summa avtomatik o'giriladi** |
| Kassa amali | Kassa kartasi (qoldiq), summa birligi bilan |
| Parol | Yashirin + ko'rsatish + kuchli parol yaratish (10 belgi, `crypto.getRandomValues`, hech qayerga yozilmaydi) |
| Diller portali | Ombor: qidiruv, rasm, qoldiq belgisi, jami qiymat; «Sotdim» — ± tugmalar, jami summa |
| Sotuvchi portali | Qarz qabul qilish: valyuta o'girish, tezkor summa, qolgan qarz; tungi rejimda oq maydonlar tuzatildi |

## Yordamchilar (`js/main.js`)
`meCard`, `meSec`, `meField`, `meAmt`, `meSw`, `mePass`, `meBoxPick` (yashirin input — eski kod `.value` bilan o'qiydi), `meBoxOpts`, `meCurSwap`, `meFill`, `meFillChips`, `meRemain`, `meActs`. Bezak — `fwModalDecorate` (`js/shared.js`, faqat DOM orqali).

## Dalillar
- `npm test` — 171/171 (P22 — 6, P4 90% testi — 1). P22 mutatsiya bilan tekshirilgan.
- XSS smoke 0; gorizontal siljish yo'q (360/390/1280, 90%).
- Haqiqiy telefon (iOS Safari / Android Chrome) — NOT VERIFIED (Chromium emulyatsiyasi).

## Tuzatilgan xato
Ta'minotchini tahrirlashda «Mamlakat» qiymati HTML'ga ekranlanmasdan qo'yilardi.
