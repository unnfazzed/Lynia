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
/**
 * Shared data seam for the role fork (LJ.role_select + its food-off twin role_select_flag_off). The
 * mock's inline `Opt` cards are STATIC (a frozen `selected={true/false}`, a web `onClick={noop}` on the
 * Button); wire each option to its LIVE `selected` state and a transparent `Pressable` tap handler —
 * distinguished by the rider option's `icon="bike"` — and swap the Button's frozen `onClick`/`label` for
 * the container's `onContinue` + dynamic `continueLabel`. Structure-neutral: the Pressable wrap is
 * transparent to the guardrail and the `Opt` call stays an opaque OPT leaf, so mock↔view congruence holds
 * by construction; only leaf values / an interaction wrapper change. The frozen option COPY (titles,
 * descriptions) is kept verbatim from each mock — the flag-on and flag-off views carry their own drawn
 * copy, the container picking the view by `restaurantsEnabled`.
 */
function roleSelectBind({ t, expr, wrap }) {
  return {
    // The mock's nested `Opt` presentational component keeps its destructured param — untyped in the
    // .jsx, but implicit-any in the generated .tsx. Annotate it with the emitted `RoleOptionData` type
    // (icon/title/desc/selected) so the view typechecks under strict mode; the param stays structurally
    // opaque (the Opt call is an OPT leaf), so this is a leaf-level seam, not a tree change.
    VariableDeclarator(path) {
      if (path.node.id.type !== "Identifier" || path.node.id.name !== "Opt") return;
      const init = path.node.init;
      if (!init || (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression")) return;
      const param = init.params[0];
      if (param && !param.typeAnnotation) param.typeAnnotation = t.tsTypeAnnotation(t.tsTypeReference(t.identifier("RoleOptionData")));
    },
    JSXElement(path) {
      const open = path.node.openingElement;
      if (open.name.name !== "Opt") return;
      if (path.parentPath.node.type === "JSXElement" && path.parentPath.node.openingElement.name.name === "Pressable") return;
      const iconAttr = open.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "icon");
      const isRider = !!iconAttr && iconAttr.value?.type === "StringLiteral" && iconAttr.value.value === "bike";
      open.attributes = open.attributes.filter((a) => !(a.type === "JSXAttribute" && a.name.name === "selected"));
      open.attributes.push(t.jsxAttribute(t.jsxIdentifier("selected"), t.jsxExpressionContainer(expr(isRider ? "riderSelected" : "customerSelected"))));
      const handler = isRider ? "onSelectRider" : "onSelectCustomer";
      const wrapped = wrap(path.node, "Pressable", `onPress={${handler}} accessibilityRole="radio"`);
      path.replaceWith(wrapped);
      path.skip();
    },
    JSXOpeningElement(path) {
      if (path.node.name.name !== "Button") return;
      path.node.attributes = path.node.attributes.filter((a) => !(a.type === "JSXAttribute" && ["onClick", "label"].includes(a.name.name)));
      path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("label"), t.jsxExpressionContainer(expr("continueLabel"))));
      path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onPress"), t.jsxExpressionContainer(expr("onContinue"))));
    },
  };
}

