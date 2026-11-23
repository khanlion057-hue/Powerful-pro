// v25.8 — AI-REKLAMA: AI'SIZ MATNLAR (to'liq ishlaydigan rejim, «zaxira» emas).
// 4 tur (chegirma, yangi, top, turib qolgan) × 2 til (uz — lotin, ru) × 10+ variant. O'rinbosarlar: {name}, {cat}.
// QOIDA: matnda raqam, narx, telefon, manzil YO'Q — narx, do'kon nomi va tugmani tizim qo'shadi.
// «Turib qolgan» xaridorga shunday aytilmaydi — «maxsus taklif / omborda bor» ohangida.
'use strict';

const T = {
  uz: {
    discount: [
      { title: 'Chegirma boshlandi!', body: '{name} endi arzonroq.\nSifat oʻsha-oʻsha, narx — yoqimli.', tags: ['chegirma', 'aksiya', 'arzon'] },
      { title: 'Narx tushdi', body: '{name} — chegirmali narxda.\nShoshiling, taklif cheklangan.', tags: ['chegirma', 'taklif', 'asboblar'] },
      { title: 'Foydali taklif', body: '{name} uchun maxsus narx.\nOʻzingizga yoki ustaxonangizga oling.', tags: ['aksiya', 'chegirma', 'usta'] },
      { title: 'Arzonroq oling', body: '{cat} boʻlimida chegirma: {name}.\nBuyurtmani hoziroq bering.', tags: ['chegirma', 'arzon', 'buyurtma'] },
      { title: 'Aksiya!', body: '{name} — chegirmada.\nIshonchli tovar, qulay narx.', tags: ['aksiya', 'chegirma', 'sifat'] },
      { title: 'Tejash vaqti', body: '{name} narxi pasaydi.\nYaxshi asbob — yarim ish.', tags: ['tejash', 'chegirma', 'asboblar'] },
      { title: 'Chegirmani qoʻldan boy bermang', body: '{name} chegirmali narxda sotuvda.\nTez tugashi mumkin.', tags: ['chegirma', 'aksiya', 'shoshiling'] },
      { title: 'Maxsus narx', body: '{name} — faqat hozir arzonroq.\nYetkazib berish yoki olib ketish — oʻzingiz tanlang.', tags: ['maxsus', 'chegirma', 'yetkazib'] },
      { title: 'Hamyonbop taklif', body: '{name} uchun chegirma eʼlon qilindi.\nUstalar uchun ayni muddao.', tags: ['chegirma', 'usta', 'taklif'] },
      { title: 'Narx yoqimli', body: '{cat}: {name} chegirmada.\nSavolingiz boʻlsa — yozing.', tags: ['chegirma', 'arzon', 'sotuvda'] },
      { title: 'Chegirma haftaligi', body: '{name} arzonlashdi.\nKerakli asbobni hozir oling.', tags: ['chegirma', 'hafta', 'aksiya'] },
    ],
    new: [
      { title: 'Yangi keldi!', body: '{name} sotuvga chiqdi.\nBirinchilardan boʻlib oling.', tags: ['yangi', 'yangilik', 'sotuvda'] },
      { title: 'Yangilik', body: '{cat} boʻlimida yangi tovar: {name}.\nBatafsil — tugma orqali.', tags: ['yangi', 'asboblar', 'yangilik'] },
      { title: 'Omborga yetib keldi', body: '{name} endi bizda bor.\nBuyurtma bering — tayyorlab qoʻyamiz.', tags: ['yangi', 'omborda', 'buyurtma'] },
      { title: 'Yangi mahsulot', body: '{name} — yangi partiya.\nSifatini oʻzingiz koʻring.', tags: ['yangi', 'sifat', 'sotuvda'] },
      { title: 'Taqdimot: yangi tovar', body: 'Tanishing: {name}.\nUstalar uchun ishonchli tanlov.', tags: ['yangi', 'usta', 'tanlov'] },
      { title: 'Endi sotuvda', body: '{name} sotuvga qoʻyildi.\nSavol boʻlsa, bemalol yozing.', tags: ['yangi', 'sotuvda', 'asboblar'] },
      { title: 'Yangi tanlov', body: '{cat} uchun yangi variant: {name}.\nBuyurtma — bir bosishda.', tags: ['yangi', 'tanlov', 'buyurtma'] },
      { title: 'Kutganingiz keldi', body: '{name} omborda.\nTez tugaydi — kechiktirmang.', tags: ['yangi', 'omborda', 'shoshiling'] },
      { title: 'Yangi partiya', body: '{name} — yangi partiya keldi.\nYetkazib berish ham bor.', tags: ['yangi', 'partiya', 'yetkazib'] },
      { title: 'Sotuvda yangi', body: 'Yangi: {name}.\nIshonchli tovar, kafolat bilan.', tags: ['yangi', 'kafolat', 'sotuvda'] },
      { title: 'Yangi asbob', body: '{name} bilan ish tezroq.\nHoziroq buyurtma bering.', tags: ['yangi', 'asbob', 'buyurtma'] },
    ],
    top: [
      { title: 'Eng koʻp sotilayotgan', body: '{name} — xaridorlar tanlovi.\nSiz ham sinab koʻring.', tags: ['top', 'xit', 'tanlov'] },
      { title: 'Xaridorlar sevimlisi', body: '{name} tez-tez buyurtma qilinadi.\nSababi — sifat va ishonch.', tags: ['xit', 'sifat', 'top'] },
      { title: 'Sotuv xiti', body: '{cat} boʻlimining xiti: {name}.\nOmborda bor — buyurtma bering.', tags: ['xit', 'top', 'omborda'] },
      { title: 'Ustalar tanlovi', body: '{name} — ustalar qayta-qayta oladi.\nSiz ham ishonch bilan tanlang.', tags: ['usta', 'tanlov', 'xit'] },
      { title: 'Talab katta', body: '{name} tez sotilyapti.\nUlgurib qoling.', tags: ['top', 'talab', 'shoshiling'] },
      { title: 'Sinalgan tanlov', body: '{name} — koʻpchilik sinab koʻrgan.\nIshonchli va chidamli.', tags: ['sinalgan', 'top', 'sifat'] },
      { title: 'Eng mashhur', body: '{cat}: eng mashhuri — {name}.\nBatafsil maʼlumot tugmada.', tags: ['mashhur', 'top', 'asboblar'] },
      { title: 'Hammaga yoqqan', body: '{name} xaridorlarga yoqdi.\nNavbat sizda.', tags: ['xit', 'top', 'buyurtma'] },
      { title: 'Xit mahsulot', body: '{name} — doʻkonimiz xiti.\nYetkazib berish yoki olib ketish.', tags: ['xit', 'yetkazib', 'top'] },
      { title: 'Ishonchli tanlov', body: 'Bilmay turibsizmi? {name} ni oling.\nXaridorlar mamnun.', tags: ['tanlov', 'top', 'sifat'] },
      { title: 'Koʻpchilik shuni oladi', body: '{name} — ommabop tanlov.\nOmborda yetarli.', tags: ['ommabop', 'top', 'omborda'] },
    ],
    stuck: [
      { title: 'Maxsus taklif', body: '{name} omborda tayyor.\nBugun buyurtma bering — tez yetkazamiz.', tags: ['taklif', 'omborda', 'yetkazib'] },
      { title: 'Omborda bor', body: '{name} — kutmasdan oling.\nSifatli tovar, qulay shart.', tags: ['omborda', 'tayyor', 'sifat'] },
      { title: 'Eʼtibor bering', body: '{cat} boʻlimida: {name}.\nKerak boʻlsa — darhol tayyorlaymiz.', tags: ['taklif', 'asboblar', 'tayyor'] },
      { title: 'Siz uchun taklif', body: '{name} sizni kutmoqda.\nSavol boʻlsa, yozing — maslahat beramiz.', tags: ['taklif', 'maslahat', 'omborda'] },
      { title: 'Tayyor tovar', body: '{name} — hoziroq olib ketish mumkin.\nNavbat yoʻq, kutish yoʻq.', tags: ['tayyor', 'olibketish', 'omborda'] },
      { title: 'Ishonchli asbob', body: '{name} — uzoq xizmat qiladi.\nOmborda bor, buyurtma bering.', tags: ['ishonchli', 'asbob', 'omborda'] },
      { title: 'Tanlovingiz uchun', body: '{name} — {cat} uchun yaxshi yechim.\nBatafsil — tugma orqali.', tags: ['tanlov', 'yechim', 'asboblar'] },
      { title: 'Kerakli asbob', body: 'Ishingizga {name} kerakmi?\nOmborda bor — bugunoq oling.', tags: ['asbob', 'omborda', 'bugun'] },
      { title: 'Qulay imkoniyat', body: '{name} — qulay shartlarda.\nYetkazib berish ham mavjud.', tags: ['imkoniyat', 'yetkazib', 'taklif'] },
      { title: 'Doʻkonimizda', body: '{name} sotuvda.\nKeling yoki onlayn buyurtma bering.', tags: ['sotuvda', 'onlayn', 'buyurtma'] },
      { title: 'Sifatli tanlov', body: '{name} — sifatli va ishonchli.\nHoziroq buyurtma qiling.', tags: ['sifat', 'tanlov', 'buyurtma'] },
    ],
  },
  ru: {
    discount: [
      { title: 'Скидка уже действует!', body: '{name} теперь дешевле.\nКачество то же, цена приятнее.', tags: ['скидка', 'акция', 'выгодно'] },
      { title: 'Цена снижена', body: '{name} по сниженной цене.\nПредложение ограничено.', tags: ['скидка', 'предложение', 'инструменты'] },
      { title: 'Выгодное предложение', body: 'Специальная цена на {name}.\nДля дома и мастерской.', tags: ['акция', 'скидка', 'мастер'] },
      { title: 'Берите дешевле', body: 'Скидка в разделе «{cat}»: {name}.\nОформите заказ сейчас.', tags: ['скидка', 'выгодно', 'заказ'] },
      { title: 'Акция!', body: '{name} со скидкой.\nНадёжный товар, удобная цена.', tags: ['акция', 'скидка', 'качество'] },
      { title: 'Время экономить', body: 'Цена на {name} снижена.\nХороший инструмент — половина работы.', tags: ['экономия', 'скидка', 'инструменты'] },
      { title: 'Не упустите скидку', body: '{name} продаётся со скидкой.\nМожет быстро закончиться.', tags: ['скидка', 'акция', 'спешите'] },
      { title: 'Специальная цена', body: '{name} дешевле только сейчас.\nДоставка или самовывоз — на выбор.', tags: ['спеццена', 'скидка', 'доставка'] },
      { title: 'Доступное предложение', body: 'Объявлена скидка на {name}.\nТо, что нужно мастеру.', tags: ['скидка', 'мастер', 'предложение'] },
      { title: 'Приятная цена', body: '«{cat}»: {name} со скидкой.\nЕсть вопросы — пишите.', tags: ['скидка', 'выгодно', 'впродаже'] },
      { title: 'Неделя скидок', body: '{name} подешевел.\nБерите нужный инструмент сейчас.', tags: ['скидка', 'неделя', 'акция'] },
    ],
    new: [
      { title: 'Новинка!', body: '{name} уже в продаже.\nБудьте среди первых.', tags: ['новинка', 'новое', 'впродаже'] },
      { title: 'Новое поступление', body: 'Новый товар в разделе «{cat}»: {name}.\nПодробнее — по кнопке.', tags: ['новинка', 'инструменты', 'поступление'] },
      { title: 'Уже на складе', body: '{name} теперь у нас.\nЗакажите — подготовим.', tags: ['новинка', 'наскладе', 'заказ'] },
      { title: 'Новый товар', body: '{name} — новая партия.\nОцените качество сами.', tags: ['новинка', 'качество', 'впродаже'] },
      { title: 'Встречайте новинку', body: 'Знакомьтесь: {name}.\nНадёжный выбор для мастеров.', tags: ['новинка', 'мастер', 'выбор'] },
      { title: 'Теперь в продаже', body: '{name} поступил в продажу.\nЕсть вопросы — пишите.', tags: ['новинка', 'впродаже', 'инструменты'] },
      { title: 'Новый выбор', body: 'Новый вариант для «{cat}»: {name}.\nЗаказ — в одно нажатие.', tags: ['новинка', 'выбор', 'заказ'] },
      { title: 'Дождались!', body: '{name} на складе.\nРазбирают быстро — не откладывайте.', tags: ['новинка', 'наскладе', 'спешите'] },
      { title: 'Новая партия', body: 'Пришла новая партия: {name}.\nЕсть доставка.', tags: ['новинка', 'партия', 'доставка'] },
      { title: 'Новое в продаже', body: 'Новинка: {name}.\nНадёжный товар с гарантией.', tags: ['новинка', 'гарантия', 'впродаже'] },
      { title: 'Новый инструмент', body: 'С {name} работа идёт быстрее.\nЗакажите прямо сейчас.', tags: ['новинка', 'инструмент', 'заказ'] },
    ],
    top: [
      { title: 'Хит продаж', body: '{name} — выбор покупателей.\nПопробуйте и вы.', tags: ['хит', 'топ', 'выбор'] },
      { title: 'Любимец покупателей', body: '{name} заказывают снова и снова.\nПричина — качество.', tags: ['хит', 'качество', 'топ'] },
      { title: 'Лидер раздела', body: 'Хит раздела «{cat}»: {name}.\nЕсть на складе — заказывайте.', tags: ['хит', 'топ', 'наскладе'] },
      { title: 'Выбор мастеров', body: '{name} мастера берут повторно.\nВыбирайте уверенно.', tags: ['мастер', 'выбор', 'хит'] },
      { title: 'Большой спрос', body: '{name} быстро раскупают.\nУспейте заказать.', tags: ['топ', 'спрос', 'спешите'] },
      { title: 'Проверенный выбор', body: '{name} уже проверили многие.\nНадёжно и долговечно.', tags: ['проверено', 'топ', 'качество'] },
      { title: 'Самый популярный', body: '«{cat}»: самый популярный — {name}.\nПодробнее по кнопке.', tags: ['популярное', 'топ', 'инструменты'] },
      { title: 'Нравится всем', body: '{name} понравился покупателям.\nТеперь ваша очередь.', tags: ['хит', 'топ', 'заказ'] },
      { title: 'Хит магазина', body: '{name} — хит нашего магазина.\nДоставка или самовывоз.', tags: ['хит', 'доставка', 'топ'] },
      { title: 'Надёжный выбор', body: 'Не знаете, что взять? Берите {name}.\nПокупатели довольны.', tags: ['выбор', 'топ', 'качество'] },
      { title: 'Берут чаще всего', body: '{name} — популярный выбор.\nНа складе достаточно.', tags: ['популярное', 'топ', 'наскладе'] },
    ],
    stuck: [
      { title: 'Специальное предложение', body: '{name} уже на складе.\nЗакажите сегодня — быстро доставим.', tags: ['предложение', 'наскладе', 'доставка'] },
      { title: 'Есть в наличии', body: '{name} — без ожидания.\nКачественный товар, удобные условия.', tags: ['вналичии', 'готово', 'качество'] },
      { title: 'Обратите внимание', body: 'В разделе «{cat}»: {name}.\nНужно — подготовим сразу.', tags: ['предложение', 'инструменты', 'готово'] },
      { title: 'Предложение для вас', body: '{name} ждёт вас.\nЕсть вопросы — пишите, подскажем.', tags: ['предложение', 'консультация', 'наскладе'] },
      { title: 'Готово к выдаче', body: '{name} можно забрать прямо сейчас.\nБез очередей и ожидания.', tags: ['готово', 'самовывоз', 'наскладе'] },
      { title: 'Надёжный инструмент', body: '{name} прослужит долго.\nЕсть на складе — заказывайте.', tags: ['надёжно', 'инструмент', 'наскладе'] },
      { title: 'Для вашей задачи', body: '{name} — хорошее решение для «{cat}».\nПодробнее по кнопке.', tags: ['выбор', 'решение', 'инструменты'] },
      { title: 'Нужный инструмент', body: 'Нужен {name} для работы?\nЕсть на складе — берите сегодня.', tags: ['инструмент', 'наскладе', 'сегодня'] },
      { title: 'Удобная возможность', body: '{name} на удобных условиях.\nДоставка тоже есть.', tags: ['возможность', 'доставка', 'предложение'] },
      { title: 'В нашем магазине', body: '{name} в продаже.\nПриходите или закажите онлайн.', tags: ['впродаже', 'онлайн', 'заказ'] },
      { title: 'Качественный выбор', body: '{name} — качественно и надёжно.\nОформите заказ сейчас.', tags: ['качество', 'выбор', 'заказ'] },
    ],
  },
};
const KINDS = ['discount', 'new', 'top', 'stuck'];
const LANGS = ['uz', 'ru'];

