// v25.8 — AI-REKLAMA: POST SHABLONLARI (faqat ma'lumot; chizish — js/ai-reklama.js → airDraw).
// v25.8 (egasi tanlovi): Chegirma, Yangi (oq), Katta narx, Brend.
// Har shablon 1:1 (1080×1080) va 9:16 (1080×1920 / video 720×1280) da ishlaydi. Koordinatalar 1080 kenglikka nisbatan.
// logoPlate: rangli fonda logo oq tagliqda.
// layout: hero | fresh | price | frame ; badge: shablonniki (sabab noma'lum bo'lsa) — odatda sababga qarab
// Mahsulot rasmi har doim oq kartochkada, yumshoq soya bilan — rasm oq yoki tasodifiy fonda bo'lsa ham chiroyli chiqadi.
window.AIR_TEMPLATES = [
  { id: 'chegirma', name: 'Chegirma', layout: 'hero', badge: 'discount', dark: true,
    bg: { type: 'radial', stops: ['#3b0f4a', '#1a1033'] }, glow: ['#ec4899', '#8b5cf6'],
    ink: '#ffffff', sub: '#e9d5ff', accent: ['#ec4899', '#8b5cf6'], priceInk: '#ffffff', badgeBg: ['#f43f5e', '#ec4899'], badgeInk: '#ffffff' },
  // v25.8: «Yangi (oq)» — oq fon, ramkasiz; mahsulot fonning o'zida «havoda», ostida och soya; rang faqat urg'uda
  { id: 'yangioq', name: 'Yangi (oq)', layout: 'fresh', badge: 'new', dark: false,
    bg: { type: 'solid', stops: ['#ffffff'] }, glow: ['#f9a8d4', '#c4b5fd'],
    ink: '#111827', sub: '#4b5563', accent: ['#ec4899', '#8b5cf6'], priceInk: '#111827', badgeBg: ['#ec4899', '#8b5cf6'], badgeInk: '#ffffff' },
  { id: 'kattanarx', name: 'Katta narx', layout: 'price', badge: 'auto', dark: false,
    bg: { type: 'linear', stops: ['#ec4899', '#8b5cf6'] }, glow: ['#ffffff', '#fbcfe8'],
    ink: '#ffffff', sub: '#fce7f3', accent: ['#ec4899', '#8b5cf6'], priceInk: '#1e1b4b', badgeBg: ['#ffffff', '#fdf2f8'], badgeInk: '#be185d', band: '#ffffff', logoPlate: true },
  { id: 'brend', name: 'Brend', layout: 'frame', badge: 'auto', dark: true,
    bg: { type: 'solid', stops: ['#0f172a'] }, glow: ['#f59e0b', '#1e293b'],
    ink: '#ffffff', sub: '#cbd5e1', accent: ['#f59e0b', '#fbbf24'], priceInk: '#fbbf24', badgeBg: ['#f59e0b', '#d97706'], badgeInk: '#1f1300', frame: '#f59e0b' },
];
// Yozuvlar (lotin o'zbekcha / rus). Raqamlar faqat narx va foizda (tizimdan).
window.AIR_LABELS = {
  uz: { newIn: 'YANGI KELDI', new: 'YANGI', top: 'XIT', special: 'MAXSUS TAKLIF', order: 'Buyurtma bering', inStock: 'Omborda bor', old: 'Eski narx' },
  ru: { newIn: 'НОВИНКА', new: 'НОВИНКА', top: 'ХИТ', special: 'СПЕЦПРЕДЛОЖЕНИЕ', order: 'Заказать', inStock: 'В наличии', old: 'Старая цена' },
};
