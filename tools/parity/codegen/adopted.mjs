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
    // LJ.login — the phone sign-in screen (app/phone.tsx). Until 2026-10-01 a whole-screen view generated
    // from screens.jsx `Login`; docs/DESIGN-DEVIATIONS.md D-55 made the Calm Mint v2 handoff C2/C3 the
    // authority, so the generated view was deleted and the gallery key is a SUPERSEDED deferral.
    key: "LJ.login",
    container: "apps/mobile/app/phone.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../src/ui",
    states: [],
    deferred: [
      {
        state: "form",
        key: "LJ.login",
        reason:
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-55, owner instruction 2026-10-01): the phone screen is now the Calm Mint v2 handoff's C2/C3 — a 44px Back, 'What’s your number?', a 52px field with a fixed +263 prefix segment, the 'Starts with 71, 73, 77 or 78.' help (C3: danger border + the too-short line), 'Send code' and the Terms / Privacy footer. The gallery `Login` draws the brand lockup, 'Welcome to Lynia' and a plain phone Field; a structural snapshot against it would assert the structure D-55 retired. Re-adoptable when a gallery export draws Calm Mint v2.",
      },
    ],
  },
  {
    // LJ.onboard — the first-install screen (app/onboarding.tsx). Until 2026-10-01 a whole-screen view
    // generated from screens.jsx `Onboarding` (the three-slide carousel); D-55 replaced the carousel with
    // the Calm Mint v2 C1 Welcome, so the generated view was deleted and the key is a SUPERSEDED deferral.
    key: "LJ.onboard",
    container: "apps/mobile/app/onboarding.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../src/ui",
    states: [],
    deferred: [
      {
        state: "slide",
        key: "LJ.onboard",
        reason:
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-55, owner instruction 2026-10-01): the intro carousel is retired. The first screen of a new install is the Calm Mint v2 handoff's C1 Welcome — a mint hero panel inset 12px with the rider illustration, the LyniaGo lockup, 'Parcels and food / across town.', three facts, 'Continue with your number' and 'Want to earn? Ride with LyniaGo →'. The gallery `Onboarding` draws a skippable icon-in-a-circle slide with dots and Next; a structural snapshot against it would assert the structure D-55 retired. Re-adoptable when a gallery export draws Calm Mint v2.",
      },
    ],
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
      // Topic cards: give the .map callback an index and wrap each Card in a Tappable (transparent
      // to the structural guardrail) so a tap fires onTopicPress(i). The React key moves to the wrap.
      CallExpression(path) {
        const callee = path.node.callee;
        if (callee.type !== "MemberExpression" || callee.property.name !== "map") return;
        const arrow = path.node.arguments[0];
        if (!arrow || (arrow.type !== "ArrowFunctionExpression" && arrow.type !== "FunctionExpression")) return;
        if (arrow.params.length < 2) arrow.params.push(t.identifier("i"));
        const card = arrow.body.type === "JSXElement" ? arrow.body : null;
        if (!card || card.openingElement.name.name !== "Card") return;
        // move key off the Card onto the Tappable
        const keyAttr = card.openingElement.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "key");
        card.openingElement.attributes = card.openingElement.attributes.filter((a) => a !== keyAttr);
        const wrapped = wrap(card, "Tappable", `onPress={() => onTopicPress(i)} accessibilityRole="button"`);
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
        if (path.parentPath.node.type === "JSXElement" && path.parentPath.node.openingElement.name.name === "Tappable") return;
        path.replaceWith(wrap(path.node, "Tappable", `onPress={onWhatsApp} accessibilityRole="button" accessibilityLabel="Chat with us on WhatsApp"`));
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
          "CODEGEN-shape-gated only — the backend argument this deferral used to make has EXPIRED and the header is now hand-aligned (2026-08-19). The old reason said rating/distance/fee/ETA were absent from `RestaurantListItem` and that the screen had no customer geolocation; #673 added ratingAvg/ratingCount/prepBaselineMinutes alongside the existing `location`, and `home-location.ts` gave the screen a live fix, so all four drawn pills, the live deliver-to + chevron picker and the `N places deliver to <area> · lo–hi min` count line are wired to real data (src/logic/food-list.ts). What still blocks CODEGEN adoption is shape, not data: the mock's list body is a static `.map` over five frozen rows, whereas the app must keep the FlatList virtualization (B-T3) and cursor pagination (B-O10) that a generated view would flatten away, and RestaurantRow's meta line is not wired yet. Structural congruence here is pinned by the screen's own tests instead. See docs/parity/PHASE4-browse.md.",
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
        // back glyph is wired to onBack via a transparent Tappable (invisible to the structural diff).
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
          // it in a Tappable(onBack). Transparent wrapper → invisible to the structural guardrail.
          JSXElement(path) {
            const open = path.node.openingElement;
            if (open.name.name !== "View") return;
            const style = open.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "style");
            const obj = style?.value?.expression;
            if (obj?.type !== "ObjectExpression") return;
            const keys = obj.properties.filter((p) => p.type === "ObjectProperty" && !p.computed).map((p) => p.key.name || p.key.value);
            if (!keys.includes("left") || !keys.includes("position")) return;
            if (path.parentPath.node.type === "JSXElement" && path.parentPath.node.openingElement.name.name === "Tappable") return;
            path.replaceWith(wrap(path.node, "Tappable", `onPress={onBack} accessibilityRole="button" accessibilityLabel="Back"`));
            path.skip();
          },
        }),
      },
      {
        // Rows region — the section's dish list: `{rows.map(i => <MenuRow i qty/>)}`. Each MenuRow is
        // wrapped in a Tappable(onDishPress) so a tap opens the live ItemSheet (kept in the container).
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
            const wrapped = wrap(row, "Tappable", `onPress={() => onDishPress(i)} accessibilityRole="button" disabled={!!i.oos}`);
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
        // the app mounts <ClosedInterruptView/> inside its transparent dim-overlay Tappable (invisible to
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
    // ── RC.home — the customer Home tab (app/(tabs)/home.tsx). Until 2026-10-01 this was REGION-adopted
    // against the home-8c mock (explorations/home-redesign/home-8c.jsx): header → tiles → one live pill
    // per job → the venues grid. docs/DESIGN-DEVIATIONS.md D-55 made the owner's Calm Mint v2 handoff
    // (packages/design/handoff/calm-mint-v2-2026-10) the authority for Home, and its tree differs
    // (address-first header, four tiles, two rails, ONE floating live-order bar), so the gallery key is
    // recorded here as a SUPERSEDED deferral until an export redraws it. The 8c composition regions and
    // the 'twin-internals' deferral went with the 8c tree — net deferral count unchanged.
    key: "RC.home",
    container: "apps/mobile/app/(tabs)/home.tsx",
    mockFile: "packages/design/explorations/home-redesign/home-8c.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RC.home",
        reason:
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-55, owner instruction 2026-10-01): the customer Home is now the Calm Mint v2 handoff's H1–H6 — a mint header with the address control ('DELIVERING TO'), bell and one-line greeting, the search; four service tiles in one row; 'Popular restaurants' and 'Popular shops' horizontal rails of 148px cards; ONE floating forest live-order bar above the tab bar. The gallery home-8c `Home8c` draws a two-line greeting with a sun sticker, three tiles, one pill per order and a two-column venues grid; a structural snapshot against it would assert the structure D-55 retired. Re-adoptable when a gallery export draws Calm Mint v2.",
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
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-55, owner instruction 2026-10-01): the code screen is now the Calm Mint v2 handoff's C4 — Back, 'Enter the code', 'Sent on WhatsApp to +263 … Change', six 56px boxes (the active one bordered 2px brand), 'Resend in 0:42' then 'Resend on WhatsApp', and NO Verify button (the sixth digit submits); wrong / expired states inline. The gallery `Otp` draws a single code Field, Verify, a resend link and a ghost Back; a structural snapshot against it would assert the structure D-55 retired. Re-adoptable when a gallery export draws Calm Mint v2.",
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
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-55, owner instruction 2026-10-01): profile setup is now the Calm Mint v2 handoff's C5 — 'What should riders call you?', First name + Surname side by side, the verified phone row, the 'No ID needed' note and 'Start using LyniaGo'. The national ID field and the 'Use a different number' ghost of the gallery `Register` are gone by owner decision (no ID at sign-up); a structural snapshot against `Register` would assert the structure D-55 retired. Re-adoptable when a gallery export draws Calm Mint v2.",
        reason:
          "UNDESIGNED-SUPERSET (the transpiler wall is now GONE). The mixed element+text-siblings idiom — the mock's 'Verified' badge `<span …absolute>{<Icon/> Verified}</span>` (a bare ' Verified' text run sibling of an `<Icon>`) — is now BUILT (Foundation-F.e wraps mixed siblings in `<Text>`, and the app already renders the badge as BOX(ICON, TEXT), so it would match). What still blocks adoption is a genuine UNDESIGNED SUPERSET: the app draws an inline draft-restored banner ('We saved what you'd filled in…') BETWEEN the Sub and the name Field — the visible affordance of the load-bearing LC-C10 profile-draft persistence — which NO mock draws (the existing LJ.draft_restored is the parcel-send composer's ComposerState draft, a different screen; there is no profile-setup draft-restored mock). The whole-screen codegen model cannot host that mid-tree COND without adding a node no mock has, and dropping the cue to match `Register` would strand a UX-review affordance. The draft PERSISTENCE itself is preserved regardless (container logic). Adoptable once a profile-setup draft-restored state earns its own drawn mock (then it wires as a separate state-view); the transpiler idiom is no longer the wall.",
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
      // Each row is wrapped in a transparent Tappable(onItemPress(i)) — invisible to the structural
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
        const wrapped = wrap(row, "Tappable", `onPress={() => onItemPress(i)} accessibilityRole="button"`);
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
    // LJ.on_hold — the customer account-on-hold wall (app/send.tsx → SendHoldView). DEFER-only: since
    // docs/DESIGN-DEVIATIONS.md D-52 the wall is drawn by the send-compose-v2 handoff (state 17), not by
    // the gallery's `OnHold`. See the deferred reason.
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
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-52, owner instruction 2026-10-01): the hold wall is now the send-compose-v2 handoff's state 17 — the Send header without its step bar, a 72px surface disc with the ban icon, 'Your account is on hold', the handoff's body copy, and two 52px pills 'Call support' / 'Back to home' (app SendHoldView). The gallery `OnHold` draws a different tree (`Pad(icon-disc, title, message, CallRow 'Support', Button 'Sign out')`) and its 24-hour review copy; a whole-screen snapshot against it would assert the structure D-52 retired. Re-adoptable when a gallery export draws the v2 hold wall.",
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
    // ── PARCEL SEND-COMPOSER cluster (app/send.tsx). Until 2026-10-01 this was region-adopted against the
    // gallery mock `Home` (screens.jsx:145): a `map` region (send-map.view.tsx) and a submit `footer`
    // region (send-compose-footer.view.tsx). docs/DESIGN-DEVIATIONS.md D-52 replaced that mock as the
    // authority with the owner's send-compose-v2 handoff (packages/design/handoff/send-compose-v2): a
    // 4-step flow (Where · What · Price · Review) with inline address editing, no landmark field, no
    // declared value and no disclaimer. Both generated views were deleted with the old sheet, so the
    // gallery `Home` states are recorded here as DEFERRED (superseded), not adopted: the gallery has not
    // been re-exported with the v2 screens, and a structural snapshot against the old `Home` would assert
    // the very structure D-52 retired. Re-adoptable the moment a gallery export draws the v2 flow.
    key: "LJ.home_empty",
    container: "apps/mobile/app/send.tsx",
    mockFile: "packages/design/explorations/journey/screens.jsx",
    uiImport: "../src/ui",
    states: [],
    deferred: [
      {
        state: "empty",
        key: "LJ.home_empty",
        reason:
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-52, owner instruction 2026-10-01): the gallery `Home` at pins=false is no longer the authority for app/send.tsx. The send-compose-v2 handoff replaced the one-sheet composer with step 1 \"Where\" (header + step bar, a floating two-row address card that edits inline, the full-bleed map, a pinned Next bar). The map/footer regions this entry used to adopt no longer exist in the container. Re-adopt against a gallery export that draws the v2 flow.",
      },
      {
        state: "pins",
        key: "LJ.home_pins",
        reason:
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-52): the gallery `Home` at pins=true. In the v2 flow the both-pins state is step 1 \"Where\" with the route, the distance pill and Next enabled; items, phones and price moved to steps 2–3. Re-adopt against a gallery export that draws the v2 flow.",
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
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-55, owner instruction 2026-10-01): the rider's first page is the Calm Mint v2 handoff's R1 'Why ride' (app/rider/become.tsx opens on it) — the rider-wash hero with the scooter art, 'Ride with LyniaGo. / Earn on your terms.', three chips, the three-step checklist and 'Start ID check'. The gallery `KycIntro` draws an id-card disc, 'Set up as a rider' and one button; a structural snapshot against it would assert the structure D-55 retired. Re-adoptable when a gallery export draws Calm Mint v2.",
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
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-55, owner instruction 2026-10-01): after R1 the form asks only for the rider photo — the name and national ID only when the account has none on file, and no bike registration (owner decision: papers are optional, added later in Account). The gallery `KycForm` (names, ID, bike reg, photo, consent card) is the structure D-55 retired. Re-adoptable when a gallery export draws Calm Mint v2.",
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
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-55, owner instruction 2026-10-01): while the automated check is with the vendor the board shows the Calm Mint v2 handoff's R2 'Rider setup' (Checking pill, the mint card, the four-step checklist, 'Send a parcel while you wait'); manual review keeps the Rider v2 wall (D-54). The gallery `KycPending` is the structure both retired. Re-adoptable when a gallery export draws Calm Mint v2.",
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
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-55, owner instruction 2026-10-01): the first time a new rider opens the board verified it shows the Calm Mint v2 handoff's R3 ('You’re verified, <name>', 'Go online', 'Add licence and bike papers later in Account'; the commission-free jobs card waits on the backend). The gallery `KycVerified` (rider head chip, accent card) is the structure D-55 retired. Re-adoptable when a gallery export draws Calm Mint v2.",
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
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-54, owner instruction 2026-10-01): the Money tab is now the Rider v2 handoff's M1–M12 — MintTop, an EARNINGS card first (Today | This week Seg, 40/700 total, job counts, the week strip), the COMMISSION BALANCE card second with Top up inline, cash held, then one HISTORY list (fares merged with commission and top-ups, day groups, chips, infinite scroll). The gallery `money` draws the balance hero first and a commission-only ledger; a structural snapshot against it would assert the structure D-54 retired. Re-adoptable when a gallery export draws the v2 Money tab.",
      },
    ],
  },
  {
    // ── RJM.account — the rider Account tab (app/rider/(tabs)/account.tsx). Until 2026-10-01 this was
    // adopted as a whole-screen view (account.view.tsx) generated from `rider-one-app.jsx :: account`.
    // docs/DESIGN-DEVIATIONS.md D-54 made the owner's Rider v2 handoff (packages/design/handoff/rider-v2/)
    // the authority for the rider app and BOTH Account tabs: the mint top card, a tappable identity card,
    // the Customer | Rider toggle, the standing card and four rows. The generated view was deleted with
    // the old tree; the gallery key is recorded here as a SUPERSEDED deferral until an export redraws it.
    key: "RJM.account",
    container: "apps/mobile/app/rider/(tabs)/account.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RJM.account",
        reason:
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-54, owner instruction 2026-10-01): the rider Account is now the Rider v2 handoff's C1 — MintTop, a tappable IdentityCard (avatar 52, Verified tag, rating line), the 48px Customer | Rider Seg, the Standing card (acceptance / rating / strikes) and four rows (Job history · Notifications · Help & support · Settings). The gallery `account` draws AppBar + identity Card + five settings rows and a status pill; a structural snapshot against it would assert the structure D-54 retired. Re-adoptable when a gallery export draws the v2 Account.",
      },
    ],
  },
  {
    // ── RJM.board — the rider Jobs tab (app/rider/(tabs)/index.tsx). Until 2026-10-01 its job LIST was a
    // region-adopted view (board-list.view.tsx) generated from `rider-one-app.jsx :: board`. D-54 made the
    // owner's Rider v2 handoff (packages/design/handoff/rider-v2/) the authority: a full-bleed map with busy
    // zones and job pins, and a sheet of job cards (YOUR OFFERS / NEARBY JOBS) in place of the AppBar +
    // OnlinePill + list. The generated view was deleted with the old tree; the gallery key is recorded
    // here as a SUPERSEDED deferral until an export redraws it.
    key: "RJM.board",
    container: "apps/mobile/app/rider/(tabs)/index.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RJM.board",
        reason:
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-54, owner instruction 2026-10-01): the Jobs tab is now the Rider v2 handoff's J1–J14 — MintTop, a full-bleed map (busy zones, job pins in sync with the cards, the rider's own marker) and a draggable sheet of job cards: YOUR OFFERS (offer sent, waiting, Withdraw with a 5 s Undo) above NEARBY JOBS (km to pickup, asking fare, route, Make an offer). The gallery `board` draws AppBar 'Jobs near you' + OnlinePill + a JobCard list; a structural snapshot against it would assert the structure D-54 retired. Re-adoptable when a gallery export draws the v2 board.",
      },
    ],
  },
  {
    // ── RJM.board_empty — the empty Jobs board. Was deferred under D-30 (the mock's ghost "Refresh");
    // since 2026-10-01 the Rider v2 handoff's J4 redraws the empty state inside the board sheet (inbox
    // disc + "Nothing in range yet", the why-is-it-quiet line and the busy-zone pointer, over the map),
    // so the gallery key is a SUPERSEDED deferral (D-54) and board-empty.view.tsx is deleted.
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
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-54, owner instruction 2026-10-01): the empty board is now the Rider v2 handoff's J4 — the same map with busy zones and the sheet at 44%, holding the inbox disc, 'Nothing in range yet', the body copy, 'Why is it quiet?' and the busiest-zone pointer. The gallery `board_empty` draws AppBar + OnlinePill + Card(EmptyState(ghost 'Refresh')); the Refresh was already undrawn under D-30. Re-adoptable when a gallery export draws the v2 empty board.",
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
    // ── RJM.offer_food — the food offer (app/rider/food-offer.tsx). Its offer Card was region-adopted
    // (food-offer-card.view.tsx) until 2026-10-01; the Rider v2 handoff's F1–F4 redraw the screen around a
    // map and a countdown sheet, so the generated view was deleted with it.
    key: "RJM.offer_food",
    container: "apps/mobile/app/rider/food-offer.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RJM.offer_food",
        reason:
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-54, owner instruction 2026-10-01): the food offer is now the Rider v2 handoff's F1–F4 — FoodHeader (no Back), the pickup-stage map, a sheet with the countdown pill and bar, the FOOD tag, the kitchen, 'Your fare', the stops or (at a kitchen paid up front) the 'Pay the kitchen' / 'Collect at the door' tiles, then 'Accept this job' / 'Not this one' under the no-penalty hint; F4 is the expired state. The gallery `offer_food` draws AppBar + one offer Card + a footer; a structural snapshot against it would assert the structure D-54 retired. Re-adoptable when a gallery export draws the v2 food offer.",
      },
    ],
  },
  {
    // ── RJM.offer_parcel — the parcel offer compose. Until 2026-10-01 it was an INLINE card on the board
    // (offer-parcel-card.view.tsx, region-adopted from `rider-one-app.jsx :: offer_parcel`). The Rider v2
    // handoff's O1–O4 move it to its own pushed screen (app/rider/offer/[jobId].tsx) with the Send v2
    // price step; the agreed-price seam (makeOffer accept/counter, the one-offer-per-job rule) moved with
    // it and is pinned by app/rider/offer/__tests__/offer.test.tsx. SUPERSEDED deferral (D-54).
    key: "RJM.offer_parcel",
    container: "apps/mobile/app/rider/offer/[jobId].tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RJM.offer_parcel",
        reason:
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-54, owner instruction 2026-10-01): Make an offer is now the Rider v2 handoff's O1–O4 — a pushed screen (route strip, '<name> is asking $x', a 56/700 tap-to-type fare with − / + $0.50 and the usual-band bar, four ETA chips, the one-offer notice, then 'Send offer · $x' + 'Skip this job'). The gallery `offer_parcel` draws an inline Card on the board with a fare field and an ETA field; a structural snapshot against it would assert the structure D-54 retired. Re-adoptable when a gallery export draws the v2 offer screen.",
      },
    ],
  },
  {
    // ── RJM.active_food — the food active job (app/rider/food-job.tsx). Same supersession as active_parcel:
    // the Rider v2 handoff's B1–B6 replace the CashStrip + tracker + footer screen; the generated
    // active-food-cash-strip.view.tsx was deleted with it.
    key: "RJM.active_food",
    container: "apps/mobile/app/rider/food-job.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RJM.active_food",
        reason:
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-54, owner instruction 2026-10-01): the food active job is now the Rider v2 handoff's B1–B6 — the same JobShell as the parcel job, with the kitchen StopCard (· FOOD), the pay-the-kitchen row at an upfront kitchen, the CashSplit to collect at the door, the delivery code with the CashSplit, the blocking 'Return the cash' page and the done page. The gallery `active_food` draws AppBar + CashStrip + tracker + footer; a structural snapshot against it would assert the structure D-54 retired. Re-adoptable when a gallery export draws the v2 food job.",
      },
    ],
  },
  {
    // ── RJM.active_parcel — the parcel active job (app/rider/job.tsx). Until 2026-10-01 its CashStrip was
    // region-adopted (active-parcel-cash-strip.view.tsx) with the tracker / footer deferred. D-54's Rider v2
    // handoff redraws the active job as the rider-side mirror of After Send (JobShell: header with Help, a
    // full-bleed map, a stage sheet, one primary), so the generated view was deleted with the old screen.
    key: "RJM.active_parcel",
    container: "apps/mobile/app/rider/job.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RJM.active_parcel",
        reason:
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-54, owner instruction 2026-10-01): the parcel active job is now the Rider v2 handoff's A1–A13 — AHeader (stage title + Help), a full-bleed map, a sheet sized to its content (RSteps, the StopCard with Call · WhatsApp · Navigate, the cash line, 'Problem with this job?') and one primary; the delivery code on its own page (CodeBoxes 3 + 3). The gallery `active_parcel` draws an AppBar, a CashStrip, a tracker card and a footer; a structural snapshot against it would assert the structure D-54 retired. Re-adoptable when a gallery export draws the v2 active job.",
      },
    ],
  },
  {
    // ── RJM.handoff — the delivery-code hand-off. DeliveryOtp.tsx is deleted: the Rider v2 handoff's A8–A12
    // draw the code on its own page of the active job (CodeBoxes 3 + 3, wrong / last try / locked / offline).
    key: "RJM.handoff",
    container: "apps/mobile/app/rider/job.tsx",
    mockFile: "packages/design/explorations/journey/rider-one-app.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RJM.handoff",
        reason:
          "SUPERSEDED TARGET (docs/DESIGN-DEVIATIONS.md D-54, owner instruction 2026-10-01): the delivery code is now the Rider v2 handoff's A8–A12 — 'Arriving now' with the step track, 'Ask <recipient> for the delivery code', six boxes split 3 + 3 over the phone's number pad, the wrong / last-try / locked / offline states and 'Confirm delivery'. The gallery `handoff` draws the older inline code card; a structural snapshot against it would assert the structure D-54 retired. Re-adoptable when a gallery export draws the v2 code page.",
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
