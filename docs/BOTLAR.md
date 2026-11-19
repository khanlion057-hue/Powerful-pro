# Botlar ro'yxati (v25.6.9)

Tizimda **3 ta Telegram bot** ishlaydi. Token faqat serverda saqlanadi, brauzerga qaytmaydi.
Ularning Telegram nomlari (taxminiy moslik — bot nomlari kodda yozilmagan, tekshirib tasdiqlang):

| Bot | Vazifa | Token qayerda |
|---|---|---|
| **@Powerful_hisobot** (hisobot boti) | Hisobotlar, hodisalar, investor hujjatlari, zaxira, parol tiklash, mijoz xabarlari | `settings.tgBotToken` |
| **@Powerful_onlaynbot** (onlayn do'kon boti) | Onlayn do'kon buyurtmalari va yangi mahsulot e'loni | `settings.shopBotToken` |
| **@Powerful_yukxisobot** (tasdiqlang: so'rov boti yoki yuk hisobi?) | Xodim botdan /foyda, /xarajat... so'raydi | alohida: `app_data` qatori `tg_query_bot` |

## 1) Hisobot boti — kim nimani oladi
| Xabar | Qachon | Kim oladi | Ichida nima |
|---|---|---|---|
| Kunlik hisobot | har kuni belgilangan soatda (standart 21:00) | **Egasi** guruhi — hamma filial + bosh kassa + dillerlar; **har filial guruhi** — faqat o'z filiali | savdo, foyda, xarajat, kassalar, qarzlar, top xodim/mahsulot |
| Nasiya savdo | darhol | egasi guruhi + shu **filial** guruhi (+ mijozning o'zi, agar botga ulangan bo'lsa) | mijoz, mahsulotlar, qarz, qaytarish sanasi |
| Mijoz qarz to'lovi | darhol | egasi + filial guruhi (+ mijoz) | summa, qolgan qarz |
| Nasiya eslatmasi | har kuni 9:00 (sozlanadi) | egasi + filial guruhi | bugun / muddati o'tgan qarzlar |
| Diller oldi-berdisi, to'lovi | darhol | egasi (dillerlar guruhi) + **shu dillerning** guruhi | tovar yuborildi/qaytdi, to'lov qabul/rad |
| Diller oy yakuni | har oyning 1-kuni | egasi: hammasi; **har diller:** faqat o'zi | oy bo'yicha jo'natma, savdo, to'lov, qarz |
| Tovar kirimi (v25.6.9) | kirim/import | egasi + shu filial guruhi | nom va miqdor (narx yo'q) |
| O'tkazma (v25.6.9) | so'rov / jo'natish / qabul | egasi + ikkala filial guruhi | nom va miqdor |
| Filial oy yakuni (v25.6.9) | har oyning 1-kuni | **har filial:** faqat o'zi; egasi: umumiy | foyda, xarajat, qarz, kassa |
| Investor hisoboti | tugma bilan (oylik/yillik) | **shu investorning** shaxsiy chati | boshlang'ich, kirim, foyda ulushi, kelishilgan foiz |
| Zaxira nusxa | har kuni | egasining **shaxsiy** chati (`tgBackupChat`) | .json.gz fayl |
| Parol tiklash kodi | so'ralganda | **shu xodimning** o'zi | 6 xonali kod |
| Texnik ogohlantirish, tizim holati | xato yoki kunlik | egasi guruhi | xatolar, sekin javoblar, baza hajmi |

To'liq (hammasini) ko'radigan: **faqat egasi guruhi** (`tgChatId`). Filial guruhi — o'z filiali; diller guruhi — o'z dillerining ma'lumoti. Boshqa filial/diller ma'lumoti hech qachon yuborilmaydi.

## 2) Onlayn do'kon boti (@Powerful_onlaynbot)
- Yangi onlayn buyurtma — **egasi guruhi + shu filial guruhi** (mijoz, telefon, mahsulot, yetkazish).
- Yangi mahsulot e'loni — belgilangan **kanal/guruhlarga** (rasm, nom, narx, havola).
- Kim to'liq: egasi.

## 3) So'rov boti (xodim so'raydi; v25.6.9)
Buyruqlar: `/foyda`, `/xarajat` (bugun · kecha · hafta · oy · otgan), `/qarz`, `/kassa`, `/ombor`, `/mahsulot nom`, `/yordam`.
- Ulash: Sozlamalar → «Botdan hisobot so'rash» → kod → botga `/start KOD`.
- **Egasi (admin):** hamma filial. **Xodim:** faqat o'z filiali va faqat ruxsati bor buyruq
  (`hisobot.view` — foyda, `xarajatlar.view`, `mijozlar.view` — qarz, `kassalar.view`, `ombor.view`).
- Faqat shaxsiy chatda javob beradi; guruhda jim.

## Yangi bot kerak bo'lsa
- **Xodimlar uchun alohida bildirishnoma boti** (masalan kassirga «kassa yopilmadi» eslatma) — kerak bo'lsa qo'shiladi.
- **Mijozlar uchun alohida bot** (hozir mijoz xabarlari hisobot boti orqali boradi) — mijoz bilan brend nomi bilan yozishish uchun.
- **Yuk hisobi boti** (@Powerful_yukxisobot): agar bu yuk/jo'natma kuzatuvi uchun mo'ljallangan bo'lsa — vazifasini ayting.
Har yangi bot: BotFather → token → Sozlamalarda saqlanadi; hisobot botiga **webhook qo'yilmaydi** (investor ulash va parol tiklash `getUpdates` ishlatadi).

---
# Yangi botlar: nomlar va BotFather qadamlari

Telegram botni **faqat egasi** @BotFather orqali yarata oladi (menda sizning Telegram akkauntingiz yo'q). Quyida tayyor nomlar, tavsif va buyruqlar — nusxalab qo'yasiz.
Foydalanuvchi nomi (@...) `bot` bilan tugashi va band bo'lmasligi shart; band bo'lsa raqam qo'shing.

| # | Bot | Ko'rinadigan nom | Taklif etilgan @nom | Vazifa |
|---|---|---|---|---|
| 1 | Hisobot boti | Powerful · Hisobot | @PowerfulGroup_hisobot_bot | kunlik/oylik hisobot, nasiya, diller, kirim, o'tkazma, investor, zaxira |
| 2 | Onlayn do'kon boti | Powerful · Onlayn do'kon | @PowerfulGroup_dokon_bot | onlayn buyurtma va yangi mahsulot e'loni |
| 3 | So'rov boti | Powerful · So'rov | @PowerfulGroup_sorov_bot | xodim /foyda, /xarajat, /qarz, /kassa, /ombor so'raydi |
| 4 | (ixtiyoriy) Yuk hisobi | Powerful · Yuk hisobi | @PowerfulGroup_yuk_bot | yuk/jo'natma bildirishnomalari — vazifasini aytsangiz qo'shaman |

## Har bot uchun (BotFather'da)
1. `/newbot` → ko'rinadigan nom → @nom → **token** (maxfiy, hech kimga bermang).
2. `/setdescription` — jadvaldagi «Vazifa» matni; `/setuserpic` — Powerful logotipi (`assets/brand-logo.jpg`).
3. So'rov boti uchun buyruqlar ilovadan o'zi o'rnatiladi (Sozlamalar → «Botdan hisobot so'rash» → token → «Botni sozlash»). Onlayn do'kon botida — Onlayn-do'kon → Bot → token; buyruqlar «sozlash» tugmasi bilan.
4. Hisobot boti: Sozlamalar → Telegram → token va guruhni tanlash; **webhook qo'ymang**.
5. Guruhlarga qo'shing: botni guruh a'zosi qiling (egasi guruhi, har filial va har diller guruhi) va guruh ID sini Sozlamalar'da kiriting.
