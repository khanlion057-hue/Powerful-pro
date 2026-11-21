# Botlar — oddiy tushuntirish (v25.6.9)

Tizimga **3 ta bot** ulanadi. @Powerful_yukxisobot — boshqa maqsad uchun, bu tizimga **ulanmagan**, tegilmaydi.

| Bot | Nima qiladi (bir gapda) | Hozirgi nom |
|---|---|---|
| **1. Hisobot boti** | Hamma hisobot va xabarlarni guruhlarga **o'zi yuboradi** | @Powerful_hisobot |
| **2. Onlayn do'kon boti** | Onlayn buyurtma va yangi mahsulot haqida xabar beradi | @Powerful_onlaynbot |
| **3. So'rov boti** (yangi) | Xodim botdan **o'zi so'raydi**: «bu oy foyda qancha?» | hali ochilmagan |

---

## 1. Hisobot boti
**Vazifa:** hisobotlar, nasiya, to'lov, diller, kirim, o'tkazma, investor, zaxira — hammasini avtomatik yuboradi.

**Qaysi guruh/chatlarga ulanadi** (Sozlamalar → Telegram):
| Kimga | Nimani oladi | Qayerda kiritiladi |
|---|---|---|
| **Egasi guruhi** (1 ta) | **Hammasini**: barcha filial, bosh kassa, dillerlar | «Guruh» (chat ID) |
| **Har filial guruhi** (filial soni qadar) | Faqat **o'z filiali**: kunlik hisobot, nasiya, qarz to'lovi, eslatma, tovar kirimi, o'tkazma, oy yakuni | «Filial guruhlari» |
| **Har diller guruhi** (diller soni qadar) | Faqat **o'z dillerining**: tovar olish/qaytarish, to'lov, oy yakuni | «Diller guruhlari» |
| **Dillerlar umumiy guruhi** (ixtiyoriy) | Barcha dillerlar bo'yicha umumiy | «Barcha dillerlar umumiy guruhi» |
| **Mijoz** (shaxsiy chat) | Faqat **o'zining** nasiya/to'lov/eslatmasi | Mijoz kartasi → «Botga ulash» |
| **Investor** (shaxsiy chat) | Faqat **o'zining** hisoboti (oylik/yillik) | Hamkorlar → hisobot → «Telegramga ulash» |
| **Egasi shaxsiy chati** | Har kuni **zaxira nusxa** fayli | Sozlamalar → Zaxira |
| **Xodim** (shaxsiy chat) | Parol tiklash **kodi** | Parolni unutdim |

**Muhim qoida:** filial guruhiga boshqa filial ma'lumoti, diller guruhiga boshqa diller ma'lumoti **hech qachon** chiqmaydi. «Asosiy guruhga nusxa» yoqilgan bo'lsa, egasi hammasini bir joyda ham ko'radi.

**Qachon yuboradi:**
- Darhol: nasiya savdo, qarz to'lovi, diller amali, tovar kirimi, o'tkazma.
- Har kuni: kunlik hisobot (standart 21:00), nasiya eslatmasi (9:00), zaxira.
- Har oyning 1-kuni: filial va diller oy yakuni hisoboti.

**Ehtiyot:** bu botga **webhook qo'yilmaydi** (investor va parol tiklash shunga bog'liq).

---

## 2. Onlayn do'kon boti
**Vazifa:** do'kondan yangi buyurtma kelsa xabar beradi; yangi mahsulot qo'shilsa e'lon qiladi.

| Kimga | Nimani oladi |
|---|---|
| **Egasi guruhi** + **shu filial guruhi** | Yangi buyurtma: mijoz, telefon, mahsulotlar, yetkazish |
| **E'lon kanali/guruhlari** (ixtiyoriy) | Yangi mahsulot: rasm, nom, narx, havola |

Ulash: Onlayn-do'kon → Bot → token.

---

## 3. So'rov boti (yangi, alohida bot kerak)
**Vazifa:** xodim hisobotni **kutmasdan** o'zi so'raydi.

**Buyruqlar:** `/foyda` · `/xarajat` (bugun, kecha, hafta, oy, otgan) · `/qarz` · `/kassa` · `/ombor` · `/mahsulot nom` · `/yordam`

| Kim | Nimani ko'radi |
|---|---|
| **Egasi (admin)** | Hamma filial |
| **Xodim** | Faqat **o'z filiali** va faqat **ruxsati bor** buyruq (foyda — `hisobot.view`, xarajat — `xarajatlar.view`, qarz — `mijozlar.view`, kassa — `kassalar.view`, ombor — `ombor.view`) |
| **Guruh** | Javob bermaydi (faqat shaxsiy chat) |

Ulash (har xodim, bir marta): Sozlamalar → «Botdan hisobot so'rash» → **«📲 Telegramda ulash»** → Telegramda **Start**. Kod yozish shart emas.
Egasi bir marta bot tokenini kiritadi: shu oynada «Botni sozlash».

---

## Yangi botlar — taklif etilgan nomlar
| Bot | Ko'rinadigan nom | @nom |
|---|---|---|
| Hisobot | Powerful · Hisobot | @PowerfulGroup_hisobot_bot |
| Onlayn do'kon | Powerful · Onlayn do'kon | @PowerfulGroup_dokon_bot |
| So'rov | Powerful · So'rov | @PowerfulGroup_sorov_bot |

**Yaratish (har bot, 2 daqiqa):** Telegram → **@BotFather** → `/newbot` → nom → @nom (oxiri `bot`) → **token** (maxfiy) → `/setuserpic` (logotip: `assets/brand-logo.jpg`).
Eski botlarni yangi nomga o'tkazish: BotFather → `/setname` (token o'zgarmaydi — eng oson yo'l).
Guruhga ulash: botni guruhga a'zo qiling → guruh ID sini Sozlamalar → Telegram'da yozing.
