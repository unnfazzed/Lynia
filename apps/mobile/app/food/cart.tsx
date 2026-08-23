import type { RestaurantListItem } from "@lynia/shared";
import { RESTAURANTS_PRICING } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { usePrewarmRoutes, type PrewarmRoute } from "../../src/boot/prewarm-routes";
import { ScrollView, Text, View } from "react-native";
import { useFoodCart } from "../../src/food/cart-context";
import type { FoodCartLine } from "../../src/logic/food-cart";
import { fmtClock } from "../../src/logic/format-time";
import { etaRange, restaurantMeta } from "../../src/logic/food-list";
import { useHomeLocation } from "../../src/logic/home-location";
import { formatMoney } from "../../src/logic/money";
import { useNow } from "../../src/logic/use-now";
import { useRestaurantMenu } from "../../src/query/use-restaurants";
import { AppBar, Card, Icon, Money, Screen, Tappable } from "../../src/ui";
import { addLine, MAX_ITEM_QTY, removeLine } from "../../src/logic/food-cart";
import { CartNoteSheet } from "../../src/ui/food/CartNoteSheet";
import { PriceMath } from "../../src/ui/food/PriceMath";
import { CartCheckoutBarView } from "./cart-checkout-bar.view";
import { CartEmptyView } from "./cart-empty.view";

/** Kit RC.cart (r-customer-a.jsx:315): "Arrives in 30–40 min · 10:11–10:21, confirmed the moment the
 *  kitchen accepts" — an ESTIMATE, not a promise (the copy says so). The cart has no drop-off yet
 *  (checkout captures it — D-11), so this reuses the same honest-estimate path RC.list's per-row ETA
 *  already uses: prep time + a haversine leg from the customer's CURRENT fix as the best available
 *  stand-in, refined once a real drop-off exists. Null without a customer fix or a restaurant location
 *  — never an invented number. */
function cartEtaBanner(restaurant: RestaurantListItem | null, customerPoint: RestaurantListItem["location"], now: Date): { range: string; arrive: string } | null {
  if (!restaurant) return null;
  const meta = restaurantMeta(restaurant, customerPoint);
  const band = meta.etaMinutes != null ? etaRange([meta]) : null;
  if (!band) return null;
  const clockAt = (mins: number) => fmtClock(new Date(now.getTime() + mins * 60_000).toISOString());
  return { range: `${band.low}–${band.high} min`, arrive: `${clockAt(band.low)}–${clockAt(band.high)}` };
}

interface Reconciled {
  lines: FoodCartLine[];
  removedNames: string[];
  priceChanges: { name: string; from: number; to: number }[];
}

/** Reconciles the cart against the latest menu fetch: a dish gone or now out of stock is dropped
 *  (R3·b1 "just sold out"); a changed price is applied to the line (R3·b2 "prices changed") — the
 *  cart NEVER silently keeps a stale price, since D-35 makes "the price never changes without you
 *  seeing it" a hard rule, not just a note-specific one. */
function reconcile(lines: FoodCartLine[], latest: Map<string, { priceUsd: number; outOfStock: boolean }> | null): Reconciled {
  if (!latest) return { lines, removedNames: [], priceChanges: [] };
  const kept: FoodCartLine[] = [];
  const removedNames: string[] = [];
  const priceChanges: { name: string; from: number; to: number }[] = [];
  for (const line of lines) {
    const dish = latest.get(line.dishId);
    if (!dish || dish.outOfStock) {
      removedNames.push(line.name);
      continue;
    }
    if (dish.priceUsd !== line.priceUsd) {
      priceChanges.push({ name: line.name, from: line.priceUsd, to: dish.priceUsd });
      kept.push({ ...line, priceUsd: dish.priceUsd });
    } else {
      kept.push(line);
    }
  }
  return { lines: kept, removedNames, priceChanges };
}

/** The cart has exactly one forward exit, and it drags react-native-maps in through the address
 *  confirm step (19 new modules). Warm it while the customer is still reviewing their basket —
 *  but only when there IS a basket: from an empty cart checkout is unreachable, so warming it would
 *  spend a Go-class handset's idle time and memory on a route this visit cannot open. */
