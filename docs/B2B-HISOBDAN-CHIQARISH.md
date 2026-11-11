# B2B hamkor tizimlar va hisobdan chiqarish (v23.6, 29-migratsiya)

Holat: kod, 29-migratsiya va testlar tayyor. **Production'ga qo'llanmagan** (NOT VERIFIED — real bazada va ikki haqiqiy saytda tekshirilmagan).

## Qarorlar (egasi tasdiqlagan, 2026-10-06)
| Savol | Qaror |
|---|---|
| Ikki ko'chirilgan tizim o'zaro ta'minot | To'liq qurish: havola orqali ulanish, ikki tomon tasdig'i, buyurtma, jo'natma, qabul tasdig'i |
| Kassa nomlari | «Firma kassasi» → **Bosh kassa** (brend nomi bilan); filialdagi yopiq kassa → **Shaxsiy kassa** |
| Mahsulotni arxivga | Ha — savdo va ro'yxatdan yashiriladi, tarixi saqlanadi, qaytarish mumkin |
| Hisobdan chiqarish zarari | Sof foydadan ayiriladi (hisobot, hamkorlar foydasi, kunlik hisob); kassaga tegmaydi |

## B2B — qanday ishlaydi
1. **Ulanish.** A: Ta'minotchilar → «Hamkor tizimlar (B2B)» → «Taklif kodi yaratish» (7 kun, bir martalik). B: «Kodni kiritish».
   B serveri A serveriga murojaat qiladi; har tomon o'z kirish kalitini yaratadi va **faqat SHA-256 xeshini** saqlaydi.
2. **Ikki tomon tasdig'i.** A egasi ulanishni tasdiqlaydi (B kodni kiritib tasdiqlagan). Ikkala tomon tasdiqlamaguncha katalog,
   buyurtma, jo'natma — yopiq. «To'xtatish» va «Uzish» hamkorga ham xabar qilinadi.
3. **Ruxsatlar (har tomon o'zi beradi):** «U menga ta'minotchi», «Men unga ta'minotchiman», «Katalogimni ko'ra oladi»,
   «Menga buyurtma bera oladi»; hamkorni bizdagi **ta'minotchi** (u bizga yetkazsa) va **mijoz** (biz unga yetkazsak) yozuviga bog'lash.
4. **Katalog:** hamkor omboridagi mahsulotlar, qoldiq va opt (diller) narxi; omborda yo'q, lekin «ta'minotchidan sotiladi» belgili
   mahsulot — **«Buyurtma bo'yicha»**. «+ katalogimga» — mahsulot sizda «ta'minotchidan sotiladi» belgisi bilan ochiladi: omborda yo'q
   bo'lsa ham sotasiz, keyin hamkordan buyurtma qilasiz.
5. **Buyurtma → tasdiq → jo'natma.** Ta'minotchi soni va narxni tasdiqlaydi; jo'natilganda tovar uning omboridan (FIFO) chiqadi.
6. **Qabul (sonini tekshirib).** Xaridor har qator uchun **kelgan sonni** kiritadi va mahsulotga moslaydi (yoki yangi mahsulot):
   omborga kirim + ta'minotchi qarzi — faqat kelgan son bo'yicha. Ta'minotchi tomonida mijoz qarzi ham **faqat qabul qilingan son**
   bo'yicha yoziladi; kelmagan qismni ta'minotchi «Kelmaganini omborga qaytarish» bilan qaytaradi.
7. **Tarmoq uzilsa:** amal saqlanadi, «Qayta yuborish» bilan yetkaziladi; har xabar bir marta qo'llanadi (takror — o'sha natija).

## Xavfsizlik
- Hamkor manzili faqat `https://domen` (IP, localhost, port, yo'l — rad), qayta yo'naltirish rad, 8 s vaqt chegarasi, javob ≤ 512 KB.
- Kalitlar va xeshlar faqat `b2b_links` jadvalida (RLS, faqat `service_role`); brauzerga hech qachon berilmaydi.
- Ulanishni faqat **egasi** boshqaradi; savdo amallari — `b2b.order` (buyurtma, qabul), `b2b.ship` (tasdiq, jo'natma).
- Hamkordan kelgan barcha matn (nom, mahsulotlar) ekranlanadi; rasm faqat `https://`.
- Sayt manzili: Netlify `URL` (yoki `B2B_SELF_URL`).

## Hisobdan chiqarish
Qaytarishlar → «Hisobdan chiqarish»: sabab (buzilgan, muddati o'tgan, singan, yo'qolgan, boshqa), davr (bugun, 10 kun, oy, hammasi),
hujjatlar va bekor qilish. Ombor (FIFO) va hujjat serverda bitta tranzaksiyada (`stock_writeoff_atomic`), zarar = tannarx × soni —
**serverda** hisoblanadi. Bekor qilish — aynan o'sha partiyalarga qaytaradi. Ruxsat: `ombor.writeoff` (yoki `ombor.edit`).

## Dalillar
- `tests/p23-b2b-hisobdan-chiqarish.test.js` — ikki alohida PostgreSQL (PGlite) + haqiqiy server funksiyalari: 3/3; mutatsiya nazorati.
- `tests/p24-b2b-mahsulot-ui.test.js` — brauzer: tashqi matn xavfsiz, qabul qoidalari, mahsulot kartochkasi: 3/3; mutatsiya nazorati.
- `tests/evidence/writeoff-b2b-real-postgres.js` (PostgreSQL 16, parallel) — 10/10.
- `tests/evidence/migration-chain-rehearsal.js` — production nusxasi 24→29, verify 55/55.

## Ochiq qolgan
- Ikki **haqiqiy** sayt orasida (internet orqali) sinov — NOT VERIFIED (testlarda tarmoq test ichida yo'naltiriladi).
- B2B to'lovlari (hamkorga pul o'tkazish) — mavjud «Ta'minotchiga to'lov» / «Qarz to'lovi» orqali, avtomatik sinxron emas.