export const ADOPTED = [
  {
    // LJ.login — the phone sign-in screen (app/phone.tsx). A clean static auth form: the mock's `Login`
    // is `Pad(Lockup, Heading, Sub, Field, Button)`. Lockup→BrandLockup (transpiler DS_RENAME); the data
    // seam wires the phone value/handler onto the Field and the submit onto the Button. The send-failure
    // error rides the Field's own `error` caption (structurally invisible — a leaf prop) so it stays
    // in-flow within the mock's tree rather than as an undrawn extra line.
    key: "LJ.login",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    component: "Login",
    componentName: "LoginView",
    viewFile: "apps/mobile/app/phone.view.tsx",
    container: "apps/mobile/app/phone.tsx",
    uiImport: "../src/ui",
    propsParam: "{ phone, onChangePhone, onSubmit, loading, submitDisabled, error }: LoginViewProps",
    propsType: [
      "export type LoginViewProps = {",
      "  phone: string;",
      "  onChangePhone: (v: string) => void;",
      "  onSubmit: () => void;",
      "  loading?: boolean;",
      "  submitDisabled?: boolean;",
      "  error?: string;",
      "};",
    ].join("\n"),
    bind: ({ t, expr }) => ({
      JSXOpeningElement(path) {
        const name = path.node.name.name;
        if (name === "Field") {
          // Kit Field props (web `onChange`, `inputMode`, the frozen `value` literal) → the app Field's
          // `value`/`onChangeText`/`keyboardType`; add the autofill hints + placeholder the phone screen
          // needs, and surface the send-failure error as the field's own caption.
          path.node.attributes = path.node.attributes.filter(
            (a) => !(a.type === "JSXAttribute" && ["value", "onChange", "inputMode"].includes(a.name.name)),
          );
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("value"), t.jsxExpressionContainer(expr("phone"))));
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onChangeText"), t.jsxExpressionContainer(expr("onChangePhone"))));
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("placeholder"), t.stringLiteral("+263 77 000 0000")));
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("keyboardType"), t.stringLiteral("phone-pad")));
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("autoComplete"), t.stringLiteral("tel")));
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("textContentType"), t.stringLiteral("telephoneNumber")));
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("error"), t.jsxExpressionContainer(expr("error"))));
        }
        if (name === "Button") {
          path.node.attributes = path.node.attributes.filter((a) => !(a.type === "JSXAttribute" && a.name.name === "onClick"));
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onPress"), t.jsxExpressionContainer(expr("onSubmit"))));
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("loading"), t.jsxExpressionContainer(expr("loading"))));
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("disabled"), t.jsxExpressionContainer(expr("submitDisabled"))));
        }
      },
    }),
  },
  {
    // LJ.onboard — the first-install intro carousel (app/onboarding.tsx). The mock's `Onboarding` is a
    // SINGLE-slide renderer parameterised by a `slide` index — the app's live carousel is exactly that,
    // driven in-place. Mock-wins (live-vs-static): adopt the mock's one-slide tree and wire the live
    // behaviour INTO it — the container owns the slide SET (flag-gated Food/Send vs parcels-only) and the
    // current index, feeding this view the active slide's icon/title/body, the dot indices, the primary
    // label ("Next"/"Get started"), and the Skip/Next handlers. `onboard_send`/`onboard_shared` are the
    // SAME mock component at slide 1/2 and `onboard_flag_off` is its 2-slide twin — all structurally this
    // view, covered by the container's slide state (not separate generated views).
    key: "LJ.onboard",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    component: "Onboarding",
    componentName: "OnboardingView",
    viewFile: "apps/mobile/app/onboarding.view.tsx",
    container: "apps/mobile/app/onboarding.tsx",
    uiImport: "../src/ui",
    propsParam: "{ icon, title, body, slide, dots, primaryLabel, onSkip, onNext }: OnboardingViewProps",
    propsType: [
      "export type OnboardingViewProps = {",
      "  /** The active slide's mint-tile glyph. */",
      "  icon: IconName;",
      "  title: string;",
      "  body: string;",
      "  /** The active slide index (drives the elongated progress dot). */",
      "  slide: number;",
      "  /** The dot indices — length = slide count (2 flag-off, 3 joint-launch). */",
      "  dots: number[];",
      "  /** 'Next' on any slide but the last, 'Get started' on the last. */",
      "  primaryLabel: string;",
      "  onSkip: () => void;",
      "  onNext: () => void;",
      "};",
    ].join("\n"),
    hoist: ["s"],
    bind: ({ t, expr, wrap }) => ({
      // `s.icon`/`s.title`/`s.body` → the hoisted `icon`/`title`/`body` props (the `const s = ONBOARD[…]`
      // line is dropped by `hoist`, since ONBOARD is a mock-only module const with no app equivalent).
      MemberExpression(path) {
        if (path.node.object.type === "Identifier" && path.node.object.name === "s" && !path.node.computed && path.node.property.type === "Identifier") {
          path.replaceWith(t.identifier(path.node.property.name));
        }
      },
      // The progress dots: the mock hard-codes `[0,1,2]`; the app's slide count is flag-dependent (2 or
      // 3), so drive the map off the `dots` prop. `n === slide` still marks the active dot.
      CallExpression(path) {
        const callee = path.node.callee;
        if (callee.type === "MemberExpression" && callee.property.name === "map" && callee.object.type === "ArrayExpression") {
          callee.object = expr("dots");
        }
      },
      JSXOpeningElement(path) {
        if (path.node.name.name === "Button") {
          // Kit web `onClick` + the `slide===2?…` literal label → the app Button's `onPress` + the
          // container-computed `primaryLabel` (so the flag-off 2-slide set gets "Get started" on index 1).
          path.node.attributes = path.node.attributes.filter(
            (a) => !(a.type === "JSXAttribute" && ["onClick", "label"].includes(a.name.name)),
          );
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("label"), t.jsxExpressionContainer(expr("primaryLabel"))));
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onPress"), t.jsxExpressionContainer(expr("onNext"))));
        }
      },
      // The "Skip" affordance is a bare Text in the mock; wrap it in a Pressable(onSkip) — a transparent
      // interaction wrapper the structural guardrail sees through.
      JSXElement(path) {
        const open = path.node.openingElement;
        if (open.name.name !== "Text") return;
        const kids = path.node.children.filter((c) => !(c.type === "JSXText" && c.value.trim() === ""));
        if (kids.length !== 1 || kids[0].type !== "JSXText" || kids[0].value.trim() !== "Skip") return;
        if (path.parentPath.node.type === "JSXElement" && path.parentPath.node.openingElement.name.name === "Pressable") return;
        path.replaceWith(wrap(path.node, "Pressable", `onPress={onSkip} accessibilityRole="button" hitSlop={8}`));
        path.skip();
      },
    }),
  },
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
      {
        // R1·4 list_error — the cold offline/fetch-failed state (fetch settled in error with NO data,
        // not even a stale copy). The mock wraps the whole screen in `<Screen banner={<Banner offline/>}>`
        // — now adoptable because Foundation-C gave the DS `Screen` a `banner` slot AND taught the
        // structural normalizer to fold that slot into the tree (so the banner is verified, not invisible).
        // Container early-returns it (like loading); the retry button and the AppBar back are the only
        // data seam. The Banner's `action="Retry"` mirrors the mock's decorative span verbatim (the kit's
        // Banner has no handler either — the functional retry is the EmptyState's "Try again" button).
        state: "error",
        key: "RC.list_error",
        component: "list_error",
        componentName: "FoodListErrorView",
        viewFile: "apps/mobile/app/food/food-list.error.view.tsx",
        propsParam: "{ onBack, onRetry, loading }: FoodListErrorViewProps",
        propsType: [
          "export type FoodListErrorViewProps = {",
          "  onBack: () => void;",
          "  onRetry: () => void;",
          "  loading?: boolean;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => ({
          JSXOpeningElement(path) {
            const name = path.node.name.name;
            if (name === "AppBar") {
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onBack"), t.jsxExpressionContainer(expr("onBack"))));
            }
            if (name === "Button") {
              // Kit Button's web `onClick={nop}` → the app Button's `onPress`; wire the container's
              // refetch and reflect its in-flight state, preserving the screen's existing retry behavior.
              path.node.attributes = path.node.attributes.filter((a) => !(a.type === "JSXAttribute" && a.name.name === "onClick"));
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onPress"), t.jsxExpressionContainer(expr("onRetry"))));
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("loading"), t.jsxExpressionContainer(expr("loading"))));
            }
          },
        }),
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
        state: "data",
        key: "RC.list",
        reason:
          "BACKEND/wire-contract-gated, not a live-superset the app can restructure into. The mock header draws four sort pills — Open now (wireable from `hours`) BUT also Nearest, Under $2 fee, Top rated — and each RestRow's meta line is `★ rating (n) · <km> km · <eta> min`. rating, geo-distance (km), per-restaurant delivery fee and ETA are ALL absent from the `RestaurantListItem` wire contract (contracts.ts: id/name/cover/logo/cuisineTags/priceLevel/hours/location only), and the list screen has no customer geolocation. Mock-wins says wire behaviour INTO the drawn elements, but there is no data to wire three of the pills or the rating/km/eta to — rendering them anyway would ship three permanently-dead sort pills and fabricated rating/distance/eta figures (CLAUDE.md forbids both). The list BODY is fine (FlatList≡map), but the header+row meta need the customer read API to carry rating/distance/fee before this state can adopt. Tracked as a Track-2 backend gap, not app drift.",
      },
    ],
  },
  {
    // RC.checkout — the food checkout flow (app/food/checkout.tsx). Multi-state: cart-empty / loading /
    // placing(busy) / data(cash|wallet). The PLACING state adopts as a whole-screen state view here; the
    // interactive DATA screen (drop-off capture, payment select, live totals, place-order) is region-
    // adopted PIECE-BY-PIECE under the RC.checkout_cash entry below (Foundation-E) — two entries on the one
    // container, exactly like RC.menu + RC.closed_interrupt share app/food/[id].tsx.
    key: "RC.checkout",
    container: "apps/mobile/app/food/checkout.tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-a.jsx",
    uiImport: "../../src/ui",
    states: [
      {
        // R4·b2 placing — the one-beat "Sending your order to the kitchen…" state the checkout renders
        // while the placeFoodOrder mutation is in flight (`busy`). A pure content skeleton (centred
        // receipt glyph + two lines + two skeleton bars, its own Screen), no data seam — the copy is
        // fixed in the mock, so the generated view is 0-residual and needs no `bind`. The container
        // early-returns it (like list_loading), replacing the whole screen for the placing beat.
        state: "placing",
        key: "RC.placing",
        component: "placing",
        componentName: "CheckoutPlacingView",
        viewFile: "apps/mobile/app/food/checkout-placing.view.tsx",
      },
    ],
  },
  {
    // ── RC.checkout_cash — the food checkout DATA screen (app/food/checkout.tsx). The FOURTH region-adopted
    // INTERACTIVE container (Foundation-E), after RC.menu + RC.closed_interrupt + RC.cart. A whole-screen
    // generated view cannot host this screen's live behaviour (the load-bearing drop-off CAPTURE —
    // MapPicker + AddressSearch + landmark/phone Fields + AddressConfirmSheet, ledgered D-11 — plus live
    // payment-select, a live delivery-fee estimate, and place-order with idempotency) without regressing
    // it, so it adopts PIECE-BY-PIECE. TWO regions are cleanly congruent and composed by the container:
    //   • summary — the kit `<PriceMath goods/fee/km/total/note>` totals card. Unlike RC.cart#summary
    //     (deferred: the cart collects no drop-off, so fee/km would be fabricated), CHECKOUT has a real
    //     drop-off, so the delivery fee AND the distance are HONEST here — `estimateDeliveryFee` already
    //     computes both from `haversineKm(merchant, dropPoint)`. The app therefore adopts the kit PriceMath
    //     (goods/fee/km/total), NOT the {rows,total,footnote} food variant. The under-minimum small-order
    //     fee — which the kit PriceMath has no row for — folds into the `note` exactly as the design's own
    //     `cart_min` mock does it (`note="Includes a $1.00 small-order fee."`), so no money is hidden or
    //     fabricated; goods + delivery + the note reconcile to the total.
    //   • footer (place-bar) — the pinned "Place order · pay $X" Button in the kit's `<Screen footer=…>`
    //     slot (Foundation-D). Mirrors RC.cart#footer / RC.menu#footer; label + disabled + loading + onPress
    //     are the data seam.
    // The composition check reduces BOTH mock and container to `SCREEN( REGION:summary, REGION:footer )`.
    // The wallet variant (RC.checkout_wallet) is served by the SAME container + the SAME two regions
    // (structurally identical); it differs only in the deferred payment region's selected state/copy.
    key: "RC.checkout_cash",
    container: "apps/mobile/app/food/checkout.tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-a.jsx",
    mockComponent: "checkout_cash",
    uiImport: "../../src/ui",
    regions: [
      {
        // Summary region — the totals card `<Card><PriceMath goods fee km total note/></Card>`. Locator
        // {el:"PriceMath"} anchors the kit PriceMath (the first, only, PriceMath in checkout_cash); the
        // wrapping Card is container glue (bubbled through in the composition, like RC.cart's summary would
        // be). The bind swaps the mock's frozen figures for the live seam: goods = food subtotal, fee = the
        // honest delivery estimate, km = the honest drop distance, total, and the note.
        region: "summary",
        locator: { el: "PriceMath" },
        componentName: "CheckoutSummaryView",
        viewFile: "apps/mobile/app/food/checkout-summary.view.tsx",
        propsParam: "{ goods, fee, km, total, note }: CheckoutSummaryViewProps",
        propsType: [
          "export type CheckoutSummaryViewProps = {",
          "  /** Food subtotal (the kit PriceMath's 'Food' row). */",
          "  goods: number;",
          "  /** Honest delivery-fee estimate from the drop pin (0 before a drop-off is set). */",
          "  fee: number;",
          "  /** Honest drop distance in km (drives the delivery row's per-km sub-line). */",
          "  km: number;",
          "  total: number;",
          "  /** Cash/wallet consequence copy, with any small-order fee folded in (cart_min convention). */",
          "  note?: string;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => ({
          JSXOpeningElement(path) {
            if (path.node.name.name !== "PriceMath") return;
            // Drop the mock's frozen goods/fee/km/total/note literals; wire the live seam.
            path.node.attributes = path.node.attributes.filter(
              (a) => !(a.type === "JSXAttribute" && ["goods", "fee", "km", "total", "note"].includes(a.name.name)),
            );
            for (const k of ["goods", "fee", "km", "total", "note"]) {
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier(k), t.jsxExpressionContainer(expr(k))));
            }
          },
        }),
      },
      {
        // Footer region — the pinned "Place order · pay $X" bar the kit draws in <Screen footer=…>
        // (Foundation-D slot). Locator {slot:"footer"} folds the slot value; the fragment is the lone
        // Button. Mirrors RC.cart#footer / RC.menu#footer. The label is computed by the container (the pay
        // method + live total drive the copy), and disabled/loading reflect the submit gate + in-flight
        // placeFoodOrder mutation — the money-sensitive place-order logic is unchanged.
        region: "footer",
        locator: { slot: "footer" },
        componentName: "CheckoutPlaceBarView",
        viewFile: "apps/mobile/app/food/checkout-place-bar.view.tsx",
        propsParam: "{ label, onPlace, disabled, loading }: CheckoutPlaceBarViewProps",
        propsType: [
          "export type CheckoutPlaceBarViewProps = {",
          "  label: string;",
          "  onPlace: () => void;",
          "  disabled?: boolean;",
          "  loading?: boolean;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => ({
          JSXOpeningElement(path) {
            if (path.node.name.name !== "Button") return;
            // Kit-only props (web onClick, style, the frozen label string) → drop; wire the app Button's
            // label + onPress + disabled + loading.
            path.node.attributes = path.node.attributes.filter(
              (a) => !(a.type === "JSXAttribute" && ["onClick", "style", "label"].includes(a.name.name)),
            );
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("label"), t.jsxExpressionContainer(expr("label"))));
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onPress"), t.jsxExpressionContainer(expr("onPlace"))));
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("disabled"), t.jsxExpressionContainer(expr("disabled"))));
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("loading"), t.jsxExpressionContainer(expr("loading"))));
          },
        }),
      },
    ],
    // Deferred regions — genuine walls, recorded honestly and pruned from the composition check (CLAUDE.md
    // "Pixel parity": honesty over volume; never ship a dead or fabricated control).
    deferred: [
      {
        state: "dropoff",
        key: "RC.checkout#dropoff",
        reason:
          "the mock draws a STATIC address-summary Card (map-pin + '12 Lanark Rd, Belgravia · Gate 2, ask for Rufaro · 3.1 km away' + chevron) — a display of an already-known address. The app collects the drop-off LIVE on this screen (MapPicker + AddressSearch + landmark Field + contact-phone Field + the drag-to-adjust AddressConfirmSheet) because a food delivery has nowhere else in the flow to capture where the food is going (the cart defers drop-off to here). This load-bearing capture is a sanctioned SUPERSET ledgered as DESIGN-DEVIATIONS D-11: the static mock draws no capture surface to wire it into (CLAUDE.md live-vs-static 'wire the behaviour INTO the drawn elements' has no +/− control to target — the mock's element is a read-only summary row, not a picker). Kept as container glue (pruned from the composition); adoptable once the capture earns a drawn picker in the checkout mock, or the summary-row is redrawn as an address-picker entry.",
      },
      {
        state: "eta",
        key: "RC.checkout#eta",
        reason:
          "the mock's <EtaLine range='30–40 min' arrive='10:11–10:21'/> (r-customer-a.jsx:428) promises a delivery ETA + arrival window, but there is no ETA estimator behind it — the app has an honest drop distance/fee but no honest arrival-time model, and wiring a figure would fabricate an arrival window (CLAUDE.md forbids). The EtaLine primitive exists (Foundation-D) but stays un-wired, per D-11. Not rendered; not a region (pruned from the composition). Adoptable once an ETA estimator backs it.",
      },
      {
        state: "payment",
        key: "RC.checkout#payment",
        reason:
          "the 'HOW YOU'LL PAY' cash/wallet rows are a live-vs-static VARIANT switch, not a clean single fragment. The two mock keys draw structurally-DIFFERENT payment blocks: checkout_cash's wallet row is a bare row, while checkout_wallet's selected wallet row carries an EXTRA child — a clock-glyph + 'You pay only after the restaurant accepts…' disclosure note (r-customer-a.jsx:491-494) that appears only while wallet is selected. A single static generated fragment (from ONE mock key) can therefore not guard both variants: it would either freeze one selected state or add/drop the wallet-only note child, diverging from whichever mock it wasn't generated from. The app already realizes BOTH faithfully with the live PaymentMethodRow (accent-selected border/wash + filled check, and the disclosure note wired as its selected-only `children`) — kept as container glue (pruned from the composition). Adoptable once the payment rows earn a variant-neutral drawn structure (or the selected-note becomes a per-row region boundary).",
      },
      {
        state: "data",
        key: "RC.checkout_wallet",
        reason:
          "the mobile-money variant of the checkout DATA screen — served by the SAME container and the SAME two adopted regions (summary + place-bar footer are structurally identical to the cash variant: the footer label and the note copy differ only as leaf data the container computes). It differs from checkout_cash ONLY in the deferred payment region's selected state + the wallet disclosure note (see RC.checkout#payment). No separate regions entry is needed; recorded here so the ledger is explicit.",
      },
    ],
  },
  {
    // ── RC.menu — the restaurant menu (app/food/[id].tsx). The FIRST region-adopted INTERACTIVE
    // container (Foundation-E). A whole-screen generated view cannot host this screen's live behaviour
    // (category tabs, ItemSheet, RemindWhenOpen, 'just closed' interrupt, add-to-cart) without
    // regressing it — so instead of `≡ whole-screen mock`, the screen adopts PIECE-BY-PIECE: each
    // `regions[]` entry is a generated, guarded FRAGMENT view of a named sub-tree of the RC.menu mock,
    // and the container COMPOSES them while keeping all interactive glue. The guardrail asserts BOTH
    // (a) each fragment view ≡ its mock fragment, AND (b) the container mounts the fragments in the
    // mock's region composition order/nesting (the composition check) — pieces AND assembly, statically.
    key: "RC.menu",
    container: "apps/mobile/app/food/[id].tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-a.jsx",
    mockComponent: "menu",
    uiImport: "../../src/ui",
    regions: [
      {
        // Cover region — the full-bleed cover band: DS CoverPhoto with the floating back button, the
        // (decorative, static-mock) search glyph and the round DS ShopLogo overhanging its corner. The
        // back glyph is wired to onBack via a transparent Pressable (invisible to the structural diff).
        region: "cover",
        locator: { el: "CoverPhoto" },
        componentName: "MenuCoverView",
        viewFile: "apps/mobile/app/food/menu-cover.view.tsx",
        propsParam: "{ name, photo, logoPhoto, onBack }: MenuCoverViewProps",
        propsType: [
          "export type MenuCoverViewProps = {",
          "  name: string;",
          "  /** Cover image URI, or `false` for the kit's tinted-name fallback (honest-empty). */",
          "  photo: string | false;",
          "  /** Logo image URI, or `false` for the kit's accent-initial fallback (honest-empty). */",
          "  logoPhoto: string | false;",
          "  onBack: () => void;",
          "};",
        ].join("\n"),
        bind: ({ t, expr, wrap }) => ({
          JSXOpeningElement(path) {
            const name = path.node.name.name;
            if (name === "CoverPhoto") {
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("name"), t.jsxExpressionContainer(expr("name"))));
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("photo"), t.jsxExpressionContainer(expr("photo"))));
            }
            if (name === "ShopLogo") {
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("name"), t.jsxExpressionContainer(expr("name"))));
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("photo"), t.jsxExpressionContainer(expr("logoPhoto"))));
            }
          },
          // The back glyph is the absolute box with a `left` inset (the search glyph has `right`); wrap
          // it in a Pressable(onBack). Transparent wrapper → invisible to the structural guardrail.
          JSXElement(path) {
            const open = path.node.openingElement;
            if (open.name.name !== "View") return;
            const style = open.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "style");
            const obj = style?.value?.expression;
            if (obj?.type !== "ObjectExpression") return;
            const keys = obj.properties.filter((p) => p.type === "ObjectProperty" && !p.computed).map((p) => p.key.name || p.key.value);
            if (!keys.includes("left") || !keys.includes("position")) return;
            if (path.parentPath.node.type === "JSXElement" && path.parentPath.node.openingElement.name.name === "Pressable") return;
            path.replaceWith(wrap(path.node, "Pressable", `onPress={onBack} accessibilityRole="button" accessibilityLabel="Back"`));
            path.skip();
          },
        }),
      },
      {
        // Rows region — the section's dish list: `{rows.map(i => <MenuRow i qty/>)}`. Each MenuRow is
        // wrapped in a Pressable(onDishPress) so a tap opens the live ItemSheet (kept in the container).
        region: "rows",
        locator: { map: "MenuRow" },
        componentName: "MenuRowsView",
        viewFile: "apps/mobile/app/food/menu-rows.view.tsx",
        propsParam: "{ rows, qtyFor, onDishPress }: MenuRowsViewProps",
        propsType: [
          "/** A menu row's kit-item shape plus the dish `id` the list keys + maps back to. */",
          "export type MenuRowSeed = MenuRowItem & { id: string };",
          "export type MenuRowsViewProps = {",
          "  rows: MenuRowSeed[];",
          "  qtyFor: (i: MenuRowSeed) => number;",
          "  onDishPress: (i: MenuRowSeed) => void;",
          "};",
        ].join("\n"),
        bind: ({ t, expr, wrap }) => ({
          CallExpression(path) {
            const callee = path.node.callee;
            if (callee.type !== "MemberExpression" || callee.property.name !== "map") return;
            callee.object = expr("rows");
            const arrow = path.node.arguments[0];
            if (!arrow || (arrow.type !== "ArrowFunctionExpression" && arrow.type !== "FunctionExpression")) return;
            const row = arrow.body.type === "JSXElement" ? arrow.body : null;
            if (!row || row.openingElement.name.name !== "MenuRow") return;
            const open = row.openingElement;
            // qty is the live in-cart count; drop the mock's literal and wire qtyFor(i).
            open.attributes = open.attributes.filter((a) => !(a.type === "JSXAttribute" && a.name.name === "qty"));
            open.attributes.push(t.jsxAttribute(t.jsxIdentifier("qty"), t.jsxExpressionContainer(expr("qtyFor(i)"))));
            const keyAttr = open.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "key");
            open.attributes = open.attributes.filter((a) => a !== keyAttr);
            const wrapped = wrap(row, "Pressable", `onPress={() => onDishPress(i)} accessibilityRole="button" disabled={!!i.oos}`);
            if (keyAttr) wrapped.openingElement.attributes.unshift(keyAttr);
            arrow.body = wrapped;
          },
        }),
      },
      {
        // Footer region — the pinned "N items · View cart" cart bar the kit draws in `<Screen footer=…>`.
        region: "footer",
        locator: { slot: "footer" },
        componentName: "MenuCartBarView",
        viewFile: "apps/mobile/app/food/menu-cart-bar.view.tsx",
        propsParam: "{ itemLabel, subtotal, onViewCart }: MenuCartBarViewProps",
        propsType: [
          "export type MenuCartBarViewProps = {",
          "  itemLabel: string;",
          "  subtotal: number;",
          "  onViewCart: () => void;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => ({
          JSXOpeningElement(path) {
            const name = path.node.name.name;
            if (name === "Button") {
              // Kit-only props (web onClick, block, style) → drop; wire the app Button's onPress.
              path.node.attributes = path.node.attributes.filter(
                (a) => !(a.type === "JSXAttribute" && ["onClick", "block", "style"].includes(a.name.name)),
              );
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onPress"), t.jsxExpressionContainer(expr("onViewCart"))));
            }
            if (name === "Money") {
              path.node.attributes = path.node.attributes.filter((a) => !(a.type === "JSXAttribute" && a.name.name === "v"));
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("v"), t.jsxExpressionContainer(expr("subtotal"))));
            }
          },
          // The "2 items" count line — replace the mock's literal with the live item label.
          JSXText(path) {
            if (path.node.value.trim() === "2 items") path.replaceWith(t.jsxExpressionContainer(expr("itemLabel")));
          },
        }),
      },
    ],
    // The shop-header META line (`★ 4.7 (210) · 1.2 km · 25–35 min · $1.50 delivery`) is NOT a region:
    // rating, geo-distance, ETA and delivery fee are ALL absent from the customer menu read contract
    // (RestaurantMenuResponse) and the screen has no customer geolocation, so drawing them would ship
    // fabricated figures (CLAUDE.md forbids). The container honest-keeps the API-backed cuisine-tags +
    // priceLevel line instead; this stays glue (pruned from the composition check), tracked here.
    deferred: [
      {
        state: "meta",
        key: "RC.menu_meta",
        reason:
          "BACKEND-gated shop-header meta line (rating / km / ETA / delivery fee) — none are in RestaurantMenuResponse and the screen has no customer geolocation, so it is honest-kept as the API-backed cuisine-tags + priceLevel line rather than fabricated. Not a region; container glue, pruned from the composition check.",
      },
    ],
  },
  {
    // ── RC.closed_interrupt — the "kitchen closes while you're browsing" interrupt (R2·b1). It is NOT a
    // standalone screen: the app raises it as a modal OVERLAY inside the same interactive menu container
    // (app/food/[id].tsx) the moment `hours` cross open→closed mid-browse (the `justClosed` state). So it
    // adopts the SAME way RC.menu did — PIECE-BY-PIECE (Foundation-E), not as a whole-screen view: one
    // generated, guarded FRAGMENT of the mock's overlay Card, composed by the container. This is the SECOND
    // region-adopted mock keyed to `app/food/[id].tsx` (RC.menu is the first); the composition check runs
    // per-entry — `optsFromRegions` anchors ONLY this entry's region, so it prunes the RC.menu cover/rows/
    // footer regions (and vice-versa), and the two checks stay independent on the one container.
    //
    // The mock draws the interrupt over a DIMMED SKELETON placeholder of the menu; the app draws it over
    // the LIVE menu (mock-wins: the skeleton is the design's stand-in for "the menu you were browsing", the
    // app shows the actual one). That backdrop is not a region and is pruned from the composition, so no
    // deviation is needed. Both mock and container reduce to `SCREEN( REGION:interrupt )`.
    key: "RC.closed_interrupt",
    container: "apps/mobile/app/food/[id].tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-a.jsx",
    mockComponent: "closed_interrupt",
    uiImport: "../../src/ui",
    regions: [
      {
        // Interrupt region — the centred modal Card: a highlight clock-tile, headline, body line and two
        // named ways forward (see-open / keep-cart). Locator {el:"Card"} anchors the mock's single Card;
        // the app mounts <ClosedInterruptView/> inside its transparent dim-overlay Pressable (invisible to
        // the composition walker, which bubbles a non-scaffold wrapper's region). No backend gate, no
        // fabricated control — both actions are honest (navigate to the open list · dismiss keeping cart).
        region: "interrupt",
        locator: { el: "Card" },
        componentName: "ClosedInterruptView",
        viewFile: "apps/mobile/app/food/closed-interrupt.view.tsx",
        propsParam: "{ title, body, onSeeOpen, onDismiss }: ClosedInterruptViewProps",
        propsType: [
          "export type ClosedInterruptViewProps = {",
          "  /** '<Shop> just closed' — the live restaurant name drives the headline. */",
          "  title: string;",
          "  /** The reassurance line (cart kept, nothing ordered). */",
          "  body: string;",
          "  /** 'See places still open' → the browse list. */",
          "  onSeeOpen: () => void;",
          "  /** 'Keep my cart for tomorrow' → dismiss the interrupt. */",
          "  onDismiss: () => void;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => ({
          // The headline + body are the DATA SEAM: the restaurant name and (honest) reassurance copy come
          // from the container. The structural guardrail ignores text, so these are leaf swaps.
          JSXText(path) {
            const v = path.node.value.trim();
            if (v === "Sadza Republic just closed") path.replaceWith(t.jsxExpressionContainer(expr("title")));
            else if (v.startsWith("They stopped taking orders")) path.replaceWith(t.jsxExpressionContainer(expr("body")));
          },
          JSXOpeningElement(path) {
            if (path.node.name.name !== "Button") return;
            // Kit Button's web `onClick={nop}` → the app Button's `onPress`; route by the mock label.
            const label = path.node.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "label");
            const lv = label && label.value && label.value.value;
            path.node.attributes = path.node.attributes.filter((a) => !(a.type === "JSXAttribute" && a.name.name === "onClick"));
            const handler = lv === "See places still open" ? "onSeeOpen" : "onDismiss";
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onPress"), t.jsxExpressionContainer(expr(handler))));
          },
        }),
      },
    ],
  },
  {
    // ── RC.home — the customer Home tab (app/(tabs)/home.tsx), REGION-adopted directly against the
    // home-8c redesign mock (2026-08-17). RC.home used to render the DS `AppHome` composite and was
    // walked INTO via composites.mjs; 8c retires that composite as the home body, and the mock now
    // declares its four members as named components in one file, so the regions anchor without a
    // composite hop (the resolver stays available for the container's local helpers).
    //
    // The app mounts same-named TWINS of those four members (HomeHeader / ServiceTiles /
    // LiveOrderCard / RestaurantCard from src/ui), so the COMPOSITION check gates assembly: banner
    // header → tiles → one live pill per running job → the venues grid, in mock order. The members'
    // INTERNAL congruence (mock member ≡ app twin) is the referenced deferral below.
    key: "RC.home",
    container: "apps/mobile/app/(tabs)/home.tsx",
    mockFile: "packages/design/explorations/home-redesign/home-8c.jsx",
    // `Home8c` is the whole screen (`<Screen tab="home" bg="--accent-wash">…`), so the walk roots at
    // the Screen exactly like the app's `<AppScreen banner={<HomeHeader/>}>`.
    mockComponent: "Home8c",
    uiImport: "../../src/ui",
    regions: [
      { region: "header", locator: { el: "HomeHeader" }, componentName: "HomeHeader", compositionOnly: true },
      { region: "tiles", locator: { el: "ServiceTiles" }, componentName: "ServiceTiles", compositionOnly: true },
      { region: "livecards", locator: { map: "LiveOrderCard" }, componentName: "LiveOrderCard", compositionOnly: true },
      { region: "venues", locator: { map: "RestaurantCard" }, componentName: "RestaurantCard", compositionOnly: true },
    ],
    deferred: [
      {
        state: "twin-internals",
        key: "RC.home",
        reason:
          "Composition is GATED (four regions, mock order/nesting). The four members' INTERNAL trees (home-8c mock members ≡ app twins HomeHeader/ServiceTiles/LiveOrderCard/RestaurantCard) need per-pair KIND folds — the RN twins reach the mock's DOM shapes through different primitives (an <img> sticker is a react-native-svg tree, the mock's <button> tile is a Pressable, the ETA pill is an absolutely-positioned View) — tracked in docs/PIXEL-PARITY-TRACKER.md C2·1 and burned down by the R1 completion lane; see docs/parity/ADOPTION-CLASSIFICATION.md.",
      },
    ],
  },
  {
    // ── RC.search — restaurant/dish search (app/food/search.tsx). DEFER-only: the same RestRow backend
    // gate as RC.list#data, PLUS a dish-index the API lacks, PLUS a live-vs-static multi-state superset.
    key: "RC.search",
    container: "apps/mobile/app/food/search.tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-a.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RC.search",
        reason:
          "THREE walls, none a missing primitive. (1) BACKEND gate — the mock's PLACES section is `<RestRow r={REST[0]}/>`, whose meta line draws `★ rating (n) · km · eta min` + `$fee delivery`; rating, geo-distance (km), per-restaurant ETA and delivery fee are ALL absent from the `RestaurantListItem` wire contract and the app has no customer geolocation (issue #673 / task #24 — the SAME gate that defers RC.list#data). The app's shared RestaurantRow already honest-empties this (cuisine tags + an open/closing-now line instead of the fabricated rating/km/eta), so its meta STRUCTURE diverges from the mock's RestRow by design; rendering the mock's rating/km/eta nodes would ship fabricated figures (CLAUDE.md forbids). (2) DISH INDEX — the mock's second `DISHES` section lists cross-restaurant dish matches (`Sadza & beef stew · Sadza Republic · $4.50`), which needs a cross-restaurant menu/dish search index the C1 customer read API does not expose; the app search runs client-side over the already-fetched restaurant list (name + cuisine only) and honestly omits the DISHES section rather than fake it. (3) LIVE-vs-STATIC multi-state — the static mock draws only the populated 'sadza' result; the app screen interleaves an empty-query hint, a 'still searching more kitchens…' pagination line, the results list and a no-matches EmptyState, none of which the one frozen mock draws. Adoptable once the customer read API carries rating/distance/fee + a cross-restaurant dish index, and the search states earn their own mock keys.",
      },
    ],
  },
  {
    // ── RC.menu_closed — the closed-restaurant menu (a state of app/food/[id].tsx). DEFER-only: a
    // live-vs-static structural divergence within the already-region-adopted interactive menu container.
    key: "RC.menu_closed",
    container: "apps/mobile/app/food/[id].tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-a.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "closed",
        key: "RC.menu_closed",
        reason:
          "LIVE-vs-STATIC structural divergence inside an already-region-adopted INTERACTIVE container, plus a backend-gated meta line — not a missing primitive. The static mock frames the closed state as its OWN whole `<Screen banner={<Banner warn 'is closed'/>} footer={<Button 'Remind me when they open'/>}>` with a dimmed CoverPhoto + shop-meta + an all-OOS MenuRow list. The app realizes the SAME closed state LIVE inside the shared menu container (app/food/[id].tsx, already region-adopted for RC.menu): it derives open/closed from `hours` and, when closed, renders an INLINE notice Card (clock icon + `nextOpenDescription` copy + the working `RemindWhenOpen` control) BETWEEN the shop-meta and the category tabs — NOT as the mock's Screen `banner` + pinned `footer` button. Mock-wins can't losslessly restructure this without regressing the live open/closed derivation, the category tabs and the real reopen-reminder toggle (which, unlike RC.list's dead 'Notify me', IS backed by `useReopenReminder`). The mock's shop-meta also draws `4.0 km` (geo-distance — the RC.menu#meta backend gate). A separate whole-screen or banner/footer-region view is not expressible over the live menu container without either a Foundation build (banner/footer region roots for the closed variant) or regressing the interactive glue. Adoptable once the closed variant earns banner/footer region boundaries against the app's inline-notice tree.",
      },
    ],
  },
  {
    // ── RC.cart — the populated food cart (app/food/cart.tsx). The THIRD region-adopted INTERACTIVE
    // container (Foundation-E), after RC.menu + RC.closed_interrupt. cart_empty is adopted separately as a
    // whole-screen state view (above); the POPULATED cart cannot be a whole-screen generated view — its
    // live behaviour (per-line QtyStepper quantity editing, editable per-line notes, the menu-reconcile
    // OOS/price notices, the CartNoteSheet overlay) would be regressed by a single static tree. So it
    // adopts PIECE-BY-PIECE: the Screen.footer CHECKOUT bar is a cleanly congruent region the container
    // composes while keeping all interactive glue. The guardrail asserts BOTH (a) the fragment ≡ its mock
    // sub-tree, AND (b) the container mounts it in the mock's region position (the pinned slot →
    // SCREEN(REGION:footer) on both sides). The interactive line-items Card, the un-wireable EtaLine, the
    // delivery-bearing PriceMath summary, the un-backed upsell rail, and the live OOS/price/min/note states
    // are honestly DEFERRED (below), each pruned from the composition check as container glue.
    key: "RC.cart",
    container: "apps/mobile/app/food/cart.tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-a.jsx",
    mockComponent: "cart",
    uiImport: "../../src/ui",
    regions: [
      {
        // Footer region — the pinned "Go to checkout · $X" bar the kit draws in <Screen footer=…>
        // (Foundation-D slot). Locator {slot:"footer"} folds the slot value; the fragment is the lone
        // Button. Mirrors RC.menu's footer region. The label is computed by the container (the live total).
        region: "footer",
        locator: { slot: "footer" },
        componentName: "CartCheckoutBarView",
        viewFile: "apps/mobile/app/food/cart-checkout-bar.view.tsx",
        propsParam: "{ label, onCheckout }: CartCheckoutBarViewProps",
        propsType: [
          "export type CartCheckoutBarViewProps = {",
          "  label: string;",
          "  onCheckout: () => void;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => ({
          JSXOpeningElement(path) {
            if (path.node.name.name !== "Button") return;
            // Kit-only props (web onClick, style, the frozen label string) → drop; wire onPress + label.
            path.node.attributes = path.node.attributes.filter(
              (a) => !(a.type === "JSXAttribute" && ["onClick", "style", "label"].includes(a.name.name)),
            );
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("label"), t.jsxExpressionContainer(expr("label"))));
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onPress"), t.jsxExpressionContainer(expr("onCheckout"))));
          },
        }),
      },
    ],
    // Deferred — each a genuine wall, recorded honestly and pruned from the composition check (CLAUDE.md
    // "Pixel parity": honesty over volume; never ship a dead or fabricated control).
    deferred: [
      {
        state: "lines",
        key: "RC.cart#lines",
        reason:
          "the line-items Card is a live INTERACTIVE superset the static mock never drew, not a missing primitive. The mock draws each line's quantity as a READ-ONLY 28px tab badge (a bare number) and the per-dish note as static text; the app renders a live per-line QtyStepper (increment / decrement / remove-at-1 — the ONLY place quantity is editable after the menu ItemSheet), an editable note Pressable that opens the CartNoteSheet, an inline order-note row, and an 'Add more items' link back to the menu. Generating the mock's static badge as a fragment and mounting it would REGRESS inline quantity editing — the mock draws no +/− control to wire increment/decrement into, so CLAUDE.md's live-vs-static 'wire the behaviour INTO the drawn elements' has no element to target here. Kept as container glue (pruned from the composition); adoptable once quantity editing earns a drawn stepper in the cart mock.",
      },
      {
        state: "eta",
        key: "RC.cart#eta",
        reason:
          "the mock's <EtaLine range='30–40 min' arrive='10:11–10:21'/> promises a delivery ETA + arrival window BEFORE payment, but the cart deliberately does NOT collect a drop-off (that is checkout's job), so there is no honest distance/ETA to feed it — wiring a figure here would fabricate an arrival window (CLAUDE.md forbids). Not rendered; not a region (pruned from the composition). Adoptable once an ETA estimator + a cart-time destination back it.",
      },
      {
        state: "upsell",
        key: "RC.cart#upsell",
        reason:
          "the mock's 'ADD A DRINK?' FoodThumb rail is an upsell with no upsell/cross-sell backend to populate it; omitted per ledgered DESIGN-DEVIATIONS D-12. Not rendered; not a region (pruned from the composition).",
      },
      {
        state: "summary",
        key: "RC.cart#summary",
        reason:
          "the mock's <PriceMath goods='13.00' fee='2.50' km='3.1' total='15.50'/> DRAWS a Delivery(fee · km) breakdown row — and the codegen-target DS PriceMath (src/ui/PriceMath.tsx, the kit-faithful mirror the transpiler resolves off src/ui) REQUIRES goods/fee/km/total and renders that Delivery row. But the cart deliberately collects NO drop-off (that is checkout's job), so there is no honest delivery distance/fee to feed it — the SAME no-drop-off wall as the EtaLine region. The app therefore renders the food-cart PriceMath (src/ui/food/PriceMath.tsx, a {rows,total,footnote} variant) showing only Food + optional small-order fee + Total with a 'delivery added at checkout' footnote — an honest omission, but one that means a faithful mock-mirror fragment (kit PriceMath with a delivery row) is not expressible without fabricating fee/km (CLAUDE.md forbids). Kept as container glue (pruned from the composition); adoptable once the cart carries a drop-off + delivery-fee estimate, or the mock draws a delivery-free cart summary.",
      },
      {
        state: "oos",
        key: "RC.cart_oos",
        reason:
          "the item-sold-out state — the mock frames it as its OWN whole `<Screen banner={<Banner warn/>}>` with a struck-through 'Removed' line and a re-totalled PriceMath. The app realizes it LIVE inside the one cart container as a dismissible inline notice Card (highlight-wash + circle-alert + 'Got it') driven by the menu-reconciliation pass, NOT as a Screen.banner, and DROPS the removed line rather than showing a struck-through row. Live-vs-static structural divergence (same class as RC.menu_closed); no lossless mock-wins restructure without regressing reconcile-on-open. Deferred.",
      },
      {
        state: "price",
        key: "RC.cart_price",
        reason:
          "the price-changed state — the mock is a whole `<Screen>` whose footer swaps to 'Accept the new total' + 'Remove that item' and whose body shows an old→new struck-price row. The app realizes it LIVE as the same dismissible reconciliation notice Card (the reconcile pass applies the new price to the line and surfaces a 'price changed … from → to' notice), keeping the single 'Go to checkout' footer — it never presents a separate accept/remove footer screen. Live-vs-static; deferred.",
      },
      {
        state: "min",
        key: "RC.cart_min",
        reason:
          "the under-minimum state — the mock draws a whole `<Screen>` with a helper line ABOVE the checkout button IN THE FOOTER ('Add $1.50 more, or pay the $1 small-order fee'). The app realizes belowMinimum LIVE in the base cart container as a highlight-wash warning Card in the body (structurally faithful to the mock's body warning Card) but keeps the plain 'Go to checkout · $X' footer (the small-order fee flows through the PriceMath rows), and the body also carries the note/disclaimer chrome the frozen cart_min mock omits. The footer helper-line variant is a per-STATE footer the base RC.cart region does not host. Live-vs-static; deferred.",
      },
      {
        state: "note",
        key: "RC.cart_note",
        reason:
          "the note-for-the-kitchen bottom sheet — the mock draws it as a whole `<Screen pad={false}>` with a dimmed skeleton backdrop and an absolutely-positioned sheet + quick-chip suggestions. The app realizes it LIVE as the CartNoteSheet MODAL opened from a line's note Pressable (not a routed screen), over the live cart. Same overlay-vs-whole-screen disposition as RC.closed_interrupt's backdrop; the sheet has no standalone container to point a whole-screen view at, and its quick-chip suggestions are a superset. Deferred as a live sheet overlay.",
      },
    ],
  },
  {
    // RC.orders — the Orders tab (app/(tabs)/orders.tsx). orders_empty exists as its own key; the composite
    // DATA state defers. Defer-only registration.
    key: "RC.orders",
    container: "apps/mobile/app/(tabs)/orders.tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-a.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RC.orders",
        reason:
          "NOT a Foundation-D primitive-gap screen — the mock uses no EtaLine/ShopLogo/FoodThumb/footer, so Foundation-D does not unblock it. The wall is live-vs-static: the mock is one frozen composite — title + one accent active-order Card + an EARLIER label + three history rows (each ending in `<Money>`). The app Orders tab is a live container that interleaves, in ONE scroll: the active-order card, an active-order-check-FAILED banner, a stale-cache 'showing your last saved orders' retry line, a first-load skeleton, the empty state (its own RC.orders_empty mock) and a fetch-error state — none of which the mock's data composite draws. There is no clean 'data' boundary to swap a generated whole-screen composite in without regressing those live sub-states (and the app's history rows render the fare as `<Text>`, not the mock's `<Money>`). Deferred as a live-vs-static case with no lossless mock-wins restructure; rather than regress the stale/failed/skeleton behaviour.",
      },
    ],
  },
  // ── FOOD ORDER TRACKING + TERMINAL STATES cluster (app/food/order/[orderId].tsx) ──────────────────
  // The customer's post-checkout order lifetime: wait-on-kitchen → pay-after-accept → prep countdown →
  // rider secured → on-the-way (map) → doorstep cash handshake → delivered/rate → every terminal. All 26
  // states live in r-customer-b.jsx (RCB.*) and are DEFER-ONLY, the same disposition as the parcel AUCTION
  // cluster (LJ.auction_live) and the SEND-COMPOSER (LJ.home_empty): a deeply-live composite the whole-
  // screen + region codegen model cannot host without regressing a SENSITIVE area — delivery-code rotation
  // (KB-DELIVERY-CODE-ROTATION-SIGNAL), the tap-to-arm + 4s-undo rating (BH-06), the CASH doorstep dual-
  // confirm handshake (R-04), the sawRider latch / rider-dropped re-find, and the payment-prompt lifecycle.
  // FIVE structural walls recur across the cluster, each already proven a wall elsewhere in this registry:
  //   (W-LOCAL) `OrderHead` is a MOCK-LOCAL helper (r-customer-b.jsx:10), not a kit primitive — the
  //     transpiler neither inlines nor can import it (identical to the auction cluster's `OrderHead`, W2);
  //     11 states lead with it.
  //   (W-KIT) the tracking mocks compose from kit primitives — `Ring`, `RTracker`, `RiderCard`, `CodeCard`,
  //     `SafetyRow`, `RailRow`. Foundation-F.b establishes these are NOT a missing-primitive gap: the app's
  //     src/ui ALREADY ships each realization — `CountdownRing` (=Ring, src/ui/food/CountdownRing.tsx),
  //     `Stepper` (=RTracker; the kit's RTracker literally returns `<DSR.Stepper/>` when the DS is present),
  //     `RiderMini` (=RiderCard), `CodeInput` (=CodeCard), safety.tsx `GetHelpControl` (=SafetyRow) — and
  //     each mock tag is a LEAF that folds to one canonical KIND. So a whole-screen or region view CAN be
  //     generated once these are wired (DS_RENAME + KIND folds), a mechanical remap, NOT a Foundation build.
  //     What actually blocks adoption is W-LIVE below, which co-occurs on EVERY one of these states: the
  //     app renders each through a hand-built `FoodOrder*View` that either combines several mock states into
  //     one live view or adds a load-bearing superset (e.g. FoodOrderAwaitingAcceptView draws the same
  //     OrderHeader+CountdownRing+Stepper as `await_accept` BUT adds a `cancelFooter` + OfflineBanner the
  //     static mock never drew — dropping them to match the mock would strand a waiting customer). Remapping
  //     the primitives therefore removes W-KIT but does not make any of these states adoptable in one pass;
  //     the real gate is W-LIVE (per-state container boundaries), a different kind of work than primitives.
  //     (The `K.OfferCard`/`K.SortChips` member-tag IDIOM is separately resolved in F-F.b — see the auction
  //     cluster — but those have no shipped app realization, unlike these.)
  //   (W-MAP) `HarareMap` is a full-bleed map canvas — the SAME map-anchored gap as the send-composer's
  //     `FauxMap`/`MapSheet` (Foundation-F #42). track_way + track_paused are map-rooted.
  //   (W-LIVE) live-vs-static composite with no per-mock whole-screen boundary: the container is a ~250-line
  //     state machine whose phases are already hand-built `FoodOrder*View`s that COMBINE several mock states
  //     into one live view (FoodOrderAwaitingPaymentView folds pay_push/pay_now/pay_wait/pay_manual/
  //     pay_confirmed behind `paymentPromptStatus`+`forcePayScreen`; FoodOrderCancelledView folds no_rider/
  //     refunded/generic-cancel; FoodOrderRefundPendingView folds rejected/refund-pending) and add live COND
  //     branches (offline banner, warm-snapshot resume, sawRider/riderDropped) — there is no static per-mock
  //     Screen to swap a generated whole-screen view into the way food-list's early-returned loading/error had.
  //   (W-DATA) the terminal + tracking mocks draw event-timeline rows, wall-clock timestamps and refund/
  //     reference figures the order record does NOT carry — failed_noshow's 4-row "WHAT HAPPENED" timeline,
  //     rejected/refunded's "Refund due by <time>" + "Their reference EC-4471-RF9920 · sent back 11:26" — all
  //     of which the app deliberately HONEST-EMPTIES (policy "Within N hours", no fabricated timeline). A
  //     mock-faithful whole-screen view would fabricate those figures (CLAUDE.md forbids). #671 lifted the
  //     rider-identity gate (MerchantOrderResponse.rider) so track_secured's DATA is honest now, and F-F.b
  //     shows its `RiderCard`/`RTracker`/`SafetyRow` remap to shipped RiderMini/Stepper/GetHelpControl — so
  //     the STRUCTURE is generable; what still blocks it is W-LIVE (track_secured has no per-state boundary —
  //     it is an internal phase of FoodOrderLiveTrackerView, which also holds the map + delivery-code + cash
  //     handshake). Structure-generable, adoption-blocked on the container boundary, not the primitive.
  // Split into three phase entries (keyed to the three wired app-targets) purely for readability; all share
  // the one container. Registered defer-only, not forced into invented/unresolved views (honesty over volume).
  {
    // Phase 1 — wait-on-kitchen + pay-after-accept. app/food/order/[orderId].tsx routes these via
    // FoodOrderAwaitingAcceptView / FoodOrderItemApprovalView / FoodOrderAwaitingPaymentView.
    key: "RC.pay_now",
    container: "apps/mobile/app/food/order/[orderId].tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-b.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "confirm_call",
        key: "RC.confirm_call",
        reason:
          "R5·1b kitchen-calls-to-confirm — mock `confirm_call` is `Screen(OrderHead, phone-disc, Card(RTracker step=1))`. W-LOCAL (`OrderHead`) + W-KIT (`RTracker`); the phone disc is a raw div (transpilable) but the screen can't generate around the two unresolved refs, and in-app the call-confirm beat is a copy variant inside the same awaiting-accept live view, not a standalone Screen (W-LIVE). Deferred with the cluster.",
      },
      {
        state: "pay_push",
        key: "RC.pay_push",
        reason:
          "R5·2 the payment-moment PUSH — a lock-screen/heads-up NOTIFICATION mock (raw dark-gradient divs + `PB.Dove` + a notification card), NOT an in-app screen: it has no `Screen` root and no in-app container to point a view at (it renders on the OS lock screen, which the app does not draw). #670 made the payment-prompt lifecycle a plain order field, but that gates the in-app pay states, not this OS-surface artwork. Not rendered by the app; deferred as a non-screen.",
      },
      {
        state: "pay_now",
        key: "RC.pay_now",
        reason:
          "R5·3 pay-the-merchant — mock `pay_now` is `Screen(footer Button)(AppBar, Pad(Card accent, RAILS.map(RailRow), USSD-help div, manual-pay rows))`. W-KIT: the payment-rail rows are `RailRow` (a kit primitive with no app-DS equivalent — the app renders its manual-rail pay UI inside the combined FoodOrderAwaitingPaymentView, not via a RailRow list), so a generated view emits `<RailRow>` against `RAILS`. W-LIVE: pay_now is one branch of the app's SINGLE awaiting_payment view (folded with pay_wait/pay_manual/pay_confirmed behind `forcePayScreen`+`paymentPromptStatus`), not an isolable Screen. Deferred with the cluster.",
      },
      {
        state: "pay_wait",
        key: "RC.pay_wait",
        reason:
          "R5·4 prompt-sent-waiting — mock `pay_wait` is `Screen(footer)(centred phone-disc + copy with an inline `<b>` bold)`. The mixed text+element-siblings idiom (the inline `<b>` in a text run) is now BUILT (Foundation-F.e wraps mixed element+text siblings in `<Text>`), so the residual wall is purely W-LIVE: it is the `paymentPromptStatus==='pending'` branch of the combined awaiting_payment live view, not a standalone Screen — a sensitive payment flow with no per-sub-state boundary. Deferred with the cluster (app re-architecture / live-superset).",
      },
      {
        state: "pay_manual",
        key: "RC.pay_manual",
        reason:
          "R5·5 paid-another-way (reference entry) — mock `pay_manual` is `Screen(footer)(AppBar, Pad(Card, Field×2, notice))`, which uses only resolvable prims (Screen/AppBar/Pad/Card/Field/Icon) and would TRANSPILE cleanly. The wall is purely W-LIVE: the app collects the reference LIVE inside the ONE FoodOrderAwaitingPaymentView (the `forcePayScreen`/reference-input branch), with no per-sub-state Screen boundary to swap a generated whole-screen view into without splitting that combined pay view and regressing the submit/reference flow. Adoptable once the pay sub-states earn their own routed boundaries; deferred with the cluster.",
      },
      {
        state: "pay_confirmed",
        key: "RC.pay_confirmed",
        reason:
          "R5·6 paid-waiting-for-merchant-confirm — mock `pay_confirmed` is `Screen(OrderHead, clock-disc, Card(3 rows), SafetyRow)`. W-LOCAL (`OrderHead`) + W-KIT (`SafetyRow` — the app uses its GetHelpControl from safety.tsx, a different tag) + W-LIVE (the `paymentPromptStatus==='confirmed'` branch of the combined pay view). Deferred with the cluster.",
      },
      {
        state: "pay_open",
        key: "RC.pay_open",
        reason:
          "R5·b1 still-unpaid reminder — mock `pay_open` is `Screen(footer Button)(AppBar, Pad(Card(EmptyState + ghost Button), banknote-notice))`. Prims resolve, but it is the elapsed-time reminder branch of the same awaiting_payment live view (the app gates it on `forcePayScreen`/elapsed check, not a separate Screen — W-LIVE), and reaching it re-enters the pay flow rather than a standalone route. Deferred with the cluster.",
      },
      {
        state: "pay_failed",
        key: "RC.pay_failed",
        reason:
          "R5·b2 rail-declined — mock `pay_failed` is `Screen(footer)(AppBar, Pad(Card(EmptyState), RAILS.slice(1).map(RailRow)))`. W-KIT (`RailRow`) + W-LIVE (a retry branch of the combined pay view). Deferred with the cluster.",
      },
      {
        state: "item_removed",
        key: "RC.item_removed",
        reason:
          "R5·b3 one-item-unavailable approval — mock `item_removed` is `Screen(footer: two Buttons)(AppBar, Pad(Card(struck line + Money), Card(PriceMath goods/fee/km/total)))`. The struck line + `Money` resolve, but the `PriceMath` here draws a Delivery(fee·km) row from fabricated fee/km, and in-app this is FoodOrderItemApprovalView — a live 60s-deadline approve/cancel view driven by `itemApprovalDeadlineAt` (W-LIVE) whose totals come from the real order, not the mock's frozen breakdown. Live-vs-static + fabricated fee/km (W-DATA); deferred with the cluster.",
      },
    ],
  },
  {
    // Phase 2 — dispatch + live tracking. app/food/order/[orderId].tsx routes these via
    // FoodOrderPreparingView / FoodOrderLiveTrackerView / FoodOrderRiderDroppedView (+ the generic
    // trackQ order snapshot the parcel tracker shares).
    key: "RC.track_way",
    container: "apps/mobile/app/food/order/[orderId].tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-b.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "track_secured",
        key: "RC.track_secured",
        reason:
          "R6·2 rider-secured — mock `track_secured` is `Screen(banner=Banner good)(OrderHead, Card(RiderCard eta/meta), Card(ready-in row + RTracker step=2), SafetyRow)`. #671 LIFTED the rider-identity backend gate — the rider (name·plate·vehicle·rating·KYC) is now a plain field on MerchantOrderResponse.rider, so the DATA is honest — but the STRUCTURE still can't generate: W-LOCAL (`OrderHead`) + W-KIT (`RiderCard`, `RTracker`, `SafetyRow` are all kit primitives absent from the app DS/transpiler remap; the app renders this via FoodOrderLiveTrackerView using RiderMini/Stepper/GetHelpControl). Structure-gated on the kit primitives, not on data; deferred with the cluster.",
      },
      {
        state: "track_way",
        key: "RC.track_way",
        reason:
          "R6·3 on-the-way — mock `track_way` (RCB.track_way, r-customer-b.jsx:275) is `Screen(pad=false)(div relative full-bleed( HarareMap fill, absolute bottom sheet: RiderCard + DELIVERY-CODE card + SafetyRow ))`. The W-MAP tooling wall is now GONE (Foundation-F.c): `HarareMap`→`ComposeMap` resolves via DS_RENAME, folds to the canonical MAP kind, and a `{el:'HarareMap'}` map-canvas fragment generates cleanly — the SAME remap that region-adopted the send-composer's map. What blocks track_way is now a LIVE-VS-STATIC REALIZATION gap on a SENSITIVE screen, not a primitive gap: the mock draws a BARE full-bleed map canvas as a sibling of the sheet, but the app's FoodOrderLiveTrackerView realizes the map as the COMPOSITE `LiveTrackingCard` (map + Stepper timeline + call/GetHelp + rider identity) inside a scrolling card column — there is no bare-map sub-tree to mount a `map` region into. Rendering a generated `<ComposeMap>` region there would either REGRESS LiveTrackingCard's telemetry/stepper/call (forbidden — sensitive) or mount a structurally-leaf map beside the real one (a dead/duplicate control, forbidden). Also W-KIT (`RiderCard`/`SafetyRow` sheet body) + W-LIVE (the masked delivery-code that reveals only after the CASH dual-confirm handshake — sensitive). Adoptable once the app's tracker earns a bare full-bleed map canvas separable from LiveTrackingCard's telemetry composite — a product/structure decision, not a codegen gap.",
      },
      {
        state: "track_paused",
        key: "RC.track_paused",
        reason:
          "R6·b1 socket-drop-mid-track — mock `track_paused` (RCB.track_paused) is `Screen(pad=false, banner=Banner offline)(div relative( HarareMap fill paused, absolute bottom sheet: plate chip + DELIVERY-CODE card ))`. The `HarareMap`→`ComposeMap` remap now resolves (Foundation-F.c) as for track_way; the remaining wall is the SAME live-vs-static realization gap — the app draws the reconnecting state as OfflineBanner + last-known telemetry INSIDE the composite LiveTrackingCard, not a bare paused-map canvas under a sheet — plus the sensitive W-LIVE delivery-code. Deferred with track_way; adoptable once the tracker exposes a bare map canvas region.",
      },
      {
        state: "no_rider",
        key: "RC.no_rider",
        reason:
          "R6·b2 NO_RIDER — mock `no_rider` is `Screen(AppBar, Pad(Card(EmptyState + two Buttons), Card(RTracker step=2 failAt=2)))`. W-KIT (`RTracker` with a fail marker — no app-DS equivalent) + W-LIVE/W-DATA: in-app a no_rider cancellation is folded into FoodOrderCancelledView (or, on a paid wallet order, FoodOrderRefundPendingView), which draw the app's honest terminal, not the mock's timeline card. Deferred with the cluster.",
      },
      {
        state: "rider_cancelled",
        key: "RC.rider_cancelled",
        reason:
          "R6·b6 rider-cancelled-after-secured (re-finding) — mock `rider_cancelled` is `Screen(banner=Banner warn)(OrderHead, Card(looking-again row + Skeleton), Card(RTracker step=2))`. W-LOCAL (`OrderHead`) + W-KIT (`RTracker`); in-app this is the sawRider-latched re-find rendered by FoodOrderRiderDroppedView (a live view driven by the riderDropped derivation, W-LIVE). Deferred with the cluster.",
      },
      {
        state: "resume",
        key: "RC.resume",
        reason:
          "R7·b2 app-killed-and-reopened-mid-order — mock `resume` is `Screen(banner=Banner info)(OrderHead, Card(rider row), Card(RTracker step=5))`. W-LOCAL (`OrderHead`) + W-KIT (`RTracker`); in-app 'resume' is not a screen but the warm-snapshot paint (the FoodOrderSnapshot this container reads back on mount to warm-paint whichever live phase the order is in), so there is no standalone container to point a view at (W-LIVE). Deferred with the cluster.",
      },
    ],
  },
  {
    // Phase 3 — doorstep hand-off + delivered/rate + terminals. app/food/order/[orderId].tsx routes these via
    // the FoodOrderLiveTrackerView doorstep sub-states, FoodOrderDeliveredView, FoodOrderUndeliveredView,
    // FoodOrderCancelledView and FoodOrderRefundPendingView.
    key: "RC.delivered_rate",
    container: "apps/mobile/app/food/order/[orderId].tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-b.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "handoff",
        key: "RC.handoff",
        reason:
          "R7·1 the-door (take food, then pay cash) — mock `handoff` is `Screen(footer Button)(OrderHead, Pad(Card(amount hero), Card(3 step rows), Card(masked DELIVERY CODE)))`. W-LOCAL (`OrderHead`) + W-LIVE: the masked-code-until-handshake, the 'I gave the cash' confirm and the CASH dual-confirm are the sensitive doorstep handshake inside FoodOrderLiveTrackerView, not a static Screen. Deferred with the cluster.",
      },
      {
        state: "handoff_wait",
        key: "RC.handoff_wait",
        reason:
          "R7·1b you-confirmed-rider-counting — mock `handoff_wait` is `Screen(OrderHead, Ring[85/120], Card(you-gave row + rider-counting row + Skeleton))`. W-LOCAL (`OrderHead`) + W-KIT (`Ring`) + W-LIVE (the post-confirm wait beat of the doorstep handshake, driven by the customer/rider cash-confirm timestamps). Deferred with the cluster.",
      },
      {
        state: "handoff_code",
        key: "RC.handoff_code",
        reason:
          "R7·1c both-confirmed-read-the-code — mock `handoff_code` is `Screen(banner=Banner good)(OrderHead, CodeCard code='418 302', Card(2 confirm rows))`. W-LOCAL (`OrderHead`) + W-KIT (`CodeCard` — the app reveals the delivery code via its own DeliveryCodeCard/CodeInput path, a different tag) + W-LIVE (the code only exists after the dual-confirm handshake and is fetched/rotated live — the KB-DELIVERY-CODE-ROTATION-SIGNAL sensitive path). Deferred with the cluster.",
      },
      {
        state: "handoff_dispute",
        key: "RC.handoff_dispute",
        reason:
          "R7·b3 you-confirmed-rider-didn't (on hold) — mock `handoff_dispute` is `Screen(footer Button)(OrderHead, Pad(Card(EmptyState), Card(WHAT'S LOGGED timeline), SafetyRow))`. W-LOCAL (`OrderHead`) + W-KIT (`SafetyRow`) + W-DATA (the 'WHAT'S LOGGED' timeline rows are fabricated timestamps the order record doesn't carry) + W-LIVE (the dispute-freeze is a live handshake outcome). Deferred with the cluster.",
      },
      {
        state: "delivered_rate",
        key: "RC.delivered_rate",
        reason:
          "R7·2 delivered → rate — mock `delivered_rate` is `Screen(footer 'Submit rating')(Pad(check hero, 'Delivered at 10:16', paid line, Card(food-stars + rider-stars + tag chips)))`. The centred hero already matches the app's FoodOrderDeliveredView, but three walls block the rating card: (W-DATA/#672) it draws DUAL ratings — 'How was the food?' AND 'How was Tendai M.?' — plus positive tag chips (Hot food/On time/Polite/Right order); the app ships a SINGLE tap-to-arm rating (RatingCard) and has no rider-rating write path or tag-chip backend (needs #671 rider identity + #672 dual-rating + chips). (W-CONTROL/BH-06) the mock's static 'Submit rating' footer clashes with the shipped tap-to-arm + 4s-undo model (a sensitive undo-window — the app has no submit button at all). The template-literal-border idiom that also blocked the chips is now BUILT (Foundation-F.e — it adopted role_select), so the residual walls are purely BACKEND + CONTROL: #672 dual food+rider rating + tag chips, #671 rider identity, and the undo-window model being drawn. Adoptable once those land. Deferred with the cluster (backend-gated #671/#672).",
      },
      {
        state: "failed_noshow",
        key: "RC.failed_noshow",
        reason:
          "R7·b1 customer-no-show terminal — mock `failed_noshow` is `Screen(footer ghost)(AppBar, Pad(Card(EmptyState), Card(WHAT HAPPENED: 4 raw time-rows)))`. Prims resolve, but two walls: (W-DATA) the 4-row 'WHAT HAPPENED' timeline ('Rider arrived 10:16 / Called twice 10:18 / Waiting window ended 10:24 / Food returned 10:39') is fabricated fixture data the order record doesn't carry — the app's FoodOrderUndeliveredView honest-empties it (a single reason line from UNDELIVERED_REASON_LABEL + attempt count, no timeline), so a mock-faithful view would fabricate; and (W-LIVE) the app view leads with OrderHeader+pill and a GetHelpControl, structurally diverging from the mock's AppBar + footer-button tree. Deferred with the cluster.",
      },
      {
        state: "rejected",
        key: "RC.rejected",
        reason:
          "R6·b3 merchant-rejected-after-wallet-pay (refund pending) — mock `rejected` is `Screen(AppBar, Pad(Card(EmptyState), Card(raw REFUND-PENDING pill + Money + 3 rows + Button)))`. Prims resolve, but (W-DATA) the 'Refund due by Today, 12:00' row is a wall-clock the order carries no timestamp for — the app's FoodOrderRefundPendingView deliberately renders the POLICY window ('Within N hours') instead, and omits the fabricated due-time; and (W-LIVE) the app view leads with a bare EmptyState (not the mock's AppBar + EmptyState-in-Card) and uses StatusPill, structurally diverging. A mock-faithful view would fabricate the refund-due time (CLAUDE.md forbids). Deferred with the cluster.",
      },
      {
        state: "refunded",
        key: "RC.refunded",
        reason:
          "R6·b4 refund-landed — mock `refunded` is `Screen(AppBar, Pad(Card accent(check row, Amount/Money, 'Their reference EC-4471-RF9920' row, keep-this-reference note), Button))`. Prims resolve, but (W-DATA) the merchant's refund reference ('EC-4471-RF9920') and refund timestamp ('sent it back at 11:26') are figures the order record does not carry, and (W-LIVE) the app has NO dedicated 'refunded' route — a refunded order (`refundedAt != null`) falls through to FoodOrderCancelledView, so there is no boundary to mount a generated view at without splitting the shared cancelled-terminal view. A mock-faithful view would fabricate the refund reference/time. Deferred with the cluster.",
      },
      {
        state: "cancel_sheet",
        key: "RC.cancel_sheet",
        reason:
          "R6·b5 cancel-pre-pickup sheet — mock `cancel_sheet` is `Screen(pad=false)(dimmed skeleton backdrop, absolute overlay sheet: reason radios + destructive Button + ghost Button)`. The template-literal-border idiom (each radio's `border: 1.5px solid ${i===0?…}`) is now BUILT (Foundation-F.e), so the residual wall is purely W-LIVE + superset: the app realizes the post-dispatch cancel as an inline confirm state (`cancelConfirm`) inside FoodOrderLiveTrackerView, not a routed sheet screen with a reason-picker — the reason radios are a superset the app doesn't collect (a sensitive live cancel flow, not a codegen gap). Deferred with the cluster (app re-architecture / live-superset).",
      },
    ],
  },
  // ── FOOD-ORDER TRACKER REGIONS (Foundation-F.d) ───────────────────────────────────────────────────
  // The food-order lifetime (r-customer-b.jsx) is a deeply-live composite the whole-screen model cannot
  // host (W-LIVE): its phases are hand-built `FoodOrder*View`s that combine mock states and add live
  // supersets (cancel footer, offline banner, warm-snapshot resume), so no per-mock Screen boundary
  // exists for a whole-screen swap. But the region model guards a NAMED sub-tree inside the live view,
  // which sidesteps W-LIVE — the SAME proven path as menu/cart/checkout. Two of the tracking mocks lead
  // their live sub-branch with the kit `RTracker` step-timeline, which the app realizes as its own
  // `Stepper` (the kit's RTracker literally returns `<DSR.Stepper/>`): Foundation-F.d folds
  // `RTracker`→`Stepper` (transpile DS_RENAME) and to ONE canonical STEPPER (normalize KIND), so a
  // `tracker` region rooted at the mock's RTracker stays congruent with the app's mounted Stepper. Where
  // the app draws that Stepper as a BARE, discrete node (not buried in the LiveTrackingCard composite —
  // that stays W-LIVE-deferred), the tracker region ADOPTS: FoodOrderAwaitingAcceptView (await_accept)
  // and FoodOrderPreparingView (track_prep) both mount a bare `<Stepper>` exactly where their mock draws
  // `<RTracker>`. The region owns ONLY the display timeline sub-tree; the countdown ring (hero, display
  // but wrapped differently — see deferred), the mock-local OrderHead (W-LOCAL) and the live cancel/
  // offline supersets stay container glue, honestly pruned from the composition. No sensitive logic is
  // re-homed — Stepper is a pure display timeline fed the live `events`/`status`/`merchantPhase` seam.
  {
    key: "RC.await_accept",
    container: "apps/mobile/src/ui/food/FoodOrderAwaitingAcceptView.tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-b.jsx",
    mockComponent: "await_accept",
    uiImport: "../index",
    regions: [
      {
        // Tracker region — the mock's `<Card><RTracker step=0 …/></Card>` step timeline. Locator
        // {el:"RTracker"} anchors it (the Card wrapper bubbles through in the composition, like the menu
        // footer's Screen slot). RTracker→Stepper (DS_RENAME); the bind spreads the live Stepper seam
        // (events/currentStatus/view/jobType/merchantPhase) the container already computed — a pure
        // display forward, no timeline logic re-homed.
        region: "tracker",
        locator: { el: "RTracker" },
        componentName: "FoodAwaitAcceptTrackerView",
        viewFile: "apps/mobile/src/ui/food/food-await-accept-tracker.view.tsx",
        propsParam: "props: FoodOrderTrackerViewProps",
        propsType: [
          "/** The live Stepper seam the container already computes for the seven-step food tracker —",
          " *  forwarded verbatim into the mock's RTracker sub-tree (RTracker≡Stepper). */",
          "export type FoodOrderTrackerViewProps = {",
          "  events: { status: string; createdAt: string }[];",
          "  currentStatus: string;",
          "  view: \"customer\" | \"rider\";",
          "  jobType?: \"food\" | \"parcel\";",
          "  merchantPhase?: string | null;",
          "};",
        ].join("\n"),
        bind: ({ t }) => foodTrackerBind({ t }),
      },
    ],
    deferred: [
      {
        state: "ring",
        key: "RC.await_accept#ring",
        reason:
          "the accept-countdown Ring (r-customer-b.jsx:25) is display-only, but its app realization is not a congruent leaf region: the mock draws `<Ring/>` as a direct child of a centred column, while FoodOrderAwaitingAcceptView wraps its CountdownRing in an EXTRA centring `<View>` alongside two hero-text lines (the mock centres via `textAlign`/`margin:auto`, not a wrapping box) — so a hero region would diverge by that added View, and CountdownRing lives outside the src/ui barrel (a bare-Ring region would need NON_BARREL wiring + risks the depcruise cycle). Kept as container glue (pruned from the composition); adoptable once the app's ring hero is drawn as a boxless centred sub-tree or CountdownRing earns a barrel-safe region root.",
      },
      {
        state: "head",
        key: "RC.await_accept#head",
        reason:
          "the mock-local `OrderHead` (r-customer-b.jsx:10, W-LOCAL) leads the screen; the transpiler neither inlines nor imports it, and the app draws this header as its own OrderHeader (name + pill) not as a discrete generated region. Kept as glue (pruned from the composition); adoptable once OrderHead is inlined in the transpiler and the app header earns a region boundary.",
      },
      {
        state: "hero",
        key: "RC.await_accept#hero",
        reason:
          "the 'Waiting for <Shop>' hero copy + the live cancel footer + offline banner are live supersets the static mock's centred column does not draw as a discrete sub-tree (the cancel footer is a container-owned React node, the offline banner a live-connectivity COND). Not a region; container glue, pruned from the composition.",
      },
    ],
  },
  {
    key: "RC.track_prep",
    container: "apps/mobile/src/ui/food/FoodOrderPreparingView.tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-b.jsx",
    mockComponent: "track_prep",
    uiImport: "../index",
    regions: [
      {
        // Tracker region — the mock's `<Card>(finding-a-rider row + Skeleton, <RTracker step=2 …/>)</Card>`.
        // Locator {el:"RTracker"} anchors the timeline (the finding-row + Skeleton siblings are pruned as
        // glue in the composition — they are a live 'finding a rider' sub-state the app draws inline).
        // RTracker→Stepper; the bind spreads the live Stepper seam the container already computed.
        region: "tracker",
        locator: { el: "RTracker" },
        componentName: "FoodPrepTrackerView",
        viewFile: "apps/mobile/src/ui/food/food-prep-tracker.view.tsx",
        propsParam: "props: FoodOrderTrackerViewProps",
        propsType: [
          "/** The live Stepper seam the container already computes for the seven-step food tracker —",
          " *  forwarded verbatim into the mock's RTracker sub-tree (RTracker≡Stepper). */",
          "export type FoodOrderTrackerViewProps = {",
          "  events: { status: string; createdAt: string }[];",
          "  currentStatus: string;",
          "  view: \"customer\" | \"rider\";",
          "  jobType?: \"food\" | \"parcel\";",
          "  merchantPhase?: string | null;",
          "};",
        ].join("\n"),
        bind: ({ t }) => foodTrackerBind({ t }),
      },
    ],
    deferred: [
      {
        state: "ring",
        key: "RC.track_prep#ring",
        reason:
          "the prep-countdown Ring (r-customer-b.jsx:236) is display-only, but as with await_accept its app CountdownRing is wrapped in an extra centring `<View>` the boxless mock column lacks, and CountdownRing sits outside the src/ui barrel — so a hero/ring region would diverge or need NON_BARREL wiring with depcruise-cycle risk. Kept as container glue (pruned from the composition).",
      },
      {
        state: "finding",
        key: "RC.track_prep#finding",
        reason:
          "the 'Finding a rider' row + Skeleton (the mock's `Card` header above the RTracker) is a live dispatch-in-progress sub-state the app draws inline in FoodOrderPreparingView's own copy, not as a discrete generated region; the mock-local OrderHead (W-LOCAL) leads the screen. Both kept as glue, pruned from the composition; adoptable once the finding sub-state and OrderHead earn region boundaries.",
      },
    ],
  },
  {
    // LJ.perm_loc — first-run permission priming (app/permissions.tsx). A MULTI-STATE screen: one
    // container walks two explainer steps (location → notifications), each drawn by the mock as a bare
    // `<SystemState/>` (mock `PermLoc` / `PermNotif`). Adopt BOTH steps as generated SystemState views.
    // SystemState is a structural leaf, so its icon/title/message/primary/secondary are the DATA SEAM —
    // hoisted to props so the container feeds the role-framed copy (the app varies the wording for riders
    // routed through here) while the STRUCTURE stays the mock's. The container renders the right view from
    // its existing `step` state machine and wires the OS-permission requests onto onPrimary/onSecondary.
    key: "LJ.perm_loc",
    container: "apps/mobile/app/permissions.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../src/ui",
    states: [
      {
        state: "location",
        key: "LJ.perm_loc",
        component: "PermLoc",
        componentName: "PermLocView",
        viewFile: "apps/mobile/app/permissions-location.view.tsx",
        propsParam: "{ icon, title, message, primary, secondary, onPrimary, onSecondary }: PermPrimeViewProps",
        propsType: [
          "export type PermPrimeViewProps = {",
          "  icon: IconName;",
          "  title: string;",
          "  message: string;",
          "  primary: string;",
          "  secondary: string;",
          "  onPrimary: () => void;",
          "  onSecondary: () => void;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => permSystemStateBind({ t, expr }),
      },
      {
        state: "notifications",
        key: "LJ.perm_notif",
        component: "PermNotif",
        componentName: "PermNotifView",
        viewFile: "apps/mobile/app/permissions-notifications.view.tsx",
        // perm_notif is a step-2 sibling of the same SystemState structure; the app supersets the bare
        // mock only by role-framing the copy (a data value the container owns), so it adopts cleanly as
        // its own gated view — no structural divergence, honest per the classification.
        propsParam: "{ icon, title, message, primary, secondary, onPrimary, onSecondary }: PermPrimeViewProps",
        propsType: [
          "export type PermPrimeViewProps = {",
          "  icon: IconName;",
          "  title: string;",
          "  message: string;",
          "  primary: string;",
          "  secondary: string;",
          "  onPrimary: () => void;",
          "  onSecondary: () => void;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => permSystemStateBind({ t, expr }),
      },
    ],
  },
  {
    // LJ.otp — the SMS OTP screen (app/verify.tsx). DEFER-only: a live multi-state screen the static
    // idle-state mock can't gate as a whole-screen view. See the deferred reason.
    key: "LJ.otp",
    container: "apps/mobile/app/verify.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../src/ui",
    states: [],
    deferred: [
      {
        state: "idle",
        key: "LJ.otp",
        reason:
          "live-vs-static multi-state, not a clean whole-screen form. The mock `Otp` draws ONLY the idle state (Heading, Sub, code Field, Verify, a plain 'Resend code' link, Back). The app verify.tsx interleaves, in ONE render, three further states that each have their OWN mock key — a resend-confirmation banner (LJ.otp_resent, a conditional Card above the Field), a locked/expired RECOVERY branch that swaps Verify for an info card + 'Send a fresh code' (LJ.otp_locked), and a live wall-clock cooldown that turns the resend link into a 'Resend in m:ss' countdown (LJ.otp_cooldown). Those conditionals (COND nodes the static Otp mock never drew) make the container's tree diverge from the whole-screen mock, and the codegen model gates a WHOLE-screen generated view — it cannot host the interleaved resent/locked/cooldown branches without either regressing the load-bearing OTP resend/cooldown/lockout-recovery behaviour or adding nodes the mock lacks. Adoptable once the OTP states are modelled as separate mock keys wired to their own state-views (otp_resent/otp_locked/otp_cooldown), not by forcing the live screen into the idle mock.",
      },
    ],
  },
  {
    // LJ.register — post-OTP profile setup (app/profile/setup.tsx). DEFER-only: a transpiler-idiom gap in
    // the mock's 'Verified' badge plus an inline draft-restored superset. See the deferred reason.
    key: "LJ.register",
    container: "apps/mobile/app/profile/setup.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "form",
        key: "LJ.register",
        reason:
          "UNDESIGNED-SUPERSET (the transpiler wall is now GONE). The mixed element+text-siblings idiom — the mock's 'Verified' badge `<span …absolute>{<Icon/> Verified}</span>` (a bare ' Verified' text run sibling of an `<Icon>`) — is now BUILT (Foundation-F.e wraps mixed siblings in `<Text>`, and the app already renders the badge as BOX(ICON, TEXT), so it would match). What still blocks adoption is a genuine UNDESIGNED SUPERSET: the app draws an inline draft-restored banner ('We saved what you'd filled in…') BETWEEN the Sub and the name Field — the visible affordance of the load-bearing LC-C10 profile-draft persistence — which NO mock draws (the existing LJ.draft_restored is the parcel-send composer's ComposerState draft, a different screen; there is no profile-setup draft-restored mock). The whole-screen codegen model cannot host that mid-tree COND without adding a node no mock has, and dropping the cue to match `Register` would strand a UX-review affordance. The draft PERSISTENCE itself is preserved regardless (container logic). Adoptable once a profile-setup draft-restored state earns its own drawn mock (then it wires as a separate state-view); the transpiler idiom is no longer the wall.",
      },
    ],
  },
  {
    // LJ.role_select — the post-OTP role fork (app/role.tsx). ADOPTED (Foundation-F.e): the two web idioms
    // in the mock's inline `Opt` card — a DYNAMIC template-literal `border` and a CONDITIONAL spread-token
    // `boxShadow` — now lower to RN (transpile.mjs template-literal-border + conditional-shadow-spread), so
    // `RoleSelect` generates a clean, typechecking whole-screen view. Structurally `Pad(Lockup, Heading,
    // Sub, Opt, Opt, Button)` → `BOX(BRANDLOCKUP, HEADING, SUB, OPT, OPT, BUTTON)`; the nested `Opt` is an
    // opaque sub-component on both sides (uppercase-fallback OPT), so structure holds by construction and
    // the idioms only make the view valid RN. The container keeps ALL logic (role state, saveRolePreference,
    // permission-priming route); the data seam wires each option's live `selected` + tap handler (a
    // transparent Pressable wrap) and the Button's dynamic label/onPress. `role_select_flag_off` is the
    // food-off twin — SAME structure but a `div(Dove, Wordmark)` brand mark (vs `Lockup`) and its own frozen
    // copy — adopted as a second state so the flag-off screen aligns to its OWN mock (brand mark + verbatim
    // copy), the container switching views on `restaurantsEnabled`.
    key: "LJ.role_select",
    container: "apps/mobile/app/role.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../src/ui",
    states: [
      {
        state: "form",
        key: "LJ.role_select",
        component: "RoleSelect",
        componentName: "RoleSelectView",
        viewFile: "apps/mobile/app/role.view.tsx",
        propsParam: "{ customerSelected, riderSelected, onSelectCustomer, onSelectRider, continueLabel, onContinue }: RoleSelectViewProps",
        propsType: [
          "export type RoleSelectViewProps = {",
          "  /** The customer option's live selected state (drives its mint-wash + check). */",
          "  customerSelected: boolean;",
          "  /** The rider option's live selected state. */",
          "  riderSelected: boolean;",
          "  onSelectCustomer: () => void;",
          "  onSelectRider: () => void;",
          "  /** 'Continue as a customer' / 'Continue as a rider', per the live selection. */",
          "  continueLabel: string;",
          "  onContinue: () => void;",
          "};",
          "",
          "/** The nested Opt option card's props (mock `Opt` param), typed so the view compiles strict. */",
          "type RoleOptionData = { icon: IconName; title: string; desc: string; selected: boolean };",
        ].join("\n"),
        bind: roleSelectBind,
      },
      {
        state: "flag_off",
        key: "LJ.role_select_flag_off",
        mockFile: "packages/design/explorations/journey/screens-shipped.jsx",
        component: "RoleSelectFlagOff",
        componentName: "RoleSelectFlagOffView",
        viewFile: "apps/mobile/app/role-flag-off.view.tsx",
        propsParam: "{ customerSelected, riderSelected, onSelectCustomer, onSelectRider, continueLabel, onContinue }: RoleSelectViewProps",
        propsType: [
          "export type RoleSelectViewProps = {",
          "  customerSelected: boolean;",
          "  riderSelected: boolean;",
          "  onSelectCustomer: () => void;",
          "  onSelectRider: () => void;",
          "  continueLabel: string;",
          "  onContinue: () => void;",
          "};",
          "",
          "type RoleOptionData = { icon: IconName; title: string; desc: string; selected: boolean };",
        ].join("\n"),
        bind: roleSelectBind,
      },
    ],
  },
  {
    // ── CUSTOMER ACCOUNT CLUSTER ──────────────────────────────────────────────────────────────────
    // LJ.notifications — the in-app notifications centre (app/notifications/index.tsx). The mock
    // `Notifications({ empty })` is ONE component that draws BOTH the populated feed and the empty
    // state, under a shared `div(Pad(Top))` header, forked by the `empty` prop — so it adopts as a
    // SINGLE whole-screen view whose `empty` prop the container drives (the empty branch IS the
    // LJ.notif_empty gallery screen). The mock draws the feed as `{items.map(row)}`; the app keeps its
    // FlatList (B-O1, an existing regression test pins it) — the FIRST screen to exercise the
    // documented `FlatList ≡ map` equivalence (normalize.mjs reduces the FlatList back to the mock's
    // MAP), so virtualization is preserved WITHOUT the app reverting to a literal `.map`. The two live
    // transient states the static mock never drew — a first-load skeleton and a fetch-error retry —
    // stay as the container's own early-returns (they have no mock key to gate against), exactly as the
    // Help/food-list containers keep their un-mocked chrome outside the gated view.
    key: "LJ.notifications",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    component: "Notifications",
    componentName: "NotificationsView",
    viewFile: "apps/mobile/app/notifications/notifications.view.tsx",
    container: "apps/mobile/app/notifications/index.tsx",
    uiImport: "../../src/ui",
    propsParam: "{ items, empty, onBack, onItemPress }: NotificationsViewProps",
    propsType: [
      "/** A feed row, shaped to mirror the mock's `{ icon, t, m, w, unread }` keys verbatim, plus the",
      " *  `id` the FlatList keys by (B-O1). The container maps its live `NotificationRow` onto this,",
      " *  pre-formatting the relative-time label `w` (the mock's frozen 'now'/'2 min'/'1 hr'). */",
      "export type NotificationItem = {",
      "  id: string;",
      "  icon: IconName;",
      "  t: string;",
      "  m: string;",
      "  w: string;",
      "  unread?: boolean;",
      "};",
      "export type NotificationsViewProps = {",
      "  items: NotificationItem[];",
      "  /** True → the mock's empty branch; false → the mapped feed. Driven by the container's feed. */",
      "  empty: boolean;",
      "  onBack: () => void;",
      "  /** Open the row's order/destination — the container resolves the index to its live feed row. */",
      "  onItemPress: (index: number) => void;",
      "};",
    ].join("\n"),
    hoist: ["items"],
    bind: ({ t, expr, wrap }) => ({
      JSXOpeningElement(path) {
        if (path.node.name.name === "AppBar") {
          // Kit `Top onBack={false}` (no back) → the app AppBar's live back handler; structurally the
          // same APPBAR node either way (onBack is an invisible leaf prop), so this only wires behaviour.
          path.node.attributes = path.node.attributes.filter((a) => !(a.type === "JSXAttribute" && a.name.name === "onBack"));
          path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onBack"), t.jsxExpressionContainer(expr("onBack"))));
        }
      },
      // The feed: the mock's `{items.map((n, i) => <div…>)}` → a FlatList over the SAME `items`, so the
      // app keeps virtualization (B-O1) while normalize.mjs folds the FlatList back to the mock's MAP.
      // Each row is wrapped in a transparent Pressable(onItemPress(i)) — invisible to the structural
      // diff — so a tap opens the order the mock's static row couldn't. keyExtractor keys by `id`.
      CallExpression(path) {
        const callee = path.node.callee;
        if (callee.type !== "MemberExpression" || callee.property.name !== "map") return;
        if (!(callee.object.type === "Identifier" && callee.object.name === "items")) return;
        const arrow = path.node.arguments[0];
        if (!arrow || (arrow.type !== "ArrowFunctionExpression" && arrow.type !== "FunctionExpression")) return;
        const row = arrow.body;
        if (!row || row.type !== "JSXElement") return;
        // move the React key off the row (FlatList keys via keyExtractor instead)
        row.openingElement.attributes = row.openingElement.attributes.filter((a) => !(a.type === "JSXAttribute" && a.name.name === "key"));
        const wrapped = wrap(row, "Pressable", `onPress={() => onItemPress(i)} accessibilityRole="button"`);
        const flat = expr(
          "<FlatList data={items} keyExtractor={n => n.id} showsVerticalScrollIndicator={false} renderItem={({ item: n, index: i }) => null} ListFooterComponent={<View style={{ height: tokens.space.xxl }} />} />",
        );
        const renderItem = flat.openingElement.attributes.find((a) => a.name.name === "renderItem");
        renderItem.value.expression.body = wrapped;
        path.replaceWith(flat);
        path.skip();
      },
    }),
  },
  {
    // ── CUSTOMER SYSTEM / ERROR / EMPTY STATES CLUSTER ──────────────────────────────────────────────
    // LJ.force_update — the hard version gate (app/force-update.tsx), mounted by the root layout in
    // place of the whole Stack when the installed build is below either the build-time or the
    // server-driven minimum (customer/rider S·3). The mock `ForceUpdate` is a pure `<SystemState>` leaf
    // (brand-green tone, brand mark, one line, one action) — the SAME primitive as perm_loc/perm_notif,
    // so it adopts as a single 0-residual whole-screen view. SystemState is a structural leaf, so its
    // tone/mark/title/message/primary/onPrimary are the DATA SEAM (invisible to the structural diff):
    // the mock's `brand` boolean (which the kit renders as its own Dove mark) is dropped in favour of
    // the app's `mark` slot (the container feeds <DoveMark on="green" />), and the copy is hoisted so
    // the container supplies the role-NEUTRAL "keep using LyniaGo" line (this gate fires before the role
    // is resolved — a role-specific verb would be wrong for half the users) and hides the primary when
    // no STORE_URL is configured (no dead link). Structure stays the mock's SystemState by construction.
    key: "LJ.force_update",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    component: "ForceUpdate",
    componentName: "ForceUpdateView",
    viewFile: "apps/mobile/app/force-update.view.tsx",
    container: "apps/mobile/app/force-update.tsx",
    uiImport: "../src/ui",
    propsParam: "{ mark, title, message, primary, onPrimary }: ForceUpdateViewProps",
    propsType: [
      "export type ForceUpdateViewProps = {",
      "  /** The brand mark node the kit's `brand` boolean draws internally (app feeds <DoveMark/>). */",
      "  mark: React.ReactNode;",
      "  title: string;",
      "  message: string;",
      "  /** Hidden (undefined) when no store URL is configured — never a dead 'Update now' link. */",
      "  primary?: string;",
      "  onPrimary?: () => void;",
      "};",
    ].join("\n"),
    bind: ({ t, expr }) => ({
      JSXOpeningElement(path) {
        if (path.node.name.name !== "SystemState") return;
        // Drop the mock's frozen leaf literals + the kit-only `brand` boolean; feed the app's `mark`
        // slot and the container-owned copy/action. `tone="green"` stays a static literal (both sides).
        path.node.attributes = path.node.attributes.filter(
          (a) => !(a.type === "JSXAttribute" && ["brand", "title", "message", "primary"].includes(a.name.name)),
        );
        path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("mark"), t.jsxExpressionContainer(expr("mark"))));
        path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("title"), t.jsxExpressionContainer(expr("title"))));
        path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("message"), t.jsxExpressionContainer(expr("message"))));
        path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("primary"), t.jsxExpressionContainer(expr("primary"))));
        path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onPrimary"), t.jsxExpressionContainer(expr("onPrimary"))));
      },
    }),
  },
  {
    // LJ.on_hold — the customer account-on-hold wall (app/send.tsx → SendAccountOnHoldView). DEFER-only:
    // a live ActiveOrderBanner superset + an EmptyState/"Refresh status" tree that diverges from the
    // static mock's SystemState-shaped Pad. See the deferred reason.
    key: "LJ.on_hold",
    container: "apps/mobile/app/send.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "LJ.on_hold",
        reason:
          "SUPERSET + live-vs-static, not a primitive/backend gap. The mock `OnHold` is a frozen `Pad(icon-disc, title, message, CallRow 'Support', Button 'Sign out')`. The app's SendAccountOnHoldView (the accountOnHold early-return of app/send.tsx) instead renders `Screen( COND(ActiveOrderBanner | ActiveOrderCheckFailedBanner)?, EmptyState(icon,title,message, SupportCallRow, Button 'Refresh status') )` — it (a) prepends a load-bearing live `COND` restore banner because a hold blocks composing NEW orders but NOT tracking an order already in flight, so a customer held mid-delivery must keep the only route into that live order (UX review #1); and (b) uses the in-context EmptyState + a live 'Refresh status' re-poll rather than the mock's SystemState + 'Sign out'. The whole-screen codegen model gates a view ≡ the mock and cannot host the live restore COND or reconcile the EmptyState-vs-Pad divergence without regressing the mid-delivery escape hatch. Adoptable once the restore banner earns its own drawn state and the hold wall is redrawn against the app's EmptyState tree (or a sanctioned composite lands).",
      },
    ],
  },
  {
    // LJ.generic_error — the app-wide render-crash safety net (expo-router ErrorBoundary in
    // app/_layout.tsx). DEFER-only: an EmptyState-in-Screen tree the static mock draws as a SystemState,
    // inside a framework boundary export that cannot become a plain codegen container. See the reason.
    key: "LJ.generic_error",
    container: "apps/mobile/app/_layout.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "LJ.generic_error",
        reason:
          "STRUCTURAL divergence + framework-boundary container, not a primitive/backend gap. The mock `GenericError` is a pure `<SystemState icon='circle-alert' title message primary='Try again' secondary='Back home' />` leaf. The app renders this state as expo-router's auto-mounted `ErrorBoundary` export (app/_layout.tsx) — a `SafeAreaProvider(Screen(View(EmptyState icon='triangle-alert' title message, Button 'Reload'))))` — deliberately: it must wrap its OWN SafeAreaProvider (it can render ABOVE RootLayout's provider tree when the layout subtree itself threw) and offer a single expo-router `retry()` action, not the mock's two-action nav (there is no safe 'Back home' route from an arbitrary render crash). So the tree is EMPTYSTATE-in-SCREEN, not the mock's SYSTEMSTATE leaf, and the container is a framework boundary function (not a screen the codegen model can point a generated whole-screen view at without breaking the provider-wrapping crash-recovery contract). Adoptable once GenericError is redrawn against the app's EmptyState-in-Screen recovery tree (single retry, own provider) as a sanctioned composite, rather than forcing the live crash net into the static SystemState mock.",
      },
    ],
  },
  {
    // LJ.profile — the customer Account tab (app/(tabs)/account.tsx). DEFER-only: a load-bearing
    // hub-nav superset the static Profile mock never drew. See the deferred reason.
    key: "LJ.profile",
    container: "apps/mobile/app/(tabs)/account.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "LJ.profile",
        reason:
          "SUPERSEDED TARGET as of docs/DESIGN-DEVIATIONS.md D-15 (owner-approved 2026-08-16) — the deviation entry this reason used to ask for now EXISTS. The static `Profile` mock is `Pad(Heading 'Account', Sub, Card(details), Card(Button 'Trip history', Button 'Send a parcel'), Button 'Sign out')`; the app Account tab additionally carried a load-bearing hub-nav Card without which Settings/Help/Notifications are unreachable. Rather than keep growing that superset, D-15 moved the screen onto the RIDER account grammar (RJM.account, rider-one-app.jsx): AppBar, identity card + verification pill, and ONE card of icon/label/sub/chevron rows that absorbs both the action buttons and the hub-nav — so the customer and rider Account tabs are the same screen in two roles. The shared primitives (apps/mobile/src/ui/account/AccountRows.tsx) copy their geometry from the GENERATED rider view, keeping the kit authoritative. Still DEFER for codegen: this container is a whole-screen view of a DIFFERENT mock than its key names, plus live loading/error CONDs the static mock has no node for. Re-adoptable against `Profile` once an export redraws it in the one-app language (then delete D-15), or against RJM.account's grammar once the codegen model supports pointing one key's container at another screen's transpiled tree.",
      },
    ],
  },
  {
    // LJ.settings — the customer Settings screen (app/settings/index.tsx). DEFER-only: Play-required
    // Delete/Privacy rows + an inline delete-confirm COND the base `Settings` mock never drew. See below.
    key: "LJ.settings",
    container: "apps/mobile/app/settings/index.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "LJ.settings",
        reason:
          "SUPERSET + wrong-base, not a primitive gap. The base `Settings` mock draws avatar+name, Rows(Edit profile · Notifications 'On' · Language · Payment), a spacer, Row(Sign out, danger) and the version line. The app adds two rows the mock never drew but Google Play REQUIRES be reachable from settings — 'Privacy notice' and 'Delete account' — the latter expanding into an inline two-step delete-confirm `Card` (a `COND` the static mock has no node for); those requirements have their OWN separate mock screens (LJ.privacy / LJ.delete_account / LJ.delete_final), not inline rows here. The app's Notifications row also reads the REAL OS permission ('On'/'Off'/'—'), which aligns to the `SettingsPerms` mock (LJ.settings_perms), NOT to base `Settings`'s frozen 'On'. So neither `Settings` nor `SettingsPerms` matches the app's full tree, and the whole-screen model can't host the extra rows + delete-confirm COND. Adoptable once Delete/Privacy move to their own routed screens (delete_account/delete_final/privacy) and the permission rows are modelled against SettingsPerms as a sanctioned composite.",
      },
    ],
  },
  {
    // LJ.history — the customer Orders/trips history (app/history/index.tsx). DEFER-only: a per-row
    // 'Send again' reorder superset + live states the static History mock never drew. See the reason.
    key: "LJ.history",
    container: "apps/mobile/app/history/index.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "LJ.history",
        reason:
          "SUPERSET + live-vs-static, not a primitive/backend gap. The mock `History` is `Pad(Heading 'Your trips' [in-body, no AppBar], Sub, TRIPS.map(Card(route, date·role·★, Money + StatusPill)))`. The app history screen (a) uses a pushed-screen `AppBar` (title+sub) instead of the mock's in-body `Heading`; (b) adds a load-bearing per-row 'Send again' reorder `Pressable` (a `COND` on `onReorder`, customer trips only) the mock's static row never drew — the repeat-order shortcut; (c) adds a stale-cache `ListHeaderComponent` banner ('Showing your last saved trips…' + Retry); and (d) interleaves live loading/empty/error states with none of a mock key. The whole-screen codegen model gates a view ≡ the mock and cannot host the per-row reorder COND, the AppBar-vs-Heading divergence, or the stale/loading/empty/error branches without regressing reorder/stale-paint or adding undrawn nodes. Adoptable once the row reorder affordance + stale/empty/error each earn their own drawn state/mock, or a sanctioned composite lands.",
      },
    ],
  },
  {
    // ── PARCEL SEND-COMPOSER cluster — the customer flagship INTERACTIVE screen (app/send.tsx). The
    // FIFTH region-adopted interactive container (Foundation-F.c), and the first MAP-ANCHORED one. A
    // map-anchored composer: a full-bleed map + tap-to-pin, a two-snap compose sheet, inline address
    // search, a confirm-pin modal, item/price/phone/landmark capture and submit. The three gallery keys
    // home_empty/home_pins/home_expanded are the SAME mock `Home` (screens.jsx:145) param'd across
    // pins/expanded; addr_search/addr_map_confirm are its address sub-states.
    //
    // A whole-screen generated view cannot host this screen's live behaviour (geolocation + tap-to-pin,
    // the two-snap sheet, inline AddressSearch, the confirm-pin modal, and the SENSITIVE submit —
    // CreateOrderRequest validation + idempotency-key derivation + the accept-to-continue disclaimer
    // gate) without regressing it, AND the app folds the mock's home_empty/pins/expanded states into one
    // live container (W-LIVE). So it adopts PIECE-BY-PIECE via the region model, which guards a NAMED
    // sub-tree inside the live container rather than the whole screen. TWO regions are adopted, exactly
    // the map/sheet foundation this sub-build (Foundation-F.c) unlocked:
    //   • map — the full-bleed map canvas. The mock draws `<K.FauxMap fill pins=…>`; the app realizes it
    //     LIVE as `<ComposeMap>` (geolocation, tap-to-pin, drag-marker, the route line). FauxMap→ComposeMap
    //     is the DS_RENAME remap; both fold to the canonical MAP kind (normalize.mjs), so the fragment is
    //     congruent by construction. The container mounts `<SendMapView>` (a thin controlled wrapper) where
    //     it used to mount `<ComposeMap>` directly; every live prop flows straight through the seam.
    //   • footer (submit bar) — the pinned submit CTA the mock draws in `K.MapSheet.footer` (drawn as
    //     "Broadcast request"; renamed "Proceed" by D-31, and its hint suppressed — see the region below).
    //     This is what the generalized non-`Screen` slot locator (Foundation-F.c) unlocked: `{slot:"footer"}`
    //     now anchors on the SHEET, not only a `<Screen>`. The mock footer is `div(hint?, Button)`; the app
    //     mounts `<SendComposeFooterView>` in `BottomSheet.footer`, keeping the live missing-requirements
    //     hint (shown until the form is complete, = the mock's until-pins hint) and the load-bearing submit
    //     (onBroadcast → the disclaimer gate → the idempotent create). The out-of-area notice + ErrorText
    //     stay live container glue beside it (pruned from the composition — not drawn by the static mock).
    // The composition check reduces BOTH mock and container to `BOX( REGION:map, REGION:footer )` — the map
    // canvas first, the submit sheet-footer last, in the mock's order. The address/item/price/phone/landmark
    // form body, the confirm-pin modal and the disclaimer sheet are live glue (pruned): the mock's sheet
    // body is built from mock-LOCAL helpers (`AddressFields`/`QtyStepper`) + repeated DS `<Field>`s the
    // transpiler cannot inline, and the address search / confirm-pin are live supersets — see the deferrals.
    key: "LJ.home_empty",
    container: "apps/mobile/app/send.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    mockComponent: "Home",
    uiImport: "../src/ui",
    regions: [
      {
        // Map-canvas region — the full-bleed compose map. Locator {el:"FauxMap"} anchors the mock's
        // `<K.FauxMap fill>` (member-tag terminal name). The bind drops the kit placeholder props
        // (fill/pins) and the container drives the real ComposeMap through the controlled props seam
        // (pickup/drop/active + the change + reverse-geocode callbacks + topOffset), unchanged.
        region: "map",
        locator: { el: "FauxMap" },
        componentName: "SendMapView",
        viewFile: "apps/mobile/app/send-map.view.tsx",
        propsParam: "props: SendMapViewProps",
        propsType: [
          "export type SendMapViewProps = {",
          "  pickup: PickedPoint | null;",
          "  drop: PickedPoint | null;",
          "  active: ActiveSlot;",
          "  onChangePickup: (p: PickedPoint) => void;",
          "  onChangeDrop: (p: PickedPoint) => void;",
          "  onReverseGeocodePickup?: (landmark: string) => void;",
          "  onReverseGeocodeDrop?: (landmark: string) => void;",
          "  topOffset?: number;",
          "};",
        ].join("\n"),
        bind: ({ t }) => ({
          JSXOpeningElement(path) {
            if (path.node.name.name !== "ComposeMap") return;
            // Drop the kit FauxMap placeholder props (fill/pins) — the live map is fully controlled by
            // the container via the props seam.
            path.node.attributes = [t.jsxSpreadAttribute(t.identifier("props"))];
          },
        }),
      },
      {
        // Submit-footer region — the pinned submit bar the mock draws in `K.MapSheet.footer`
        // (`div(hint?, Button)`). Locator {slot:"footer"} folds the sheet's footer slot (the generalized
        // non-`Screen` slot locator, Foundation-F.c). The hint COND stays in the TREE — the mock draws it,
        // so removing the node would break the structural snapshot — but D-31 has the container pass
        // showHint={false} forever, so it never renders. The Button wires onPress→onBroadcast (the
        // disclaimer gate + idempotent create), loading, disabled, and takes D-31's 'Proceed' label.
        region: "footer",
        locator: { slot: "footer" },
        componentName: "SendComposeFooterView",
        viewFile: "apps/mobile/app/send-compose-footer.view.tsx",
        propsParam: "{ showHint, hint, onBroadcast, busy, disabled }: SendComposeFooterViewProps",
        propsType: [
          "export type SendComposeFooterViewProps = {",
          "  /**",
          "   * Show the missing-requirements hint above the CTA (mock: shown until the pins are set).",
          "   * D-31: the container hard-codes this false — the hint is not shown at all any more. The branch",
          "   * stays so this generated tree still matches the mock's `div(hint?, Button)`.",
          "   */",
          "  showHint: boolean;",
          "  /** The live 'Add … to broadcast' summary of what is still missing. Unused while D-31 stands. */",
          "  hint: string;",
          "  onBroadcast: () => void;",
          "  busy?: boolean;",
          "  disabled?: boolean;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => ({
          ConditionalExpression(path) {
            // `!pins ? <hint> : null` → `showHint ? <hint> : null` (the free `pins` param becomes the seam).
            path.node.test = expr("showHint");
          },
          JSXText(path) {
            // The frozen hint copy → the live missing-requirements summary.
            if (path.node.value.trim().startsWith("Add pickup")) path.replaceWith(t.jsxExpressionContainer(expr("hint")));
          },
          JSXOpeningElement(path) {
            if (path.node.name.name !== "Button") return;
            // Kit web props (onClick, the frozen disabled={!pins}) → the app Button's onPress/loading/disabled.
            // The label is the ONE piece of kit copy this region no longer keeps verbatim: D-31 (owner
            // instruction 2026-08-17) renames the mock's 'Broadcast request' to 'Proceed'. Rewritten here
            // rather than hand-edited into the generated file, so a regeneration cannot silently restore
            // the mock's word.
            path.node.attributes = path.node.attributes.filter(
              (a) => !(a.type === "JSXAttribute" && ["onClick", "disabled"].includes(a.name.name)),
            );
            for (const a of path.node.attributes) {
              if (a.type === "JSXAttribute" && a.name.name === "label" && a.value?.type === "StringLiteral") {
                a.value = t.stringLiteral("Proceed");
              }
            }
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onPress"), t.jsxExpressionContainer(expr("onBroadcast"))));
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("loading"), t.jsxExpressionContainer(expr("busy"))));
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("disabled"), t.jsxExpressionContainer(expr("disabled"))));
          },
        }),
      },
    ],
    deferred: [
      {
        state: "pins",
        key: "LJ.home_pins",
        reason:
          "the SAME mock `Home` at pins=true (screens.jsx:145) — the set-pin state only fills the AddressFields/price/phone leaf VALUES; it adds no new locatable region root. The map + submit-footer regions are now ADOPTED (they are pin-state-independent and cover both home_empty and home_pins); what stays deferred is the WHOLE-screen state, whose sheet body is live glue (mock-local AddressFields/QtyStepper + repeated DS Fields the transpiler cannot inline). Deferred as a whole-screen state, not a region gap.",
      },
      {
        state: "expanded",
        key: "LJ.home_expanded",
        reason:
          "the SAME mock `Home` at pins=true/expanded=true (screens.jsx:145) — the expanded branch swaps the collapsed 'Add landmarks' button for three more DS `<Field>`s inside a raw `<div>`, adding no unique locatable region root (the extra Fields make `{el:'Field'}` still more ambiguous). The map + submit-footer regions are adopted and cover it; the expanded sheet-body form stays live glue. Deferred as a whole-screen state.",
      },
      {
        state: "addr_search",
        key: "LJ.addr_search",
        reason:
          "the address-search sub-state of the send composer. The app folds it INLINE into the compose sheet as a live `AddressSearch` (classification SUPERSET — mock draws it as a standalone screen `AddrSearch`), so it has no standalone container to point a view at. It lives in the compose sheet BODY, which stays live glue beside the two adopted regions (map + submit-footer) — the body is built from mock-local `AddressFields`/`QtyStepper` + repeated DS `<Field>`s the transpiler cannot inline, so it earns no region root of its own. Deferred with the composer's sheet body.",
      },
      {
        state: "addr_confirm",
        key: "LJ.addr_map_confirm",
        reason:
          "the confirm-pin-on-map sub-state of the send composer — realized in-app as the `AddressConfirmSheet` MODAL opened from the compose sheet (not a routed screen), over the same map/sheet shell. The map canvas itself is now the ADOPTED `map` region (FauxMap→ComposeMap); the confirm-pin MODAL is a live superset with no standalone container or locatable DS region root of its own. Deferred as a live-superset modal.",
      },
    ],
  },
  {
    // ── PARCEL AUCTION / OFFERS cluster — the customer reviewing ranked rider bids on a broadcast
    //    parcel (app/order/[id].tsx). The four gallery keys are the mock `Auction` (screens.jsx:210,
    //    variant=finding|live|expired) + `AuctionCounter` (screens.jsx:512). This is a list+card
    //    composite (NOT map-dependent — no Foundation-F FauxMap gap in the auction states themselves),
    //    but it registers DEFER-only, like the send composer / RC.orders / LJ.otp: a deeply-live
    //    composite container the whole-screen + region codegen model cannot host without regressing a
    //    SENSITIVE area (best-match offer RANKING, accept-offer idempotency + agreed-price, counter-offer
    //    accept/decline F-07, select-race 409 recovery, rebroadcast). Three structural walls run through
    //    the whole cluster: (W1) KIT-COMPOSITE member tags — the mocks author the offer cards + sort
    //    chips as `K.OfferCard`/`K.SortChips` (K = window.LyniaKit), JSXMemberExpression tags. The
    //    member-tag IDIOM half is now RESOLVED (Foundation-F.b): transpile.mjs collapses `<Ns.Name>` →
    //    `<Name>` (so `K.OfferCard`→`OfferCard`, `PB.Dove`→`DoveMark`), and the normalizer already read the
    //    terminal `.name.text` off the PropertyAccessExpression — so a member tag now classifies the same
    //    on both sides. What REMAINS of W1 is the missing REALIZATION: unlike Ring/RTracker/RiderCard/
    //    CodeCard (which map to shipped app primitives CountdownRing/Stepper/RiderMini/CodeInput), there is
    //    NO app OfferCard/SortChips DS primitive to remap to (the app draws each bid inline as
    //    `Card(RiderMini, Money, Button)` and the sort chips inline as `Pressable(Text)`), so authoring
    //    OfferCard/SortChips as real DS primitives (or a region locator that anchors the terminal member
    //    name) is still required before a generated view resolves — and W3 below blocks adoption regardless.
    //    (W2) `OrderHead` is a mock-local helper
    //    (screens.jsx:31) the transpiler neither inlines nor can import — every auction mock leads with it.
    //    (W3) LIVE-VS-STATIC composite with no whole-screen boundary — the app's `open_for_offers` render
    //    is NOT an early-return Screen; it is a `<View>` interleaved inside ONE `<Screen><ScrollView>`
    //    alongside the active-tracking / delivered / completed / expired / cancelled terminal states, so
    //    there is no per-state Screen to swap a generated whole-screen view into (unlike food-list's
    //    early-returned loading/error). Full per-state analysis below.
    key: "LJ.auction_live",
    container: "apps/mobile/app/order/[id].tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    mockComponent: "Auction",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "LJ.auction_live",
        reason:
          "the populated offers list — mock `Auction` default return (screens.jsx:265) `Pad(OrderHead, headerRow[muted '3 riders bidding' + tabular timer], askingLine, K.SortChips, K.OfferCard recommended, K.OfferCard, K.OfferCard)`. Hits all three cluster walls at once: (W1) the sort chips + three offer cards are `K.SortChips`/`K.OfferCard` kit-composite member tags — the member-tag IDIOM now resolves (Foundation-F.b: transpile.mjs collapses `K.OfferCard`→`OfferCard`), but there is still NO app OfferCard/SortChips DS primitive to land those on (the app draws each bid inline as `Card(RiderMini, Money, Button)`), so a generated view emits `<OfferCard o={RIDERS[0]}>` against an unresolved import until OfferCard/SortChips are authored as DS primitives; (W2) it leads with the mock-local `<OrderHead>` (transpiler still neither inlines nor imports it); (W3) in-app the live offers list is a `<View>` inside the composite order Screen, gating `<AuctionClock/>` (the 1s countdown header extracted per PERF20-02), an `orderedOffers.map` that mixes `<CounterOfferCard>` and inline `<Card>` per `isActiveCounter`, `BidEntrance` animations, a `>1`-gated sort-chip row, a select-race notice and a one-primary-CTA rule — not a whole-screen swap. The region model can't rescue it either: the mock's three offer cards are LITERAL siblings with NO `.map()` for `{map:}` to find, and the root is a `<Pad>` (not a `<Screen>`) so `{slot:}` can't fold a footer. Also note `Auction` is a variant-SWITCH function (finding/race/expired/noriders/live) so extractComponent pulls all five returns into one view and normalize.mjs's `returnedExpr` reads only the LAST (live) top-level return. Remaining walls for F-F.c/d: author OfferCard/SortChips DS primitives + inline OrderHead (W1/W2 realization), then give the live auction per-state boundaries (W3) — a Foundation build, not one iteration in a sensitive area.",
      },
      {
        state: "loading",
        key: "LJ.auction_finding",
        reason:
          "the waiting-for-bids state — mock `Auction` variant=\"finding\" (screens.jsx:211), an EARLY return inside `if (variant===\"finding\")`. Not isolable by the codegen model: normalize.mjs reads only the LAST top-level return of a component (the live variant), so a finding-only view cannot be extracted by component NAME without splitting `Auction` into a named per-variant component in packages/design — FORBIDDEN (reverse-drift freeze). In-app it is the live-but-empty `SkeletonCard + Sub('No offers yet — riders nearby have been pinged. Hang tight.')` sub-branch INSIDE the open_for_offers composite (W3), not an early-return Screen, and it still leads with the mock-local `OrderHead` (W2) and draws the `askingLine` price context. Deferred with the cluster; adoptable once the Auction variants are modelled as separate named mocks and the finding state earns its own boundary.",
      },
      {
        state: "expired",
        key: "LJ.auction_expired",
        reason:
          "the window-closed terminal — mock `Auction` variant=\"expired\" (screens.jsx:242) `Pad(OrderHead[expired,offline], EmptyState(Button 'Nudge price & re-broadcast', Button ghost 'Edit order'))`. Same variant-branch non-isolability as auction_finding (an `if` early return the normalizer can't select by name), and the mock-local `OrderHead` wall (W2). In-app it is one of THREE honest `expiredTerminalKind` EmptyState conditionals (had-offers / no-supply / default — the app deliberately supersets the single mock EmptyState with cold-start-safe copy driven by `hadOffers`/`expiryNoSupply`) rendered inside the composite Screen (W3), not a whole-screen swap. Deferred with the cluster.",
      },
      {
        state: "counter",
        key: "LJ.auction_counter",
        reason:
          "the counter-offer review — mock `AuctionCounter` (screens.jsx:512) IS a clean single-return named component, and its counter CARD transpiles cleanly (static `border` shorthand expands, `boxShadow` token spreads, `placeItems:center`→flex-center, `borderRadius:50%`→px all lower fine). But it still (a) leads with the mock-local `<OrderHead>` (W2 — transpiler doesn't inline it) and ends with the kit-composite `<K.OfferCard o={RIDERS[0]}>` ('Other offers') — the member tag now collapses to `<OfferCard>` (Foundation-F.b) but there is no app OfferCard DS primitive behind it yet (W1 realization); and (b) has no whole-screen container boundary — the app renders a counter as ONE `<CounterOfferCard>` (a bespoke app component, not the mock's inline primitives) interleaved in the live `orderedOffers.map` gated by `isActiveCounter`, NOT as a separate auction_counter screen (W3). Adopting the whole-screen mock would mean rebuilding the entire live auction around a static composite, regressing streaming/ranking/select-race and the F-07 decline (one round, no counter-back). Deferred with the cluster; adoptable once OfferCard is authored as a DS primitive, OrderHead is inlined, and the counter state earns its own boundary.",
      },
    ],
  },
  // ─────────────────────────── RIDER ONBOARDING + TOP-UP GATE (RJ / RJM) ───────────────────────────
  // The current rider design is RJM (one app: Jobs · Money · Account). The rider FIRST-RUN/SIGN-IN band
  // (RJ splash/onboard/login/otp/role_select/perm_loc/perm_notif) is the SHARED customer auth flow — the
  // SAME app screens already adopted/deferred above under the LJ keys (splash is the native expo-splash;
  // onboard→onboarding.tsx and login→phone.tsx are adopted; otp/register/role_select are deferred;
  // permissions.tsx renders a rider-framed variant of the SAME generated PermLocView/PermNotifView via its
  // `isRider` copy seam, so the rider permission screens are ALREADY structurally gated on the exact views
  // the rider uses). Re-gating those same view FILES against the RJ mocks would collide on the generated
  // header comment (`gen LJ.perm_loc` and `gen RJ.perm_loc` write the identical path), so the shared band
  // is not double-adopted. What is rider-SPECIFIC here — the KYC band and the top-up gate — is folded into
  // two large INTERACTIVE multi-state containers (the RiderHome board and become.tsx), with live-vs-static
  // divergence in sensitive KYC/gate code, and is deferred honestly per state (CLAUDE.md: honesty over
  // volume; keep KYC/gate behaviour identical). Each is a genuine wall, not laziness.
  {
    key: "RJ.kyc_intro",
    container: "apps/mobile/app/rider/(tabs)/index.tsx",
    mockFile: "packages/design/explorations/journey/rider-screens.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "intro",
        key: "RJ.kyc_intro",
        reason:
          "the 'Set up as a rider' prompt is NOT a standalone screen — it is one branch (knownUnverified && !rider) of the RiderHome multi-state board container (app/rider/(tabs)/index.tsx:1063), rendered as a bare `<EmptyState icon=\"id-card\" title=\"Set up as a rider\">` with a 'Become a rider' + 'Refresh status' pair, INSIDE the container's ScrollView under the live AppScreen banner. The mock `KycIntro` draws `Pad(RiderHead, EmptyState(one Button))` as its own whole screen; the app supersets it with a Refresh-status action and hosts it as one interleaved gate state among the KYC-pending/failed/expired, no-GPS and online-gate branches (the mock's RiderHead is the app's AppScreen banner). The whole-screen codegen model gates a WHOLE-screen view (`view ≡ mock`) and cannot isolate one branch of that interactive container. The screenshot-lane target (RJ.kyc_intro → become.tsx) points at the become FORM, a different screen. Adoptable once the rider gate states are modelled as their own state-views on the board container.",
      },
    ],
  },
  {
    key: "RJ.kyc_form",
    container: "apps/mobile/app/rider/become.tsx",
    mockFile: "packages/design/explorations/journey/rider-screens.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "form",
        key: "RJ.kyc_form",
        reason:
          "become.tsx is a live INTERACTIVE container, not the mock's static `KycForm`. The mock draws `Pad(Heading, Sub, Card(3 Fields), Card(Field + Label + a frozen 'Photo added — retake' pill), Card(consent note), Button)`. The app hosts, in ONE screen: an ImagePicker camera/gallery capture, a downscale→presign→PUT upload chain with a slow-link 'Still uploading' state, a PhotoReviewCard preview STEP that replaces the whole form body before commit (kit photo_preview), an encrypted KYC-draft restore banner, an OS 'don't ask again' permission-blocked 'Open settings' recovery, a 'Try again' re-PUT of a failed asset, and a submitted 'pending' Card that supplants the form — none drawn by the static mock, several swapping the entire body (reviewAsset / pending). This is a sensitive KYC screen where behaviour must stay identical; a whole-screen generated view cannot host the capture/preview/upload/draft branches without regressing them, and region-adopting only the static name-fields Card would be a thin, fragile win on load-bearing PII capture. Live-vs-static superset (the live photo capture is the realization of the mock's static pill). Adoptable once the form's static sub-tree earns a boundary separable from the capture/preview interaction.",
      },
    ],
  },
  {
    key: "RJ.kyc_pending",
    container: "apps/mobile/app/rider/(tabs)/index.tsx",
    mockFile: "packages/design/explorations/journey/rider-screens.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "pending",
        key: "RJ.kyc_pending",
        reason:
          "folded into the RiderHome board container (index.tsx:1117-1139), not a standalone screen. The app renders TWO honest pending branches the single static mock never drew — a manual-review 'Your ID is under review · no action needed' EmptyState (kycMode==='manual', which has NO vendor browser step) and an auto 'Finish verifying your ID · Continue verification' EmptyState (retryKyc mints a fresh Didit session) — interleaved among the other gate branches under the live AppScreen banner. The mock `KycPending` is `Pad(RiderHead, EmptyState(one 'Continue in browser' Button))` as its own screen. Whole-screen codegen cannot gate one branch of the interactive container, and the app's honest manual/auto split supersets the single mock (rendering only the browser-step variant would lie to manual-mode riders). Adoptable once the board's gate states earn their own state-views.",
      },
    ],
  },
  {
    key: "RJ.kyc_verified",
    container: "apps/mobile/app/rider/(tabs)/index.tsx",
    mockFile: "packages/design/explorations/journey/rider-screens.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "verified",
        key: "RJ.kyc_verified",
        reason:
          "NOT drawn in the app (CLAUDE.md not-drawn⇒not-rendered): the mock `KycVerified` is a whole-screen celebration `Pad(RiderHead chip, Card accent('You're verified'), Button 'Go online')`, but the app has no verified-confirmation surface — a verified rider drops straight onto the board (the RJM.board list / the offline go-online Card), and the 'go online' affordance is the board's own toggle, not a dismissable success page. Adopting this would ADD a celebration interstitial the current one-app flow intentionally never shows. Deferred as correctly-absent; adoptable only if the product decides to add a post-verification interstitial.",
      },
    ],
  },
  {
    key: "RJM.gate_topup",
    container: "apps/mobile/app/rider/(tabs)/money.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "gate",
        key: "RJM.gate_topup",
        reason:
          "live-vs-static — the merged one-app design intentionally does NOT render a standalone 'Top up to keep riding' gate screen. The mock draws `div(AppBar 'Top up to keep riding', Pad(Card(danger-wash wallet tile, 'Your balance is $0.00', commission copy, 'Top up now', ghost 'How commission works')))` as its own screen. The app realizes the low-balance gate in TWO honest places instead: (1) the Money tab balance hero (money.tsx:249) switches the Card to dangerWash with a 'Below the $2 floor — top up to keep riding' line + 'Top up' button — money.tsx's own comment says 'RJM.gate_topup is the empty gate'; and (2) the board's `commission_low_balance` online-gate EmptyState (index.tsx:1207) with a 'Go to Money' CTA, deliberately routing the rider to their real balance rather than deep-linking past it into a bare top-up form. Neither is a 1:1 view carrying the mock's AppBar+Card tree — both are branches of interactive multi-state containers (Money tab / RiderHome board). The gate behaviour is derived within those drawn structures (live-vs-static). Adoptable only if the product reintroduces a standalone gate screen.",
      },
    ],
  },
  // ─────────────────────────── RIDER MONEY + ACCOUNT (RJM Money·Account tabs) ───────────────────────────
  // The current rider design is RJM (one app: Jobs · Money · Account), authored in `rider-one-app.jsx`.
  // The Account tab (A1 `account`) is ADOPTED below; the Money tab (M1 `money`) stays deferred on a
  // live-vs-static wall (not the wrapper). Deferred entries honest per CLAUDE.md (honesty over volume;
  // wallet/money is SENSITIVE — behaviour kept identical, tests green).
  //
  // ROOT WALL — SOLVED (Foundation-F.a). Every screen in rider-one-app.jsx returns `S(<div>…</div>,
  // { tab, footer, banner })`, where `S` is a mock-local helper that wraps the body in the DS
  // `AppScreen`/SHELL. The normalizer (normalize.mjs) used to yield `[]`/null on that non-`.map`
  // CallExpression — "no JSX render found in component" — so nothing in the family extracted. Foundation-F.a
  // taught the render-root readers to UNWRAP a render-helper call (`renderHelperUnwrap`: a plain-identifier
  // callee whose FIRST arg is JSX → treat that JSX as the render root) AND canonicalise the SHELL/`S()`
  // wrapper to SCREEN (folding `opts.banner`/`opts.footer` as Screen slots), with the emit-side transpiler
  // lowering `S()` → `<Screen>` to match. Every rider-one-app screen now EXTRACTS. What keeps most of the
  // family deferred is no longer the wrapper but the SECOND wall each carries: W-KIT/W-LOCAL composite tags
  // the app realizes with different primitives (board/offer_*/active_*: JobCard/TypeTag/CashStrip/OnlinePill,
  // Ring/RTracker/RiderCard), the map canvas (track_*: HarareMap — Foundation-F.c), the interactive board's
  // gate branches, or a live-vs-static multi-state divergence (money, gate_topup). Account had ONLY the
  // wrapper + a minor live-vs-static skew, so it adopts now.
  {
    key: "RJM.money",
    container: "apps/mobile/app/rider/(tabs)/money.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RJM.money",
        reason:
          "LIVE-VS-STATIC multi-state + a fabricated-figure gap (the render-helper/SHELL wrapper wall is GONE — Foundation-F.a unwraps `S()`, and `treeOfNamedComponent('money')` now extracts cleanly to `SCREEN( BOX( APPBAR, BOX( CARD( TEXT, BOX(MONEY, TEXT), TEXT, BUTTON ), CASHSTRIP, … ) ) )`). What still blocks it: money.tsx is a live MULTI-STATE container, not the static single-state mock — it early-returns a `SkeletonRows` loading state and an `EmptyState`+Retry error state the mock never draws, renders a live `pendingTopupBanner` recovery Card superset (an app-kill-during-top-up reconciliation surface, money.tsx:223 — not in the mock), draws the balance as a bare `<Text>{formatMoney(balance)}</Text>` where the mock draws `<Money v=\"4.60\" size={28}>` BESIDE a fabricated '≈ 30 more jobs' estimate the app HONESTLY omits (no such projection exists — so the mock's balance hero `div(MONEY, TEXT)` cannot be adopted 1:1 without either fabricating the projection or dropping the second child and diverging), switches the hero Card accent→dangerWash with four conditional copy branches (negative/belowFloor/gettingLow/healthy) for the one static mock line, and gives the ledger an honest empty-state + a 'Load older' pagination control (server caps pages at 25) the mock's fixed 4-row LEDGER never shows. The mock ALSO draws a `CashStrip` (yours vs owed-to-a-kitchen) composite the app's Money tab does not carry as a single tag. Wallet/money is SENSITIVE — behaviour kept byte-identical. Adoptable once the mock's static data-state sub-tree earns a boundary separable from the loading/error/recovery-banner branches AND the fabricated '30 more jobs' projection is either dropped from the mock or backed by a real estimator.",
      },
    ],
  },
  {
    // ── RJM.account — the rider Account tab (app/rider/(tabs)/account.tsx). The FIRST adopted screen of
    // the rider-one-app.jsx family, unblocked by Foundation-F.a: the normalizer now unwraps the mock's
    // `S(<div>…</div>, { tab:'acct' })` render-helper (folding the DS AppScreen/SHELL to SCREEN) and the
    // transpiler lowers `S()` to `<Screen>`, so the whole-screen view extracts. The mock `account` is
    // `Screen( div( AppBar, Pad( Card(identity row), Card(settings.map) ) ) )` — an identity Card + a
    // 5-row settings Card, plain divs + DS primitives (Card/Icon/StatusPill), no W-KIT/map. The data seam
    // wires the live `['me']` identity (name, rating/jobs/KYC line — honest-empty '★ new' until the first
    // rating lands) and the settings rows + their route taps; each settings row gains a transparent
    // Pressable(→its route). The identity Card gains NOTHING — it stays the plain, inert Card the mock
    // draws (D-26, owner 2026-08-17; it carried a Pressable into /profile until then, see the bind's
    // NOTE below — do not re-add one). The always-
    // drawn status pill (the mock draws it) reflects the rider's REAL online/offline state, not a frozen
    // 'online'. The container early-returns a SkeletonList loading state (glue, not gated) — the static
    // mock draws no loading variant, so there is no separate state-view to guard for it.
    key: "RJM.account",
    container: "apps/mobile/app/rider/(tabs)/account.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../../../src/ui",
    states: [
      {
        state: "data",
        key: "RJM.account",
        component: "account",
        componentName: "RiderAccountView",
        viewFile: "apps/mobile/app/rider/(tabs)/account.view.tsx",
        propsParam: "{ name, identityLine, online, rows, onRowPress }: RiderAccountViewProps",
        propsType: [
          "/** A settings row: [icon, label, sub] — mirrors the mock's `[ic, l, s2]` tuple verbatim. */",
          "export type RiderAccountRow = [IconName, string, string];",
          "export type RiderAccountViewProps = {",
          "  name: string;",
          "  /** '★ 4.9 · 312 jobs · verified' — the rating/jobs/KYC line, honest-empty until data lands. */",
          "  identityLine: string;",
          "  /** Whether the rider is online now — drives the always-drawn status pill's tone + label. */",
          "  online: boolean;",
          "  rows: RiderAccountRow[];",
          "  onRowPress: (index: number) => void;",
          "};",
        ].join("\n"),
        bind: ({ t, expr, wrap }) => {
          return {
            // The mock's frozen identity text → the live name / rating line (leaf text swaps; the
            // structural normalizer drops text content, so these never move the tree).
            JSXText(path) {
              const v = path.node.value.trim();
              if (v === "Tendai M.") path.replaceWith(t.jsxExpressionContainer(expr("name")));
              else if (v === "★ 4.9 · 312 jobs · verified") path.replaceWith(t.jsxExpressionContainer(expr("identityLine")));
            },
            // `...TAB` is a mock-local module const (`{ fontVariantNumeric: "tabular-nums" }`) NOT in the
            // extracted component — replace the spread with RN's `fontVariant:["tabular-nums"]` so the
            // rating line keeps tabular figures without an undefined reference. A style leaf → invisible
            // to the structural diff.
            ObjectExpression(path) {
              const tab = path.node.properties.filter(
                (p) => p.type === "SpreadElement" && p.argument.type === "Identifier" && p.argument.name === "TAB",
              );
              if (!tab.length) return;
              path.node.properties = path.node.properties.filter((p) => !tab.includes(p));
              path.node.properties.push(t.objectProperty(t.identifier("fontVariant"), t.arrayExpression([t.stringLiteral("tabular-nums")])));
            },
            // The status pill is ALWAYS drawn (the mock draws it); wire its tone/label to the rider's real
            // online state (honest, not the mock's frozen 'online'). Leaf props → structurally invisible.
            JSXOpeningElement(path) {
              if (path.node.name.name !== "StatusPill") return;
              path.node.attributes = path.node.attributes.filter(
                (a) => !(a.type === "JSXAttribute" && ["status", "tone", "dot"].includes(a.name.name)),
              );
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("status"), t.jsxExpressionContainer(expr('online ? "Online" : "Offline"'))));
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("tone"), t.jsxExpressionContainer(expr('online ? "online" : "offline"'))));
              path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("dot"), null));
            },
            // Settings rows: swap the mock's frozen tuple array for the live `rows` prop, index the map,
            // and wrap each row in a Pressable(onRowPress(i)) — a transparent interaction wrapper the
            // guardrail sees through. The React key moves to the wrap.
            CallExpression(path) {
              const callee = path.node.callee;
              if (callee.type !== "MemberExpression" || callee.property.name !== "map") return;
              callee.object = expr("rows");
              const arrow = path.node.arguments[0];
              if (!arrow || (arrow.type !== "ArrowFunctionExpression" && arrow.type !== "FunctionExpression")) return;
              if (arrow.params.length < 2) arrow.params.push(t.identifier("i"));
              const row = arrow.body.type === "JSXElement" ? arrow.body : null;
              if (!row) return;
              const keyAttr = row.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "key");
              row.openingElement.attributes = row.openingElement.attributes.filter((a) => a !== keyAttr);
              const wrapped = wrap(row, "Pressable", `onPress={() => onRowPress(i)} accessibilityRole="button"`);
              if (keyAttr) wrapped.openingElement.attributes.unshift(keyAttr);
              arrow.body = wrapped;
            },
            // NOTE: the identity Card is deliberately NOT wrapped in a Pressable. It used to be — a
            // transparent tap opening `/profile?side=rider` — until the owner's 2026-08-17 instruction
            // ("when I click the profile under accounts it must not be clickable to display another
            // window for both rider and customer sides"), ledgered as D-26. The mock draws a plain,
            // inert Card, so dropping the wrap moves this view TOWARDS `rider-one-app.jsx :: account`,
            // not away from it: there is no deviation left to sanction here.
          };
        },
      },
    ],
  },
  {
    // ── RJM.board — the rider job BOARD list (app/rider/(tabs)/index.tsx `RiderHome`). The FIRST
    // region-adoption of the rider-one-app.jsx (RJM) family. The mock `board` is
    //   S( div( AppBar "Jobs near you"·bell, OnlinePill, Pad( JOBS.map(j => <JobCard {...j}/>) ) ), {tab:"jobs"} )
    // — an AppBar, a compact online-status pill, then ONE tagged job-card list. Only the LIST is
    // region-adopted here (display structure, no accept-logic): the mock's `JobCard` composite is the
    // app's own `src/ui/rider/JobCard` (imported from its OWN module, NOT the src/ui barrel, to avoid
    // the `no-circular` depcruise violation — see emit.mjs NON_BARREL), which already mirrors the mock's
    // TypeTag + km + Money + route-line + note + action anatomy. `JobCard` normalizes to an opaque leaf
    // (JOBCARD), so the region reduces to MAP(JOBCARD) on both sides.
    //
    // WHY this needed two composition-path guardrail fixes (normalize.mjs), NOT app-logic changes:
    //   (1) the RJM mocks return `S(<div>…</div>, opts)`, a render-helper shell; `jsxRootNode` unwraps
    //       it to the bare `<div>` so locators walk the body, which left the mock COMPOSITION SCREEN-less
    //       while the app roots at `<AppScreen>` (SCREEN). `mockCompositionTree` now folds the S() shell
    //       to SCREEN (mirroring the normalized-tree path's renderHelperUnwrap), so both sides root at
    //       SCREEN(REGION:list). (2) `RiderHome` DEFINES a helper component (ActiveJobCheckFailedBanner)
    //       above its default export, which `findFirstRenderer` picked as "the container"; the composition
    //       check now uses `findContainerRenderer` (prefer the default export). Both fixes touch only the
    //       parity engine, are inert for the existing 32 (their default export already IS the first
    //       renderer; none use the S() shell in a region), and change NO app behaviour.
    //
    // SENSITIVE-AREA PRESERVATION: the board list carries NO accept/agreed-price/assignment logic — a
    // parcel card's action is `chooseOrder(o)`, which opens the OFFER-COMPOSE card (the auction seam);
    // that handler is preserved BYTE-IDENTICAL and passed in as the row's `onAction`. The virtualized
    // happy-path list (the `showOpenOrdersList` early-return FlatList, B-O1b) is UNTOUCHED — the region
    // view mounts in the container's fallback/main branch (the one the composition check reduces, i.e.
    // the LAST return), where the mock's plain `.map` is the faithful, non-nested realization (a plain
    // map, not a FlatList, since it renders inside the main ScrollView — no nested-VirtualizedList).
    key: "RJM.board",
    container: "apps/mobile/app/rider/(tabs)/index.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    mockComponent: "board",
    uiImport: "../../../src/ui",
    regions: [
      {
        region: "list",
        locator: { map: "JobCard" },
        componentName: "RiderBoardListView",
        viewFile: "apps/mobile/app/rider/(tabs)/board-list.view.tsx",
        propsParam: "{ jobs }: RiderBoardListViewProps",
        propsType: [
          "/** One board row's data seam — the app `JobCard`'s props verbatim, plus the stable order `id`",
          " *  the list keys by and the `onAction` the container wires (a parcel card → the offer-compose",
          " *  seam `chooseOrder`, preserved byte-identical). The mock's `JobCard` composite folds to the",
          " *  app's `src/ui/rider/JobCard`, which carries the same TypeTag/route/note/action anatomy. */",
          "export type RiderBoardJob = {",
          "  id: string;",
          '  jobType: "parcel" | "food";',
          "  from: string;",
          "  to: string;",
          "  distanceLabel: string;",
          "  fare: string;",
          "  note: string;",
          "  actionLabel: string;",
          "  onAction: () => void;",
          "};",
          "export type RiderBoardListViewProps = {",
          "  jobs: RiderBoardJob[];",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => ({
          // Swap the mock's frozen `JOBS` array for the live `jobs` prop, key each row by its stable
          // order id (the mock keyed by array index — `ranked` reorders, so id is the correct key), and
          // drop the now-unused index param. The `{...j}` spread stays: each `jobs` item already carries
          // exactly the app JobCard's props (+ id/onAction), so the row is `<JobCard {...j}/>` — a JOBCARD
          // leaf either way, structurally invisible to the diff. No structural edit; pure data seam.
          CallExpression(path) {
            const callee = path.node.callee;
            if (callee.type !== "MemberExpression" || callee.property.name !== "map") return;
            if (!(callee.object.type === "Identifier" && callee.object.name === "JOBS")) return;
            callee.object = expr("jobs");
            const arrow = path.node.arguments[0];
            if (!arrow || (arrow.type !== "ArrowFunctionExpression" && arrow.type !== "FunctionExpression")) return;
            const row = arrow.body.type === "JSXElement" ? arrow.body : null;
            if (!row || row.openingElement.name.name !== "JobCard") return;
            if (arrow.params.length >= 2) arrow.params = arrow.params.slice(0, 1);
            row.openingElement.attributes = row.openingElement.attributes.filter(
              (a) => !(a.type === "JSXAttribute" && a.name.name === "key"),
            );
            row.openingElement.attributes.unshift(t.jsxAttribute(t.jsxIdentifier("key"), t.jsxExpressionContainer(expr("j.id"))));
          },
        }),
      },
    ],
  },
  {
    // ── RJM.board_empty — the "online, nothing in range yet" empty state of the board container
    // (app/rider/(tabs)/index.tsx `RiderHome`). DEFER-ONLY as of docs/DESIGN-DEVIATIONS.md D-30,
    // because the app deliberately draws ONE NODE FEWER than the mock. The mock `board_empty` is
    //   S( div( AppBar "Jobs near you", OnlinePill, Pad( Card( EmptyState icon="inbox" … · ghost "Refresh" ) ) ), {tab:"jobs"} )
    // and this region WAS adopted as CARD(EMPTYSTATE(BUTTON)) — the BUTTON being that ghost "Refresh",
    // wired to `openQ.refetch()`. The owner's standing 2026-08-16 instruction is that there is no manual
    // refreshing anywhere in the app; #755 removed the eight "Refresh status" buttons under it, and this
    // one survived that sweep only because it is labelled plain "Refresh" and lives in its own view file.
    // With the button gone the committed view is CARD(EMPTYSTATE) while the mock still draws the BUTTON,
    // and `snapshot.mjs` compares the RAW mock fragment against the committed view with no escape hatch
    // for a deliberately-undrawn node (`normalize.mjs` has no skip/undrawn concept). An adopted region
    // would therefore be permanently red, so the region is WITHDRAWN rather than the guardrail weakened:
    // the honest record is this deferral plus the `undrawn` entry on tools/parity/expected/RJM.board_empty.json
    // that the rendered-conformance lane reads. `board-empty.view.tsx` is hand-maintained from here and
    // keeps the mock's Card wrapper — the structural win the region was adopted for — so only the button
    // is lost, not the geometry. Re-adoptable the moment an export redraws `board_empty` without the
    // Refresh button (then delete D-30), or once the codegen model can carry a ledgered undrawn node.
    key: "RJM.board_empty",
    container: "apps/mobile/app/rider/(tabs)/index.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "board_empty",
        key: "RJM.board_empty",
        reason:
          "the mock draws Card(EmptyState(ghost 'Refresh')) and the app draws Card(EmptyState) — one drawn node fewer, by the owner's standing 2026-08-16 instruction that there is NO manual refreshing anywhere (#755 removed the eight 'Refresh status' buttons under that instruction; this one survived only because it is labelled plain 'Refresh' and lives in its own view file). Ledgered as docs/DESIGN-DEVIATIONS.md D-30 and recorded as an `undrawn` entry on tools/parity/expected/RJM.board_empty.json. NOT expressible as an adopted region: snapshot.mjs compares the raw mock fragment to the committed view and normalize.mjs has no skip/undrawn concept, so the region would be permanently red — withdrawn rather than weakening the guardrail to fit. The mock's Card wrapper (the structural win of the original adoption) is kept in the now hand-maintained board-empty.view.tsx. Re-adoptable once an export redraws board_empty without the button, or once the codegen model can carry a ledgered undrawn node through the snapshot.",
      },
    ],
  },
  {
    // ── RJM.offline — the rider board's OFFLINE screen (J3), still DEFERRED this pass (adopted alongside
    // board_empty, which was safe; offline was not). The mock `offline` draws TWO cards:
    //   S( div( AppBar "Jobs", Pad(
    //        Card center( power-circle · "You're offline" · one-queue copy · "Go online" ),
    //        Card( wallet tile · "Commission balance" · Money "4.60" · "Top up" ) ) ), {tab:"jobs"} )
    // The go-online Card is safe to restructure (the app's `onlineToggleCard` → the mock's centred
    // power-circle Card; `onlineM.mutate(true)` preserved). What blocks a CLEAN adoption is the SECOND
    // card: the mock draws a live COMMISSION-BALANCE tile ($ + "Top up"), but the board container
    // (app/rider/(tabs)/index.tsx) reads NO wallet/commission balance — `getMe`'s `Me.rider` carries no
    // balance field (auth.ts:48-65) and the board mounts no `useWallet` query (only the Money tab does).
    // Rendering the drawn card would require EITHER adding a new wallet read to this sensitive board
    // screen (beyond a display-only pass — new data-fetching on the accept/assignment surface) OR
    // fabricating the "$4.60"/dropping the drawn card (both forbidden: CLAUDE.md no-fabricated-figures /
    // not-drawn⇒not-rendered cuts the other way when the mock DOES draw it). There is also a live-vs-
    // static skew: the app's `onlineToggleCard` is an always-shown toggle (online→"Go offline",
    // offline→"Go online"), not an offline-only branch, and it is mounted via a hoisted-const identifier
    // rather than inline, so the offline presentation is not a cleanly-isolable region. Adoptable once
    // the board legitimately carries the commission balance (a wallet read wired here, or surfaced on
    // `Me.rider`) so the mock's second card can be wired to real data — or the offline mock is re-split.
    key: "RJM.offline",
    container: "apps/mobile/app/rider/(tabs)/index.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "offline",
        key: "RJM.offline",
        reason:
          "the mock's offline screen draws a live COMMISSION-BALANCE card ($ tile + 'Top up') alongside the go-online card, but the board container (index.tsx) reads no wallet/commission balance — Me.rider (auth.ts) has no balance field and the board mounts no useWallet query (only the Money tab does). Rendering the drawn card would need a NEW wallet read on this sensitive accept/assignment board (beyond a display-only pass) or a fabricated figure / a dropped drawn card (both forbidden). The go-online card itself is safely restructurable, but the app's onlineToggleCard is an always-shown toggle mounted via a hoisted-const identifier (not an inline, offline-only region), a live-vs-static skew too. Adoptable once the board legitimately carries the commission balance so the second card wires to real data, or the offline mock is re-split.",
      },
    ],
  },
  {
    // ── RJM.offer_food — the rider's incoming FOOD-DISPATCH OFFER (app/rider/food-offer.tsx), the
    // accept-offer decision screen. ADOPTED this pass (region `offer`), unblocked by the owner's product-
    // rule clarification (2026-08-12): riders NEVER pay cash upfront — cash is collected from the customer
    // AFTER delivery, or the customer pre-pays via mobile money. The old `cash_upfront` branch (a danger-
    // wash "THIS KITCHEN ASKS YOU TO PAY FIRST · front $X" card + an "Accept · front $X" money-commitment
    // label) therefore drew a flow that DOES NOT EXIST — incorrect UI to remove, not money-safety copy to
    // preserve. With cash_upfront gone the screen is the mock's cash-collect case plus the customer-prepaid
    // (`wallet`) case, and the RJM mock's single-variant offer card is CORRECT to adopt.
    //
    // The mock `offer_food` (rider-one-app.jsx J4) is
    //   S( div( AppBar 'Food job'·sub, Pad( Card( div(TypeTag food · Money), 'Your fare is fixed…' copy,
    //        div('MONEY AT THE DOOR' · 'Collect $15.50 for the kitchen' · 'Nothing from your pocket…') ) ) ),
    //      { footer: div( Button 'Accept this job', ghost 'Not this one' ) } )
    // The offer CARD is the region adopted here (locator {el:"Card"} → RiderFoodOfferCardView), reducing on
    // both sides to CARD( BOX[ai:center,row](TYPETAG, BOX[flex1], MONEY), TEXT, BOX(TEXT, BOX(MONEY), TEXT) ).
    // `TypeTag` is a new tokens-only DS primitive (src/ui/rider/TypeTag.tsx) the generated view imports from
    // its OWN module (emit.mjs NON_BARREL — no `no-circular` cruiser cycle), mirroring JobCard.
    //
    // TWO seams only, both leaf-level (structurally invisible): the header Money `v` → the rider's fixed
    // delivery `fare`, and the tile Money `v` → the `collectAmount` (the kitchen's money collected at the
    // door). The mock's tile amount line is `<div>Collect <Money/> for the kitchen</div>` — a div whose only
    // ELEMENT child is Money (normalizes to BOX(MONEY)); RN's transpiler wraps the bare "Collect"/"for the
    // kitchen" words in <Text> siblings (BOX(TEXT,MONEY,TEXT)), so the bind collapses that inner box back to
    // the lone <Money> to match the mock, the eyebrow ("MONEY AT THE DOOR") + note carrying the copy. The
    // mock copy (eyebrow, fare line, note, both button labels) is kept VERBATIM in the generated view.
    //
    // The footer accept/decline pair lives in the render-helper `S(…,{footer})` opts, which the region
    // locators do not reach (jsxRootNode unwraps S() to its body; the footer slot is a future region
    // concern — normalize.mjs) — so the pinned Button pair stays container glue in `<Screen footer=…>`,
    // pruned from the composition (which reduces on both sides to SCREEN(REGION:offer)). The `wallet`
    // (customer-prepaid) card is the honest container glue for the one case the single-variant mock does
    // not draw (same Card anatomy, wallet copy) — also pruned from the composition.
    //
    // SENSITIVE-PATH PRESERVATION (byte-identical): the `getFoodDispatchOffer` 3s poll (`offerQ`), the
    // `acceptFoodDispatch(offer.orderId)` / `declineFoodDispatch(offer.orderId)` mutations (`acceptM` /
    // `declineM`) and their onSuccess nav/invalidations, `foodOfferVariant`, `pendingOrQueued` gating and
    // the flag-off/loading/expired EmptyState early-returns are all unchanged — only the presentational
    // tree is restructured and the dead cash_upfront variant removed. `food-rider-job.ts` `foodOfferVariant`
    // still computes `cash_upfront`; the screen collapses that (impossible) value into the collect case.
    key: "RJM.offer_food",
    container: "apps/mobile/app/rider/food-offer.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    mockComponent: "offer_food",
    uiImport: "../../src/ui",
    regions: [
      {
        region: "offer",
        locator: { el: "Card" },
        componentName: "RiderFoodOfferCardView",
        viewFile: "apps/mobile/app/rider/food-offer-card.view.tsx",
        propsParam: "{ fare, collectAmount }: RiderFoodOfferCardViewProps",
        propsType: [
          "export type RiderFoodOfferCardViewProps = {",
          "  /** The rider's fixed delivery fare (the mock header Money). */",
          "  fare: string | number | null | undefined;",
          "  /** The kitchen's money collected at the door and handed back after the drop (the tile Money). */",
          "  collectAmount: string | number | null | undefined;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => {
          let moneyIdx = 0;
          const TEXT_ONLY = new Set(["fontSize", "fontWeight", "letterSpacing", "lineHeight", "color", "textAlign", "fontVariant"]);
          return {
            // The tile amount line `<div>Collect <Money/> for the kitchen</div>` becomes a View whose bare
            // words RN wrapped in <Text>; collapse it to the lone <Money> so the box matches the mock's
            // BOX(MONEY), and drop the text-only style keys the div carried (invalid on an RN View). The
            // header row (TypeTag/spacer/Money) is untouched — it wraps a Money but carries no <Text>.
            JSXElement(path) {
              const open = path.node.openingElement;
              if (open.name.name !== "View") return;
              const elKids = path.node.children.filter((c) => c.type === "JSXElement" || c.type === "JSXSelfClosingElement");
              const money = elKids.find((c) => c.openingElement && c.openingElement.name.name === "Money");
              const hasText = elKids.some((c) => c.openingElement && c.openingElement.name.name === "Text");
              if (!money || !hasText) return;
              path.node.children = [money];
              const styleAttr = open.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "style");
              const obj = styleAttr && styleAttr.value && styleAttr.value.expression;
              if (obj && obj.type === "ObjectExpression") {
                obj.properties = obj.properties.filter((p) => !(p.type === "ObjectProperty" && !p.computed && TEXT_ONLY.has(p.key.name || p.key.value)));
              }
            },
            // The two frozen Money literals → the data seam: the FIRST (header, size 20) is the fare, the
            // SECOND (tile, size 13.5) is the collectAmount. Document order is stable.
            JSXOpeningElement(path) {
              if (path.node.name.name !== "Money") return;
              moneyIdx += 1;
              const which = moneyIdx === 1 ? "fare" : "collectAmount";
              path.node.attributes = path.node.attributes.filter((a) => !(a.type === "JSXAttribute" && a.name.name === "v"));
              path.node.attributes.unshift(t.jsxAttribute(t.jsxIdentifier("v"), t.jsxExpressionContainer(expr(which))));
            },
          };
        },
      },
    ],
  },
  {
    // ── RJM.offer_parcel — the rider's PARCEL offer-compose card (app/rider/(tabs)/index.tsx `RiderHome`:
    // the `selected` compose card + its Send/Skip footer). ADOPTED this pass (region `offer`). This is the
    // AGREED-PRICE / auction seam — the rider names a fare and an ETA and `makeOffer` submits the bid — so
    // the adoption is presentational ONLY: the mock's Card element TREE is adopted; every money/assignment
    // handler is forwarded UNCHANGED. The mock `offer_parcel` (rider-one-app.jsx J5) is
    //   S( div( AppBar 'Parcel job'·sub, Pad( Card(
    //        div( TypeTag · spacer · 'Sender asking' · Money ),
    //        Field 'Your fare (USD)', Field "You'll be there in" ) ) ),
    //      { footer: div( Button 'Send offer', ghost 'Skip this job' ) } )
    // The offer CARD is the region adopted here (locator {el:"Card"} → RiderOfferParcelCardView), reducing on
    // both sides to CARD( BOX[ai:center,row](TYPETAG, BOX[flex1], TEXT, MONEY), FIELD, FIELD ). `TypeTag` is
    // the shared tokens-only DS primitive (src/ui/rider/TypeTag) the generated view imports from its OWN
    // module (emit.mjs NON_BARREL — no `no-circular` cruiser cycle), reused verbatim from offer_food.
    //
    // LIVE-vs-STATIC (owner 2026-08-11): the mock draws a routed screen (AppBar 'Parcel job' + an
    // 'Eastgate → Avenues · 3.1 km' route sub, then the Card); the app realizes the SAME compose step as an
    // INLINE card on the board — there is no routed offer screen; the rider taps a board row, `chooseOrder`
    // opens the compose card in place. So the mock's Card TREE is adopted and kept in the board container;
    // the AppBar/route sub is not realized (the inline card has no AppBar), and the footer Send/Skip pair —
    // carried in the mock's `S(…,{footer})` opts, which the region locators do not reach (jsxRootNode unwraps
    // S() to its body) — stays container glue in the board's ScrollView/FlatList footer, pruned from the
    // composition (which reduces on both sides to SCREEN(REGION:offer)). This is the SAME container that
    // already region-adopts RJM.board (list) + RJM.board_empty (empty); each composition check anchors ONLY
    // its own region component and prunes the others, so the three stay independent on the one container
    // (the RC.menu + RC.closed_interrupt precedent).
    //
    // NOT-DRAWN⇒NOT-RENDERED — and why it changes NO money logic: the pre-adoption app card drew (a) two
    // header Text lines (route + itemDesc) and (b) a segmented "Accept $X / Offer a different price" tablist
    // that conditionally HID the fare field. The mock draws NEITHER — it draws ONE always-visible "Your fare
    // (USD)" field and derives accept-vs-counter from the fare VALUE, exactly as `makeOffer`'s mutationFn
    // already does (`fareNum === Number(proposedFare) ? "accept" : "counter"`). The tablist never fed
    // `makeOffer` (which reads the fare, not `offerMode`), so it is an IA affordance the mock retired, not an
    // agreed-price gate; removing it is presentation-only. `offerMode` state + its bid-draft persistence are
    // kept BYTE-IDENTICAL (still set by `chooseOrder`/draft-restore, still saved) — only the toggle that
    // rendered it is gone, and the fare field is now always shown (seeded with the asking price by
    // `chooseOrder`, as before, so the default one-tap "Send offer" still submits fare == asking → "accept").
    //
    // TWO leaf seams (structurally invisible): the header Money `v` → the sender's `proposedFare`, and the
    // two Fields' value/onChangeText/keyboardType → the live `fare`/`eta` compose state. The fare field's
    // mock hint ("Riders here usually get $2.96 on this distance…") names a market figure the app does NOT
    // model, so it is wired as a container-owned `fareHint` leaf (honest copy) rather than shipping the
    // fabricated $2.96 — the same live-vs-static leaf treatment board_empty's message used (the normalizer
    // drops text, so the swap is invisible to the diff). The ETA field's hint ("Be honest — arriving late is
    // what loses you the next job.") is honest and kept VERBATIM.
    //
    // SENSITIVE-PATH PRESERVATION (byte-identical): `offerM`/`makeOffer(selected.id, { type, offeredFare,
    // etaMinutes })`, the accept-vs-counter type derivation, the `fare`/`eta`/`offerMode` compose state, the
    // `canOffer` gate, `recordSentOffer` + the one-offer-per-job rule (`bidIds` filtering `ranked`), the
    // idempotency-409 reconciliation and the closed-window handling are ALL unchanged — the container
    // forwards the existing handlers into the new tree. The Send button keeps its exact
    // `canOffer && offerM.mutate({ fare, fareNum, etaNum })` onPress; the ghost "Skip this job" keeps the old
    // Cancel's `setSelected(null)` + in-flight guard (label is mock copy verbatim, handler identical).
    key: "RJM.offer_parcel",
    container: "apps/mobile/app/rider/(tabs)/index.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    mockComponent: "offer_parcel",
    uiImport: "../../../src/ui",
    regions: [
      {
        region: "offer",
        locator: { el: "Card" },
        componentName: "RiderOfferParcelCardView",
        viewFile: "apps/mobile/app/rider/(tabs)/offer-parcel-card.view.tsx",
        propsParam: "{ proposedFare, fare, onChangeFare, fareHint, eta, onChangeEta }: RiderOfferParcelCardViewProps",
        propsType: [
          "export type RiderOfferParcelCardViewProps = {",
          "  /** The sender's asking price (the mock header Money). */",
          "  proposedFare: string | number | null | undefined;",
          "  /** The rider's fare bid — the always-shown \"Your fare (USD)\" field (seeded with the asking price). */",
          "  fare: string;",
          "  onChangeFare: (v: string) => void;",
          "  /** Honest fare hint — the mock's \"$2.96 usual\" market figure is not modelled, so the container",
          "   *  feeds its own copy (structurally invisible; the normalizer drops text). */",
          "  fareHint?: string;",
          "  /** The rider's ETA-to-pickup in minutes — the \"You'll be there in\" field. */",
          "  eta: string;",
          "  onChangeEta: (v: string) => void;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => ({
          JSXOpeningElement(path) {
            const name = path.node.name.name;
            if (name === "Money") {
              // The lone header Money (the "Sender asking" figure) → the live proposedFare.
              path.node.attributes = path.node.attributes.filter((a) => !(a.type === "JSXAttribute" && a.name.name === "v"));
              path.node.attributes.unshift(t.jsxAttribute(t.jsxIdentifier("v"), t.jsxExpressionContainer(expr("proposedFare"))));
            }
            if (name === "Field") {
              const labelAttr = path.node.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "label");
              const label = labelAttr && labelAttr.value && labelAttr.value.type === "StringLiteral" ? labelAttr.value.value : "";
              const isFare = label === "Your fare (USD)";
              // Drop the kit's web props (value/onChange/inputMode); on the fare field also drop the mock's
              // fabricated-figure hint (re-wired as the honest `fareHint` leaf below). The ETA field keeps
              // its honest mock hint verbatim.
              path.node.attributes = path.node.attributes.filter(
                (a) => !(a.type === "JSXAttribute" && (["value", "onChange", "inputMode"].includes(a.name.name) || (isFare && a.name.name === "hint"))),
              );
              if (isFare) {
                path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("value"), t.jsxExpressionContainer(expr("fare"))));
                path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onChangeText"), t.jsxExpressionContainer(expr("onChangeFare"))));
                path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("keyboardType"), t.stringLiteral("decimal-pad")));
                path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("hint"), t.jsxExpressionContainer(expr("fareHint"))));
              } else {
                path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("value"), t.jsxExpressionContainer(expr("eta"))));
                path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onChangeText"), t.jsxExpressionContainer(expr("onChangeEta"))));
                path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("keyboardType"), t.stringLiteral("number-pad")));
                path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("maxLength"), t.jsxExpressionContainer(expr("3"))));
              }
            }
          },
        }),
      },
    ],
  },
  {
    // ── RJM.active_food — the rider's ACTIVE FOOD JOB (app/rider/food-job.tsx). SENSITIVE screen
    // (advance / pickup-code / doorstep dual-confirm / delivery-code / drop). The mock `active_food`
    // (rider-one-app.jsx J7) is
    //   S( div( AppBar 'Active job'·sub, CashStrip(yours·owed),
    //        Pad( Card( div(TypeTag food · spacer · 'Navigate'), Stepper FOOD_STEPS ),
    //             Card accent( 'Collect $15.50 at the door' · 'Food first, then the cash…' ) ) ),
    //      { tab:"jobs", footer: Button 'Enter the delivery code' } )
    //
    // ONLY the CashStrip is region-adopted (display-only, no accept/advance/confirm logic touched). The
    // three richer pieces DEFER — each a genuine wall, recorded honestly (CLAUDE.md "Pixel parity":
    // honesty over volume; a clean deferral is the right outcome when adoption isn't safe):
    //
    //   • tracker Card (TypeTag·Navigate + Stepper) — the app's Stepper is BURIED inside JobDetailsCard,
    //     which FUSES a LiveMap (src/ui/rider/JobDetailsCard.tsx:99 + :124) into one memoized composite
    //     alongside the fare / phones / items / note. The mock's tracker Card draws a clean
    //     Card(TypeTag+Navigate+Stepper) with NO map. Separating the Stepper region would mean un-fusing
    //     the live-map composite (extracting the Stepper out of JobDetailsCard into the container's main
    //     render) — the map-fused-composite deferral case (like food track_way); the map region does not
    //     cleanly separate, so it is deferred rather than forced. (Also: the composition walker sees
    //     JobDetailsCard as an opaque leaf, so its internal Stepper is invisible to a `tracker` region.)
    //   • accent cash card ("Collect $X at the door") — display-only and the app DOES draw it
    //     (food-job.tsx:800-807), but it is NOT ADDRESSABLE by the locator engine: `active_food` draws
    //     TWO sibling <Card>s and locators anchor FIRST-by-tag (normalize.mjs `locateTs` / emit.mjs
    //     `locateBabel`), so `{el:"Card"}` resolves to the tracker Card (deferred above), never the
    //     second (accent) Card. There is no attribute/index locator to disambiguate a sibling Card
    //     without extending the locator engine. Adoptable once the locator engine grows sibling
    //     disambiguation (or the tracker Card is itself adopted, freeing first-Card for the accent one).
    //   • footer "Enter the delivery code" — the DELIVERY-CODE seam (DeliveryOtp → confirmDelivery), the
    //     most sensitive path on the screen, realized in-app as the conditional doorstep cards. It rides
    //     in the mock's `S(…,{footer})` opts, which region locators do not reach (jsxRootNode unwraps
    //     S() to its body; a helper-carried footer is a future region concern) — the same treatment
    //     offer_food/offer_parcel's footers got. Container glue, pruned from the composition.
    //
    // The CashStrip region (locator {el:"CashStrip"} → RiderActiveFoodCashStripView) reduces on both
    // sides to a single opaque CASHSTRIP leaf — the same shape RC.await_accept#tracker's `<RTracker>`→
    // STEPPER leaf takes. `CashStrip` is a new tokens-only DS primitive (src/ui/rider/CashStrip.tsx, a
    // thin wrapper over the shipped CashHeldStrip so pixels are unchanged) the generated view imports
    // from its OWN module (emit.mjs NON_BARREL — no `no-circular` cruiser cycle), mirroring JobCard /
    // TypeTag. Both mock and container reduce to SCREEN(REGION:cash_strip): the tracker/accent Cards and
    // the AppBar are non-region glue (pruned), and the footer sits in opts (not reached).
    //
    // SENSITIVE-PATH PRESERVATION (byte-identical, nothing re-homed): the CashStrip carries NO handler —
    // it is a pure `yours`/`owed` display, wired to the SAME expressions the app already passed
    // CashHeldStrip (`foodOrder.deliveryFee ?? 0` / the open-debt amount). Every mutation — `advanceM`
    // (advanceStatus), `confirmPickupM` (confirmFoodPickup), `dropM` (dropFoodDispatch), `deliverM`
    // (confirmDelivery), the cash-handshake confirm/dispute, the pickup-code + delivery-code gates and
    // their attempt reconciles, the FOOD_DROPPABLE / RIDER_FOOD_NEXT gating order — is UNTOUCHED. The
    // container still mounts `<CashHeldStrip>` on its delivered terminal branch (a different render, not
    // the main active screen the composition reduces); only the main-render strip is the adopted region.
    key: "RJM.active_food",
    container: "apps/mobile/app/rider/food-job.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    mockComponent: "active_food",
    uiImport: "../../src/ui",
    regions: [
      {
        region: "cash_strip",
        locator: { el: "CashStrip" },
        componentName: "RiderActiveFoodCashStripView",
        viewFile: "apps/mobile/app/rider/active-food-cash-strip.view.tsx",
        propsParam: "{ yours, owed }: RiderActiveFoodCashStripViewProps",
        propsType: [
          "export type RiderActiveFoodCashStripViewProps = {",
          "  /** What the rider keeps (the delivery fee) — the accent 'YOURS' tile. */",
          "  yours: number;",
          "  /** The kitchen's money still riding back on an open collect-and-return debt (0 otherwise) —",
          "   *  the 'OWED TO A KITCHEN' tile, danger-washed while owing. */",
          "  owed: number;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => ({
          JSXOpeningElement(path) {
            if (path.node.name.name !== "CashStrip") return;
            // Swap the mock's frozen "2.40"/"15.50" string literals for the live numeric seam the app
            // already computes. Structurally invisible: CashStrip is an opaque leaf either way.
            path.node.attributes = path.node.attributes.filter(
              (a) => !(a.type === "JSXAttribute" && ["yours", "owed"].includes(a.name.name)),
            );
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("yours"), t.jsxExpressionContainer(expr("yours"))));
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("owed"), t.jsxExpressionContainer(expr("owed"))));
          },
        }),
      },
    ],
    deferred: [
      {
        state: "tracker",
        key: "RJM.active_food#tracker",
        reason:
          "the mock's tracker Card is a clean Card(TypeTag+Navigate+Stepper) with no map, but the app's Stepper is BURIED inside JobDetailsCard, which fuses a LiveMap (JobDetailsCard.tsx) into one memoized composite alongside fare/phones/items/note. Separating a Stepper region would mean un-fusing that live-map composite (the map-fused-composite deferral case, like food track_way) — the map does not cleanly separate. JobDetailsCard is also an opaque leaf to the composition walker, so its internal Stepper is invisible to a region. Adoptable once the Stepper is drawn as a discrete, map-free node in the main render.",
      },
      {
        state: "cash_card",
        key: "RJM.active_food#cash_card",
        reason:
          "the accent 'Collect $X at the door' card is display-only and the app draws it (food-job.tsx), but it is NOT ADDRESSABLE: active_food draws TWO sibling <Card>s and the locator engine anchors FIRST-by-tag (locateTs / locateBabel), so {el:'Card'} resolves to the tracker Card (deferred), never the second (accent) Card. No attribute/index locator disambiguates a sibling Card without extending the engine. Adoptable once the locator engine grows sibling disambiguation, or the tracker Card is adopted (freeing first-Card for the accent one).",
      },
      {
        state: "footer",
        key: "RJM.active_food#footer",
        reason:
          "the footer 'Enter the delivery code' is the DELIVERY-CODE seam (DeliveryOtp → confirmDelivery), the most sensitive path on the screen, realized in-app as the conditional doorstep cards. It rides in the mock's S(…,{footer}) opts, which region locators do not reach (jsxRootNode unwraps S() to its body; a helper-carried footer is a future region concern) — the same treatment offer_food/offer_parcel footers got. Container glue, pruned from the composition.",
      },
    ],
  },
  {
    // ── RJM.active_parcel — the rider's ACTIVE PARCEL JOB (app/rider/job.tsx). The MOST entangled active
    // screen (advance / deliver / cancel / undeliver / confirmItems / sender-rating / delivery-code
    // rotation / self-heal poll). The mock `active_parcel` (rider-one-app.jsx J6) is
    //   S( div( AppBar 'Active job'·sub·back=false, CashStrip(yours),
    //        Pad( Card( div(TypeTag · spacer · 'Navigate'), Stepper PARCEL_STEPS ) ) ),
    //      { tab:"jobs", footer: Button "I've arrived at the drop-off" } )
    //
    // ONLY the CashStrip is region-adopted (display-only, no advance/deliver/cancel/confirm logic
    // touched) — the SAME shape as RJM.active_food#cash_strip. The two richer pieces DEFER, each a genuine
    // wall recorded honestly (CLAUDE.md "Pixel parity": honesty over volume; a clean deferral is the right
    // outcome when adoption isn't safe):
    //
    //   • tracker Card (TypeTag·Navigate + Stepper) — IDENTICAL wall to active_food's tracker. The app's
    //     status timeline is drawn by JobDetailsCard (job.tsx:950), which FUSES a LiveMap into one
    //     memoized composite alongside fare/phones/items/note; the mock's tracker Card draws a clean
    //     Card(TypeTag+Navigate+Stepper) with NO map. Separating a Stepper region would mean un-fusing the
    //     live-map composite (the map-fused-composite deferral case) — the map does not cleanly separate,
    //     and JobDetailsCard is an opaque leaf to the composition walker, so its internal timeline is
    //     invisible to a region. Adoptable once the timeline is drawn as a discrete, map-free node.
    //   • footer "I've arrived at the drop-off" — the ADVANCE seam (advanceM → advanceStatus, realized in
    //     the main render as the `next.label` Button + the DeliveryOtp / can't-complete controls). It
    //     rides in the mock's `S(…,{footer})` opts, which region locators do not reach (jsxRootNode
    //     unwraps S() to its body; a helper-carried footer is a future region concern) — the same
    //     treatment offer_food/offer_parcel/active_food footers got. Container glue, pruned from the
    //     composition. NOTE: active_parcel draws only ONE Card (the tracker), so unlike active_food there
    //     is no second-sibling `<Card>` cash-card deferral here.
    //
    // The CashStrip region (locator {el:"CashStrip"} → RiderActiveParcelCashStripView) reduces on both
    // sides to a single opaque CASHSTRIP leaf. `CashStrip` is the shared tokens-only DS primitive
    // (src/ui/rider/CashStrip.tsx, a thin wrapper over the shipped CashHeldStrip so pixels are unchanged)
    // the generated view imports from its OWN module (emit.mjs NON_BARREL — no `no-circular` cruiser
    // cycle). Both mock and container reduce to SCREEN(REGION:cash_strip): the tracker Card and the AppBar
    // are non-region glue (pruned), and the footer sits in opts (not reached).
    //
    // SENSITIVE-PATH PRESERVATION (byte-identical, nothing re-homed): the CashStrip carries NO handler —
    // it is a pure `yours`/`owed` display, wired to the SAME expression the app already passed
    // CashHeldStrip on this screen (`Number(order.agreedFare ?? order.proposedFare)` / `owed={0}` — parcel
    // cash is always all "yours"). Every mutation — `advanceM` (advanceStatus), `deliverM`
    // (confirmDelivery + code), `cancelM` (cancelOrder), `undeliverM` (markUndelivered), `confirmItems`
    // (confirmAndCollect), `senderRateM` (rateSender), the delivery-code rotation / OTP-attempt reconcile
    // and the ACTIVE/NEXT/RIDER_CANCELLABLE gating order — is UNTOUCHED. This is the ONLY CashHeldStrip
    // mount in job.tsx, so the swap replaces it outright (via the CashStrip wrapper the view imports); the
    // offline-resume error branch draws a fare/route Card, not the strip.
    key: "RJM.active_parcel",
    container: "apps/mobile/app/rider/job.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    mockComponent: "active_parcel",
    uiImport: "../../src/ui",
    regions: [
      {
        region: "cash_strip",
        locator: { el: "CashStrip" },
        componentName: "RiderActiveParcelCashStripView",
        viewFile: "apps/mobile/app/rider/active-parcel-cash-strip.view.tsx",
        propsParam: "{ yours, owed }: RiderActiveParcelCashStripViewProps",
        propsType: [
          "export type RiderActiveParcelCashStripViewProps = {",
          "  /** What the rider keeps — the accent 'YOURS' tile. On a parcel this is the whole agreed fare. */",
          "  yours: number;",
          "  /** Kitchen money still owed — always 0 on a parcel (nothing is collected-and-returned), so the",
          "   *  'OWED TO A KITCHEN' tile stays the muted zero state. Kept for parity with the shared strip. */",
          "  owed: number;",
          "};",
        ].join("\n"),
        bind: ({ t, expr }) => ({
          JSXOpeningElement(path) {
            if (path.node.name.name !== "CashStrip") return;
            // Swap the mock's frozen "3.00" string literal for the live numeric seam the app already
            // computes. Structurally invisible: CashStrip is an opaque leaf either way.
            path.node.attributes = path.node.attributes.filter(
              (a) => !(a.type === "JSXAttribute" && ["yours", "owed"].includes(a.name.name)),
            );
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("yours"), t.jsxExpressionContainer(expr("yours"))));
            path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("owed"), t.jsxExpressionContainer(expr("owed"))));
          },
        }),
      },
    ],
    deferred: [
      {
        state: "tracker",
        key: "RJM.active_parcel#tracker",
        reason:
          "the mock's tracker Card is a clean Card(TypeTag+Navigate+Stepper) with no map, but the app's status timeline is drawn by JobDetailsCard (job.tsx), which fuses a LiveMap into one memoized composite alongside fare/phones/items/note. Separating a Stepper region would mean un-fusing that live-map composite (the map-fused-composite deferral case, like active_food's tracker) — the map does not cleanly separate. JobDetailsCard is also an opaque leaf to the composition walker, so its internal timeline is invisible to a region. Adoptable once the timeline is drawn as a discrete, map-free node in the main render.",
      },
      {
        state: "footer",
        key: "RJM.active_parcel#footer",
        reason:
          "the footer \"I've arrived at the drop-off\" is the ADVANCE seam (advanceM → advanceStatus), realized in-app as the main-render next.label Button plus the DeliveryOtp / can't-complete-delivery controls. It rides in the mock's S(…,{footer}) opts, which region locators do not reach (jsxRootNode unwraps S() to its body; a helper-carried footer is a future region concern) — the same treatment offer_food/offer_parcel/active_food footers got. Container glue, pruned from the composition.",
      },
    ],
  },
  {
    // ── RJM.handoff — the delivery-code HAND-OFF (src/ui/rider/DeliveryOtp.tsx, the doorstep Card mounted
    // inside the active-job screens app/rider/job.tsx:976 + app/rider/food-job.tsx:851). This is the MOST
    // SENSITIVE rider screen — the delivery-confirmation money/handoff path (DeliveryOtp → confirmDelivery,
    // the 3-wrong-tries lockout, the KB-DELIVERY-CODE-ROTATION-SIGNAL reconcile). The mock `handoff`
    // (rider-one-app.jsx J8) is
    //   S( div( AppBar 'Delivery code'·'Ask the customer to read it out',
    //        Pad( Card( div(6 code cells [4,1,9,2,•,•]),
    //                   div('Same code on parcels and food. Three wrong tries and the job locks…') ) ) ),
    //      { footer: Button 'Confirm delivery' } )
    //
    // ADOPTED: NOTHING. This is the CORRECT and expected outcome for this screen (task #48 HARD RULE:
    // "STRONGLY prefer deferring over any risk to the delivery-confirm path"; CLAUDE.md Pixel parity:
    // honesty over volume). The whole screen IS the code-entry mechanism — there is NO display-only
    // sub-tree that separates WITHOUT touching the code-entry field, the attempt counter, the lock, or the
    // confirm mutation. Every child of the mock's one Card is a sensitive-path node:
    //
    //   • the 6 code cells ARE the code-entry field. In the app they are `<CodeInput length={6}
    //     value={code} onChangeText={onChangeCode} error={otpTries>0} disabled={otpLocked} />` — the live
    //     delivery-code entry, wired to the container's code state and the 3-try lock. Restructuring the
    //     cells' presentation IS restructuring the code-entry field. Forbidden by the HARD RULE.
    //   • the single static copy line describes the 3-try lock ("Three wrong tries and the job locks").
    //     In the app that region is NOT a static line — it is the CONDITIONAL attempt/lock messaging driven
    //     by `otpTries`/`otpLocked` (the lockout logic itself). Adopting a static line as a region would
    //     either collide with that lock-driven messaging or ADD lock copy the app conditionally owns —
    //     both touch the lock.
    //   • the footer 'Confirm delivery' is the `confirmDelivery(orderId, code)` mutation (deliverM). It
    //     rides in the mock's S(…,{footer}) opts, which region locators do not reach (jsxRootNode unwraps
    //     S() to its body) — the same treatment active_food#footer / active_parcel#footer got. In fact
    //     active_food#footer ('Enter the delivery code') already deferred noting it is "realized in-app as
    //     the conditional doorstep cards" — i.e. THIS DeliveryOtp.
    //
    // NO-CONTAINER-BOUNDARY (live-vs-static). Beyond "the whole card is the mechanism", the region-codegen
    // model has nothing to anchor to here: DeliveryOtp is a plain `<Card>` FRAGMENT (no Screen/AppScreen
    // root), not a routed screen, so no region can root at SCREEN(REGION:x) on it. Its enclosing containers
    // ARE routed screens — job.tsx / food-job.tsx — but those are RJM.active_parcel / RJM.active_food,
    // whose AppBar reads 'Active job', NOT the mock's dedicated 'Delivery code' header. The app never
    // navigates to a standalone delivery-code screen; it keys the code inline in a conditional doorstep
    // branch of the active-job screen. So the mock's whole-screen S(AppBar 'Delivery code', …) has no app
    // container whose composition it can match — a standalone mock screen realized as an inline Card inside
    // a different screen (the same live-vs-static / no-boundary shape as RJM.gate_topup and RC.handoff).
    //
    // SENSITIVE-PATH PRESERVATION: byte-identical by NOT TOUCHING. DeliveryOtp.tsx is unchanged (0 +/− on
    // the code state, the CodeInput, the attempt counter, otpLocked, and the Confirm button). All sensitive
    // logic stays in the containers untouched: `otpTries` + `reconcileOtpAttempts` (the delivery-code
    // rotation reconcile), `deliverM` = `confirmDelivery(orderId, code.trim())`, and the terminal-error
    // `setOtpTries(DELIVERY_OTP_MAX_ATTEMPTS)` lockout at the 3rd wrong try. RJM.handoff stays PENDING in
    // parity-status.mjs (screen-inventory guardrail already satisfied); this entry records the disposition
    // honestly in the ledger, mirroring RJM.money / RJM.gate_topup. Adoptable only if the product draws a
    // standalone delivery-code screen (so the mock's AppBar+Card tree gains an app container), AND a
    // presentational code-cell/copy sub-tree is expressible without touching the code-entry field or the
    // lockout — i.e. never at display-only cost while the whole card is the code-entry mechanism.
    key: "RJM.handoff",
    container: "apps/mobile/src/ui/rider/DeliveryOtp.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../index",
    states: [],
    deferred: [
      {
        state: "handoff",
        key: "RJM.handoff",
        reason:
          "MOST SENSITIVE rider screen — the delivery-confirmation money/handoff path (DeliveryOtp → confirmDelivery, the 3-wrong-tries lockout, the delivery-code rotation reconcile). Adopted NOTHING (the correct, expected outcome). The whole screen IS the code-entry mechanism: the mock's one Card has only two children — the 6 code cells (= the app's `<CodeInput>`, the live delivery-code ENTRY field wired to the code state + the lock) and a single static line describing the 3-try lock (in the app: the CONDITIONAL otpTries/otpLocked messaging, i.e. the lockout logic) — plus a footer 'Confirm delivery' = the confirmDelivery mutation. No display-only sub-tree separates WITHOUT touching the code-entry field, the attempt counter, the lock, or the confirm mutation (task #48 HARD RULE; CLAUDE.md honesty over volume). NO CONTAINER BOUNDARY either: DeliveryOtp is a `<Card>` FRAGMENT (no Screen root) mounted inside job.tsx/food-job.tsx, whose AppBar reads 'Active job' (RJM.active_parcel/active_food) — the app has no standalone 'Delivery code' screen the mock's `S(AppBar 'Delivery code', Pad(Card))` can anchor to (live-vs-static, same shape as gate_topup / RC.handoff; the footer rides S(…,{footer}) opts region locators don't reach, as active_food#footer already noted for 'Enter the delivery code' — this very DeliveryOtp). DeliveryOtp.tsx is byte-identical (untouched). Adoptable only if the product draws a standalone delivery-code screen AND a code-cell/copy sub-tree becomes expressible without touching the code-entry/lock/confirmDelivery path.",
      },
    ],
  },
];

