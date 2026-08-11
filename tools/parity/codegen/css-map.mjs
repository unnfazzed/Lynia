/**
 * CSS-property → React Native StyleSheet mapping rules, with an honest 4-way verdict per property:
 *   clean     — 1:1 to an RN style key (maybe camelCase / px-strip / token-lookup), fully mechanical.
 *   transform — RN needs a deterministic rewrite of the VALUE or an expansion into sibling keys
 *               (shorthands, em→px, transform-array, lineHeight×fontSize). Mechanical but non-trivial.
 *   structural— cannot live in a style object; needs a prop or a tree change (numberOfLines for
 *               ellipsis/nowrap, resizeMode for objectFit, grid→flex re-nest).
 *   drop      — no-op on native; safely removed.
 *   manual    — value shape RN can't express (gradients, filters, %-transforms) → hand-decision.
 */
export const RULES = {
  // clean 1:1 (camelCase already; RN accepts number or the same enum)
  fontSize:"clean", color:"clean", fontWeight:"clean", borderRadius:"clean",
  alignItems:"clean", justifyContent:"clean", flexDirection:"clean", flex:"clean",
  flexShrink:"clean", flexGrow:"clean", flexWrap:"clean", alignSelf:"clean",
  marginTop:"clean", marginBottom:"clean", marginLeft:"clean", marginRight:"clean",
  paddingTop:"clean", paddingBottom:"clean", paddingLeft:"clean", paddingRight:"clean",
  width:"clean", height:"clean", minWidth:"clean", minHeight:"clean",
  maxWidth:"clean", maxHeight:"clean", top:"clean", left:"clean", right:"clean", bottom:"clean",
  position:"clean", zIndex:"clean", opacity:"clean", textAlign:"clean",
  letterSpacing:"clean", textTransform:"clean", aspectRatio:"clean", overflow:"clean",
  gap:"clean", // RN 0.71+ supports gap; app is RN 0.76
  fontFamily:"clean",
  // transform: value/shorthand rewrite
  background:"transform",       // → backgroundColor (rename) unless gradient/image (→manual, caught at value time)
  backgroundColor:"clean",
  padding:"transform",          // "10px 12px" → paddingV/H (single value = clean, decided at value time)
  margin:"transform",
  border:"transform",           // "1px solid X" → borderWidth/Style/Color
  borderTop:"transform", borderBottom:"transform", borderLeft:"transform", borderRight:"transform",
  boxShadow:"transform",        // → shadow* + elevation (token → tokens.shadow.*)
  inset:"transform",            // → top/right/bottom/left (inset:0 → StyleSheet.absoluteFill)
  lineHeight:"transform",       // unitless/em → number px (×fontSize)
  transform:"manual",           // string → array; %-translate unsupported
  fontVariantNumeric:"transform", // → fontVariant:['tabular-nums']
  // structural: needs a prop or tree change, not a style key
  whiteSpace:"structural",      // nowrap → numberOfLines={1}
  textOverflow:"structural",    // ellipsis → ellipsizeMode on Text
  objectFit:"structural",       // → <Image resizeMode>
  display:"structural",         // "grid" → flex re-nest; "flex"/"inline-*" → drop (decided at value)
  placeItems:"structural",      // grid centering → alignItems+justifyContent on a flex View
  placeContent:"structural",
  gridTemplateColumns:"structural",
  // drop: web-only, no-op on native
  cursor:"drop", pointerEvents:"drop", // pointerEvents is actually a prop in RN; treated as drop-from-style
  // manual
  filter:"manual",
};

const PX = /^-?\d+(\.\d+)?px$/;
const NUM = /^-?\d+(\.\d+)?$/;

/** Refine the verdict using the actual value node (babel node) when it sharpens the call. */
export function refine(key, valueText) {
  if (valueText == null) return RULES[key] || "unknown";
  const v = String(valueText).trim();
  switch (key) {
    case "background":
      if (/gradient|url\(/.test(v)) return "manual";
      return "transform"; // rename to backgroundColor
    case "padding":
    case "margin":
      // single token (one number/px/var) is a clean rename; multi-value shorthand needs expansion
      return /\s/.test(v.replace(/var\([^)]*\)/g, "x")) ? "transform" : "clean";
    case "display":
      if (/grid/.test(v)) return "structural";
      return "drop"; // flex / inline-flex / block → drop (RN is flex by default)
    case "position":
      if (/fixed|sticky/.test(v)) return "manual";
      return "clean";
    case "overflow":
      return /auto|scroll/.test(v) ? "structural" : "clean"; // scroll needs ScrollView
    case "lineHeight":
      return NUM.test(v) || /em|var\(/.test(v) ? "transform" : (PX.test(v) ? "clean" : "transform");
    default:
      return RULES[key] || "unknown";
  }
}
