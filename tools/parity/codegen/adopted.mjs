/**
 * Registry of screens ADOPTED via mock→RN codegen. The structural-snapshot guardrail
 * (apps/api/src/parity/structure-snapshot.spec.ts) iterates the EXPANDED form of this list
 * (`expandAdopted()`): each adopted view's generated `.view.tsx` must stay structurally congruent to
 * its mock. Screens absent here are NOT gated by the structural guardrail (it no-ops for them, exactly
 * like the screen-inventory allowlist) — they are still covered by the other three guardrails.
 *
 * TWO SHAPES of entry — a screen is either a single view, or a MULTI-STATE container:
 *
 * ── single-view screen ── (LJ.help, RC.cart_empty): one mock, one `.view.tsx`.
 *   key            parity key (matches screens.generated.json)
 *   mockFile       path (from repo root) of the mock bundle
 *   component      the mock component name to extract
 *   componentName  the exported RN component name
 *   viewFile       where the generated `.view.tsx` is written (and read by the guardrail)
 *   container      the app screen that renders <componentName/> and owns all state/logic
 *   uiImport       import specifier for the app DS primitives (relative to viewFile)
 *   propsParam     the component's destructured props param + TS type
 *   propsType      the exported TS prop/data types
 *   bind({t,expr,attrsOf,wrap,traverse}) → a Babel visitor applying the DATA SEAM (structure-neutral)
 *
 * ── multi-state screen ── (RC.list): batch 2 found most screens are NOT standalone — they are
 *   loading / empty / error / data CONTAINERS, and each STATE is its own mock key
 *   (RC.list_loading / RC.list_empty / RC.list_error / RC.list). One container, N presentational
 *   state-views, each 0-residual against ITS OWN state's mock. Such an entry carries the shared
 *   `key` (the screen's canonical/data key), `container`, `mockFile`, `uiImport`, and:
 *     states[]    the ADOPTED states — each a single-view spec (state, key, component, componentName,
 *                 viewFile, [propsParam, propsType, bind, hoist, mockFile, uiImport]). Inherits the
 *                 screen's mockFile/uiImport/container unless a state overrides them. `expandAdopted()`
 *                 flattens each into a check UNIT the guardrail gates independently.
 *     deferred[]  states NOT adopted, recorded honestly with a `reason` (superset/primitive-gap/dead
 *                 action). These are documentation only — never gated, never generated — so the
 *                 tracker and `cli.mjs check` can report per-state disposition without forcing a
 *                 divergent view into the app. (CLAUDE.md "Pixel parity": honesty over volume.)
 *
 * The container renders the correct state-view from its EXISTING state machine (loading→LoadingView,
 * …), passing each its data seam — composition, not a rewrite: the queries, pagination and FlatList
 * virtualization stay exactly as they were.
 */
