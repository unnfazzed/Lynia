/**
 * CSS custom-property → `tokens.*` path map (the "VALUES" authority-chain step: never hardcode a
 * value a token defines). Every `var(--x)` a mock uses resolves to a member path off the `tokens`
 * namespace exported by `@lynia/shared` (`export * as tokens from "./design-tokens"`), so the
 * generated RN reads `tokens.color.ink`, `tokens.radius.input`, `tokens.shadow.card`, … exactly the
 * way hand-written mobile screens already do.
 *
 * Keep this in lock-step with packages/shared/src/design-tokens.ts. A var that appears in a mock but
 * is missing here is reported by the transpiler as an UNRESOLVED decl (never silently emitted as a
 * raw `var()` string, which is invalid on React Native) — that is the signal to add the mapping.
 */
export const TOKEN = {
  // colours (packages/design/tokens/colors.css → design-tokens.ts `color`)
  "--ink": "color.ink",
  "--muted": "color.muted",
  "--bg": "color.bg",
  "--surface": "color.surface",
  "--line": "color.line",
  "--accent": "color.accent",
  "--accent-pressed": "color.accentPressed",
  "--accent-text": "color.accentText",
  "--accent-wash": "color.accentWash",
  "--cta": "color.cta",
  "--cta-pressed": "color.ctaPressed",
  "--highlight": "color.highlight",
  "--highlight-wash": "color.highlightWash",
  "--highlight-ink": "color.highlightInk",
  "--highlight-border": "color.highlightBorder",
  "--danger": "color.danger",
  "--danger-wash": "color.dangerWash",
  "--danger-ink": "color.dangerInk",
  "--on-accent": "color.onAccent",
  "--success": "color.success",
  // radii (spacing.css → `radius`)
  "--radius-input": "radius.input",
  "--radius-card": "radius.card",
  "--radius-pill": "radius.pill",
  "--radius-button": "radius.button",
  // spacing (spacing.css → `space`)
  "--space-xs": "space.xs",
  "--space-sm": "space.sm",
  "--space-md": "space.md",
  "--space-lg": "space.lg",
  "--space-xl": "space.xl",
  "--space-screen": "space.screen",
  // elevation (spacing.css → `shadow`) — spread, not a scalar (see transpile boxShadow handling)
  "--shadow-card": "shadow.card",
  "--shadow-sheet": "shadow.sheet",
  "--shadow-menu": "shadow.menu",
  // type (type.css → `font`)
  "--text-display": "font.size.display",
  "--text-h1": "font.size.h1",
  "--text-h2": "font.size.h2",
  "--text-title": "font.size.title",
  "--text-body": "font.size.body",
  "--text-body-lg": "font.size.bodyLg",
  "--text-caption": "font.size.caption",
  "--text-label": "font.size.label",
  "--text-micro": "font.size.micro",
  "--font-sans": "font.family",
  "--font-wordmark": "font.wordmark",
};

/** Tokens whose value is a multi-prop object (RN shadow*), spread into the style rather than assigned. */
export const SPREAD_TOKENS = new Set(["shadow.card", "shadow.sheet", "shadow.menu"]);