// Nom/kategoriya matnga qo'yishdan oldin: boshqaruv belgilari va <> olib tashlanadi, uzunligi cheklanadi
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
function fill(str, p) { return str.replace(/\{name\}/g, clip(p.name, 80) || 'Mahsulot').replace(/\{cat\}/g, clip(p.cat, 40) || (p.lang === 'ru' ? 'Каталог' : 'Katalog')); }

// variant — tartib raqami (UI «Boshqa variant»): yo'q bo'lsa — mahsulot va kun bo'yicha barqaror tanlov
function pickTemplate({ lang, kind, name, cat, pid, variant, now = Date.now() }) {
  const L = LANGS.includes(lang) ? lang : 'uz', K = KINDS.includes(kind) ? kind : 'new';
  const list = T[L][K];
  let i;
  if (Number.isInteger(variant) && variant >= 0) i = variant % list.length;
  else { const day = Math.floor((now + 5 * 3600000) / 86400000); let h = day; for (const ch of String(pid || name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; i = h % list.length; }
  const t = list[i], p = { name, cat, lang: L };
  return { title: fill(t.title, p).slice(0, 40), body: fill(t.body, p), tags: t.tags.slice(), variant: i, count: list.length, lang: L, kind: K };
}

module.exports = { TEMPLATES: T, KINDS, LANGS, pickTemplate };
