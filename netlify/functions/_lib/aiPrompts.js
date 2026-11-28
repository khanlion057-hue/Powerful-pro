// v25.8 — AI-REKLAMA: PROMPT MATNLARI (faqat matn; provayder kodi — _lib/aiText.js).
// AI'ga FAQAT: mahsulot nomi, kategoriya, qisqa tavsif va post turi beriladi. Narx, mijoz, ta'minotchi, tannarx,
// telefon, manzil va filial nomi HECH QACHON berilmaydi (aiText.safeInput tozalaydi; test bilan mustahkamlangan).
'use strict';

const KIND_TEXT = {
  uz: { discount: 'chegirmadagi mahsulot', new: 'yangi kelgan mahsulot', top: 'eng koʻp sotilayotgan mahsulot', stuck: 'maxsus taklif (omborda tayyor mahsulot)' },
  ru: { discount: 'товар со скидкой', new: 'новое поступление', top: 'хит продаж', stuck: 'специальное предложение (товар в наличии)' },
};

const SYSTEM = {
  uz: [
    'Siz Telegram kanal uchun qisqa reklama matni yozasiz. Til: oʻzbek tili, faqat LOTIN yozuvi (kirill harflari ishlatilmaydi).',
    'Javob FAQAT JSON boʻlsin, boshqa hech narsa yozmang: {"title": "...", "body": "...", "tags": ["...", "..."]}.',
    'title — 40 belgidan oshmasin. body — 2 yoki 3 qisqa qator (qatorlar \\n bilan). tags — 3–5 ta soʻz, # belgisisiz, boʻshliqsiz.',
    'MUTLAQO TAQIQLANADI: har qanday raqam, narx, foiz, valyuta, telefon, manzil, doʻkon nomi, sana, «bepul», «kafolat muddati».',
    'Narx va doʻkon maʼlumotini tizim oʻzi qoʻshadi. Yolgʻon vaʼda bermang, ortiqcha undov belgisi qoʻymang, emoji ishlatmang.',
  ].join('\n'),
  ru: [
    'Вы пишете короткий рекламный текст для Telegram-канала. Язык: русский.',
    'Ответ ТОЛЬКО JSON, без другого текста: {"title": "...", "body": "...", "tags": ["...", "..."]}.',
    'title — не длиннее 40 символов. body — 2 или 3 короткие строки (через \\n). tags — 3–5 слов, без символа #, без пробелов.',
    'СТРОГО ЗАПРЕЩЕНО: любые цифры, цены, проценты, валюта, телефоны, адреса, название магазина, даты, «бесплатно», сроки гарантии.',
    'Цену и данные магазина система добавит сама. Не давайте ложных обещаний, без лишних восклицаний и без эмодзи.',
  ].join('\n'),
};

function userPrompt({ lang, kind, name, cat, desc }) {
  const L = lang === 'ru' ? 'ru' : 'uz';
  const k = KIND_TEXT[L][kind] || KIND_TEXT[L].new;
  return L === 'ru'
    ? `Тип поста: ${k}.\nТовар: ${name}\nКатегория: ${cat || '—'}\nОписание: ${desc || '—'}`
    : `Post turi: ${k}.\nMahsulot: ${name}\nKategoriya: ${cat || '—'}\nTavsif: ${desc || '—'}`;
}

function buildPrompt(input) {
  const L = input.lang === 'ru' ? 'ru' : 'uz';
  return { system: SYSTEM[L], user: userPrompt({ ...input, lang: L }) };
}

module.exports = { buildPrompt, KIND_TEXT };