/**
 * Shared data-seam for the two permission-priming SystemState views (LJ.perm_loc / LJ.perm_notif).
 * SystemState is a structural leaf, so its icon/title/message/primary/secondary become props (hoisted
 * from the mock's frozen literals) and the OS-permission actions wire onto onPrimary/onSecondary — the
 * container feeds the role-framed copy while the mock's structure is preserved by construction.
 */
/**
 * Shared data-seam for the two food-order TRACKER region views (RC.await_accept / RC.track_prep).
 * The mock's `<RTracker>` transpiles (DS_RENAME) to the app's `<Stepper>`; drop the mock's frozen
 * step/times literals and spread the live Stepper seam (`props`) the container already computes — a
 * pure display forward. Stepper is a display timeline, so no order/timeline logic is re-homed.
 */
function foodTrackerBind({ t }) {
  return {
    JSXOpeningElement(path) {
      if (path.node.name.name !== "Stepper") return;
      path.node.attributes = [t.jsxSpreadAttribute(t.identifier("props"))];
    },
  };
}

function permSystemStateBind({ t, expr }) {
  return {
    JSXOpeningElement(path) {
      if (path.node.name.name !== "SystemState") return;
      const hoist = ["icon", "title", "message", "primary", "secondary"];
      path.node.attributes = path.node.attributes.filter(
        (a) => !(a.type === "JSXAttribute" && hoist.includes(a.name.name)),
      );
      for (const k of hoist) {
        path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier(k), t.jsxExpressionContainer(expr(k))));
      }
      path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onPrimary"), t.jsxExpressionContainer(expr("onPrimary"))));
      path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("onSecondary"), t.jsxExpressionContainer(expr("onSecondary"))));
    },
  };
}