export const ADOPTED = [
  {
    key: "LJ.help",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    component: "Help",
    componentName: "HelpView",
    viewFile: "apps/mobile/app/help/help.view.tsx",
    container: "apps/mobile/app/help/index.tsx",
    uiImport: "../../src/ui",
    propsParam: "{ topics, query, onChangeQuery, onBack, onTopicPress, onWhatsApp }: HelpViewProps",
    propsType: [
      "/** A help topic, tuple-shaped to mirror the mock's `[icon, title, sub]` rows verbatim. */",
      "export type HelpTopicRow = [IconName, string, string];",
      "export type HelpViewProps = {",
      "  topics: HelpTopicRow[];",
      "  query: string;",
      "  onChangeQuery: (v: string) => void;",
      "  onBack: () => void;",
      "  onTopicPress: (index: number) => void;",
      "  onWhatsApp: () => void;",
      "};",
    ].join("\n"),
    bind: ({ t, expr, wrap }) => ({
      JSXOpeningElement(path) {
        const name = path.node.name.name;
        if (name === "Field") {
          const keep = path.node.attributes.filter(
            (a) => !(a.type === "JSXAttribute" && ["value", "onChange"].includes(a.name.name)),
          );
          keep.push(t.jsxAttribute(t.jsxIdentifier("value"), t.jsxExpressionContainer(expr("query"))));
          keep.push(t.jsxAttribute(t.jsxIdentifier("onChangeText"), t.jsxExpressionContainer(expr("onChangeQuery"))));
          path.node.attributes = keep;
        }
        if (name === "AppBar") {
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onBack"), t.jsxExpressionContainer(expr("onBack"))));
        }
      },
      // Topic cards: give the .map callback an index and wrap each Card in a Pressable (transparent
      // to the structural guardrail) so a tap fires onTopicPress(i). The React key moves to the wrap.
      CallExpression(path) {
        const callee = path.node.callee;
        if (callee.type !== "MemberExpression" || callee.property.name !== "map") return;
        const arrow = path.node.arguments[0];
        if (!arrow || (arrow.type !== "ArrowFunctionExpression" && arrow.type !== "FunctionExpression")) return;
        if (arrow.params.length < 2) arrow.params.push(t.identifier("i"));
        const card = arrow.body.type === "JSXElement" ? arrow.body : null;
        if (!card || card.openingElement.name.name !== "Card") return;
        // move key off the Card onto the Pressable
        const keyAttr = card.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "key");
        card.openingElement.attributes = card.openingElement.attributes.filter((a) => a !== keyAttr);
        const wrapped = wrap(card, "Pressable", `onPress={() => onTopicPress(i)} accessibilityRole="button"`);
        if (keyAttr) wrapped.openingElement.attributes.unshift(keyAttr);
        wrapped.openingElement.attributes.push(t.jsxAttribute(t.jsxIdentifier("accessibilityLabel"), t.jsxExpressionContainer(expr("t"))));
        arrow.body = wrapped;
      },
      // The WhatsApp card (the one with the accent-wash fill) → tappable, opens WhatsApp.
      JSXElement(path) {
        const open = path.node.openingElement;
        if (open.name.name !== "Card") return;
        const style = open.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "style");
        const obj = style?.value?.expression;
        const isWash = obj?.type === "ObjectExpression" && obj.properties.some(
          (p) => p.type === "ObjectProperty" && (p.key.name || p.key.value) === "backgroundColor",
        );
        if (!isWash) return;
        if (path.parentPath.node.type === "JSXElement" && path.parentPath.node.openingElement.name.name === "Pressable") return;
        path.replaceWith(wrap(path.node, "Pressable", `onPress={onWhatsApp} accessibilityRole="button" accessibilityLabel="Chat with us on WhatsApp"`));
        path.skip();
      },
    }),
    hoist: ["topics"],
  },
  {
    // RC.cart_empty — the empty-cart early-return of app/food/cart.tsx. The mock draws the empty state
    // inside a `Pad > Card` (the owner-decided empty-state wrapper), so the generated view carries that
    // Screen > AppBar > Pad(View) > Card > EmptyState > Button tree by construction.
    key: "RC.cart_empty",
    mockFile: "packages/design/explorations/restaurants/r-customer-a.jsx",
    component: "cart_empty",
    componentName: "CartEmptyView",
    viewFile: "apps/mobile/app/food/cart-empty.view.tsx",
    container: "apps/mobile/app/food/cart.tsx",
    uiImport: "../../src/ui",
    propsParam: "{ onBack, onBrowse }: CartEmptyViewProps",
    propsType: [
      "export type CartEmptyViewProps = {",
      "  onBack: () => void;",
      "  onBrowse: () => void;",
      "};",
    ].join("\n"),
    bind: ({ t, expr }) => ({
      JSXOpeningElement(path) {
        const name = path.node.name.name;
        if (name === "AppBar") {
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onBack"), t.jsxExpressionContainer(expr("onBack"))));
        }
        if (name === "Button") {
          // The kit's web Button uses `onClick={nop}`; the app Button takes `onPress`. Drop the web
          // handler (and its `nop` reference) and wire the container's browse action.
          path.node.attributes = path.node.attributes.filter((a) => !(a.type === "JSXAttribute" && a.name.name === "onClick"));
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onPress"), t.jsxExpressionContainer(expr("onBrowse"))));
        }
      },
    }),
  },
  {
    // RC.list — the food restaurant-list screen (app/food/index.tsx). The first MULTI-STATE adoption:
    // its state machine (loading / empty / error / data) maps each state to its own RC.list* mock key.
    // Only the states that are a CLEAN structural match given Foundation-A's primitives are adopted;
    // the rest are DEFERRED with a precise reason (below) rather than forced into a divergent view.
    key: "RC.list",
    container: "apps/mobile/app/food/index.tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-a.jsx",
    uiImport: "../../src/ui",
    states: [
      {
        // R1·2 list_loading — a full-screen content skeleton (its own Screen), drawn while the cold
        // load has NO data yet (not even a stale copy). Pure presentational: no data seam, no handlers,
        // no props — the mock is fixed skeleton geometry, so the generated view is 0-residual and needs
        // no `bind`. The container early-returns it (like RC.cart_empty), replacing the whole screen so
        // the layout does not jump when data lands.
        state: "loading",
        key: "RC.list_loading",
        component: "list_loading",
        componentName: "FoodListLoadingView",
        viewFile: "apps/mobile/app/food/food-list.loading.view.tsx",
      },
    ],
    // Deferred states — recorded, not forced (CLAUDE.md "Pixel parity": honesty over volume). Each is a
    // genuine wall, not laziness; adopting anyway would ship a divergent or dishonest screen.
    deferred: [
      {
        state: "empty",
        key: "RC.list_empty",
        reason:
          "the mock draws a 'Notify me when they open' primary action with NO backend to honor it (a permanently dead button — CLAUDE.md forbids promising an action the app can't deliver), plus a live 'Belgravia · 22:40' AppBar sub; it also collapses the app's two honest empty conditions (open-now-filtered-empty vs no-restaurants-at-all) into one. Needs a notify-when-open feature before it can adopt.",
      },
      {
        state: "error",
        key: "RC.list_error",
        reason:
          "the mock wraps the screen in `<Screen banner={<Banner tone=\"offline\"/>}>`, but the app's DS `Screen` primitive (src/ui/index.tsx) has NO `banner` slot — the generated view would not typecheck. This is a Foundation-A primitive gap (Screen must grow a banner slot), not app drift.",
      },
      {
        state: "data",
        key: "RC.list",
        reason:
          "the mock header (a fixed 'DELIVER TO' address, four STATIC sort pills, a static '5 places' count) supersets the app's LIVE header (geolocated deliver-to, one functional Open-now toggle, search navigation, cursor pagination). The list body itself is fine — FlatList≡map (normalize.mjs) makes the virtualized list congruent to the mock's `{REST.map(...)}` — but adopting the whole state would either revert live behavior or superset the mock. Deferred on the header, not the list.",
      },
    ],
  },
];

