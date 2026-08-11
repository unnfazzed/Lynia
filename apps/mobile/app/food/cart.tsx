import { RESTAURANTS_PRICING } from "@lynia/shared";
import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFoodCart } from "../../src/food/cart-context";
import type { FoodCartLine } from "../../src/logic/food-cart";
import { formatMoney } from "../../src/logic/money";
import { useRestaurantMenu } from "../../src/query/use-restaurants";
import { AppBar, Card, Icon, Money, Screen } from "../../src/ui";
import { QtyStepper } from "../../src/ui/home/QtyStepper";
import { addLine, MAX_ITEM_QTY, removeLine } from "../../src/logic/food-cart";
import { CartNoteSheet } from "../../src/ui/food/CartNoteSheet";
import { NoteField } from "../../src/ui/food/NoteField";
import { PriceMath } from "../../src/ui/food/PriceMath";
import { CartCheckoutBarView } from "./cart-checkout-bar.view";
import { CartEmptyView } from "./cart-empty.view";

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

export default function FoodCartScreen(): React.ReactElement {
  const router = useRouter();
  const cart = useFoodCart();
  const { menu } = useRestaurantMenu(cart.cart.restaurantId ?? undefined, !!cart.cart.restaurantId);

  const latestByDish = useMemo(() => {
    if (!menu) return null;
    const map = new Map<string, { priceUsd: number; outOfStock: boolean }>();
    for (const c of menu.categories) for (const d of c.dishes) map.set(d.id, { priceUsd: d.priceUsd, outOfStock: d.outOfStock });
    return map;
  }, [menu]);

  const [dismissedNotice, setDismissedNotice] = useState(false);
  const reconciled = useMemo(() => reconcile(cart.cart.lines, latestByDish), [cart.cart.lines, latestByDish]);

  // R3·2 (cart_note): which line's note the bottom sheet is currently editing (null = sheet closed).
  // A line is identified by (dishId, note) — the same composite key the cart itself uses — because two
  // lines of the same dish with different notes are deliberately separate rows.
  const [noteTarget, setNoteTarget] = useState<{ dishId: string; note: string; name: string } | null>(null);

  /** Re-key a cart line onto a new note. `addLine` merges it into an existing identical (dish, note)
   *  row rather than leaving a duplicate — the same upsert the menu's "add" already goes through. */
  const saveLineNote = (target: { dishId: string; note: string }, nextNote: string): void => {
    const line = cart.cart.lines.find((l) => l.dishId === target.dishId && l.note === target.note);
    if (!line || line.note === nextNote) return;
    cart.replaceLines(addLine(removeLine(cart.cart.lines, line.dishId, line.note), { ...line, note: nextNote }));
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
              <Pressable onPress={() => setDismissedNotice(true)} accessibilityRole="button" accessibilityLabel="Dismiss">
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: tokens.color.accentText, marginTop: 6 }}>Got it</Text>
              </Pressable>
            </View>
          </View>
        </Card>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false}>
        <Card>
          {cart.cart.lines.map((line, i) => (
            <View
              key={`${line.dishId}-${line.note}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: tokens.color.line }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }} numberOfLines={1}>
                  {line.name}
                </Text>
                <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2 }}>{formatMoney(line.priceUsd)} each</Text>
                {/* R3·2 (cart_note): the note is EDITABLE from the cart, not only at the moment the dish
                    was added — "leg not breast" is exactly the thing you remember once the basket is in
                    front of you. Opens the note sheet on this line. */}
                <Pressable
                  onPress={() => setNoteTarget({ dishId: line.dishId, note: line.note, name: line.name })}
                  accessibilityRole="button"
                  accessibilityLabel={line.note ? `Edit the note for ${line.name}: ${line.note}` : `Add a note for ${line.name}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, minHeight: tokens.touchTargetMin, paddingRight: 4 }}
                >
                  <Icon name="pencil" size={13} color={tokens.color.accentText} />
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: line.note ? "400" : "700", color: tokens.color.accentText }} numberOfLines={2}>
                    {line.note || "Note for the kitchen"}
                  </Text>
                </Pressable>
              </View>
              <QtyStepper value={line.quantity} onChange={(n) => cart.setQuantity(line.dishId, line.note, n)} max={MAX_ITEM_QTY} />
              <Money v={line.priceUsd * line.quantity} style={{ minWidth: 52, textAlign: "right" }} />
            </View>
          ))}
          {/* Kit R3·1 (r-customer-a.jsx:323-327): the cart's own way back into the menu, so adding a
              forgotten drink doesn't mean hunting for the back button. */}
          <Pressable
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
          </Pressable>
        </Card>

        <NoteField
          label="NOTE FOR THE WHOLE ORDER"
          value={cart.cart.orderNote}
          onChangeText={cart.setOrderNote}
          placeholder="Pack the sadza separately from the stew"
          maxLength={300}
        />
        <View style={{ flexDirection: "row", gap: 8, padding: 12, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.input, marginBottom: 12 }}>
          <Icon name="circle-alert" size={15} color={tokens.color.muted} />
          <Text style={{ flex: 1, fontSize: 12.5, color: tokens.color.muted, lineHeight: 17 }}>
            A note can&apos;t change the price. If what you want costs more, the kitchen will call you before cooking.
          </Text>
        </View>

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
          dishName={noteTarget.name}
          dishNote={noteTarget.note}
          orderNote={cart.cart.orderNote}
          onClose={() => setNoteTarget(null)}
          onSave={({ dishNote, orderNote }) => {
            saveLineNote(noteTarget, dishNote);
            if (orderNote !== cart.cart.orderNote) cart.setOrderNote(orderNote);
            setNoteTarget(null);
          }}
        />
      ) : null}
    </Screen>
  );
}
