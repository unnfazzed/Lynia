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
    // placing(busy) / data(cash|wallet). Only the PLACING state is a clean structural match today; the
    // cash/wallet DATA states are deferred (see below).
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
    deferred: [
      {
        state: "data",
        key: "RC.checkout_cash",
        reason:
          "Foundation-D CLOSED the primitive gap — EtaLine + Screen.footer now exist, and the container ADOPTS them: the pay bar rides the `<Screen footer=…>` slot, pay rows are PaymentMethodRow, totals are the PriceMath card. What remains is NOT the primitive gap: the app collects the drop-off LIVE on this screen (MapPicker + AddressSearch + landmark Field + contact-phone Field) and the static mock draws NO address-capture surface to wire that load-bearing capture into — a sanctioned superset now ledgered as DESIGN-DEVIATIONS D-11 (keep the capture). Because that ledgered live capture makes the container's tree diverge from the whole-screen mock, and the codegen model gates a WHOLE-screen generated view (it cannot host the live capture as a partial insert), a byte-for-byte gated view is not expressible without reverting the capture. EtaLine also stays un-wired until an ETA estimator backs it (no fabricated arrival window). Adopted at the element level (footer/pay-rows/PriceMath); the whole-screen gated view is deferred by the codegen model + D-11, not a missing primitive.",
      },
      {
        state: "data",
        key: "RC.checkout_wallet",
        reason:
          "same disposition as RC.checkout_cash — Foundation-D primitive gap closed, the container adopts the Screen.footer pay bar + PaymentMethodRow + PriceMath; the wallet variant differs only in the pay-rows' selected state/copy (already faithful). The remaining wall is the ledgered live drop-off capture (D-11) vs the whole-screen codegen model, not a primitive. Deferred as a gated whole-screen view with the cash variant.",
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
    // RC.cart — the food cart (app/food/cart.tsx). cart_empty is adopted (above); the DATA state defers.
    key: "RC.cart",
    container: "apps/mobile/app/food/cart.tsx",
    mockFile: "packages/design/explorations/restaurants/r-customer-a.jsx",
    uiImport: "../../src/ui",
    states: [],
    deferred: [
      {
        state: "data",
        key: "RC.cart",
        reason:
          "Foundation-D CLOSED the primitive gap — EtaLine + FoodThumb + Screen.footer now exist, and the container ADOPTS the footer: the 'Go to checkout · $X' bar rides the `<Screen footer=…>` slot. What remains is NOT the primitive gap: the cart deliberately does NOT collect a drop-off (that's checkout's job), so there is no honest delivery ETA to feed EtaLine — it stays un-wired rather than fabricate a '30–40 min' figure; the 'Add a drink?' FoodThumb upsell rail has no upsell backend and is omitted (ledgered DESIGN-DEVIATIONS D-12); and the app's live per-line QtyStepper + editable per-line notes + min-order card are load-bearing interactive supersets the static whole-screen mock never drew and the codegen model cannot host in a single gated view without regressing inline quantity editing. Adopted at the element level (Screen.footer); the whole-screen gated view is deferred by the no-drop-off-at-cart data model, the un-backed upsell (D-12), and the live QtyStepper superset — not a missing primitive.",
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
