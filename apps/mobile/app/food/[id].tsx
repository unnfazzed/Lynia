import type { RestaurantMenuDish } from "@lynia/shared";
import { tokens } from "@lynia/shared";
import { isMerchantOpenNow, nextOpenDescription } from "@lynia/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFoodCart } from "../../src/food/cart-context";
import { useReopenReminder, useRestaurantMenu } from "../../src/query/use-restaurants";
import { AppBar, Button, Card, EmptyState, haptic, Icon, Screen, SkeletonList, useToast } from "../../src/ui";
import { ItemSheet } from "../../src/ui/food/ItemSheet";
import { RemindWhenOpen } from "../../src/ui/food/RemindWhenOpen";
// Foundation-E — RC.menu is the first REGION-ADOPTED interactive screen: the cover, dish-rows and cart
// bar are GENERATED, guarded fragments of the RC.menu mock (tools/parity/codegen/adopted.mjs), and this
// container COMPOSES them while keeping all interactive glue (tabs, ItemSheet, RemindWhenOpen, the
// 'just closed' interrupt, add-to-cart). The structural-snapshot guardrail asserts each fragment ≡ its
// mock sub-tree AND that this container mounts them in the mock's region order/nesting (the composition
// check). Do NOT inline these regions back — that reintroduces the drift the region guard exists to catch.
import { MenuCartBarView } from "./menu-cart-bar.view";
import { MenuCoverView } from "./menu-cover.view";
import { MenuRowsView, type MenuRowSeed } from "./menu-rows.view";

/** R2·1/R2·2 menu — category tabs mirror D-29's merchant-owned category order; the kitchen's own
 *  closed/open state is derived from `hours` (D1 does not yet know the customer's own address, so no
 *  distance/ETA line here — that lands with D2's checkout, which needs a dropoff anyway). */
