# SPEC — Vitrinada ranglar (variantlar)

Holat: v25.6 · Qamrov: admin ichidagi vitrina (`js/dokon.js` — `SF`, `sfCard`, `sfShopHtml`, mahsulot sahifasi), Excel import.

## 1. Maqsad

Onlayn doʻkon kartasida mahsulotning ranglari koʻrinadi: rasm ostida rang nuqtalari, tanlangan rang — choʻziq «pill».
Rang almashganda rasm, narx, qoldiq va rangga bogʻliq maydonlar oʻzgaradi. Savatga aynan tanlangan rang tushadi.

## 2. Maʼlumot modeli

Omborda **har bir rang — alohida mahsulot yozuvi** (oʻz SKU, partiyalari, narxi, qoldigʻi). Shu sababli kirim, savdo,
qoldiq va hisob-kitob oʻzgarmaydi. Ranglar bitta kartaga `vgroup` orqali birlashadi.

Mahsulot yozuviga qoʻshilgan (hammasi ixtiyoriy) maydonlar:

| Maydon | Turi | Izoh |
|---|---|---|
| `vgroup` | matn (≤80) | Variant guruhi. Bir xil qiymat = bitta mahsulotning ranglari |
| `color` | `{name, hex}` | Rang nomi (≤40) va `#rrggbb` |
| `images` | `string[]` | Shu rangning rasmlari (`image` — birinchisi; avvaldan bor) |
| `video` | https havola | Galereyaning oxirgi elementi |
| `attrs` | `{kalit: qiymat}` | Rangga qarab oʻzgaradigan maydonlar («Kuzov rangi: Pushti») |

Vitrina uchun koʻrinish (`sfModel(p)`), saqlanmaydi — har safar hisoblanadi:

```
{ id, nom, brend, tavsif, kategoriya,
  variants: [{ pid, sku, rang:{nom,hex}|null, rasmlar[], video, narx, qoldiq, atributlar{} }] }
```

- `id` — guruh kaliti (`vgroup`) yoki, guruh boʻlmasa, mahsulot `id` si.
- **Orqaga moslik:** `vgroup` yoʻq mahsulot — bitta default variant (`rang: null`), kartada nuqtalar chiqmaydi.
- Sozlama `shop.settings.colorsSeparate` («Ranglarni alohida kartada koʻrsat»):
  yoqilgan — har rang oʻz kartasi (nuqtalarsiz); oʻchirilgan (standart) — bitta karta + nuqtalar.

## 3. Karta (roʻyxat)

- Rasm tepada (1:1, `object-fit`, lazy-load); ostida rang nuqtalari, nom, qisqa tavsif, rangga bogʻliq maydonlar (koʻpi 2 ta),
  narx, qoldiq, «Savatga» va oʻng pastda «›» (mahsulot sahifasi).
- Tanlangan rang — pill, qolganlari doira. Bosilganda karta shu rangga almashadi: rasm 200 ms fade, oʻlcham oʻzgarmaydi (sakrash yoʻq).
- Rasm ustida chapga/oʻngga surish — keyingi/oldingi mavjud rang.
- Qoldigʻi 0 rang — xira, `disabled`, yorligʻi «Tugagan».
- Guruhning hamma rangi tugagan boʻlsa — karta koʻrinmaydi (avvalgi qoida: qoldiqsiz mahsulot vitrinada yoʻq).
- Klaviatura: nuqtalar — `radiogroup`; Tab bilan kiriladi, ←/→ bilan rang almashadi; har biri `aria-label="Rang: …"`.

## 4. Mahsulot sahifasi

- Galereya: katta rasm + pastda 4 tagacha kichik rasm (tanlangani ramkada). Video boʻlsa — oxirgi oʻrinda, play belgisi bilan;
  bosilganda katta maydonda `<video controls>`.
- Rang tanlash: nuqta + nom; tanlanganda shu rangning rasmlari, SKU, narxi, qoldigʻi koʻrsatiladi.
- «Savatga qoʻshish» tanlangan rang (`pid`) bilan ketadi; savat va buyurtma qatorida rang nomi yoziladi (`item.color`).

## 5. Import (Kirim → Excel, Mahsulotlar → Excel)

- Mavjud 9 ustun (A–I) **oʻzgarmaydi**. Oxiriga 3 ta ixtiyoriy ustun qoʻshiladi: `Rang` (J), `Rang HEX` (K), `Variant guruhi` (L).
- Boʻsh katak — mavjud qiymat oʻzgarmaydi. `Rang HEX` notoʻgʻri boʻlsa (`#rrggbb` emas) — qator xatosi, hech narsa yozilmaydi.
- Eski (9 ustunli) fayllar avvalgidek import qilinadi.

## 6. Talablar

- Mobil birinchi (360–430 px), keyin desktop. Oflayn (sw.js) — avvalgidek; yangi tashqi resurs yoʻq.
- Barcha matnlar oʻzbekcha; foydalanuvchi maʼlumoti `esc()` orqali chiqariladi; rang faqat `#rrggbb` boʻlsa style'ga tushadi.

## 7. Qabul mezonlari (tests/p65-vitrina-ranglar.test.js)

1. Guruhdagi 3 rang — bitta karta, 3 nuqta; birinchi mavjud rang tanlangan (pill, `aria-checked=true`).
2. Nuqta bosilganda: rasm, narx, rang maydoni almashadi; karta balandligi oʻzgarmaydi; ←/→ ishlaydi.
3. Qoldigʻi 0 rang — `disabled`, «Tugagan»; bosilganda tanlov oʻzgarmaydi.
4. Savatga qoʻshish tanlangan rangning `pid` si bilan; buyurtma qatorida `color`.
5. Mahsulot sahifasi: 4 tagacha kichik rasm, tanlangani ramkada, video oxirida; rang almashsa SKU/narx/qoldiq almashadi.
6. Variantsiz eski mahsulot: nuqtasiz, `sfModel` — 1 ta variant, savat avvalgidek.
7. «Alohida karta» sozlamasi yoqilsa — har rang oʻz kartasi, nuqtalarsiz.
8. Import: `Rang`, `Rang HEX`, `Variant guruhi` oʻqiladi; sarlavhaning dastlabki 9 ustuni oʻzgarmagan; notoʻgʻri HEX — xato.

## 8. Qamrovdan tashqari

- Ommaviy sahifa (`/dokon`, `js/vitrina.js` + `shop-public`) — keyingi bosqich.
- Tigʻ tanlagich — kerak emas, qoʻshilmaydi.