/**
 * Flatten the registry into per-view CHECK UNITS — the shape the transpiler + guardrail consume. A
 * single-view screen yields one unit (state:null); a multi-state screen yields one unit per ADOPTED
 * state (deferred states are documentation only and never appear here). Each unit carries `screen`
 * (the owning screen's key) and `state` so `cli.mjs check` can group per-screen, per-state.
 */
export function expandAdopted() {
  const units = [];
  for (const e of ADOPTED) {
    if (Array.isArray(e.regions)) {
      // ── REGION-adopted INTERACTIVE container (Foundation-E) ── one check unit per region FRAGMENT,
      // each a generated `.view.tsx` that must stay ≡ its mock sub-tree; the container's assembly of
      // them is verified separately by the composition check (see `regionScreens()` + snapshot.mjs).
      for (const rg of e.regions) {
        // A `compositionOnly` region is asserted by the COMPOSITION check alone (its component is an
        // app-side TWIN of a DS composite mounted directly — no generated fragment view to diff yet;
        // the internal twin congruence is tracked as a referenced deferral until adopted).
        if (rg.compositionOnly) continue;
        units.push({
          screen: e.key,
          state: null,
          region: rg.region,
          isFragment: true,
          key: `${e.key}#${rg.region}`,
          mockFile: rg.mockFile || e.mockFile,
          mockComponent: rg.mockComponent || e.mockComponent,
          locator: rg.locator,
          component: rg.component,
          componentName: rg.componentName,
          viewFile: rg.viewFile,
          container: rg.container || e.container,
          uiImport: rg.uiImport || e.uiImport,
          propsParam: rg.propsParam,
          propsType: rg.propsType,
          bind: rg.bind,
          hoist: rg.hoist,
        });
      }
    } else if (Array.isArray(e.states)) {
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

/**
 * Region-adopted screens (Foundation-E) — the entries carrying a `regions[]`. Each needs, beyond its
 * per-region fragment congruence, a COMPOSITION check: the container must mount the region fragment
 * components in the mock's region order/nesting. Returns the shape snapshot.mjs consumes:
 *   { key, container, mockFile, mockComponent, regions:[{ region, locator, componentName }] }.
 */
export function regionScreens() {
  return ADOPTED.filter((e) => Array.isArray(e.regions)).map((e) => ({
    key: e.key,
    container: e.container,
    mockFile: e.mockFile,
    mockComponent: e.mockComponent,
    regions: e.regions.map((rg) => ({ region: rg.region, locator: rg.locator, componentName: rg.componentName })),
  }));
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