export default function RestaurantMenuScreen(): React.ReactElement {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { menu, isLoading, isError, refetch } = useRestaurantMenu(id, true);
  const cart = useFoodCart();

  const [categoryIdx, setCategoryIdx] = useState(0);
  const [openItem, setOpenItem] = useState<RestaurantMenuDish | null>(null);

  // D1 `menu_closed`: "remind me when they open". The toast lives here rather than in the control,
  // which stays presentational — and `alreadyOpen` gets its own line: the kitchen opened between this
  // screen rendering and the tap, so nothing was banked and "we'll remind you" would be a small lie.
  const reminder = useReopenReminder(
    id,
    (res) => {
      if (res.alreadyOpen) {
        toast.show(`${menu?.restaurant.name ?? "They"} are open now — pull to refresh the menu.`, "info");
        return;
      }
      haptic("tap");
      toast.show(res.set ? `We'll tell you when ${menu?.restaurant.name ?? "they"} open.` : "Reminder off.", "success");
    },
    () => toast.show("Couldn't save that just now — try again.", "info"),
  );

  // R2·b1: recompute open/closed as time passes (hours are static data, no live push needed) so a
  // kitchen that closes mid-browse interrupts once instead of silently going stale.
  const [now, setNow] = useState(() => new Date());
  const [justClosed, setJustClosed] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  // Only interrupt on a genuine open→closed transition, not on first load of an already-closed shop.
  const prevOpenRef = React.useRef<boolean | null>(null);
  useEffect(() => {
    if (!menu) return;
    const open = isMerchantOpenNow(menu.restaurant.hours, now);
    if (prevOpenRef.current === true && !open) setJustClosed(true);
    prevOpenRef.current = open;
  }, [menu, now]);

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  if (isError || !menu) {
    return (
      <Screen>
        <AppBar onBack={() => router.back()} />
        <EmptyState icon="wifi-off" title="Couldn't load this menu" message="Check your connection and try again.">
          <Button label="Retry" onPress={refetch} />
        </EmptyState>
      </Screen>
    );
  }

  const restaurant = menu.restaurant;
  const open = isMerchantOpenNow(restaurant.hours, now);
  const closedReason = open ? null : "This kitchen is closed";
  const category = menu.categories[categoryIdx];
  const qtyInCartFor = (dishId: string): number => cart.cart.lines.filter((l) => l.dishId === dishId).reduce((s, l) => s + l.quantity, 0);

  const addToCart = (dish: RestaurantMenuDish, quantity: number, note: string): void => {
    const switched = cart.addItem(restaurant.id, restaurant.name, { dishId: dish.id, name: dish.name, priceUsd: dish.priceUsd, quantity, note });
    setOpenItem(null);
    if (switched) toast.show(`Started a new cart for ${restaurant.name} — your other cart was cleared`, "info");
    else toast.show(`Added ${dish.name}`, "success");
  };

  // Data seam for the generated MenuRowsView region — map the live dishes to the kit MenuRow item
  // shape (+ the `id` the list keys/maps back on). Honest-empty: no rating/km/eta (backend-gated).
  const rows: MenuRowSeed[] = category
    ? category.dishes.map((d) => ({ id: d.id, name: d.name, desc: d.description ?? undefined, price: d.priceUsd, oos: d.outOfStock, photo: d.photoUrl ?? false }))
    : [];
  const hasCart = cart.itemCount > 0 && cart.cart.restaurantId === restaurant.id;

  return (
    <Screen
      footer={
        // Kit RC.menu (r-customer-a.jsx:182-189): the "N items · View cart" bar is the GENERATED
        // MenuCartBarView region, mounted in the kit's `<Screen footer=…>` pinned slot (Foundation-D/E).
        hasCart ? (
          <MenuCartBarView
            itemLabel={`${cart.itemCount} item${cart.itemCount === 1 ? "" : "s"}`}
            subtotal={cart.subtotal}
            onViewCart={() => router.push("/food/cart")}
          />
        ) : null
      }
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Cover region (generated MenuCoverView): full-bleed DS CoverPhoto + floating back button +
            the round DS ShopLogo. Wrapped to break out of Screen's 16px padding; photo/logo fall back
            to a tinted band + monogram (coverPhotoUrl/logoUrl are an upgrade, not a dependency). */}
        <View style={{ marginTop: -tokens.space.screen, marginHorizontal: -tokens.space.screen }}>
          <MenuCoverView
            name={restaurant.name}
            photo={restaurant.coverPhotoUrl ?? false}
            logoPhoto={restaurant.logoUrl ?? false}
            onBack={() => router.back()}
          />
        </View>

        <View style={{ marginTop: 26, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: tokens.color.ink }}>{restaurant.name}</Text>
            {restaurant.priceLevel ? (
              <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.muted }}>{"$".repeat(restaurant.priceLevel)}</Text>
            ) : null}
          </View>
          {restaurant.cuisineTags.length > 0 ? (
            <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2 }}>{restaurant.cuisineTags.join(" · ")}</Text>
          ) : null}
        </View>

        {!open ? (
          <Card style={{ backgroundColor: tokens.color.surface, borderColor: "transparent" }}>
            <View style={{ flexDirection: "row", gap: 9 }}>
              <Icon name="clock" size={16} color={tokens.color.muted} />
              <Text style={{ flex: 1, fontSize: 13, color: tokens.color.ink, lineHeight: 18 }}>
                {restaurant.name} is closed. {nextOpenDescription(restaurant.hours, now) ?? "You can look, but you can't order yet."}
              </Text>
            </View>
            {/* The kit's `menu_closed` gives the closed state a way forward instead of a dead end. */}
            <RemindWhenOpen
              restaurantName={restaurant.name}
              isSet={reminder.isSet}
              isPending={reminder.isPending}
              disabled={reminder.isLoading}
              onToggle={reminder.toggle}
            />
          </Card>
        ) : null}

        {menu.categories.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {menu.categories.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => setCategoryIdx(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: i === categoryIdx }}
                style={{
                  paddingHorizontal: 13,
                  paddingVertical: 8,
                  borderRadius: 999,
                  marginRight: 6,
                  borderWidth: 1,
                  borderColor: i === categoryIdx ? tokens.color.accent : tokens.color.line,
                  backgroundColor: i === categoryIdx ? tokens.color.accentWash : tokens.color.bg,
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: i === categoryIdx ? tokens.color.accentText : tokens.color.muted }}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {category ? (
          category.dishes.length > 0 ? (
            <>
              {/* Kit R2·1 (r-customer-a.jsx:218): the selected category is restated as a section
                  header over the dish list, so a long scroll never loses its heading. */}
              <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.5, marginTop: 8, marginBottom: 2 }}>
                {category.name.toUpperCase()}
              </Text>
              {/* Rows region (generated MenuRowsView): the dish list. Each MenuRow is wrapped in a
                  Pressable(onDishPress) inside the fragment, so a tap opens the live ItemSheet below —
                  the interactive glue stays here, the structure is guarded. */}
              <MenuRowsView
                rows={rows}
                qtyFor={(i) => qtyInCartFor(i.id)}
                onDishPress={(i) => {
                  const dish = category.dishes.find((d) => d.id === i.id);
                  if (dish) setOpenItem(dish);
                }}
              />
            </>
          ) : (
            <Text style={{ fontSize: 13, color: tokens.color.muted, textAlign: "center", marginTop: 20 }}>Nothing in this category yet.</Text>
          )
        ) : (
          <EmptyState icon="utensils" title="No menu yet" message="This kitchen hasn't added any dishes." />
        )}
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>

      {justClosed ? (
        <Pressable
          onPress={() => setJustClosed(false)}
          style={{ position: "absolute", inset: 0, backgroundColor: "rgba(20,24,27,0.45)", justifyContent: "center", padding: 18 }}
        >
          {/* Kit R2·b1 `closed_interrupt` (r-customer-a.jsx:280-288): a highlight icon tile above the
              headline, and two named ways forward rather than a generic dismiss. */}
          <Card>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: tokens.color.highlightWash,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 10,
              }}
            >
              <Icon name="clock" size={21} color={tokens.color.highlightInk} />
            </View>
            <Text style={{ fontSize: 16.5, fontWeight: "700", color: tokens.color.ink }}>{restaurant.name} just closed</Text>
            <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 19, marginTop: 5 }}>
              They stopped taking orders. Your cart is saved — nothing was ordered.
            </Text>
            <Button label="See places still open" onPress={() => router.push("/food")} />
            <Button label="Keep my cart for tomorrow" variant="ghost" onPress={() => setJustClosed(false)} />
          </Card>
        </Pressable>
      ) : null}

      {openItem ? (
        <ItemSheet dish={openItem} disabledReason={closedReason} onAdd={(qty, note) => addToCart(openItem, qty, note)} onClose={() => setOpenItem(null)} />
      ) : null}
    </Screen>
  );
}
