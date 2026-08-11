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
    // ── RC.home — the customer Home tab (app/(tabs)/home.tsx). DEFER-only: a kit-COMPOSITE member-tag
    // screen (Foundation-F #42) atop a live-vs-static multi-state divergence. See the deferred reason.
    key: "RC.home",
    container: "apps/mobile/app/(tabs)/home.tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-a.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RC.home",
        reason:
          "KIT-COMPOSITE member-tag wall (Foundation-F #42) + live-vs-static, not a primitive/backend gap. The mock `RC.home` is `<Screen><HomeBody/></Screen>` where HomeBody is a single opaque DS composite `<AppHome address live restaurants .../>` (destructured from `P.DSR.AppHome`). The transpiler cannot inline AppHome — its whole tree (BrandHeader → ServiceTiles → LiveOrderCard(s) → 'restaurants near you' RestaurantCards) lives INSIDE the DS component, not as JSX in the mock file — so a generated whole-screen view emits an unresolved `<AppHome/>`, and region locators can't anchor sub-trees that root inside an opaque composite (same class as the send-composer's FauxMap/MapSheet regions). The app ALSO supersets: home is a live container that switches, in ONE tree, a first-load skeleton, an active-order LiveOrderCard, an active-order-check-FAILED banner and a reorder rail before the restaurants rail (a horizontal 'See all →' scroll, not the mock's vertical list) — none of which the static AppHome composite draws. Adoptable once AppHome's members are authored as locatable DS primitive regions (Foundation-F remaps + region roots), OR the composite earns per-state boundaries — a Foundation build, not one iteration.",
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
  //   (W-KIT) the tracking mocks compose from kit primitives with NO app-DS equivalent AND no transpiler
  //     remap (transpile.mjs DS_RENAME + emit.mjs uiPrims) — `Ring`, `RTracker`, `RiderCard`, `CodeCard`,
  //     `SafetyRow`, `RailRow`. The app's src/ui ships DIFFERENT primitives (RiderMini not RiderCard,
  //     Stepper not RTracker, CodeInput not CodeCard, a safety.tsx GetHelpControl not SafetyRow, and no Ring
  //     at all), so a generated view emits unresolved components — the SAME class as the auction cluster's
  //     `K.OfferCard`/`K.SortChips` (W1). Authoring these as DS primitives + transpiler remaps is a
  //     Foundation build, not one iteration.
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
  //     rider-identity gate (MerchantOrderResponse.rider) so track_secured's DATA is honest now — but the
  //     mock still renders it through the `RiderCard` kit primitive (W-KIT), so its STRUCTURE can't generate.
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
        state: "await_accept",
        key: "RC.await_accept",
        reason:
          "R5·1 waiting-on-the-kitchen — mock `await_accept` is `Screen(OrderHead, Ring[104/180], Card(RTracker step=0))`. Hits W-LOCAL (leads with the mock-local `OrderHead`), W-KIT (`Ring` countdown + `RTracker` timeline — neither in the app DS nor the transpiler remap; the app draws this phase's countdown/timeline via its own FoodOrderAwaitingAcceptView using Stepper + a server-deadline ring), and W-LIVE (the acceptDeadlineAt ring ticks live off `now`). A generated view would emit unresolved `<Ring>`/`<RTracker>` under an unresolved `<OrderHead>`. Deferred with the cluster.",
      },
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
          "R5·4 prompt-sent-waiting — mock `pay_wait` is `Screen(footer)(centred phone-disc + copy with an inline `<b>` bold)`. Uses only Screen/Button/Icon + raw divs, BUT (a) the `<b>` inside a text run is the mixed text+element-siblings transpiler idiom gap (same as LJ.register's Verified badge — no general 'wrap mixed siblings in <Text>' lowering yet, W-IDIOM), and (b) it is the `paymentPromptStatus==='pending'` branch of the combined awaiting_payment live view, not a standalone Screen (W-LIVE). Deferred with the cluster.",
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
        state: "track_prep",
        key: "RC.track_prep",
        reason:
          "R6·1 prep countdown (rider not yet secured) — mock `track_prep` is `Screen(OrderHead, Ring[17/20], Card(finding-a-rider row + Skeleton, RTracker step=2))`. W-LOCAL (`OrderHead`) + W-KIT (`Ring` + `RTracker`); the app draws the preparing phase via FoodOrderPreparingView (Stepper + a live prep timer off `now`, W-LIVE). Generated view emits unresolved `<Ring>`/`<RTracker>`. Deferred with the cluster.",
      },
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
          "R6·3 on-the-way — mock `track_way` is `Screen(pad=false)(HarareMap fill, absolute bottom sheet: RiderCard + DELIVERY-CODE card + SafetyRow)`. W-MAP: the full-bleed `HarareMap` canvas is the SAME map-anchored gap as the send-composer's FauxMap/MapSheet (Foundation-F #42) — the app draws live GPS telemetry via LiveTrackingCard inside FoodOrderLiveTrackerView, not a static map placeholder. Also W-KIT (`RiderCard`/`SafetyRow`) + W-LIVE (the masked delivery-code that only reveals after the CASH dual-confirm handshake — sensitive). Deferred to Foundation-F.",
      },
      {
        state: "track_paused",
        key: "RC.track_paused",
        reason:
          "R6·b1 socket-drop-mid-track — mock `track_paused` is `Screen(pad=false, banner=Banner offline)(HarareMap fill paused, absolute bottom sheet: plate chip + DELIVERY-CODE card)`. Same W-MAP `HarareMap` wall as track_way (Foundation-F #42); in-app the reconnecting state is the OfflineBanner + last-known telemetry inside the live tracker, not a static paused-map placeholder (W-LIVE). Deferred to Foundation-F.",
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
          "R7·2 delivered → rate — mock `delivered_rate` is `Screen(footer 'Submit rating')(Pad(check hero, 'Delivered at 10:16', paid line, Card(food-stars + rider-stars + tag chips)))`. The centred hero already matches the app's FoodOrderDeliveredView, but three walls block the rating card: (W-DATA/#672) it draws DUAL ratings — 'How was the food?' AND 'How was Tendai M.?' — plus positive tag chips (Hot food/On time/Polite/Right order); the app ships a SINGLE tap-to-arm rating (RatingCard) and has no rider-rating write path or tag-chip backend (needs #671 rider identity + #672 dual-rating + chips). (W-CONTROL/BH-06) the mock's static 'Submit rating' footer clashes with the shipped tap-to-arm + 4s-undo model (a sensitive undo-window — the app has no submit button at all). (W-IDIOM) the chip `border: 1px solid ${i<2?…}` is a DYNAMIC template-literal border the transpiler's border-shorthand handler doesn't expand (same gap as role_select). Adoptable once the dual food+rider rating + tag chips are backed (#671/#672), the undo-window model is drawn, and the template-literal-border idiom lands. Deferred with the cluster.",
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
          "R6·b5 cancel-pre-pickup sheet — mock `cancel_sheet` is `Screen(pad=false)(dimmed skeleton backdrop, absolute overlay sheet: reason radios + destructive Button + ghost Button)`. (W-IDIOM) each radio option's `border: 1.5px solid ${i===0?…}` is a DYNAMIC template-literal border the transpiler can't expand (same gap as role_select); and (W-LIVE) the app realizes the post-dispatch cancel as an inline confirm state (`cancelConfirm`) inside FoodOrderLiveTrackerView, not a routed sheet screen with a reason-picker — the reason radios are a superset the app doesn't collect. Deferred with the cluster.",
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
          "two walls. (1) TRANSPILER idiom: the mock's 'Verified' badge is `<span …absolute>{<Icon/> Verified}</span>` — a bare text node ' Verified' sitting as a SIBLING of an `<Icon>` element inside the absolutely-positioned badge. The content-aware seam maps that span to a View (it has an element child), leaving raw text under a View — invalid on RN — and there is no general 'wrap mixed element+text siblings in <Text>' idiom in transpile.mjs yet. (2) SUPERSET: the app draws an inline draft-restored banner ('We saved what you'd filled in…') BETWEEN the Sub and the name Field — the visible affordance of the load-bearing LC-C10 profile-draft persistence — which the static `Register` mock never drew and the whole-screen codegen model cannot host mid-tree without adding a COND node the mock lacks (or dropping the cue). The draft PERSISTENCE itself is preserved regardless (container logic). Adoptable once the transpiler learns the mixed-siblings idiom and the draft-restored cue moves to its own state/mock (LJ.draft_restored exists).",
      },
    ],
  },
  {
    // LJ.role_select — the post-OTP role fork (app/role.tsx). DEFER-only: two transpiler-idiom gaps in the
    // mock's inline option card. See the deferred reason. role_select_flag_off is the same structure/wall.
    key: "LJ.role_select",
    container: "apps/mobile/app/role.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../src/ui",
    states: [],
    deferred: [
      {
        state: "form",
        key: "LJ.role_select",
        reason:
          "TRANSPILER idiom gaps, not a structural or backend wall. The mock `RoleSelect` renders an inline `Opt` option card whose style uses two web idioms the transpiler cannot yet lower to RN: (a) a DYNAMIC border shorthand as a TEMPLATE LITERAL — `border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--line)'}`` — which the border-shorthand handler only expands for a static string, so it survives as an invalid `border` RN style prop; and (b) a CONDITIONAL boxShadow with a SPREAD token — `boxShadow: selected ? 'none' : 'var(--shadow-card)'` — which resolves to a bare `var(--shadow-card)` residual because the StringLiteral token-resolver only substitutes non-spread tokens and the boxShadow handler only spreads a static token. Both need general idiom builds in tools/parity/codegen (template-literal border expansion + conditional shadow-spread) before RoleSelect (and its twin role_select_flag_off) can generate a clean, typechecking view. Structurally it is a plain `BOX(BRANDLOCKUP, HEADING, SUB, OPT, OPT, BUTTON)` — adoptable the moment those two idioms land.",
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
          "SUPERSET the static `Profile` mock never drew, not a primitive/backend gap. The mock is `Pad(Heading 'Account', Sub, Card(details), Card(Button 'Trip history', Button 'Send a parcel'), Button 'Sign out')`. The app Account tab adds a SECOND action `Card` — a load-bearing hub-nav (Notifications · Bike & documents · Rider dashboard/Become a rider · Settings · Help & support) — WITHOUT which those account sub-screens are unreachable (there is no other route to Settings/Help/Notifications), plus live loading/error `COND` branches around the details card and a rider-stats block. The whole-screen codegen model gates a view ≡ the mock and cannot host the extra nav Card + the loading/error COND without adding nodes the mock lacks; dropping the nav Card to match would strand Settings/Help/Notifications. Adoptable once the hub-nav either earns its own drawn mock (a Track-3(A) composite) or a sanctioned DESIGN-DEVIATIONS entry — a user decision, not this pass's to invent.",
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
    // ── PARCEL SEND-COMPOSER cluster — the customer flagship INTERACTIVE screen (app/send.tsx).
    // A map-anchored composer: a full-bleed map + tap-to-pin, a two-snap compose sheet, inline
    // address search, a confirm-pin modal, item/price/phone/landmark capture and submit. The three
    // gallery keys home_empty/home_pins/home_expanded are the SAME mock `Home` (screens.jsx:145)
    // param'd across pins/expanded; addr_search/addr_map_confirm are its address sub-states. This is
    // exactly the live-vs-static case the region model (Foundation-E) was built for — but the mock as
    // AUTHORED exposes no locatable, transpilable DS-primitive region roots, so it registers DEFER-only
    // (like LJ.otp / RC.orders), NOT as fabricated regions. Full analysis in the primary deferral.
    key: "LJ.home_empty",
    container: "apps/mobile/app/send.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    mockComponent: "Home",
    uiImport: "../src/ui",
    states: [],
    deferred: [
      {
        state: "composer",
        key: "LJ.home_empty",
        reason:
          "NOT decomposable into region fragments under the region/fragment codegen model (Foundation-E), and NOT a backend gap — a live-vs-static shell whose mock exposes no locatable, transpilable DS-primitive region roots. The mock `Home` (screens.jsx:145, param'd pins/expanded across home_empty/home_pins/home_expanded) is a full-bleed kit `K.FauxMap` under a two-snap kit `K.MapSheet`, with the compose form built from the mock-LOCAL helpers `AddressFields` (the pickup/drop rows) and `QtyStepper`, raw styled `<div>`/`<span>` (brand top bar, 'tap to drop pin' hint, 'Use my location' pill), repeated DS `<Field>`s, and a single `<Button>` 'Broadcast request' that lives in `K.MapSheet.footer`. All three region locators are tag-based and none can anchor a faithful region here: (1) `{el:tag}` needs a UNIQUE DS/kit tag heading the sub-tree — `FauxMap`/`MapSheet` are kit primitives absent from the transpiler's DS remap (transpile.mjs DS_RENAME) AND from emit.mjs's uiPrims import set, so a fragment rooted at them emits unresolved components; `AddressFields`/`QtyStepper` are mock-local functions the transpiler neither inlines nor can resolve; `Field` appears ~7× so `{el:'Field'}` anchors ALL Fields under one region name (mock reduces to N `REGION` leaves, the container mounts 1 → the composition diff diverges); and the only unique DS tags, `Dove`/`Wordmark`, are leaf glyphs inside the brand pill (the app draws them as ONE `BrandLockup`, so even that wouldn't be congruent) — the meaningful blocks (top bar, address sheet, details form, submit bar) are each rooted in a raw `<div>`, and only the FIRST `<div>` (the whole screen) is `{el:'div'}`-locatable. (2) `{map:tag}` is inapplicable — `Home` has no `.map()`. (3) `{slot}` matches only a `Screen` attribute (normalize.mjs `locateTs` + `reduceComp` fold banner/footer slots for `Screen` alone); the mock root is a plain `<div>` (no `Screen`), so the lone Broadcast `<Button>` in `K.MapSheet.footer` is never traversed by the composition walker (non-`Screen` element footer props aren't folded) and cannot anchor a submit region the way RC.menu's `<Screen footer=…>` did. The app already realizes this static shell LIVE and mock-wins-correctly: `ComposeMap` (geolocation + tap-to-pin) under a `BottomSheet` (peek/expanded snaps) with inline `AddressSearch`, an `AddressConfirmSheet` modal (= addr_search/addr_map_confirm), `SendItemsList`/`SendPhoneFields`/`SendPriceQuote`/`SendLandmarksDetails`, and full submit validation + idempotency + disclaimer gate. Region-adopting it would require EITHER re-authoring the mock with DS primitives + a `<Screen footer=…>` shell (FORBIDDEN — editing packages/design to match the app trips the reverse-drift freeze) OR a Foundation-level codegen build (FauxMap→ComposeMap / MapSheet→BottomSheet remaps + a sheet-footer scaffold, mock-local-helper inlining, a generalized non-`Screen` slot locator) — out of scope for one adoption iteration, and even then the live ComposeMap/BottomSheet/AddressSearch trees differ from the static FauxMap/MapSheet placeholders, so fragment congruence would need further modelling. Registered defer-only, not forced into invented regions (CLAUDE.md Pixel-parity: honesty over volume; never ship a dead/fabricated control).",
      },
      {
        state: "pins",
        key: "LJ.home_pins",
        reason:
          "the SAME mock `Home` at pins=true (screens.jsx:145) — the set-pin state only fills the AddressFields/price/phone leaf VALUES; it adds no new locatable region root. Identical region-model wall as LJ.home_empty; deferred with the composer.",
      },
      {
        state: "expanded",
        key: "LJ.home_expanded",
        reason:
          "the SAME mock `Home` at pins=true/expanded=true (screens.jsx:145) — the expanded branch swaps the collapsed 'Add landmarks' button for three more DS `<Field>`s inside a raw `<div>`, adding no unique locatable region root (the extra Fields make `{el:'Field'}` still more ambiguous). Identical region-model wall as LJ.home_empty; deferred with the composer.",
      },
      {
        state: "addr_search",
        key: "LJ.addr_search",
        reason:
          "the address-search sub-state of the send composer. The app folds it INLINE into the compose sheet as a live `AddressSearch` (classification SUPERSET — mock draws it as a standalone screen `AddrSearch`), so it has no standalone container to point a view at, and it inherits the same kit-primitive/mock-local region-model wall as the composer. Deferred with LJ.home_empty.",
      },
      {
        state: "addr_confirm",
        key: "LJ.addr_map_confirm",
        reason:
          "the confirm-pin-on-map sub-state of the send composer — realized in-app as the `AddressConfirmSheet` MODAL opened from the compose sheet (not a routed screen), over the same FauxMap/sheet shell. Same region-model wall (kit `K.FauxMap` map canvas + no locatable DS region root); no standalone container. Deferred with LJ.home_empty.",
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
    //    chips as `K.OfferCard`/`K.SortChips` (K = window.LyniaKit), JSXMemberExpression tags the
    //    transpiler leaves verbatim (transpile.mjs reads `open.name.name`, undefined for a member tag, so
    //    no DS_RENAME + no import) and the region locators can't anchor (`{el}` matches
    //    `openingElement.name.name`, also undefined for `K.SortChips`); there is NO app OfferCard/SortChips
    //    DS primitive to import (the app draws each bid inline as `Card(RiderMini, Money, Button)` and the
    //    sort chips inline as `Pressable(Text)`), so a generated view emits `<K.OfferCard>` against an
    //    undefined `K` and neither typechecks nor composes. (W2) `OrderHead` is a mock-local helper
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
          "the populated offers list — mock `Auction` default return (screens.jsx:265) `Pad(OrderHead, headerRow[muted '3 riders bidding' + tabular timer], askingLine, K.SortChips, K.OfferCard recommended, K.OfferCard, K.OfferCard)`. Hits all three cluster walls at once: (W1) the sort chips + three offer cards are `K.SortChips`/`K.OfferCard` kit-composite member tags with no app DS primitive and no transpiler/locator handling — the generated view emits `<K.OfferCard o={RIDERS[0]}>` against an undefined `K`/`RIDERS`; (W2) it leads with the mock-local `<OrderHead>`; (W3) in-app the live offers list is a `<View>` inside the composite order Screen, gating `<AuctionClock/>` (the 1s countdown header extracted per PERF20-02), an `orderedOffers.map` that mixes `<CounterOfferCard>` and inline `<Card>` per `isActiveCounter`, `BidEntrance` animations, a `>1`-gated sort-chip row, a select-race notice and a one-primary-CTA rule — not a whole-screen swap. The region model can't rescue it either: the mock's three offer cards are LITERAL siblings with NO `.map()` for `{map:}` to find, and the root is a `<Pad>` (not a `<Screen>`) so `{slot:}` can't fold a footer. Also note `Auction` is a variant-SWITCH function (finding/race/expired/noriders/live) so extractComponent pulls all five returns into one view and normalize.mjs's `returnedExpr` reads only the LAST (live) top-level return. Adoptable once OfferCard/SortChips are authored as DS primitives (or the transpiler learns kit-composite→app-component remaps) and the live auction earns per-state boundaries — a Foundation build, not one iteration in a sensitive area.",
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
          "the counter-offer review — mock `AuctionCounter` (screens.jsx:512) IS a clean single-return named component, and its counter CARD transpiles cleanly (static `border` shorthand expands, `boxShadow` token spreads, `placeItems:center`→flex-center, `borderRadius:50%`→px all lower fine). But it still (a) leads with the mock-local `<OrderHead>` and ends with the kit-composite `<K.OfferCard o={RIDERS[0]}>` ('Other offers'), both undefined refs (W1/W2); and (b) has no whole-screen container boundary — the app renders a counter as ONE `<CounterOfferCard>` (a bespoke app component, not the mock's inline primitives) interleaved in the live `orderedOffers.map` gated by `isActiveCounter`, NOT as a separate auction_counter screen (W3). Adopting the whole-screen mock would mean rebuilding the entire live auction around a static composite, regressing streaming/ranking/select-race and the F-07 decline (one round, no counter-back). Deferred with the cluster; adoptable once OfferCard is a DS primitive and the counter state earns its own boundary.",
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
