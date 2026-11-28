// v25.9 — YAGONA BOT: matnlar, menyu va tavsif (o'zbekcha va ruscha). Til — Telegram foydalanuvchisining tili (language_code):
// «ru…» — ruscha, qolgani — o'zbekcha. Xaridorga ichki ma'lumot (xodim buyruqlari, ulash yo'riqnomasi, ruxsatlar) aytilmaydi.
'use strict';

const langOf = (from) => (/^ru/i.test(String((from && from.language_code) || '')) ? 'ru' : 'uz');

// Xodim buyruqlari (so'rov boti) — faqat ulangan xodim chatida ko'rinadi (BotCommandScopeChat)
const STAFF_CMDS = ['foyda', 'xarajat', 'qarz', 'kassa', 'ombor', 'mahsulot', 'yordam'];

const T = {
  uz: {
    noCmd: 'Bu buyruq mavjud emas',
    welcome: (brand) => `👋 <b>${brand}</b> botiga xush kelibsiz!\nNasiya xaridlari, toʻlovlar va buyurtmalar haqidagi xabarlar shu yerga keladi.`,
    help: (brand) => `<b>${brand}</b> boti\nBu yerga doʻkon xabarlari keladi: nasiya, toʻlov, qarzni qaytarish kuni va buyurtma holati.\n/start — boshlash`,
    linkBad: 'Havola eskirgan yoki notoʻgʻri. Yangi havola soʻrang.',
    accepted: '✅ Qabul qilindi — ilovaga qayting, ulanish tasdiqlanadi.',
    staffHi: '✅ Siz xodim sifatida ulangansiz. Buyruqlar: /yordam',
    cmdsCustomer: [['start', 'Boshlash'], ['help', 'Yordam']],
    cmdsStaff: [['foyda', 'Foyda: bugun/hafta/oy'], ['xarajat', 'Xarajatlar'], ['qarz', 'Qarzlar'], ['kassa', 'Kassalar'],
      ['ombor', 'Kam qolgan mahsulot'], ['mahsulot', 'Mahsulot qoldigʻi'], ['yordam', 'Buyruqlar']],
    description: (brand) => `${brand} rasmiy boti.\nXaridorlar: nasiya, toʻlov, qarzni qaytarish kuni va buyurtma xabarlari.\nXodimlar: hisobot va soʻrovlar (ilovadan ulanadi).`,
    short: (brand) => `${brand} — xaridorlar va xodimlar uchun bot`,
  },
  ru: {
    noCmd: 'Такой команды нет',
    welcome: (brand) => `👋 Добро пожаловать в бот <b>${brand}</b>!\nСюда приходят сообщения о покупках в рассрочку, оплатах и заказах.`,
    help: (brand) => `Бот <b>${brand}</b>\nСюда приходят сообщения магазина: рассрочка, оплата, срок возврата долга и статус заказа.\n/start — начать`,
    linkBad: 'Ссылка устарела или неверна. Запросите новую ссылку.',
    accepted: '✅ Принято — вернитесь в приложение, подключение подтвердится.',
    staffHi: '✅ Вы подключены как сотрудник. Команды: /yordam',
    cmdsCustomer: [['start', 'Начать'], ['help', 'Помощь']],
    cmdsStaff: [['foyda', 'Прибыль: сегодня/неделя/месяц'], ['xarajat', 'Расходы'], ['qarz', 'Долги'], ['kassa', 'Кассы'],
      ['ombor', 'Заканчивающийся товар'], ['mahsulot', 'Остаток товара'], ['yordam', 'Команды']],
    description: (brand) => `Официальный бот ${brand}.\nПокупателям: сообщения о рассрочке, оплате, сроке возврата долга и заказах.\nСотрудникам: отчёты и запросы (подключение из приложения).`,
    short: (brand) => `${brand} — бот для покупателей и сотрудников`,
  },
};
const cmds = (list) => list.map(([command, description]) => ({ command, description }));
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const brandClean = (s) => String(s || 'POWERFUL').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60) || 'POWERFUL';

module.exports = { T, langOf, STAFF_CMDS, cmds, escHtml, brandClean };