/**
 * Flatten the registry into per-view CHECK UNITS — the shape the transpiler + guardrail consume. A
 * single-view screen yields one unit (state:null); a multi-state screen yields one unit per ADOPTED
 * state (deferred states are documentation only and never appear here). Each unit carries `screen`
 * (the owning screen's key) and `state` so `cli.mjs check` can group per-screen, per-state.
 */
export function expandAdopted() {
  const units = [];
  for (const e of ADOPTED) {
    if (Array.isArray(e.states)) {
      for (const st of e.states) {
        units.push({
          screen: e.key,
          state: st.state,
          key: st.key,
          mockFile: st.mockFile || e.mockFile,
          component: st.component,
          componentName: st.componentName,
          viewFile: st.viewFile,
          container: st.container || e.container,
          uiImport: st.uiImport || e.uiImport,
          propsParam: st.propsParam,
          propsType: st.propsType,
          bind: st.bind,
          hoist: st.hoist,
        });
      }
    } else {
      units.push({ screen: e.key, state: null, ...e });
    }
  }
  return units;
}

/** All (screen, state, reason) rows that are deliberately NOT adopted — for reporting/tracking. */
export function deferredStates() {
  const out = [];
  for (const e of ADOPTED) {
    for (const d of e.deferred || []) out.push({ screen: e.key, ...d });
  }
  return out;
}

/** Find one check unit by its (per-state) parity key — `gen RC.list_loading`, `gen LJ.help`, etc. */
export function findAdopted(key) {
  return expandAdopted().find((u) => u.key === key);
}
