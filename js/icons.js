// Ícones e cores selecionáveis para Hábitos. Estilo consistente com o resto do
// app: SVG stroke, viewBox 24x24, stroke-width 1.6.

const HABIT_ICONS = {
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6.5 6.5l11 11M4 8l4-4M20 16l-4 4M2 6l4-4M22 18l-4 4M9 4L4 9l11 11 5-5z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
  guitar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="16" r="4"/><path d="M11 13L19 5m0 0h-4m4 0v4"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z"/></svg>',
  droplet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2c4 5 7 9.5 7 13a7 7 0 01-14 0c0-3.5 3-8 7-13z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 12.8A9 9 0 1111.2 3a7.2 7.2 0 009.8 9.8z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21s-7-4.5-9.5-9C.9 8.2 2.3 4.3 6 4.3c2 0 3.9 1.4 6 4.3 2.1-2.9 4-4.3 6-4.3 3.7 0 5.1 3.9 3.5 7.7-2.5 4.5-9.5 9-9.5 9z"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>',
  coffee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8h14v6a4 4 0 01-4 4H7a4 4 0 01-4-4z"/><path d="M17 9h2a2 2 0 010 4h-2"/><path d="M6 2v2M10 2v2M14 2v2"/></svg>',
  run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="13.5" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M5 21l3.5-6 2.8 1.8L13 12M9 11.5L11.5 8l3 1.5 3.5-1M13 12l3 2 2.5 6"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 21V4"/><path d="M5 4h13l-3 4.5L18 13H5"/></svg>',
};

const HABIT_ICON_KEYS = Object.keys(HABIT_ICONS);

const HABIT_COLORS = [
  { key: 'gold', hex: '#D4AF37' },
  { key: 'blue', hex: '#5C7FE0' },
  { key: 'rose', hex: '#8C4A56' },
  { key: 'teal', hex: '#4FA890' },
  { key: 'purple', hex: '#8B6FD4' },
  { key: 'orange', hex: '#D98A4A' },
];

const HM_CATEGORIES = [
  { key: 'saude', name: 'Saúde e Força' },
  { key: 'hobbies', name: 'Hobbies' },
  { key: 'trabalho', name: 'Trabalho' },
];

function habitColorHex(key) {
  const found = HABIT_COLORS.find((c) => c.key === key);
  return found ? found.hex : HABIT_COLORS[0].hex;
}
function habitIconSvg(key) {
  return HABIT_ICONS[key] || HABIT_ICONS.target;
}
