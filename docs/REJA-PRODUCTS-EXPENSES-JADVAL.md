# Reja: `products` va `expenses` ni alohida jadvallarga ko'chirish (Y2, keyingi bosqich)

> Holat: **faqat reja** — kod o'zgartirilmagan. 37-migratsiya (optimistik qulf) hozirgi xavfni yopadi:
> eski nusxa bilan yozuv 409 oladi va brauzer yangilab qayta yuboradi. Lekin butun mahsulotlar ro'yxati
> va filial xarajatlari hamon bitta JSON qatorida (`app_data.data.products`, `app_data_branches.data.expenses`).
> Natijada bitta mahsulotni tahrirlash butun qatorni qayta yozadi va 409 tez-tez bo'ladi (ko'p xodim bir vaqtda ishlasa).

## Nega ko'chirish kerak
- **Poyga:** har saqlash butun ro'yxatni yozadi — qulf bor, lekin ziddiyat ko'p (ayniqsa savdo vaqtida `branchDebt` o'zgarganda).
- **Hajm:** 2000+ mahsulot bo'lsa har saqlashda yuzlab KB yuboriladi.
- **Maxfiylik:** tannarx maydonlari (`dsCostUsd`) JSON ichida — har javobda filtrlash kerak (K2). Ustunli jadvalda — ustun darajasida.
- **Audit:** qator darajasida kim, qachon, nimani o'zgartirgani — oddiy trigger bilan.

## Jadvallar (taklif)
| Jadval | Asosiy ustunlar | Izoh |
|---|---|---|
| `products` | `id bigint pk` (hozirgi `p.id`), `sku unique`, `name`, `unit`, `cat`, `brand`, `markup_pct`, `opt_markup_pct`, `direct_sale bool`, `ds_supp_id`, `ds_cost_usd`, `archived bool`, `extra jsonb` (qolgan maydonlar), `version bigint`, `updated_at`, `updated_by` | Narx bazada hisoblanadi: `product_prices(filial)` ko'rinishi (FIFO tannarx × ustama) — sotuvchi faqat shu ko'rinishni oladi |
| `expenses` | `id text pk` (hozirgi `e.id`), `filial`, `date`, `cat`, `kind`, `turi`, `amt_usd`, `amt_native`, `cur`, `box_id`, `partner_id`, `note`, `staff_id`, `created_at`, `deleted_at` | Hamkor turidagi xarajat → `partners.invested` trigger orqali (hozirgi `partnerExpenseDelta` mantiqi SQL'ga) |

## Bosqichlar (har biri alohida migratsiya, takror xavfsiz)
1. **38-migratsiya — jadval va soya yozuv.** Jadvallar yaratiladi; JSON'dagi ma'lumot bir martalik ko'chiriladi (`on conflict do nothing`).
   `app-data-save` / `app-data-branch-save` JSON'ga yozishda davom etadi **va** o'zgargan qatorlarni jadvalga ham yozadi (soya).
   Tekshiruv funksiyasi (`products-shadow-check`) farqni jurnalga yozadi — `batches` (P3-3) bilan bir xil yo'l.
2. **Server API.** `products-ops` (create / update / archive — bitta qator, `version` bilan), `expense-ops` (add / edit / delete).
   Ruxsatlar: hozirgi `mahsulotlar.*`, `xarajatlar.*`. Brauzer butun ro'yxatni emas, faqat amalni yuboradi.
3. **Klient o'tishi.** `js/main.js`, `js/sotuvchi.js`: mahsulot/xarajat oynalari yangi API'ga; ro'yxat `app-data-load` javobida
   jadvaldan yig'iladi (shakl o'zgarmaydi — eski kod buzilmaydi). Bir necha kun soya + tekshiruv natijasi kuzatiladi.
4. **39-migratsiya — JSON'dan yozish to'xtatiladi.** `filterTopLevelChanges` / `filterBranchChanges` `products` va `expenses` kalitlarini
   endi rad etadi (409 «sahifani yangilang»); JSON nusxa faqat o'qish uchun qoladi (zaxira), keyinroq tozalanadi.

## Xavf va qaytarish
- Har bosqich alohida va qaytariladigan: 1–3 bosqichda JSON asosiy manba bo'lib qoladi.
- Ko'chirishdan oldin to'liq zaxira (`scripts/backup-before-deploy.sh`), keyin `products` soni va yig'indi tekshiruvi (verify SQL).
- Diller katalogi (`catalog_products`) va onlayn do'kon mahsulotlarni `app_data`dan o'qiydi — 3-bosqichda ular ham jadvalga o'tadi.

## Egasidan kerak bo'ladigan qarorlar (keyingi bosqich boshlanishidan oldin)
- Mahsulotni o'chirish: faqat arxivlash (hozirgidek) yoki haqiqiy o'chirish ham?
- Xarajat tahriri muddati: savdo tahriri kabi cheklov (31-migratsiya) xarajatlarga ham qo'llansinmi?