const CART_PREWARM: readonly PrewarmRoute[] = ["foodCheckout"];
const NO_PREWARM: readonly PrewarmRoute[] = [];

export default function FoodCartScreen(): React.ReactElement {
  const router = useRouter();
  const cart = useFoodCart();
  usePrewarmRoutes(cart.cart.lines.length > 0 ? CART_PREWARM : NO_PREWARM);
  const { menu } = useRestaurantMenu(cart.cart.restaurantId ?? undefined, !!cart.cart.restaurantId);
  // Same live fix RC.list/checkout use — feeds the estimate-before-checkout banner below.
  const location = useHomeLocation();
  const now = useNow();
  const etaBanner = cartEtaBanner(menu?.restaurant ?? null, location.point, now);

  const latestByDish = useMemo(() => {
    if (!menu) return null;
    const map = new Map<string, { priceUsd: number; outOfStock: boolean }>();
    for (const c of menu.categories) for (const d of c.dishes) map.set(d.id, { priceUsd: d.priceUsd, outOfStock: d.outOfStock });
    return map;
  }, [menu]);

  const [dismissedNotice, setDismissedNotice] = useState(false);
  const reconciled = useMemo(() => reconcile(cart.cart.lines, latestByDish), [cart.cart.lines, latestByDish]);

  // R3·2 (cart_note): which target the bottom sheet is currently editing (null = sheet closed) — a
  // specific line (dishId, note) using the same composite key the cart itself uses (two lines of the
  // same dish with different notes are deliberately separate rows), or "whole-order" when opened from
  // the card's own whole-order-note row, which has no dish to attach a per-dish note to.
  const [noteTarget, setNoteTarget] = useState<{ dishId: string; note: string; name: string; quantity: number } | "whole-order" | null>(null);

  /** Re-key a cart line onto a new note/quantity in one write. `addLine` merges it into an existing
   *  identical (dish, note) row rather than leaving a duplicate — the same upsert the menu's "add"
   *  already goes through. */
  const saveLineEdit = (target: { dishId: string; note: string }, nextNote: string, nextQuantity: number): void => {
    const line = cart.cart.lines.find((l) => l.dishId === target.dishId && l.note === target.note);
    if (!line || (line.note === nextNote && line.quantity === nextQuantity)) return;
    cart.replaceLines(addLine(removeLine(cart.cart.lines, line.dishId, line.note), { ...line, note: nextNote, quantity: nextQuantity }));
  };

  // Apply the reconciliation once per menu fetch (not every render) — an OOS/price-change banner
  // that keeps re-triggering after the user dismisses it would be a worse experience than one honest
  // interrupt when the cart is opened.
  useEffect(() => {
    if (!latestByDish) return;
    if (reconciled.removedNames.length === 0 && reconciled.priceChanges.length === 0) return;
    cart.replaceLines(reconciled.lines);
    setDismissedNotice(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the fetched menu itself changes.
  }, [latestByDish]);

  if (!cart.cart.restaurantId || cart.cart.lines.length === 0) {
    // RC.cart_empty — the presentational tree is GENERATED from the mock (cart-empty.view.tsx) and
    // locked to it by the structural-snapshot guardrail; this container owns only the two handlers.
    return <CartEmptyView onBack={() => router.back()} onBrowse={() => router.replace("/food")} />;
  }

  const belowMin = cart.belowMinimum;

  return (
    <Screen
      footer={
        // Kit RC.cart#footer (r-customer-a.jsx:295): the "Go to checkout · $X" bar is the GENERATED,
        // guarded CartCheckoutBarView region, mounted in the kit's `<Screen footer=…>` pinned slot
        // (Foundation-D/E). The structural guardrail asserts it ≡ the mock's footer Button.
        <CartCheckoutBarView
          label={`Go to checkout · ${formatMoney(cart.total)}`}
          onCheckout={() => router.push("/food/checkout")}
        />
      }
    >
      {/* Kit RC.cart (r-customer-a.jsx:297): the header is the shared AppBar — 16/700 title + 11.5
          muted sub (the kitchen's name) + a rotated-chevron back, not an in-body 19px heading. */}
      <AppBar title="Your cart" sub={cart.cart.restaurantName ?? undefined} onBack={() => router.back()} />

      {!dismissedNotice && (reconciled.removedNames.length > 0 || reconciled.priceChanges.length > 0) ? (
        <Card style={{ backgroundColor: tokens.color.highlightWash, borderColor: "transparent" }}>
          <View style={{ flexDirection: "row", gap: 9 }}>
            <Icon name="circle-alert" size={17} color={tokens.color.highlightInk} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>
                {reconciled.removedNames.length > 0 ? `${reconciled.removedNames[0]} just sold out` : "A price changed"}
              </Text>
              <Text style={{ fontSize: 12.5, color: tokens.color.highlightInk, marginTop: 3, lineHeight: 17 }}>
                {reconciled.removedNames.length > 0
                  ? "We removed it and updated your total. Nothing was ordered."
                  : `${reconciled.priceChanges[0]!.name}: ${formatMoney(reconciled.priceChanges[0]!.from)} → ${formatMoney(reconciled.priceChanges[0]!.to)}.`}
              </Text>
              <Tappable onPress={() => setDismissedNotice(true)} accessibilityRole="button" accessibilityLabel="Dismiss">
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: tokens.color.accentText, marginTop: 6 }}>Got it</Text>
              </Tappable>
            </View>
          </View>
        </Card>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Kit RC.cart EtaLine (r-customer-a.jsx:315): "Arrives in <range> · <arrive>, confirmed the
            moment the kitchen accepts" — omitted (not a placeholder) when there's no honest estimate yet. */}
        {etaBanner ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 11, backgroundColor: tokens.color.accentWash, borderRadius: tokens.radius.input, marginBottom: 12 }}>
            <Icon name="clock" size={17} color={tokens.color.accentText} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13.5, fontWeight: "700", color: tokens.color.ink }}>
                Arrives in {etaBanner.range} <Text style={{ color: tokens.color.muted, fontWeight: "600" }}>· {etaBanner.arrive}</Text>
              </Text>
              <Text style={{ fontSize: 12, color: tokens.color.muted, lineHeight: 16 }}>Confirmed the moment the kitchen accepts.</Text>
            </View>
          </View>
        ) : null}

        <Card style={{ padding: 14 }}>
          {cart.cart.lines.map((line, i) => (
            <View
              key={`${line.dishId}-${line.note}`}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: tokens.color.line }}
            >
              {/* Kit RestRow-style qty badge (r-customer-a.jsx:319): a static count, not a stepper — the
                  mock's editing surface for quantity is the Item Sheet (r-customer-a.jsx:279-286), which
                  this line's note affordance below now opens (CartNoteSheet carries the same stepper). */}
              <View style={{ minWidth: 28, height: 28, borderRadius: 8, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: "800", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{line.quantity}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }}>{line.name}</Text>
                {/* R3·2 (cart_note): opens the note+quantity sheet for this line — not only at the moment
                    the dish was added, since "leg not breast" is exactly the thing you remember once the
                    basket is in front of you. D-39: shown even with no note yet (the mock's static sample
                    never draws that empty state) because it's this line's only in-cart edit entry point. */}
                <Tappable
                  onPress={() => setNoteTarget({ dishId: line.dishId, note: line.note, name: line.name, quantity: line.quantity })}
                  accessibilityRole="button"
                  accessibilityLabel={line.note ? `Edit ${line.name}: quantity ${line.quantity}, note ${line.note}` : `Edit ${line.name}: quantity ${line.quantity}, add a note`}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, minHeight: tokens.touchTargetMin, paddingRight: 4 }}
                >
                  <Icon name="pencil" size={12} color={tokens.color.accentText} />
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: line.note ? "400" : "700", color: tokens.color.accentText }} numberOfLines={2}>
                    {line.note || "Note for the kitchen"}
                  </Text>
                </Tappable>
              </View>
              <Money v={line.priceUsd * line.quantity} size={14} weight="600" style={{ minWidth: 52, textAlign: "right" }} />
            </View>
          ))}

          {/* Kit RC.cart (r-customer-a.jsx:332-338): the whole-order note sits INSIDE the card, between
              the lines and "Add more items" — a tappable summary row (muted pencil, matching the mock's
              own icon colour here — distinct from a per-dish note's accent pencil), not the free-standing
              textarea this used to render outside the card. */}
          <Tappable
            onPress={() => setNoteTarget("whole-order")}
            accessibilityRole="button"
            accessibilityLabel={cart.cart.orderNote ? `Edit the note for the whole order: ${cart.cart.orderNote}` : "Add a note for the whole order"}
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, minHeight: tokens.touchTargetMin, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: tokens.color.line }}
          >
            <Icon name="pencil" size={13} color={tokens.color.muted} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.muted }}>NOTE FOR THE WHOLE ORDER</Text>
              <Text style={{ fontSize: 13, color: cart.cart.orderNote ? tokens.color.ink : tokens.color.muted, lineHeight: 17.5 }} numberOfLines={2}>
                {cart.cart.orderNote || "Pack the sadza separately from the stew"}
              </Text>
            </View>
          </Tappable>

          {/* Kit R3·1 (r-customer-a.jsx:339-343): the cart's own way back into the menu, so adding a
              forgotten drink doesn't mean hunting for the back button. */}
          <Tappable
            onPress={() => router.push(`/food/${cart.cart.restaurantId}`)}
            accessibilityRole="button"
            accessibilityLabel="Add more items"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              minHeight: tokens.touchTargetMin,
              marginTop: 8,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: tokens.color.line,
            }}
          >
            <Icon name="plus" size={15} color={tokens.color.accentText} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.accentText }}>Add more items</Text>
          </Tappable>
        </Card>

        {belowMin ? (
          <Card style={{ backgroundColor: tokens.color.highlightWash, borderColor: "transparent" }}>
            {/* Kit R3·b4 (r-customer-a.jsx:544-550): the warning leads with the circle-alert glyph. */}
            <View style={{ flexDirection: "row", gap: 9 }}>
              <Icon name="circle-alert" size={17} color={tokens.color.highlightInk} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>
                  Minimum order is {formatMoney(RESTAURANTS_PRICING.minOrderSubtotal)}
                </Text>
                <Text style={{ fontSize: 12.5, color: tokens.color.highlightInk, marginTop: 3, lineHeight: 17 }}>
                  A rider crosses town either way, so smaller orders carry a {formatMoney(RESTAURANTS_PRICING.smallOrderFee)} small-order fee. Add{" "}
                  {formatMoney(Math.max(0, RESTAURANTS_PRICING.minOrderSubtotal - cart.subtotal))} of food and it disappears.
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Kit RC.cart (r-customer-a.jsx:342): the summary is the shared PriceMath card — itemised
            rows, a hairline, then a 19px Total. The mock's PriceMath draws a Delivery(fee · km) line the
            cart honestly can't yet (the drop-off address is entered at checkout, not here), so the app
            renders the {rows,total,footnote} PriceMath variant and names delivery in the footnote instead
            of an invented figure — the summary region is DEFERRED for this no-drop-off wall (adopted.mjs
            RC.cart#summary), so this stays container glue rather than a guarded fragment. */}
        <PriceMath
          rows={[
            { label: "Food", value: cart.subtotal },
            ...(cart.smallOrderFee > 0 ? [{ label: "Small-order fee", value: cart.smallOrderFee }] : []),
          ]}
          total={cart.total}
          footnote="Delivery fee is added at checkout, once we know where you are."
        />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>

      {/* R3·2 — the note sheet. Pure UI over cart state that already exists: nothing leaves the device
          until checkout places the order. */}
      {noteTarget ? (
        <CartNoteSheet
          dishName={noteTarget === "whole-order" ? undefined : noteTarget.name}
          dishNote={noteTarget === "whole-order" ? undefined : noteTarget.note}
          quantity={noteTarget === "whole-order" ? undefined : noteTarget.quantity}
          maxQuantity={MAX_ITEM_QTY}
          orderNote={cart.cart.orderNote}
          onClose={() => setNoteTarget(null)}
          onSave={({ dishNote, orderNote, quantity }) => {
            if (noteTarget !== "whole-order") saveLineEdit(noteTarget, dishNote, quantity ?? noteTarget.quantity);
            if (orderNote !== cart.cart.orderNote) cart.setOrderNote(orderNote);
            setNoteTarget(null);
          }}
        />
      ) : null}
    </Screen>
  );
}
