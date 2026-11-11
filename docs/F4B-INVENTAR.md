# F4b — mijoz qarzi, ta'minotchi qarzi va ombor qoldig'i: SERVER HAQIQIY MANBA

Holat (v23.2, 2026-10-06): **TUZATILDI — lokal dalil bilan** (27-migratsiya + server funksiyalari + brauzer kodi).
Production'ga qo'llanmagan va deploy qilinmagan (`DEPLOY.md`).

## Model
**Avval:** brauzer qarz va `sold/qty` ni hisoblab, JSON (`app_data_branches.data`) sifatida saqlardi; server to'lov chegarasini
shu eskirgan JSON'dan tekshirardi. **Endi:** brauzer faqat amalni so'raydi → server bazada BITTA tranzaksiyada bajaradi →
haqiqiy qiymatni qaytaradi → brauzer faqat ko'rsatadi.

| Qiymat | Haqiqiy manba (SQL) | Yozish yo'li | Jurnal (o'zgarmas) |
|---|---|---|---|
| Mijoz qarzi (so'm) | `customer_balances.debt` | `_cust_debt_move` (qator qulfi) | `customer_debt_ledger` |
| Ta'minotchi qarzi ($), jami to'langan | `supplier_balances.debt`, `total_paid` | `_supp_debt_move` | `supplier_debt_ledger` |
| Partiya `qty/sold/status/tannarx` | `batches` | `_stock_move`, `_batch_insert`, FIFO `_stock_fifo_out` | `stock_ledger` |
| Savdo hujjati (qaytarish/tahrir uchun) | `sales` (`local_id`) | `sale_*_atomic` | `ledger_ops` (idempotent natija) |
| Filialning Bazaga tovar qarzi | `app_data.branchDebt` | faqat SQL (sotuvda), brauzer saqlashi bu kalitni yozmaydi | stock_ledger orqali iz |

Boshqa yo'l bilan yozish **trigger bilan rad etiladi** (`customer_balances_guard`, `supplier_balances_guard`, `batches_guard`).
JSON'dagi `debt`, `paid`, `qty`, `sold`, `status`, `costUsd` va savdo summalari — faqat ko'rinish nusxasi: saqlashda ham,
yuklashda ham bazadagi qiymat bilan almashtiriladi (`_lib/ledgerAuthority.js`); farq bo'lsa — `ledger_value_override_ignored` audit yozuvi.

## Yozish yo'llari → yangi server yo'li

| Brauzer funksiyasi | Avval (brauzer hisoblardi) | Endi (server hisoblaydi) |
|---|---|---|
| `_savdoCommitInner` (admin savdo) | `deductFIFO`, `c.debt +=`, konsignatsiya qarzi | `sale-checkout-atomic` → `sale_checkout_atomic_v3` (FIFO, konsignatsiya, to'g'ridan-to'g'ri ta'minotchi, mijoz qarzi, filial qarzi, kassa) |
| `svFinishSale` (sotuvchi savdo) | faqat kassa (`cashbox-ops sale`) + JSON — SQL omborga TEGMASDI | `sale-checkout-atomic` (admin bilan bir xil) |
| `doSaleReturn` | yangi partiya, `c.debt -=`, `supp.debt -=` | `sale-ops return` → `sale_return_atomic` (serverdagi savdo yozuvidan) |
| `deleteSale` | partiyalar, `c.debt -=`, kassa | `sale-ops void` → `sale_void_atomic` |
| `saveSaleEdit` / `saveEditSale` / `svSaveSaleEdit` | FIFO/partiya, qarz | `sale-ops edit` (`replace` / `delta` / `price`) → `sale_edit_atomic` |
| `payDebt`, `svConfirmPay` | `c.debt -=` (JSON) | `cashbox-ops cust_debt_pay` → `cash_payment_atomic_v2` (qarz qatori qulflanadi, ortiqcha — rad, kassa ham bekor) |
| `paySupplierDebt` | `s.debt -=`, `s.paid +=` | `cashbox-ops supp_pay` → `cash_payment_atomic_v2` |
| `saveCust` / `saveEditCustomer` (qarz) | `c.debt = kiritilgan` | `stock-debt-ops cust_set` (ruxsat: `mijozlar.edit`, jurnal: opening/adjust) |
| `saveSupp` / `saveEditSupplier` (qarz) | `s.debt = kiritilgan` | `stock-debt-ops supp_set` (ruxsat: `taminotchilar.edit`) |
| `_kirimSaveCore`, `importBatchXlsx` | partiyalar, `supp.debt +=` | `stock-debt-ops batches_create` (kirim/import; "to'langan" summa kassa/Firma kassa jurnalidan oshmaydi) |
| `saveOpeningStock` | partiyalar | `batches_create` (opening) |
| `saveBatchEdit`, `saveBatchGroupEdit` | `qty`, tannarx, `supp.debt` farqi | `batch_edit` (farq bazadagi qiymatdan; sotilgandan kam bo'lmaydi) |
| `deleteBatch`, `deleteBatchGroup` | JSON'dan o'chirish | `batch_delete` (holat `deleted`, tarix saqlanadi) |
| `confirmArrival` | `transit → active`, tannarx | `batch_arrive` |
| `saveRevision` | tizim qoldig'i brauzerda, `deductFIFO` | `revision` (tizim qoldig'i SERVERDA) |
| `transferItemsToBranch` | Baza `deductFIFO`, filial partiyasi | `stock_out transfer` (ikki filial bitta tranzaksiyada) |
| `sendToDealer`, `approveDealerOrder`, `svApproveOrder` | `deductFIFO` | `stock_out dealer` |
| `doDealerReturn` | partiya | `batches_create` (dealer_return) |
| `_batchesShadowSync` | brauzer `qty/sold` ni SQL'ga upsert qilardi (F4b-A) | 27 dan keyin chaqirilmaydi; server bu endpoint orqali qoldiqni yozmaydi |

Eski (yangilanmagan) brauzer: savdo va savdoni tuzatish kassasi (`cashbox-ops` `sale` / `sale_fix`) 27 dan keyin 409 —
"sahifani yangilang". Shu bilan eski kod omborsiz/qarzsiz pul harakati qila olmaydi.

## Avvalgi 4 ta qayta hosil qilingan muammo — hozirgi natija
`node tests/evidence/f4b-gap-evidence.js` (haqiqiy server funksiyalari + PostgreSQL): **5/5 TUZATILGAN**.
Eski v23.1 kodida xuddi shu skript — 4/4 QAYTA HOSIL QILINADI (negativ nazorat).

| # | Ssenariy | v23.1 | v23.2 |
|---|---|---|---|
| A | Eski brauzer nusxasi `sold=0` yuboradi, keyin 3 dona savdo (partiya 3, 2 sotilgan) | 5 dona sotildi | `sold=2` o'zgarmadi; savdo rad |
| B | Mijoz qarzi 600 000, 2×400 000 | ikkalasi qabul | 2-si rad (qoldiq 200 000) |
| C | Ta'minotchi qarzi 100$, 2×80$ | 160$ chiqdi | 2-si rad, 80$ chiqdi |
| D | SQL qarz jadvallari | yangilanmaydi | haqiqiy manba |

Haqiqiy parallellik (ko'p ulanish, PostgreSQL 16): `tests/evidence/f4b-real-postgres.js` — 16/16.

## Qolgan (F4b doirasidan tashqari, shu sinfdagi)
- Diller ombori (`dealerStock` / `dealer_stock.qty`) va diller savdosidagi diller qarzi — B2B moduli, brauzer hisoblaydi.
- Hamkor `invested` — brauzerda.
- Mijozning "jami xaridi" (`total`) — statistika, brauzerda.
- Xarajat yozuvi (JSON) va uning kassa harakati (SQL) — ikki alohida yozuv (qarz/ombor emas).
