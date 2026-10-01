/* Loads the kit's components/shell/TabBar.jsx (the single source of truth) straight from source,
   so this handoff never drifts from the kit. Resolves window.TBReady → { TabBar, TabGlyph, APP_TABS, RIDER_TABS, TAB_BAR_SPACE }. */
window.TBReady = fetch("../../components/shell/TabBar.jsx").then(function (r) { return r.text(); }).then(function (src) {
  src = src.replace(/^import .*$/gm, "").replace(/^export /gm, "");
  var code = Babel.transform(src, { presets: ["react"] }).code;
  return new Function("React", code + ";return {TabBar:TabBar,TabGlyph:TabGlyph,TabIllus:TabIllus,APP_TABS:APP_TABS,RIDER_TABS:RIDER_TABS,TAB_BAR_SPACE:TAB_BAR_SPACE,TAB_BAR_H:TAB_BAR_H,TAB_BAR_GAP:TAB_BAR_GAP};")(React);
});
