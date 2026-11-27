// v25.8 — AI-REKLAMA: POST SHABLONLARI (faqat ma'lumot; chizish — js/ai-reklama.js → airDraw).
// Har shablon 1:1 (1080×1080) va 9:16 (1080×1920 / video 720×1280) da ishlaydi. Koordinatalar 1080 kenglikka nisbatan.
// logoPlate: rangli fonda logo oq tagliqda.
// layout: hero | price | collage | minimal | frame ; badge: auto (sababga qarab) | discount | new | top | special | none
// Mahsulot rasmi har doim oq kartochkada, yumshoq soya bilan — rasm oq yoki tasodifiy fonda bo'lsa ham chiroyli chiqadi.
window.AIR_TEMPLATES = [
  { id: 'chegirma', name: 'Chegirma', layout: 'hero', badge: 'discount', dark: true,
    bg: { type: 'radial', stops: ['#3b0f4a', '#1a1033'] }, glow: ['#ec4899', '#8b5cf6'],
    ink: '#ffffff', sub: '#e9d5ff', accent: ['#ec4899', '#8b5cf6'], priceInk: '#ffffff', badgeBg: ['#f43f5e', '#ec4899'], badgeInk: '#ffffff' },
  { id: 'yangi', name: 'Yangi', layout: 'hero', badge: 'new', dark: false,
    bg: { type: 'linear', stops: ['#f5f3ff', '#ffffff'] }, glow: ['#c4b5fd', '#f9a8d4'],
    ink: '#1e1b4b', sub: '#6d28d9', accent: ['#8b5cf6', '#ec4899'], priceInk: '#1e1b4b', badgeBg: ['#8b5cf6', '#ec4899'], badgeInk: '#ffffff' },
  { id: 'top', name: 'Top', layout: 'hero', badge: 'top', dark: true,
    bg: { type: 'radial', stops: ['#1f2937', '#0b0f19'] }, glow: ['#f59e0b', '#b45309'],
    ink: '#ffffff', sub: '#fcd34d', accent: ['#f59e0b', '#d97706'], priceInk: '#fbbf24', badgeBg: ['#fbbf24', '#f59e0b'], badgeInk: '#1f1300' },
  { id: 'minimal', name: 'Minimal', layout: 'minimal', badge: 'auto', dark: false,
    bg: { type: 'solid', stops: ['#ffffff'] }, glow: ['#e2e8f0', '#f1f5f9'],
    ink: '#0f172a', sub: '#64748b', accent: ['#0f172a', '#334155'], priceInk: '#0f172a', badgeBg: ['#0f172a', '#334155'], badgeInk: '#ffffff' },
  { id: 'kattanarx', name: 'Katta narx', layout: 'price', badge: 'auto', dark: false,
    bg: { type: 'linear', stops: ['#ec4899', '#8b5cf6'] }, glow: ['#ffffff', '#fbcfe8'],
    ink: '#ffffff', sub: '#fce7f3', accent: ['#ec4899', '#8b5cf6'], priceInk: '#1e1b4b', badgeBg: ['#ffffff', '#fdf2f8'], badgeInk: '#be185d', band: '#ffffff', logoPlate: true },
  { id: 'kollaj', name: 'Kollaj', layout: 'collage', badge: 'auto', dark: true,
    bg: { type: 'linear', stops: ['#2e1065', '#4c1d95'] }, glow: ['#a78bfa', '#f472b6'],
    ink: '#ffffff', sub: '#ddd6fe', accent: ['#f472b6', '#a78bfa'], priceInk: '#ffffff', badgeBg: ['#f472b6', '#ec4899'], badgeInk: '#ffffff' },
  { id: 'maxsus', name: 'Maxsus taklif', layout: 'hero', badge: 'special', dark: true,
    bg: { type: 'linear', stops: ['#f97316', '#db2777'] }, glow: ['#fde68a', '#fbcfe8'],
    ink: '#ffffff', sub: '#ffedd5', accent: ['#ffffff', '#fff7ed'], priceInk: '#9a3412', priceOnPill: true, badgeBg: ['#ffffff', '#fff7ed'], badgeInk: '#c2410c', logoPlate: true },
  { id: 'brend', name: 'Brend', layout: 'frame', badge: 'auto', dark: true,
    bg: { type: 'solid', stops: ['#0f172a'] }, glow: ['#f59e0b', '#1e293b'],
    ink: '#ffffff', sub: '#cbd5e1', accent: ['#f59e0b', '#fbbf24'], priceInk: '#fbbf24', badgeBg: ['#f59e0b', '#d97706'], badgeInk: '#1f1300', frame: '#f59e0b' },
];
// Yozuvlar (lotin o'zbekcha / rus). Raqamlar faqat narx va foizda (tizimdan).
window.AIR_LABELS = {
  uz: { new: 'YANGI', top: 'XIT', special: 'MAXSUS TAKLIF', order: 'Buyurtma bering', inStock: 'Omborda bor', old: 'Eski narx' },
  ru: { new: 'НОВИНКА', top: 'ХИТ', special: 'СПЕЦПРЕДЛОЖЕНИЕ', order: 'Заказать', inStock: 'В наличии', old: 'Старая цена' },
};
