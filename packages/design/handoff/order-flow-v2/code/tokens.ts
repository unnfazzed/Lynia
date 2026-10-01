/* LyniaGo Order flow v2.1 tokens — Calm Mint v2 + After Send v2 only. No new colour tokens. */
export const ofColor = {
  ink: '#14181B', muted: '#5B6670', line: '#E2E6EA', surface: '#F6F7F8', bg: '#FFFFFF', skeleton: '#EEF1F3',
  accent: '#00B14F',        // fills only: route, track, discs, rider glow
  accentText: '#006630',    // green text, Edit, done steps
  cta: '#00812F', ctaPressed: '#006B27',
  mint: '#E9F8EF', forest: '#063B22', forestSub: '#BFE6CD',
  highlight: '#FFD23F', highlightInk: '#3D3100', starStroke: '#C99500', highlightWash: '#FFF6D6',
  danger: '#C0392B', dangerWash: '#FAEDEB', dangerInk: '#8F2418',
  tile: { food: '#FFD9CC', shops: '#DDD5FF', pharmacy: '#C5E9DF' },
} as const;
export const ofAlpha = { accentGlow: 'rgba(0,177,79,0.20)', dropHalo: 'rgba(192,57,43,0.16)', scrim: 'rgba(20,24,27,0.45)' } as const;
export const ofRadius = { field: 12, card: 16, reviewCard: 16, sheet: 24, modalSheet: 20, doorCard: 20, codePanel: 20, pill: 999, tag: 6 } as const;
export const ofSpace = { gutter: 16, stack: 14, grid: 8 } as const;
export const ofTarget = { min: 44, primary: 52 } as const;
export const ofType = {   // Inter; tabular numerals on money, codes, times
  etaHero: { size: 30, weight: '800', letterSpacing: -0.9 },
  stageTitle: { size: 21, weight: '800', letterSpacing: -0.5, lineHeight: 25 },
  codeBig: { size: 58, size320: 48, weight: '800', maxFontScale: 1.0 },
  codeCard: { size: 28, weight: '800', maxFontScale: 1.15 },
  headerTitle: { size: 16, weight: '800' }, button: { size: 16, weight: '800' }, smButton: { size: 14, weight: '800' },
  riderName: { size: 17, weight: '800' }, venueName: { size: 16, weight: '800' }, body: { size: 14 }, meta: { size: 13 },
  label: { size: 12, weight: '700', letterSpacing: 0.84, uppercase: true }, trackLabel: { size: 12, weight: '600' },
} as const;
export const ofShadow = { sheet: '0 -8px 28px rgba(20,24,27,.14)', pin: '0 6px 18px rgba(20,24,27,.18)', toast: '0 4px 16px rgba(20,24,27,.10)' } as const;
export const ofCode = { delivery: 6, pickup: 6, group: 3, tries: 5 } as const; // every code 6 digits, shown 3+3
