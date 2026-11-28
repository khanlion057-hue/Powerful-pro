# BIZNES PRO — BARCHA MODULLAR: TO'LIQ FUNKSIONAL TAVSIF

> Har bir menyu bandi — maydonlari, formulasi, va misol bilan.
> Bu hujjat kodni to'g'ridan-to'g'ri o'qib, tekshirib chiqilgan holda yozilgan.

---

## 📊 1. DASHBOARD

**Maqsad:** Kunlik/oylik holatni bir qarashda ko'rish.

**8 ta statistik karta** (bosilsa, tafsilot pastda ochiladi — "drill-down"):
1. 💰 Bugungi savdo (bugungi barcha `sales` yig'indisi, $)
2. 📈 Bugungi foyda (bugungi savdolarning `profitUsd` yig'indisi)
3. 📅 Oy savdosi (joriy oy boshidan)
4. 💎 Oy foydasi
5. 💲 Dollar kassa (joriy balans)
6. ⏳ Jami qarz (barcha mijozlar qarzi, so'mdan $ ga o'girilgan)
7. 👥 Hamkorlar investitsiyasi (barcha hamkorlar kiritgan summalar yig'indisi)
8. 📦 Kam qolgan (min-stockdan past yoki tugagan mahsulotlar soni — asosiy ombor + barcha dillerlar ombori birga hisoblanadi)

**Bugungi savdolar jadvali** — chek, mijoz, mahsulotlar, summa; bosilsa to'liq chek ko'rinadi (tahrirlash/qaytarish/chop qilish tugmalari bilan)

**Kam qoldi paneli** — 5 tagacha eng kam qolgan mahsulot, progress-bar bilan

**Kassalar paneli** — barcha kassalarning joriy balansi

**Tezkor tugmalar** — Yangi Savdo, Kirim, Ayirboshlash

---

## 🛒 2. SAVDO

**Maqsad:** Do'kon ichidan mijozga sotish.

**Oqim:**
1. Mahsulot qidiriladi (kod YOKI nom bo'yicha) → savatga qo'shiladi
2. Mijoz tanlanadi (ixtiyoriy — qarzga sotish uchun MAJBURIY)
3. Chegirma % kiritiladi (ixtiyoriy)
4. To'lov turi tanlanadi: Naqd so'm / Karta / Dollar / Qarzga
5. "Qancha berdi" maydoniga summa kiritiladi
   - Bo'sh qoldirilsa → to'liq summa deb hisoblanadi
   - Kiritilgan summa haqiqiy summadan katta bo'lsa → "Qaytim: X so'm — Chegirmaga aylantirish" tugmasi chiqadi. Bosilsa, farq avtomatik chegirma bo'lib yoziladi.
     Misol: Savdo 156 780 so'm, mijoz 160 000 beradi → Qaytim 3 220 so'm → tugma bosilsa → yakuniy summa 160 000, qaytim 0
6. "SAVDONI YAKUNLASH" tugmasi:
   - Qolgan (qarz) summa bo'lsa-yu mijoz tanlanmagan bo'lsa → tugma o'chiq, qizil ogohlantirish
   - Mijoz tanlansa → qolgan summa uning qarziga yoziladi, tugma yonadi
   - To'liq to'langan bo'lsa → yashil "tayyor" xabari

**Tannarx hisoblash:** FIFO (eng eski partiyadan avval sotiladi). Sotuv narxi = tannarx x (1 + markupPct/100), standart 25%.

**Fayllar/funksiyalar:** savdoFinish, savdoCalc, updateFinishBtn, roundChangeToDiscount, getCostFIFO, deductFIFO

---

## ↩️ 2.5. QAYTARISHLAR (yangi, alohida menyu)

**Maqsad:** Sotilgan tovarni mijozdan qaytarib olish — endi Savdo ichida yashiringan tugma emas, **alohida sidebar menyusi**.

**Sahifa tarkibi:**
1. **🔍 Qidiruv** — chek raqami (`inv`) yoki mijoz ismi bo'yicha istalgan savdoni qidirish
2. **📋 So'nggi savdolar** — oxirgi 50 ta savdo, har birida **"↩️ Qaytarish"** tugmasi
3. **↩️ Qaytarishlar tarixi** — oxirgi 30 ta amalga oshirilgan qaytarish (sana, mahsulot, miqdor, tannarx, qaysi savdodan)

**Qaytarish oqimi** (`openSaleReturn` → `doSaleReturn`):
1. Savdo tanlanadi (qidiruv orqali yoki ro'yxatdan)
2. Qaysi mahsulot va necha dona qaytarilayotgani tanlanadi (maksimal — sotilgan miqdordan oshmaydi)
3. Tizim avtomatik hisoblaydi va ko'rsatadi:
   - Kassadan qaytariladigan summa (sotilgan narxda)
   - Omborga qaytadigan tannarx
   - Zarar (yo'qotilgan foyda)
4. Tasdiqlansa:
   - Tovar **tannarxi bilan** yangi partiya sifatida omborga qaytadi (`origin: "Qaytarish — {chek}"`)
   - Kassadan mos summa ayiriladi
   - Savdo yozuvidagi miqdor kamayadi

*Misol:* Savdoda 5 dona $12 dan sotilgan (tannarx $10), mijoz 2 donasini qaytaradi:
```
Kassadan qaytariladi: 2 × $12 = $24
Omborga qaytadi: 2 dona, tannarx $10/dona
Zarar: 2 × ($12-$10) = $4 (yo'qotilgan foyda)
```

**Fayllar/funksiyalar:** `pgQaytarish`, `qrRows`, `qrFilter`, `qrHistoryRows`, `openSaleReturn`, `srCalc`, `doSaleReturn`

---

## 📦 3. MAHSULOTLAR

**Maqsad:** Mahsulot katalogini boshqarish.

**Har bir mahsulot uchun maydonlar:**
- Kod (SKU) — noyob identifikator
- Nomi, Kategoriya, Brend, Birlik (dona)
- Min./Maks. qoldiq (kam qolganda ogohlantirish uchun)
- Rasm (yuklanadi)
- Chakana ustama % (markupPct, standart 25%)
- Opt/Diller ustama % (optMarkupPct, standart 15%)
- Diller ball foizi (pointPct, standart 0%)

**Narx hisoblash misoli:**
- Tannarx (FIFO) = $10.00
- Chakana narx (25%) = $12.50
- Opt/Diller narx (15%) = $11.50

**Qidirish:** kod (SKU) va nom bo'yicha ikkalasi ham ishlaydi, kategoriya bo'yicha filtr ham bor.

**Excel funksiyalari:** Chop (Excel+rasm), Qoldiq Excel, Mahsulot Excel eksport, Import (Excel'dan yuklash).

**Mahsulot kartasi:** qoldiq, tannarx, chakana/opt narx, to'liq harakatlar tarixi.

**Revizия (inventarizatsiya):** tizim qoldig'i bilan haqiqiy sanoqni solishtirish, farqni tuzatish.

---

## 🏪 4. OMBOR (FIFO)

**Maqsad:** Barcha partiyalarni FIFO tartibida ko'rish.

**Statistika:** Faol partiyalar, Yo'lda partiyalar, Ombor qiymati ($), Kam mahsulot soni.

**Jadval:** Partiya №, Mahsulot, Kelib chiqqan, Sana, Qolgan/Jami, Tannarx, Valyuta, Holat.

**Qoida:** Har doim eng eski partiya avval sotiladi (FIFO).

---

## 🚛 5. IMPORT / KIRIM (eng batafsil modul)

**Maqsad:** Xitoydan sotib olingan mahsulotlarni hisobga olish va to'liq tannarxini hisoblash.

### 5.1 Sana va vaqt
Har bir kirim yaratilganda sana avtomatik yoziladi.

### 5.2 Kurs paneli (3 valyuta)
- 1$ = X UZS (standart 12 800)
- 1$ = Y ¥ (standart 6.75)
- 1¥ = (X/Y) UZS (avtomatik hisoblanadi)
- "Saqlash" — kursni keyingi kirimlar uchun eslab qoladi

Misol: 1$=12 100 so'm, 1$=6.72¥, 1¥=1801 so'm (avtomatik)

### 5.3 Yangi partiya
Har bir import — alohida partiya raqami (01, 02, 03...) bilan. Bitta partiyada bir nechta mahsulot turi bo'lishi mumkin, barchasi bitta partiya raqamiga bog'lanadi.

### 5.4 Ta'minotchi
Mavjudlardan tanlanadi yoki yangi nom kiritilsa avtomatik yaratiladi. To'lov to'liq bo'lmasa, qarzdorlik shu ta'minotchiga yoziladi.

### 5.5 Holati — Keldi / Yo'lda
- Keldi (hozir): omborga kiradi, sotishga ruxsat, tannarx yakunlanadi
- Hali yo'lda: omborga qo'shilmaydi, savdoga chiqmaydi, faqat ro'yxatda turadi. Yetib kelganda "Keldi deb belgilash" bosiladi, shunda bojxona bo'limi ham faollashadi.

### 5.6 Mahsulotlar (partiya ichida)
Har biri: Kod, Nomi, Miqdori, 1 dona narxi (tanlangan valyutada).
Misol: G2 kodi, 1000 dona, ¥15/dona -> jami ¥15000

### 5.7 Xitoy ichki xarajatlar (¥) — "Yo'lkira"
Bitta umumiy summa (transport, yetkazish, logistika, yuklash) kiritiladi, tizim avtomatik donaga bo'lib taqsimlaydi.
Misol: ¥300 xarajat, 2000 dona -> 300/2000 = ¥0.15/dona qo'shiladi.

### 5.8 Bank xizmati — 0.6% (avtomatik)
Misol: mahsulot summasi ¥10000 -> dollarga 10000/6.72=$1488.10 -> bank $1488.10 x 0.6% = $8.93. Avtomatik hisoblanadi.

### 5.9 O'zbekiston bojxonasi ($)
Ikki usul:
- Donaga (per_unit): masalan $2000/1000 dona = $2/dona
- Summaga (by_value, professional usul): mahsulot qiymatiga mutanosib taqsimlash.
  Misol: A=$10000(66.6%), B=$5000(33.3%), jami $15000, bojxona $3000 -> A ga $1998, B ga $1002.

### 5.10 Yakuniy tannarx formulasi
Yakuniy tannarx = Asosiy ¥ narxi($ga o'girilgan) + Xitoy ichki logistika + Bank 0.6% + Bojxona + Boshqa xarajatlar
Misol: $10.00 + $0.25 + $0.06 + $1.30 = $11.61/dona

### 5.11 Ta'minotchiga to'lov
Misol: mahsulot $5000, berilgan $3000 -> qarz $2000. Bo'sh qoldirilsa to'liq to'langan ($5000) deb hisoblanadi.

### 5.12 Kassir
Import to'lovi faqat Dollar kassasidan avtomatik yechiladi (kassada yetarli bo'lmasa mavjudigacha kesiladi, qolgani qarz bo'lib qoladi).

### 5.13 Excel shablon va import
- Shablon (exportImportTemplate) — namuna fayl yuklanadi. **YANGILANGAN maydonlar:**
  `SKU (Kod) | Miqdor (dona) | Tannarx ($) | Chakana narxi ($) | Optim narxi ($)`
  ("Kelib chiqqan" va "Sana" ustunlari olib tashlandi — sana avtomatik import kunига teng bo'ladi; "Narx/dona" endi aniq "Tannarx" deb nomlangan; Chakana/Optim narx ustunlari qo'shildi)
- Excel import (importBatchXlsx) — bir martada ko'p mahsulot yuklash, **hammasi BITTA partiya raqamiga (bno) bog'lanadi**
  - Har qatordagi SKU asosida mavjud mahsulot topiladi, miqdor+tannarx bilan partiya yaratiladi
  - Agar "Chakana narxi" yoki "Optim narxi" ustunlari to'ldirilgan bo'lsa, tizim **mahsulotning ustama foizini (markupPct/optMarkupPct) avtomatik shundan hisoblab, yangilaydi**:
    `markupPct = ((chakana_narxi / tannarx) - 1) × 100`
    Misol: tannarx $15.10, chakana narxi $18.88 → markupPct = ((18.88/15.10)-1)×100 ≈ **25%**

⚠️ **HALI OCHIQ MUAMMO:** Excel orqali ko'p kirim qilinganda, tizim hamon faqat SKU, miqdor, tayyor tannarx($) qabul qiladi — **Yuan konvertatsiyasi, bank 0.6%, bojxona taqsimoti, ta'minotchi bog'lash** hali Excel yo'li bilan ishlamaydi (bular faqat bitta-bitta qo'lda kiritishda, 5.6–5.10-bandlardagi to'liq formula orqali hisoblanadi). Bu — hali tuzatilmagan, lekin maydonlari to'g'irlangan holat.

### 5.14 Kirim tarixi
Har bir partiya: partiya raqami, sana, ta'minotchi, holat, jami miqdor/qiymat, valyuta, mahsulotlar ro'yxati. Har birini alohida chop qilish mumkin.

---

## 🤝 6. MIJOZLAR

**Maqsad:** Do'kon mijozlarini va qarzini boshqarish.

**Maydonlar:** Ism, Telefon, Doimiy chegirma % (0-50), Jami xarid, Joriy qarz (so'mda saqlanadi).

**Qidirish:** ism yoki telefon bo'yicha.

**Qarz to'lash:** kassa tanlanadi, summa kiritiladi (standart to'liq qarz taklif qilinadi), tasdiqlansa qarz kamayadi, kassa balansi oshadi.

**Excel/chop:** ro'yxat chop qilish, har mijoz uchun alohida vypiska.

---

## 🏭 7. TA'MINOTCHILAR

**Maqsad:** Ta'minotchilarga bo'lgan qarzni kuzatish.

**Maydonlar:** Nomi, Mamlakat, Kontakt, To'langan ($), Qarz ($).

Qarz avtomatik Kirim modulidan yoziladi, qo'lda ham tuzatish mumkin.

---

## 👥 8. HAMKORLAR (investorlar/ta'sischilar)

**Maqsad:** Oylik foydani hamkorlar orasida taqsimlash.

**Maydonlar:** Ism, Kiritilgan kapital, Ta'sischi belgisi, Investordan ushlab qolinadigan foiz (keepPct).

**Oylik hisoblash oqimi:**
1. Davr va jami foyda kiritiladi
2. Har bir hamkor kapital ulushi hisoblanadi (ulush% = kapital/jami kapital x100)
3. Har biriga foyda_summasi = jami_foyda x ulush%
4. Ta'sischilar o'z ulushini to'liq oladi
5. Investorlardan keepPct foiz ushlab qolinadi
6. Ushlangan qism — barcha ta'sischilar orasida ularning o'zaro kapital ulushiga mutanosib taqsimlanadi

Misol: Jami foyda $1000. A(ta'sischi,$500)=50%=$500 to'liq. B(ta'sischi,$300)=30%=$300 to'liq. C(investor,$200,keepPct40%)=20%=$200, undan 40%($80) ushlanadi, C ga $120 qoladi. Ushlangan $80 — A:500/800=62.5%=+$50, B:300/800=37.5%=+$30. Yakuniy: A=$550, B=$330, C=$120 (jami=$1000).

Har bir hisoblash davr sifatida saqlanadi, chop qilish va bekor qilish (undo) mumkin.

---

## 🚚 9. DILLERLAR

(Batafsil TALABLAR_HUJJATI.md va BAJARILGAN_ISHLAR.md fayllarida yozilgan, bu yerda qisqacha xulosa)

7 ta ichki bo'lim: Dillerlar ro'yxati, Buyurtmalar, Kunlik nazorat, Ombor, Yuborish, Savdo (admin qo'lda), Qarzlar. Har bir diller: login/parol, xizmat foizi, Telegram guruh ID, ball. Diller faqat $ da sotadi, o'z omborini va buyurtmalarini mustaqil boshqaradi, admin tasdiqlaydi.

---

## 💳 10. KASSALAR

**Maqsad:** Naqd pul harakatini kuzatish.

**Standart kassalar:** har biri o'z valyutasida (masalan Dollar kassa, Naqd So'm, Karta).

**Har bir kassa uchun 3 amal:** Kirim (qo'lda pul kiritish, kim bilan bog'lash mumkin), Chiqim, Ko'chirish (kassadan kassaga).

**Kun yakunida ayirboshlash:** So'm/Karta kassalarini kursga ko'ra Dollar kassasiga aylantirish, har bir so'm-kassa uchun alohida summa, natija avtomatik hisoblanadi.

**Pullar harakati jurnali:** barcha kirim/chiqim avtomatik yoziladi, oxirgi 80 tasi ko'rinadi.

---

## 💸 11. XARAJATLAR

**Maqsad:** Do'kon xarajatlarini qayd etish.

**Kategoriyalar:** Ijara, Maosh, Kommunal, Transport, Reklama, Ta'mir, Boshqa.

**Maydonlar:** Sana (avtomatik), Kategoriya, Summa($), Izoh, Kassa.

Xarajat kiritilganda tanlangan kassa balansi avtomatik kamayadi.

---

## 📈 12. HISOBOT

**Maqsad:** Umumiy moliyaviy ko'rsatkichlar.

**4 statistika:** Jami daromad, Yalpi foyda, Xarajatlar, Sof foyda (foyda-xarajat).

**Kategoriya bo'yicha taqsimot** — progress-bar bilan.

**Excel eksportlar:** Savdo, Qoldiq, Kirim, Kam qolgan, Diller yuborilgan — alohida .xlsx fayllar.

**Kartichka tovar:** bitta mahsulotni qidirib to'liq hayotini ko'rish — qancha keldi, sotildi, qoldi, o'rtacha tannarx, jami daromad/foyda, barcha harakatlar xronologik tartibda.

---

## ⚙️ 13. SOZLAMALAR

**Asosiy:** Kompaniya nomi, Egasining ismi, Lavozimi, Chek yozuvi.

**Joriy kurs** ko'rsatkichi va yangilash tugmasi.

**Ma'lumotlar:** Zaxira nusxa olish (JSON yuklab olish), Zaxiradan tiklash (JSON yuklash). Tizim statistikasi (mahsulot/partiya/savdo/mijoz soni).

---

## 🏆 14. DILLER BALL (LOYALTY) SOZLAMALARI

Dillerlar sahifasida: 1 ball = X$ (standart $2), Yaxlitlash qadami (1 yoki 0.5). Har bir mahsulot alohida ball foiziga ega.

Formula: ball = round((savdo_summasi x mahsulot_ball_foizi/100) / 1_ball_narxi, yaxlitlash_qadami)

Misol: $100 savdo, 5% ball foizi, 1ball=$2, yaxlitlash=1: (100x5%)/2=2.5 -> yaxlitlanadi -> 3 ball

---

Hujjat oxiri - har bir band amaldagi kod bilan tekshirilgan.
