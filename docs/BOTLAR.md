# Botlar — oddiy tushuntirish (v25.9: YAGONA BOT)

Tizimga endi **bitta bot** ulanadi: **@Powerful_hisobot** — asosiy (hisobot) boti (Sozlamalar → Asosiy bot / Telegram bot, token). U hamma ishni qiladi.
Avvalgi alohida **So'rov boti** va **Do'kon boti** kerak emas. @Powerful_yukxisobot — boshqa maqsad uchun, tizimga **ulanmagan**, tegilmaydi.

| Vazifa | Kimga | Qanday |
|---|---|---|
| Kunlik hisobot, nasiya, to'lov, diller, kirim, o'tkazma, oy yakuni | Egasi / filial / diller guruhlari | Bot o'zi yuboradi |
| Zaxira nusxa | Egasining shaxsiy chati | Har kuni |
| Investor hisoboti (PDF) | Investor (shaxsiy chat) | Hamkorlar → «Telegramga ulash» |
| Hujjat va cheklar, yangi mahsulot e'loni | Guruh / kanallar | Tugma yoki avtomatik |
| **AI-reklama** va **avtopilot** | Filialning reklama kanali; qoralama haqida — egasi guruhi | Onlayn-do'kon → AI-reklama |
| **Xodim so'rovlari**: `/foyda` `/xarajat` `/qarz` `/kassa` `/ombor` `/mahsulot` `/yordam` | Ulangan xodim (shaxsiy chat) | Sozlamalar → «Botdan hisobot so'rash» → «Telegramda ulash» → Start |
| **Do'kon xaridorlari**: nasiya, to'lov, qarz eslatmasi, buyurtma | Xaridor (shaxsiy chat) | Mijoz kartasi → «Botga ulash» havolasi → Start |
| Parol tiklash kodi | Xodim (shaxsiy chat) | «Parolni unutdim» → ulash |

## Kim nimani ko'radi
- **Xaridor** menyuda faqat `/start` va yordamni ko'radi. Xodim buyrug'ini yozsa — faqat **«Bu buyruq mavjud emas»** (ruscha: «Такой команды нет»). Ichki ma'lumot aytilmaydi.
- **Xodim** buyruqlari menyusi faqat **ulangan xodimning o'z chatida** ko'rinadi. Javob — faqat o'z filiali va ruxsati boricha (egasi — hamma filial).
- **Guruhda** bot buyruqlarga javob bermaydi.
- Menyu va bot tavsifi — **o'zbekcha** (sukut) va **ruscha** (Telegram tili ruscha bo'lgan foydalanuvchiga).

## Qanday ishlaydi (texnik)
- Bot **webhook** orqali ishlaydi: Telegram har xabarni `/.netlify/functions/telegram-bot` ga yuboradi (maxfiy kalit bilan).
  Kalit `app_data` 'tg_main_bot' qatorida (faqat server). Token hech qachon brauzerga, logga yoki javobga chiqmaydi.
- Kelgan «/start kod» va guruh/kanal holati **`tg_inbox`** jadvalida 48 soat saqlanadi (59-migratsiya). Oddiy shaxsiy matn saqlanmaydi.
  Ilovadagi «Tekshirish» tugmalari (xodim paroli, investor, guruhlarni topish, mijoz) shu jadvaldan o'qiydi.
- Webhook hali o'rnatilmagan bo'lsa — eskicha `getUpdates` ishlaydi (o'tish davrida hech narsa buzilmaydi).
- «Start» kodlari bir-biriga to'qnashmaydi: `cus…` — mijoz, `pw…` — xodim paroli, `inv…` — investor, 8 xonali raqam — xodim so'rovlari.

## «Botni sozlash» (administrator, bir marta)
Sozlamalar → **Botlar va avtomatik vazifalar** → **«Botni sozlash»**. U webhook, menyu va tavsifni (uz, ru) o'rnatadi, ulangan xodimlar menyusini
qayta qo'yadi va **darhol tekshiradi**. Natija 4 qatorda: **bot ishlayaptimi**, **webhook**, **menyu (uz/ru)**, **tavsif**.
Bot o'chirilgan yoki token yaroqsiz — **«Bot topilmadi — BotFather’da tekshiring»**. Qayta bosish xavfsiz.
Tekshiruv **bot nomini** ham ko'rsatadi: saqlangan token **@Powerful_hisobot** emas bo'lsa — sariq ogohlantirish «Bot nomi mos emas»
(ish to'xtamaydi; to'g'ri tokenni saqlang). Kutilgan nomni `FW_MAIN_BOT_USERNAME` muhit o'zgaruvchisi bilan almashtirish mumkin.

## O'tish (bir marta)
1. 59-migratsiya → deploy → «Botni sozlash».
2. Xodimlar asosiy botda bir marta **Start** bosadi (ulanishlar saqlangan; bot ularga yozishi uchun Start kerak).
3. Eski So'rov botiga yozganlarga bot o'zi «endi asosiy botdan foydalaning» deb javob beradi. Eski botlarni @BotFather'da o'chirish — ixtiyoriy.
4. Onlayn-do'kon → Telegram: eski do'kon boti tokenini «Eski tokenni o'chirish» bilan olib tashlash mumkin (asosiy botga ta'sir qilmaydi).

**Bot rasmi:** @BotFather → `/setuserpic` (Telegram uni tashqaridan o'zgartirishga ruxsat bermaydi).
