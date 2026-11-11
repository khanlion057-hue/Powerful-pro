# Arxitektura: investor-hamkorlar va B2B savdo hamkorlari (v23)

Holat: **IMPLEMENTED** — investor-hamkorlar (filial bo'yicha). **NOT IMPLEMENTED (ataylab)** — B2B 2.0 jadvallari, investor/B2B qidiruvi, CRM, lead, pipeline.

## 1. Ikki xil "hamkor" — ikki xil domen

| | Investor / ta'sischi (mavjud) | B2B savdo hamkori (kelajak) |
|---|---|---|
| Kim | Korxonaga (yoki filialga) pul qo'ygan sherik, ta'sischi | Biz bilan savdo qiladigan tashqi korxona (ulgurji xaridor, konsignatsiya oluvchi) |
| Nima kuzatiladi | Ulush (SUMMA), oylik foyda taqsimoti, kirim/chiqim | Buyurtma, jo'natma, konsignatsiya, qarz, to'lov |
| Pul oqimi | Foyda **taqsimoti** (xarajat emas) | Savdo **daromadi** va debitorlik |
| Haqiqiy manba | `app_data.partners`, `app_data.partnerPeriods` (JSON) | `b2b_*` SQL jadvallari (hali yo'q) |
| Ilovadagi bo'lim | "Hamkorlar" | Hozircha: Dillerlar, Konsignatsiya, Direct Sale |

Bu ikkisi **bitta jadvalda aralashtirilmaydi**. Investor B2B xaridor bo'lishi mumkin, lekin bu ikki alohida yozuv bo'ladi (bog'lash kerak bo'lsa — `b2b_partners.investor_partner_id`, ixtiyoriy).

## 2. Investor-hamkorlar — joriy qoidalar (o'zgarmagan)
- Ulush = "foyda uchun hisob" (oy boshidagi hisob − oyda olganining yarmi).
- **keepPct**: oddiy hamkor ulushidan ta'sischilarga qoladigan qism. **founderPct**: ta'sischilar o'rtasidagi ulush (yig'indi 100%, yoki teng).
- Kechiktirilgan kirim: oyning 1–5-sanasida qo'shilsa — keyingi oydan, 6-sanadan keyin — bir oy o'tkazib.
- Oylar ketma-ket yopiladi. Faqat oxirgi oyni tahrirlash yoki bekor qilish mumkin. Tarix va chop etish bor.
- Hamkorga to'lov Firma kassasidan qilinadi (`partner_withdrawal`, faqat egasi, faqat Baza hamkorlari).

### v23 o'zgarishi: har bir filialning o'z investorlari
Egasining qarori: *filial o'z balansini, hisob-kitobini, investorlari va mijozlarini o'zi yuritadi.*
- Har bir hamkor va oylik taqsimotga `filial` maydoni qo'shildi. Maydon yo'q bo'lsa — `'baza'`, shuning uchun mavjud 3 ta hamkor Bazada qoladi.
- "Hamkorlar" bo'limi har bir filialda ochiladi va faqat shu filial hamkorlarini ko'rsatadi. Foyda — shu filial savdosi minus do'kon xarajatlari.
- Server (`appDataGuard.makeBranchScopedFilter`): admin bo'lmagan xodim faqat **o'z filiali** hamkorlari va oylarini qo'sha, o'zgartira yoki o'chira oladi.
- Filial va Baza o'rtasidagi aloqa faqat ikkita:
  1. **Tovar qarzi** (Bazadan olingan tovar) → "Bazaga to'lov" (B7, `branch_firma_transfer`).
  2. **Pul qarzi** (filial zarar ko'rib, xarajatga Bazadan qarz oladi) → `branch_firma_loan` (berish — Firma kassa huquqi bilan; qaytarish — kassir ham bajara oladi).

### Yagona haqiqiy manba
- **JSON** (`app_data.partners`, `partnerPeriods`) — haqiqiy manba. Ilova va server faqat shuni ishlatadi.
- SQL jadvallari `partners`, `partner_ledger`, `partner_periods`, `partner_payments` va `partner_*_atomic` funksiyalari **ishlatilmaydi**. 25-migratsiya ularni `COMMENT ... ESKIRGAN` deb belgilaydi va brauzer ruxsatlarini oladi. O'chirilmaydi: productionda 3 qator bor, kelajakdagi ko'chirish uchun saqlanadi.
- Productionda tekshirildi (read-only, 2026-10-02): JSON'da 3 ta hamkor, SQL'da 3 ta; `filial` maydoni hali yo'q (= Baza).

## 3. Kelajak: B2B savdo hamkorlari 2.0 (faqat reja — jadval YARATILMAGAN)
Bo'sh jadvallar yaratilmadi (talab: "no empty tables"). Nomlar oldindan band qilingan — `b2b_` prefiksi investor domeni (`partner_`) bilan to'qnashmaydi.

| Nomlar (rezerv) | Vazifa | Bog'lanish |
|---|---|---|
| `b2b_partners` | Tashqi korxona kartasi: INN, shartnoma, kredit limiti, to'lov muddati, filial | `filial` (RLS), ixtiyoriy `investor_partner_id` |
| `b2b_partner_orders` (+ `_items`) | Buyurtma: holat (draft → confirmed → fulfilled → closed), narx-navo | `b2b_partners.id` |
| `b2b_consignment_batches` | Konsignatsiyaga berilgan partiya, qaytish va sotilgan qismi | `batches.local_id`, `b2b_partners.id` |
| `b2b_fulfillment_requests` | Ombordan jo'natish so'rovi, yig'ish va topshirish | buyurtma, filial ombori |
| `b2b_partner_ledger` | Debitorlik jurnali (o'zgarmas, faqat qo'shiladi) | buyurtma, to'lov |
| `b2b_partner_payments` | To'lovlar — **cashbox-ops orqali** (`kind='b2b_pay'`, `cash_payment_atomic` naqshi) | `cashbox_ledger.group_key` |
| `crm_prospects` | Potentsial mijoz/hamkor (lead) — **alohida modul, hozir emas** | — |

Tamoyillar (`cashbox_ledger` va `firma_kassa_ledger` bilan bir xil):
1. Har bir pul harakati — server RPC, bitta tranzaksiya, `idem_key`.
2. Jurnallar o'zgarmas: tuzatish faqat teskari yozuv bilan.
3. RLS: brauzerga to'g'ridan-to'g'ri yozish yo'q; o'qish — faqat o'z filiali yoki o'z qatori.
4. Investor hisobiga (ulush) B2B savdo hech qachon to'g'ridan-to'g'ri yozilmaydi — faqat oylik foyda orqali.

## 4. Nima QILINMADI (ataylab)
- Investor yoki B2B hamkorni qidirish/topish, CRM, lead, pipeline — **NOT IMPLEMENTED** (talab).
- B2B 2.0 jadvallari — **NOT IMPLEMENTED** (talab: hozir qurilmasin).
- SQL hamkor jadvallariga ko'chirish — **NOT IMPLEMENTED** (alohida, tasdiqlangan loyiha kerak: ma'lumot ko'chirish va ikki manbani taqqoslash).
