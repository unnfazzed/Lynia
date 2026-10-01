// Calm Mint v2 tokens used by Browse v2. No new tokens.
export const C = {
  ink:'#14181B', muted:'#5B6670', line:'#E2E6EA', hairline:'#F0F2F4', surface:'#F6F7F8', skeleton:'#EEF1F3',
  brand:'#00B14F', greenText:'#006630', cta:'#00812F', ctaPressed:'#006B27', mint:'#E9F8EF',
  forest:'#063B22', forestSub:'#BFE6CD', highlight:'#FFD23F', highlightInk:'#3D3100', highlightWash:'#FFF6D6', starStroke:'#C99500',
  free:'#4B2FBF', freeWash:'#ECE8FF', coral:'#FF6B4A', sky:'#3EC1F3',
  danger:'#C0392B', dangerWash:'#FAEDEB', dangerInk:'#8F2418', dim:'rgba(20,24,27,0.45)',
  tile:{"food":"#FFD9CC","shops":"#DDD5FF","pharmacy":"#C5E9DF"},
} as const;
// [fill, ink] per shop kind; Food used for restaurants without a photo
export const KIND = {
  "Pharmacy": [
    "#DFF4EE",
    "#006630"
  ],
  "Grocery": [
    "#E9F8EF",
    "#006630"
  ],
  "Butchery": [
    "#FFE7E0",
    "#8F2418"
  ],
  "Fashion": [
    "#FFE4F2",
    "#8A1F5C"
  ],
  "Auto parts": [
    "#E3F6FE",
    "#0B5A7A"
  ],
  "Hardware": [
    "#F6F7F8",
    "#14181B"
  ],
  "Electronics": [
    "#F6F7F8",
    "#14181B"
  ],
  "Other": [
    "#F6F7F8",
    "#14181B"
  ],
  "Food": [
    "#FFE7E0",
    "#8F2418"
  ]
} as const;
export const R = { field:12, card:16, image:14, thumb:16, sheet:24, header:28, pill:999 } as const;
export const TARGET = { min:44, primary:52 } as const;
export const GUTTER = 16;
